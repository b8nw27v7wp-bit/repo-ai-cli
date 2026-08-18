import { spawn } from "node:child_process";

export interface DiffResult {
  /** diff 内容（可能已截断） */
  diff: string;
  /** diff 原始字节数 */
  totalBytes: number;
  /** 是否被截断 */
  truncated: boolean;
  /** 涉及的文件列表（从 diff 头解析） */
  files: string[];
}

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    child.on("error", (e) => reject(new GitError(`无法执行 git: ${e.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out).toString("utf8"));
      else
        reject(
          new GitError(
            Buffer.concat(err).toString("utf8").trim() ||
              `git ${args[0]} 失败 (exit ${code})`,
          ),
        );
    });
  });
}

/** 校验当前目录在 git 仓库内；否则抛 GitError */
export async function assertInGitRepo(cwd: string): Promise<void> {
  try {
    const out = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
    if (out.trim() !== "true") throw new GitError("当前目录不在 git 仓库内");
  } catch (err) {
    if (err instanceof GitError) throw err;
    throw new GitError("当前目录不在 git 仓库内");
  }
}

export interface CommitEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  /** 该 commit 的原始 message 全文（含正文，供 AI 参考） */
  body: string;
}

export interface LogOptions {
  /** 起始区间：from..to（可省略一侧，如 "v1.0.0.." 或 "..HEAD"） */
  range?: string;
  /** 最大条数（默认 100） */
  max?: number;
  /** 是否包含正文（默认 true） */
  includeBody?: boolean;
}

/** 解析 "a..b" 或 "a" 形式的区间为 git 参数 */
function rangeArgs(range: string | undefined, max: number): string[] {
  const base = ["log", `-n ${max}`, "--pretty=format:%H%x09%h%x09%an%x09%ad%x09%s", "--date=short"];
  if (!range) return base;
  if (range.includes("..")) return [...base, range];
  // 单个 ref：从该 ref 之后（exclusive），常见于 "上一个 tag 之后"
  return [...base, `${range}..HEAD`];
}

/**
 * 读取 git log（默认最近 100 条）。
 * range 示例: "v1.0.0.."（v1.0.0 之后）、"1.0.0..2.0.0"、"..HEAD"。
 */
export async function getLog(
  cwd: string,
  options: LogOptions = {},
): Promise<CommitEntry[]> {
  await assertInGitRepo(cwd);
  const { range, max = 100, includeBody = true } = options;
  const args = rangeArgs(range, max);
  const raw = await runGit(args, cwd);
  if (!raw.trim()) return [];

  const entries: CommitEntry[] = [];
  for (const line of raw.split("\n")) {
    const [hash, shortHash, author, date, ...rest] = line.split("\t");
    if (!hash || !shortHash || !author || !date) continue;
    entries.push({
      hash,
      shortHash,
      author,
      date,
      subject: rest.join("\t"),
      body: "",
    });
  }

  // 批量取正文（一次调用拿全量 body，避免 N 次 git 调用）
  if (includeBody) {
    const bodyArgs = [
      "log",
      ...(range ? (range.includes("..") ? [range] : [`${range}..HEAD`]) : []),
      "-n 100",
      "--pretty=format:%H%x09%B",
    ];
    try {
      const rawBody = await runGit(bodyArgs, cwd);
      const bodies = new Map<string, string>();
      let curHash = "";
      for (const line of rawBody.split("\n")) {
        const tab = line.indexOf("\t");
        if (tab > 0 && /^[0-9a-f]{40}$/.test(line.slice(0, tab))) {
          curHash = line.slice(0, tab);
          bodies.set(curHash, line.slice(tab + 1).trim());
        } else if (curHash) {
          bodies.set(curHash, (bodies.get(curHash) ?? "") + "\n" + line);
        }
      }
      for (const e of entries) {
        e.body = (bodies.get(e.hash) ?? "").trim();
      }
    } catch {
      /* 正文获取失败不阻塞主流程 */
    }
  }
  return entries;
}

/**
 * 读取 diff。
 * - staged（默认）: git diff --cached
 * - all: git diff HEAD（含未暂存）
 * maxBytes 超限时截断，并在开头标注。
 */
export async function getDiff(
  cwd: string,
  options: { staged?: boolean; all?: boolean; maxBytes?: number } = {},
): Promise<DiffResult> {
  await assertInGitRepo(cwd);

  const { staged = true, all = false, maxBytes = 200 * 1024 } = options;
  const args = ["diff"];
  if (staged && !all) args.push("--cached");
  if (all) args.push("HEAD");
  args.push(...DIFF_PATHSPEC);

  return runDiff(args, cwd, maxBytes);
}

const DIFF_PATHSPEC = [
  "--",
  ".",
  ":(exclude)package-lock.json",
  ":(exclude)pnpm-lock.yaml",
  ":(exclude)yarn.lock",
];

/** 通用 diff 执行 + 文件解析 + 截断 */
async function runDiff(
  args: string[],
  cwd: string,
  maxBytes: number,
): Promise<DiffResult> {
  const raw = await runGit(args, cwd);
  const totalBytes = Buffer.byteLength(raw, "utf8");

  const files: string[] = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^diff --git a\/(.+?) b\//);
    if (m?.[1]) files.push(m[1]);
  }

  if (totalBytes <= maxBytes) {
    return { diff: raw, totalBytes, truncated: false, files };
  }

  // 截断：在 hunk 边界处截断，避免切碎 diff 结构
  const truncated = `[diff truncated: ${(totalBytes / 1024).toFixed(0)} KB > ${(maxBytes / 1024).toFixed(0)} KB limit — 请分次提交或缩小改动]\n`;
  const rawKeep = Buffer.from(raw, "utf8").subarray(0, maxBytes).toString("utf8");
  // 找最后一个 @@ hunk 头，在其之前截断（保留完整的 diff --git 头）
  const lastHunkIdx = rawKeep.lastIndexOf("\n@@ ");
  const keep = lastHunkIdx > 0 ? rawKeep.slice(0, lastHunkIdx + 1) : rawKeep;
  return { diff: truncated + keep, totalBytes, truncated: true, files };
}

/**
 * 检测默认 base 分支（用于 PR 对比）。
 * 顺序：origin/HEAD → origin/main → origin/master → main → master；都没有则抛错。
 */
export async function detectBaseBranch(cwd: string): Promise<string> {
  await assertInGitRepo(cwd);
  const candidates = [
    "origin/HEAD",
    "origin/main",
    "origin/master",
    "main",
    "master",
  ];
  for (const cand of candidates) {
    try {
      const resolved = await runGit(["rev-parse", "--verify", "--quiet", cand], cwd);
      if (resolved.trim()) {
        // origin/HEAD 是一个符号引用，展开为实际分支名
        if (cand === "origin/HEAD") {
          try {
            const short = await runGit(
              ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
              cwd,
            );
            if (short.trim()) return short.trim();
          } catch {
            /* 回退到 origin/main */
          }
        }
        return cand;
      }
    } catch {
      /* 继续试下一个 */
    }
  }
  throw new GitError(
    "无法自动检测 base 分支。可用 --base 指定，如 --base main 或 --base origin/main",
  );
}

/**
 * 读取当前分支相对 base 的差异（git diff base...HEAD，三点：从 merge-base 开始）。
 * maxBytes 超限时截断。
 */
export async function getBranchDiff(
  cwd: string,
  options: { base: string; maxBytes?: number },
): Promise<DiffResult> {
  await assertInGitRepo(cwd);
  const maxBytes = options.maxBytes ?? 200 * 1024;
  const args = ["diff", `${options.base}...HEAD`, ...DIFF_PATHSPEC];
  return runDiff(args, cwd, maxBytes);
}

/** 当前分支名（缩写） */
export async function getCurrentBranch(cwd: string): Promise<string> {
  await assertInGitRepo(cwd);
  const out = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return out.trim();
}

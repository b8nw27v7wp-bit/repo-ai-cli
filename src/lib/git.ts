import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

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

  const result = await runDiff(args, cwd, maxBytes);
  if (!all) return result;

  // --all：git diff HEAD 不含 untracked 新文件；与 tracked 共享同一个预算池
  const used = Buffer.byteLength(result.diff, "utf8");
  const remaining = maxBytes - used;
  if (remaining <= 0) {
    return { ...result, truncated: true };
  }
  const untracked = await buildUntrackedDiff(cwd, remaining);
  if (untracked.files.length === 0) return result;

  const merged = result.diff.trim()
    ? `${result.diff}\n${untracked.text}`
    : untracked.text;
  return {
    diff: merged,
    totalBytes: Buffer.byteLength(merged, "utf8"),
    truncated: result.truncated || untracked.clipped,
    // 从最终输出重解析：被截掉的文件不再列入
    files: parseDiffFiles(merged),
  };
}

const DIFF_PATHSPEC = [
  "--",
  ".",
  ":(exclude)package-lock.json",
  ":(exclude)pnpm-lock.yaml",
  ":(exclude)yarn.lock",
];

export interface StagedChange {
  /** git 状态：A / M / D / R100 / C75 … */
  status: string;
  /** 变更后的路径；删除时为被删路径 */
  path: string;
  /** 重命名/复制前的路径 */
  oldPath?: string;
}

/**
 * 列出暂存区改动（含状态与重命名的旧路径）。
 *
 * 为什么不用 getDiff().files：diff 头只给 a 侧路径，纯重命名会只剩旧路径、
 * 删除只给已不存在的路径——impact 需要同时知道「旧路径（谁还在 import 它）」
 * 与「新路径（它自己影响了谁）」。
 */
export async function getStagedChanges(cwd: string): Promise<StagedChange[]> {
  await assertInGitRepo(cwd);
  const raw = await runGit(
    ["diff", "--cached", "--name-status", "-z", ...DIFF_PATHSPEC],
    cwd,
  );
  const parts = raw.split("\0");
  const changes: StagedChange[] = [];
  let i = 0;
  while (i < parts.length) {
    const status = parts[i++];
    if (!status) continue;
    if (status[0] === "R" || status[0] === "C") {
      const oldPath = parts[i++];
      const newPath = parts[i++];
      if (newPath) changes.push({ status, path: newPath, oldPath });
    } else {
      const p = parts[i++];
      if (p) changes.push({ status, path: p });
    }
  }
  return changes;
}

/** 列出 untracked 文件（相对路径，.gitignore 生效） */
async function getUntrackedFiles(cwd: string): Promise<string[]> {
  try {
    const out = await runGit(["ls-files", "--others", "--exclude-standard"], cwd);
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** 把 untracked 文本文件拼成 "new file" 风格 diff 片段（受 maxBytes 约束） */
async function buildUntrackedDiff(
  cwd: string,
  maxBytes: number,
): Promise<{ text: string; files: string[]; clipped: boolean }> {
  const paths = await getUntrackedFiles(cwd);
  const chunks: string[] = [];
  const files: string[] = [];
  let budget = maxBytes;
  let clipped = false;

  for (const rel of paths) {
    if (budget <= 0) {
      clipped = true;
      break;
    }
    let content: string;
    try {
      const buf = await fs.readFile(path.join(cwd, rel));
      if (buf.includes(0)) continue; // 二进制
      content = buf.toString("utf8");
    } catch {
      continue;
    }
    let keep = content;
    if (Buffer.byteLength(keep, "utf8") > budget) {
      keep = Buffer.from(keep, "utf8").subarray(0, budget).toString("utf8");
      clipped = true;
    }
    const lines = keep.split("\n");
    chunks.push(`diff --git a/${rel} b/${rel}`);
    chunks.push("new file mode 100644");
    chunks.push("--- /dev/null");
    chunks.push(`+++ b/${rel}`);
    chunks.push(`@@ -0,0 +1,${lines.length} @@`);
    for (const l of lines) chunks.push(`+${l}`);
    files.push(rel);
    budget -= Buffer.byteLength(keep, "utf8");
  }

  return { text: chunks.join("\n"), files, clipped };
}

/** 从 diff 文本解析涉及的文件列表 */
function parseDiffFiles(text: string): string[] {
  const files: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^diff --git a\/(.+?) b\//);
    if (m?.[1]) files.push(m[1]);
  }
  return files;
}

/** 通用 diff 执行 + 文件解析 + 截断 */
async function runDiff(
  args: string[],
  cwd: string,
  maxBytes: number,
): Promise<DiffResult> {
  const raw = await runGit(args, cwd);
  const totalBytes = Buffer.byteLength(raw, "utf8");
  const files = parseDiffFiles(raw);

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

/** tag 是否已存在 */
export async function tagExists(cwd: string, tag: string): Promise<boolean> {
  try {
    const out = await runGit(
      ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`],
      cwd,
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** 最近的 tag 名（无 tag 返回空字符串） */
export async function getLatestTag(cwd: string): Promise<string> {
  try {
    const out = await runGit(["describe", "--tags", "--abbrev=0"], cwd);
    return out.trim();
  } catch {
    return "";
  }
}

export interface RepoMeta {
  commitCount: number;
  authorCount: number;
  firstCommitDate?: string;
  lastCommitDate?: string;
  /** 统计窗口起点（--since 传入时回显，便于 JSON 消费方确认统计口径） */
  since?: string;
}

/**
 * 仓库元信息：提交数 / 贡献者数 / 首次与最近提交日期。失败时返回 0 值对象。
 * 传入 since（YYYY-MM-DD）时只统计该日期起（含当日）的提交，对应 git --since。
 */
export async function getRepoMeta(
  cwd: string,
  options: { since?: string } = {},
): Promise<RepoMeta> {
  const sinceArgs = options.since ? [`--since=${options.since}`] : [];
  try {
    const count = Number(
      (await runGit(["rev-list", "--count", ...sinceArgs, "HEAD"], cwd)).trim(),
    );
    const authors = await runGit(
      ["shortlog", "-sn", ...sinceArgs, "HEAD"],
      cwd,
    );
    const authorCount = authors.split("\n").filter(Boolean).length;
    const last = (
      await runGit(
        ["log", "-1", ...sinceArgs, "--format=%ad", "--date=short", "HEAD"],
        cwd,
      )
    ).trim();
    // 注意：git log 的 -n 在 --reverse 之前生效（-1 会取到最新一条再翻转），
    // 因此首个提交日期必须取反向输出的首行，不能加 -1
    const firstOut = await runGit(
      ["log", "--reverse", ...sinceArgs, "--format=%ad", "--date=short", "HEAD"],
      cwd,
    );
    const first = (firstOut.split("\n")[0] ?? "").trim();
    return {
      commitCount: Number.isFinite(count) ? count : 0,
      authorCount,
      firstCommitDate: first || undefined,
      lastCommitDate: last || undefined,
      since: options.since,
    };
  } catch {
    return { commitCount: 0, authorCount: 0 };
  }
}

/** 读取 git 配置的 user.name（无配置返回空串） */
export async function getGitUserName(cwd: string): Promise<string> {
  try {
    const out = await runGit(["config", "user.name"], cwd);
    return out.trim();
  } catch {
    return "";
  }
}

/** 仓库工作区根目录（git rev-parse --show-toplevel） */
export async function getRepoRoot(cwd: string): Promise<string> {
  await assertInGitRepo(cwd);
  const out = await runGit(["rev-parse", "--show-toplevel"], cwd);
  return path.resolve(out.trim());
}

/** git 目录绝对路径（.git，兼容 worktree/submodule） */
export async function getGitDir(cwd: string): Promise<string> {
  await assertInGitRepo(cwd);
  const out = await runGit(["rev-parse", "--absolute-git-dir"], cwd);
  return out.trim();
}

/** 创建带注释的 tag（release 用） */
export async function createTag(
  cwd: string,
  tag: string,
  message: string,
): Promise<void> {
  await assertInGitRepo(cwd);
  await runGit(["tag", "-a", tag, "-m", message], cwd);
}

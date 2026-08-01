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
  args.push("--", ".", ":(exclude)package-lock.json", ":(exclude)pnpm-lock.yaml", ":(exclude)yarn.lock");

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

export interface CommitOptions {
  staged?: boolean;
  all?: boolean;
  print?: boolean;
  type?: string;
  maxDiffKb?: number;
}

/**
 * repo-ai commit — 根据 git diff 生成规范 commit message。
 * M1 仅注册命令占位；完整实现在 M3。
 */
export async function runCommit(_options: CommitOptions): Promise<void> {
  throw new Error(
    "commit 命令尚未实现（计划 M3）。当前版本只支持: repo-ai readme",
  );
}

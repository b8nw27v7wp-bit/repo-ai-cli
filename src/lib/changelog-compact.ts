import type { CommitEntry } from "./git.js";

/**
 * compact 格式渲染：每条 commit 一行，纯本地、不调用 LLM。
 * 适合 CHANGELOG 已经很长、只需要一行式摘要（date + hash + subject + author）的项目。
 * 输出顺序与输入一致（git log 本身按新到旧返回）。
 */
export function renderCompactChangelog(
  repoName: string,
  commits: CommitEntry[],
): string {
  const lines = [`# ${repoName} CHANGELOG (compact)`, ""];
  for (const c of commits) {
    lines.push(`- ${c.date} \`${c.shortHash}\` ${c.subject} (${c.author})`);
  }
  return lines.join("\n");
}

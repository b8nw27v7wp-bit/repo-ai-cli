import type { ChatMessage } from "../types.js";
import type { CommitEntry } from "../lib/git.js";

export interface ChangelogPromptInput {
  repoName: string;
  commits: CommitEntry[];
  /** 区间描述（如 "v0.1.0..v0.2.0"、"最近 30 条"） */
  rangeLabel: string;
  language: "zh" | "en";
  /** 现有 CHANGELOG 的开头（用于衔接，可选） */
  existingHeader?: string;
}

/**
 * 组装 CHANGELOG 生成 prompt。
 * 输入 commit 列表（hash + subject + body），输出 Keep a Changelog 风格 markdown。
 */
export function buildChangelogPrompt(input: ChangelogPromptInput): ChatMessage[] {
  const { repoName, commits, rangeLabel, language, existingHeader } = input;

  const commitLines = commits
    .map(
      (c) =>
        `- \`${c.shortHash}\` ${c.date} ${c.author}: ${c.subject}` +
        (c.body ? `\n  ${c.body.split("\n").slice(0, 3).join("\n  ")}` : ""),
    )
    .join("\n");

  const langRule =
    language === "zh"
      ? "- 变更说明用中文书写"
      : "- 变更说明用英文书写";

  const system =
    "你是开源项目维护者，擅长写清晰、面向用户的 CHANGELOG。\n" +
    "【硬性要求】\n" +
    "- 按 Keep a Changelog 规范组织：### Added / ### Fixed / ### Changed / ### Removed（或中文对应：新增/修复/变更/移除）\n" +
    "- 只总结 commit 中真实存在的内容，禁止编造\n" +
    "- 把琐碎的 chore/typo 合并成一条，不要逐条罗列\n" +
    "- 每个条目一句话，动词开头，面向用户（不写内部实现细节）\n" +
    "- 直接输出 markdown 全文，不要代码块包裹、不要前后缀解释\n" +
    `- ${langRule}`;

  const user = [
    `# ${repoName} CHANGELOG 生成`,
    "",
    `区间: ${rangeLabel}（共 ${commits.length} 条 commit）`,
    "",
    "【commit 列表】",
    commitLines,
    "",
    "【输出格式】",
    "```markdown",
    "## [Unreleased]",
    "",
    "### Added",
    "- ...",
    "",
    "### Fixed",
    "- ...",
    "```",
    "",
    existingHeader
      ? `【注意】现有 CHANGELOG 开头是：\n${existingHeader}\n生成的新版本要插在其上方（更新到最前），不要重复现有内容。`
      : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

import type { ChatMessage } from "../types.js";

export interface CommitPromptInput {
  diff: string;
  truncated: boolean;
  forcedType?: string;
  files: string[];
}

const ALLOWED_TYPES = [
  "feat",
  "fix",
  "docs",
  "refactor",
  "perf",
  "test",
  "chore",
  "build",
  "ci",
  "style",
];

/**
 * 组装 commit message 生成 prompt。
 * 返回单条 user 消息；系统规则内联在其中（第一版不依赖多轮）。
 */
export function buildCommitPrompt(input: CommitPromptInput): ChatMessage[] {
  const { diff, truncated, forcedType, files } = input;

  const typeHint = forcedType
    ? `- 类型固定为 \`${forcedType}\`（来自 --type 参数）`
    : `- type 从 ${ALLOWED_TYPES.join("/")} 中选择`;

  const diffSection = [
    truncated
      ? "⚠️ 注意：diff 因过大被截断，只根据可见部分生成。"
      : "",
    "```diff",
    diff,
    "```",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const user = [
    "你是熟悉 conventional commits 规范的资深工程师。根据以下 git diff 生成 commit message。",
    "",
    "【硬性要求】",
    `- 格式：<type>(<scope>): <subject>，正文用 - 列出要点（scope 可选，没有明显模块可省略）`,
    `- ${typeHint}`,
    "- subject 不超过 72 字符，动词开头，概括主要改动",
    "- 正文要点只描述 diff 中真实存在的改动，禁止编造",
    "- 不写 \"update\" / \"fix bug\" 这类空话",
    "- 只输出 commit message 本身，不要代码块、不要解释、不要引号包裹",
    "",
    `【涉及文件】`,
    files.length > 0 ? files.join("\n") : "（无）",
    "",
    "【diff】",
    diffSection,
  ].join("\n");

  return [{ role: "user", content: user }];
}

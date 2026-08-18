import type { ChatMessage } from "../types.js";

export type RefactorFocus =
  | "all"
  | "readability"
  | "perf"
  | "complexity"
  | "types";

const FOCUS_RULES: Record<RefactorFocus, string> = {
  all: "- 全面审查：可读性、性能、复杂度、类型安全、错误处理",
  readability: "- 聚焦可读性：命名、结构、重复代码、注释必要性",
  perf: "- 聚焦性能：不必要的 I/O、重复计算、过高的时间/空间复杂度",
  complexity: "- 聚焦复杂度：函数过长、圈复杂度过高、职责过多、嵌套过深",
  types: "- 聚焦类型安全：any 滥用、可空处理、类型收窄、泛型设计",
};

export interface RefactorPromptInput {
  file: string;
  content: string;
  focus: RefactorFocus;
  truncated: boolean;
}

/**
 * 组装重构建议 prompt。输出 markdown 建议，不直接改代码。
 */
export function buildRefactorPrompt(input: RefactorPromptInput): ChatMessage[] {
  const { file, content, focus, truncated } = input;

  const system =
    "你是资深工程师，审查代码并给出可落地的重构建议。\n" +
    "【硬性要求】\n" +
    "- 只针对代码中真实存在的内容，禁止编造\n" +
    "- 每条建议包含：`文件:行号`、`问题`、`为什么重要`、`建议改法（附最小代码示例）`\n" +
    "- 按收益排序：优先高收益低成本；给「不改行为、可逐步替换」的方案\n" +
    "- 说明每处改动是否影响对外接口/行为（避免隐含破坏）\n" +
    "- 没有明显问题的维度直接省略，不应付凑数；整体良好则明确说明\n" +
    "- 输出标准 Markdown，整体不要代码块包裹、不要前后缀解释\n" +
    FOCUS_RULES[focus];

  const user = [
    `请重构审查这个文件：${file}`,
    truncated ? "⚠️ 注意：文件因过大被截断，只依据可见部分分析。" : "",
    "```",
    content,
    "```",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
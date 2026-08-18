import type { ChatMessage } from "../types.js";

export type ReviewFocus = "all" | "bugs" | "security" | "style" | "perf";

export const REVIEW_FOCUSES: ReviewFocus[] = [
  "all",
  "bugs",
  "security",
  "style",
  "perf",
];

export interface ReviewPromptInput {
  diff: string;
  truncated: boolean;
  files: string[];
  focus: ReviewFocus;
}

const FOCUS_RULES: Record<ReviewFocus, string> = {
  all: "- 全面审查：正确性(bug)、安全、性能、可读性/风格，四个维度都要覆盖",
  bugs:
    "- 聚焦正确性：潜在 bug、边界条件、空值/未定义、异常处理、异步与并发、类型安全",
  security:
    "- 聚焦安全：注入、越权、敏感信息泄露、依赖风险、XSS/CSRF、路径遍历等",
  style:
    "- 聚焦可读性/风格：命名、重复代码、圈复杂度、函数过长、可维护性、一致性",
  perf: "- 聚焦性能：不必要的 I/O、过高复杂度、内存浪费、重复计算、N+1 查询",
};

/**
 * 组装代码审查 prompt。
 * 输入 git diff，输出按严重程度分级、可执行的 review 报告。
 */
export function buildReviewPrompt(input: ReviewPromptInput): ChatMessage[] {
  const { diff, truncated, files, focus } = input;

  const diffSection = [
    truncated
      ? "⚠️ 注意：diff 因过大被截断，只根据可见部分审查。"
      : "",
    "```diff",
    diff,
    "```",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const system =
    "你是资深代码审查员（code reviewer），审查给定的 git diff，输出结构化、可执行的 review。\n" +
    "【硬性要求】\n" +
    "- 只审查 diff 中真实存在的改动，禁止编造未出现的代码\n" +
    "- 按严重程度分级：🔴 Critical（会导致错误/漏洞/数据丢失）/ 🟠 Major（应修复）/ 🟡 Minor（建议）/ 💡 Nit（可选）\n" +
    "- 每条问题包含：`文件:行号`、`问题`、`为什么重要`、`建议改法（附最小代码示例）`\n" +
    "- 没有问题的严重级别直接省略，不要硬凑；不要为凑数而提无关紧要的意见\n" +
    "- 如果整体质量良好，明确给出结论（如\"未发现明显问题\"）\n" +
    "- 输出标准 Markdown，整体不要用代码块包裹、不要任何前后缀解释\n" +
    FOCUS_RULES[focus];

  const user = [
    "请审查以下 git diff。",
    "",
    "【涉及文件】",
    files.length > 0 ? files.join("\n") : "（无）",
    "",
    "【diff】",
    diffSection,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
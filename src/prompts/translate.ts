import type { ChatMessage } from "../types.js";

export type TranslateTarget = "zh" | "en" | "bilingual";

const TARGET_RULES: Record<TranslateTarget, string> = {
  zh: "- 把整篇内容翻译成中文",
  en: "- 把整篇内容翻译成英文",
  bilingual:
    "- 输出中英双语：以原文语言为主，每个段落/标题后紧跟另一种语言的翻译",
};

export interface TranslatePromptInput {
  file: string;
  content: string;
  target: TranslateTarget;
  truncated?: boolean;
}

/**
 * 组装文档翻译 prompt。保留 markdown 结构、代码块、链接与占位符。
 */
export function buildTranslatePrompt(input: TranslatePromptInput): ChatMessage[] {
  const { file, content, target, truncated = false } = input;

  const system =
    "你是专业的技术文档翻译。翻译给定的 Markdown 文档。\n" +
    "【硬性要求】\n" +
    "- 保留原有 Markdown 结构（标题/列表/表格/引用层级）与代码块内容不译\n" +
    "- 代码块、行内 code、URL、命令、技术名词保留原样\n" +
    "- 不增删内容、不添加解释、不翻译占位符（如 {{name}}、<变量>）\n" +
    "- 直接输出翻译后的全文，不要代码块包裹、不要前后缀说明\n" +
    TARGET_RULES[target];

  const user = [
    `请翻译这个文档：${file}`,
    truncated ? "⚠️ 注意：文档因过大被截断，只翻译可见部分。" : "",
    "```markdown",
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
import type { ChatMessage } from "../types.js";

export type ExplainLanguage = "zh" | "en" | "bilingual";

const LANG_RULES: Record<ExplainLanguage, string> = {
  zh: "- 全程用中文解释",
  en: "- 全程用英文解释",
  bilingual: "- 中文为主，关键术语与标识符保留英文原文",
};

export interface ExplainPromptInput {
  /** 文件相对路径 */
  file: string;
  /** 文件内容（已加行号） */
  content: string;
  /** 聚焦的行范围（可选），如 "第 38-60 行" */
  focus?: string;
  /** 聚焦的符号（可选），如 "getDiff" */
  symbol?: string;
  /** 文件是否因过大被截断 */
  truncated?: boolean;
  language: ExplainLanguage;
}

/**
 * 组装代码解释 prompt。
 */
export function buildExplainPrompt(input: ExplainPromptInput): ChatMessage[] {
  const { file, content, focus, symbol, truncated = false, language } = input;

  const system =
    "你是资深工程师，擅长把代码讲得清晰易懂。解释给定的代码。\n" +
    "【硬性要求】\n" +
    "- 结构：概述（这段代码做什么、在项目中的角色，一两句）→ 关键逻辑分点讲解 → 输入/输出或数据流 → 值得注意的细节/潜在问题 → 一句话总结\n" +
    "- 用代码中的真实标识符（函数名/变量名）佐证，不要泛泛而谈\n" +
    "- 禁止编造文件中不存在的内容；不确定的推断要标注「可能」\n" +
    "- 输出标准 Markdown，整体不要用代码块包裹、不要任何前后缀解释\n" +
    LANG_RULES[language];

  const user = [
    `请解释这个文件：${file}`,
    focus ? `聚焦位置：${focus}` : "",
    symbol ? `聚焦符号：${symbol}（重点讲解该符号的定义、签名与关键逻辑）` : "",
    truncated
      ? "⚠️ 注意：文件因过大被截断，只根据可见部分解释。"
      : "",
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
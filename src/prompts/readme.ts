import type { BudgetResult, ChatMessage } from "../types.js";

export type ReadmeLanguage = "bilingual" | "zh" | "en";

const LANGUAGE_RULES: Record<ReadmeLanguage, string> = {
  bilingual:
    "- 中英双语：英文为主，每个关键段落后紧跟中文翻译（或使用 `## 中文版` 分区）\n" +
    "- 顶部标题用英文 + 中文副标题",
  zh: "- 全中文（标题、正文、代码注释外的说明）",
  en: "- 全英文",
};

/**
 * 组装 README 生成 prompt。
 * @param materials 预算分配后的项目材料
 * @param repoName 仓库名（目录名）
 */
export function buildReadmePrompt(
  repoName: string,
  materials: BudgetResult,
  language: ReadmeLanguage = "bilingual",
): ChatMessage[] {
  const body = [
    `# 项目材料：${repoName}`,
    "",
    "## 目录结构",
    "```",
    materials.treeText,
    "```",
    "",
  ];

  for (const b of materials.files) {
    if (b.mode === "skip") continue;
    const tag = b.mode === "sample" ? " [sampled]" : "";
    const note = b.note ? ` (${b.note})` : "";
    body.push(
      `## 文件: ${b.file.relPath}${tag}${note}`,
      "```",
      b.file.content,
      "```",
      "",
    );
  }

  if (materials.skippedNote) {
    body.push(materials.skippedNote, "");
  }

  const system =
    "你是资深开源维护者与技术文档专家。根据给定的项目材料生成高质量 README。\n" +
    "【硬性要求】\n" +
    "- 只描述材料中真实存在的内容；不确定的信息写 `TODO` 占位，禁止编造功能\n" +
    "- 结构：项目名+一句话定位 → 功能特性(emoji 列表) → 快速开始 → 配置说明 → 技术栈 → 目录结构 → 贡献指南 → License\n" +
    "- 使用标准 Markdown 语法，代码块带语言标识\n" +
    "- 直接输出 README 全文，不要任何前后缀解释\n" +
    LANGUAGE_RULES[language];

  const user = body.join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

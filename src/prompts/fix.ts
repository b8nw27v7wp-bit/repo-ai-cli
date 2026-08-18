import type { BudgetResult, ChatMessage } from "../types.js";
import { buildMaterialsSection } from "../lib/materials.js";

/**
 * 组装 bug 定位 + 修复建议 prompt。
 */
export function buildFixPrompt(
  repoName: string,
  materials: BudgetResult,
  description: string,
): ChatMessage[] {
  const system =
    "你是资深工程师，根据项目材料定位 bug 的根因并给出可落地的修复方案。\n" +
    "【硬性要求】\n" +
    "- 只依据材料，定位到具体文件与函数；禁止编造不存在的代码\n" +
    "- 输出结构：1) 根因分析 2) 涉及文件 3) 建议修复（最小 diff 或代码片段） 4) 验证方式（如何复现/测试该修复）\n" +
    "- 若材料不足以定位，明确说明需要补充哪些信息\n" +
    "- 输出标准 Markdown，整体不要代码块包裹、不要前后缀解释";

  const user = buildMaterialsSection(repoName, materials) + "\n\n" +
    `【bug 描述】\n${description}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
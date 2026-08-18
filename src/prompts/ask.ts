import type { BudgetResult, ChatMessage } from "../types.js";
import { buildMaterialsSection } from "../lib/materials.js";

/**
 * 组装代码库问答 prompt（RAG）：把项目材料 + 用户问题一起交给 LLM。
 */
export function buildAskPrompt(
  repoName: string,
  materials: BudgetResult,
  question: string,
): ChatMessage[] {
  const system =
    "你是资深代码库助手，擅长阅读并回答代码库相关问题。\n" +
    "【硬性要求】\n" +
    "- 只依据提供的项目材料回答，引用具体文件/函数名佐证\n" +
    "- 材料不足以回答时明确说明「材料未覆盖」，禁止编造\n" +
    "- 回答简洁、对工程师友好；涉及代码的地方给最小示例\n" +
    "- 若问「怎么改/怎么修」，给出可落地的步骤或 diff 建议";

  const user = buildMaterialsSection(repoName, materials) + "\n\n" +
    `【用户问题】\n${question}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
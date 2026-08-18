import path from "node:path";
import type { BudgetResult, CollectedFile } from "../types.js";
import { collectFiles } from "./collect-files.js";
import { buildFileTree } from "./file-tree.js";
import { allocateBudget } from "./token-budget.js";

/**
 * 把预算分配后的项目材料（目录树 + 分层文件）拼成 prompt 的 user 正文。
 * readme / ask / fix 共用。
 */
export function buildMaterialsSection(
  repoName: string,
  materials: BudgetResult,
): string {
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

  if (materials.skippedNote) body.push(materials.skippedNote, "");
  return body.join("\n");
}

export interface CollectedMaterials {
  repoName: string;
  budget: BudgetResult;
  files: CollectedFile[];
}

/**
 * 收集目录 → 目录树 → 预算分配（readme / ask / fix 共用）。空目录抛错。
 */
export async function collectMaterials(options: {
  rootDir: string;
  maxTokens: number;
  maxFileKb: number;
}): Promise<CollectedMaterials> {
  const files = await collectFiles(options.rootDir, {
    maxFileBytes: options.maxFileKb * 1024,
  });
  if (files.length === 0) {
    throw new Error("未收集到任何可分析的文件（目录为空或全部被过滤）");
  }
  const repoName = path.basename(options.rootDir);
  const treeText = buildFileTree(
    files.map((f) => f.relPath),
    repoName,
  );
  const budget = allocateBudget({
    files,
    treeText,
    maxTokens: options.maxTokens,
  });
  return { repoName, budget, files };
}
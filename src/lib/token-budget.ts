import type { BudgetResult, BudgetedFile, CollectedFile } from "../types.js";

/**
 * 粗略 token 估算：CJK 字符按 ~1 token/字，其余按 ~4 字符/token。
 * 不需要精确 —— 只用于预算分配和 dry-run 展示。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk + other / 4);
}

/** 采样行数：超出预算的优先级 3 文件只取前 N 行 */
export const SAMPLE_LINES = 60;

interface BudgetInput {
  files: CollectedFile[];
  treeText: string;
  maxTokens: number;
  sampleLines?: number;
}

/**
 * 三层预算分配：
 * - 目录树全量保留（很省 token）
 * - 优先级 1/2 文件全量保留
 * - 优先级 3 文件：预算内取前 N 行采样；预算耗尽则跳过并汇总标注
 */
export function allocateBudget(input: BudgetInput): BudgetResult {
  const { files, treeText, maxTokens } = input;
  const sampleLines = input.sampleLines ?? SAMPLE_LINES;

  const treeTokens = estimateTokens(treeText);
  let remaining = maxTokens - treeTokens;

  const budgeted: BudgetedFile[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (remaining <= 0) {
      budgeted.push({ file, mode: "skip", note: "预算耗尽" });
      skipped.push(file.relPath);
      continue;
    }

    if (file.priority <= 2) {
      const tokens = estimateTokens(file.content);
      if (tokens <= remaining) {
        budgeted.push({ file, mode: "full" });
        remaining -= tokens;
      } else if (file.priority === 1) {
        // 优先级 1 文件即使超预算也完整保留（README/LICENSE 是定位核心），
        // 但这种情况极少见（默认 100KB 上限已兜底）
        budgeted.push({ file, mode: "full" });
        remaining = 0;
      } else {
        budgeted.push({ file, mode: "skip", note: "超出预算" });
        skipped.push(file.relPath);
      }
    } else {
      // 优先级 3：内容少（≤ 采样行数）则完整保留，否则采样前 N 行
      const lines = file.content.split("\n");
      const fullTokens = estimateTokens(file.content);
      if (lines.length <= sampleLines && fullTokens <= remaining) {
        budgeted.push({ file, mode: "full" });
        remaining -= fullTokens;
        continue;
      }
      const sampled = lines.slice(0, sampleLines).join("\n");
      const tokens = estimateTokens(sampled);
      if (tokens <= remaining) {
        budgeted.push({
          file,
          mode: "sample",
          note:
            lines.length > sampleLines
              ? `采样前 ${sampleLines} 行（共 ${lines.length} 行）`
              : undefined,
        });
        remaining -= tokens;
      } else {
        budgeted.push({ file, mode: "skip", note: "超出预算" });
        skipped.push(file.relPath);
      }
    }
  }

  const skippedNote =
    skipped.length > 0
      ? `[skipped ${skipped.length} file(s) to fit token budget: ${skipped
          .slice(0, 5)
          .join(", ")}${skipped.length > 5 ? ", ..." : ""}]`
      : undefined;

  // 估算总 token：tree + 实际纳入的内容（sample 只算采样部分）
  let totalTokens = treeTokens;
  for (const b of budgeted) {
    if (b.mode === "skip") continue;
    if (b.mode === "full") {
      totalTokens += estimateTokens(b.file.content);
    } else {
      const lines = b.file.content.split("\n");
      totalTokens += estimateTokens(
        lines.slice(0, sampleLines).join("\n"),
      );
    }
  }

  return {
    treeText,
    files: budgeted,
    estimatedTokens: totalTokens,
    skippedNote,
  };
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { collectFiles } from "../lib/collect-files.js";
import { buildFileTree } from "../lib/file-tree.js";
import { allocateBudget, estimateTokens } from "../lib/token-budget.js";
import { chatCompletion } from "../lib/llm.js";
import { buildReadmePrompt, type ReadmeLanguage } from "../prompts/readme.js";
import { writeOutput } from "../lib/output.js";
import type { ReadmeOptions } from "../types.js";

/**
 * repo-ai readme — 生成中英双语 README。
 * M1 支持本地目录；GitHub URL 支持在 M2。
 */
export async function runReadme(options: ReadmeOptions): Promise<void> {
  const target = options.target || ".";
  const resolved = path.resolve(target);

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new Error(`路径不存在: ${target}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`暂不支持单文件输入（M2 将支持）: ${target}`);
  }

  // 1. 收集文件
  const files = await collectFiles(resolved, {
    maxFileBytes: options.maxFileKb * 1024,
  });
  if (files.length === 0) {
    throw new Error(
      `未收集到任何可分析的文件（目录为空或全部被过滤）: ${target}`,
    );
  }

  // 2. 目录树 + 预算分配
  const treeText = buildFileTree(
    files.map((f) => f.relPath),
    path.basename(resolved),
  );
  const budget = allocateBudget({
    files,
    treeText,
    maxTokens: options.maxTokens,
  });

  const repoName = path.basename(resolved);
  const language = options.language as ReadmeLanguage;

  if (options.dryRun) {
    const included = budget.files.filter((f) => f.mode !== "skip");
    const full = included.filter((f) => f.mode === "full").length;
    const sampled = included.length - full;
    console.log(`repo: ${repoName}`);
    console.log(`files collected: ${files.length}`);
    console.log(`files included: ${included.length} (full: ${full}, sampled: ${sampled})`);
    console.log(`file tree tokens: ~${estimateTokens(treeText)}`);
    console.log(`estimated total tokens: ~${budget.estimatedTokens}`);
    console.log(`budget: ${options.maxTokens} tokens`);
    if (budget.skippedNote) console.log(budget.skippedNote);
    return;
  }

  // 3. 调用 LLM（失败重试 1 次由 llm.ts 内部处理）
  const messages = buildReadmePrompt(repoName, budget, language);
  const content = await chatCompletion(messages);

  if (!content.trim()) {
    throw new Error("AI 返回了空内容，未写入文件。请重试。");
  }

  // 4. 写文件
  const outputPath = options.output ?? "README.md";
  if (options.output && options.output !== "README.md") {
    const abs = await writeOutput(content, outputPath);
    console.log(`README 已写入: ${abs}`);
  } else {
    await writeOutput(content, outputPath);
    console.log(`README 已写入: ${path.resolve(outputPath)}`);
  }
}

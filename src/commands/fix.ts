import { intro } from "@clack/prompts";
import { collectMaterials } from "../lib/materials.js";
import { chatCompletion, llmConfigFromOptions } from "../lib/llm.js";
import { buildFixPrompt } from "../prompts/fix.js";
import { loadConfig } from "../lib/config.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  fail,
  progress,
} from "../lib/ui.js";
import type { FixOptions } from "../types.js";

/**
 * repo-ai fix — 根据 bug 描述定位根因并给出修复建议（只建议，不改代码）。
 */
export async function runFix(options: FixOptions): Promise<void> {
  setJsonMode(options.json === true);
  const cfg = await loadConfig(options.profile);
  if (interactive && !isJsonMode()) intro("repo-ai fix");

  const p = progress("收集项目材料...");
  let materials;
  try {
    materials = await collectMaterials({
      rootDir: process.cwd(),
      maxTokens: options.maxTokens ?? 48000,
      maxFileKb: options.maxFileKb ?? 100,
    });
  } catch (err) {
    p.stop();
    fail((err as Error).message);
    return;
  }
  p.update("AI 定位问题中...");

  const messages = buildFixPrompt(
    materials.repoName,
    materials.budget,
    options.description,
  );

  let result: string;
  try {
    result = await chatCompletion(messages, llmConfigFromOptions(options, cfg));
    p.stop();
  } catch (err) {
    p.stop("分析失败");
    fail((err as Error).message);
    return;
  }

  if (!result.trim()) {
    fail("AI 返回了空内容，请重试。");
    return;
  }
  if (isJsonMode()) {
    emitJson({ ok: true, result: result.trim() });
    return;
  }
  console.log(result.trim());
}
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
  warn,
  fail,
  progress,
} from "../lib/ui.js";
import type { FixOptions } from "../types.js";

/** 材料里被排除的疑似密钥文件上报（这些文件不会发给 LLM，静默丢弃会让用户困惑） */
function reportSkippedSecrets(skipped: string[]): void {
  for (const rel of skipped) {
    warn(`已排除疑似含密钥的文件（不发送给 LLM）: ${rel}`);
  }
}

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
  reportSkippedSecrets(materials.sensitiveSkipped);

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
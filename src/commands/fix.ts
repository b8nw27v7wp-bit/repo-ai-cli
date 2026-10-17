import { intro } from "@clack/prompts";
import { collectMaterials } from "../lib/materials.js";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail } from "../lib/llm-step.js";
import { buildFixPrompt } from "../prompts/fix.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  warn,
  fail,
  progress,
} from "../lib/ui.js";
import { withUsage } from "../lib/usage.js";
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
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
  if (interactive && !isJsonMode()) intro("repo-ai fix");

  const p = progress("收集项目材料...");
  let materials;
  try {
    materials = await collectMaterials({
      rootDir: process.cwd(),
      maxTokens: options.maxTokens,
      maxFileKb: options.maxFileKb,
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

  const result = await callLlmOrFail(
    messages,
    llmConfigFromOptions(options, cfg),
    p,
    "分析失败",
    (r) => r.trim(),
  );
  if (result === null) return;
  p.stop();

  if (isJsonMode()) {
    emitJson(withUsage({ ok: true, result }));
    return;
  }
  console.log(result);
}
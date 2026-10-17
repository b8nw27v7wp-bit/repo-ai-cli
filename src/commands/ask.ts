import { intro } from "@clack/prompts";
import { collectMaterials } from "../lib/materials.js";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail, streamLlmOrFail } from "../lib/llm-step.js";
import { buildAskPrompt } from "../prompts/ask.js";
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
import type { AskOptions } from "../types.js";

/** 材料里被排除的疑似密钥文件上报（这些文件不会发给 LLM，静默丢弃会让用户困惑） */
function reportSkippedSecrets(skipped: string[]): void {
  for (const rel of skipped) {
    warn(`已排除疑似含密钥的文件（不发送给 LLM）: ${rel}`);
  }
}

/**
 * repo-ai ask — 针对当前代码库提问（RAG：收集材料 → LLM 回答）。
 */
export async function runAsk(options: AskOptions): Promise<void> {
  setJsonMode(options.json === true);
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
  if (interactive && !isJsonMode()) intro("repo-ai ask");

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
  p.update("AI 思考中...");
  reportSkippedSecrets(materials.sensitiveSkipped);

  const messages = buildAskPrompt(
    materials.repoName,
    materials.budget,
    options.question,
  );
  const llmConfig = llmConfigFromOptions(options, cfg);
  const stream = options.stream === true && interactive && !isJsonMode();

  let answer: string | null;
  if (stream) {
    p.stop("回答：");
    answer = await streamLlmOrFail(messages, llmConfig, p, "回答失败");
  } else {
    answer = await callLlmOrFail(messages, llmConfig, p, "回答失败", (r) => r.trim());
  }
  if (answer === null) return;
  // 流式路径的进度条在上面已经停过了，这里只停非流式那条
  if (!stream) p.stop();

  if (isJsonMode()) {
    emitJson(withUsage({ ok: true, answer }));
    return;
  }
  if (!stream) console.log(answer);
}
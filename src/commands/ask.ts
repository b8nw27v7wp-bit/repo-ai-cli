import { intro } from "@clack/prompts";
import { collectMaterials } from "../lib/materials.js";
import {
  chatCompletion,
  streamChatCompletion,
  llmConfigFromOptions,
} from "../lib/llm.js";
import { buildAskPrompt } from "../prompts/ask.js";
import { loadConfig } from "../lib/config.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  fail,
  progress,
} from "../lib/ui.js";
import type { AskOptions } from "../types.js";

/**
 * repo-ai ask — 针对当前代码库提问（RAG：收集材料 → LLM 回答）。
 */
export async function runAsk(options: AskOptions): Promise<void> {
  setJsonMode(options.json === true);
  const cfg = await loadConfig(options.profile);
  if (interactive && !isJsonMode()) intro("repo-ai ask");

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
  p.update("AI 思考中...");

  const messages = buildAskPrompt(
    materials.repoName,
    materials.budget,
    options.question,
  );
  const llmConfig = llmConfigFromOptions(options, cfg);
  const stream = options.stream === true && interactive && !isJsonMode();

  let answer: string;
  try {
    if (stream) {
      p.stop("回答：");
      answer = await streamChatCompletion(messages, llmConfig, (t) =>
        process.stdout.write(t),
      );
      process.stdout.write("\n");
    } else {
      answer = await chatCompletion(messages, llmConfig);
      p.stop();
    }
  } catch (err) {
    p.stop("回答失败");
    fail((err as Error).message);
    return;
  }

  if (!answer.trim()) {
    fail("AI 返回了空内容，请重试。");
    return;
  }
  if (isJsonMode()) {
    emitJson({ ok: true, answer: answer.trim() });
    return;
  }
  if (!stream) console.log(answer.trim());
}
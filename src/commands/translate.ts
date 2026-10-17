import path from "node:path";
import { intro } from "@clack/prompts";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail } from "../lib/llm-step.js";
import { readTextCapped } from "../lib/options.js";
import { buildTranslatePrompt, type TranslateTarget } from "../prompts/translate.js";
import { parseEnum } from "../lib/options.js";
import { writeOutput } from "../lib/output.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  warn,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import { withUsage } from "../lib/usage.js";
import type { TranslateOptions } from "../types.js";

const TARGETS: TranslateTarget[] = ["zh", "en", "bilingual"];

/**
 * repo-ai translate — 文档翻译（zh / en / bilingual，AI）。
 * 默认打印到 stdout，-o 写文件。
 */
export async function runTranslate(options: TranslateOptions): Promise<void> {
  setJsonMode(options.json === true);
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
  if (interactive && !isJsonMode()) intro("repo-ai translate");

  const abs = path.resolve(options.file);
  const maxBytes = options.maxFileKb * 1024;
  let content: string;
  let truncated: boolean;
  try {
    ({ content, truncated } = await readTextCapped(abs, maxBytes));
  } catch (err) {
    fail(
      `无法读取文件: ${options.file}（${err instanceof Error ? err.message : "不存在或不可读"}）`,
    );
    return;
  }
  if (truncated) warn(`文件过大已截断，只翻译前 ${(maxBytes / 1024).toFixed(0)} KB`);

  const target = parseEnum(options.to, TARGETS, "目标语言", "en");
  if (!target) return;

  const progressBar = progress("AI 翻译中...");
  const relPath = path.relative(process.cwd(), abs).replaceAll("\\", "/") || options.file;
  const messages = buildTranslatePrompt({
    file: relPath,
    content,
    target,
    truncated,
  });

  const translated = await callLlmOrFail(
    messages,
    llmConfigFromOptions(options, cfg),
    progressBar,
    "翻译失败",
    (r) => r.trim(),
  );
  if (translated === null) return;
  progressBar.stop();

  if (options.output) {
    const outAbs = await writeOutput(translated + "\n", options.output);
    if (isJsonMode()) emitJson(withUsage({ ok: true, output: outAbs, target }));
    else done(`译文已写入: ${outAbs}`);
    return;
  }

  if (isJsonMode()) emitJson(withUsage({ ok: true, file: relPath, target, content: translated }));
  else console.log(translated);
}
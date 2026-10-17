import path from "node:path";
import { intro } from "@clack/prompts";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail } from "../lib/llm-step.js";
import { readTextCapped } from "../lib/options.js";
import {
  buildRefactorPrompt,
  type RefactorFocus,
} from "../prompts/refactor.js";
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
import type { RefactorOptions } from "../types.js";

const FOCUSES: RefactorFocus[] = [
  "all",
  "readability",
  "perf",
  "complexity",
  "types",
];

/**
 * repo-ai refactor — 对文件给出重构建议（AI，不改代码）。
 * 默认打印到 stdout，-o 写文件。
 */
export async function runRefactor(options: RefactorOptions): Promise<void> {
  setJsonMode(options.json === true);
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
  if (interactive && !isJsonMode()) intro("repo-ai refactor");

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
  if (truncated) warn(`文件过大已截断，只分析前 ${(maxBytes / 1024).toFixed(0)} KB`);

  const focus = parseEnum(options.focus, FOCUSES, "focus", "all");
  if (!focus) return;

  const progressBar = progress("AI 分析重构中...");
  const relPath = path.relative(process.cwd(), abs).replaceAll("\\", "/") || options.file;
  const messages = buildRefactorPrompt({
    file: relPath,
    content,
    focus,
    truncated,
  });

  const out = await callLlmOrFail(
    messages,
    llmConfigFromOptions(options, cfg),
    progressBar,
    "分析失败",
    (r) => r.trim(),
  );
  if (out === null) return;
  progressBar.stop();

  if (options.output) {
    const outAbs = await writeOutput(out + "\n", options.output);
    if (isJsonMode()) emitJson(withUsage({ ok: true, output: outAbs, focus }));
    else done(`建议已写入: ${outAbs}`);
    return;
  }

  if (isJsonMode()) emitJson(withUsage({ ok: true, file: relPath, focus, content: out }));
  else console.log(out);
}
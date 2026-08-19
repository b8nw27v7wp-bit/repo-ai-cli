import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { chatCompletion, llmConfigFromOptions } from "../lib/llm.js";
import {
  buildRefactorPrompt,
  type RefactorFocus,
} from "../prompts/refactor.js";
import { loadConfig } from "../lib/config.js";
import { writeOutput } from "../lib/output.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  done,
  fail,
  progress,
} from "../lib/ui.js";
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
  const cfg = await loadConfig(options.profile);
  if (interactive && !isJsonMode()) intro("repo-ai refactor");

  const abs = path.resolve(options.file);
  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch (err) {
    fail(
      `无法读取文件: ${options.file}（${err instanceof Error ? err.message : "不存在或不可读"}）`,
    );
    return;
  }

  const focus = FOCUSES.includes(options.focus as RefactorFocus)
    ? (options.focus as RefactorFocus)
    : "all";
  if (options.focus && focus === "all" && options.focus !== "all") {
    fail(`未知 focus: ${options.focus}。可用: ${FOCUSES.join("/")}`);
    return;
  }

  const maxBytes = (options.maxFileKb ?? 200) * 1024;
  let content = raw;
  let truncated = false;
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    content = Buffer.from(raw, "utf8").subarray(0, maxBytes).toString("utf8");
    truncated = true;
  }

  const progressBar = progress("AI 分析重构中...");
  const relPath = path.relative(process.cwd(), abs).replaceAll("\\", "/") || options.file;
  const messages = buildRefactorPrompt({
    file: relPath,
    content,
    focus,
    truncated,
  });

  let out: string;
  try {
    out = (
      await chatCompletion(messages, llmConfigFromOptions(options, cfg))
    ).trim();
  } catch (err) {
    progressBar.stop("分析失败");
    fail((err as Error).message);
    return;
  }
  progressBar.stop();

  if (!out) {
    fail("AI 返回了空内容，请重试。");
    return;
  }

  if (options.output) {
    const outAbs = await writeOutput(out + "\n", options.output);
    if (isJsonMode()) emitJson({ ok: true, output: outAbs, focus });
    else done(`建议已写入: ${outAbs}`);
    return;
  }

  if (isJsonMode()) emitJson({ ok: true, file: relPath, focus, content: out });
  else console.log(out);
}
import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { chatCompletion, llmConfigFromOptions } from "../lib/llm.js";
import { buildTestPrompt, type TestFramework } from "../prompts/test.js";
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
import type { TestOptions } from "../types.js";

const FRAMEWORKS: TestFramework[] = ["vitest", "jest", "node-test"];

function normalizeFramework(v?: string): TestFramework | null {
  if (!v) return "vitest";
  const m = v.toLowerCase().replace(/:/g, "-") as TestFramework;
  return FRAMEWORKS.includes(m) ? m : null;
}

/**
 * repo-ai test — 为文件生成单元测试（AI）。
 * 默认打印到 stdout，-o 写文件。
 */
export async function runTest(options: TestOptions): Promise<void> {
  setJsonMode(options.json === true);
  const cfg = await loadConfig();
  if (interactive && !isJsonMode()) intro("repo-ai test");

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

  const framework = normalizeFramework(options.framework);
  if (!framework) {
    fail(`未知框架: ${options.framework}。可用: ${FRAMEWORKS.join("/")}`);
    return;
  }

  const maxBytes = (options.maxFileKb ?? 200) * 1024;
  let content = raw;
  let truncated = false;
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    content = Buffer.from(raw, "utf8").subarray(0, maxBytes).toString("utf8");
    truncated = true;
  }

  const progressBar = progress("AI 生成单元测试中...");
  const relPath = path.relative(process.cwd(), abs).replaceAll("\\", "/") || options.file;
  const messages = buildTestPrompt({
    file: relPath,
    content,
    framework,
    truncated,
  });

  let out: string;
  try {
    out = (
      await chatCompletion(messages, llmConfigFromOptions(options, cfg))
    ).trim();
  } catch (err) {
    progressBar.stop("生成失败");
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
    if (isJsonMode()) emitJson({ ok: true, output: outAbs, framework });
    else done(`测试已写入: ${outAbs}`);
    return;
  }

  if (isJsonMode()) emitJson({ ok: true, file: relPath, framework, content: out });
  else console.log(out);
}
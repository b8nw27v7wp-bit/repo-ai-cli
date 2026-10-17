import path from "node:path";
import { intro } from "@clack/prompts";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail } from "../lib/llm-step.js";
import { readTextCapped } from "../lib/options.js";
import { buildTestPrompt, type TestFramework } from "../prompts/test.js";
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
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
  if (interactive && !isJsonMode()) intro("repo-ai test");

  const abs = path.resolve(options.file);
  const framework = normalizeFramework(options.framework);
  if (!framework) {
    fail(`未知框架: ${options.framework}。可用: ${FRAMEWORKS.join("/")}`);
    return;
  }

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
  if (truncated) warn(`文件过大已截断，只依据前 ${(maxBytes / 1024).toFixed(0)} KB 生成`);

  const progressBar = progress("AI 生成单元测试中...");
  const relPath = path.relative(process.cwd(), abs).replaceAll("\\", "/") || options.file;
  const messages = buildTestPrompt({
    file: relPath,
    content,
    framework,
    truncated,
  });

  const out = await callLlmOrFail(
    messages,
    llmConfigFromOptions(options, cfg),
    progressBar,
    "生成失败",
    (r) => r.trim(),
  );
  if (out === null) return;
  progressBar.stop();

  if (options.output) {
    const outAbs = await writeOutput(out + "\n", options.output);
    if (isJsonMode()) emitJson(withUsage({ ok: true, output: outAbs, framework }));
    else done(`测试已写入: ${outAbs}`);
    return;
  }

  if (isJsonMode()) emitJson(withUsage({ ok: true, file: relPath, framework, content: out }));
  else console.log(out);
}
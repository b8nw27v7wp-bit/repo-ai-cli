import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail } from "../lib/llm-step.js";
import {
  buildExplainPrompt,
} from "../prompts/explain.js";
import { parseEnum } from "../lib/options.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  fail,
  progress,
} from "../lib/ui.js";
import { withUsage } from "../lib/usage.js";
import type { ExplainOptions } from "../types.js";

interface TargetSpec {
  file: string;
  start?: number;
  end?: number;
  symbol?: string;
}

/** 解析 "file" / "file:38" / "file:10-40" / "file#symbol" / "file:38#symbol" */
function parseTarget(input: string): TargetSpec {
  let rest = input;
  let symbol: string | undefined;
  const hashIdx = rest.lastIndexOf("#");
  if (hashIdx > 0) {
    symbol = rest.slice(hashIdx + 1).trim() || undefined;
    rest = rest.slice(0, hashIdx);
  }
  const m = rest.match(/^(.+?):(\d+)(?:-(\d+))?$/);
  if (m?.[1] && m?.[2]) {
    return {
      file: m[1],
      start: Number(m[2]),
      end: m[3] ? Number(m[3]) : undefined,
      symbol,
    };
  }
  return { file: rest, symbol };
}

/** 给内容加行号（右对齐 5 位） */
function withLineNumbers(content: string, startLine = 1): string {
  return content
    .split("\n")
    .map((line, i) => `${String(startLine + i).padStart(5, " ")} | ${line}`)
    .join("\n");
}

/**
 * repo-ai explain — 解释指定文件或代码区域（文件:行号）。
 * 输出打印到 stdout；--json 结构化。
 */
export async function runExplain(options: ExplainOptions): Promise<void> {
  setJsonMode(options.json === true);
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
  if (interactive && !isJsonMode()) intro("repo-ai explain");

  const { file: fileArg, start, end, symbol } = parseTarget(options.target.trim());
  const abs = path.resolve(fileArg);

  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch (err) {
    fail(
      `无法读取文件: ${fileArg}（${err instanceof Error ? err.message : "不存在或不可读"}）`,
    );
    return;
  }

  const maxBytes = options.maxFileKb * 1024;
  const lines = raw.split("\n");
  let content: string;
  let focus: string | undefined;
  let truncated = false;

  if (start !== undefined) {
    // 聚焦窗口：默认前后各取 20 行上下文
    const CONTEXT = 20;
    const from = Math.max(1, start - CONTEXT);
    const to = end !== undefined ? end + CONTEXT : start + CONTEXT;
    const slice = lines.slice(from - 1, to);
    content = withLineNumbers(slice.join("\n"), from);
    focus = end ? `第 ${start}-${end} 行` : `第 ${start} 行`;
    truncated = to < lines.length;
  } else if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    // 全文件超限：截断前 maxBytes 字节
    const keep = Buffer.from(raw, "utf8").subarray(0, maxBytes).toString("utf8");
    content = withLineNumbers(keep);
    truncated = true;
  } else {
    content = withLineNumbers(raw);
  }

  const language = parseEnum(
    options.language,
    ["zh", "en", "bilingual"] as const,
    "language",
    "zh",
  );
  if (!language) return;

  const progressBar = progress("AI 解释代码中...");
  const relPath = path.relative(process.cwd(), abs).replaceAll("\\", "/") || fileArg;
  const messages = buildExplainPrompt({
    file: relPath,
    content,
    focus,
    symbol,
    truncated,
    language,
  });

  const explanation = await callLlmOrFail(
    messages,
    llmConfigFromOptions(options, cfg),
    progressBar,
    "解释失败",
    (r) => r.trim(),
  );
  if (explanation === null) return;
  progressBar.stop();

  if (isJsonMode()) {
    emitJson(
      withUsage({
        ok: true,
        file: relPath,
        focus: focus ?? null,
        symbol: symbol ?? null,
        explanation,
      }),
    );
    return;
  }
  console.log(explanation);
}
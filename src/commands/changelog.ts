import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { getLog, getLatestTag, type CommitEntry } from "../lib/git.js";
import { renderCompactChangelog } from "../lib/changelog-compact.js";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail, streamLlmOrFail } from "../lib/llm-step.js";
import { buildChangelogPrompt } from "../prompts/changelog.js";
import { writeOutput } from "../lib/output.js";
import { parseEnum } from "../lib/options.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  say,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import { withUsage } from "../lib/usage.js";
import type { ChangelogOptions } from "../types.js";

/** 取最近一个 tag 作为默认区间起点（无 tag 则回退最近 N 条） */
async function defaultRange(cwd: string): Promise<{ range?: string; label: string }> {
  const tag = await getLatestTag(cwd);
  if (tag) return { range: `${tag}..`, label: `${tag} 之后` };
  return { range: undefined, label: "最近 50 条" };
}

/**
 * repo-ai changelog — 根据 git log 生成 CHANGELOG.md。
 * 默认区间：最近一个 tag 之后；无 tag 则最近 50 条。
 * --format keep-a-changelog（默认）走 AI 生成；--format compact 本地逐行渲染、不调用 LLM。
 */
export async function runChangelog(options: ChangelogOptions): Promise<void> {
  setJsonMode(options.json === true);
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
  if (interactive && !isJsonMode()) intro("repo-ai changelog");

  const language = parseEnum(options.language, ["zh", "en"] as const, "language", "zh");
  const format = parseEnum(
    options.format,
    ["keep-a-changelog", "compact"] as const,
    "format",
    "keep-a-changelog",
  );
  // 参数非法时必须先返回，不能先启动进度条（否则报错后会多打一行 "读取 git log..."）
  if (!language || !format) return;

  const cwd = process.cwd();
  const progressBar = progress("读取 git log...");

  let range = options.range;
  let rangeLabel: string;
  if (range) {
    rangeLabel = range;
  } else {
    const r = await defaultRange(cwd);
    range = r.range;
    rangeLabel = r.label;
  }

  let commits: CommitEntry[];
  try {
    commits = await getLog(cwd, {
      range,
      max: options.max ?? 50,
    });
  } catch (err) {
    progressBar.stop();
    fail((err as Error).message);
    return;
  }

  if (commits.length === 0) {
    progressBar.stop();
    fail("没有可用的 commit（区间为空或不是 git 仓库）");
    return;
  }
  progressBar.update(`已读取 ${commits.length} 条 commit`);

  // 读现有 CHANGELOG 开头（衔接用）
  let existingHeader: string | undefined;
  const existingPath = path.resolve(options.output ?? "CHANGELOG.md");
  try {
    const raw = await fs.readFile(existingPath, "utf8");
    existingHeader = raw.split("\n").slice(0, 12).join("\n");
  } catch {
    /* 无现有文件 */
  }

  if (options.dryRun) {
    if (isJsonMode()) {
      emitJson({
        ok: true,
        dryRun: true,
        format,
        range: rangeLabel,
        commits: commits.length,
        existingChangelog: existingHeader ? true : false,
        output: existingPath,
      });
      return;
    }
    progressBar.stop();
    say(`range: ${rangeLabel}`);
    say(`format: ${format}`);
    say(`commits: ${commits.length}`);
    say(`existing changelog: ${existingHeader ? "found" : "none"}`);
    say(`output: ${existingPath}`);
    done("dry-run 完成，未调用 API");
    return;
  }

  // compact：纯本地逐行渲染，不调用 LLM（适合 CHANGELOG 已经很长、只要一行式摘要的项目）
  if (format === "compact") {
    const content = renderCompactChangelog(path.basename(cwd), commits);
    progressBar.stop("compact 渲染完成");
    if (options.print) {
      if (isJsonMode()) emitJson({ ok: true, format, content });
      else console.log(content);
      return;
    }
    const abs = await writeOutput(content + "\n", existingPath);
    if (isJsonMode()) {
      emitJson({
        ok: true,
        format,
        output: abs,
        bytes: Buffer.byteLength(content, "utf8") + 1,
      });
      return;
    }
    done(`CHANGELOG (compact) 已写入: ${abs}`);
    return;
  }

  // 生成
  progressBar.update("AI 生成 CHANGELOG 中...");
  const repoName = path.basename(cwd);
  const messages = buildChangelogPrompt({
    repoName,
    commits,
    rangeLabel,
    language,
    existingHeader,
  });

  const llmConfig = llmConfigFromOptions(options, cfg);
  const stream = options.stream === true && interactive && !isJsonMode() && !options.print;
  let content: string | null;
  if (stream) {
    progressBar.stop("流式生成开始");
    content = await streamLlmOrFail(messages, llmConfig, progressBar, "生成失败");
  } else {
    content = await callLlmOrFail(messages, llmConfig, progressBar, "生成失败");
  }
  if (content === null) return;
  progressBar.stop("生成完成");

  // 写文件（或 --print 输出）
  if (options.print) {
    if (isJsonMode()) emitJson(withUsage({ ok: true, content: content.trim() }));
    else console.log(content.trim());
    return;
  }
  const abs = await writeOutput(content.trim() + "\n", existingPath);
  if (isJsonMode()) {
    emitJson(withUsage({ ok: true, output: abs, bytes: Buffer.byteLength(content) }));
    return;
  }
  done(`CHANGELOG 已写入: ${abs}`);
}

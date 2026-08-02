import { promises as fs } from "node:fs";
import path from "node:path";
import { intro, outro, spinner, log } from "@clack/prompts";
import { getLog, type CommitEntry } from "../lib/git.js";
import { chatCompletion } from "../lib/llm.js";
import { buildChangelogPrompt } from "../prompts/changelog.js";
import { writeOutput } from "../lib/output.js";
import { loadConfig } from "../lib/config.js";
import type { ChangelogOptions } from "../types.js";

const interactive = Boolean(process.stdout.isTTY);

/** JSON 输出模式（模块级标志） */
let jsonMode = false;

function emitJson(obj: Record<string, unknown>): void {
  console.log(JSON.stringify(obj));
}

function say(msg: string): void {
  if (jsonMode) return;
  if (interactive) log.info(msg);
  else console.log(msg);
}

function done(msg: string): void {
  if (jsonMode) return;
  if (interactive) outro(`✓ ${msg}`);
  else console.log(`✓ ${msg}`);
}

function fail(msg: string): void {
  if (jsonMode) {
    emitJson({ ok: false, error: msg });
    process.exitCode = 1;
    return;
  }
  if (interactive) outro(`✖ ${msg}`);
  else console.error(`✖ ${msg}`);
  process.exitCode = 1;
}

function progress(label: string) {
  let current = label;
  if (interactive && !jsonMode) {
    const s = spinner();
    s.start(label);
    return {
      update(next: string) {
        current = next;
        s.start(next);
      },
      stop(msg?: string) {
        s.stop(msg ?? current);
      },
    };
  }
  if (!jsonMode) console.log(`... ${label}`);
  return {
    update(next: string) {
      current = next;
      if (!jsonMode) console.log(`... ${next}`);
    },
    stop(msg?: string) {
      // 无参 stop 不重复打印（update 已打过最新状态）
      if (msg && !jsonMode) console.log(`... ${msg}`);
    },
  };
}

/** 取最近一个 tag 作为默认区间起点（无 tag 则回退最近 N 条） */
async function defaultRange(cwd: string): Promise<{ range?: string; label: string }> {
  try {
    const { spawn } = await import("node:child_process");
    const tag = await new Promise<string>((resolve) => {
      const child = spawn("git", ["describe", "--tags", "--abbrev=0"], {
        cwd,
        windowsHide: true,
      });
      let out = "";
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.on("error", () => resolve(""));
      child.on("close", (code) => resolve(code === 0 ? out.trim() : ""));
    });
    if (tag) return { range: `${tag}..`, label: `${tag} 之后` };
  } catch {
    /* 无 tag 或非 git 仓库，回退 */
  }
  return { range: undefined, label: "最近 50 条" };
}

/**
 * repo-ai changelog — 根据 git log 生成 CHANGELOG.md。
 * 默认区间：最近一个 tag 之后；无 tag 则最近 50 条。
 */
export async function runChangelog(options: ChangelogOptions): Promise<void> {
  jsonMode = options.json === true;
  const cfg = await loadConfig();
  if (interactive && !jsonMode) intro("repo-ai changelog");

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
    if (jsonMode) {
      emitJson({
        ok: true,
        dryRun: true,
        range: rangeLabel,
        commits: commits.length,
        existingChangelog: existingHeader ? true : false,
        output: existingPath,
      });
      return;
    }
    progressBar.stop();
    say(`range: ${rangeLabel}`);
    say(`commits: ${commits.length}`);
    say(`existing changelog: ${existingHeader ? "found" : "none"}`);
    say(`output: ${existingPath}`);
    done("dry-run 完成，未调用 API");
    return;
  }

  // 生成
  progressBar.update("AI 生成 CHANGELOG 中...");
  const repoName = path.basename(cwd);
  const messages = buildChangelogPrompt({
    repoName,
    commits,
    rangeLabel,
    language: options.language,
    existingHeader,
  });

  let content: string;
  try {
    content = await chatCompletion(messages, {
      provider: options.provider,
      baseUrl: options.baseUrl,
      model: options.model,
      apiKey: options.apiKey,
      maxTokens: options.maxOutputTokens,
      temperature: options.temperature,
      config: cfg,
    });
  } catch (err) {
    progressBar.stop("生成失败");
    fail((err as Error).message);
    return;
  }
  progressBar.stop("生成完成");

  if (!content.trim()) {
    fail("AI 返回了空内容，未写入文件。请重试。");
    return;
  }

  // 写文件（或 --print 输出）
  if (options.print) {
    if (jsonMode) emitJson({ ok: true, content: content.trim() });
    else console.log(content.trim());
    return;
  }
  const abs = await writeOutput(content.trim() + "\n", existingPath);
  if (jsonMode) {
    emitJson({ ok: true, output: abs, bytes: Buffer.byteLength(content) });
    return;
  }
  done(`CHANGELOG 已写入: ${abs}`);
}

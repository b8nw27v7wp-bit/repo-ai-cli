import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { collectFiles } from "../lib/collect-files.js";
import { buildFileTree } from "../lib/file-tree.js";
import { allocateBudget, estimateTokens } from "../lib/token-budget.js";
import { chatCompletion, streamChatCompletion, llmConfigFromOptions } from "../lib/llm.js";
import { buildReadmePrompt, type ReadmeLanguage } from "../prompts/readme.js";
import { writeOutput } from "../lib/output.js";
import { parseGithubRef, cloneRepo } from "../lib/github.js";
import { loadConfig } from "../lib/config.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  say,
  warn,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import type { ReadmeOptions } from "../types.js";

const isUrlLike = (s: string) =>
  /^(https?:\/\/|git@|[\w.-]+\/[\w.-]+(#|$))/.test(s) && !s.startsWith(".");

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * repo-ai readme — 生成中英双语 README。
 * 输入：本地目录 或 GitHub 仓库（owner/repo 或完整 URL）。
 */
export async function runReadme(options: ReadmeOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai readme");

  const cfg = await loadConfig();

  const target = options.target || ".";
  const progressBar = progress("准备中...");

  // 1. 输入归一化：URL → 浅克隆到临时目录；本地路径 → 直接用
  let workDir: string;
  let cleanup: (() => Promise<void>) | undefined;

  if (isUrlLike(target) && !(await pathExists(target))) {
    let ref;
    try {
      ref = parseGithubRef(target);
    } catch (err) {
      progressBar.stop();
      fail((err as Error).message);
      return;
    }
    const shortUrl = ref.url.replace("https://github.com/", "").replace(/\.git$/, "");
    progressBar.update(`克隆仓库 ${shortUrl}...`);
    try {
      const cloned = await cloneRepo(ref.url, ref.branch);
      workDir = cloned.dir;
      cleanup = cloned.cleanup;
      progressBar.update("仓库已克隆");
    } catch (err) {
      progressBar.stop("克隆失败");
      fail((err as Error).message);
      return;
    }
  } else {
    workDir = path.resolve(target);
    let stat;
    try {
      stat = await fs.stat(workDir);
    } catch {
      progressBar.stop();
      fail(`路径不存在: ${target}`);
      return;
    }
    if (!stat.isDirectory()) {
      progressBar.stop();
      fail(`暂不支持单文件输入: ${target}`);
      return;
    }
  }

  try {
    // 2. 收集文件
    progressBar.update("收集项目文件...");
    const files = await collectFiles(workDir, {
      maxFileBytes: options.maxFileKb * 1024,
    });
    if (files.length === 0) {
      progressBar.stop();
      fail(`未收集到任何可分析的文件（目录为空或全部被过滤）: ${target}`);
      return;
    }

    // 3. 目录树 + 预算分配
    const treeText = buildFileTree(
      files.map((f) => f.relPath),
      path.basename(workDir),
    );
    const budget = allocateBudget({
      files,
      treeText,
      maxTokens: options.maxTokens,
    });

    const repoName = path.basename(workDir);
    const language = options.language as ReadmeLanguage;

    if (options.dryRun) {
      const included = budget.files.filter((f) => f.mode !== "skip");
      const full = included.filter((f) => f.mode === "full").length;
      const sampled = included.length - full;
      if (isJsonMode()) {
        emitJson({
          ok: true,
          dryRun: true,
          repo: repoName,
          filesCollected: files.length,
          filesIncluded: included.length,
          filesFull: full,
          filesSampled: sampled,
          treeTokens: estimateTokens(treeText),
          estimatedTokens: budget.estimatedTokens,
          budget: options.maxTokens,
        });
        return;
      }
      progressBar.stop();
      say(`repo: ${repoName}`);
      say(`files collected: ${files.length}`);
      say(
        `files included: ${included.length} (full: ${full}, sampled: ${sampled})`,
      );
      say(`file tree tokens: ~${estimateTokens(treeText)}`);
      say(`estimated total tokens: ~${budget.estimatedTokens}`);
      say(`budget: ${options.maxTokens} tokens`);
      if (budget.skippedNote) warn(budget.skippedNote);
      done("dry-run 完成，未调用 API");
      return;
    }

    // 4. 调用 LLM
    progressBar.update("AI 生成 README 中...");
    const messages = buildReadmePrompt(repoName, budget, language);
    const llmConfig = llmConfigFromOptions(options, cfg);
    const stream = options.stream === true && interactive && !isJsonMode();
    let content: string;
    try {
      if (stream) {
        progressBar.stop("流式生成开始");
        content = await streamChatCompletion(messages, llmConfig, (t) =>
          process.stdout.write(t),
        );
        process.stdout.write("\n");
      } else {
        content = await chatCompletion(messages, llmConfig);
        progressBar.stop("生成完成");
      }
    } catch (err) {
      progressBar.stop("生成失败");
      fail((err as Error).message);
      return;
    }

    if (!content.trim()) {
      fail("AI 返回了空内容，未写入文件。请重试。");
      return;
    }

    // 5. 写文件
    const outputPath = options.output ?? "README.md";
    const abs = await writeOutput(content, outputPath);
    if (isJsonMode()) {
      emitJson({ ok: true, output: abs, bytes: Buffer.byteLength(content) });
      return;
    }
    done(`README 已写入: ${abs}`);
  } finally {
    if (cleanup) {
      try {
        await cleanup();
      } catch {
        /* 忽略清理错误 */
      }
    }
  }
}

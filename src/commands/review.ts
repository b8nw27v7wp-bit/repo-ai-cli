import { intro } from "@clack/prompts";
import { getDiff, assertInGitRepo } from "../lib/git.js";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail } from "../lib/llm-step.js";
import { buildReviewPrompt, REVIEW_FOCUSES } from "../prompts/review.js";
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
import type { ReviewOptions } from "../types.js";

/**
 * repo-ai review — 对 git diff 做 AI 代码审查。
 * 输出默认打印到 stdout，可用 -o 写入文件。
 */
export async function runReview(options: ReviewOptions): Promise<void> {
  setJsonMode(options.json === true);
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
  if (interactive && !isJsonMode()) intro("repo-ai review");

  const cwd = process.cwd();
  try {
    await assertInGitRepo(cwd);
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  // 1. 读 diff
  let diffResult;
  try {
    diffResult = await getDiff(cwd, {
      staged: options.staged !== false,
      all: options.all ?? false,
      maxBytes: options.maxDiffKb * 1024,
    });
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  if (!diffResult.diff.trim()) {
    fail(
      options.all
        ? "没有检测到任何改动（git diff HEAD 为空）"
        : "没有检测到暂存区的改动。请先 git add，或用 --all 包含未暂存改动。",
    );
    return;
  }

  if (diffResult.truncated) {
    warn("diff 过大已截断，审查可能不完整");
  }

  const focus = parseEnum(options.focus, REVIEW_FOCUSES, "focus", "all");
  if (!focus) return;

  // 2. 生成
  const progressBar = progress("AI 代码审查中...");
  const messages = buildReviewPrompt({
    diff: diffResult.diff,
    truncated: diffResult.truncated,
    files: diffResult.files,
    focus,
  });

  const llmConfig = llmConfigFromOptions(options, cfg);

  const review = await callLlmOrFail(messages, llmConfig, progressBar, "审查失败", (r) =>
    r.trim(),
  );
  if (review === null) return;
  progressBar.stop();

  // 3. 输出（json / 写文件 / stdout）
  if (isJsonMode()) {
    emitJson(
      withUsage({
        ok: true,
        review,
        files: diffResult.files,
        truncated: diffResult.truncated,
      }),
    );
    return;
  }

  if (options.output) {
    const abs = await writeOutput(review + "\n", options.output);
    done(`review 已写入: ${abs}`);
    return;
  }

  console.log(review);
}
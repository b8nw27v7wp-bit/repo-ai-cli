import { intro, log } from "@clack/prompts";
import { getDiff, assertInGitRepo } from "../lib/git.js";
import { chatCompletion, llmConfigFromOptions } from "../lib/llm.js";
import {
  buildReviewPrompt,
  REVIEW_FOCUSES,
  type ReviewFocus,
} from "../prompts/review.js";
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
import type { ReviewOptions } from "../types.js";

/**
 * repo-ai review — 对 git diff 做 AI 代码审查。
 * 输出默认打印到 stdout，可用 -o 写入文件。
 */
export async function runReview(options: ReviewOptions): Promise<void> {
  setJsonMode(options.json === true);
  const cfg = await loadConfig();
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
      maxBytes: (options.maxDiffKb ?? 200) * 1024,
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
    if (interactive) log.warn("diff 过大已截断，审查可能不完整");
    else console.warn("warning: diff 过大已截断，审查可能不完整");
  }

  const focus = REVIEW_FOCUSES.includes(options.focus as ReviewFocus)
    ? (options.focus as ReviewFocus)
    : "all";
  if (options.focus && focus === "all" && options.focus !== "all") {
    fail(
      `未知 focus: ${options.focus}。可用: ${REVIEW_FOCUSES.join("/")}`,
    );
    return;
  }

  // 2. 生成
  const progressBar = progress("AI 代码审查中...");
  const messages = buildReviewPrompt({
    diff: diffResult.diff,
    truncated: diffResult.truncated,
    files: diffResult.files,
    focus,
  });

  const llmConfig = llmConfigFromOptions(options, cfg);

  let review: string;
  try {
    review = (await chatCompletion(messages, llmConfig)).trim();
  } catch (err) {
    progressBar.stop("审查失败");
    fail((err as Error).message);
    return;
  }
  progressBar.stop();

  if (!review) {
    fail("AI 返回了空内容，请重试。");
    return;
  }

  // 3. 输出（json / 写文件 / stdout）
  if (isJsonMode()) {
    emitJson({
      ok: true,
      review,
      files: diffResult.files,
      truncated: diffResult.truncated,
    });
    return;
  }

  if (options.output) {
    const abs = await writeOutput(review + "\n", options.output);
    done(`review 已写入: ${abs}`);
    return;
  }

  console.log(review);
}
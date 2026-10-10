import { intro } from "@clack/prompts";
import {
  parsePrRef,
  fetchPullRequest,
  fetchPullRequestDiff,
  parseDiffFiles,
} from "../lib/github-pr.js";
import { chatCompletion, llmConfigFromOptions } from "../lib/llm.js";
import { buildReviewPrompt, REVIEW_FOCUSES } from "../prompts/review.js";
import { loadConfig } from "../lib/config.js";
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
import type { ReviewPrOptions } from "../types.js";

/**
 * repo-ai review-pr — 审查一个线上 GitHub PR。
 *
 * 与 review 的区别只在 diff 来源：review 读本地 git diff，本命令经 GitHub
 * 公开 API 拉取 PR 的 diff（不依赖 gh CLI，匿名可读公开仓库）。prompt、
 * 分级输出、截断语义全部复用 review 的实现，避免两套审查逻辑漂移。
 */
export async function runReviewPr(options: ReviewPrOptions): Promise<void> {
  setJsonMode(options.json === true);
  const cfg = await loadConfig(options.profile);
  if (interactive && !isJsonMode()) intro("repo-ai review-pr");

  // 1. 解析 PR 引用
  let ref;
  try {
    ref = parsePrRef(options.target);
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  const focus = parseEnum(options.focus, REVIEW_FOCUSES, "focus", "all");
  if (!focus) return;

  // 2. 拉 PR 元信息 + diff（元信息仅用于汇报，失败不至于中断：diff 才是审查对象）
  const progressBar = progress(`拉取 PR ${ref.owner}/${ref.repo}#${ref.number}...`);
  let prInfo;
  try {
    prInfo = await fetchPullRequest(ref);
  } catch (err) {
    progressBar.stop("拉取失败");
    fail((err as Error).message);
    return;
  }

  let diffResult;
  try {
    diffResult = await fetchPullRequestDiff(ref, (options.maxDiffKb ?? 200) * 1024);
  } catch (err) {
    progressBar.stop("拉取失败");
    fail((err as Error).message);
    return;
  }
  progressBar.update("已拉取，AI 审查中...");

  if (diffResult.truncated) {
    warn("diff 过大已截断，审查可能不完整");
  }
  if (prInfo.draft) {
    warn("这是草稿 PR（draft），可能仍在改动中");
  }

  const files = parseDiffFiles(diffResult.raw);

  // 3. 生成（复用 review 的 prompt 与分级格式）
  const messages = buildReviewPrompt({
    diff: diffResult.raw,
    truncated: diffResult.truncated,
    files,
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

  // 4. 输出（json / 写文件 / stdout）
  if (isJsonMode()) {
    emitJson({
      ok: true,
      pr: `${ref.owner}/${ref.repo}#${ref.number}`,
      title: prInfo.title,
      author: prInfo.author,
      branch: prInfo.branch,
      baseBranch: prInfo.baseBranch,
      state: prInfo.state,
      draft: prInfo.draft,
      review,
      files,
      truncated: diffResult.truncated,
    });
    return;
  }

  if (!isJsonMode()) {
    // 头部信息帮助定位审查对象，但不进 stdout 产物（否则污染管道）
    warn(`PR: ${ref.owner}/${ref.repo}#${ref.number} — ${prInfo.title}`);
    warn(
      `作者: ${prInfo.author}｜分支: ${prInfo.branch} → ${prInfo.baseBranch}｜状态: ${prInfo.state}${prInfo.draft ? " (draft)" : ""}`,
    );
  }

  if (options.output) {
    const abs = await writeOutput(review + "\n", options.output);
    done(`review 已写入: ${abs}`);
    return;
  }

  console.log(review);
}

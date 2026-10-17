import { intro, confirm } from "@clack/prompts";
import {
  parsePrRef,
  fetchPullRequest,
  fetchPullRequestDiff,
  parseDiffFiles,
  postPullRequestReview,
  type PrRef,
} from "../lib/github-pr.js";
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
  say,
  warn,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import { withUsage } from "../lib/usage.js";
import { planComments, type PlannedComment } from "../lib/review-parse.js";
import type { ReviewPrOptions } from "../types.js";

/** 评论尾注：让 PR 上的读者知道这条是自动生成的 */
const COMMENT_FOOTER = "\n\n---\n<sub>由 repo-ai-cli review-pr 生成</sub>";

/** 逐条发布到 PR；返回已成功发布的评论链接 */
async function publishComments(
  ref: PrRef,
  plan: PlannedComment[],
): Promise<{ posted: string[]; failed?: string }> {
  const posted: string[] = [];
  for (const comment of plan) {
    try {
      const url = await postPullRequestReview(ref, comment.body + COMMENT_FOOTER);
      posted.push(url || `(${comment.label})`);
    } catch (err) {
      // 失败即中止：继续发多半会重复报同一个错（token 无效、限流），
      // 但已发出去的那几条必须如实回报——PR 上确实已经多了评论，用户得知道
      return { posted, failed: (err as Error).message };
    }
  }
  return { posted };
}

/**
 * repo-ai review-pr — 审查一个线上 GitHub PR。
 *
 * 与 review 的区别只在 diff 来源：review 读本地 git diff，本命令经 GitHub
 * 公开 API 拉取 PR 的 diff（不依赖 gh CLI，匿名可读公开仓库）。prompt、
 * 分级输出、截断语义全部复用 review 的实现，避免两套审查逻辑漂移。
 */
export async function runReviewPr(options: ReviewPrOptions): Promise<void> {
  setJsonMode(options.json === true);
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
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
    diffResult = await fetchPullRequestDiff(ref, options.maxDiffKb * 1024);
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

  const review = await callLlmOrFail(messages, llmConfig, progressBar, "审查失败", (r) =>
    r.trim(),
  );
  if (review === null) return;
  progressBar.stop();

  // 4. --comment：分级发布到 PR（默认只预览，--yes 才真发）
  if (options.comment) {
    const plan = planComments(review);
    if (plan.length === 0) {
      fail("审查结果里没有可发布的内容。");
      return;
    }
    const prLabel = `${ref.owner}/${ref.repo}#${ref.number}`;

    if (!options.yes) {
      if (isJsonMode()) {
        emitJson(
          withUsage({
            ok: true,
            dryRun: true,
            pr: prLabel,
            wouldPost: plan.map((p) => ({ label: p.label, body: p.body })),
          }),
        );
        return;
      }
      warn(`将向 ${prLabel} 发布 ${plan.length} 条评论（dry-run，未实际发布）：`);
      for (const p of plan) {
        console.log(`──── ${p.label.toUpperCase()} ────`);
        console.log(p.body + "\n");
      }
      say("加 --yes 才会真正发布到 PR");
      return;
    }

    // 危险动作：交互模式下再确认一次，避免手滑的 --yes 直接把意见发到公开 PR
    if (interactive && !isJsonMode()) {
      const ok = await confirm({
        message: `把 ${plan.length} 条评论发布到 ${prLabel}？`,
      });
      if (!ok) {
        done("已取消，未发布任何评论");
        return;
      }
    }

    const { posted, failed } = await publishComments(ref, plan);
    if (failed) {
      const partial = posted.length > 0
        ? `已发布 ${posted.length} 条：\n${posted.map((u) => `  ${u}`).join("\n")}\n`
        : "";
      fail(`${partial}发布评论失败: ${failed}`);
      return;
    }
    if (isJsonMode()) {
      emitJson(withUsage({ ok: true, pr: prLabel, posted }));
      return;
    }
    done(`已发布 ${posted.length} 条评论到 ${prLabel}`);
    for (const url of posted) say(`  ${url}`);
    return;
  }

  // 5. 输出（json / 写文件 / stdout）
  if (isJsonMode()) {
    emitJson(
      withUsage({
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
      }),
    );
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

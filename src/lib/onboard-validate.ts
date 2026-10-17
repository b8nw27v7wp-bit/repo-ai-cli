import {
  collectHeadings,
  findPlaceholderIssues,
  stripCode,
} from "./doc-validate.js";

/**
 * ONBOARDING.md 落盘前的结构校验。
 *
 * 比 README 校验多查两项「导读必须有」的章节——LLM 最容易写成一篇泛泛的项目介绍，
 * 而新维护者真正需要的是「架构怎么分层」与「怎么跑起来、怎么跑测试」。
 * 不合格时调用方必须放弃落盘（失败不写半成品）。
 */

export interface OnboardValidation {
  ok: boolean;
  issues: string[];
}

/** 架构 / 模块章节（中英文任一） */
const ARCHITECTURE_HEADING_RE = /(架构|结构|architecture|structure|module|模块)/i;

/** 运行 / 测试章节（中英文任一） */
const RUN_TEST_HEADING_RE = /(运行|测试|起步|getting started|run|test|usage|本地)/i;

export function validateOnboardStructure(content: string): OnboardValidation {
  const issues: string[] = [];
  const prose = stripCode(content);

  if (!/^#\s+\S+/m.test(prose)) {
    issues.push("缺少一级标题（应有以 # 开头的标题行）");
  }

  const headings = collectHeadings(prose);
  if (!headings.some((h) => ARCHITECTURE_HEADING_RE.test(h))) {
    issues.push("缺少架构/模块章节（标题应包含「架构 / 结构 / Architecture / Module」等字样）");
  }
  if (!headings.some((h) => RUN_TEST_HEADING_RE.test(h))) {
    issues.push("缺少运行/测试章节（标题应包含「运行 / 测试 / Getting Started / Run / Test」等字样）");
  }

  for (const { label, snippet } of findPlaceholderIssues(prose)) {
    issues.push(`存在未填充占位符残留（${label}）: "${snippet}"`);
  }

  return { ok: issues.length === 0, issues };
}

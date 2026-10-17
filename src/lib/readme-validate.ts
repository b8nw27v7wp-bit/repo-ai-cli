import {
  collectHeadings,
  findPlaceholderIssues,
  stripCode,
} from "./doc-validate.js";

/**
 * README 落盘前的轻量结构校验（P1-1）。
 *
 * 只查结构性硬伤，不评判文笔：
 * 1. 至少含一个一级标题（# 开头行）
 * 2. 含功能特性相关章节（中英文标题任一，如「功能特性」「Features」）
 * 3. 无未填充占位符残留 —— 按 prompt 约定，「TODO」是允许的占位，不算残留；
 *    其余典型残留（TBD / 待补充 / {{...}} / <your-...> 等）一律拦截
 *
 * 代码块（围栏 ``` 与行内 `）不参与扫描，避免模板项目 / 泛型示例误伤。
 * 校验不通过时调用方必须放弃落盘，绝不能写出半成品。
 */

export interface ReadmeValidation {
  /** 结构是否合格 */
  ok: boolean;
  /** 不合格时的原因列表（可能多条）；合格时为空数组 */
  issues: string[];
}

/** 功能特性章节的标题匹配（中英文任一即可） */
const FEATURE_HEADING_RE = /(功能|特性|features?|capabilities|highlights)/i;

/**
 * 校验 README 内容的结构完整性。
 * @returns ok=false 时 issues 给出全部不合格原因（一次报全，避免用户逐条重试）
 */
export function validateReadmeStructure(content: string): ReadmeValidation {
  const issues: string[] = [];
  // 代码块先剥掉：标题与占位符检查都只看正文
  const prose = stripCode(content);

  // 1. 一级标题
  if (!/^#\s+\S+/m.test(prose)) {
    issues.push("缺少一级标题（应有以 # 开头的标题行）");
  }

  // 2. 功能特性章节（任意级别的标题命中即可）
  const headings = collectHeadings(prose);
  if (!headings.some((h) => FEATURE_HEADING_RE.test(h))) {
    issues.push("缺少功能特性章节（标题应包含「功能特性 / Features」等字样）");
  }

  // 3. 占位符残留（TODO 不算）
  for (const { label, snippet } of findPlaceholderIssues(prose)) {
    issues.push(`存在未填充占位符残留（${label}）: "${snippet}"`);
  }

  return { ok: issues.length === 0, issues };
}

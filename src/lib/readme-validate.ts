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

/** 去掉围栏代码块与行内代码，降低占位符误报 */
function stripCode(content: string): string {
  return content.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}

/** 功能特性章节的标题匹配（中英文任一即可） */
const FEATURE_HEADING_RE = /(功能|特性|features?|capabilities|highlights)/i;

/** 未填充占位符模式（按约定刻意不含 TODO） */
const PLACEHOLDER_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bTBD\b/i, label: "TBD" },
  { re: /\bFIXME\b/i, label: "FIXME" },
  { re: /\bXXXX+\b/, label: "XXXX" },
  { re: /待(?:补充|填写|完善|添加|更新)/, label: "待补充类占位" },
  { re: /\{\{[^}\n]+\}\}/, label: "{{...}} 模板占位" },
  { re: /<(?:your|insert|replace|待填)[^>\n]*>/i, label: "<your-...> 尖括号占位" },
];

/** 截断展示用的命中片段 */
function snippet(s: string): string {
  const t = s.trim();
  return t.length > 30 ? `${t.slice(0, 30)}…` : t;
}

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
  const headings = Array.from(
    prose.matchAll(/^#{1,6}\s+(.+)$/gm),
    (m) => (m[1] ?? "").trim(),
  );
  if (!headings.some((h) => FEATURE_HEADING_RE.test(h))) {
    issues.push("缺少功能特性章节（标题应包含「功能特性 / Features」等字样）");
  }

  // 3. 占位符残留（TODO 不算）
  for (const { re, label } of PLACEHOLDER_PATTERNS) {
    const hit = re.exec(prose);
    if (hit) {
      issues.push(`存在未填充占位符残留（${label}）: "${snippet(hit[0])}"`);
    }
  }

  return { ok: issues.length === 0, issues };
}

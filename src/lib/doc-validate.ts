/**
 * AI 生成文档的结构校验共用零件（README / ONBOARDING）。
 *
 * 抽出来的原因：README 与上手导读都要「剥代码块 → 查标题 → 查占位符残留」，
 * 复制一份就会出现两套占位符清单，改一处漏一处。
 */

/** 去掉围栏代码块与行内代码，降低占位符误报 */
export function stripCode(content: string): string {
  return content.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}

/** 提取 markdown 标题文本（不含 # 与前后空白） */
export function collectHeadings(prose: string): string[] {
  return Array.from(
    prose.matchAll(/^#{1,6}\s+(.+)$/gm),
    (m) => (m[1] ?? "").trim(),
  );
}

export interface PlaceholderIssue {
  label: string;
  snippet: string;
}

/** 未填充占位符模式（按约定刻意不含 TODO） */
export const PLACEHOLDER_PATTERNS: Array<{ re: RegExp; label: string }> = [
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

/** 查找未填充占位符（TODO 不算；调用方通常先 stripCode） */
export function findPlaceholderIssues(prose: string): PlaceholderIssue[] {
  const issues: PlaceholderIssue[] = [];
  for (const { re, label } of PLACEHOLDER_PATTERNS) {
    const hit = re.exec(prose);
    if (hit) issues.push({ label, snippet: snippet(hit[0]) });
  }
  return issues;
}

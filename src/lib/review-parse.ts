/**
 * 把 AI 的审查报告按严重程度切块，供 review-pr --comment 分级发布。
 *
 * 为什么按标题切而不是按行匹配 emoji：prompt 里约定的是「🔴 Critical / 🟠 Major /
 * 🟡 Minor / 💡 Nit」四级，但模型实际输出的层级不固定（## 标题、### 标题、
 * 甚至加粗行都有）。按标题切块 + 在块内找级别关键词，对这三种写法都成立，
 * 而「按 emoji 精确匹配」会被模型随手换图标（🔴→❌）直接打穿。
 */

export type ReviewSeverity = "critical" | "major" | "minor" | "nit" | "unknown";

export interface ReviewSection {
  severity: ReviewSeverity;
  /** 该块的原始 markdown（含标题行） */
  body: string;
}

/** 级别关键词 → 归一化级别。顺序即匹配优先级。 */
const SEVERITY_MARKERS: Array<[ReviewSeverity, RegExp]> = [
  ["critical", /critical|严重|致命|阻断/i],
  ["major", /major|重要|主要/i],
  ["minor", /minor|次要|建议/i],
  ["nit", /\bnit\b|nitpick|吹毛求疵|可选/i],
];

function classify(text: string): ReviewSeverity {
  for (const [severity, re] of SEVERITY_MARKERS) {
    if (re.test(text)) return severity;
  }
  return "unknown";
}

/**
 * 按 markdown 标题（`#` 开头）切块，每块按标题里的级别词归一化。
 *
 * 标题之前的正文（通常是「整体结论」一段）归入 unknown——
 * 调用方会把它当作总述，而不是某一条问题。
 */
export function parseReviewSections(markdown: string): ReviewSection[] {
  const lines = markdown.split("\n");
  const sections: ReviewSection[] = [];
  let current: { severity: ReviewSeverity; lines: string[] } | null = null;

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      if (current && current.lines.join("\n").trim()) sections.push(finish(current));
      current = { severity: classify(line), lines: [line] };
      continue;
    }
    if (!current) {
      current = { severity: "unknown", lines: [] };
    }
    current.lines.push(line);
  }
  if (current && current.lines.join("\n").trim()) sections.push(finish(current));

  // 同一级别可能出现多个标题块（如两段 "## 🔴 Critical"），合并成一条，
  // 免得在 PR 上刷出一串标题相同的评论
  const merged: ReviewSection[] = [];
  for (const s of sections) {
    const prev = merged.find((m) => m.severity === s.severity);
    if (prev) prev.body = `${prev.body}\n\n${s.body}`.trim();
    else merged.push({ ...s });
  }
  return merged;
}

function finish(current: { severity: ReviewSeverity; lines: string[] }): ReviewSection {
  return { severity: current.severity, body: current.lines.join("\n").trim() };
}

/** 逐条发布（Critical / Major）：每个级别一条评论 */
export function individualSections(sections: ReviewSection[]): ReviewSection[] {
  return sections.filter((s) => s.severity === "critical" || s.severity === "major");
}

/**
 * 合并成一条发布（Minor / Nit，以及没识别出级别的块）。
 *
 * unknown 也走这条：把总述和低级别问题并进同一条，好过因为解析不出级别就整段丢掉——
 * 「审查意见没发出去」比「多发一条评论」糟得多。
 */
export function digestSections(sections: ReviewSection[]): ReviewSection[] {
  return sections.filter(
    (s) => s.severity === "minor" || s.severity === "nit" || s.severity === "unknown",
  );
}

/** 计划发布的一条评论 */
export interface PlannedComment {
  /** critical / major 各自单发；digest 是 Minor+Nit+总述拼成的合并项 */
  label: "critical" | "major" | "digest";
  body: string;
}

/**
 * 把审查报告切成待发布的评论列表。
 *
 * 逐条发的意义在于 PR 的 review 时间线上能单独 resolve 掉已修的那一条；
 * 低级别合并则是为了不刷屏——四条 Nit 拆成四条评论只会让人关掉通知。
 */
export function buildCommentPlan(sections: ReviewSection[]): PlannedComment[] {
  const plan: PlannedComment[] = individualSections(sections).map((s) => ({
    label: s.severity as "critical" | "major",
    body: s.body,
  }));

  const digest = digestSections(sections);
  if (digest.length > 0) {
    plan.push({ label: "digest", body: digest.map((s) => s.body).join("\n\n") });
  }
  return plan;
}

/** 从审查报告 markdown 直接得到发布计划 */
export function planComments(review: string): PlannedComment[] {
  return buildCommentPlan(parseReviewSections(review));
}

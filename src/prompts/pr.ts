import type { ChatMessage } from "../types.js";

export interface PrPromptInput {
  /** 仓库名（用于上下文） */
  repoName: string;
  /** 当前分支名（可选） */
  branch?: string;
  base: string;
  diff: string;
  truncated: boolean;
  files: string[];
}

export interface PrResult {
  title: string;
  body: string;
}

/**
 * 组装 PR 标题 + 描述生成 prompt。要求模型输出 JSON（{title, body}）。
 */
export function buildPrPrompt(input: PrPromptInput): ChatMessage[] {
  const { repoName, branch, base, diff, truncated, files } = input;

  const diffSection = [
    truncated
      ? "⚠️ 注意：diff 因过大被截断，只根据可见部分生成。"
      : "",
    "```diff",
    diff,
    "```",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const system =
    "你是资深工程师，根据 git diff 生成 Pull Request 的标题和描述。\n" +
    "【硬性要求】\n" +
    "- 标题：conventional commits 风格（<type>(<scope>): <subject>），≤ 72 字符，动词开头，概括 PR 核心价值\n" +
    "- 描述（body）用 markdown：改动概述(一段) → 主要变更(要点列表 -) → 测试/验证 → 备注(可选，没有可省略)\n" +
    "- 只描述 diff 中真实存在的改动，禁止编造\n" +
    "- 输出严格 JSON：{\"title\":\"...\",\"body\":\"...\"}，body 内可含 \\n 换行；不要代码块包裹、不要任何前后缀解释";

  const user = [
    `# ${repoName} PR 生成`,
    branch ? `当前分支: ${branch}` : "",
    `目标分支: ${base}`,
    "",
    "【涉及文件】",
    files.length > 0 ? files.join("\n") : "（无）",
    "",
    "【diff】",
    diffSection,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 解析模型输出为 {title, body}。
 * 优先 JSON.parse（容忍代码块包裹），失败则回退：首行作 title，其余作 body。
 */
export function parsePrResult(raw: string): PrResult {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```[a-zA-Z]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
  }
  try {
    const obj = JSON.parse(text) as { title?: unknown; body?: unknown };
    if (typeof obj.title === "string" && typeof obj.body === "string") {
      return { title: obj.title.trim(), body: obj.body.trim() };
    }
  } catch {
    /* 回退到文本解析 */
  }
  const firstLine = /^\S.*$/m.exec(text)?.[0]?.trim() ?? "";
  const body = text.slice(text.indexOf(firstLine) + firstLine.length).trim();
  return { title: firstLine || "（无法解析标题）", body };
}
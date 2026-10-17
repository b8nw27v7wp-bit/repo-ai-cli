import { debug } from "./log.js";

/** 解析出的 PR 引用：owner/repo + PR 编号 */
export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

/**
 * 解析 GitHub PR 引用为 owner/repo/number。支持：
 * - https://github.com/owner/repo/pull/123
 * - https://github.com/owner/repo/pull/123/files
 * - owner/repo#123
 * - owner/repo/pull/123
 * 其他输入抛错，错误信息里带上受支持的格式示例。
 */
export function parsePrRef(input: string): PrRef {
  const trimmed = input.trim();

  // 完整 URL（github.com/owner/repo/pull/123，允许 trailing path 与 query）
  const urlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i,
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1] ?? "",
      repo: urlMatch[2] ?? "",
      number: Number(urlMatch[3]),
    };
  }

  // git@github.com:owner/repo.git/pull/123 这类写法不支持（PR 编号不在 clone URL 里）
  if (/^git@/i.test(trimmed)) {
    throw new Error(`无法从该输入识别 PR 编号: ${input}`);
  }

  // owner/repo#123
  const hashMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+?)#(\d+)$/);
  if (hashMatch) {
    return { owner: hashMatch[1] ?? "", repo: hashMatch[2] ?? "", number: Number(hashMatch[3]) };
  }

  // owner/repo/pull/123
  const shortMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+?)\/pull\/(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1] ?? "",
      repo: shortMatch[2] ?? "",
      number: Number(shortMatch[3]),
    };
  }

  throw new Error(
    `无法识别的 PR 引用: ${input}。支持: https://github.com/owner/repo/pull/123、owner/repo#123、owner/repo/pull/123`,
  );
}

export interface PullRequestInfo {
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  state: string;
  draft: boolean;
  /** PR 描述（可能为空串） */
  body: string;
}

export interface PullRequestDiff {
  raw: string;
  totalBytes: number;
  truncated: boolean;
}

/** 从 diff 文本提取涉及的文件路径（去重、保持出现顺序） */
export function parseDiffFiles(diff: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();
  const re = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(diff)) !== null) {
    // rename 时 b 侧才是新路径；取 b 侧更贴近审查对象
    const p = m[2];
    if (p && !seen.has(p)) {
      seen.add(p);
      files.push(p);
    }
  }
  return files;
}

function apiUrl(ref: PrRef, kind: "meta" | "diff" | "reviews"): string {
  const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
  if (kind === "meta") return base;
  return kind === "diff" ? `${base}.diff` : `${base}/reviews`;
}

/** 发布评论所需的写权限 token；缺失时给出可操作的获取指引 */
export function requireGithubToken(): string {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "发布 PR 评论需要 GITHUB_TOKEN（读公开仓库不需要，写评论需要）。\n" +
        "获取：https://github.com/settings/tokens —— 公开仓库勾 `public_repo`，私有仓库勾 `repo`\n" +
        "设置：export GITHUB_TOKEN=ghp_xxx（Windows PowerShell: $env:GITHUB_TOKEN=\"ghp_xxx\"）",
    );
  }
  return token;
}

/**
 * 以 PR review（event=COMMENT）的形式发一条评论。
 *
 * 用 reviews 端点而不是 issues/comments：前者进 PR 的 review 时间线，
 * 语义上就是「一次代码审查的结论」；行内评论（inline）需要把文件行号映射成
 * diff position，模型给的行号一旦对不上就整条发不出去，代价不成比例。
 *
 * 返回评论的 html_url，便于调用方回报给用户。
 */
export async function postPullRequestReview(
  ref: PrRef,
  body: string,
  timeoutMs = 30_000,
): Promise<string> {
  requireGithubToken(); // 只为在缺 token 时给出获取指引；apiHeaders 会自己读取它
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    debug(`发布 PR review: ${ref.owner}/${ref.repo}#${ref.number} (${body.length} 字符)`);
    const res = await fetch(apiUrl(ref, "reviews"), {
      method: "POST",
      headers: apiHeaders("application/vnd.github+json"),
      body: JSON.stringify({ body, event: "COMMENT" }),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `GITHUB_TOKEN 无权在该 PR 上评论（HTTP ${res.status}）。` +
          "请确认 token 未过期、且对目标仓库有写权限（公开仓库需 public_repo，私有仓库需 repo）。",
      );
    }
    if (res.status === 404) {
      throw new Error(
        `PR 不存在或无权访问: ${ref.owner}/${ref.repo}#${ref.number}`,
      );
    }
    if (res.status === 422) {
      throw new Error(
        `GitHub 拒绝了这条评论（HTTP 422）：${await safeText(res)}`,
      );
    }
    if (!res.ok) {
      throw new Error(`发布评论失败: HTTP ${res.status} ${await safeText(res)}`);
    }
    const data = (await res.json()) as { html_url?: string };
    return data.html_url ?? "";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`发布评论超时（${timeoutMs / 1000}s）`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<无法读取响应体>";
  }
}

/**
 * 请求头。带 GITHUB_TOKEN 时走认证请求（配额 5000/h，匿名只有 60/h）；
 * 错误提示里承诺了这个变量，所以必须真的读取它。
 */
function apiHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * 拉取 PR 的元信息（标题 / 作者 / 分支 / 状态）。
 * 用 GitHub 公开 REST API + 原生 fetch，不依赖 gh CLI；
 * 匿名即可读公开仓库，遇到限流会给出可读的错误。
 */
export async function fetchPullRequest(
  ref: PrRef,
  timeoutMs = 30_000,
): Promise<PullRequestInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(ref, "meta"), {
      headers: apiHeaders("application/vnd.github+json"),
      signal: controller.signal,
    });
    if (res.status === 404) {
      throw new Error(
        `PR 不存在或无权访问: ${ref.owner}/${ref.repo}#${ref.number}`,
      );
    }
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        `GitHub API 限流或拒绝（HTTP ${res.status}）。稍后重试，或用 GITHUB_TOKEN 提高配额。`,
      );
    }
    if (!res.ok) {
      throw new Error(`拉取 PR 元信息失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      title?: string;
      body?: string | null;
      draft?: boolean;
      state?: string;
      user?: { login?: string };
      head?: { ref?: string };
      base?: { ref?: string };
    };
    return {
      title: data.title ?? "(无标题)",
      author: data.user?.login ?? "(未知)",
      branch: data.head?.ref ?? "",
      baseBranch: data.base?.ref ?? "",
      state: data.state ?? "",
      draft: data.draft === true,
      body: data.body ?? "",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`拉取 PR 元信息超时（${timeoutMs / 1000}s）`, { cause: err });
    }
    throw new Error(`拉取 PR 元信息失败: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 拉取 PR 的 unified diff。
 * 超过 maxBytes 时在 diff 头部插入标注行并丢弃后续内容（与本地 getDiff 的截断语义一致）。
 */
export async function fetchPullRequestDiff(
  ref: PrRef,
  maxBytes = 200 * 1024,
  timeoutMs = 30_000,
): Promise<PullRequestDiff> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    debug(`拉取 PR diff: ${ref.owner}/${ref.repo}#${ref.number}`);
    const res = await fetch(apiUrl(ref, "diff"), {
      headers: apiHeaders("application/vnd.github.diff"),
      signal: controller.signal,
    });
    if (res.status === 404) {
      throw new Error(
        `PR 不存在或无权访问: ${ref.owner}/${ref.repo}#${ref.number}`,
      );
    }
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        `GitHub API 限流或拒绝（HTTP ${res.status}）。稍后重试，或用 GITHUB_TOKEN 提高配额。`,
      );
    }
    if (!res.ok) {
      throw new Error(`拉取 PR diff 失败: HTTP ${res.status}`);
    }
    const raw = await res.text();
    if (!raw.trim()) {
      throw new Error(`PR #${ref.number} 没有 diff 内容（空改动或仅含二进制文件）`);
    }
    const totalBytes = Buffer.byteLength(raw, "utf8");
    if (totalBytes <= maxBytes) {
      return { raw, totalBytes, truncated: false };
    }
    // 截断：保留头部（文件清单最先出现），并标注真实总量
    // 注意必须按字节而非字符切——diff 含中文时 slice(0, n) 拿到的字符数对应的
    // 字节数会到 3 倍于预算，maxDiffKb 形同虚设
    const truncated = `[diff truncated: ${(totalBytes / 1024).toFixed(0)} KB > ${(maxBytes / 1024).toFixed(0)} KB limit — 仅审查可见部分]\n`;
    const budget = Math.max(0, maxBytes - Buffer.byteLength(truncated, "utf8"));
    const buf = Buffer.from(raw, "utf8").subarray(0, budget);
    // subarray 可能切在 UTF-8 多字节字符中间，toString 会用 U+FFFD 补齐（3 字节）反而
    // 超预算。这里回退掉尾部不完整的序列：从切片末尾向前找最后一个字符起始字节。
    let end = buf.length;
    while (end > 0 && (buf[end - 1]! & 0xc0) === 0x80) end--; // 跳过 UTF-8 续字节 10xxxxxx
    if (end > 0) end -= 1; // 再退回该字符的首字节（首字节本身不要）
    const keep = buf.subarray(0, Math.max(0, end)).toString("utf8");
    return { raw: truncated + keep, totalBytes, truncated: true };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`拉取 PR diff 超时（${timeoutMs / 1000}s）`, { cause: err });
    }
    throw new Error(`拉取 PR diff 失败: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

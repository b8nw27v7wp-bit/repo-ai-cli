import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import os from "node:os";

/**
 * review-pr --comment：把审查结论发回 PR（P2-1）。
 *
 * 这是一条**外向**路径——发出去就撤不回来，所以用例的重点全在「什么情况下不发」：
 * 默认预览不发、缺 token 不发、交互模式下用户拒绝不发、中途失败要如实报告已发了几条。
 */

const PR_JSON = JSON.stringify({
  title: "Fix login bug",
  body: "steps",
  draft: false,
  state: "open",
  user: { login: "carol" },
  head: { ref: "fix/login" },
  base: { ref: "main" },
});

const DIFF_TEXT = [
  "diff --git a/src/login.ts b/src/login.ts",
  "index 1..2 100644",
  "--- a/src/login.ts",
  "+++ b/src/login.ts",
  "@@ -1,2 +1,2 @@",
  "-const ok = token == null;",
  "+const ok = token === null;",
].join("\n");

/** 四档级别的审查报告：Critical/Major 各一条，Minor+Nit+总述合并成一条 → 共 3 条评论 */
const REVIEW_MD = [
  "整体质量尚可。",
  "## 🔴 Critical",
  "- `src/login.ts:1` 空值判断会抛错",
  "## 🟠 Major",
  "- `src/login.ts:2` 未处理异常",
  "## 🟡 Minor",
  "- 命名可以更清楚",
  "## 💡 Nit",
  "- 缩进两格",
].join("\n");

interface FetchLog {
  reviews: Array<{ body: string }>;
  other: string[];
}

/** 按 URL 分流：meta → JSON、.diff → 文本、POST /reviews → 记录并返回 html_url */
function stubPrFetch(
  opts: { reviewStatus?: number; failAt?: number } = {},
): { fetchMock: ReturnType<typeof vi.fn>; log: FetchLog } {
  const log: FetchLog = { reviews: [], other: [] };
  let reviewCall = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/reviews")) {
      reviewCall++;
      if (opts.failAt === reviewCall) {
        return new Response("nope", { status: opts.reviewStatus ?? 403 });
      }
      log.reviews.push(JSON.parse(String(init?.body ?? "{}")) as { body: string });
      return new Response(JSON.stringify({ html_url: `https://github.com/o/r/pull/9#r${reviewCall}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes(".diff")) return new Response(DIFF_TEXT, { status: 200 });
    log.other.push(u);
    return new Response(PR_JSON, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, log };
}

async function stubReview(): Promise<void> {
  vi.stubEnv("HOME", os.tmpdir());
  vi.stubEnv("USERPROFILE", os.tmpdir());
  vi.spyOn(await import("../src/lib/llm.js"), "chatCompletion").mockResolvedValue(REVIEW_MD);
}

const BASE = {
  target: "o/r#9",
  provider: "deepseek",
  apiKey: ["sk", "unit"].join("-"),
  maxDiffKb: 200,
};

beforeEach(() => {
  vi.stubEnv("GITHUB_TOKEN", "");
  delete process.env.GITHUB_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("review-pr --comment: 默认不发布", () => {
  it("不带 --yes 时只预览，一个请求都不发", async () => {
    const { log } = stubPrFetch();
    await stubReview();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { runReviewPr } = await import("../src/commands/review-pr.js");

    await runReviewPr({ ...BASE, comment: true });

    expect(log.reviews).toHaveLength(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("空值判断会抛错");
    expect(process.exitCode).not.toBe(1);
  });

  it("--comment --json 不带 --yes：输出 dryRun 计划且不发请求", async () => {
    const { log } = stubPrFetch();
    await stubReview();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { runReviewPr } = await import("../src/commands/review-pr.js");

    await runReviewPr({ ...BASE, comment: true, yes: false, json: true });

    expect(log.reviews).toHaveLength(0);
    const body = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      dryRun: boolean;
      wouldPost: Array<{ label: string }>;
    };
    expect(body.dryRun).toBe(true);
    expect(body.wouldPost.map((w) => w.label)).toEqual([
      "critical",
      "major",
      "digest",
    ]);
  });
});

describe("review-pr --comment: 缺 token 时不发", () => {
  it("没有 GITHUB_TOKEN 时失败并给出获取指引，且不发任何请求", async () => {
    const { log } = stubPrFetch();
    await stubReview();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { runReviewPr } = await import("../src/commands/review-pr.js");

    await runReviewPr({ ...BASE, comment: true, yes: true });

    expect(log.reviews).toHaveLength(0);
    expect(process.exitCode).toBe(1);
    const printed = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("GITHUB_TOKEN");
    expect(printed).toContain("github.com/settings/tokens");
  });
});

describe("review-pr --comment: 确认后发布", () => {
  it("带 token 与 --yes 时按级别发布（Critical/Major 独立、Minor/Nit 合并）", async () => {
    const { log } = stubPrFetch();
    await stubReview();
    vi.stubEnv("GITHUB_TOKEN", "ghp_fake");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runReviewPr } = await import("../src/commands/review-pr.js");

    await runReviewPr({ ...BASE, comment: true, yes: true });

    // 非 TTY（测试环境）下 --yes 即授权，不再弹确认
    expect(log.reviews).toHaveLength(3);
    expect(log.reviews[0]?.body).toContain("空值判断会抛错");
    expect(log.reviews[0]?.body).toContain("repo-ai-cli review-pr");
    // 合并项里既有总述也有低级别问题
    const digest = log.reviews[2]?.body ?? "";
    expect(digest).toContain("整体质量尚可");
    expect(digest).toContain("缩进两格");
    // 结果汇报走 stderr（状态通道），stdout 留给产物
    expect(errSpy.mock.calls.map((c) => String(c[0])).join("\n")).toContain(
      "已发布 3 条评论",
    );
    expect(process.exitCode).not.toBe(1);
  });

  it("--comment --yes --json 输出已发布的链接", async () => {
    stubPrFetch();
    await stubReview();
    vi.stubEnv("GITHUB_TOKEN", "ghp_fake");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { runReviewPr } = await import("../src/commands/review-pr.js");

    await runReviewPr({ ...BASE, comment: true, yes: true, json: true });

    const body = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      ok: boolean;
      pr: string;
      posted: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.pr).toBe("o/r#9");
    expect(body.posted).toHaveLength(3);
    expect(body.posted[0]).toContain("github.com/o/r/pull/9#r1");
  });
});

describe("review-pr --comment: 部分失败要如实报告", () => {
  it("第二条失败时中止，并列出已经发出去的那一条", async () => {
    const { log } = stubPrFetch({ failAt: 2, reviewStatus: 403 });
    await stubReview();
    vi.stubEnv("GITHUB_TOKEN", "ghp_fake");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runReviewPr } = await import("../src/commands/review-pr.js");

    await runReviewPr({ ...BASE, comment: true, yes: true });

    expect(process.exitCode).toBe(1);
    // 只发出了第一条：失败后不再继续刷请求
    expect(log.reviews).toHaveLength(1);
    const printed = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("已发布 1 条");
    expect(printed).toContain("无权");
  });

  it("第一条就失败时不谎报已发布", async () => {
    const { log } = stubPrFetch({ failAt: 1, reviewStatus: 403 });
    await stubReview();
    vi.stubEnv("GITHUB_TOKEN", "ghp_fake");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runReviewPr } = await import("../src/commands/review-pr.js");

    await runReviewPr({ ...BASE, comment: true, yes: true });

    expect(log.reviews).toHaveLength(0);
    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join("\n")).not.toContain("已发布");
  });
});

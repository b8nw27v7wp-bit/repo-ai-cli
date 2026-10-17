import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

/** 按 URL 分流：元信息回 JSON，.diff 回 diff 文本 */
function stubPrFetch(overrides: { diff?: string; metaStatus?: number; diffStatus?: number } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes(".diff")) {
        if (overrides.diffStatus) return new Response("{}", { status: overrides.diffStatus });
        return new Response(overrides.diff ?? DIFF_TEXT, { status: 200 });
      }
      if (overrides.metaStatus) return new Response("{}", { status: overrides.metaStatus });
      return new Response(PR_JSON, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runReviewPr", () => {
  it("拉取 PR diff 并输出审查结果（含 PR 上下文）", async () => {
    const { runReviewPr } = await import("../src/commands/review-pr.js");
    stubPrFetch();
    // 隔离真实环境与 ~/.repo-ai/config.json，并让 LLM 调用可预测
    vi.stubEnv("HOME", os.tmpdir());
    vi.stubEnv("USERPROFILE", os.tmpdir());
    const chat = vi
      .spyOn(await import("../src/lib/llm.js"), "chatCompletion")
      .mockResolvedValue("严重程度：Major\n- 空值判断需覆盖 undefined");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await runReviewPr({
      target: "https://github.com/o/r/pull/9",
      provider: "deepseek",
      apiKey: ["sk", "unit"].join("-"),
      maxDiffKb: 200,
      json: false,
    });

    const stdout = log.mock.calls.map((c) => String(c[0])).join("\n");
    warn.mockRestore();
    err.mockRestore();
    // 审查结论落在 stdout（可供管道）
    expect(stdout).toContain("空值判断需覆盖 undefined");
    // LLM 收到的 prompt 里必须带上 PR 的 diff 内容
    const prompt = String(chat.mock.calls[0]?.[0]?.[1]?.content ?? "");
    expect(prompt).toContain("src/login.ts");
    expect(prompt).toContain("-const ok = token == null;");
  });

  it("--json 输出 PR 元信息与审查结果，stdout 只有 JSON", async () => {
    const { runReviewPr } = await import("../src/commands/review-pr.js");
    stubPrFetch();
    vi.stubEnv("HOME", os.tmpdir());
    vi.stubEnv("USERPROFILE", os.tmpdir());
    vi.spyOn(await import("../src/lib/llm.js"), "chatCompletion").mockResolvedValue(
      "结论 A",
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runReviewPr({
      target: "o/r#9",
      provider: "deepseek",
      apiKey: ["sk", "unit"].join("-"),
      maxDiffKb: 200,
      json: true,
    });
    const stdout = log.mock.calls.map((c) => String(c[0])).join("\n");
    const stderr = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
    log.mockRestore();
    errSpy.mockRestore();

    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.pr).toBe("o/r#9");
    expect(parsed.title).toBe("Fix login bug");
    expect(parsed.author).toBe("carol");
    expect(parsed.files).toContain("src/login.ts");
    expect(parsed.review).toContain("结论 A");
    // 人类可读的上下文头只走 stderr，且仅在非 JSON 模式输出（warn 在 jsonMode 下静默）；
    // stdout 必须是纯 JSON，不得混入额外行
    expect(stdout.trim().startsWith("{")).toBe(true);
    expect(stdout.trim().endsWith("}")).toBe(true);
    expect(stderr).not.toContain("PR: o/r#9");
  });

  it("非法 PR 引用直接报错，不发请求", async () => {
    const { runReviewPr } = await import("../src/commands/review-pr.js");
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runReviewPr({ target: "totally-not-a-pr", provider: "deepseek", apiKey: "sk-unit", maxDiffKb: 200 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("PR 拉取失败时报错退出且不调用 LLM", async () => {
    const { runReviewPr } = await import("../src/commands/review-pr.js");
    stubPrFetch({ metaStatus: 404 });
    const chat = vi.spyOn(await import("../src/lib/llm.js"), "chatCompletion");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runReviewPr({ target: "o/r#404", provider: "deepseek", apiKey: "sk-unit", maxDiffKb: 200 });
    expect(chat).not.toHaveBeenCalled();
  });

  it("非法 focus 不进入 LLM 调用", async () => {
    const { runReviewPr } = await import("../src/commands/review-pr.js");
    stubPrFetch();
    const chat = vi.spyOn(await import("../src/lib/llm.js"), "chatCompletion");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runReviewPr({
      target: "o/r#9",
      focus: "nonsense",
      provider: "deepseek",
      apiKey: "sk-unit",
      maxDiffKb: 200,
    });
    expect(chat).not.toHaveBeenCalled();
  });

  it("-o 写入文件且内容为审查结论", async () => {
    const { runReviewPr } = await import("../src/commands/review-pr.js");
    stubPrFetch();
    vi.stubEnv("HOME", os.tmpdir());
    vi.stubEnv("USERPROFILE", os.tmpdir());
    vi.spyOn(await import("../src/lib/llm.js"), "chatCompletion").mockResolvedValue(
      "写入我 REVIEW_BODY",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tmp = await mkdtemp(path.join(os.tmpdir(), "reviewpr-"));
    const out = path.join(tmp, "review.md");
    await runReviewPr({
      target: "o/r#9",
      provider: "deepseek",
      apiKey: "sk-unit",
      maxDiffKb: 200,
      output: out,
    });
    const written = await readFile(out, "utf8");
    expect(written).toContain("写入我 REVIEW_BODY");
    await rm(tmp, { recursive: true, force: true });
  });
});

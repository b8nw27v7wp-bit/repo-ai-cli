import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parsePrRef,
  parseDiffFiles,
  fetchPullRequest,
  fetchPullRequestDiff,
} from "../src/lib/github-pr.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parsePrRef", () => {
  it("解析完整 URL（含 /files 与 query）", () => {
    expect(parsePrRef("https://github.com/octo/repo/pull/42")).toEqual({
      owner: "octo",
      repo: "repo",
      number: 42,
    });
    expect(parsePrRef("https://github.com/octo/repo/pull/42/files?diff=split")).toEqual({
      owner: "octo",
      repo: "repo",
      number: 42,
    });
  });

  it("解析 owner/repo#123", () => {
    expect(parsePrRef("b8nw27v7wp-bit/repo-ai-cli#7")).toEqual({
      owner: "b8nw27v7wp-bit",
      repo: "repo-ai-cli",
      number: 7,
    });
  });

  it("解析 owner/repo/pull/123", () => {
    expect(parsePrRef("b8nw27v7wp-bit/repo-ai-cli/pull/7")).toEqual({
      owner: "b8nw27v7wp-bit",
      repo: "repo-ai-cli",
      number: 7,
    });
  });

  it("拒绝非 PR 输入并给出可用格式", () => {
    for (const bad of [
      "not-a-pr",
      "https://github.com/octo/repo",
      "https://github.com/octo/repo/issues/3",
      "octo/repo",
      "git@github.com:octo/repo.git",
    ]) {
      expect(() => parsePrRef(bad), bad).toThrow(/无法识别|无法从该输入识别/);
    }
  });
});

describe("parseDiffFiles", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 111..222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "diff --git a/src/b.ts b/src/b.ts",
    "index 333..444 100644",
    "--- a/src/b.ts",
    "+++ b/src/b.ts",
    "diff --git a/src/oldName.ts b/src/newName.ts",
    "similarity index 90%",
    "rename from src/oldName.ts",
    "rename to src/newName.ts",
  ].join("\n");

  it("提取 b 侧路径（rename 取新路径）、去重且保序", () => {
    const files = parseDiffFiles(diff);
    expect(files).toEqual(["src/a.ts", "src/b.ts", "src/newName.ts"]);
  });

  it("空 diff 返回空数组", () => {
    expect(parseDiffFiles("")).toEqual([]);
    expect(parseDiffFiles("no diff here")).toEqual([]);
  });
});

describe("fetchPullRequest", () => {
  it("返回 PR 元信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/repos/o/r/pulls/9");
        return new Response(
          JSON.stringify({
            title: "Add feature",
            body: "desc",
            draft: false,
            state: "open",
            user: { login: "alice" },
            head: { ref: "feat" },
            base: { ref: "main" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const info = await fetchPullRequest({ owner: "o", repo: "r", number: 9 });
    expect(info).toEqual({
      title: "Add feature",
      author: "alice",
      branch: "feat",
      baseBranch: "main",
      state: "open",
      draft: false,
      body: "desc",
    });
  });

  it("404 抛可读错误", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await expect(fetchPullRequest({ owner: "o", repo: "r", number: 1 })).rejects.toThrow(
      /不存在或无权访问/,
    );
  });

  it("403/429 提示限流与 GITHUB_TOKEN", async () => {
    for (const status of [403, 429]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
      await expect(fetchPullRequest({ owner: "o", repo: "r", number: 1 })).rejects.toThrow(
        /限流|GITHUB_TOKEN/,
      );
    }
  });

  it("draft 与缺失字段有兜底", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ draft: true }), { status: 200 }),
      ),
    );
    const info = await fetchPullRequest({ owner: "o", repo: "r", number: 2 });
    expect(info.draft).toBe(true);
    expect(info.author).toBe("(未知)");
    expect(info.branch).toBe("");
  });
});

describe("fetchPullRequestDiff", () => {
  const sample = [
    "diff --git a/a.ts b/a.ts",
    "index 1..2 100644",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1 +1 @@",
    "-x",
    "+y",
  ].join("\n");

  it("小 diff 原样返回且不标记截断", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/pulls/9.diff");
        return new Response(sample, { status: 200 });
      }),
    );
    const out = await fetchPullRequestDiff({ owner: "o", repo: "r", number: 9 });
    expect(out.raw).toBe(sample);
    expect(out.truncated).toBe(false);
  });

  it("超过 maxBytes 时插入标注行并截断", async () => {
    const big = "diff --git a/f b/f\n" + "z".repeat(5000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(big, { status: 200 })));
    const out = await fetchPullRequestDiff({ owner: "o", repo: "r", number: 1 }, 200);
    expect(out.truncated).toBe(true);
    expect(out.raw).toContain("[diff truncated:");
    expect(Buffer.byteLength(out.raw, "utf8")).toBeLessThanOrEqual(200);
    expect(out.totalBytes).toBe(Buffer.byteLength(big, "utf8"));
  });

  it("空 diff 抛错（空改动或纯二进制）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await expect(
      fetchPullRequestDiff({ owner: "o", repo: "r", number: 1 }),
    ).rejects.toThrow(/没有 diff 内容/);
  });

  it("404 抛可读错误", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await expect(
      fetchPullRequestDiff({ owner: "o", repo: "r", number: 1 }),
    ).rejects.toThrow(/不存在或无权访问/);
  });
});

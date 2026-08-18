import { describe, it, expect } from "vitest";
import { buildPrPrompt, parsePrResult } from "../src/prompts/pr.js";

describe("buildPrPrompt", () => {
  it("包含分支、base、diff 与文件列表", () => {
    const msgs = buildPrPrompt({
      repoName: "demo",
      branch: "feat/x",
      base: "main",
      diff: "diff --git a/a.ts b/a.ts",
      truncated: false,
      files: ["a.ts"],
    });
    const user = msgs[1]?.content ?? "";
    expect(user).toContain("feat/x");
    expect(user).toContain("main");
    expect(user).toContain("a.ts");
    expect(msgs[0]?.content).toContain("conventional commits");
  });

  it("truncated 时给出警告", () => {
    const msgs = buildPrPrompt({
      repoName: "d",
      base: "main",
      diff: "x",
      truncated: true,
      files: [],
    });
    expect(msgs[1]?.content).toContain("截断");
  });
});

describe("parsePrResult", () => {
  it("解析 JSON", () => {
    const r = parsePrResult('{"title":"feat: x","body":"- a\\n- b"}');
    expect(r.title).toBe("feat: x");
    expect(r.body).toBe("- a\n- b");
  });

  it("容忍代码块包裹", () => {
    const r = parsePrResult('```json\n{"title":"feat: x","body":"body"}\n```');
    expect(r.title).toBe("feat: x");
    expect(r.body).toBe("body");
  });

  it("回退：首行为标题，其余为正文", () => {
    const r = parsePrResult("feat: hello\n\n这个 PR 做了 X");
    expect(r.title).toBe("feat: hello");
    expect(r.body).toContain("这个 PR 做了 X");
  });

  it("空输入不抛错", () => {
    const r = parsePrResult("   ");
    expect(r.title).toBe("（无法解析标题）");
    expect(r.body).toBe("");
  });
});
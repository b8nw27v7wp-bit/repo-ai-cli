import { describe, it, expect } from "vitest";
import { buildCommitPrompt } from "../src/prompts/commit.js";

describe("buildCommitPrompt", () => {
  it("包含 diff 与文件列表", () => {
    const [msg] = buildCommitPrompt({
      diff: "diff --git a/a.ts b/a.ts\n+export const a = 1;",
      truncated: false,
      files: ["a.ts"],
    });
    expect(msg!.content).toContain("a.ts");
    expect(msg!.content).toContain("diff --git a/a.ts");
  });

  it("truncated 时给出警告", () => {
    const [msg] = buildCommitPrompt({
      diff: "diff...",
      truncated: true,
      files: [],
    });
    expect(msg!.content).toContain("截断");
  });

  it("forcedType 生效", () => {
    const [msg] = buildCommitPrompt({
      diff: "x",
      truncated: false,
      forcedType: "docs",
      files: [],
    });
    expect(msg!.content).toContain("docs");
  });

  it("禁止编造 + 72 字符约束", () => {
    const [msg] = buildCommitPrompt({
      diff: "x",
      truncated: false,
      files: [],
    });
    expect(msg!.content).toContain("禁止编造");
    expect(msg!.content).toContain("72 字符");
  });

  it("只输出 message 本身", () => {
    const [msg] = buildCommitPrompt({
      diff: "x",
      truncated: false,
      files: [],
    });
    expect(msg!.content).toContain("只输出 commit message 本身");
  });
});

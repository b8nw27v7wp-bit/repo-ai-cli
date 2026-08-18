import { describe, it, expect } from "vitest";
import {
  buildReviewPrompt,
  REVIEW_FOCUSES,
} from "../src/prompts/review.js";

describe("buildReviewPrompt", () => {
  it("包含 diff 与文件列表", () => {
    const messages = buildReviewPrompt({
      diff: "diff --git a/a.ts b/a.ts\n+export const a = 1;",
      truncated: false,
      files: ["a.ts"],
      focus: "all",
    });
    expect(messages).toHaveLength(2);
    const user = messages[1]?.content ?? "";
    expect(user).toContain("a.ts");
    expect(user).toContain("diff --git a/a.ts");
  });

  it("truncated 时给出警告", () => {
    const messages = buildReviewPrompt({
      diff: "diff...",
      truncated: true,
      files: [],
      focus: "all",
    });
    expect(messages[1]?.content).toContain("截断");
  });

  it("系统提示包含严重程度分级与禁止编造", () => {
    const messages = buildReviewPrompt({
      diff: "x",
      truncated: false,
      files: [],
      focus: "all",
    });
    const system = messages[0]?.content ?? "";
    expect(system).toContain("禁止编造");
    expect(system).toContain("Critical");
    expect(system).toContain("文件:行号");
  });

  it("focus 分级规则正确注入", () => {
    for (const focus of REVIEW_FOCUSES) {
      const messages = buildReviewPrompt({
        diff: "x",
        truncated: false,
        files: [],
        focus,
      });
      expect(messages[0]?.content).toBeTruthy();
    }
    const bugs = buildReviewPrompt({
      diff: "x",
      truncated: false,
      files: [],
      focus: "bugs",
    });
    expect(bugs[0]?.content).toContain("正确性");

    const security = buildReviewPrompt({
      diff: "x",
      truncated: false,
      files: [],
      focus: "security",
    });
    expect(security[0]?.content).toContain("安全");
  });
});

describe("REVIEW_FOCUSES", () => {
  it("包含全部五个维度", () => {
    expect(REVIEW_FOCUSES).toEqual([
      "all",
      "bugs",
      "security",
      "style",
      "perf",
    ]);
  });
});
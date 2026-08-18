import { describe, it, expect } from "vitest";
import { buildRefactorPrompt } from "../src/prompts/refactor.js";

describe("buildRefactorPrompt", () => {
  it("包含文件、内容与 focus 规则", () => {
    const msgs = buildRefactorPrompt({
      file: "a.ts",
      content: "code",
      focus: "perf",
      truncated: false,
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[1]?.content).toContain("a.ts");
    expect(msgs[0]?.content).toContain("性能");
  });

  it("禁止编造 + 附代码示例", () => {
    const msgs = buildRefactorPrompt({
      file: "a.ts",
      content: "x",
      focus: "all",
      truncated: false,
    });
    expect(msgs[0]?.content).toContain("禁止编造");
    expect(msgs[0]?.content).toContain("建议改法");
  });

  it("truncated 时给出警告", () => {
    const msgs = buildRefactorPrompt({
      file: "a.ts",
      content: "x",
      focus: "all",
      truncated: true,
    });
    expect(msgs[1]?.content).toContain("截断");
  });
});
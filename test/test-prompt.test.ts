import { describe, it, expect } from "vitest";
import { buildTestPrompt } from "../src/prompts/test.js";

describe("buildTestPrompt", () => {
  it("包含文件、内容与框架规则", () => {
    const msgs = buildTestPrompt({
      file: "src/greet.ts",
      content: "export function greet(n: string) { return `hi ${n}`; }",
      framework: "vitest",
      truncated: false,
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[1]?.content).toContain("src/greet.ts");
    expect(msgs[1]?.content).toContain("greet");
    expect(msgs[0]?.content).toContain("vitest");
  });

  it("框架规则正确注入", () => {
    const jest = buildTestPrompt({ file: "x", content: "a", framework: "jest", truncated: false });
    expect(jest[0]?.content).toContain("Jest");

    const node = buildTestPrompt({ file: "x", content: "a", framework: "node-test", truncated: false });
    expect(node[0]?.content).toContain("node:test");
  });

  it("禁止编造 + 直接输出代码", () => {
    const msgs = buildTestPrompt({ file: "x", content: "a", framework: "vitest", truncated: false });
    expect(msgs[0]?.content).toContain("禁止编造");
    expect(msgs[0]?.content).toContain("直接输出测试代码");
  });

  it("truncated 时给出警告", () => {
    const msgs = buildTestPrompt({ file: "x", content: "a", framework: "vitest", truncated: true });
    expect(msgs[1]?.content).toContain("截断");
  });
});
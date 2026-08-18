import { describe, it, expect } from "vitest";
import { buildExplainPrompt } from "../src/prompts/explain.js";

describe("buildExplainPrompt", () => {
  it("包含文件路径、内容与语言规则", () => {
    const messages = buildExplainPrompt({
      file: "src/lib/git.ts",
      content: "1 | export const a = 1;",
      language: "zh",
    });
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("src/lib/git.ts");
    expect(messages[1]?.content).toContain("export const a = 1;");
    expect(messages[0]?.content).toContain("中文");
  });

  it("focus 注入聚焦位置", () => {
    const messages = buildExplainPrompt({
      file: "x.ts",
      content: "1 | a",
      focus: "第 38 行",
      language: "en",
    });
    expect(messages[1]?.content).toContain("第 38 行");
  });

  it("truncated 时给出警告", () => {
    const messages = buildExplainPrompt({
      file: "x.ts",
      content: "1 | a",
      truncated: true,
      language: "bilingual",
    });
    expect(messages[1]?.content).toContain("截断");
  });

  it("system 提示禁止编造", () => {
    const messages = buildExplainPrompt({
      file: "x.ts",
      content: "1 | a",
      language: "zh",
    });
    expect(messages[0]?.content).toContain("禁止编造");
  });

  it("symbol 注入聚焦符号", () => {
    const messages = buildExplainPrompt({
      file: "src/lib/git.ts",
      content: "1 | a",
      symbol: "getDiff",
      language: "zh",
    });
    expect(messages[1]?.content).toContain("getDiff");
    expect(messages[1]?.content).toContain("聚焦符号");
  });
});
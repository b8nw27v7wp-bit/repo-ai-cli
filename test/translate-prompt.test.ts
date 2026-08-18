import { describe, it, expect } from "vitest";
import { buildTranslatePrompt } from "../src/prompts/translate.js";

describe("buildTranslatePrompt", () => {
  it("包含文件路径、内容与目标语言规则", () => {
    const messages = buildTranslatePrompt({
      file: "README.md",
      content: "# Hello\n这是说明",
      target: "en",
    });
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("README.md");
    expect(messages[1]?.content).toContain("# Hello");
    expect(messages[0]?.content).toContain("英文");
  });

  it("目标语言规则正确注入", () => {
    const zh = buildTranslatePrompt({ file: "x.md", content: "a", target: "zh" });
    expect(zh[0]?.content).toContain("中文");

    const bi = buildTranslatePrompt({ file: "x.md", content: "a", target: "bilingual" });
    expect(bi[0]?.content).toContain("双语");
  });

  it("系统提示要求保留代码块与结构", () => {
    const messages = buildTranslatePrompt({ file: "x.md", content: "a", target: "en" });
    expect(messages[0]?.content).toContain("代码块");
    expect(messages[0]?.content).toContain("不增删内容");
  });

  it("truncated 时给出警告", () => {
    const messages = buildTranslatePrompt({
      file: "x.md",
      content: "a",
      target: "zh",
      truncated: true,
    });
    expect(messages[1]?.content).toContain("截断");
  });
});
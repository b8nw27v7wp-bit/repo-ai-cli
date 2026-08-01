import { describe, it, expect } from "vitest";
import { buildReadmePrompt } from "../src/prompts/readme.js";
import type { BudgetResult } from "../src/types.js";

const mkBudget = (overrides: Partial<BudgetResult> = {}): BudgetResult => ({
  treeText: "my-repo/",
  files: [],
  estimatedTokens: 10,
  ...overrides,
});

describe("buildReadmePrompt", () => {
  it("包含仓库名与目录树", () => {
    const messages = buildReadmePrompt("my-repo", mkBudget());
    expect(messages[0]!.role).toBe("system");
    expect(messages[1]!.content).toContain("my-repo");
    expect(messages[1]!.content).toContain("my-repo/");
  });

  it("bilingual 模式要求中英双语", () => {
    const [system] = buildReadmePrompt("r", mkBudget());
    expect(system!.content).toContain("中英双语");
  });

  it("zh 模式要求全中文", () => {
    const [system] = buildReadmePrompt("r", mkBudget(), "zh");
    expect(system!.content).toContain("全中文");
  });

  it("en 模式要求全英文", () => {
    const [system] = buildReadmePrompt("r", mkBudget(), "en");
    expect(system!.content).toContain("全英文");
  });

  it("文件按 budget 结果注入，skip 的不出现", () => {
    const budget = mkBudget({
      files: [
        {
          file: { relPath: "README.md", content: "# hi", sizeBytes: 4, priority: 1 },
          mode: "full",
        },
        {
          file: { relPath: "a.ts", content: "x", sizeBytes: 1, priority: 3 },
          mode: "skip",
          note: "预算耗尽",
        },
      ],
    });
    const [, user] = buildReadmePrompt("r", budget);
    expect(user!.content).toContain("## 文件: README.md");
    expect(user!.content).not.toContain("## 文件: a.ts");
  });

  it("sample 文件带 [sampled] 标注", () => {
    const budget = mkBudget({
      files: [
        {
          file: { relPath: "big.ts", content: "x", sizeBytes: 1, priority: 3 },
          mode: "sample",
          note: "采样前 60 行（共 100 行）",
        },
      ],
    });
    const [, user] = buildReadmePrompt("r", budget);
    expect(user!.content).toContain("[sampled]");
    expect(user!.content).toContain("采样前 60 行");
  });

  it("skippedNote 会出现在末尾", () => {
    const budget = mkBudget({ skippedNote: "[skipped 2 file(s) to fit token budget: ...]" });
    const [, user] = buildReadmePrompt("r", budget);
    expect(user!.content).toContain("skipped 2 file");
  });

  it("系统 prompt 禁止编造功能", () => {
    const [system] = buildReadmePrompt("r", mkBudget());
    expect(system!.content).toContain("禁止编造");
  });
});

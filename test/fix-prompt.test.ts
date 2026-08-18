import { describe, it, expect } from "vitest";
import { buildFixPrompt } from "../src/prompts/fix.js";
import type { BudgetResult } from "../src/types.js";

const mkBudget = (): BudgetResult => ({
  treeText: "repo/",
  files: [],
  estimatedTokens: 10,
});

describe("buildFixPrompt", () => {
  it("包含 bug 描述与项目材料", () => {
    const msgs = buildFixPrompt("repo", mkBudget(), "提交时报 401 错误");
    expect(msgs).toHaveLength(2);
    expect(msgs[1]?.content).toContain("提交时报 401 错误");
    expect(msgs[1]?.content).toContain("repo/");
  });

  it("系统提示要求结构化输出", () => {
    const [system] = buildFixPrompt("repo", mkBudget(), "x");
    expect(system!.content).toContain("根因分析");
    expect(system!.content).toContain("建议修复");
    expect(system!.content).toContain("禁止编造");
  });
});
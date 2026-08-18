import { describe, it, expect } from "vitest";
import { buildAskPrompt } from "../src/prompts/ask.js";
import type { BudgetResult } from "../src/types.js";

const mkBudget = (): BudgetResult => ({
  treeText: "repo/",
  files: [],
  estimatedTokens: 10,
});

describe("buildAskPrompt", () => {
  it("包含问题与项目材料", () => {
    const msgs = buildAskPrompt("repo", mkBudget(), "如何实现 token 预算？");
    expect(msgs).toHaveLength(2);
    expect(msgs[1]?.content).toContain("如何实现 token 预算");
    expect(msgs[1]?.content).toContain("repo/");
  });

  it("系统提示禁止编造", () => {
    const [system] = buildAskPrompt("repo", mkBudget(), "问");
    expect(system!.content).toContain("禁止编造");
    expect(system!.content).toContain("材料未覆盖");
  });
});
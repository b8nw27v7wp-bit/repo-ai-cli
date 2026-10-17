import { describe, it, expect } from "vitest";
import {
  digestSections,
  individualSections,
  parseReviewSections,
  planComments,
} from "../src/lib/review-parse.js";

/**
 * 审查报告分级解析（review-pr --comment 的前置）。
 *
 * 这里刻意用几种「模型实际会写出来的」标题形态做输入：## 标题、### 标题、
 * 加粗行、中文级别词。按 emoji 精确匹配的实现会在第一个变体上就漏掉内容。
 */

describe("parseReviewSections", () => {
  it("按标题切块并识别级别", () => {
    const sections = parseReviewSections(
      [
        "## 🔴 Critical",
        "- `a.ts:3` 空指针",
        "",
        "## 🟠 Major",
        "- `b.ts:9` 未处理异常",
        "",
        "## 🟡 Minor",
        "- `c.ts:1` 命名",
        "",
        "## 💡 Nit",
        "- 缩进",
      ].join("\n"),
    );

    expect(sections.map((s) => s.severity)).toEqual([
      "critical",
      "major",
      "minor",
      "nit",
    ]);
    expect(sections[0]?.body).toContain("a.ts:3");
  });

  it("识别中文级别词（模型不写 emoji 时也要能分级）", () => {
    const sections = parseReviewSections(
      ["## 严重问题", "- x", "## 次要问题", "- y"].join("\n"),
    );
    expect(sections.map((s) => s.severity)).toEqual(["critical", "minor"]);
  });

  it("标题层级不影响识别（### 与 ## 等价）", () => {
    const sections = parseReviewSections(
      ["### Critical", "- x", "### Nit", "- y"].join("\n"),
    );
    expect(sections.map((s) => s.severity)).toEqual(["critical", "nit"]);
  });

  it("标题之前的正文归为 unknown（通常是整体结论）", () => {
    const sections = parseReviewSections(
      ["整体质量良好，有 1 处需要修。", "", "## 🔴 Critical", "- x"].join("\n"),
    );
    expect(sections[0]?.severity).toBe("unknown");
    expect(sections[0]?.body).toContain("整体质量良好");
    expect(sections[1]?.severity).toBe("critical");
  });

  it("完全没有标题时整段归为 unknown，不丢内容", () => {
    const sections = parseReviewSections("未发现明显问题。");
    expect(sections).toEqual([{ severity: "unknown", body: "未发现明显问题。" }]);
  });

  it("同级别的多个标题块合并，避免刷出一串同标题评论", () => {
    const sections = parseReviewSections(
      ["## 🔴 Critical", "- a", "## 🔴 Critical", "- b"].join("\n"),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]?.body).toContain("- a");
    expect(sections[0]?.body).toContain("- b");
  });

  it("空报告返回空数组", () => {
    expect(parseReviewSections("")).toEqual([]);
    expect(parseReviewSections("\n\n  \n")).toEqual([]);
  });
});

describe("发布分组", () => {
  const mixed = parseReviewSections(
    [
      "总述。",
      "## 🔴 Critical",
      "- c",
      "## 🟠 Major",
      "- m",
      "## 🟡 Minor",
      "- n",
      "## 💡 Nit",
      "- t",
    ].join("\n"),
  );

  it("Critical / Major 逐条发", () => {
    expect(individualSections(mixed).map((s) => s.severity)).toEqual([
      "critical",
      "major",
    ]);
  });

  it("Minor / Nit 与 unknown 合并成一条", () => {
    expect(digestSections(mixed).map((s) => s.severity)).toEqual([
      "unknown",
      "minor",
      "nit",
    ]);
  });

  it("planComments 产出 3 条：Critical、Major 各一条，其余拼成一条 digest", () => {
    const plan = planComments(mixed.map((s) => s.body).join("\n\n"));
    expect(plan.map((p) => p.label)).toEqual(["critical", "major", "digest"]);
    // 合并项里既有总述也有低级别问题，一块都不能丢
    const digest = plan[2]?.body ?? "";
    expect(digest).toContain("总述。");
    expect(digest).toContain("- n");
    expect(digest).toContain("- t");
  });

  it("只有低级别问题时只发一条 digest", () => {
    const plan = planComments("## 💡 Nit\n- 缩进");
    expect(plan.map((p) => p.label)).toEqual(["digest"]);
  });
});

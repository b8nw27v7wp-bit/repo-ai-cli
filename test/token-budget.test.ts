import { describe, it, expect } from "vitest";
import { allocateBudget, estimateTokens } from "../src/lib/token-budget.js";
import type { CollectedFile } from "../src/types.js";

function file(relPath: string, content: string, priority: 1 | 2 | 3): CollectedFile {
  return { relPath, content, sizeBytes: content.length, priority };
}

describe("estimateTokens", () => {
  it("英文约 4 字符/token", () => {
    const t = estimateTokens("a".repeat(400));
    expect(t).toBe(100);
  });
  it("中文约 1 字符/token", () => {
    const t = estimateTokens("测".repeat(100));
    expect(t).toBe(100);
  });
  it("空串为 0", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("allocateBudget", () => {
  it("预算内: 全部完整保留", () => {
    const files = [
      file("README.md", "# hi", 1),
      file("src/util.ts", "export const a = 1;", 3),
    ];
    const res = allocateBudget({ files, treeText: "tree", maxTokens: 8000 });
    expect(res.files.map((f) => f.mode)).toEqual(["full", "full"]);
    expect(res.skippedNote).toBeUndefined();
  });

  it("预算耗尽: 优先级 3 被跳过并汇总标注", () => {
    const files = [
      file("README.md", "# hi", 1),
      file("a.ts", "x".repeat(1000), 3),
      file("b.ts", "y".repeat(1000), 3),
    ];
    const res = allocateBudget({
      files,
      treeText: "tree",
      maxTokens: 50, // 只够 README + tree
    });
    expect(res.files[0]!.mode).toBe("full"); // README 完整保留
    expect(res.files[1]!.mode).toBe("skip");
    expect(res.files[2]!.mode).toBe("skip");
    expect(res.skippedNote).toMatch(/skipped 2 file/);
  });

  it("优先级 3 超预算时采样前 N 行", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const files = [file("big.ts", lines, 3)];
    const res = allocateBudget({
      files,
      treeText: "tree",
      maxTokens: 8000,
      sampleLines: 60,
    });
    expect(res.files[0]!.mode).toBe("sample");
    expect(res.files[0]!.note).toMatch(/采样前 60 行/);
  });

  it("短文件（≤ 采样行数）完整保留且无 note", () => {
    const files = [file("small.ts", "line 1\nline 2", 3)];
    const res = allocateBudget({
      files,
      treeText: "tree",
      maxTokens: 8000,
    });
    expect(res.files[0]!.mode).toBe("full");
    expect(res.files[0]!.note).toBeUndefined();
  });

  it("estimatedTokens 只统计纳入的内容", () => {
    const files = [
      file("README.md", "# hi", 1),
      file("skipped.ts", "x".repeat(5000), 3),
    ];
    const res = allocateBudget({ files, treeText: "tree", maxTokens: 100 });
    expect(res.estimatedTokens).toBeLessThan(5000 / 4);
  });

  it("空文件列表也能工作", () => {
    const res = allocateBudget({ files: [], treeText: "tree", maxTokens: 100 });
    expect(res.files).toHaveLength(0);
    expect(res.estimatedTokens).toBeGreaterThan(0); // tree 本身
  });
});

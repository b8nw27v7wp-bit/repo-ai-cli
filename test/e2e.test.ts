import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { collectFiles } from "../src/lib/collect-files.js";
import { allocateBudget } from "../src/lib/token-budget.js";
import { buildFileTree } from "../src/lib/file-tree.js";
import { writeOutput } from "../src/lib/output.js";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmp: string;

describe("端到端: 收集 → 预算 → 树 → 输出", () => {
  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-e2e-"));
    await mkdir(path.join(tmp, "src"), { recursive: true });
    await mkdir(path.join(tmp, "node_modules"), { recursive: true });
    await writeFile(path.join(tmp, "src/index.ts"), "export const a = 1;");
    await writeFile(path.join(tmp, "src/util.ts"), "export const b = 2;");
    await writeFile(path.join(tmp, "package.json"), "{}");
    await writeFile(path.join(tmp, "README.md"), "# demo");
    await writeFile(path.join(tmp, "node_modules/x.js"), "ignore");
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("完整管线产出非空结果", async () => {
    const files = await collectFiles(tmp);
    expect(files.length).toBeGreaterThanOrEqual(3);

    const tree = buildFileTree(files.map((f) => f.relPath), "demo");
    const budget = allocateBudget({ files, treeText: tree, maxTokens: 8000 });

    const included = budget.files.filter((f) => f.mode !== "skip");
    expect(included.length).toBe(files.length); // 小仓库全纳入
    expect(budget.treeText).toContain("src/");
    expect(budget.skippedNote).toBeUndefined();
  });

  it("writeOutput 原子写入并可读回", async () => {
    const out = path.join(tmp, "out", "README.md");
    const abs = await writeOutput("# 生成内容", out);
    expect(abs).toBe(path.resolve(out));
    expect(await readFile(abs, "utf8")).toBe("# 生成内容");
  });
});

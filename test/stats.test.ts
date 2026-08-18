import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getRepoStats } from "../src/lib/stats.js";

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-stats-"));
  await mkdir(path.join(tmp, "src"), { recursive: true });
  await writeFile(path.join(tmp, "src", "a.ts"), "export const a = 1;\nexport const b = 2;\n");
  await writeFile(path.join(tmp, "b.py"), "print(1)\n");
  await writeFile(path.join(tmp, "pic.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("getRepoStats", () => {
  it("统计文件数、行数与语言", async () => {
    const stats = await getRepoStats(tmp);
    expect(stats.files).toBe(2); // png 二进制不计入
    expect(stats.lines).toBe(3);
    const byLang = Object.fromEntries(
      stats.languages.map((l) => [l.language, l]),
    );
    expect(byLang["TypeScript"]?.files).toBe(1);
    expect(byLang["TypeScript"]?.lines).toBe(2);
    expect(byLang["Python"]?.files).toBe(1);
    expect(byLang["Python"]?.lines).toBe(1);
  });

  it("按行数降序排列", async () => {
    const stats = await getRepoStats(tmp);
    for (let i = 1; i < stats.languages.length; i++) {
      expect(stats.languages[i]!.lines).toBeLessThanOrEqual(stats.languages[i - 1]!.lines);
    }
  });

  it("非 git 目录无 repo 元信息", async () => {
    const stats = await getRepoStats(tmp);
    expect(stats.repo).toBeUndefined();
  });
});
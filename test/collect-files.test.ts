import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectFiles } from "../src/lib/collect-files.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-test-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function makeTree(files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(tmp, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}

describe("collectFiles", () => {
  it("收集源码文件并跳过 node_modules/锁文件/二进制", async () => {
    await makeTree({
      "src/index.ts": "export const a = 1;",
      "package.json": "{}",
      "node_modules/x/index.js": "ignore me",
      "package-lock.json": "{}",
      "dist/bundle.js": "ignored",
      "logo.png": "\u0000\u0000\u0000",
      "README.md": "# hi",
    });
    const files = await collectFiles(tmp);
    const rels = files.map((f) => f.relPath);
    expect(rels).toContain("src/index.ts");
    expect(rels).toContain("package.json");
    expect(rels).toContain("README.md");
    expect(rels).not.toContain("node_modules/x/index.js");
    expect(rels).not.toContain("package-lock.json");
    expect(rels).not.toContain("dist/bundle.js");
    expect(rels).not.toContain("logo.png");
  });

  it("跳过超过大小上限的文件", async () => {
    await makeTree({
      "big.ts": "x".repeat(200 * 1024),
      "small.ts": "ok",
    });
    const files = await collectFiles(tmp, { maxFileBytes: 100 * 1024 });
    expect(files.map((f) => f.relPath)).toEqual(["small.ts"]);
  });

  it("跳过非白名单扩展名", async () => {
    await makeTree({
      "a.ts": "code",
      "b.unknownext": "code",
      "c.log": "log",
    });
    const files = await collectFiles(tmp);
    expect(files.map((f) => f.relPath)).toEqual(["a.ts"]);
  });

  it("优先级: README/package.json 最高, 入口文件次之, 其余最低", async () => {
    await makeTree({
      "src/util.ts": "x",
      "src/index.ts": "x",
      "README.md": "# r",
      "package.json": "{}",
    });
    const files = await collectFiles(tmp);
    const byPath = new Map(files.map((f) => [f.relPath, f]));
    expect(byPath.get("README.md")!.priority).toBe(1);
    expect(byPath.get("package.json")!.priority).toBe(1);
    expect(byPath.get("src/index.ts")!.priority).toBe(2);
    expect(byPath.get("src/util.ts")!.priority).toBe(3);
  });

  it("非 git 仓库不报错（无 .gitignore 过滤）", async () => {
    await makeTree({ "a.ts": "code" });
    const files = await collectFiles(tmp);
    expect(files).toHaveLength(1);
  });

  it("空目录/全过滤时返回空数组", async () => {
    await makeTree({ "a.png": "\u0000" });
    const files = await collectFiles(tmp);
    expect(files).toHaveLength(0);
  });
});

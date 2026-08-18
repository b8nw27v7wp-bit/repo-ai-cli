import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readDeps } from "../src/lib/deps.js";

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-deps-"));
  await writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({
      name: "demo",
      dependencies: { commander: "^15.0.0", picocolors: "^1.0.0" },
      devDependencies: { vitest: "^4.0.0", typescript: "^6.0.0" },
    }),
  );
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("readDeps (package.json)", () => {
  it("解析 dependencies 与 devDependencies", async () => {
    const info = await readDeps(tmp);
    expect(info.manifest).toBe("package.json");
    expect(info.dependencies).toEqual({ commander: "^15.0.0", picocolors: "^1.0.0" });
    expect(info.devDependencies.vitest).toBe("^4.0.0");
  });
});

describe("readDeps (requirements.txt)", () => {
  it("解析强制版本行", async () => {
    // 单独目录测试，避免与 package.json 冲突
    const tmp2 = await mkdtemp(path.join(os.tmpdir(), "repo-ai-deps2-"));
    await writeFile(
      path.join(tmp2, "requirements.txt"),
      ["# comment", "-r other.txt", "requests==2.28.1", "flask>=2.0", ""].join("\n"),
    );
    try {
      const info = await readDeps(tmp2);
      expect(info.manifest).toBe("requirements.txt");
      expect(info.dependencies.requests).toBe("requests==2.28.1");
      expect(info.dependencies.flask).toBe("flask>=2.0");
    } finally {
      await rm(tmp2, { recursive: true, force: true });
    }
  });

  it("无清单目录抛错", async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), "repo-ai-deps3-"));
    try {
      await expect(readDeps(empty)).rejects.toThrow(/package.json|requirements/);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
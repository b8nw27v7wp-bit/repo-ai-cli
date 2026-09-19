import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseSemver,
  computeNext,
  suggestNextVersion,
  bumpPackageVersion,
} from "../src/lib/version.js";

describe("parseSemver", () => {
  it("解析版本号", () => {
    expect(parseSemver("0.4.0")).toEqual({ major: 0, minor: 4, patch: 0 });
    expect(parseSemver("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("1.2.3-alpha")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("nope")).toBeNull();
  });
});

describe("computeNext", () => {
  it("按级别递增", () => {
    expect(computeNext("0.4.0", "major")).toBe("1.0.0");
    expect(computeNext("0.4.0", "minor")).toBe("0.5.0");
    expect(computeNext("0.4.0", "patch")).toBe("0.4.1");
  });

  it("非法输入回退到 0.0.0 基准", () => {
    expect(computeNext("nope", "patch")).toBe("0.0.1");
  });
});

describe("suggestNextVersion", () => {
  it("fix → patch，feat → minor，breaking → major", () => {
    expect(suggestNextVersion([{ subject: "fix: a" }], "0.4.0").level).toBe("patch");
    expect(suggestNextVersion([{ subject: "feat: b" }], "0.4.0").level).toBe("minor");
    expect(suggestNextVersion([{ subject: "feat!: breaking" }], "0.4.0").level).toBe("major");
    expect(
      suggestNextVersion(
        [{ subject: "chore: x", body: "BREAKING CHANGE: y" }],
        "0.4.0",
      ).level,
    ).toBe("major");
  });

  it("无 feat/fix 时默认 patch", () => {
    const s = suggestNextVersion([{ subject: "docs: update" }], "0.4.0");
    expect(s.level).toBe("patch");
    expect(s.next).toBe("0.4.1");
  });
});

describe("bumpPackageVersion", () => {
  it("更新 package.json 与 lock 版本", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-ver-"));
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", version: "0.4.0" }),
    );
    await writeFile(
      path.join(dir, "package-lock.json"),
      JSON.stringify({ name: "x", version: "0.4.0", packages: { "": { version: "0.4.0" } } }),
    );
    try {
      const res = await bumpPackageVersion(dir, "0.5.0");
      expect(res.packageJson).toBe(true);
      expect(res.lock).toBe(true);
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
      expect(pkg.version).toBe("0.5.0");
      const lock = JSON.parse(await readFile(path.join(dir, "package-lock.json"), "utf8"));
      expect(lock.version).toBe("0.5.0");
      expect(lock.packages[""].version).toBe("0.5.0");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("无清单文件时不抛错，返回 false", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-ver2-"));
    try {
      const res = await bumpPackageVersion(dir, "0.5.0");
      expect(res.packageJson).toBe(false);
      expect(res.lock).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectBadgesContext, renderBadges } from "../src/lib/badges.js";

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-badges-"));
  await writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "demo-pkg", engines: { node: ">=20" } }),
  );
  await writeFile(path.join(tmp, "LICENSE"), "MIT");
  await mkdir(path.join(tmp, ".github", "workflows"), { recursive: true });
  await writeFile(path.join(tmp, ".github", "workflows", "ci.yml"), "on: push");
});
afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("collectBadgesContext", () => {
  it("解析 package.json / LICENSE / CI workflow", async () => {
    const ctx = await collectBadgesContext(tmp);
    expect(ctx.npmName).toBe("demo-pkg");
    expect(ctx.nodeEngine).toBe(">=20");
    expect(ctx.hasLicense).toBe(true);
    expect(ctx.ciWorkflow).toBe("ci.yml");
  });

  it("private 包不生成 npm 徽章", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-badges-priv-"));
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "priv", private: true }),
    );
    const ctx = await collectBadgesContext(dir);
    expect(ctx.npmName).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("renderBadges", () => {
  it("完整上下文生成 CI/npm/license/node/stars 徽章", () => {
    const text = renderBadges({
      owner: "o",
      repo: "r",
      npmName: "demo-pkg",
      hasLicense: true,
      ciWorkflow: "ci.yml",
      nodeEngine: ">=20",
    });
    expect(text).toContain("actions/workflows/ci.yml/badge.svg");
    expect(text).toContain("npm/v/demo-pkg");
    expect(text).toContain("License-MIT");
    expect(text).toContain("Node.js-%3E%3D20");
    expect(text).toContain("github/stars/o/r");
  });

  it("无 GitHub remote 时只生成 npm/license/node 徽章", () => {
    const text = renderBadges({
      owner: null,
      repo: null,
      npmName: "p",
      hasLicense: false,
      ciWorkflow: null,
      nodeEngine: null,
    });
    expect(text).toContain("npm/v/p");
    expect(text).not.toContain("github");
    expect(text).not.toContain("License");
  });

  it("空上下文返回空字符串", () => {
    const text = renderBadges({
      owner: null,
      repo: null,
      npmName: null,
      hasLicense: false,
      ciWorkflow: null,
      nodeEngine: null,
    });
    expect(text).toBe("");
  });
});

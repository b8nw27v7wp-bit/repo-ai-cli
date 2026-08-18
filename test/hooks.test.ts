import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  installHook,
  uninstallHook,
  listHooks,
  HOOK_MARKER,
} from "../src/lib/git-hooks.js";

let repo: string;

function git(args: string[], cwd: string): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args[0]}: ${r.stderr}`);
  return r.stdout;
}

beforeAll(async () => {
  repo = await mkdtemp(path.join(os.tmpdir(), "repo-ai-hooks-"));
  git(["init", "-b", "main"], repo);
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("git hooks", () => {
  it("installHook 写入带 marker 的钩子", async () => {
    const res = await installHook(repo, "prepare-commit-msg");
    const content = await readFile(res.path, "utf8");
    expect(content).toContain(HOOK_MARKER);
    expect(content).toContain("repo-ai-cli commit");
    expect(res.backedUp).toBeUndefined();
  });

  it("覆盖已有用户钩子时备份", async () => {
    const hookPath = path.join(repo, ".git", "hooks", "prepare-commit-msg");
    await writeFile(hookPath, "#!/bin/sh\necho user\n", "utf8");
    const res = await installHook(repo, "prepare-commit-msg");
    expect(res.backedUp).toBe(hookPath + ".bak");
    const bak = await readFile(res.backedUp!, "utf8");
    expect(bak).toContain("echo user");
  });

  it("listHooks 报告状态", async () => {
    const hooks = await listHooks(repo);
    const p = hooks.find((h) => h.name === "prepare-commit-msg");
    expect(p?.installed).toBe(true);
    expect(p?.owned).toBe(true);
  });

  it("uninstallHook 只删除本工具钩子", async () => {
    await installHook(repo, "prepare-commit-msg");
    const res = await uninstallHook(repo, "prepare-commit-msg");
    expect(res.removed).toBe(true);
    const again = await uninstallHook(repo, "prepare-commit-msg");
    expect(again.removed).toBe(false);
  });
});
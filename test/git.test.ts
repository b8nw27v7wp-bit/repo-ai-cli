import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getDiff, assertInGitRepo, GitError } from "../src/lib/git.js";

let repo: string;

function git(args: string[], cwd: string): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args[0]}: ${r.stderr}`);
  return r.stdout;
}

beforeAll(async () => {
  repo = await mkdtemp(path.join(os.tmpdir(), "repo-ai-git-"));
  git(["init", "-b", "main"], repo);
  git(["config", "user.email", "test@test.com"], repo);
  git(["config", "user.name", "test"], repo);
  await writeFile(path.join(repo, "a.ts"), "export const a = 1;\n");
  git(["add", "."], repo);
  git(["commit", "-m", "init"], repo);
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("assertInGitRepo", () => {
  it("在 git 仓库内通过", async () => {
    await expect(assertInGitRepo(repo)).resolves.toBeUndefined();
  });

  it("非 git 仓库抛 GitError", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-nogit-"));
    try {
      await expect(assertInGitRepo(tmp)).rejects.toBeInstanceOf(GitError);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("getDiff", () => {
  it("staged 模式只返回暂存区改动", async () => {
    await writeFile(path.join(repo, "a.ts"), "export const a = 2;\n");
    await writeFile(path.join(repo, "b.ts"), "export const b = 1;\n");
    git(["add", "a.ts"], repo);
    const res = await getDiff(repo, { staged: true });
    expect(res.files).toContain("a.ts");
    expect(res.files).not.toContain("b.ts");
    expect(res.diff).toContain("a.ts");
  });

  it("all 模式包含已跟踪文件的未暂存改动", async () => {
    // b.ts 是 untracked，git diff 不含 untracked；改用已跟踪文件 a.ts 的修改
    await writeFile(path.join(repo, "a.ts"), "export const a = 3;\n");
    const res = await getDiff(repo, { all: true });
    expect(res.files).toContain("a.ts");
    expect(res.diff).toContain("a.ts");
  });

  it("无改动时 diff 为空", async () => {
    git(["add", "."], repo);
    git(["commit", "-m", "second"], repo);
    const res = await getDiff(repo, { staged: true });
    expect(res.diff.trim()).toBe("");
    expect(res.files).toHaveLength(0);
    expect(res.truncated).toBe(false);
  });

  it("超过 maxBytes 时截断并标注", async () => {
    await writeFile(
      path.join(repo, "big.ts"),
      Array.from({ length: 2000 }, (_, i) => `line ${i} ${"x".repeat(80)}`).join(
        "\n",
      ),
    );
    git(["add", "big.ts"], repo);
    const res = await getDiff(repo, { staged: true, maxBytes: 1024 });
    expect(res.truncated).toBe(true);
    expect(res.diff).toContain("[diff truncated");
  });
});

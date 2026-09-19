import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getDiff, getLog, assertInGitRepo, GitError, detectBaseBranch, getBranchDiff, getCurrentBranch, getLatestTag, tagExists } from "../src/lib/git.js";

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

describe("getLog", () => {
  it("返回按时间倒序的 commit 列表", async () => {
    const log = await getLog(repo, { max: 50 });
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0]?.subject).toBeTruthy();
    expect(log[0]?.shortHash).toMatch(/^[0-9a-f]{7}$/);
    expect(log[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(log[0]?.author).toBeTruthy();
  });

  it("range 区间过滤生效", async () => {
    const all = await getLog(repo, { max: 50 });
    const oldest = all[all.length - 1];
    expect(oldest).toBeDefined();
    const afterOldest = await getLog(repo, { range: `${oldest!.shortHash}..` });
    expect(afterOldest.length).toBe(all.length - 1);
    expect(afterOldest.some((c) => c.hash === oldest!.hash)).toBe(false);
  });

  it("subject 来自 commit message 首行", async () => {
    const log = await getLog(repo, { max: 50 });
    expect(log[log.length - 1]?.subject).toContain("init");
  });
});

describe("分支助手", () => {
  it("detectBaseBranch 无远程时回退到本地 main", async () => {
    await expect(detectBaseBranch(repo)).resolves.toEqual(
      expect.stringMatching(/^(main|master)$/),
    );
  });

  it("getCurrentBranch 返回当前分支", async () => {
    await expect(getCurrentBranch(repo)).resolves.toMatch(/^(main|master)$/);
  });

  it("getBranchDiff 对 main...HEAD 返回空 diff（无分叉）", async () => {
    const base = await detectBaseBranch(repo);
    const res = await getBranchDiff(repo, { base });
    expect(res.diff.trim()).toBe("");
    expect(res.files).toHaveLength(0);
    expect(res.truncated).toBe(false);
  });

  it("getLatestTag 无 tag 返回空串", async () => {
    await expect(getLatestTag(repo)).resolves.toBe("");
  });

  it("getDiff --all 纳入 untracked 新文件", async () => {
    await writeFile(path.join(repo, "untracked-xyz.txt"), "const secret = 1;\n");
    try {
      const res = await getDiff(repo, { all: true });
      expect(res.files).toContain("untracked-xyz.txt");
      expect(res.diff).toContain("new file mode 100644");
      expect(res.diff).toContain("+const secret = 1;");
    } finally {
      await rm(path.join(repo, "untracked-xyz.txt"), { force: true });
    }
  });

  it("getDiff staged 模式不含 untracked 文件", async () => {
    await writeFile(path.join(repo, "untracked-yzx.txt"), "x = 1;\n");
    try {
      const res = await getDiff(repo, { staged: true });
      expect(res.files).not.toContain("untracked-yzx.txt");
    } finally {
      await rm(path.join(repo, "untracked-yzx.txt"), { force: true });
    }
  });
});

describe("getDiff 统一预算", () => {
  let r2: string;

  beforeAll(async () => {
    r2 = await mkdtemp(path.join(os.tmpdir(), "repo-ai-budget-"));
    git(["init", "-b", "main"], r2);
    git(["config", "user.email", "test@test.com"], r2);
    git(["config", "user.name", "test"], r2);
    await writeFile(path.join(r2, "a.ts"), "export const a = 1;\n");
    git(["add", "."], r2);
    git(["commit", "-m", "init"], r2);
  });

  afterAll(async () => {
    await rm(r2, { recursive: true, force: true });
  });

  it("tracked 占满后不再追加 untracked，并标记截断", async () => {
    await writeFile(
      path.join(r2, "a.ts"),
      Array.from({ length: 100 }, (_, i) => `export const a${i} = ${i};`).join("\n") + "\n",
    );
    await writeFile(path.join(r2, "big-untracked.txt"), `${"y".repeat(5000)}\n`);
    try {
      const res = await getDiff(r2, { all: true, maxBytes: 128 });
      expect(res.truncated).toBe(true);
      expect(res.files).not.toContain("big-untracked.txt");
      // 输出总量受预算约束（含截断标注开销），远小于旧逻辑的 2 倍预算
      expect(Buffer.byteLength(res.diff, "utf8")).toBeLessThan(128 * 4);
    } finally {
      await rm(path.join(r2, "big-untracked.txt"), { force: true });
      await writeFile(path.join(r2, "a.ts"), "export const a = 1;\n");
    }
  });

  it("tracked 未占满时 untracked 正常追加", async () => {
    await writeFile(path.join(r2, "small-untracked.txt"), "hello\n");
    try {
      const res = await getDiff(r2, { all: true });
      expect(res.files).toContain("small-untracked.txt");
      expect(res.diff).toContain("new file mode 100644");
      expect(res.truncated).toBe(false);
    } finally {
      await rm(path.join(r2, "small-untracked.txt"), { force: true });
    }
  });
});

describe("tagExists", () => {
  it("存在的 tag 返回 true，不存在的返回 false", async () => {
    const r3 = await mkdtemp(path.join(os.tmpdir(), "repo-ai-tag-"));
    try {
      git(["init", "-b", "main"], r3);
      git(["config", "user.email", "test@test.com"], r3);
      git(["config", "user.name", "test"], r3);
      await writeFile(path.join(r3, "a.txt"), "x\n");
      git(["add", "."], r3);
      git(["commit", "-m", "init"], r3);
      await expect(tagExists(r3, "v9.9.9")).resolves.toBe(false);
      git(["tag", "v9.9.9"], r3);
      await expect(tagExists(r3, "v9.9.9")).resolves.toBe(true);
    } finally {
      await rm(r3, { recursive: true, force: true });
    }
  });
});

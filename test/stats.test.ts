import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getRepoStats } from "../src/lib/stats.js";
import { getRepoMeta } from "../src/lib/git.js";

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

// —— getRepoMeta --since：按时间窗口统计提交与贡献者（本地临时 git 仓库） ——

let gitRepo: string;

function git(args: string[], cwd: string, env: Record<string, string> = {}): string {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

async function commitAt(file: string, msg: string, date: string): Promise<void> {
  await writeFile(path.join(gitRepo, file), "x\n");
  git(["add", "."], gitRepo);
  git(["commit", "-m", msg], gitRepo, {
    GIT_AUTHOR_DATE: `${date}T12:00:00+08:00`,
    GIT_COMMITTER_DATE: `${date}T12:00:00+08:00`,
  });
}

beforeAll(async () => {
  gitRepo = await mkdtemp(path.join(os.tmpdir(), "repo-ai-since-"));
  git(["init", "-b", "main"], gitRepo);
  git(["config", "user.email", "test@test.com"], gitRepo);
  git(["config", "user.name", "alice"], gitRepo);
  await commitAt("a.txt", "first", "2026-01-10");
  await commitAt("b.txt", "second", "2026-03-15");
  git(["config", "user.name", "bob"], gitRepo);
  await commitAt("c.txt", "third", "2026-06-20");
});

afterAll(async () => {
  await rm(gitRepo, { recursive: true, force: true });
});

describe("getRepoMeta --since", () => {
  it("缺省统计全部历史", async () => {
    const m = await getRepoMeta(gitRepo);
    expect(m.commitCount).toBe(3);
    expect(m.authorCount).toBe(2);
    expect(m.firstCommitDate).toBe("2026-01-10");
    expect(m.lastCommitDate).toBe("2026-06-20");
    expect(m.since).toBeUndefined();
  });

  it("since 只统计窗口内提交与贡献者，并回显窗口", async () => {
    const m = await getRepoMeta(gitRepo, { since: "2026-05-01" });
    expect(m.commitCount).toBe(1);
    expect(m.authorCount).toBe(1);
    expect(m.firstCommitDate).toBe("2026-06-20");
    expect(m.lastCommitDate).toBe("2026-06-20");
    expect(m.since).toBe("2026-05-01");
  });

  it("since 早于全部提交时统计不受影响", async () => {
    const m = await getRepoMeta(gitRepo, { since: "2020-01-01" });
    expect(m.commitCount).toBe(3);
    expect(m.authorCount).toBe(2);
  });

  it("窗口内两位贡献者都在时 authorCount 为 2", async () => {
    // 2026-02-01 起：alice 的 second + bob 的 third，共 2 条、2 位贡献者
    const m = await getRepoMeta(gitRepo, { since: "2026-02-01" });
    expect(m.commitCount).toBe(2);
    expect(m.authorCount).toBe(2);
  });

  it("getRepoStats 透传 since 到 git 元信息", async () => {
    const s = await getRepoStats(gitRepo, { since: "2026-05-01" });
    expect(s.repo?.commitCount).toBe(1);
    expect(s.repo?.authorCount).toBe(1);
    expect(s.repo?.since).toBe("2026-05-01");
    // 文件/行数统计不受 since 影响
    expect(s.files).toBe(3);
  });

  it("getRepoStats 缺省行为不变（不带 since 字段）", async () => {
    const s = await getRepoStats(gitRepo);
    expect(s.repo?.commitCount).toBe(3);
    expect(s.repo?.since).toBeUndefined();
  });
});
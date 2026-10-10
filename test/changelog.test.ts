import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getLog, type CommitEntry } from "../src/lib/git.js";
import { buildChangelogPrompt } from "../src/prompts/changelog.js";
import { renderCompactChangelog } from "../src/lib/changelog-compact.js";
import { runChangelog } from "../src/commands/changelog.js";
import { setJsonMode } from "../src/lib/ui.js";

const sampleCommits: CommitEntry[] = [
  {
    hash: "a".repeat(40),
    shortHash: "aaaaaaa",
    author: "alice",
    date: "2026-07-30",
    subject: "feat: add config persistence",
    body: "add ~/.repo-ai/config.json read/write with atomic rename",
  },
  {
    hash: "b".repeat(40),
    shortHash: "bbbbbbb",
    author: "bob",
    date: "2026-07-31",
    subject: "fix: handle empty diff in commit command",
    body: "",
  },
  {
    hash: "c".repeat(40),
    shortHash: "ccccccc",
    author: "alice",
    date: "2026-08-01",
    subject: "chore: bump dependencies",
    body: "",
  },
];

describe("buildChangelogPrompt", () => {
  it("包含区间、commit 数量与全部 subject", () => {
    const messages = buildChangelogPrompt({
      repoName: "demo",
      commits: sampleCommits,
      rangeLabel: "v0.1.0..",
      language: "zh",
    });
    expect(messages).toHaveLength(2);
    const user = messages[1]?.content ?? "";
    expect(user).toContain("v0.1.0..");
    expect(user).toContain("3 条 commit");
    expect(user).toContain("feat: add config persistence");
    expect(user).toContain("fix: handle empty diff in commit command");
  });

  it("包含 commit 正文（供 AI 参考）", () => {
    const messages = buildChangelogPrompt({
      repoName: "demo",
      commits: sampleCommits,
      rangeLabel: "v0.1.0..",
      language: "en",
    });
    const user = messages[1]?.content ?? "";
    expect(user).toContain("atomic rename");
  });

  it("语言规则正确注入", () => {
    const zh = buildChangelogPrompt({
      repoName: "demo",
      commits: sampleCommits,
      rangeLabel: "x",
      language: "zh",
    });
    expect(zh[0]?.content).toContain("中文");

    const en = buildChangelogPrompt({
      repoName: "demo",
      commits: sampleCommits,
      rangeLabel: "x",
      language: "en",
    });
    expect(en[0]?.content).toContain("英文");
  });

  it("现有 CHANGELOG 开头被传入作衔接", () => {
    const messages = buildChangelogPrompt({
      repoName: "demo",
      commits: sampleCommits,
      rangeLabel: "v0.1.0..",
      language: "zh",
      existingHeader: "# demo\n\n## 0.1.0\n\n- init",
    });
    expect(messages[1]?.content).toContain("# demo");
    expect(messages[1]?.content).toContain("不要重复现有内容");
  });

  it("默认格式仍为 Keep a Changelog 风格（不因 --format 扩充而改变）", () => {
    const messages = buildChangelogPrompt({
      repoName: "demo",
      commits: sampleCommits,
      rangeLabel: "v0.1.0..",
      language: "zh",
    });
    expect(messages[0]?.content).toContain("Keep a Changelog");
    expect(messages[1]?.content).toContain("### Added");
  });
});

describe("getLog", () => {
  it("在非 git 目录抛错", async () => {
    await expect(getLog(process.cwd() === "/" ? "/" : "/nonexistent-xyz", {}))
      .rejects.toThrow();
  });
});

describe("renderCompactChangelog", () => {
  it("每条 commit 一行，含日期/hash/subject/作者，顺序与输入一致", () => {
    const out = renderCompactChangelog("demo", sampleCommits);
    expect(out).toContain("# demo CHANGELOG (compact)");
    const rows = out.split("\n").filter((l) => l.startsWith("- "));
    expect(rows).toHaveLength(sampleCommits.length);
    for (const c of sampleCommits) {
      expect(out).toContain(c.date);
      expect(out).toContain(`\`${c.shortHash}\``);
      expect(out).toContain(c.subject);
      expect(out).toContain(`(${c.author})`);
    }
    // 输入顺序 = git log 新到旧，渲染不重排
    expect(out.indexOf(sampleCommits[0]!.shortHash)).toBeLessThan(
      out.indexOf(sampleCommits[1]!.shortHash),
    );
  });

  it("不出现 Keep a Changelog 分节标题（compact 语义）", () => {
    const out = renderCompactChangelog("demo", sampleCommits);
    expect(out).not.toContain("### Added");
    expect(out).not.toContain("### Fixed");
  });
});

// —— 命令级：--format 在真实本地 git 仓库上的行为（全程离线） ——

let tmpRepo: string;
const origCwd = process.cwd();

function git(args: string[], cwd: string, env: Record<string, string> = {}): string {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

beforeAll(async () => {
  tmpRepo = await mkdtemp(path.join(os.tmpdir(), "repo-ai-changelog-cmd-"));
  git(["init", "-b", "main"], tmpRepo);
  git(["config", "user.email", "test@test.com"], tmpRepo);
  git(["config", "user.name", "alice"], tmpRepo);
  await writeFile(path.join(tmpRepo, "a.txt"), "a\n");
  git(["add", "."], tmpRepo);
  git(["commit", "-m", "feat: add first feature"], tmpRepo, {
    GIT_AUTHOR_DATE: "2026-07-30T10:00:00+08:00",
    GIT_COMMITTER_DATE: "2026-07-30T10:00:00+08:00",
  });
  await writeFile(path.join(tmpRepo, "b.txt"), "b\n");
  git(["add", "."], tmpRepo);
  git(["commit", "-m", "fix: handle empty diff"], tmpRepo, {
    GIT_AUTHOR_DATE: "2026-07-31T10:00:00+08:00",
    GIT_COMMITTER_DATE: "2026-07-31T10:00:00+08:00",
  });
  git(["config", "user.name", "bob"], tmpRepo);
  await writeFile(path.join(tmpRepo, "c.txt"), "c\n");
  git(["add", "."], tmpRepo);
  git(["commit", "-m", "chore: bump deps"], tmpRepo, {
    GIT_AUTHOR_DATE: "2026-08-01T10:00:00+08:00",
    GIT_COMMITTER_DATE: "2026-08-01T10:00:00+08:00",
  });
});

afterAll(async () => {
  process.chdir(origCwd);
  await rm(tmpRepo, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("runChangelog --format", () => {
  it("compact + --print --json：本地渲染全部 commit，不调用 LLM", async () => {
    process.chdir(tmpRepo);
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(" "));
    });
    await runChangelog({
      language: "zh",
      format: "compact",
      print: true,
      json: true,
    });
    expect(out).toHaveLength(1);
    const body = JSON.parse(out[0]!) as { ok: boolean; format: string; content: string };
    expect(body.ok).toBe(true);
    expect(body.format).toBe("compact");
    expect(body.content).toContain("feat: add first feature");
    expect(body.content).toContain("fix: handle empty diff");
    expect(body.content).toContain("chore: bump deps");
    expect(body.content).toContain("CHANGELOG (compact)");
    expect(body.content).not.toContain("### Added");
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("compact 写文件：落盘内容为 compact 快照", async () => {
    process.chdir(tmpRepo);
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(" "));
    });
    const target = path.join(tmpRepo, "CHANGELOG.md");
    await runChangelog({
      language: "zh",
      format: "compact",
      output: "CHANGELOG.md",
      json: true,
    });
    const body = JSON.parse(out[0]!) as { ok: boolean; format: string; output: string };
    expect(body.ok).toBe(true);
    expect(body.format).toBe("compact");
    const { readFile } = await import("node:fs/promises");
    const written = await readFile(target, "utf8");
    expect(written).toContain("CHANGELOG (compact)");
    expect(written).toContain("chore: bump deps");
  });

  it("默认格式（未传 --format）dry-run：仍是既有行为，JSON 带 format=keep-a-changelog", async () => {
    process.chdir(tmpRepo);
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(" "));
    });
    await runChangelog({ language: "zh", dryRun: true, json: true });
    const body = JSON.parse(out[0]!) as {
      ok: boolean;
      dryRun: boolean;
      format: string;
      commits: number;
    };
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.format).toBe("keep-a-changelog");
    expect(body.commits).toBe(3);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("非法 format 报错并置退出码 1", async () => {
    process.chdir(tmpRepo);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runChangelog({ language: "zh", format: "markdown", dryRun: true });
    expect(process.exitCode).toBe(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("未知 format"));
  });

  it("非法 format 时不启动进度条（不得报错后又打一行进度输出）", async () => {
    process.chdir(tmpRepo);
    // 回归守门：parseEnum 必须在 progress() 之前，否则非法参数也会先打 "读取 git log..."
    // 注意两点，缺一个都会让断言空转（假绿）：
    // 1. jsonMode 是模块级状态，别的用例设过 true 不会复位 → 必须显式置 false，
    //    否则 ui.ts 里进度输出被 if (!jsonMode) 短路，这里永远收不到任何行
    // 2. 非 TTY 下 progress 走 console.error（lib/ui.ts:85），监听 error 通道
    setJsonMode(false);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runChangelog({ language: "zh", format: "markdown", dryRun: true });
    const lines = err.mock.calls.map((c) => String(c[0]));
    // 对照组：报错本身必须出现过（证明通道监听是有效的，不是空数据）
    expect(lines.some((l) => l.includes("未知 format"))).toBe(true);
    // 断言目标：进度行不得出现
    expect(lines.filter((l) => l.includes("读取 git log"))).toEqual([]);
    err.mockRestore();
  });
});

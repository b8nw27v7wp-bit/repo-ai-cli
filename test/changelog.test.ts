import { describe, it, expect } from "vitest";
import { getLog, type CommitEntry } from "../src/lib/git.js";
import { buildChangelogPrompt } from "../src/prompts/changelog.js";

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
});

describe("getLog", () => {
  it("在非 git 目录抛错", async () => {
    await expect(getLog(process.cwd() === "/" ? "/" : "/nonexistent-xyz", {}))
      .rejects.toThrow();
  });
});

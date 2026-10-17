import { describe, it, expect, vi, afterEach } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommit } from "../src/commands/commit.js";
import type { CommitOptions } from "../src/types.js";
import {
  TEST_KEY,
  captureStdio,
  git,
  inDir,
  makeGitRepo,
  makePlainDir,
  soleJson,
  stubLlm,
  stubLlmHttpError,
  type TempRepo,
} from "./helpers/command-harness.js";

const ORIGINAL_EXIT_CODE = process.exitCode;
const cleanup: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.exitCode = ORIGINAL_EXIT_CODE;
  // Windows 上目录被占用时 rmdir 会 EBUSY（用例超时中断时尤甚）；清理失败不该让用例变红
  for (const dir of cleanup.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

function baseOptions(overrides: Partial<CommitOptions> = {}): CommitOptions {
  return {
    staged: true,
    maxDiffKb: 200,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

/** 造一个含暂存改动的仓库 */
async function repoWithStagedChange(): Promise<TempRepo> {
  const repo = await makeGitRepo("repo-ai-commit-");
  cleanup.push(repo.dir);
  await writeFile(path.join(repo.dir, "a.ts"), "export const a = 2;\n");
  git(["add", "a.ts"], repo.dir);
  return repo;
}

describe("commit 命令: 前置校验", () => {
  it("非 git 仓库直接失败、退出码 1，且不调用 LLM", async () => {
    const dir = await makePlainDir();
    cleanup.push(dir);
    const fetchMock = stubLlm("feat: x");
    const { stderr } = captureStdio();

    await inDir(dir, () => runCommit(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("git");
  });

  it("暂存区为空时失败并提示 git add，且不调用 LLM", async () => {
    const repo = await makeGitRepo("repo-ai-commit-empty-");
    cleanup.push(repo.dir);
    const fetchMock = stubLlm("feat: x");
    const { stderr } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("git add");
  });
});

describe("commit 命令: 输出契约", () => {
  it("--print 把 message 打到 stdout，并剥掉代码块围栏与引号", async () => {
    const repo = await repoWithStagedChange();
    stubLlm('```\n"feat: add thing"\n```');
    const { stdout, stderr } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions({ print: true })));

    expect(stdout.join("\n").trim()).toBe("feat: add thing");
    expect(stderr.join("\n")).not.toContain("feat: add thing");
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON，进度与告警不泄漏", async () => {
    const repo = await repoWithStagedChange();
    stubLlm("feat: add thing");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions({ json: true })));

    const body = soleJson<{ ok: boolean; message: string }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.message).toBe("feat: add thing");
  });

  it("--json 带上 token 用量，且不往 stderr 打汇总行", async () => {
    const repo = await repoWithStagedChange();
    stubLlm("feat: add thing", {
      prompt_tokens: 900,
      completion_tokens: 20,
      total_tokens: 920,
    });
    const { stdout, stderr } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions({ json: true })));

    const body = soleJson<{
      usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    }>(stdout);
    expect(body.usage).toEqual({
      promptTokens: 900,
      completionTokens: 20,
      totalTokens: 920,
    });
    expect(stderr.join("\n")).not.toContain("token 用量");
  });

  it("provider 未返回 usage 时给出 usage: null，而不是猜 0", async () => {
    const repo = await repoWithStagedChange();
    stubLlm("feat: add thing");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions({ json: true })));

    const body = soleJson<{ usage: null }>(stdout);
    expect(body.usage).toBeNull();
  });

  it("非 JSON 模式把用量汇总打到 stderr，stdout 只留 message", async () => {
    const repo = await repoWithStagedChange();
    stubLlm("feat: add thing", { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 });
    const { stdout, stderr } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions({ print: true })));

    expect(stdout.join("\n").trim()).toBe("feat: add thing");
    expect(stderr.join("\n")).toContain("token 用量: 输入 5 / 输出 6 / 合计 11");
  });

  it("非 TTY 且未加 --print 时仍只打印 message（便于管道）", async () => {
    const repo = await repoWithStagedChange();
    stubLlm("fix: handle empty diff");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions()));

    expect(stdout.join("\n").trim()).toBe("fix: handle empty diff");
    expect(process.exitCode).not.toBe(1);
  });
});

describe("commit 命令: 失败路径", () => {
  it("LLM 报错时退出码 1 且 stdout 无产物", async () => {
    const repo = await repoWithStagedChange();
    stubLlmHttpError(400, "model not found");
    const { stdout, stderr } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions({ print: true })));

    expect(process.exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr.join("\n")).toContain("model not found");
  });

  it("--json 下 LLM 失败输出 {ok:false} 且退出码 1", async () => {
    const repo = await repoWithStagedChange();
    stubLlmHttpError(400, "model not found");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions({ json: true })));

    expect(process.exitCode).toBe(1);
    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("model not found");
  });

  it("AI 只返回一对空代码块围栏时失败，不打印空 message", async () => {
    // 走的是 cleanMessage 剥壳后变空的分支：这属于命令层逻辑，
    // 与 llm.ts 的 empty-response 重试是两回事（后者已由 test/llm.test.ts 覆盖）
    const repo = await repoWithStagedChange();
    stubLlm("```\n```");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runCommit(baseOptions({ print: true })));

    expect(process.exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runPr } from "../src/commands/pr.js";
import type { PrOptions } from "../src/types.js";
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
  for (const dir of cleanup.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

/** 造一个「main 上有提交、当前在 feat 分支上有额外提交」的仓库 */
async function repoOnFeatureBranch(): Promise<TempRepo> {
  const repo = await makeGitRepo("repo-ai-pr-");
  cleanup.push(repo.dir);
  git(["checkout", "-b", "feat/add-config"], repo.dir);
  await writeFile(path.join(repo.dir, "b.ts"), "export const b = 1;\n");
  git(["add", "b.ts"], repo.dir);
  git(["commit", "-m", "feat: add b"], repo.dir);
  return repo;
}

function baseOptions(overrides: Partial<PrOptions> = {}): PrOptions {
  return {
    base: "main",
    maxDiffKb: 200,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

describe("pr 命令: 前置校验", () => {
  it("非 git 仓库直接失败、退出码 1，且不调用 LLM", async () => {
    const dir = await makePlainDir();
    cleanup.push(dir);
    const fetchMock = stubLlm("## 标题");
    captureStdio();

    await inDir(dir, () => runPr(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("当前分支与 base 无差异时失败并说明原因，且不调用 LLM", async () => {
    const repo = await makeGitRepo("repo-ai-pr-same-");
    cleanup.push(repo.dir);
    const fetchMock = stubLlm("## 标题");
    const { stderr } = captureStdio();

    await inDir(repo.dir, () => runPr(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("无差异");
  });

  it("base 分支不存在时失败、退出码 1，且不调用 LLM", async () => {
    const repo = await repoOnFeatureBranch();
    const fetchMock = stubLlm("## 标题");
    captureStdio();

    await inDir(repo.dir, () => runPr(baseOptions({ base: "no-such-branch" })));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pr 命令: 输出契约", () => {
  it("默认把标题与描述打到 stdout", async () => {
    const repo = await repoOnFeatureBranch();
    stubLlm("feat: 新增 b\n\n## 变更\n\n- 新增 b.ts\n");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runPr(baseOptions()));

    const printed = stdout.join("\n");
    expect(printed).toContain("feat: 新增 b");
    expect(printed).toContain("新增 b.ts");
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON，含 base/branch/title/body/files", async () => {
    const repo = await repoOnFeatureBranch();
    stubLlm("feat: 新增 b\n\n## 变更\n\n- 新增 b.ts\n");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runPr(baseOptions({ json: true })));

    const body = soleJson<{
      ok: boolean;
      base: string;
      branch: string;
      title: string;
      body: string;
      files: string[];
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.base).toBe("main");
    expect(body.branch).toBe("feat/add-config");
    expect(body.title).toBe("feat: 新增 b");
    expect(body.body).toContain("新增 b.ts");
    expect(body.files).toContain("b.ts");
  });
});

describe("pr 命令: 失败路径", () => {
  it("LLM 报错时退出码 1 且 stdout 无产物", async () => {
    const repo = await repoOnFeatureBranch();
    stubLlmHttpError(400, "unsupported model");
    const { stdout, stderr } = captureStdio();

    await inDir(repo.dir, () => runPr(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr.join("\n")).toContain("unsupported model");
  });

  it("--json 下 LLM 失败输出 {ok:false} 且退出码 1", async () => {
    const repo = await repoOnFeatureBranch();
    stubLlmHttpError(400, "boom");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runPr(baseOptions({ json: true })));

    expect(process.exitCode).toBe(1);
    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("boom");
  });
});

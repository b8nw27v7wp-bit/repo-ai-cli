import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { runReview } from "../src/commands/review.js";
import type { ReviewOptions } from "../src/types.js";
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

function baseOptions(overrides: Partial<ReviewOptions> = {}): ReviewOptions {
  return {
    staged: true,
    maxDiffKb: 200,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

async function repoWithStagedChange(): Promise<TempRepo> {
  const repo = await makeGitRepo("repo-ai-review-");
  cleanup.push(repo.dir);
  await writeFile(path.join(repo.dir, "a.ts"), "export const a = 2;\n");
  git(["add", "a.ts"], repo.dir);
  return repo;
}

describe("review 命令: 前置校验", () => {
  it("非 git 仓库直接失败、退出码 1，且不调用 LLM", async () => {
    const dir = await makePlainDir();
    cleanup.push(dir);
    const fetchMock = stubLlm("## 审查");
    captureStdio();

    await inDir(dir, () => runReview(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("暂存区为空时失败并给出可行动作，且不调用 LLM", async () => {
    const repo = await makeGitRepo("repo-ai-review-empty-");
    cleanup.push(repo.dir);
    const fetchMock = stubLlm("## 审查");
    const { stderr } = captureStdio();

    await inDir(repo.dir, () => runReview(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("git add");
  });

  it("非法 --focus 报错、退出码 1，且不调用 LLM", async () => {
    const repo = await repoWithStagedChange();
    const fetchMock = stubLlm("## 审查");
    const { stderr } = captureStdio();

    await inDir(repo.dir, () => runReview(baseOptions({ focus: "banana" })));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const printed = stderr.join("\n");
    expect(printed).toContain("banana");
    expect(printed).toContain("bugs");
  });
});

describe("review 命令: 输出契约", () => {
  it("默认把审查报告打到 stdout", async () => {
    const repo = await repoWithStagedChange();
    stubLlm("## 🔴 Critical\n\n- 空指针");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runReview(baseOptions()));

    expect(stdout.join("\n")).toContain("Critical");
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON，含 review/files/truncated", async () => {
    const repo = await repoWithStagedChange();
    stubLlm("## 审查结论");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runReview(baseOptions({ json: true })));

    const body = soleJson<{
      ok: boolean;
      review: string;
      files: string[];
      truncated: boolean;
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.review).toBe("## 审查结论");
    expect(body.files).toContain("a.ts");
    expect(body.truncated).toBe(false);
  });

  it("-o 把报告写到指定路径（而非 stdout）", async () => {
    const repo = await repoWithStagedChange();
    const out = path.join(repo.dir, "nested", "review.md");
    stubLlm("## 审查结论");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runReview(baseOptions({ output: out })));

    expect(await readFile(out, "utf8")).toContain("审查结论");
    expect(stdout.join("\n")).not.toContain("审查结论");
  });
});

describe("review 命令: 失败路径", () => {
  it("LLM 报错时退出码 1，且不写半成品文件", async () => {
    const repo = await repoWithStagedChange();
    const out = path.join(repo.dir, "review.md");
    stubLlmHttpError(400, "invalid api key format");
    const { stderr } = captureStdio();

    await inDir(repo.dir, () => runReview(baseOptions({ output: out })));

    expect(process.exitCode).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(stderr.join("\n")).toContain("invalid api key format");
  });

  it("--json 下 LLM 失败输出 {ok:false} 且退出码 1", async () => {
    const repo = await repoWithStagedChange();
    stubLlmHttpError(400, "boom");
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runReview(baseOptions({ json: true })));

    expect(process.exitCode).toBe(1);
    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("boom");
  });
});

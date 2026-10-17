import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runExplain } from "../src/commands/explain.js";
import type { ExplainOptions } from "../src/types.js";
import {
  TEST_KEY,
  captureStdio,
  inDir,
  soleJson,
  stubLlm,
  stubLlmHttpError,
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

/** 造一个 100 行的源文件，方便验证区域聚焦 */
async function makeSourceFile(lines = 100): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-explain-"));
  cleanup.push(dir);
  const body = Array.from({ length: lines }, (_, i) => `const v${i + 1} = ${i + 1};`).join("\n");
  await writeFile(path.join(dir, "sample.ts"), body + "\n");
  return dir;
}

function baseOptions(target: string, overrides: Partial<ExplainOptions> = {}): ExplainOptions {
  return {
    target,
    language: "zh",
    maxFileKb: 200,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

describe("explain 命令: 前置校验", () => {
  it("文件不存在时失败、退出码 1，且不调用 LLM", async () => {
    const dir = await makeSourceFile();
    const fetchMock = stubLlm("解释");
    const { stderr } = captureStdio();

    await inDir(dir, () => runExplain(baseOptions("nope.ts")));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("无法读取文件");
  });

  it("非法 --language 报错、退出码 1，且不调用 LLM", async () => {
    const dir = await makeSourceFile();
    const fetchMock = stubLlm("解释");
    const { stderr } = captureStdio();

    await inDir(dir, () =>
      runExplain(baseOptions("sample.ts", { language: "fr" as ExplainOptions["language"] })),
    );

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const printed = stderr.join("\n");
    expect(printed).toContain("fr");
    expect(printed).toContain("bilingual");
  });
});

describe("explain 命令: 目标解析", () => {
  it("file:start-end 把 focus 记为行区间", async () => {
    const dir = await makeSourceFile();
    stubLlm("这段代码在初始化常量。");
    const { stdout } = captureStdio();

    await inDir(dir, () => runExplain(baseOptions("sample.ts:10-40", { json: true })));

    const body = soleJson<{ focus: string; file: string }>(stdout);
    expect(body.focus).toBe("第 10-40 行");
    expect(body.file).toBe("sample.ts");
  });

  it("file#symbol 把 symbol 透传到输出", async () => {
    const dir = await makeSourceFile();
    stubLlm("该函数负责……");
    const { stdout } = captureStdio();

    await inDir(dir, () => runExplain(baseOptions("sample.ts#parseTarget", { json: true })));

    const body = soleJson<{ symbol: string; focus: null }>(stdout);
    expect(body.symbol).toBe("parseTarget");
    expect(body.focus).toBeNull();
  });
});

describe("explain 命令: 输出契约", () => {
  it("默认把解释打到 stdout", async () => {
    const dir = await makeSourceFile();
    stubLlm("这是一个常量文件。");
    const { stdout } = captureStdio();

    await inDir(dir, () => runExplain(baseOptions("sample.ts")));

    expect(stdout.join("\n")).toContain("这是一个常量文件。");
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON", async () => {
    const dir = await makeSourceFile();
    stubLlm("解释内容");
    const { stdout } = captureStdio();

    await inDir(dir, () => runExplain(baseOptions("sample.ts", { json: true })));

    const body = soleJson<{ ok: boolean; explanation: string }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.explanation).toBe("解释内容");
  });
});

describe("explain 命令: 失败路径", () => {
  it("LLM 报错时退出码 1 且 stdout 无产物", async () => {
    const dir = await makeSourceFile();
    stubLlmHttpError(400, "context length exceeded");
    const { stdout, stderr } = captureStdio();

    await inDir(dir, () => runExplain(baseOptions("sample.ts")));

    expect(process.exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr.join("\n")).toContain("context length exceeded");
  });

  it("--json 下 LLM 失败输出 {ok:false} 且退出码 1", async () => {
    const dir = await makeSourceFile();
    stubLlmHttpError(400, "boom");
    const { stdout } = captureStdio();

    await inDir(dir, () => runExplain(baseOptions("sample.ts", { json: true })));

    expect(process.exitCode).toBe(1);
    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("boom");
  });
});

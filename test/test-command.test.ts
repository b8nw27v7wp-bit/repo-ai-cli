import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runTest } from "../src/commands/test.js";
import type { TestOptions } from "../src/types.js";
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

async function makeSource(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-testcmd-"));
  cleanup.push(dir);
  await writeFile(path.join(dir, "util.ts"), "export const add = (a: number, b: number) => a + b;\n");
  return dir;
}

function baseOptions(file: string, overrides: Partial<TestOptions> = {}): TestOptions {
  return {
    file,
    framework: "vitest",
    maxFileKb: 200,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

describe("test 命令: 前置校验", () => {
  it("未知 --framework 报错、退出码 1，且不调用 LLM", async () => {
    const dir = await makeSource();
    const fetchMock = stubLlm("it('x', () => {});");
    const { stderr } = captureStdio();

    await inDir(dir, () => runTest(baseOptions("util.ts", { framework: "mocha" })));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const printed = stderr.join("\n");
    expect(printed).toContain("mocha");
    expect(printed).toContain("vitest");
  });

  it("文件不存在时失败、退出码 1，且不调用 LLM", async () => {
    const dir = await makeSource();
    const fetchMock = stubLlm("it('x', () => {});");
    const { stderr } = captureStdio();

    await inDir(dir, () => runTest(baseOptions("missing.ts")));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("无法读取文件");
  });
});

describe("test 命令: 输出契约", () => {
  it("默认把测试代码打到 stdout", async () => {
    const dir = await makeSource();
    stubLlm("import { it } from 'vitest';");
    const { stdout } = captureStdio();

    await inDir(dir, () => runTest(baseOptions("util.ts")));

    expect(stdout.join("\n")).toContain("import { it }");
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON，含 framework 与 content", async () => {
    const dir = await makeSource();
    stubLlm("it('adds', () => {});");
    const { stdout } = captureStdio();

    await inDir(dir, () => runTest(baseOptions("util.ts", { json: true })));

    const body = soleJson<{ ok: boolean; framework: string; content: string }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.framework).toBe("vitest");
    expect(body.content).toBe("it('adds', () => {});");
  });

  it("-o 把测试写到指定路径，JSON 里返回落盘路径", async () => {
    const dir = await makeSource();
    const out = path.join(dir, "test", "util.test.ts");
    stubLlm("it('adds', () => {});");
    const { stdout } = captureStdio();

    await inDir(dir, () => runTest(baseOptions("util.ts", { output: out, json: true })));

    expect(await readFile(out, "utf8")).toContain("it('adds'");
    const body = soleJson<{ output: string }>(stdout);
    expect(body.output).toBe(out);
  });
});

describe("test 命令: 失败路径", () => {
  it("LLM 报错时退出码 1，且不写半成品文件", async () => {
    const dir = await makeSource();
    const out = path.join(dir, "util.test.ts");
    stubLlmHttpError(400, "model overloaded");
    const { stderr } = captureStdio();

    await inDir(dir, () => runTest(baseOptions("util.ts", { output: out })));

    expect(process.exitCode).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(stderr.join("\n")).toContain("model overloaded");
  });

  it("--json 下 LLM 失败输出 {ok:false} 且退出码 1", async () => {
    const dir = await makeSource();
    stubLlmHttpError(400, "boom");
    const { stdout } = captureStdio();

    await inDir(dir, () => runTest(baseOptions("util.ts", { json: true })));

    expect(process.exitCode).toBe(1);
    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("boom");
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runRefactor } from "../src/commands/refactor.js";
import type { RefactorOptions } from "../src/types.js";
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-refactor-"));
  cleanup.push(dir);
  await writeFile(path.join(dir, "legacy.ts"), "export function f(a: any) { return a; }\n");
  return dir;
}

function baseOptions(file: string, overrides: Partial<RefactorOptions> = {}): RefactorOptions {
  return {
    file,
    focus: "all",
    maxFileKb: 200,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

describe("refactor 命令: 前置校验", () => {
  it("文件不存在时失败、退出码 1，且不调用 LLM", async () => {
    const dir = await makeSource();
    const fetchMock = stubLlm("建议");
    const { stderr } = captureStdio();

    await inDir(dir, () => runRefactor(baseOptions("missing.ts")));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("无法读取文件");
  });

  it("非法 --focus 报错、退出码 1，且不调用 LLM", async () => {
    const dir = await makeSource();
    const fetchMock = stubLlm("建议");
    const { stderr } = captureStdio();

    await inDir(dir, () => runRefactor(baseOptions("legacy.ts", { focus: "vibes" })));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const printed = stderr.join("\n");
    expect(printed).toContain("vibes");
    expect(printed).toContain("readability");
  });
});

describe("refactor 命令: 输出契约", () => {
  it("默认把建议打到 stdout", async () => {
    const dir = await makeSource();
    stubLlm("建议把 any 换成泛型。");
    const { stdout } = captureStdio();

    await inDir(dir, () => runRefactor(baseOptions("legacy.ts")));

    expect(stdout.join("\n")).toContain("建议把 any 换成泛型。");
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON，含 focus 与 content", async () => {
    const dir = await makeSource();
    stubLlm("建议一：收紧类型。");
    const { stdout } = captureStdio();

    await inDir(dir, () => runRefactor(baseOptions("legacy.ts", { focus: "types", json: true })));

    const body = soleJson<{ ok: boolean; focus: string; content: string }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.focus).toBe("types");
    expect(body.content).toBe("建议一：收紧类型。");
  });

  it("-o 把建议写到指定路径（而非 stdout）", async () => {
    const dir = await makeSource();
    const out = path.join(dir, "notes", "refactor.md");
    stubLlm("建议一：收紧类型。");
    const { stdout } = captureStdio();

    await inDir(dir, () => runRefactor(baseOptions("legacy.ts", { output: out })));

    expect(await readFile(out, "utf8")).toContain("收紧类型");
    expect(stdout.join("\n")).not.toContain("收紧类型");
  });
});

describe("refactor 命令: 失败路径", () => {
  it("LLM 报错时退出码 1，且不写半成品文件", async () => {
    const dir = await makeSource();
    const out = path.join(dir, "refactor.md");
    stubLlmHttpError(400, "rate limit on free tier");
    const { stderr } = captureStdio();

    await inDir(dir, () => runRefactor(baseOptions("legacy.ts", { output: out })));

    expect(process.exitCode).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(stderr.join("\n")).toContain("rate limit on free tier");
  });

  it("--json 下 LLM 失败输出 {ok:false} 且退出码 1", async () => {
    const dir = await makeSource();
    stubLlmHttpError(400, "boom");
    const { stdout } = captureStdio();

    await inDir(dir, () => runRefactor(baseOptions("legacy.ts", { json: true })));

    expect(process.exitCode).toBe(1);
    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("boom");
  });
});

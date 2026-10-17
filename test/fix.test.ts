import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runFix } from "../src/commands/fix.js";
import type { FixOptions } from "../src/types.js";
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

async function makeProject(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-fix-"));
  cleanup.push(dir);
  const all = { "index.ts": "export const a = 1;\n", "README.md": "# demo\n", ...files };
  for (const [rel, content] of Object.entries(all)) {
    await writeFile(path.join(dir, rel), content);
  }
  return dir;
}

function sentBody(fetchMock: ReturnType<typeof stubLlm>): string {
  const call = fetchMock.mock.calls[0] as unknown as [string, { body: string }] | undefined;
  return call?.[1]?.body ?? "";
}

function baseOptions(overrides: Partial<FixOptions> = {}): FixOptions {
  return {
    description: "启动时报 undefined is not a function",
    maxTokens: 8000,
    maxFileKb: 64,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

describe("fix 命令: 前置校验", () => {
  it("目录里没有任何可分析文件时失败、退出码 1，且不调用 LLM", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-fix-empty-"));
    cleanup.push(dir);
    const fetchMock = stubLlm("根因");
    const { stderr } = captureStdio();

    await inDir(dir, () => runFix(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("未收集到任何可分析的文件");
  });
});

describe("fix 命令: 输出契约", () => {
  it("默认把定位结果打到 stdout", async () => {
    const dir = await makeProject();
    stubLlm("## 根因\n\nindex.ts 里……");
    const { stdout } = captureStdio();

    await inDir(dir, () => runFix(baseOptions()));

    expect(stdout.join("\n")).toContain("根因");
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON，含 result", async () => {
    const dir = await makeProject();
    stubLlm("## 根因\n\nindex.ts 里……");
    const { stdout } = captureStdio();

    await inDir(dir, () => runFix(baseOptions({ json: true })));

    const body = soleJson<{ ok: boolean; result: string }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.result).toContain("根因");
  });
});

describe("fix 命令: 密钥不外发（安全契约）", () => {
  it("含明文密钥的文件被排除，既不进请求体也上报到 stderr", async () => {
    const dir = await makeProject({
      ".env.production": "DB_PASSWORD=7f3a2b7c1d4e5f60aa\n",
    });
    const fetchMock = stubLlm("根因");
    const { stderr } = captureStdio();

    await inDir(dir, () => runFix(baseOptions()));

    const body = sentBody(fetchMock);
    expect(body).not.toContain("7f3a2b7c1d4e5f60aa");
    expect(stderr.join("\n")).toContain(".env.production");
  });
});

describe("fix 命令: 失败路径", () => {
  it("LLM 报错时退出码 1 且 stdout 无产物", async () => {
    const dir = await makeProject();
    stubLlmHttpError(400, "bad gateway payload");
    const { stdout, stderr } = captureStdio();

    await inDir(dir, () => runFix(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr.join("\n")).toContain("bad gateway payload");
  });

  it("--json 下 LLM 失败输出 {ok:false} 且退出码 1", async () => {
    const dir = await makeProject();
    stubLlmHttpError(400, "boom");
    const { stdout } = captureStdio();

    await inDir(dir, () => runFix(baseOptions({ json: true })));

    expect(process.exitCode).toBe(1);
    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("boom");
  });
});

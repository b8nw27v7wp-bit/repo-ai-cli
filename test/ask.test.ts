import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAsk } from "../src/commands/ask.js";
import type { AskOptions } from "../src/types.js";
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-ask-"));
  cleanup.push(dir);
  const all = { "index.ts": "export const a = 1;\n", "README.md": "# demo\n", ...files };
  for (const [rel, content] of Object.entries(all)) {
    await writeFile(path.join(dir, rel), content);
  }
  return dir;
}

/** 取出这次 LLM 调用的请求体（用来断言「什么被发出去了」） */
function sentBody(fetchMock: ReturnType<typeof stubLlm>): string {
  const call = fetchMock.mock.calls[0] as unknown as [string, { body: string }] | undefined;
  return call?.[1]?.body ?? "";
}

function baseOptions(overrides: Partial<AskOptions> = {}): AskOptions {
  return {
    question: "这个项目是做什么的？",
    maxTokens: 8000,
    maxFileKb: 64,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

describe("ask 命令: 前置校验", () => {
  it("目录里没有任何可分析文件时失败、退出码 1，且不调用 LLM", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-ask-empty-"));
    cleanup.push(dir);
    const fetchMock = stubLlm("答案");
    const { stderr } = captureStdio();

    await inDir(dir, () => runAsk(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("未收集到任何可分析的文件");
  });
});

describe("ask 命令: 输出契约", () => {
  it("默认把答案打到 stdout", async () => {
    const dir = await makeProject();
    stubLlm("这是一个 CLI 项目。");
    const { stdout } = captureStdio();

    await inDir(dir, () => runAsk(baseOptions()));

    expect(stdout.join("\n").trim()).toBe("这是一个 CLI 项目。");
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON", async () => {
    const dir = await makeProject();
    stubLlm("这是一个 CLI 项目。");
    const { stdout } = captureStdio();

    await inDir(dir, () => runAsk(baseOptions({ json: true })));

    const body = soleJson<{ ok: boolean; answer: string }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.answer).toBe("这是一个 CLI 项目。");
  });
});

describe("ask 命令: 密钥不外发（安全契约）", () => {
  // 密钥值刻意不带连字符：collect-files.ts 的 isPlausibleSecret 把「纯小写+连字符」
  // 当成人写词组放行（见该文件「已知局限」注释），那是检测启发式的取舍，
  // 不该由命令层用例来断言。这里要守的是「被判定为密钥的文件不会进请求体」。
  const FAKE_KEY = "9f3a2b7c1d4e5f60aa11zz";

  it("含明文密钥的文件被排除，既不进请求体也上报到 stderr", async () => {
    const dir = await makeProject({
      "service.json": `{"apiKey": "${FAKE_KEY}"}\n`,
    });
    const fetchMock = stubLlm("答案");
    const { stderr } = captureStdio();

    await inDir(dir, () => runAsk(baseOptions()));

    const body = sentBody(fetchMock);
    expect(body).not.toContain(FAKE_KEY);
    expect(body).toContain("index.ts");
    expect(stderr.join("\n")).toContain("service.json");
  });

  it("--json 模式下密钥告警不污染 stdout", async () => {
    const dir = await makeProject({
      "service.json": `{"apiKey": "${FAKE_KEY}"}\n`,
    });
    stubLlm("答案");
    const { stdout } = captureStdio();

    await inDir(dir, () => runAsk(baseOptions({ json: true })));

    soleJson(stdout); // 行数不为 1 直接抛错
  });
});

describe("ask 命令: 失败路径", () => {
  it("LLM 报错时退出码 1 且 stdout 无产物", async () => {
    const dir = await makeProject();
    stubLlmHttpError(400, "invalid request");
    const { stdout, stderr } = captureStdio();

    await inDir(dir, () => runAsk(baseOptions()));

    expect(process.exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr.join("\n")).toContain("invalid request");
  });

  it("--json 下 LLM 失败输出 {ok:false} 且退出码 1", async () => {
    const dir = await makeProject();
    stubLlmHttpError(400, "boom");
    const { stdout } = captureStdio();

    await inDir(dir, () => runAsk(baseOptions({ json: true })));

    expect(process.exitCode).toBe(1);
    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("boom");
  });
});

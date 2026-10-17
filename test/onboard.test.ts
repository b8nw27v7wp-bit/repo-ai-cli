import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runOnboard } from "../src/commands/onboard.js";
import { buildOnboardPrompt } from "../src/prompts/onboard.js";
import type { BudgetResult, OnboardOptions } from "../src/types.js";
import {
  TEST_KEY,
  captureStdio,
  soleJson,
  stubLlm,
  stubLlmHttpError,
} from "./helpers/command-harness.js";

const VALID =
  "# Demo\n\n## 架构\n\n- 入口：`src/index.ts`\n\n## 运行与测试\n\n```bash\nnpm test\n```\n";

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
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-onboard-"));
  cleanup.push(dir);
  const all = {
    "package.json": '{"name":"onboard-demo"}\n',
    "README.md": "# demo\n",
    "src/index.ts": "export const a = 1;\n",
    ...files,
  };
  for (const [rel, content] of Object.entries(all)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

function baseOptions(dir: string, overrides: Partial<OnboardOptions> = {}): OnboardOptions {
  return {
    target: dir,
    maxTokens: 8000,
    maxFileKb: 64,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

function sentBody(fetchMock: ReturnType<typeof stubLlm>): string {
  const call = fetchMock.mock.calls[0] as unknown as [string, { body: string }] | undefined;
  return call?.[1]?.body ?? "";
}

describe("onboard 命令: 输出契约", () => {
  it("生成 ONBOARDING.md 并输出 JSON，stdout 纯净", async () => {
    const dir = await makeProject();
    const out = path.join(dir, "ONBOARDING.md");
    stubLlm(VALID);
    const { stdout } = captureStdio();

    await runOnboard(baseOptions(dir, { output: out, json: true }));

    const expected = VALID.trimEnd(); // llm.ts 会 trim 响应内容
    const body = soleJson<{ ok: boolean; output: string; bytes: number }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.output).toBe(out);
    expect(body.bytes).toBe(Buffer.byteLength(expected));
    expect(await readFile(out, "utf8")).toBe(expected);
  });

  it("使用 package.json 的 name 作为展示名", async () => {
    const dir = await makeProject();
    const fetchMock = stubLlm(VALID);
    captureStdio();

    await runOnboard(
      baseOptions(dir, { output: path.join(dir, "ONBOARDING.md"), json: true }),
    );

    expect(sentBody(fetchMock)).toContain("onboard-demo");
  });

  it("--dry-run 不调用 LLM，并给出入口与材料统计", async () => {
    const dir = await makeProject();
    const fetchMock = stubLlm(VALID);
    const { stdout } = captureStdio();

    await runOnboard(baseOptions(dir, { dryRun: true, json: true }));

    const body = soleJson<{
      dryRun: boolean;
      filesCollected: number;
      entryPoints: string[];
      budget: number;
    }>(stdout);
    expect(body.dryRun).toBe(true);
    expect(body.filesCollected).toBeGreaterThan(0);
    expect(body.entryPoints).toContain("src/index.ts");
    expect(body.budget).toBe(8000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("onboard 命令: 边界", () => {
  it("输出到不存在的嵌套目录会自动创建", async () => {
    const dir = await makeProject();
    const out = path.join(dir, "docs", "deep", "ONBOARDING.md");
    stubLlm(VALID);
    captureStdio();

    await runOnboard(baseOptions(dir, { output: out, json: true }));

    expect(await readFile(out, "utf8")).toContain("## 架构");
  });

  it("英文标题的导读也能通过结构校验", async () => {
    const dir = await makeProject();
    const out = path.join(dir, "ONBOARDING.md");
    stubLlm(
      "# Demo\n\n## Architecture\n\nEntry: `src/index.ts`.\n\n## How to Run and Test\n\n```bash\nnpm test\n```\n",
    );
    captureStdio();

    await runOnboard(baseOptions(dir, { output: out, json: true }));

    expect(await readFile(out, "utf8")).toContain("## Architecture");
    expect(process.exitCode).not.toBe(1);
  });

  it("空目录时报错且不调用 LLM", async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), "repo-ai-onboard-empty-"));
    cleanup.push(empty);
    const fetchMock = stubLlm(VALID);
    const { stdout } = captureStdio();

    await runOnboard(baseOptions(empty, { json: true }));

    expect(soleJson<{ ok: boolean }>(stdout).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("onboard 命令: 失败不写半成品", () => {
  it("结构校验不通过时不落盘且退出 1", async () => {
    const dir = await makeProject();
    const out = path.join(dir, "ONBOARDING.md");
    stubLlm("# Demo\n\n只有一段介绍，没有架构与运行章节。\n");
    const { stderr } = captureStdio();

    await runOnboard(baseOptions(dir, { output: out, json: false }));

    await expect(readFile(out, "utf8")).rejects.toThrow();
    expect(process.exitCode).toBe(1);
    expect(stderr.join("\n")).toContain("结构校验未通过");
  });

  it("LLM 请求失败时不落盘", async () => {
    const dir = await makeProject();
    const out = path.join(dir, "ONBOARDING.md");
    stubLlmHttpError();
    captureStdio();

    await runOnboard(baseOptions(dir, { output: out, json: true }));

    await expect(readFile(out, "utf8")).rejects.toThrow();
    expect(process.exitCode).toBe(1);
  });

  it("路径不存在时退出码 1", async () => {
    const { stdout } = captureStdio();

    await runOnboard({
      target: path.join(os.tmpdir(), `repo-ai-missing-onboard-${Date.now()}`),
      maxTokens: 8000,
      maxFileKb: 64,
      provider: "deepseek",
      apiKey: TEST_KEY,
      json: true,
    });

    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("路径不存在");
    expect(process.exitCode).toBe(1);
  });
});

describe("onboard 命令: 密钥安全", () => {
  it("含密钥的文件不进入请求体，并在 stderr 上报", async () => {
    const key = "abcdef1234567890";
    const dir = await makeProject({ ".env": `TOKEN=${key}\n` });
    const fetchMock = stubLlm(VALID);
    const { stderr } = captureStdio();

    // 非 JSON 模式才会把「已排除」告警写到 stderr（JSON 模式保持 stdout 纯净，
    // 状态通道静默——与 ask/readme 的既有约定一致）
    await runOnboard(
      baseOptions(dir, { output: path.join(dir, "ONBOARDING.md"), json: false }),
    );

    const body = sentBody(fetchMock);
    expect(body).not.toContain(key);
    expect(stderr.join("\n")).toContain("已排除疑似含密钥的文件");
  });
});

describe("buildOnboardPrompt", () => {
  it("把结构导航放在材料之前", () => {
    const materials: BudgetResult = {
      treeText: "demo\n└── src/",
      files: [],
      estimatedTokens: 10,
    };
    const messages = buildOnboardPrompt("demo", materials, {
      entryPoints: ["src/index.ts"],
      groups: [{ name: "src", files: 2, lines: 20 }],
      unresolved: 3,
    });
    const user = messages[1]?.content ?? "";
    expect(user.indexOf("结构导航")).toBeLessThan(user.indexOf("项目材料"));
    expect(user).toContain("src/index.ts");
    expect(user).toContain("src: 2 文件 / 20 行");
    expect(user).toContain("3 处本地 import 无法解析");
  });
});

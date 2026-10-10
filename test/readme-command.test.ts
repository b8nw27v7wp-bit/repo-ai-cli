import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runReadme } from "../src/commands/readme.js";
import type { ReadmeOptions } from "../src/types.js";

/** 结构合格的输出 */
const VALID_README = `# demo-cli

一句话定位。

## 功能特性

- 快速生成
- 双语输出
`;

/** 结构不合格的输出：无标题、无功能章节 */
const INVALID_README = "生成结果不太行，没有任何标题结构。";

const ORIGINAL_EXIT_CODE = process.exitCode;

let tmp: string;
let out: string;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** 打桩 fetch：LLM 固定返回指定内容（绝不真实调用 API） */
function stubLlm(content: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content } }] }),
    ),
  );
}

/** 测试用 key（拼接构造，避免字面量被密钥扫描误伤） */
const TEST_KEY = ["sk", "test"].join("-");

/** 构造隔离的 options：provider+apiKey 显式给出，盖过真实环境与 ~/.repo-ai/config.json */
function baseOptions(overrides: Partial<ReadmeOptions> = {}): ReadmeOptions {
  return {
    target: tmp,
    output: out,
    language: "en",
    maxTokens: 8000,
    maxFileKb: 64,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-readme-cmd-"));
  out = path.join(tmp, "out", "README.md");
  await writeFile(path.join(tmp, "index.ts"), "export const a = 1;\n");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.exitCode = ORIGINAL_EXIT_CODE;
  await rm(tmp, { recursive: true, force: true });
});

describe("readme 命令: 落盘前结构校验（P1-1）", () => {
  it("LLM 输出结构不合格时拒绝落盘、退出码 1 并说明原因", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    stubLlm(INVALID_README);

    await runReadme(baseOptions());

    expect(existsSync(out)).toBe(false);
    expect(process.exitCode).toBe(1);
    const printed = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toContain("结构校验未通过");
    expect(printed).toContain("一级标题");
    expect(printed).toContain("功能特性");
  });

  it("结构合格时正常写入", async () => {
    stubLlm(VALID_README);

    await runReadme(baseOptions());

    expect(existsSync(out)).toBe(true);
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 模式下校验失败输出 {ok:false} 且不落盘", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubLlm(INVALID_README);

    await runReadme(baseOptions({ json: true }));

    expect(existsSync(out)).toBe(false);
    expect(process.exitCode).toBe(1);
    const payloads = logSpy.mock.calls.map((c) => String(c[0]));
    expect(payloads).toHaveLength(1);
    const parsed = JSON.parse(payloads[0] ?? "") as {
      ok: boolean;
      error: string;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("结构校验未通过");
  });

  it("LLM 返回带 TODO 但结构完整时照常写入（TODO 按约定允许）", async () => {
    stubLlm(`${VALID_README}\n## TODO\n\n- TODO: 补充截图\n`);

    await runReadme(baseOptions());

    expect(existsSync(out)).toBe(true);
    expect(process.exitCode).not.toBe(1);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runTranslate } from "../src/commands/translate.js";
import type { TranslateOptions } from "../src/types.js";
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

async function makeDoc(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-translate-"));
  cleanup.push(dir);
  await writeFile(path.join(dir, "doc.md"), "# 标题\n\n正文。\n");
  return dir;
}

function baseOptions(file: string, overrides: Partial<TranslateOptions> = {}): TranslateOptions {
  return {
    file,
    to: "en",
    maxFileKb: 200,
    provider: "deepseek",
    apiKey: TEST_KEY,
    ...overrides,
  };
}

describe("translate 命令: 前置校验", () => {
  it("文件不存在时失败、退出码 1，且不调用 LLM", async () => {
    const dir = await makeDoc();
    const fetchMock = stubLlm("# Title");
    const { stderr } = captureStdio();

    await inDir(dir, () => runTranslate(baseOptions("missing.md")));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join("\n")).toContain("无法读取文件");
  });

  it("非法 --to 报错、退出码 1，且不调用 LLM", async () => {
    const dir = await makeDoc();
    const fetchMock = stubLlm("# Title");
    const { stderr } = captureStdio();

    await inDir(dir, () => runTranslate(baseOptions("doc.md", { to: "ja" })));

    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const printed = stderr.join("\n");
    expect(printed).toContain("ja");
    expect(printed).toContain("bilingual");
  });
});

describe("translate 命令: 输出契约", () => {
  it("默认把译文打到 stdout", async () => {
    const dir = await makeDoc();
    stubLlm("# Title\n\nBody.");
    const { stdout } = captureStdio();

    await inDir(dir, () => runTranslate(baseOptions("doc.md")));

    expect(stdout.join("\n")).toContain("# Title");
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON，含 target 与 content", async () => {
    const dir = await makeDoc();
    stubLlm("# Title");
    const { stdout } = captureStdio();

    await inDir(dir, () => runTranslate(baseOptions("doc.md", { json: true })));

    const body = soleJson<{ ok: boolean; target: string; content: string }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.target).toBe("en");
    expect(body.content).toBe("# Title");
  });

  it("-o 把译文写到指定路径（而非 stdout）", async () => {
    const dir = await makeDoc();
    const out = path.join(dir, "out", "doc.en.md");
    stubLlm("# Title");
    const { stdout } = captureStdio();

    await inDir(dir, () => runTranslate(baseOptions("doc.md", { output: out })));

    expect(await readFile(out, "utf8")).toContain("# Title");
    expect(stdout.join("\n")).not.toContain("# Title");
  });
});

describe("translate 命令: 失败路径", () => {
  it("LLM 报错时退出码 1，且不写半成品文件", async () => {
    const dir = await makeDoc();
    const out = path.join(dir, "out.md");
    stubLlmHttpError(400, "quota exceeded");
    const { stderr } = captureStdio();

    await inDir(dir, () => runTranslate(baseOptions("doc.md", { output: out })));

    expect(process.exitCode).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(stderr.join("\n")).toContain("quota exceeded");
  });

  it("--json 下 LLM 失败输出 {ok:false} 且退出码 1", async () => {
    const dir = await makeDoc();
    stubLlmHttpError(400, "boom");
    const { stdout } = captureStdio();

    await inDir(dir, () => runTranslate(baseOptions("doc.md", { json: true })));

    expect(process.exitCode).toBe(1);
    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("boom");
  });
});

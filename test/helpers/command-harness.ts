import { vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

/**
 * 命令层测试脚手架。
 *
 * 只做三件事：打桩 fetch（绝不真实调用 API）、捕获 stdout/stderr、造临时 git 仓库。
 * 刻意不封装「跑某个命令」——命令签名与返回类型各不相同，包一层反而看不清接线。
 *
 * 注意：本文件不匹配 vitest.config.ts 的 `test/**\/*.test.ts`，不会被当成测试收集。
 */

/** 测试用 key（拼接构造，避免字面量被密钥扫描误伤） */
export const TEST_KEY = ["sk", "test"].join("-");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * 打桩 fetch：LLM 返回固定内容。返回 mock 以便断言「是否被调用」——
 * 「非法参数不该发请求」这类用例全靠它。
 *
 * 默认不带 usage：真实 provider 里也常缺，这样命令层用例顺带守住
 * 「用量未知时不崩、不猜 0」。
 */
export function stubLlm(content: string, usage?: Record<string, number>) {
  const fn = vi.fn(async () =>
    jsonResponse({
      choices: [{ message: { content } }],
      ...(usage ? { usage } : {}),
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

/**
 * 打桩 fetch：返回非 2xx。用 400 而非 429/5xx —— 后者会触发 llm.ts 的指数退避重试，
 * 每条用例白等 2~3 秒。重试本身由 test/llm.test.ts 专项覆盖。
 */
export function stubLlmHttpError(status = 400, text = "bad request") {
  const fn = vi.fn(async () => new Response(text, { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** 打桩 fetch：网络层直接抛错（连接失败） */
export function stubLlmNetworkError(message = "connect ECONNREFUSED") {
  const fn = vi.fn(async () => {
    throw new Error(message);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/**
 * 捕获 stdout / stderr 到数组。
 * stdout 是「产物通道」、stderr 是「状态通道」，两者的分流约定由这些数组断言。
 */
export function captureStdio(): { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const push = (arr: string[]) =>
    (...a: unknown[]) => {
      arr.push(a.map(String).join(" "));
    };
  vi.spyOn(console, "log").mockImplementation(push(stdout));
  vi.spyOn(console, "error").mockImplementation(push(stderr));
  vi.spyOn(console, "warn").mockImplementation(push(stderr));
  return { stdout, stderr };
}

/** 取出唯一一行 stdout 并解析为 JSON；行数不为 1 直接失败（这就是「stdout 纯净」的断言） */
export function soleJson<T = Record<string, unknown>>(stdout: string[]): T {
  if (stdout.length !== 1) {
    throw new Error(
      `期望 stdout 只有 1 行 JSON，实际 ${stdout.length} 行:\n${stdout.join("\n")}`,
    );
  }
  return JSON.parse(stdout[0] ?? "") as T;
}

/** 跑一条 git 命令；失败即抛错，避免用例在坏仓库上继续跑出难懂的报错 */
export function git(args: string[], cwd: string): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

export interface TempRepo {
  dir: string;
  /** 在仓库里改文件并提交，返回提交后的 HEAD */
  commit(file: string, content: string, message: string): Promise<void>;
}

/** 造一个临时 git 仓库（已配置 user.name/email，含一次初始提交） */
export async function makeGitRepo(
  prefix = "repo-ai-cmd-",
  initial: Record<string, string> = { "a.ts": "export const a = 1;\n" },
): Promise<TempRepo> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  git(["init", "-b", "main"], dir);
  git(["config", "user.email", "test@test.com"], dir);
  git(["config", "user.name", "test"], dir);
  for (const [rel, content] of Object.entries(initial)) {
    await writeFile(path.join(dir, rel), content);
  }
  git(["add", "."], dir);
  git(["commit", "-m", "init"], dir);
  return {
    dir,
    async commit(file, content, message) {
      await writeFile(path.join(dir, file), content);
      git(["add", file], dir);
      git(["commit", "-m", message], dir);
    },
  };
}

/** 非 git 目录（用于断言「不在仓库里」的失败路径） */
export async function makePlainDir(prefix = "repo-ai-plain-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * 切到 dir 执行 fn，结束后切回。
 * ask/fix/commit/review/pr/release/license/init 都读 process.cwd()，必须真的切目录。
 */
export async function inDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

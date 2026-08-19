import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  renderContributingZh,
  renderContributingEn,
} from "../lib/contributing.js";
import { writeOutput } from "../lib/output.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  done,
  fail,
} from "../lib/ui.js";
import type { ContributingOptions } from "../types.js";

const pexecFile = promisify(execFile);

/** 探测 git remote 的 owner/repo（失败返回 owner/repo 占位） */
async function detectSlug(cwd: string): Promise<string> {
  try {
    const { stdout } = await pexecFile("git", ["remote", "get-url", "origin"], {
      cwd,
      windowsHide: true,
    });
    const m = stdout.trim().match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
    if (m && m[1] && m[2]) return `${m[1]}/${m[2]}`;
  } catch {
    /* 非 git 仓库或无 remote */
  }
  return "OWNER/REPO";
}

/** 根据 lockfile 推断安装命令 */
async function detectInstallCmd(cwd: string): Promise<string> {
  for (const [file, cmd] of [
    ["pnpm-lock.yaml", "pnpm install"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun install"],
    ["package-lock.json", "npm install"],
  ] as const) {
    try {
      await fs.access(path.join(cwd, file));
      return cmd;
    } catch {
      /* 继续找 */
    }
  }
  return "npm install";
}

/** 从 package.json scripts.test 推断测试命令 */
async function detectTestCmd(cwd: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(cwd, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      return "npm test";
    }
  } catch {
    /* 无 package.json */
  }
  return "npm test";
}

/**
 * repo-ai contributing — 离线生成 CONTRIBUTING.md（中/英）。
 */
export async function runContributing(options: ContributingOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai contributing");

  const cwd = process.cwd();
  const output = options.output ?? "CONTRIBUTING.md";
  const lang = options.language ?? "zh";

  if (!options.force) {
    try {
      await fs.access(output);
      fail(`文件已存在: ${output}（加 --force 覆盖）`);
      return;
    } catch {
      /* 不存在，继续 */
    }
  }

  const vars = {
    project: path.basename(cwd),
    repoSlug: await detectSlug(cwd),
    install: await detectInstallCmd(cwd),
    testCmd: await detectTestCmd(cwd),
  };
  const text = lang === "en" ? renderContributingEn(vars) : renderContributingZh(vars);
  const abs = await writeOutput(text, output);

  if (isJsonMode()) {
    emitJson({ ok: true, output: abs, language: lang, bytes: Buffer.byteLength(text) });
    return;
  }
  done(`CONTRIBUTING.md 已生成: ${abs}（${lang === "en" ? "英文" : "中文"}）`);
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexecFile = promisify(execFile);

/** 从 git remote origin 解析 owner/repo（失败返回 null） */
async function detectGithubRepo(cwd: string): Promise<{ owner: string; repo: string } | null> {
  try {
    const { stdout } = await pexecFile("git", ["remote", "get-url", "origin"], {
      cwd,
      windowsHide: true,
    });
    const url = stdout.trim();
    const m =
      url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/i) ?? null;
    if (!m || !m[1] || !m[2]) return null;
    return { owner: m[1], repo: m[2] };
  } catch {
    return null;
  }
}

export interface BadgesContext {
  owner: string | null;
  repo: string | null;
  /** package.json name（发布到 npm 时才有 npm 徽章） */
  npmName: string | null;
  /** LICENSE 文件存在与否 */
  hasLicense: boolean;
  /** CI workflow 文件名 */
  ciWorkflow: string | null;
  nodeEngine: string | null;
}

/** 收集生成徽章所需上下文（全离线） */
export async function collectBadgesContext(cwd: string): Promise<BadgesContext> {
  const gh = await detectGithubRepo(cwd);

  let npmName: string | null = null;
  let nodeEngine: string | null = null;
  try {
    const raw = await fs.readFile(path.join(cwd, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      name?: string;
      private?: boolean;
      engines?: { node?: string };
    };
    if (pkg.name && pkg.private !== true) npmName = pkg.name;
    nodeEngine = pkg.engines?.node ?? null;
  } catch {
    /* 无 package.json */
  }

  let hasLicense = false;
  for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE"]) {
    try {
      await fs.access(path.join(cwd, name));
      hasLicense = true;
      break;
    } catch {
      /* 继续找 */
    }
  }

  let ciWorkflow: string | null = null;
  for (const name of ["ci.yml", "ci.yaml", "test.yml", "main.yml"]) {
    try {
      await fs.access(path.join(cwd, ".github", "workflows", name));
      ciWorkflow = name;
      break;
    } catch {
      /* 继续找 */
    }
  }

  return {
    owner: gh?.owner ?? null,
    repo: gh?.repo ?? null,
    npmName,
    hasLicense,
    ciWorkflow,
    nodeEngine,
  };
}

/** 生成徽章 markdown 文本 */
export function renderBadges(ctx: BadgesContext): string {
  const lines: string[] = [];
  const gh = ctx.owner && ctx.repo ? `${ctx.owner}/${ctx.repo}` : null;

  if (gh && ctx.ciWorkflow) {
    lines.push(
      `[![CI](https://github.com/${gh}/actions/workflows/${ctx.ciWorkflow}/badge.svg)](https://github.com/${gh}/actions/workflows/${ctx.ciWorkflow})`,
    );
  }
  if (ctx.npmName) {
    lines.push(
      `[![npm version](https://img.shields.io/npm/v/${encodeURIComponent(ctx.npmName)}.svg)](https://www.npmjs.com/package/${ctx.npmName})`,
      `[![npm downloads](https://img.shields.io/npm/dm/${encodeURIComponent(ctx.npmName)}.svg)](https://www.npmjs.com/package/${ctx.npmName})`,
    );
  }
  if (ctx.hasLicense) {
    lines.push(
      `[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)`,
    );
  }
  if (ctx.nodeEngine) {
    const ver = ctx.nodeEngine.replace(/^>=?/, "");
    lines.push(
      `[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D${encodeURIComponent(ver)}-339933?logo=node.js)](https://nodejs.org/)`,
    );
  }
  if (gh) {
    lines.push(
      `[![GitHub stars](https://img.shields.io/github/stars/${gh}?style=flat)](https://github.com/${gh})`,
    );
  }
  return lines.join("\n");
}

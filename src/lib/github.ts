import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { debug } from "./log.js";

/** 解析 GitHub 仓库引用为 clone URL + 分支。支持:
 * - owner/repo
 * - owner/repo#branch
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo/tree/branch
 * - git@github.com:owner/repo.git
 * 其他 URL 抛错。
 */
export function parseGithubRef(input: string): {
  url: string;
  branch?: string;
} {
  const trimmed = input.trim();

  // 非 github 域名直接拒绝（第一版只支持 GitHub）
  if (/^https?:\/\//.test(trimmed) || /^git@/.test(trimmed)) {
    const m = trimmed.match(
      /(?:github\.com[/:])([^/]+)\/([^/#]+?)(?:\.git)?(?:[/#](.+))?$/i,
    );
    if (!m || !m[1] || !m[2]) {
      throw new Error(`不支持的仓库地址: ${input}（第一版仅支持 GitHub）`);
    }
    const owner = m[1];
    const repo = m[2].replace(/\.git$/, "");
    const branch = extractBranch(m[3]);
    return { url: `https://github.com/${owner}/${repo}.git`, branch };
  }

  // owner/repo 或 owner/repo#branch
  const m = trimmed.match(/^([\w.-]+)\/([\w.-]+?)(?:#([\w./-]+))?$/);
  if (!m || !m[1] || !m[2]) {
    throw new Error(`无法识别的仓库引用: ${input}`);
  }
  return {
    url: `https://github.com/${m[1]}/${m[2].replace(/\.git$/, "")}.git`,
    branch: m[3],
  };
}

function extractBranch(rest: string | undefined): string | undefined {
  if (!rest) return undefined;
  // tree/<branch> 或裸 branch；去掉 "tree/" 前缀
  return rest.replace(/^tree\//, "").replace(/\/$/, "") || undefined;
}

/** 浅克隆仓库到新的临时目录。返回清理函数。
 * 直连 github.com 失败时自动回退镜像（GITHUB_MIRROR 环境变量可配，默认 gh-proxy.com）。
 */
export async function cloneRepo(
  url: string,
  branch?: string,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-ai-gh-"));
  const args = ["clone", "--depth", "1"];
  if (branch) args.push("--branch", branch);

  const mirror = process.env.GITHUB_MIRROR?.replace(/\/$/, "");
  const mirrorUrl = mirror
    ? `${mirror}/${url}`
    : `https://gh-proxy.com/${url}`;

  let lastErr: unknown = null;
  for (const target of [url, mirrorUrl]) {
    try {
      debug(`git clone --depth 1 ${target}`);
      await runGit([...args, target, dir]);
      debug(`克隆成功: ${dir}`);
      return {
        dir,
        cleanup: async () => {
          // Windows 上 git 文件只读，先提权再删
          await fs.rm(dir, { recursive: true, force: true }).catch(() => {
            /* 尽力清理 */
          });
        },
      };
    } catch (err) {
      lastErr = err;
      // 清掉克隆到一半的目录再试镜像
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  throw lastErr ?? new Error("git clone 失败");
}

function runGit(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { windowsHide: true, stdio: "ignore" });
    // 直连被墙时 TCP 握手可能挂很久；10s 无进展即放弃，走镜像
    const timer = setTimeout(() => child.kill(), 10_000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`git ${args[0]} 失败 (exit ${code})`));
    });
  });
}

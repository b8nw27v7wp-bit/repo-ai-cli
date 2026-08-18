import { promises as fs } from "node:fs";
import path from "node:path";
import { getGitDir } from "./git.js";

/** 钩子脚本中的标记，用于识别由 repo-ai 安装的钩子 */
export const HOOK_MARKER = "# installed by repo-ai-cli";

/** 支持的钩子名（第一版只上 prepare-commit-msg） */
export const SUPPORTED_HOOKS = ["prepare-commit-msg"] as const;
export type SupportedHook = (typeof SUPPORTED_HOOKS)[number];

function hookScript(name: SupportedHook): string {
  if (name === "prepare-commit-msg") {
    return `#!/bin/sh
${HOOK_MARKER} (${name})
# 仅在 git commit 未显式提供 -m / -F 时，用 AI 生成 commit message
if [ "$2" = "" ] || [ "$2" = "message" ]; then
  if command -v repo-ai-cli >/dev/null 2>&1; then
    msg=$(repo-ai-cli commit --all --print 2>/dev/null || true)
    if [ -n "$msg" ]; then
      printf '%s\\n' "$msg" > "$1"
    fi
  fi
fi
`;
  }
  // 未来扩展 commit-msg 等
  return "";
}

function hookPath(cwd: string, name: SupportedHook): Promise<string> {
  return getGitDir(cwd).then((gitDir) => path.join(gitDir, "hooks", name));
}

async function isOwnHook(abs: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(abs, "utf8");
    return raw.includes(HOOK_MARKER);
  } catch {
    return false;
  }
}

/** 安装钩子：已存在且非本工具时备份为 .bak，避免覆盖用户脚本 */
export async function installHook(
  cwd: string,
  name: SupportedHook,
): Promise<{ path: string; backedUp?: string }> {
  const abs = await hookPath(cwd, name);
  const script = hookScript(name);
  if (!script) throw new Error(`不支持的钩子: ${name}`);

  let backedUp: string | undefined;
  try {
    const existing = await fs.readFile(abs, "utf8");
    if (!existing.includes(HOOK_MARKER)) {
      const bak = `${abs}.bak`;
      await fs.writeFile(bak, existing, "utf8");
      backedUp = bak;
    }
  } catch {
    /* 不存在则直接写 */
  }

  await fs.writeFile(abs, script, "utf8");
  try {
    await fs.chmod(abs, 0o755);
  } catch {
    /* Windows 无 POSIX 权限，忽略 */
  }
  return { path: abs, backedUp };
}

/** 卸载本工具安装的钩子（不含 marker 的用户钩子不删除） */
export async function uninstallHook(
  cwd: string,
  name: SupportedHook,
): Promise<{ path: string; removed: boolean }> {
  const abs = await hookPath(cwd, name);
  try {
    if (await isOwnHook(abs)) {
      await fs.unlink(abs);
      return { path: abs, removed: true };
    }
  } catch {
    /* 文件不存在 */
  }
  return { path: abs, removed: false };
}

export interface HookStatus {
  name: SupportedHook;
  installed: boolean;
  owned: boolean;
}

/** 列出各钩子状态 */
export async function listHooks(cwd: string): Promise<HookStatus[]> {
  const out: HookStatus[] = [];
  for (const name of SUPPORTED_HOOKS) {
    const abs = await hookPath(cwd, name);
    let installed = false;
    let owned = false;
    try {
      const raw = await fs.readFile(abs, "utf8");
      installed = true;
      owned = raw.includes(HOOK_MARKER);
    } catch {
      /* 不存在 */
    }
    out.push({ name, installed, owned });
  }
  return out;
}
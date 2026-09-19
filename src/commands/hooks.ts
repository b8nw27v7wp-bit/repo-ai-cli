import { intro } from "@clack/prompts";
import { assertInGitRepo } from "../lib/git.js";
import {
  installHook,
  uninstallHook,
  listHooks,
  SUPPORTED_HOOKS,
  type SupportedHook,
} from "../lib/git-hooks.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  say,
  done,
  fail,
} from "../lib/ui.js";
import type { HooksOptions } from "../types.js";

function isSupportedHook(h: string): h is SupportedHook {
  return (SUPPORTED_HOOKS as readonly string[]).includes(h);
}

async function assertRepo(): Promise<boolean> {
  try {
    await assertInGitRepo(process.cwd());
    return true;
  } catch (err) {
    fail((err as Error).message);
    return false;
  }
}

/** repo-ai hooks install — 安装 git 钩子（prepare-commit-msg） */
export async function runHooksInstall(options: HooksOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai hooks install");
  if (!(await assertRepo())) return;

  const name = options.hook ?? "prepare-commit-msg";
  if (!isSupportedHook(name)) {
    fail(`不支持的钩子: ${name}。可用: ${SUPPORTED_HOOKS.join(", ")}`);
    return;
  }

  const res = await installHook(process.cwd(), name);
  if (isJsonMode()) {
    emitJson({ ok: true, hook: name, path: res.path, backedUp: res.backedUp ?? null });
    return;
  }
  done(`已安装 ${name} 钩子: ${res.path}`);
  if (res.backedUp) say(`已备份原有钩子到: ${res.backedUp}`);
  say("之后 git commit（不带 -m）会自动调用 repo-ai-cli 生成 message");
}

/** repo-ai hooks uninstall — 卸载由本工具安装的钩子 */
export async function runHooksUninstall(options: HooksOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai hooks uninstall");
  if (!(await assertRepo())) return;

  const name = options.hook ?? "prepare-commit-msg";
  if (!isSupportedHook(name)) {
    fail(`不支持的钩子: ${name}。可用: ${SUPPORTED_HOOKS.join(", ")}`);
    return;
  }

  const res = await uninstallHook(process.cwd(), name);
  if (isJsonMode()) {
    emitJson({ ok: true, hook: name, removed: res.removed, restored: res.restored ?? null });
    return;
  }
  done(
    res.removed
      ? `已卸载 ${name}: ${res.path}${res.restored ? "（已恢复备份）" : ""}`
      : `未找到本工具安装的 ${name}，无需卸载`,
  );
}

/** repo-ai hooks list — 查看钩子安装状态 */
export async function runHooksList(options: HooksOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai hooks list");
  if (!(await assertRepo())) return;

  const statuses = await listHooks(process.cwd());
  if (isJsonMode()) {
    emitJson({ ok: true, hooks: statuses });
    return;
  }
  for (const s of statuses) {
    const mark = s.owned ? "✓" : s.installed ? "·" : "✖";
    console.log(`${mark} ${s.name}${s.owned ? " (由 repo-ai 安装)" : s.installed ? " (已存在，非本工具)" : ""}`);
  }
}
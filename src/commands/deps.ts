import { intro } from "@clack/prompts";
import { readDeps } from "../lib/deps.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  done,
  fail,
} from "../lib/ui.js";
import type { DepsOptions } from "../types.js";

/**
 * repo-ai deps — 解析依赖清单（package.json / requirements.txt，离线）。
 */
export async function runDeps(options: DepsOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai deps");

  const cwd = process.cwd();
  let info;
  try {
    info = await readDeps(cwd);
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  const deps = Object.entries(info.dependencies);
  const devDeps = Object.entries(info.devDependencies);

  if (isJsonMode()) {
    emitJson({
      ok: true,
      manifest: info.manifest,
      dependencies: info.dependencies,
      devDependencies: info.devDependencies,
      total: deps.length + devDeps.length,
    });
    return;
  }

  console.log(`清单: ${info.manifest}（deps ${deps.length} + devDeps ${devDeps.length}）\n`);
  if (deps.length > 0) {
    console.log("dependencies:");
    for (const [name, ver] of deps) console.log(`  ${name} ${ver}`);
    console.log("");
  }
  if (devDeps.length > 0) {
    console.log("devDependencies:");
    for (const [name, ver] of devDeps) console.log(`  ${name} ${ver}`);
  }
  done("依赖读取完成（如需检查过期/漏洞，可用 npm outdated / npm audit）");
}
import { promises as fs } from "node:fs";
import path from "node:path";

export interface DepsInfo {
  /** 检测到的清单文件名（package.json / requirements.txt） */
  manifest: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fromPackageJson(root: string): Promise<DepsInfo | null> {
  const pkg = await readJson(path.join(root, "package.json"));
  if (!pkg) return null;
  const pick = (v: unknown): Record<string, string> =>
    v && typeof v === "object" ? (v as Record<string, string>) : {};
  return {
    manifest: "package.json",
    dependencies: pick(pkg.dependencies),
    devDependencies: pick(pkg.devDependencies),
  };
}

/** 解析 requirements.txt：忽略注释/-r 引用/空白，取 `name==version` 行 */
async function fromRequirements(root: string): Promise<DepsInfo | null> {
  try {
    const raw = await fs.readFile(path.join(root, "requirements.txt"), "utf8");
    const deps: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
      const key = trimmed.split(/[<>=!~[\]]/)[0]?.trim();
      if (!key) continue;
      deps[key] = trimmed;
    }
    if (Object.keys(deps).length === 0) return null;
    return { manifest: "requirements.txt", dependencies: deps, devDependencies: {} };
  } catch {
    return null;
  }
}

/**
 * 解析依赖清单（当前支持 package.json 与 requirements.txt）。
 * 按 package.json 优先检测；都没有则抛错。
 */
export async function readDeps(rootDir: string): Promise<DepsInfo> {
  const pkg = await fromPackageJson(rootDir);
  if (pkg) return pkg;
  const req = await fromRequirements(rootDir);
  if (req) return req;
  throw new Error(
    "未找到 package.json 或 requirements.txt（当前支持 Node 与 Python 项目）",
  );
}
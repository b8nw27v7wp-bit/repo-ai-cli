import { promises as fs } from "node:fs";
import path from "node:path";

export type BumpLevel = "major" | "minor" | "patch";

export interface VersionSuggestion {
  level: BumpLevel;
  current: string;
  next: string;
  commitCount: number;
  breaking: number;
  features: number;
  fixes: number;
}

export function parseSemver(
  v: string,
): { major: number; minor: number; patch: number } | null {
  const m = v.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function computeNext(current: string, level: BumpLevel): string {
  const cur = parseSemver(current) ?? { major: 0, minor: 1, patch: 0 };
  if (level === "major") return `${cur.major + 1}.0.0`;
  if (level === "minor") return `${cur.major}.${cur.minor + 1}.0`;
  return `${cur.major}.${cur.minor}.${cur.patch + 1}`;
}

/** 根据 conventional commits 约定（feat! / BREAKING CHANGE / feat / fix）建议下一个版本号 */
export function suggestNextVersion(
  commits: Array<{ subject: string; body?: string }>,
  current: string,
): VersionSuggestion {
  let breaking = 0;
  let features = 0;
  let fixes = 0;

  for (const c of commits) {
    const isBreaking =
      /^\w+(\(.*\))?!:/.test(c.subject) ||
      (c.body ?? "").toLowerCase().includes("breaking change");
    if (isBreaking) {
      breaking++;
    } else if (/^feat(\(.*\))?:/.test(c.subject)) {
      features++;
    } else if (/^fix(\(.*\))?:/.test(c.subject)) {
      fixes++;
    }
  }

  const level: BumpLevel =
    breaking > 0 ? "major" : features > 0 ? "minor" : "patch";

  return {
    level,
    current,
    next: computeNext(current, level),
    commitCount: commits.length,
    breaking,
    features,
    fixes,
  };
}

/** 把版本号写入 package.json（和 package-lock.json 的根/packages[""] 字段） */
export async function bumpPackageVersion(
  dir: string,
  next: string,
): Promise<{ packageJson: boolean; lock: boolean }> {
  let packageJson = false;
  try {
    const pkgPath = path.join(dir, "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as {
      version?: string;
    };
    if (typeof pkg.version === "string") {
      pkg.version = next;
      await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      packageJson = true;
    }
  } catch {
    /* 无 package.json 或不可写 */
  }

  let lock = false;
  try {
    const lockPath = path.join(dir, "package-lock.json");
    const data = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
      version?: string;
      packages?: Record<string, { version?: string }>;
    };
    if (typeof data.version === "string") data.version = next;
    if (
      data.packages?.[""] &&
      typeof data.packages[""].version === "string"
    ) {
      data.packages[""].version = next;
    }
    await fs.writeFile(lockPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    lock = true;
  } catch {
    /* 无 lock 或不可写 */
  }

  return { packageJson, lock };
}
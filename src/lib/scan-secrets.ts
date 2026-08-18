import { promises as fs } from "node:fs";
import path from "node:path";
import {
  SECRET_PATTERNS,
  SEVERITY_RANK,
  maskValue,
  type Severity,
} from "./secret-patterns.js";
import { HARD_SKIP_DIRS, BINARY_EXTS } from "./collect-files.js";

export interface SecretFinding {
  /** 相对目录根的文件路径（POSIX 风格） */
  file: string;
  /** 1 起始的行号 */
  line: number;
  /** 命中的模式 id（见 secret-patterns.ts） */
  pattern: string;
  /** 人类可读名称 */
  name: string;
  severity: Severity;
  /** 打码后的命中内容 */
  redacted: string;
}

export interface ScanOptions {
  /** 单文件扫描上限（字节） */
  maxFileBytes?: number;
  /** 只报告 >= 此级别的发现（默认 medium） */
  severityThreshold?: Severity;
}

async function walk(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (HARD_SKIP_DIRS.has(entry.name)) continue;
      out.push(...(await walk(full, base)));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * 扫描目录中的文本文件，检测疑似硬编码的密钥/凭据。
 * 启发式匹配（可能误报），跳过二进制与超大文件、node_modules/.git 等目录。
 */
export async function scanSecrets(
  rootDir: string,
  options: ScanOptions = {},
): Promise<SecretFinding[]> {
  const maxFileBytes = options.maxFileBytes ?? 200 * 1024;
  const threshold = options.severityThreshold ?? "medium";

  const relPaths = await walk(rootDir, rootDir);
  const findings: SecretFinding[] = [];

  for (const rel of relPaths) {
    const ext = path.extname(rel).slice(1).toLowerCase();
    if (BINARY_EXTS.has(ext)) continue;

    let stat;
    try {
      stat = await fs.stat(path.join(rootDir, rel));
    } catch {
      continue;
    }
    if (stat.size > maxFileBytes) continue;

    let content: string;
    try {
      content = await fs.readFile(path.join(rootDir, rel), "utf8");
    } catch {
      continue;
    }
    if (content.includes("\0")) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!line.trim()) continue;
      for (const p of SECRET_PATTERNS) {
        const matches = line.match(p.regex);
        if (!matches) continue;
        for (const m of matches) {
          findings.push({
            file: rel,
            line: i + 1,
            pattern: p.id,
            name: p.name,
            severity: p.severity,
            redacted: maskValue(m),
          });
        }
      }
    }
  }

  if (threshold === "medium") return findings;
  return findings.filter(
    (f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[threshold],
  );
}
import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { scanSecrets, type SecretFinding } from "../lib/scan-secrets.js";
import { SEVERITIES, type Severity } from "../lib/secret-patterns.js";
import { parseEnum } from "../lib/options.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  say,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import type { SecretsOptions } from "../types.js";

const SEV_ICON: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
};

/**
 * repo-ai secrets — 离线扫描目录中的硬编码密钥/凭据。
 * 命中时打印明细并按 linter 语义退出码 1（便于接入 CI）。
 */
export async function runSecrets(options: SecretsOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai secrets");

  const target = options.target || ".";
  const dir = path.resolve(target);
  let stat;
  try {
    stat = await fs.stat(dir);
  } catch {
    fail(`路径不存在: ${target}`);
    return;
  }
  if (!stat.isDirectory()) {
    fail(`暂不支持单文件扫描，请传目录: ${target}`);
    return;
  }

  const threshold = parseEnum(options.severity, SEVERITIES, "severity", "medium");
  if (!threshold) return;

  const progressBar = progress("扫描敏感信息中...");
  const findings: SecretFinding[] = await scanSecrets(dir, {
    maxFileBytes: (options.maxFileKb ?? 200) * 1024,
    severityThreshold: threshold,
  });
  progressBar.stop();

  if (isJsonMode()) {
    emitJson({ ok: findings.length === 0, count: findings.length, findings });
    // 与文本模式一致：命中时退出码 1（CI 门禁依赖）
    if (findings.length > 0) process.exitCode = 1;
    return;
  }

  if (findings.length === 0) {
    done("未发现可疑的硬编码密钥");
    return;
  }

  for (const f of findings) {
    console.log(`${SEV_ICON[f.severity]} ${f.file}:${f.line}  ${f.name}  ${f.redacted}`);
  }
  const critical = findings.filter((f) => f.severity === "critical").length;
  say(`共 ${findings.length} 处可疑（critical ${critical}）`);
  process.exitCode = 1;
}
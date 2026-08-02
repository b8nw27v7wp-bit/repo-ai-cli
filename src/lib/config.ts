import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * 持久化配置：~/.repo-ai/config.json
 *
 * 配置优先级（从高到低）：
 *   CLI 参数（--provider/--base-url/--model/--api-key）
 *   > 环境变量（LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / 各提供商专用 key）
 *   > 本配置文件（repo-ai config set ...）
 *   > 内置默认值
 */

export interface RepoAIConfig {
  /** LLM 提供商 id（deepseek/openai/...） */
  provider?: string;
  /** 自定义 baseUrl（覆盖 provider 默认） */
  baseUrl?: string;
  /** 模型名（覆盖 provider 默认） */
  model?: string;
  /** API key（明文存储在用户目录，与 .gitconfig 同级信任级别） */
  apiKey?: string;
  /** readme 默认 token 预算 */
  maxTokens?: number;
  /** LLM 最大输出 token */
  maxOutputTokens?: number;
  /** 采样温度 0~2 */
  temperature?: number;
  /** readme 单文件大小上限 KB */
  maxFileKb?: number;
  /** commit diff 截断上限 KB */
  maxDiffKb?: number;
}

export const CONFIG_DIR_NAME = ".repo-ai";
export const CONFIG_FILE_NAME = "config.json";

export function getConfigPath(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

/** 允许通过 config 命令设置的所有键（含类型标注） */
export const CONFIG_KEYS: Array<{
  key: keyof RepoAIConfig;
  label: string;
  type: "string" | "number";
}> = [
  { key: "provider", label: "LLM 提供商 id", type: "string" },
  { key: "baseUrl", label: "自定义 API 端点", type: "string" },
  { key: "model", label: "模型名", type: "string" },
  { key: "apiKey", label: "API key", type: "string" },
  { key: "maxTokens", label: "readme 默认 token 预算", type: "number" },
  { key: "maxOutputTokens", label: "LLM 最大输出 token", type: "number" },
  { key: "temperature", label: "采样温度 (0~2)", type: "number" },
  { key: "maxFileKb", label: "readme 单文件上限 KB", type: "number" },
  { key: "maxDiffKb", label: "commit diff 上限 KB", type: "number" },
];

/** 读取配置；文件不存在 / JSON 损坏时返回 {}（不抛错） */
export async function loadConfig(): Promise<RepoAIConfig> {
  const p = getConfigPath();
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as RepoAIConfig;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** 写入配置（合并已有值）。POSIX 上设置 0600 权限。 */
export async function saveConfig(
  partial: RepoAIConfig,
): Promise<RepoAIConfig> {
  const dir = path.dirname(getConfigPath());
  await fs.mkdir(dir, { recursive: true });
  const existing = await loadConfig();
  const next: RepoAIConfig = { ...existing, ...partial };
  // 清理 undefined 字段
  for (const k of Object.keys(next) as Array<keyof RepoAIConfig>) {
    if (next[k] === undefined) delete next[k];
  }
  const tmp = `${getConfigPath()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  try {
    await fs.chmod(tmp, 0o600);
  } catch {
    /* Windows 无 POSIX 权限位，忽略 */
  }
  await fs.rename(tmp, getConfigPath());
  return next;
}

/** 删除某个键；返回删除后的完整配置 */
export async function unsetConfig(key: keyof RepoAIConfig): Promise<RepoAIConfig> {
  const existing = await loadConfig();
  delete existing[key];
  const tmp = `${getConfigPath()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(existing, null, 2) + "\n", "utf8");
  await fs.rename(tmp, getConfigPath());
  return existing;
}

/** 全部清空（删除配置文件） */
export async function resetConfig(): Promise<void> {
  try {
    await fs.unlink(getConfigPath());
  } catch {
    /* 文件不存在也视为成功 */
  }
}

/** apiKey 打码显示（保留前 4 后 4） */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

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
 *
 * v0.6.0 起支持 profile（多套配置）：
 *   - 顶层字段即 "default" profile
 *   - profiles.<name> 存命名 profile；activeProfile 记录当前激活项
 *   - loadConfig() 返回「顶层字段 ← 激活 profile 覆盖」合并后的有效配置
 */

/** 单个 profile 内允许的配置字段（不含 profile 管理字段本身） */
export type ProfileFields = {
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
};

export interface RepoAIConfig extends ProfileFields {
  /** 当前激活的 profile 名（缺省 = 只用顶层字段） */
  activeProfile?: string;
  /** 命名 profile 集合 */
  profiles?: Record<string, ProfileFields>;
}

/** loadConfig 返回的有效配置：只有业务字段，无 profile 管理字段 */
export type EffectiveConfig = ProfileFields;

export const CONFIG_DIR_NAME = ".repo-ai";
export const CONFIG_FILE_NAME = "config.json";
/** 保留名：指向顶层字段 */
export const DEFAULT_PROFILE = "default";

export function getConfigPath(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

/** 允许通过 config 命令设置的所有键（含类型标注） */
export const CONFIG_KEYS: Array<{
  key: keyof ProfileFields;
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

const PROFILE_FIELDS = new Set(CONFIG_KEYS.map((c) => c.key as string));
const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

/** 校验 profile 名；非法时抛错 */
export function assertValidProfileName(name: string): void {
  if (!PROFILE_NAME_RE.test(name)) {
    throw new Error(
      `非法 profile 名: ${name}（限字母/数字/_-，1~32 字符，不能以符号开头）`,
    );
  }
}

/** 读取原始配置文件；文件不存在 / JSON 损坏时返回 {}（不抛错） */
export async function loadRawConfig(): Promise<RepoAIConfig> {
  const p = getConfigPath();
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as RepoAIConfig;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** 从原始配置中抽出纯业务字段（去掉 profile 管理字段） */
function scalarFields(raw: RepoAIConfig): ProfileFields {
  const out: ProfileFields = {};
  for (const { key } of CONFIG_KEYS) {
    const v = raw[key];
    if (v !== undefined) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

/** 取某个命名 profile 的字段（不存在返回 undefined） */
function namedProfile(raw: RepoAIConfig, name: string): ProfileFields | undefined {
  if (name === DEFAULT_PROFILE) return undefined; // default = 顶层字段
  const p = raw.profiles?.[name];
  return p && typeof p === "object" ? p : undefined;
}

/**
 * 读取有效配置：顶层字段 ← (profile ?? activeProfile) 覆盖。
 * @param profile 显式指定 profile（对应 --profile 参数）；缺省用 activeProfile
 */
export async function loadConfig(profile?: string): Promise<EffectiveConfig> {
  const raw = await loadRawConfig();
  const name = profile ?? raw.activeProfile;
  const base = scalarFields(raw);
  if (!name || name === DEFAULT_PROFILE) return base;
  const overlay = namedProfile(raw, name);
  if (!overlay) return base; // profile 不存在 → 静默回退顶层（doctor 会提示）
  return { ...base, ...overlay };
}

/** 列出所有 profile 概览（不含 apiKey 明文，由调用方打码） */
export async function listProfiles(): Promise<{
  active: string;
  profiles: Record<string, ProfileFields>;
}> {
  const raw = await loadRawConfig();
  const out: Record<string, ProfileFields> = {
    [DEFAULT_PROFILE]: scalarFields(raw),
  };
  for (const [name, fields] of Object.entries(raw.profiles ?? {})) {
    if (fields && typeof fields === "object") out[name] = fields;
  }
  return { active: raw.activeProfile ?? DEFAULT_PROFILE, profiles: out };
}

/** 原子写入配置：先写同目录临时文件再 rename，避免半写状态。POSIX 上 0600 权限。 */
async function writeConfigAtomic(next: RepoAIConfig): Promise<void> {
  const dir = path.dirname(getConfigPath());
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${getConfigPath()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  try {
    await fs.chmod(tmp, 0o600);
  } catch {
    /* Windows 无 POSIX 权限位，忽略 */
  }
  await fs.rename(tmp, getConfigPath());
}

/**
 * 写入配置（合并已有值）。
 * @param profile 目标 profile；缺省 / "default" 写顶层字段
 */
export async function saveConfig(
  partial: ProfileFields,
  profile?: string,
): Promise<RepoAIConfig> {
  const raw = await loadRawConfig();
  if (!profile || profile === DEFAULT_PROFILE) {
    const next: RepoAIConfig = { ...raw, ...partial };
    for (const k of Object.keys(next) as Array<keyof RepoAIConfig>) {
      if (next[k] === undefined) delete next[k];
    }
    await writeConfigAtomic(next);
    return next;
  }
  assertValidProfileName(profile);
  const existing = raw.profiles?.[profile] ?? {};
  const merged: ProfileFields = { ...existing, ...partial };
  for (const k of Object.keys(merged) as Array<keyof ProfileFields>) {
    if (merged[k] === undefined) delete merged[k];
  }
  const next: RepoAIConfig = {
    ...raw,
    profiles: { ...(raw.profiles ?? {}), [profile]: merged },
  };
  await writeConfigAtomic(next);
  return next;
}

/** 删除某个键；返回删除后的完整原始配置 */
export async function unsetConfig(
  key: keyof ProfileFields,
  profile?: string,
): Promise<RepoAIConfig> {
  const raw = await loadRawConfig();
  if (!profile || profile === DEFAULT_PROFILE) {
    delete raw[key];
    await writeConfigAtomic(raw);
    return raw;
  }
  const p = raw.profiles?.[profile];
  if (p) {
    delete p[key];
    if (Object.keys(p).length === 0 && raw.profiles) {
      // 空 profile 顺手清掉
      delete raw.profiles[profile];
    }
  }
  await writeConfigAtomic(raw);
  return raw;
}

/** 切换激活 profile（必须已存在；"default" 表示清除激活状态） */
export async function setActiveProfile(name: string): Promise<void> {
  if (name === DEFAULT_PROFILE) {
    const raw = await loadRawConfig();
    delete raw.activeProfile;
    await writeConfigAtomic(raw);
    return;
  }
  assertValidProfileName(name);
  const raw = await loadRawConfig();
  if (!raw.profiles?.[name]) {
    throw new Error(
      `profile "${name}" 不存在。先用 config set <key> <value> --profile ${name} 创建，或 config list 查看现有 profile。`,
    );
  }
  raw.activeProfile = name;
  await writeConfigAtomic(raw);
}

/** 删除命名 profile；若它是激活项则同时取消激活 */
export async function removeProfile(name: string): Promise<void> {
  if (name === DEFAULT_PROFILE) {
    throw new Error('不能删除 "default"（用 config reset 清空全部配置）');
  }
  assertValidProfileName(name);
  const raw = await loadRawConfig();
  if (!raw.profiles?.[name]) {
    throw new Error(`profile "${name}" 不存在`);
  }
  delete raw.profiles[name];
  if (Object.keys(raw.profiles).length === 0) delete raw.profiles;
  if (raw.activeProfile === name) delete raw.activeProfile;
  await writeConfigAtomic(raw);
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

/** profile 字段摘要（用于 list 输出，apiKey 打码） */
export function summarizeProfile(fields: ProfileFields): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of Object.keys(fields) as Array<keyof ProfileFields>) {
    if (!PROFILE_FIELDS.has(key)) continue;
    const v = fields[key];
    if (v === undefined) continue;
    out[key] = key === "apiKey" && typeof v === "string" ? maskSecret(v) : v;
  }
  return out;
}

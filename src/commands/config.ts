import {
  CONFIG_KEYS,
  DEFAULT_PROFILE,
  listProfiles,
  loadConfig,
  maskSecret,
  removeProfile,
  resetConfig,
  saveConfig,
  setActiveProfile,
  summarizeProfile,
  unsetConfig,
  type ProfileFields,
} from "../lib/config.js";
import { findProvider, PROVIDERS } from "../lib/providers.js";
import { debug } from "../lib/log.js";
import { done, fail } from "../lib/ui.js";

const interactive = Boolean(process.stdout.isTTY);

/** 数值配置项的取值范围校验规则 */
const NUMERIC_RULES: Record<
  string,
  { min: number; max?: number; int?: boolean }
> = {
  temperature: { min: 0, max: 2 },
  maxTokens: { min: 1, int: true },
  maxOutputTokens: { min: 1, int: true },
  maxFileKb: { min: 1, int: true },
  maxDiffKb: { min: 1, int: true },
};

/** 校验数值配置项；合法返回 null，非法返回错误文案 */
export function validateNumericValue(key: string, value: string): string | null {
  const rule = NUMERIC_RULES[key];
  if (!rule) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${key} 需要数字，收到: ${value}`;
  if (n < rule.min || (rule.max !== undefined && n > rule.max)) {
    return `${key} 超出范围 ${rule.min}${rule.max !== undefined ? `~${rule.max}` : " 及以上"}，收到: ${value}`;
  }
  if (rule.int && !Number.isInteger(n)) return `${key} 需要整数，收到: ${value}`;
  return null;
}

function failJson(msg: string, json: boolean): boolean {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
    process.exitCode = 1;
    return true;
  }
  return false;
}

/** 校验 provider id 是否合法；非法返回错误文案 */
function providerError(value: string): string | null {
  if (!findProvider(value)) {
    return `未知 provider: ${value}。支持: ${PROVIDERS.map((p) => p.id).join(", ")}`;
  }
  return null;
}

/** profile 显示名（undefined/default → default） */
function profileLabel(profile?: string): string {
  return profile && profile !== DEFAULT_PROFILE ? profile : DEFAULT_PROFILE;
}

/** 输出单个值（含是否来自配置的标注） */
export async function runConfigGet(
  key: string,
  opts: { profile?: string } = {},
): Promise<void> {
  const cfg = await loadConfig(opts.profile);
  const k = key as keyof ProfileFields;
  if (!(k in cfg)) {
    fail(`未设置: ${key}（profile: ${profileLabel(opts.profile)}）`);
    return;
  }
  const value = cfg[k];
  if (typeof value === "string" && k === "apiKey") {
    console.log(maskSecret(value));
  } else {
    console.log(String(value));
  }
}

export async function runConfigSet(
  key: string,
  value: string,
  opts: { json?: boolean; profile?: string } = {},
): Promise<void> {
  const meta = CONFIG_KEYS.find((c) => c.key === key);
  if (!meta) {
    const err = `未知配置项: ${key}。可用: ${CONFIG_KEYS.map((c) => c.key).join(", ")}`;
    if (failJson(err, opts.json === true)) return;
    fail(err);
    return;
  }
  if (key === "provider") {
    const err = providerError(value);
    if (err) {
      if (failJson(err, opts.json === true)) return;
      fail(err);
      return;
    }
  }

  let parsed: string | number = value;
  if (meta.type === "number") {
    const err = validateNumericValue(key, value);
    if (err) {
      if (failJson(err, opts.json === true)) return;
      fail(err);
      return;
    }
    parsed = Number(value);
  }
  await saveConfig({ [key]: parsed } as Partial<ProfileFields>, opts.profile);
  const display = key === "apiKey" ? maskSecret(value) : value;
  const where = profileLabel(opts.profile);
  debug(`config set ${key} → profile ${where}`);
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, key, value: display, profile: where }));
    return;
  }
  done(
    where === DEFAULT_PROFILE
      ? `${key} = ${display} 已保存到 ~/.repo-ai/config.json`
      : `${key} = ${display} 已保存到 profile "${where}"`,
  );
}

export async function runConfigUnset(
  key: string,
  opts: { json?: boolean; profile?: string } = {},
): Promise<void> {
  if (!CONFIG_KEYS.some((c) => c.key === key)) {
    const err = `未知配置项: ${key}。可用: ${CONFIG_KEYS.map((c) => c.key).join(", ")}`;
    if (failJson(err, opts.json === true)) return;
    fail(err);
    return;
  }
  await unsetConfig(key as keyof ProfileFields, opts.profile);
  if (opts.json) {
    console.log(
      JSON.stringify({ ok: true, key, unset: true, profile: profileLabel(opts.profile) }),
    );
    return;
  }
  done(`${key} 已清除（profile: ${profileLabel(opts.profile)}）`);
}

export async function runConfigReset(opts: { json?: boolean } = {}): Promise<void> {
  await resetConfig();
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, reset: true }));
    return;
  }
  done("配置已全部清除（含所有 profile）");
}

/** 列出全部 profile（apiKey 打码；激活项标 *） */
export async function runConfigList(opts: { json?: boolean } = {}): Promise<void> {
  const { active, profiles } = await listProfiles();
  if (opts.json) {
    const out: Record<string, Record<string, string | number>> = {};
    for (const [name, fields] of Object.entries(profiles)) {
      out[name] = summarizeProfile(fields);
    }
    console.log(JSON.stringify({ ok: true, active, profiles: out }));
    return;
  }
  let empty = true;
  for (const [name, fields] of Object.entries(profiles)) {
    const summary = summarizeProfile(fields);
    if (name !== DEFAULT_PROFILE || Object.keys(summary).length > 0) empty = false;
    const marker = name === active ? "*" : " ";
    console.log(`${marker} ${name}:`);
    const keys = Object.keys(summary);
    if (keys.length === 0) {
      console.log("    （空）");
      continue;
    }
    for (const k of keys) {
      const meta = CONFIG_KEYS.find((c) => c.key === k);
      console.log(`    ${k} = ${summary[k]}${meta ? ` (${meta.label})` : ""}`);
    }
  }
  if (empty) console.log("（未配置任何项，使用环境变量或默认值）");
  else console.log(`（* = 激活 profile；切换: repo-ai-cli config use <name>）`);
}

/** 切换激活 profile */
export async function runConfigUse(
  name: string,
  opts: { json?: boolean } = {},
): Promise<void> {
  try {
    await setActiveProfile(name);
  } catch (err) {
    const msg = (err as Error).message;
    if (failJson(msg, opts.json === true)) return;
    fail(msg);
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, active: name }));
    return;
  }
  done(
    name === DEFAULT_PROFILE
      ? "已切回默认配置（default）"
      : `已激活 profile "${name}"`,
  );
}

/** 删除命名 profile */
export async function runConfigRemoveProfile(
  name: string,
  opts: { json?: boolean } = {},
): Promise<void> {
  try {
    await removeProfile(name);
  } catch (err) {
    const msg = (err as Error).message;
    if (failJson(msg, opts.json === true)) return;
    fail(msg);
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, removed: name }));
    return;
  }
  done(`profile "${name}" 已删除`);
}

/** 交互式初始化向导：选择 provider → 输入 apiKey（可存到指定 profile） */
export async function runConfigInit(profile?: string): Promise<void> {
  if (!interactive) {
    console.log(
      "非交互环境请用: repo-ai-cli config set provider <id> / config set apiKey <key>",
    );
    return;
  }
  const { select, text, isCancel, intro, outro } = await import("@clack/prompts");
  intro(`repo-ai config init${profile ? ` --profile ${profile}` : ""}`);

  const provider = (await select({
    message: "选择 LLM 提供商",
    options: PROVIDERS.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.id})${p.optionalApiKey ? " · 无需 key" : ""}`,
    })),
  })) as string;
  if (isCancel(provider)) {
    outro("已取消");
    return;
  }

  const p = findProvider(provider);
  const apiKey = (await text({
    message: `输入 ${p?.name ?? provider} 的 API key${p?.optionalApiKey ? "（本地部署可留空）" : ""}`,
    placeholder: p?.docsUrl ? `获取: ${p.docsUrl}` : "sk-xxx",
  })) as string;
  if (isCancel(apiKey)) {
    outro("已取消");
    return;
  }
  if (!apiKey.trim() && !p?.optionalApiKey) {
    outro("✖ API key 不能为空");
    process.exitCode = 1;
    return;
  }

  const partial: ProfileFields = { provider };
  if (apiKey.trim()) partial.apiKey = apiKey.trim();
  await saveConfig(partial, profile);
  outro(
    `✓ 已保存 provider=${provider} 到 ${profileLabel(profile)}${apiKey.trim() ? "（key 已打码存储）" : ""}`,
  );
}

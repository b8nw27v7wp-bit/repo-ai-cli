import {
  CONFIG_KEYS,
  loadConfig,
  maskSecret,
  resetConfig,
  saveConfig,
  unsetConfig,
  type RepoAIConfig,
} from "../lib/config.js";
import { findProvider, PROVIDERS } from "../lib/providers.js";

const interactive = Boolean(process.stdout.isTTY);

function done(msg: string): void {
  console.log(`✓ ${msg}`);
}

function fail(msg: string): void {
  console.error(`✖ ${msg}`);
  process.exitCode = 1;
}

/** 校验 provider id 是否合法 */
function assertValidProvider(value: string): void {
  if (!findProvider(value)) {
    fail(
      `未知 provider: ${value}。支持: ${PROVIDERS.map((p) => p.id).join(", ")}`,
    );
  }
}

/** 输出单个值（含是否来自配置的标注） */
export async function runConfigGet(key: string): Promise<void> {
  const cfg = await loadConfig();
  const k = key as keyof RepoAIConfig;
  if (!(k in cfg)) {
    fail(`未设置: ${key}`);
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
  opts: { json?: boolean } = {},
): Promise<void> {
  const meta = CONFIG_KEYS.find((c) => c.key === key);
  if (!meta) {
    const err = `未知配置项: ${key}。可用: ${CONFIG_KEYS.map((c) => c.key).join(", ")}`;
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: err }));
      process.exitCode = 1;
      return;
    }
    fail(err);
    return;
  }
  if (key === "provider") assertValidProvider(value);

  let parsed: string | number = value;
  if (meta.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      const err = `${key} 需要数字，收到: ${value}`;
      if (opts.json) {
        console.log(JSON.stringify({ ok: false, error: err }));
        process.exitCode = 1;
        return;
      }
      fail(err);
      return;
    }
    parsed = n;
  }

  await saveConfig({ [key]: parsed } as Partial<RepoAIConfig>);
  const display = key === "apiKey" ? maskSecret(value) : value;
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, key, value: display }));
    return;
  }
  done(`${key} = ${display} 已保存到 ~/.repo-ai/config.json`);
}

export async function runConfigUnset(
  key: string,
  opts: { json?: boolean } = {},
): Promise<void> {
  if (!CONFIG_KEYS.some((c) => c.key === key)) {
    const err = `未知配置项: ${key}。可用: ${CONFIG_KEYS.map((c) => c.key).join(", ")}`;
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: err }));
      process.exitCode = 1;
      return;
    }
    fail(err);
    return;
  }
  await unsetConfig(key as keyof RepoAIConfig);
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, key, unset: true }));
    return;
  }
  done(`${key} 已清除`);
}

export async function runConfigReset(opts: { json?: boolean } = {}): Promise<void> {
  await resetConfig();
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, reset: true }));
    return;
  }
  done("配置已全部清除");
}

/** 列出全部配置（apiKey 打码） */
export async function runConfigList(opts: { json?: boolean } = {}): Promise<void> {
  const cfg = await loadConfig();
  if (opts.json) {
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(cfg)) {
      out[k] = k === "apiKey" && typeof v === "string" ? maskSecret(v) : (v as string | number);
    }
    console.log(JSON.stringify(out));
    return;
  }
  const keys = Object.keys(cfg) as Array<keyof RepoAIConfig>;
  if (keys.length === 0) {
    console.log("（未配置任何项，使用环境变量或默认值）");
    return;
  }
  for (const k of keys) {
    const v = cfg[k];
    const meta = CONFIG_KEYS.find((c) => c.key === k);
    const label = meta ? ` (${meta.label})` : "";
    if (k === "apiKey" && typeof v === "string") {
      console.log(`${k} = ${maskSecret(v)}${label}`);
    } else {
      console.log(`${k} = ${v}${label}`);
    }
  }
}

/** 交互式初始化向导：选择 provider → 输入 apiKey */
export async function runConfigInit(): Promise<void> {
  if (!interactive) {
    console.log(
      "非交互环境请用: repo-ai-cli config set provider <id> / config set apiKey <key>",
    );
    return;
  }
  const { select, text, isCancel } = await import("@clack/prompts");
  const { intro, outro } = await import("@clack/prompts");
  intro("repo-ai config init");

  const provider = (await select({
    message: "选择 LLM 提供商",
    options: PROVIDERS.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.id})`,
    })),
  })) as string;
  if (isCancel(provider)) {
    outro("已取消");
    return;
  }

  const p = findProvider(provider);
  const apiKey = (await text({
    message: `输入 ${p?.name ?? provider} 的 API key`,
    placeholder: p?.docsUrl ? `获取: ${p.docsUrl}` : "sk-xxx",
  })) as string;
  if (isCancel(apiKey)) {
    outro("已取消");
    return;
  }
  if (!apiKey.trim()) {
    outro("✖ API key 不能为空");
    process.exitCode = 1;
    return;
  }

  await saveConfig({ provider, apiKey: apiKey.trim() });
  outro(`✓ 已保存 provider=${provider}（key 已打码存储）`);
}

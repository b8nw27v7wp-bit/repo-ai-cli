import { promises as fs } from "node:fs";
import { assertInGitRepo } from "./git.js";
import { PROVIDERS } from "./providers.js";
import { loadConfig, loadRawConfig, getConfigPath } from "./config.js";

export interface CheckResult {
  id: string;
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  /** 非通过项的一句修复建议（输出在诊断表之后） */
  fix?: string;
}

/** 常见 API key 的前缀启发式（仅格式提示，不代表 key 有效） */
const KEY_PREFIXES: Record<string, string> = {
  openai: "sk-",
  deepseek: "sk-",
  xai: "xai-",
  groq: "gsk_",
};

/** 代理相关环境变量（HTTP(S)_PROXY 影响所有 LLM 请求；NO_PROXY 排除本地地址） */
const PROXY_VARS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy"] as const;

/**
 * 体检项：Node 版本 / git 仓库 / 配置文件存在性与合法性 /
 * 激活 profile / 各 provider API key 配置状态 / 网络代理。
 * 全部离线，只查非空与格式前缀，绝不真实调用任何 API。
 */
export async function collectChecks(cwd: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // 1. Node.js 版本（引擎要求 ≥ 20）
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({
    id: "node",
    name: "Node.js 版本",
    ...(major >= 20
      ? { status: "ok" as const, detail: `v${process.versions.node}（需要 ≥ 20）` }
      : {
          status: "fail" as const,
          detail: `v${process.versions.node}（需要 ≥ 20）`,
          fix: "升级 Node.js 到 20 及以上：https://nodejs.org/",
        }),
  });

  // 2. 是否在 git 仓库内
  try {
    await assertInGitRepo(cwd);
    checks.push({
      id: "git",
      name: "Git 仓库",
      status: "ok",
      detail: "当前目录在 git 仓库内",
    });
  } catch {
    checks.push({
      id: "git",
      name: "Git 仓库",
      status: "warn",
      detail: "当前目录不在 git 仓库内（commit/review/changelog/pr 需要）",
      fix: "cd 到项目目录后重试，或执行 git init 初始化新仓库",
    });
  }

  // 3. 配置文件存在性与合法性（坏 JSON 不再静默吞掉，明确报 fail）
  let rawCfg: Awaited<ReturnType<typeof loadRawConfig>>;
  let cfgValid = true;
  try {
    const text = await fs.readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    rawCfg = parsed as Awaited<ReturnType<typeof loadRawConfig>>;
    cfgValid = true;
    checks.push({
      id: "config",
      name: "配置文件",
      status: "ok",
      detail: `${getConfigPath()}`,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      rawCfg = {};
      checks.push({
        id: "config",
        name: "配置文件",
        status: "warn",
        detail: "未创建（当前用环境变量或命令行参数也可正常使用）",
        fix: "可选：repo-ai-cli config set provider deepseek && repo-ai-cli config set apiKey <key>",
      });
    } else {
      rawCfg = {};
      cfgValid = false;
      checks.push({
        id: "config",
        name: "配置文件",
        status: "fail",
        detail: `${getConfigPath()} 存在但不是合法的 JSON 对象`,
        fix: `修复或删除该文件后重试，例如 repo-ai-cli config reset（会清空全部配置）`,
      });
    }
  }

  // 4. 激活 profile 是否真实存在（loadConfig 对缺失 profile 会静默回退，这里显式提醒）
  if (cfgValid && rawCfg.activeProfile) {
    const exists = rawCfg.activeProfile === "default" || Boolean(rawCfg.profiles?.[rawCfg.activeProfile]);
    checks.push(
      exists
        ? {
            id: "profile",
            name: "激活 profile",
            status: "ok",
            detail: `${rawCfg.activeProfile}`,
          }
        : {
            id: "profile",
            name: "激活 profile",
            status: "fail",
            detail: `activeProfile "${rawCfg.activeProfile}" 在 profiles 中不存在`,
            fix: "repo-ai-cli config use <已有profile> 或 repo-ai-cli config unset 后重建",
          },
    );
  }

  // 5. LLM key：逐 provider 报告配置状态（非空 + 前缀启发式），不打印 key 本身
  const cfg = await loadConfig();
  const keyLines: string[] = [];
  let anyUsable = false;
  for (const p of PROVIDERS) {
    // 本地部署类（Ollama）无需 key，仅在显式 --provider ollama 时生效：只作信息展示
    if (p.optionalApiKey) {
      keyLines.push(`${p.name}: 本地（无需 key，--provider ${p.id} 启用）`);
      continue;
    }
    const envVal = process.env[p.apiKeyEnv];
    const cfgVal = typeof cfg.apiKey === "string" ? cfg.apiKey : undefined;
    const source = envVal ? "env" : cfg.provider && cfg.provider === p.id && cfgVal ? "config" : undefined;
    if (!source) {
      keyLines.push(`${p.name}: 未配置`);
      continue;
    }
    const val = source === "env" ? envVal : cfgVal;
    const expectedPrefix = KEY_PREFIXES[p.id];
    if (!p.optionalApiKey && val && expectedPrefix && !val.startsWith(expectedPrefix)) {
      keyLines.push(`${p.name}: 已配置但前缀异常（期望 ${expectedPrefix}*，可能是占位符/复制错误）`);
      continue;
    }
    anyUsable = true;
    keyLines.push(`${p.name}: ✓`);
  }
  // 状态机：完全没配 key → fail；配了但存在前缀异常 → warn（离线无法断言无效，
  // 运行时仍会尝试使用）；全部格式正常 → ok
  const bad = keyLines.filter((l) => l.includes("前缀异常")).length;
  const llmCheck: CheckResult = { id: "llm", name: "LLM 提供商 Key", status: "ok", detail: "" };
  if (!anyUsable && bad === 0) {
    llmCheck.status = "fail";
    llmCheck.detail = `未检测到任何 API Key。${keyLines.join("；")}`;
    llmCheck.fix =
      "任选一家：repo-ai-cli config set provider deepseek && repo-ai-cli config set apiKey <key>，或 export DEEPSEEK_API_KEY=...";
  } else if (bad > 0) {
    llmCheck.status = "warn";
    llmCheck.detail = `${bad} 家已配置但前缀异常（可能无法通过鉴权）。${keyLines.join("；")}`;
    llmCheck.fix = "检查对应环境变量是否为完整正确的 key（doctor 只看前缀，不做真实请求验证）";
  } else {
    llmCheck.detail = keyLines.join("；");
  }
  checks.push(llmCheck);

  // 6. 网络代理环境变量（只报告状态，不做网络探测）
  const proxySet = PROXY_VARS.filter((v) => process.env[v]).map((v) => `${v}=${process.env[v]}`);
  checks.push(
    proxySet.length > 0
      ? {
          id: "proxy",
          name: "网络代理",
          status: "ok",
          detail: proxySet.join(", "),
        }
      : {
          id: "proxy",
          name: "网络代理",
          status: "warn",
          detail: "未设置 HTTP(S)_PROXY / NO_PROXY（访问 OpenAI/xAI/Gemini 等境外端点可能需要代理）",
          fix: "如需代理：export HTTPS_PROXY=http://127.0.0.1:<port> 与 NO_PROXY=127.0.0.1,localhost",
        },
  );

  return checks;
}

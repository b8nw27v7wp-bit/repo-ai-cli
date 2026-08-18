import { assertInGitRepo } from "./git.js";
import { resolveLLMConfig } from "./providers.js";
import { loadConfig, getConfigPath } from "./config.js";

export interface CheckResult {
  id: string;
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

/**
 * 体检项：Node 版本 / git 仓库 / 持久化配置 / LLM key。
 * 全部离线，不调用任何外部 API。
 */
export async function collectChecks(cwd: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // 1. Node.js 版本（引擎要求 ≥ 20）
  const major = Number(process.versions.node.split(".")[0]);
  checks.push(
    major >= 20
      ? {
          id: "node",
          name: "Node.js 版本",
          status: "ok",
          detail: `v${process.versions.node}（需要 ≥ 20）`,
        }
      : {
          id: "node",
          name: "Node.js 版本",
          status: "fail",
          detail: `v${process.versions.node}（需要 ≥ 20）`,
        },
  );

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
    });
  }

  // 3. 持久化配置
  const cfg = await loadConfig();
  const cfgKeys = Object.keys(cfg).length;
  checks.push(
    cfgKeys > 0
      ? {
          id: "config",
          name: "持久化配置",
          status: "ok",
          detail: `${getConfigPath()}（${cfgKeys} 项）`,
        }
      : {
          id: "config",
          name: "持久化配置",
          status: "warn",
          detail: "未配置（可用 repo-ai-cli config set，或用环境变量）",
        },
  );

  // 4. LLM key（不打印 key 本身）
  try {
    const r = resolveLLMConfig({ config: cfg });
    checks.push({
      id: "llm",
      name: "LLM 提供商",
      status: "ok",
      detail: `${r.providerName}（${r.model}）· key 已配置`,
    });
  } catch {
    checks.push({
      id: "llm",
      name: "LLM 提供商",
      status: "fail",
      detail: "未检测到 API Key（用 config set 或环境变量配置）",
    });
  }

  return checks;
}
/**
 * LLM 提供商注册表（全部走 OpenAI 兼容 chat/completions 协议）。
 * 新增提供商只需在这里加一行。
 */

export interface Provider {
  id: string;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  /** 该提供商 API key 的环境变量名 */
  apiKeyEnv: string;
  /** 获取 key 的地址（用于错误提示） */
  docsUrl?: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    docsUrl: "https://platform.deepseek.com/",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    apiKeyEnv: "MOONSHOT_API_KEY",
    docsUrl: "https://platform.moonshot.cn/console/api-keys",
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    apiKeyEnv: "ZHIPU_API_KEY",
    docsUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  {
    id: "qwen",
    name: "通义千问 (DashScope)",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    docsUrl: "https://bailian.console.aliyun.com/",
  },
  {
    id: "minimax",
    name: "MiniMax",
    defaultBaseUrl: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-Text-01",
    apiKeyEnv: "MINIMAX_API_KEY",
    docsUrl: "https://platform.minimaxi.com/",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    apiKeyEnv: "XAI_API_KEY",
    docsUrl: "https://console.x.ai/",
  },
  {
    id: "siliconflow",
    name: "硅基流动 (SiliconFlow)",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    apiKeyEnv: "SILICONFLOW_API_KEY",
    docsUrl: "https://cloud.siliconflow.cn/account/ak",
  },
];

/** 自定义 OpenAI 兼容端点（LLM_BASE_URL + LLM_API_KEY） */
export const CUSTOM_PROVIDER_ID = "custom";

export const DEFAULT_PROVIDER_ID = "deepseek";

export function findProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id.toLowerCase());
}

export interface ResolvedLLMConfig {
  providerId: string;
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ResolveInput {
  /** --provider 显式指定 */
  provider?: string;
  /** --base-url 显式指定 */
  baseUrl?: string;
  /** --model 显式指定 */
  model?: string;
  /** --api-key 显式指定（不推荐，会出现在 shell 历史） */
  apiKey?: string;
  /** 来自 ~/.repo-ai/config.json 的持久化配置（优先级低于 env，高于默认值） */
  config?: {
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
}

/**
 * 解析最终生效的 LLM 配置。优先级：
 * 1. CLI 显式参数（--provider / --base-url / --model / --api-key）
 * 2. 自定义端点环境变量（LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）
 * 3. 配置文件（~/.repo-ai/config.json，repo-ai config set 写入）
 * 4. 内置提供商专用 key（DEEPSEEK_API_KEY 等）——按注册表顺序选第一个存在的
 * 全都没有 → 抛错并列出所有选项。
 */
export function resolveLLMConfig(input: ResolveInput = {}): ResolvedLLMConfig {
  const cfg = input.config ?? {};
  // --base-url / --model 显式给出但没指定 provider → 视为自定义
  const explicitBaseUrl = input.baseUrl ?? process.env.LLM_BASE_URL ?? cfg.baseUrl;
  const explicitModel = input.model ?? process.env.LLM_MODEL ?? cfg.model;
  const explicitApiKey = input.apiKey ?? process.env.LLM_API_KEY ?? cfg.apiKey;

  // 1. 显式 provider（CLI 优先，其次配置文件）
  const providerId = input.provider ?? cfg.provider;
  if (providerId) {
    const p = findProvider(providerId);
    if (!p) {
      throw new Error(
        `未知 provider: ${providerId}。支持: ${PROVIDERS.map((x) => x.id).join(", ")}（或设置 LLM_BASE_URL 使用自定义端点）`,
      );
    }
    const apiKey = input.apiKey ?? process.env[p.apiKeyEnv] ?? cfg.apiKey;
    if (!apiKey) {
      throw new Error(
        `provider "${p.id}"（${p.name}）需要设置环境变量 ${p.apiKeyEnv}。\n` +
          `获取 key: ${p.docsUrl ?? "见官方文档"}\n` +
          `或用: repo-ai-cli config set apiKey <key> 持久化到 ~/.repo-ai/config.json`,
      );
    }
    return {
      providerId: p.id,
      providerName: p.name,
      baseUrl: explicitBaseUrl ?? p.defaultBaseUrl,
      model: explicitModel ?? p.defaultModel,
      apiKey,
    };
  }

  // 2. 自定义端点（LLM_BASE_URL 设置了）
  if (explicitBaseUrl) {
    const apiKey = explicitApiKey;
    if (!apiKey) {
      throw new Error(
        "已检测到 LLM_BASE_URL（自定义端点），但未设置 LLM_API_KEY。请同时设置：\n" +
          "  export LLM_BASE_URL=https://your-endpoint/v1\n" +
          "  export LLM_API_KEY=sk-xxx\n" +
          "或用: repo-ai-cli config set apiKey <key> 持久化到 ~/.repo-ai/config.json",
      );
    }
    return {
      providerId: CUSTOM_PROVIDER_ID,
      providerName: "自定义 (LLM_BASE_URL)",
      baseUrl: explicitBaseUrl,
      model: explicitModel ?? "gpt-4o-mini",
      apiKey,
    };
  }

  // 4. 内置提供商：按注册表顺序选第一个有 key 的
  // 注意：到这一步时 explicitBaseUrl 一定是 falsy（步骤 2 已 return），直接用默认值
  for (const p of PROVIDERS) {
    const apiKey = input.apiKey ?? process.env[p.apiKeyEnv] ?? cfg.apiKey;
    if (apiKey) {
      return {
        providerId: p.id,
        providerName: p.name,
        baseUrl: p.defaultBaseUrl,
        model: explicitModel ?? p.defaultModel,
        apiKey,
      };
    }
  }

  // 5. 什么都没有
  const envList = PROVIDERS.map(
    (p) => `  ${p.apiKeyEnv}  →  ${p.name}`,
  ).join("\n");
  throw new Error(
    "未检测到任何 LLM API Key。任选其一：\n" +
      "a) 设置提供商专用变量：\n" +
      envList +
      "\n" +
      "b) 或使用自定义 OpenAI 兼容端点：\n" +
      "  export LLM_BASE_URL=https://your-endpoint/v1\n" +
      "  export LLM_API_KEY=sk-xxx\n" +
      "c) 或持久化配置（推荐，一次设置长期生效）：\n" +
      "  repo-ai-cli config set provider deepseek\n" +
      "  repo-ai-cli config set apiKey sk-xxx\n" +
      "d) 或临时指定：repo-ai-cli readme --provider deepseek --api-key sk-xxx",
  );
}

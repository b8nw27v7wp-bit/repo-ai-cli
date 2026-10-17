import type { EffectiveConfig } from "./lib/config.js";

/** 文件收集优先级：1 最高（反映项目定位），3 最低（采样） */
export type Priority = 1 | 2 | 3;

export interface CollectedFile {
  /** 相对项目根的路径，POSIX 风格（如 src/index.ts） */
  relPath: string;
  content: string;
  sizeBytes: number;
  priority: Priority;
}

export interface CollectOptions {
  /** 单文件大小上限（字节），默认 100KB */
  maxFileBytes?: number;
  /** 是否尊重 .gitignore（非 git 仓库自动跳过） */
  respectGitignore?: boolean;
  /**
   * 每发现一个因敏感文件名或疑似明文密钥而被排除的文件就回调一次（相对路径）。
   * 用于调用方 warn 上报——被排除的文件不会进 LLM 材料，静默丢弃会让用户困惑。
   */
  onSensitiveSkipped?: (relPath: string) => void;
}

export type IncludeMode = "full" | "sample" | "skip";

export interface BudgetedFile {
  file: CollectedFile;
  mode: IncludeMode;
  /** sample/skip 时的原因说明 */
  note?: string;
}

export interface BudgetResult {
  /** 组装好的目录树文本 */
  treeText: string;
  files: BudgetedFile[];
  /** 全部内容（tree + 文件）的估算 token 数 */
  estimatedTokens: number;
  /** 被跳过文件的说明行 */
  skippedNote?: string;
}

/**
 * 12 条 AI 命令共有的选项。
 *
 * 这 8 个字段此前在 12 个接口里逐字重复（96 处），加一个 LLM 参数要改 12 个接口。
 * 抽出来之后，「加参数」只需改这里 + cli/shared.ts 的 withLLMOptions 一处。
 *
 * 注意 `maxOutputTokens` / `temperature` 仍是可选的：llm.ts 里有最后的兜底
 * （4096 / 0.7），而各命令的内置默认值由 cli/register-ai.ts 的 commander 默认值提供。
 */
export interface AiCommandBase {
  /** LLM 提供商 id（deepseek 等），见 lib/providers.ts */
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  /** 使用指定 profile 的持久化配置（默认用 activeProfile/default） */
  profile?: string;
  /** 最大输出 token 数 */
  maxOutputTokens?: number;
  /** 采样温度 0~2 */
  temperature?: number;
  /** JSON 输出（脚本友好） */
  json?: boolean;
  /**
   * CLI 层已解析好的持久化配置（顶层字段 ← 激活 profile 覆盖）。
   *
   * 命令层不再自己读 `~/.repo-ai/config.json`：配置解析只在 cli/register-ai.ts
   * 一处发生，命令层收到的是「CLI 参数 > 配置 > 内置默认」三层规则解析后的结果。
   * 直接调用 runX 时可以不传，此时 provider 解析回退到环境变量。
   */
  resolvedConfig?: EffectiveConfig;
}

export interface ReadmeOptions extends AiCommandBase {
  /** 目标路径或目录，默认 "." */
  target: string;
  output?: string;
  language: "bilingual" | "zh" | "en";
  dryRun?: boolean;
  /** 材料 token 预算（CLI > 配置 maxTokens > 内置默认） */
  maxTokens: number;
  /** 单文件上限 KB（CLI > 配置 maxFileKb > 内置默认） */
  maxFileKb: number;
  /** 流式输出（TTY 下边生成边打印） */
  stream?: boolean;
}

export interface CommitOptions extends AiCommandBase {
  staged?: boolean;
  all?: boolean;
  print?: boolean;
  type?: string;
  /** diff 截断上限 KB（CLI > 配置 maxDiffKb > 内置默认） */
  maxDiffKb: number;
}

export interface ReviewOptions extends AiCommandBase {
  /** 使用暂存区改动（默认 staged） */
  staged?: boolean;
  /** 包含未暂存改动 */
  all?: boolean;
  /** 审查维度：all | bugs | security | style | perf（默认 all） */
  focus?: string;
  /** 输出文件（默认打印到 stdout） */
  output?: string;
  /** diff 截断上限 KB（CLI > 配置 maxDiffKb > 内置默认） */
  maxDiffKb: number;
}

export interface ExplainOptions extends AiCommandBase {
  /** 文件路径，可带 :行号 或 :起-止（如 src/lib/git.ts:38） */
  target: string;
  /** 输出语言：zh | en | bilingual */
  language: "zh" | "en" | "bilingual";
  /** 单文件读取上限 KB（CLI > 配置 maxFileKb > 内置默认） */
  maxFileKb: number;
}

export interface PrOptions extends AiCommandBase {
  /** base 分支（默认自动检测 origin/HEAD → main → master） */
  base?: string;
  /** diff 截断上限 KB（CLI > 配置 maxDiffKb > 内置默认） */
  maxDiffKb: number;
  /** 生成后用 gh pr create 直接创建 PR（非 JSON 模式） */
  create?: boolean;
}

export interface InitOptions {
  /** 项目名（可选；缺省用当前目录名） */
  name?: string;
  /** 模板 id：ts-cli | ts-lib */
  template?: string;
  /** 覆盖已存在的文件 */
  force?: boolean;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface SecretsOptions {
  /** 扫描目录（默认当前目录） */
  target?: string;
  /** 只报告 >= 此级别：critical | high | medium */
  severity?: string;
  /** 单文件扫描上限 KB（CLI > 配置 maxFileKb > 内置默认） */
  maxFileKb: number;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface DoctorOptions {
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface ReviewPrOptions extends AiCommandBase {
  /** PR 引用：https://github.com/owner/repo/pull/123、owner/repo#123、owner/repo/pull/123 */
  target: string;
  /** 审查维度：all | bugs | security | style | perf（默认 all） */
  focus?: string;
  /** 输出文件（默认打印到 stdout） */
  output?: string;
  /** diff 截断上限 KB（CLI > 配置 maxDiffKb > 内置默认） */
  maxDiffKb: number;
  /** 把审查结论作为 PR 评论发布（默认只预览，需配合 yes 才真发） */
  comment?: boolean;
  /** 确认发布评论；非交互模式下这是唯一的授权方式 */
  yes?: boolean;
}

export interface GitignoreOptions {
  /** 模板 id 列表（node/python/go/...），空则报错提示 --list */
  templates?: string[];
  /** 列出可用模板 */
  list?: boolean;
  /** 输出文件（默认 stdout） */
  output?: string;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface LicenseOptions {
  /** 许可 id：mit/isc/bsd-2-clause/bsd-3-clause/unlicense/mit-0 */
  license?: string;
  /** 版权人（默认 git config user.name） */
  name?: string;
  /** 年份（默认当前年） */
  year?: string;
  /** 输出文件（默认 LICENSE） */
  output?: string;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface StatsOptions {
  /** 目录（默认当前目录） */
  target?: string;
  /** 只统计该日期起（含当日，YYYY-MM-DD）的提交与贡献者；缺省统计全部历史 */
  since?: string;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface DepsOptions {
  /** JSON 输出（脚本友好） */
  json?: boolean;
  /** 检查依赖是否有新版本（封装 npm outdated，离线解析清单本身） */
  outdated?: boolean;
  /** 运行 npm audit 安全检查 */
  audit?: boolean;
}

export interface BadgesOptions {
  /** 输出文件（默认 stdout） */
  output?: string;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface ContributingOptions {
  /** 输出文件（默认 CONTRIBUTING.md） */
  output?: string;
  /** 语言：zh | en（默认 zh） */
  language?: "zh" | "en";
  /** 覆盖已存在的文件 */
  force?: boolean;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface TranslateOptions extends AiCommandBase {
  /** 输入文件路径 */
  file: string;
  /** 目标语言：zh | en | bilingual */
  to?: string;
  /** 输出文件（默认 stdout） */
  output?: string;
  /** 单文件读取上限 KB（CLI > 配置 maxFileKb > 内置默认） */
  maxFileKb: number;
}

export interface TestOptions extends AiCommandBase {
  /** 输入文件路径 */
  file: string;
  /** 测试框架：vitest | jest | node-test */
  framework?: string;
  /** 输出文件（默认 stdout） */
  output?: string;
  /** 单文件读取上限 KB（CLI > 配置 maxFileKb > 内置默认） */
  maxFileKb: number;
}

export interface RefactorOptions extends AiCommandBase {
  /** 输入文件路径 */
  file: string;
  /** 聚焦维度：all | readability | perf | complexity | types */
  focus?: string;
  /** 输出文件（默认 stdout） */
  output?: string;
  /** 单文件读取上限 KB（CLI > 配置 maxFileKb > 内置默认） */
  maxFileKb: number;
}

export interface HooksOptions {
  /** 钩子名（默认 prepare-commit-msg） */
  hook?: string;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface AskOptions extends AiCommandBase {
  /** 向代码库提出的问题 */
  question: string;
  /** 材料 token 预算（CLI > 配置 maxTokens > 内置默认） */
  maxTokens: number;
  /** 单文件上限 KB（CLI > 配置 maxFileKb > 内置默认） */
  maxFileKb: number;
  /** 流式输出（TTY 下边生成边打印） */
  stream?: boolean;
}

export interface FixOptions extends AiCommandBase {
  /** bug 描述 */
  description: string;
  /** 材料 token 预算（CLI > 配置 maxTokens > 内置默认） */
  maxTokens: number;
  /** 单文件上限 KB（CLI > 配置 maxFileKb > 内置默认） */
  maxFileKb: number;
}

export interface ReleaseOptions {
  /** major | minor | patch | auto；缺省只建议不修改 */
  bump?: string;
  /** 是否在 bump 后创建 git tag */
  tag?: boolean;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface ChangelogOptions extends AiCommandBase {
  /** git 区间（v1.0.0.. / ..HEAD / 1.0.0..2.0.0）；默认最近一个 tag 之后 */
  range?: string;
  /** 最大 commit 数（默认 50） */
  max?: number;
  /** 输出文件（默认 CHANGELOG.md） */
  output?: string;
  /** 语言：zh | en（默认 zh） */
  language: "zh" | "en";
  /** 输出格式：keep-a-changelog（默认，AI 生成）| compact（本地逐行渲染，不调用 LLM） */
  format?: string;
  /** dry-run：只打印统计 */
  dryRun?: boolean;
  /** 只打印不写文件 */
  print?: boolean;
  /** 流式输出（TTY 下边生成边打印） */
  stream?: boolean;
}

export interface LLMConfig {
  /** 提供商 id（deepseek/openai/moonshot/zhipu/qwen/minimax/xai/siliconflow/ollama/openrouter/groq/volcengine/gemini） */
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** 最大输出 token 数，默认 4096 */
  maxTokens?: number;
  /** 采样温度 0~2，默认 0.7 */
  temperature?: number;
  /** 持久化配置（~/.repo-ai/config.json，优先级低于 env） */
  config?: {
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 单次 LLM 调用的 token 用量。
 *
 * 字段可缺：13 家 provider 对 usage 的支持并不一致，流式模式下多数要显式请求
 * （stream_options.include_usage）才返回。缺就是缺，不用 0 顶替——
 * 「未知」与「0」对按量付费的用户是两个完全不同的信息。
 */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

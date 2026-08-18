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

export interface ReadmeOptions {
  /** 目标路径或目录，默认 "." */
  target: string;
  output?: string;
  language: "bilingual" | "zh" | "en";
  dryRun?: boolean;
  maxTokens: number;
  maxFileKb: number;
  /** LLM 提供商 id（deepseek 等），见 providers.ts */
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  /** 最大输出 token 数 */
  maxOutputTokens?: number;
  /** 采样温度 */
  temperature?: number;
  /** JSON 输出（脚本友好） */
  json?: boolean;
  /** 流式输出（TTY 下边生成边打印） */
  stream?: boolean;
}

export interface CommitOptions {
  staged?: boolean;
  all?: boolean;
  print?: boolean;
  type?: string;
  maxDiffKb?: number;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  /** 最大输出 token 数 */
  maxOutputTokens?: number;
  /** 采样温度 */
  temperature?: number;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface ReviewOptions {
  /** 使用暂存区改动（默认 staged） */
  staged?: boolean;
  /** 包含未暂存改动 */
  all?: boolean;
  /** 审查维度：all | bugs | security | style | perf（默认 all） */
  focus?: string;
  /** 输出文件（默认打印到 stdout） */
  output?: string;
  /** diff 截断上限（KB） */
  maxDiffKb?: number;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface ExplainOptions {
  /** 文件路径，可带 :行号 或 :起-止（如 src/lib/git.ts:38） */
  target: string;
  /** 输出语言：zh | en | bilingual */
  language: "zh" | "en" | "bilingual";
  /** 单文件读取上限（KB） */
  maxFileKb?: number;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface PrOptions {
  /** base 分支（默认自动检测 origin/HEAD → main → master） */
  base?: string;
  /** diff 截断上限（KB） */
  maxDiffKb?: number;
  /** 生成后用 gh pr create 直接创建 PR（非 JSON 模式） */
  create?: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** JSON 输出（脚本友好） */
  json?: boolean;
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

export interface ChangelogOptions {
  /** git 区间（v1.0.0.. / ..HEAD / 1.0.0..2.0.0）；默认最近一个 tag 之后 */
  range?: string;
  /** 最大 commit 数（默认 50） */
  max?: number;
  /** 输出文件（默认 CHANGELOG.md） */
  output?: string;
  /** 语言：zh | en（默认 zh） */
  language: "zh" | "en";
  /** dry-run：只打印统计 */
  dryRun?: boolean;
  /** 只打印不写文件 */
  print?: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** 流式输出（TTY 下边生成边打印） */
  stream?: boolean;
  /** JSON 输出（脚本友好） */
  json?: boolean;
}

export interface LLMConfig {
  /** 提供商 id（deepseek/openai/moonshot/zhipu/qwen/minimax/xai/siliconflow） */
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

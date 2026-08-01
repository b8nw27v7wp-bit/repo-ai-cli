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
}

export interface CommitOptions {
  staged?: boolean;
  all?: boolean;
  print?: boolean;
  type?: string;
  maxDiffKb?: number;
}

export interface LLMConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

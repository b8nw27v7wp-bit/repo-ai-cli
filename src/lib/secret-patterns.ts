export type Severity = "critical" | "high" | "medium";

export interface SecretPattern {
  id: string;
  name: string;
  severity: Severity;
  /** 全局匹配；一次 match 返回全部命中，供逐行扫描 */
  regex: RegExp;
}

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
};

export const SEVERITIES: Severity[] = ["critical", "high", "medium"];

/**
 * 常见密钥/凭据模式。只做启发式匹配（可能误报），最终以人工确认为准。
 * 覆盖 GitHub / AWS / Slack / Stripe / OpenAI / Google 及通用赋值、Bearer 等。
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    id: "github-pat",
    name: "GitHub Personal Access Token",
    severity: "critical",
    regex: /\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  },
  {
    id: "private-key",
    name: "私钥 (PEM/SSH/OpenSSH)",
    severity: "critical",
    regex: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: "aws-access-key",
    name: "AWS Access Key ID",
    severity: "high",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: "aws-secret",
    name: "AWS Secret Access Key",
    severity: "high",
    regex: /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/gi,
  },
  {
    id: "slack-token",
    name: "Slack Token",
    severity: "high",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: "stripe-live",
    name: "Stripe 生产密钥",
    severity: "high",
    regex: /\bsk_live_[0-9a-zA-Z]{16,}\b/g,
  },
  {
    id: "openai-key",
    name: "OpenAI API Key",
    severity: "high",
    regex: /\bsk-[A-Za-z0-9]{20,}\b/g,
  },
  {
    id: "google-api",
    name: "Google API Key",
    severity: "medium",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: "bearer-token",
    name: "硬编码 Bearer Token",
    severity: "high",
    regex: /Bearer\s+[A-Za-z0-9._~-]{20,}/gi,
  },
  {
    id: "generic-assignment",
    name: "疑似硬编码密钥",
    severity: "medium",
    regex: /\b(password|passwd|pwd|secret|token|api[_-]?key)\b\s*[=:]\s*["'][^"'\n]{8,}["']/gi,
  },
];

/** 打码：保留前 4 后 4，中间省略 */
export function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
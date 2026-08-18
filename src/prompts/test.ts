import type { ChatMessage } from "../types.js";

export type TestFramework = "vitest" | "jest" | "node-test";

const FRAMEWORK_RULES: Record<TestFramework, string> = {
  vitest:
    "- 使用 vitest：`import { describe, it, expect } from \"vitest\"`",
  jest: "- 使用 Jest：`describe` / `it` / `expect`（通过 @jest/globals 或全局）",
  "node-test":
    '- 使用 Node 内置测试：`import { describe, it } from "node:test"` + `import assert from "node:assert/strict"`',
};

export interface TestPromptInput {
  file: string;
  content: string;
  framework: TestFramework;
  truncated: boolean;
}

/**
 * 组装单元测试生成 prompt。
 */
export function buildTestPrompt(input: TestPromptInput): ChatMessage[] {
  const { file, content, framework, truncated } = input;

  const system =
    "你是资深测试工程师。为给定的代码生成单元测试。\n" +
    "【硬性要求】\n" +
    "- 覆盖主要正常路径 + 边界条件 + 异常/空值分支，不要堆砌无意义断言\n" +
    "- 只测试代码中真实存在的导出（函数/类/方法），禁止编造不存在的 API\n" +
    "- 测试独立可运行，不依赖真实网络/文件系统/外部服务（必要时用 mock，写出 mock 方式）\n" +
    "- 断言具体、有意义，避免只断言 truthy/falsy\n" +
    "- 直接输出测试代码全文，不要代码块包裹、不要任何前后缀解释\n" +
    FRAMEWORK_RULES[framework];

  const user = [
    `为这个文件生成单元测试：${file}`,
    truncated ? "⚠️ 注意：文件因过大被截断，只依据可见部分生成。" : "",
    "```",
    content,
    "```",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
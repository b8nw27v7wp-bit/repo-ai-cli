import type { ChatMessage, LLMConfig } from "../types.js";
import { chatCompletion, streamChatCompletion } from "./llm.js";
import { fail, type Progress } from "./ui.js";

/** 空响应的统一措辞。命令层不再各写一份——同一件事不该有 4 种说法。 */
const EMPTY_RESPONSE = "AI 返回了空内容，请重试。";

/**
 * 「调用 LLM → 失败即报错 → 空响应即报错」这段收尾。
 *
 * 它在 10 条 AI 命令里逐字重复过：`fail("AI 返回了空内容，请重试。")` 出现过 10 次、
 * `fail((err as Error).message)` 33 次。改一句提示语要改 10 处，还容易漏。
 *
 * 刻意只抽这一段：命令的输出尾巴（`-o` 落盘 / JSON / stdout 三选一）形态各异——
 * 同一个命令「有 -o」与「无 -o」两个分支的 JSON 字段都不一样（`test` 无 -o 时给
 * `content`、有 -o 时给 `output`），抽出来要传一堆参数，比重复更难读。
 *
 * @param failLabel 失败时进度条上的措辞（"生成失败" / "翻译失败" …）
 * @param normalize 归一化（如剥掉模型加的代码块围栏）；空值判断作用在归一化之后，
 *                  这样「只回了一对空围栏」也能被当成空响应
 * @returns 归一化后的内容；已报错时返回 null（调用方直接 return）
 */
export async function callLlmOrFail(
  messages: ChatMessage[],
  config: LLMConfig,
  progressBar: Progress,
  failLabel: string,
  normalize: (raw: string) => string = (raw) => raw,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await chatCompletion(messages, config);
  } catch (err) {
    progressBar.stop(failLabel);
    fail((err as Error).message);
    return null;
  }

  const content = normalize(raw);
  if (!content.trim()) {
    progressBar.stop();
    fail(EMPTY_RESPONSE);
    return null;
  }
  return content;
}

/**
 * 流式版本：边生成边把 token 打到 stdout。
 *
 * 与 callLlmOrFail 分开是因为进度条语义不同——流式要先停掉进度条再开始输出，
 * 否则 spinner 会和正文交织在一起。返回 null 表示已报错。
 */
export async function streamLlmOrFail(
  messages: ChatMessage[],
  config: LLMConfig,
  progressBar: Progress,
  failLabel: string,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await streamChatCompletion(messages, config, (t) => process.stdout.write(t));
    process.stdout.write("\n");
  } catch (err) {
    progressBar.stop(failLabel);
    fail((err as Error).message);
    return null;
  }

  if (!raw.trim()) {
    progressBar.stop();
    fail(EMPTY_RESPONSE);
    return null;
  }
  return raw;
}

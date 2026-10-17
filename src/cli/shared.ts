import type { Command } from "commander";

/**
 * 命令注册共用的零件。
 *
 * 这里只放「AI 命令与离线命令都要用」的东西——错误出口与 LLM 参数组。
 * 各命令自身的 option 与接线留在 register-ai.ts / register-offline.ts 里。
 */

/**
 * 一条命令的注册器：声明 option 并把 action 接到对应的 runX 上。
 * 拆成一个个注册器而不是几个大函数，是为了让 program.ts 能按既定顺序登记。
 */
export type CommandRegistrar = (program: Command) => void;

/**
 * 解析数值型选项，实现「CLI 参数 > 配置文件 > 内置默认」三层规则。
 *
 * 为什么需要 getOptionValueSource：commander 会给带默认值的 option 填上值，
 * 于是 `opts[key]` 永远有值，无法区分「用户传了 48000」与「默认就是 48000」。
 * 只有来源为 "cli" 才算用户显式给出，否则让配置覆盖——这正是 `config set maxTokens`
 * 此前形同虚设的原因（保存成功但没有任何命令读取）。
 *
 * 内置默认值不在这里重复写一遍：commander 的默认值已经在 opts[key] 里，
 * 直接用它就是唯一真相，避免同一个数字出现在两处后漂移。
 *
 * @param key camelCase 的 opts 键（如 "budgetTokens"）
 * @param cfgValue 配置文件里的对应值（含激活 profile 合并后）
 */
export function resolveNumber(
  cmd: Command,
  opts: Record<string, unknown>,
  key: string,
  cfgValue: number | undefined,
): number {
  if (cmd.getOptionValueSource(key) === "cli") return opts[key] as number;
  return cfgValue ?? (opts[key] as number);
}

/**
 * 给命令挂上共用的 LLM 选项（provider/base-url/model/api-key/profile）。
 * 12 条 AI 命令共用同一组，改一处即全部生效。
 */
export function withLLMOptions(cmd: Command): Command {
  return cmd
    .option(
      "--provider <id>",
      "LLM provider: deepseek|openai|moonshot|zhipu|qwen|minimax|xai|siliconflow|ollama|openrouter|groq|volcengine|gemini",
    )
    .option("--base-url <url>", "custom OpenAI-compatible endpoint (overrides provider)")
    .option("--model <name>", "model name (overrides provider default)")
    .option(
      "--api-key <key>",
      "API key (prefer env vars / config set; avoid in shell history)",
    )
    .option(
      "--profile <name>",
      'use a named config profile (see config set --profile; default: active profile)',
    );
}

/**
 * 命令 action 的统一错误出口：把抛出的异常转成 JSON 或一行 ✖ 提示，并置退出码 1。
 *
 * 注意：绝大多数命令走的是 lib/ui.ts 的 fail()（内部自己置退出码并 return），
 * 这里兜的是「命令函数抛出而未捕获」的意外路径，以及 commander 层面的错误。
 * 两者措辞一致但实现不同：fail() 在 TTY 下用 clack 的 outro 渲染，
 * 这里始终是纯文本——保持不变，改它会动到既有 TTY 输出。
 */
export function handleError(err: unknown, json: boolean): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exitCode = 1;
}

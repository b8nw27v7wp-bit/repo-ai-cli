import { buildProgram } from "./cli/program.js";

/**
 * CLI 入口：只负责组装并解析。
 *
 * 命令注册见 cli/register-ai.ts（12 条 AI 命令）与 cli/register-offline.ts
 * （12 条离线命令），program 与全局钩子在 cli/program.ts。
 * 入口保持在这个体量，是为了让「加一条命令」永远不需要动它。
 */
buildProgram().parse();

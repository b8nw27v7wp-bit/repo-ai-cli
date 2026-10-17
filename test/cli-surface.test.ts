import { describe, it, expect } from "vitest";
import { buildProgram, COMMAND_ORDER } from "../src/cli/program.js";

/**
 * CLI 表面的守卫测试（P1-1 拆分 index.ts 时补）。
 *
 * 拆分后「加一条命令」要动两处：注册文件里写注册器、program.ts 的 COMMAND_ORDER 里登记。
 * 漏了第二处，命令会在 --help 里凭空消失——而且不报错。这里把它变成红的。
 */

/** 顶层命令名（排除 commander 自带的 help） */
function topLevelCommands(): string[] {
  return buildProgram()
    .commands.map((c) => c.name())
    .filter((n) => n !== "help");
}

describe("CLI 命令登记", () => {
  it("COMMAND_ORDER 与实际注册的顶层命令完全一致（不多不少）", () => {
    const registered = topLevelCommands();
    expect([...COMMAND_ORDER].sort()).toEqual([...registered].sort());
  });

  it("--help 的展示顺序与 COMMAND_ORDER 一致", () => {
    // 拆分前 index.ts 的注册顺序就是 --help 的顺序，这里把它固定下来，
    // 避免以后「顺手整理一下顺序」把 README 的小节顺序对不上
    expect(topLevelCommands()).toEqual([...COMMAND_ORDER]);
  });

  it("注册器集合与顺序表一一对应（漏登记会抛错而不是静默跳过）", () => {
    // buildProgram 内部会对不上就抛；这里断言它不抛
    expect(() => buildProgram()).not.toThrow();
  });

  it("顶层命令数为 24，且与 description 里声称的数字一致", () => {
    const program = buildProgram();
    const commands = program.commands.filter((c) => c.name() !== "help");
    expect(commands).toHaveLength(24);

    const claimed = program.description().match(/(\d+)\s+commands?/)?.[1];
    expect(Number(claimed)).toBe(commands.length);
  });

  it("每个顶层命令都有非空 description（--help 里不该出现空白行）", () => {
    for (const cmd of buildProgram().commands) {
      if (cmd.name() === "help") continue;
      expect(cmd.description(), `命令 ${cmd.name()} 缺少 description`).not.toBe("");
    }
  });
});

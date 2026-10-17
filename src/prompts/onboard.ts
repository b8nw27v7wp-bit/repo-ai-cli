import type { BudgetResult, ChatMessage } from "../types.js";
import { buildMaterialsSection } from "../lib/materials.js";

export interface OnboardNavigation {
  entryPoints: string[];
  groups: Array<{ name: string; files: number; lines: number }>;
  /** 本地 import 无法解析的数量（让模型知道结构信息不完整） */
  unresolved: number;
}

/** 把 repo-index 的分组/入口拼成一段「结构导航」，补充材料里的目录树 */
function buildNavigationSection(nav: OnboardNavigation): string {
  const lines = ["【结构导航（由 repo-ai map 生成，只含真实存在的文件）】"];
  if (nav.entryPoints.length > 0) {
    lines.push("入口文件:");
    for (const entry of nav.entryPoints) lines.push(`- ${entry}`);
  } else {
    lines.push("入口文件: 未识别");
  }
  if (nav.groups.length > 0) {
    lines.push("模块分组:");
    for (const g of nav.groups) {
      const name = g.name === "(root)" ? "(根目录)" : g.name;
      lines.push(`- ${name}: ${g.files} 文件 / ${g.lines} 行`);
    }
  }
  if (nav.unresolved > 0) {
    lines.push(
      `注意: 有 ${nav.unresolved} 处本地 import 无法解析，不要据此推断模块依赖。`,
    );
  }
  return lines.join("\n");
}

/**
 * 组装上手导读 prompt：结构导航 + 预算后的项目材料。
 */
export function buildOnboardPrompt(
  repoName: string,
  materials: BudgetResult,
  navigation: OnboardNavigation,
): ChatMessage[] {
  const system =
    "你是资深工程师，负责为刚加入项目的维护者写一份 ONBOARDING.md。\n" +
    "【硬性要求】\n" +
    "- 只依据提供的项目材料与结构导航；引用真实存在的文件路径，禁止编造模块、命令或配置\n" +
    "- 结构：项目一句话定位 → 架构地图 → 关键模块职责 → 数据/请求流 → 本地运行与测试 → 从哪里开始改 → 常见陷阱\n" +
    "- 「从哪里开始改」要落到具体文件路径，并给出阅读顺序\n" +
    "- 使用标准 Markdown；代码块带语言标识；直接输出全文，不要任何前后缀解释\n" +
    "- 不确定的内容写 `TODO`，不要猜";

  const user =
    buildNavigationSection(navigation) +
    "\n\n" +
    buildMaterialsSection(repoName, materials);

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

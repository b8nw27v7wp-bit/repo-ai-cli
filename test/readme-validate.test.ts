import { describe, it, expect } from "vitest";
import { validateReadmeStructure } from "../src/lib/readme-validate.js";

const VALID_BILINGUAL = `# demo-cli

一句话定位。

## Features 功能特性

- 快速生成
- 双语输出

## 快速开始

\`\`\`bash
npx demo-cli
\`\`\`

## License

MIT
`;

const VALID_ZH = `# 我的项目

## 功能特性

- 功能一

## 待办

- TODO: 补充截图（按约定 TODO 允许保留）
`;

describe("validateReadmeStructure", () => {
  it("结构完整的双语 README 通过", () => {
    const r = validateReadmeStructure(VALID_BILINGUAL);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("纯中文 README（功能特性标题）且只含 TODO 时通过", () => {
    const r = validateReadmeStructure(VALID_ZH);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("缺少一级标题时报错", () => {
    const r = validateReadmeStructure("## Features\n\n- a\n");
    expect(r.ok).toBe(false);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain("一级标题");
  });

  it("缺少功能特性章节时报错", () => {
    const r = validateReadmeStructure("# demo\n\n## 安装\n\nnpm i\n");
    expect(r.ok).toBe(false);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain("功能特性");
  });

  it("英文 Features 标题也算功能章节（任意层级）", () => {
    const r = validateReadmeStructure("# demo\n\n### Key Features\n\n- a\n");
    expect(r.ok).toBe(true);
  });

  it("TBD 残留被拦截（TODO 不拦截）", () => {
    const r = validateReadmeStructure(
      "# demo\n\n## 功能特性\n\n- 功能一\n\n详见 TBD 文档。\n",
    );
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain("TBD");
  });

  it("待补充类占位被拦截", () => {
    const r = validateReadmeStructure(
      "# demo\n\n## 功能特性\n\n这里待补充内容。\n",
    );
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain("待补充");
  });

  it("{{...}} 模板占位被拦截", () => {
    const r = validateReadmeStructure(
      "# demo\n\n## 功能特性\n\n安装：npm i {{packageName}}\n",
    );
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain("{{...}}");
  });

  it("<your-...> 尖括号占位被拦截", () => {
    const r = validateReadmeStructure(
      "# demo\n\n## 功能特性\n\nexport TOKEN=<your-token>\n",
    );
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain("尖括号占位");
  });

  it("代码块内的占位符不误伤", () => {
    const content = `# demo

## 功能特性

- a

\`\`\`ts
// TODO: 这里是示例注释
const url = "{{endpoint}}";
const t = "<your-token>";
\`\`\`

行内代码 \`TBD\` 也不算。
`;
    const r = validateReadmeStructure(content);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("多个问题一次报全", () => {
    const r = validateReadmeStructure("正文没有任何结构，还残留 FIXME。\n");
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThanOrEqual(3);
  });

  it("空内容不通过", () => {
    const r = validateReadmeStructure("");
    expect(r.ok).toBe(false);
  });
});

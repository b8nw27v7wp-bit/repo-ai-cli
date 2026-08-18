/**
 * init 命令的脚手架模板定义。每个文件是一个返回内容字符串的函数，
 * 用 TemplateVars 注入项目名 / 包名等变量。
 */

export interface TemplateVars {
  /** 项目名（原始目录名，用于 README 标题等展示） */
  name: string;
  /** npm 合法包名（kebab-case） */
  packageName: string;
  /** 项目描述 */
  description: string;
}

export interface Template {
  id: string;
  label: string;
  /** 一句话说明，展示在 --help / select 中 */
  description: string;
  files: Record<string, (vars: TemplateVars) => string>;
}

/** 转为 npm 合法包名：小写、非字母数字转连字符、去首尾连字符 */
export function toPackageName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "my-project"
  );
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ES2022"],
      types: ["node"],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      isolatedModules: true,
    },
    include: ["src"],
    exclude: ["node_modules", "dist"],
  },
  null,
  2,
);

const GITIGNORE = [
  "node_modules/",
  "dist/",
  "coverage/",
  "*.log",
  ".DS_Store",
  "",
].join("\n");

function tsCliPackage(vars: TemplateVars): string {
  return (
    JSON.stringify(
      {
        name: vars.packageName,
        version: "0.1.0",
        description: vars.description,
        type: "module",
        bin: { [vars.packageName]: "./dist/index.js" },
        files: ["dist"],
        scripts: {
          build: "tsup",
          dev: "tsup --watch",
          test: "vitest run",
          typecheck: "tsc --noEmit",
        },
        engines: { node: ">=20" },
        dependencies: { commander: "^15.0.0" },
        devDependencies: {
          "@types/node": "^26.1.2",
          tsup: "^8.5.1",
          typescript: "^6.0.3",
          vitest: "^4.1.10",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function tsLibPackage(vars: TemplateVars): string {
  return (
    JSON.stringify(
      {
        name: vars.packageName,
        version: "0.1.0",
        description: vars.description,
        type: "module",
        main: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
          },
        },
        files: ["dist"],
        scripts: {
          build: "tsup",
          test: "vitest run",
          typecheck: "tsc --noEmit",
        },
        engines: { node: ">=20" },
        devDependencies: {
          "@types/node": "^26.1.2",
          tsup: "^8.5.1",
          typescript: "^6.0.3",
          vitest: "^4.1.10",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function tsCliTsup(vars: TemplateVars): string {
  return [
    `import { defineConfig } from "tsup";`,
    "",
    `// ${vars.name} — 构建配置`,
    `export default defineConfig({`,
    `  entry: ["src/index.ts"],`,
    `  format: ["esm"],`,
    `  target: "node20",`,
    `  outDir: "dist",`,
    `  clean: true,`,
    `  sourcemap: true,`,
    `  dts: true,`,
    `  banner: { js: "#!/usr/bin/env node" },`,
    `});`,
    "",
  ].join("\n");
}

function tsLibTsup(vars: TemplateVars): string {
  return [
    `import { defineConfig } from "tsup";`,
    "",
    `// ${vars.name} — 构建配置`,
    `export default defineConfig({`,
    `  entry: ["src/index.ts"],`,
    `  format: ["esm"],`,
    `  target: "node20",`,
    `  outDir: "dist",`,
    `  clean: true,`,
    `  sourcemap: true,`,
    `  dts: true,`,
    `});`,
    "",
  ].join("\n");
}

function readme(vars: TemplateVars): string {
  return [
    `# ${vars.name}`,
    "",
    `${vars.description}`,
    "",
    "## 快速开始",
    "",
    "```bash",
    "npm install",
    "npm run build",
    "npm test",
    "```",
    "",
    "## 目录结构",
    "",
    "```",
    "src/",
    "test/",
    "```",
    "",
    "",
  ].join("\n");
}

/** ts-cli 模板：commander + tsup + vitest 的最小可运行 CLI 脚手架 */
const TS_CLI: Template = {
  id: "ts-cli",
  label: "TypeScript CLI",
  description: "commander + tsup + vitest 的命令行工具脚手架",
  files: {
    "package.json": tsCliPackage,
    "tsconfig.json": () => TSCONFIG + "\n",
    "tsup.config.ts": tsCliTsup,
    ".gitignore": () => GITIGNORE,
    "README.md": readme,
    "src/greet.ts": () =>
      [
        `export function greet(name: string): string {`,
        `  return \`Hello, \${name}!\`;`,
        `}`,
        "",
      ].join("\n"),
    "src/index.ts": (vars) =>
      [
        `#!/usr/bin/env node`,
        `import { Command } from "commander";`,
        `import { greet } from "./greet.js";`,
        "",
        `const program = new Command();`,
        "",
        `program`,
        `  .name("${vars.packageName}")`,
        `  .description("${vars.description}")`,
        `  .version("0.1.0")`,
        `  .argument("[name]", "who to greet", "world")`,
        `  .action((name: string) => {`,
        `    console.log(greet(name));`,
        `  });`,
        "",
        `program.parse();`,
        "",
      ].join("\n"),
    "test/greet.test.ts": () =>
      [
        `import { describe, it, expect } from "vitest";`,
        `import { greet } from "../src/greet.js";`,
        "",
        `describe("greet", () => {`,
        `  it("greets the given name", () => {`,
        `    expect(greet("repo-ai")).toBe("Hello, repo-ai!");`,
        `  });`,
        `});`,
        "",
      ].join("\n"),
  },
};

/** ts-lib 模板：无 bin 的 TS 库脚手架（main/types/exports 齐全） */
const TS_LIB: Template = {
  id: "ts-lib",
  label: "TypeScript Library",
  description: "可发布的 TS 库脚手架（main/types/exports）",
  files: {
    "package.json": tsLibPackage,
    "tsconfig.json": () => TSCONFIG + "\n",
    "tsup.config.ts": tsLibTsup,
    ".gitignore": () => GITIGNORE,
    "README.md": readme,
    "src/index.ts": () =>
      [
        `export function greet(name: string): string {`,
        `  return \`Hello, \${name}!\`;`,
        `}`,
        "",
        `export function add(a: number, b: number): number {`,
        `  return a + b;`,
        `}`,
        "",
      ].join("\n"),
    "test/index.test.ts": () =>
      [
        `import { describe, it, expect } from "vitest";`,
        `import { greet, add } from "../src/index.js";`,
        "",
        `describe("lib", () => {`,
        `  it("greets", () => {`,
        `    expect(greet("repo-ai")).toBe("Hello, repo-ai!");`,
        `  });`,
        "",
        `  it("adds", () => {`,
        `    expect(add(1, 2)).toBe(3);`,
        `  });`,
        `});`,
        "",
      ].join("\n"),
  },
};

export const TEMPLATES: Template[] = [TS_CLI, TS_LIB];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id.toLowerCase());
}
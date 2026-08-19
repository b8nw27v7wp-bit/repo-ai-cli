import { describe, it, expect } from "vitest";
import {
  renderContributingZh,
  renderContributingEn,
} from "../src/lib/contributing.js";

const vars = {
  project: "my-tool",
  repoSlug: "owner/my-tool",
  install: "npm install",
  testCmd: "npm test",
};

describe("contributing 模板", () => {
  it("中文版包含项目名/安装/测试命令", () => {
    const text = renderContributingZh(vars);
    expect(text).toContain("my-tool");
    expect(text).toContain("git clone https://github.com/owner/my-tool.git");
    expect(text).toContain("npm install");
    expect(text).toContain("npm test");
    expect(text).toContain("Conventional Commits");
  });

  it("英文版结构完整", () => {
    const text = renderContributingEn(vars);
    expect(text).toContain("# Contributing");
    expect(text).toContain("git clone https://github.com/owner/my-tool.git");
    expect(text).toContain("Pull Requests");
  });

  it("不同包管理器命令正确注入", () => {
    const text = renderContributingZh({ ...vars, install: "pnpm install" });
    expect(text).toContain("pnpm install");
  });
});

import { describe, it, expect } from "vitest";
import { parseGithubRef } from "../src/lib/github.js";

describe("parseGithubRef", () => {
  it("owner/repo 简写", () => {
    expect(parseGithubRef("b8nw27v7wp-bit/codingagent")).toEqual({
      url: "https://github.com/b8nw27v7wp-bit/codingagent.git",
      branch: undefined,
    });
  });

  it("完整 https URL", () => {
    expect(
      parseGithubRef("https://github.com/b8nw27v7wp-bit/codingagent"),
    ).toEqual({
      url: "https://github.com/b8nw27v7wp-bit/codingagent.git",
      branch: undefined,
    });
  });

  it("带 .git 后缀", () => {
    expect(parseGithubRef("https://github.com/a/b.git")).toEqual({
      url: "https://github.com/a/b.git",
      branch: undefined,
    });
  });

  it("owner/repo#branch", () => {
    expect(parseGithubRef("a/b#dev")).toEqual({
      url: "https://github.com/a/b.git",
      branch: "dev",
    });
  });

  it("URL /tree/branch", () => {
    expect(parseGithubRef("https://github.com/a/b/tree/main")).toEqual({
      url: "https://github.com/a/b.git",
      branch: "main",
    });
  });

  it("git@ SSH 形式", () => {
    expect(parseGithubRef("git@github.com:a/b.git")).toEqual({
      url: "https://github.com/a/b.git",
      branch: undefined,
    });
  });

  it("非 GitHub 域名拒绝", () => {
    expect(() => parseGithubRef("https://gitlab.com/a/b")).toThrow(/GitHub/);
  });

  it("乱输入拒绝", () => {
    expect(() => parseGithubRef("not a repo")).toThrow();
    expect(() => parseGithubRef("justonepart")).toThrow();
  });
});

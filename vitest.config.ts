import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      include: ["src/**/*.ts"],
      // 入口只有 buildProgram().parse() 两行，没有可测逻辑；e2e 覆盖了它的实际行为
      exclude: ["src/index.ts"],
      // 阈值只防回退，不设「达标线」：先测出基线，再钉在基线下方约 2 个点。
      // 追求一个好看的百分比只会诱导写出「为覆盖而覆盖」的用例。
      //
      // 2026-10-17 实测基线：行 70.89% / 分支 64.7% / 函数 75% / 语句 69.67%
      // （443 用例）。下面这组数字是「不许比基线差 2 个点以上」的意思：
      // 加一个上百行、无测试的模块就会踩到。
      thresholds: {
        statements: 68,
        branches: 63,
        functions: 73,
        lines: 69,
      },
    },
  },
});

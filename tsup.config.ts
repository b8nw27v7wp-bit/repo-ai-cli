import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
  // deps 外置：commander/clack/picocolors 走 node_modules
  // 但为了发布干净 + 开箱即用，把运行时依赖也打进单文件
  noExternal: ["@clack/prompts", "picocolors"],
  banner: { js: "#!/usr/bin/env node" },
});

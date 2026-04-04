import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  entry: ["src/index.ts", "src/mcp.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node18",
  define: {
    BUILD_VERSION: JSON.stringify(packageJson.version),
    BUILD_TIMESTAMP: JSON.stringify(new Date().toISOString()),
  },
});

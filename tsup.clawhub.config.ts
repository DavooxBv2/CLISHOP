import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
);

export default defineConfig({
  entry: ["src/mcp.ts"],
  format: ["cjs"],
  dts: false,
  clean: true,
  splitting: false,
  outDir: "clawhub-bundle/dist",
  target: "node18",
  noExternal: [/.*/],
  external: ["keytar"],
  define: {
    BUILD_VERSION: JSON.stringify(packageJson.version),
    BUILD_TIMESTAMP: JSON.stringify(new Date().toISOString()),
  },
});
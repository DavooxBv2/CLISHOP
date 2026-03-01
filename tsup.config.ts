import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/mcp.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node18",
  define: {
    BUILD_TIMESTAMP: JSON.stringify(new Date().toISOString()),
  },
});

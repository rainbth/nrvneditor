import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["electron/lib/**/*.ts", "electron/services/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["tests/**"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "artifacts/coverage",
      thresholds: { lines: 55, functions: 50, branches: 45, statements: 55 },
    },
  },
});

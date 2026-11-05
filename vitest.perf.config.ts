import { defineConfig } from "vitest/config";

/** Batería de rendimiento: separada del build de tests unitarios (AC B6). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/perf/**/*.test.ts"],
    passWithNoTests: false,
  },
});

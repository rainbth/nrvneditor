import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Integración real contra el servicio local de OpenCode (no corre en `test:unit`). */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 150_000,
    hookTimeout: 150_000,
    passWithNoTests: true,
  },
});

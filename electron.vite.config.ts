import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const root = process.cwd();
const commit =
  process.env.NRVN_COMMIT?.trim() ||
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim() || "dev";
    } catch {
      return "dev";
    }
  })();

export default defineConfig({
  main: {
    define: { __NRVN_COMMIT__: JSON.stringify(commit) },
    plugins: [externalizeDepsPlugin({ exclude: ["zod"] })],
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: { index: resolve(root, "electron/main.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: { index: resolve(root, "electron/preload.ts") },
        output: {
          format: "cjs",
          entryFileNames: "index.js",
        },
      },
    },
  },
  renderer: {
    root,
    base: "./",
    resolve: {
      alias: {
        "@": resolve(root, "src"),
      },
    },
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: { index: resolve(root, "index.html") },
      },
    },
  },
});

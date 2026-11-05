import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const root = process.cwd();
const output = resolve(root, "artifacts/electron-app");

export default defineConfig({
  main: {
    define: { __NRVN_COMMIT__: JSON.stringify("e2e") },
    plugins: [externalizeDepsPlugin({ exclude: ["zod"] })],
    build: {
      outDir: resolve(output, "main"),
      rollupOptions: { input: { index: resolve(root, "electron/main.ts") } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(output, "preload"),
      rollupOptions: {
        input: { index: resolve(root, "electron/preload.ts") },
        output: { format: "cjs", entryFileNames: "index.js" },
      },
    },
  },
  renderer: {
    root,
    base: "./",
    resolve: { alias: { "@": resolve(root, "src") } },
    build: {
      outDir: resolve(output, "renderer"),
      rollupOptions: { input: { index: resolve(root, "index.html") } },
    },
  },
});

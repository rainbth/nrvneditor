import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (!config.projects.some((project) => project.name === "electron")) return;

  const output = resolve("artifacts/electron-app");
  rmSync(output, { recursive: true, force: true });
  mkdirSync(resolve("artifacts"), { recursive: true });
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/electron-vite/bin/electron-vite.js"),
      "build",
      "-c",
      "tests/e2e/electron.vite.config.ts",
    ],
    { stdio: "inherit" },
  );
  if (!existsSync(resolve(output, "main/index.js"))) {
    throw new Error("electron-vite no generó artifacts/electron-app/main/index.js");
  }
}

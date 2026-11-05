import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const assetsDir = path.join(process.cwd(), "out", "renderer", "assets");
const thresholdIndex = process.argv.indexOf("--threshold");
const threshold = thresholdIndex < 0 ? 1_050_000 : Number(process.argv[thresholdIndex + 1]);

try {
  const files = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
  if (files.length === 0) throw new Error("no JavaScript assets found");
  let total = 0;
  for (const file of files) {
    const bytes = gzipSync(readFileSync(path.join(assetsDir, file))).length;
    total += bytes;
    console.log(`${file}: ${bytes} bytes gzip`);
  }
  console.log(`Total: ${total} bytes gzip (umbral: ${threshold} bytes)`);
  if (!Number.isFinite(threshold) || total > threshold) process.exitCode = 1;
} catch (error) {
  console.error(`No se pudo medir out/renderer: ${error instanceof Error ? error.message : String(error)}. Ejecuta npm run build:mock o build:app.`);
  process.exitCode = 1;
}

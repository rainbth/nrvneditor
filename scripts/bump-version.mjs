import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function nextVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) throw new Error(`Versión semver inválida: ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export function bumpVersion(cwd) {
  if (process.env.NRVN_SKIP_VERSION_BUMP === "1") {
    process.stdout.write("nrvn: bump omitido (NRVN_SKIP_VERSION_BUMP=1)\n");
    return undefined;
  }
  const packagePath = join(cwd, "package.json");
  const lockPath = join(cwd, "package-lock.json");
  const packageText = readFileSync(packagePath, "utf8");
  const lockText = readFileSync(lockPath, "utf8");
  const pkg = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  if (!lock.packages?.[""]) throw new Error('package-lock.json inválido: falta packages[""]');
  const version = nextVersion(pkg.version);
  pkg.version = version;
  lock.version = version;
  lock.packages[""].version = version;
  const packageTemp = `${packagePath}.tmp`;
  const lockTemp = `${lockPath}.tmp`;
  let packageWritten = false;
  try {
    writeFileSync(packageTemp, `${JSON.stringify(pkg, null, 2)}\n`);
    writeFileSync(lockTemp, `${JSON.stringify(lock, null, 2)}\n`);
    renameSync(packageTemp, packagePath);
    packageWritten = true;
    renameSync(lockTemp, lockPath);
  } catch (error) {
    if (packageWritten) {
      const rollback = `${packagePath}.rollback.tmp`;
      writeFileSync(rollback, packageText);
      renameSync(rollback, packagePath);
    }
    throw error;
  }
  process.stdout.write(`nrvn: versión ${JSON.parse(packageText).version} → ${version}\n`);
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bumpVersion(process.cwd());
}

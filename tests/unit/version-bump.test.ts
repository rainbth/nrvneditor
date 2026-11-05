// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bumpVersion, nextVersion } from "../../scripts/bump-version.mjs";

describe("version bump", () => {
  it("increments valid patch versions", () => {
    expect(nextVersion("0.2.0")).toBe("0.2.1");
    expect(nextVersion("0.2.0-beta.1+build.7")).toBe("0.2.1");
    expect(() => nextVersion("invalid")).toThrow();
  });

  it("synchronizes package and lock versions", () => {
    const cwd = mkdtempSync(join(tmpdir(), "nrvn-version-"));
    try {
      writeFileSync(join(cwd, "package.json"), '{\n  "version": "1.2.3"\n}\n');
      writeFileSync(
        join(cwd, "package-lock.json"),
        '{\n  "version": "1.2.3",\n  "other": true,\n  "packages": { "": { "version": "1.2.3" }, "node_modules/x": { "version": "4.5.6" } }\n}\n',
      );
      expect(bumpVersion(cwd)).toBe("1.2.4");
      expect(JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).version).toBe("1.2.4");
      const lock = JSON.parse(readFileSync(join(cwd, "package-lock.json"), "utf8"));
      expect(lock.version).toBe("1.2.4");
      expect(lock.packages[""].version).toBe("1.2.4");
      expect(lock.packages["node_modules/x"].version).toBe("4.5.6");
      expect(lock.other).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("skips without mutating files", () => {
    const cwd = mkdtempSync(join(tmpdir(), "nrvn-version-"));
    const previous = process.env.NRVN_SKIP_VERSION_BUMP;
    try {
      const pkg = '{"version":"1.2.3"}\n';
      const lock = '{"version":"1.2.3","packages":{"":{"version":"1.2.3"}}}\n';
      writeFileSync(join(cwd, "package.json"), pkg);
      writeFileSync(join(cwd, "package-lock.json"), lock);
      process.env.NRVN_SKIP_VERSION_BUMP = "1";
      expect(bumpVersion(cwd)).toBeUndefined();
      expect(readFileSync(join(cwd, "package.json"), "utf8")).toBe(pkg);
      expect(readFileSync(join(cwd, "package-lock.json"), "utf8")).toBe(lock);
    } finally {
      if (previous === undefined) delete process.env.NRVN_SKIP_VERSION_BUMP;
      else process.env.NRVN_SKIP_VERSION_BUMP = previous;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("reports a lock missing the root package", () => {
    const cwd = mkdtempSync(join(tmpdir(), "nrvn-version-"));
    try {
      writeFileSync(join(cwd, "package.json"), '{"version":"1.2.3"}');
      writeFileSync(join(cwd, "package-lock.json"), '{"packages":{}}');
      expect(() => bumpVersion(cwd)).toThrow(/falta packages\[""\]/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

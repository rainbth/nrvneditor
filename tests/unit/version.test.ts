// @vitest-environment node
import { readFileSync } from "node:fs";
import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { buildMenuTemplate } from "../../electron/menu";

type Item = MenuItemConstructorOptions;
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const submenu = (item: Item): Item[] => item.submenu as Item[];

describe("version and About menu", () => {
  it("package and lock versions are valid and synchronized", () => {
    const pkg = JSON.parse(read("../../package.json")) as { version: string };
    const lock = JSON.parse(read("../../package-lock.json")) as {
      version: string;
      packages: { "": { version: string } };
    };
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.version.localeCompare("0.2.0", undefined, { numeric: true })).toBeGreaterThanOrEqual(
      0,
    );
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
  });
  it("uses versioned dmg artifact names", () => {
    expect(read("../../electron-builder.yml")).toMatch(
      /artifactName:\s*nrvn-\$\{version\}-\$\{arch\}\.\$\{ext\}/,
    );
  });
  it("defines About version, commit and at least eight feature entries", () => {
    const about = read("../../src/components/layout/AboutDialog.tsx");
    expect(about).toContain('data-testid="about-version"');
    expect(about).toContain('data-testid="about-commit"');
    expect(about).toContain('data-testid="about-features"');
    expect((about.match(/data-testid="about-feature"/g) ?? []).length).toBe(1);
    const featuresStart = about.indexOf("const FEATURES");
    const featureBlock = about.slice(featuresStart, about.indexOf("];", featuresStart));
    expect((featureBlock.match(/^\s+"/gm) ?? []).length).toBeGreaterThanOrEqual(8);
  });
  it("uses package version fallback and injects the build commit", () => {
    const ipc = read("../../src/lib/ipc.ts");
    expect(ipc).toContain("pkg.version");
    expect(ipc).not.toContain('"0.2.0"');
    expect(read("../../electron.vite.config.ts")).toContain("__NRVN_COMMIT__");
  });
  it("both About entries send about exactly once", () => {
    const send = vi.fn();
    const template = buildMenuTemplate({ send, openHelp: vi.fn() }, "darwin");
    for (const label of ["nrvn", "Ayuda"]) {
      const menu = template.find((item) => item.label === label);
      if (!menu) throw new Error(`Falta menú ${label}`);
      const about = submenu(menu).find((item) => item.label === "Acerca de nrvn");
      if (!about?.click) throw new Error("Falta acción About");
      about.click({} as never, {} as never, {} as never);
    }
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, "about");
    expect(send).toHaveBeenNthCalledWith(2, "about");
  });
});

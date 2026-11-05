import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ userData: "", documents: "" }));
vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "documents" ? host.documents : host.userData),
    getVersion: () => "1.2.3",
  },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
}));

import { createLanguage, getLanguageSet, syncLanguage } from "../../electron/services/languages";
import { readSidecar, writeSidecar } from "../../electron/services/metadata";
import { splitBlocks } from "../../src/lib/blocks";
import {
  canonicalLanguagePath,
  languageContentHash,
  languageSiblingParts,
  languageSiblingPath,
  sourceLanguageOf,
  syncLanguageBlocks,
} from "../../src/lib/languages";

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "nrvn-languages-"));
  host.userData = mkdtempSync(path.join(tmpdir(), "nrvn-languages-data-"));
  host.documents = root;
});

describe("language helpers", () => {
  it("recognizes sibling paths but not version numbers", () => {
    expect(languageSiblingParts("Guia.en.md")).toEqual({ basePath: "Guia.md", lang: "en" });
    expect(languageSiblingParts("Guia.mdx")).toBeNull();
    expect(languageSiblingPath("Guia.es.md", "en")).toBe("Guia.en.md");
    expect(languageSiblingPath("Guia.mdx", "en")).toBe("Guia.en.mdx");
    expect(canonicalLanguagePath("v1.2.md")).toBe("v1.2.md");
    expect(languageSiblingParts("v1.2.md")).toBeNull();
  });

  it("syncs source changes and protects untracked target blocks", () => {
    const source = "# Uno\n\nnuevo\n\n# Dos\n\nactualizado";
    const target = "# Uno\n\nmanual\n\n# Dos\n\ntexto";
    const sourceBlocks = splitBlocks("# Uno\n\nanterior\n\n# Dos\n\ntexto");
    const targetBlocks = splitBlocks(target);
    const result = syncLanguageBlocks(source, target, {
      path: "doc.en.md",
      lang: "en",
      sourceHash: "",
      updatedAt: "",
      stale: true,
      humanEditedBlocks: [],
      blocks: sourceBlocks.map((block, i) => ({
        key: block.key,
        sourceHash: block.hash,
        targetHash: targetBlocks[i].hash,
        humanEdited: i === 1,
      })),
    });
    expect(result.content).toContain("manual");
    expect(result).toMatchObject({ changedBlocks: 1, protectedBlocks: 1, record: { stale: true } });
    expect(result.record.humanEditedBlocks).toHaveLength(1);
  });

  it("appends source blocks absent from the target exactly once", () => {
    const source = "# Uno\n\nTexto nuevo";
    const result = syncLanguageBlocks(source, "# Uno", {
      path: "doc.en.md",
      lang: "en",
      sourceHash: "",
      updatedAt: "",
      stale: false,
      humanEditedBlocks: [],
      blocks: [
        {
          key: "# Uno#heading:0",
          sourceHash: splitBlocks("# Uno")[0].hash,
          targetHash: splitBlocks("# Uno")[0].hash,
          humanEdited: false,
        },
      ],
    });
    expect(result.content.match(/Texto nuevo/g)).toHaveLength(1);
    expect(result.changedBlocks).toBe(1);
  });

  it("keeps protected translations stale and lists human-edited blocks on subsequent syncs", () => {
    const originalSource = "# Uno\n\nTexto uno\n\n# Dos\n\nTexto dos";
    const blocks = splitBlocks(originalSource);
    const initialRecord = {
      path: "doc.en.md",
      lang: "en",
      sourceHash: "original-hash",
      updatedAt: "",
      stale: false,
      humanEditedBlocks: [],
      blocks: blocks.map((block) => ({
        key: block.key,
        sourceHash: block.hash,
        targetHash: block.hash,
        humanEdited: false,
      })),
    };
    const targetWithHumanEdit = "# Uno\n\nEdición humana\n\n# Dos\n\nTexto dos";
    const changedSource = "# Uno\n\nTexto uno actualizado\n\n# Dos\n\nTexto dos actualizado";
    const first = syncLanguageBlocks(changedSource, targetWithHumanEdit, initialRecord);
    const protectedBlockKey = blocks[1].key;
    expect(first.record.sourceHash).toBe("original-hash");
    expect(first.record.stale).toBe(true);
    const second = syncLanguageBlocks(changedSource, first.content, first.record);
    expect(second.record.sourceHash).toBe("original-hash");
    expect(second.record.sourceHash).not.toBe(languageContentHash(changedSource));
    expect(second.record.stale).toBe(true);
    expect(second.record.humanEditedBlocks).toContain(protectedBlockKey);
  });

  it("creates sibling and manifest without changing original, and never overwrites existing sibling", async () => {
    const original = path.join(root, "doc.md");
    const bytes = "# Título\n\nPrimer bloque\n\nSegundo bloque\n";
    writeFileSync(original, bytes);
    const created = await createLanguage(root, "doc.md", "en");
    expect(created).toMatchObject({ ok: true, created: true, path: "doc.en.md" });
    if (!created.ok) throw new Error(created.error);
    expect(readFileSync(path.join(root, "doc.en.md"), "utf8")).toBe(bytes);
    expect(created.set.translations.en.blocks.map((block) => block.sourceHash)).toEqual(
      splitBlocks(bytes).map((block) => block.hash),
    );
    expect(readFileSync(original)).toEqual(Buffer.from(bytes));
    writeFileSync(path.join(root, "doc.en.md"), "custom");
    const existing = await createLanguage(root, "doc.md", "en");
    expect(existing).toMatchObject({ ok: true, created: false });
    expect(readFileSync(path.join(root, "doc.en.md"), "utf8")).toBe("custom");
  });

  it("syncs end-to-end while preserving a manually edited block", async () => {
    const source = path.join(root, "doc.md");
    const original = "# Uno\n\nTexto uno\n\n# Dos\n\nTexto dos\n";
    writeFileSync(source, original);
    await createLanguage(root, "doc.md", "en");
    const dest = path.join(root, "doc.en.md");
    writeFileSync(dest, "# Uno\n\nEdición manual\n\n# Dos\n\nTexto dos\n");
    writeFileSync(source, "# Uno\n\nTexto uno actualizado\n\n# Dos\n\nTexto dos actualizado\n");
    const before = readFileSync(source);
    const result = await syncLanguage(root, "doc.md", "en");
    expect(result).toMatchObject({ ok: true });
    expect(readFileSync(dest, "utf8")).toContain("Edición manual");
    expect(readFileSync(dest, "utf8")).toContain("Texto dos actualizado");
    expect(readFileSync(source)).toEqual(before);
    if (result.ok) expect(result.protectedBlocks).toBeGreaterThanOrEqual(1);
  });

  it("preserves translated paragraphs when a heading is renamed", async () => {
    writeFileSync(path.join(root, "doc.md"), "# A\n\ntexto");
    await createLanguage(root, "doc.md", "en");
    writeFileSync(path.join(root, "doc.en.md"), "# A\n\nTRADUCIDO");
    writeFileSync(path.join(root, "doc.md"), "# A2\n\ntexto");
    const result = await syncLanguage(root, "doc.md", "en");
    expect(result).toMatchObject({ ok: true, protectedBlocks: expect.any(Number) });
    expect(readFileSync(path.join(root, "doc.en.md"), "utf8")).toBe("# A2\n\nTRADUCIDO");
    if (result.ok) expect(result.protectedBlocks).toBeGreaterThanOrEqual(1);
  });

  it("discovers siblings without a manifest and infers source language", async () => {
    writeFileSync(path.join(root, "doc.md"), "contenido");
    writeFileSync(path.join(root, "doc.fr.md"), "contenu");
    const set = await getLanguageSet(root, "doc.md");
    expect(set.translations.fr).toMatchObject({ path: "doc.fr.md", stale: true });
    expect(sourceLanguageOf("Guia.es.md")).toBe("es");
  });

  it("inserts a source block in the middle without disturbing translations", async () => {
    writeFileSync(path.join(root, "doc.md"), "# A\n\na\n\n# B\n\nb");
    await createLanguage(root, "doc.md", "en");
    writeFileSync(path.join(root, "doc.en.md"), "# A\n\nA traducido\n\n# B\n\nB traducido");
    writeFileSync(path.join(root, "doc.md"), "# A\n\na\n\n# X\n\nx\n\n# B\n\nb");
    const result = await syncLanguage(root, "doc.md", "en");
    expect(result).toMatchObject({ ok: true, changedBlocks: 1 });
    const target = readFileSync(path.join(root, "doc.en.md"), "utf8");
    expect(target).toContain("A traducido");
    expect(target).toContain("B traducido");
    expect(target.match(/# X/g)).toHaveLength(1);
    expect(target.match(/\nx\n/g)).toHaveLength(1);
    expect(target.trimEnd().endsWith("B traducido")).toBe(true);
  });

  it("applies a neighboring insertion and longer replacement using original offsets", async () => {
    const original = "# A\n\na";
    const expected = "# A\n\naaaa\n\n# B\n\nb";
    writeFileSync(path.join(root, "doc.md"), original);
    await createLanguage(root, "doc.md", "en");
    writeFileSync(path.join(root, "doc.md"), expected);
    const result = await syncLanguage(root, "doc.md", "en");
    expect(result.ok).toBe(true);
    expect(readFileSync(path.join(root, "doc.en.md"), "utf8")).toBe(expected);
  });

  it("applies a new paragraph before a changed later block without offset corruption", async () => {
    const original = "# A\n\na\n\n# B\n\nb";
    const expected = "# A\n\na\n\nnew paragraph\n\n# B\n\nchanged block with longer content";
    writeFileSync(path.join(root, "doc.md"), original);
    await createLanguage(root, "doc.md", "en");
    writeFileSync(path.join(root, "doc.md"), expected);
    const result = await syncLanguage(root, "doc.md", "en");
    expect(result.ok).toBe(true);
    expect(readFileSync(path.join(root, "doc.en.md"), "utf8")).toBe(expected);
  });

  it("deletes a removed machine-managed block without duplicates", async () => {
    writeFileSync(path.join(root, "doc.md"), "# A\n\na\n\n# B\n\nb\n\n# C\n\nc");
    await createLanguage(root, "doc.md", "en");
    writeFileSync(path.join(root, "doc.md"), "# A\n\na\n\n# C\n\nc");
    const result = await syncLanguage(root, "doc.md", "en");
    expect(result).toMatchObject({ ok: true, changedBlocks: 1 });
    const target = readFileSync(path.join(root, "doc.en.md"), "utf8");
    expect(target).not.toContain("# B");
    expect(target.match(/# C/g)).toHaveLength(1);
  });

  it("discovers a preexisting translation baseline and syncs only changed source blocks", async () => {
    writeFileSync(path.join(root, "doc.md"), "uno\n\ndos");
    writeFileSync(path.join(root, "doc.en.md"), "one\n\ndos");
    const set = await getLanguageSet(root, "doc.md");
    expect(set.translations.en.blocks[0].humanEdited).toBe(true);
    writeFileSync(path.join(root, "doc.md"), "uno\n\ndos actualizado");
    const result = await syncLanguage(root, "doc.md", "en");
    expect(result).toMatchObject({ ok: true, changedBlocks: 1 });
    expect(readFileSync(path.join(root, "doc.en.md"), "utf8")).toBe("one\n\ndos actualizado");
  });

  it("does not overwrite a corrupt sidecar", async () => {
    writeFileSync(path.join(root, "doc.md"), "texto");
    writeFileSync(path.join(root, "doc.md.nrvn"), "{no-json");
    const result = await createLanguage(root, "doc.md", "en");
    expect(result).toMatchObject({ ok: false });
    expect(existsSync(path.join(root, "doc.en.md"))).toBe(false);
    // El sidecar corrupto no se sobrescribe: se aparta con el contenido intacto
    // para que el usuario pueda recuperarlo a mano.
    const quarantined = readdirSync(root).filter((name) => name.startsWith("doc.md.nrvn.corrupt-"));
    expect(quarantined).toHaveLength(1);
    expect(readFileSync(path.join(root, quarantined[0]), "utf8")).toBe("{no-json");
    writeFileSync(path.join(root, "doc.en.md"), "existing translation");
    const sync = await syncLanguage(root, "doc.md", "en");
    expect(sync).toMatchObject({ ok: false });
    expect(readFileSync(path.join(root, "doc.en.md"), "utf8")).toBe("existing translation");
  });

  it("merges concurrent language creations in the manifest", async () => {
    writeFileSync(path.join(root, "doc.md"), "uno\n\ndos");
    const results = await Promise.all([
      createLanguage(root, "doc.md", "en"),
      createLanguage(root, "doc.md", "fr"),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const set = await getLanguageSet(root, "doc.md");
    expect(set.translations.en?.path).toBe("doc.en.md");
    expect(set.translations.fr?.path).toBe("doc.fr.md");
  });

  it("rejects a manifest target belonging to a different document", async () => {
    writeFileSync(path.join(root, "doc.md"), "source");
    await createLanguage(root, "doc.md", "en");
    writeFileSync(path.join(root, "otro.md"), "other target");
    const sidecar = await readSidecar(path.join(root, "doc.md"));
    if (sidecar.status !== "ok") throw new Error("Expected sidecar");
    const bundle = sidecar.bundle;
    const languageSet = bundle.languages["doc.md"] as {
      translations: Record<string, { path: string }>;
    };
    languageSet.translations.en.path = "otro.md";
    expect((await writeSidecar(path.join(root, "doc.md"), bundle)).ok).toBe(true);
    const result = await syncLanguage(root, "doc.md", "en");
    expect(result).toMatchObject({ ok: false });
    expect(readFileSync(path.join(root, "otro.md"), "utf8")).toBe("other target");
  });
});

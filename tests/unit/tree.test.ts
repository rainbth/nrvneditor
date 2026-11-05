import { describe, expect, it } from "vitest";
import { buildTree, sortEntries } from "../../electron/lib/tree";
import type { TreeNode } from "../../electron/types";

const INPUT = [
  { path: "zeta.md", type: "file" as const },
  { path: "Alpha.md", type: "file" as const },
  { path: "readme.txt", type: "file" as const },
  { path: "src", type: "dir" as const },
  { path: "src/b.md", type: "file" as const },
  { path: "src/a.mdx", type: "file" as const },
  { path: "docs", type: "dir" as const },
  { path: "docs/Guide.md", type: "file" as const },
  { path: "node_modules/x.md", type: "file" as const },
  { path: ".git/y.md", type: "file" as const },
  { path: "dist/z.md", type: "file" as const },
];

describe("buildTree", () => {
  it("pone directorios primero y luego archivos con locale es", () => {
    const tree = buildTree(INPUT);
    expect(tree.map((node) => node.name)).toEqual(["docs", "src", "Alpha.md", "zeta.md"]);
  });

  it("filtra .txt y solo conserva .md/.mdx", () => {
    const files: string[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "file") files.push(node.name);
        else walk(node.children ?? []);
      }
    };
    walk(buildTree(INPUT));
    expect(files.sort()).toEqual(["Alpha.md", "Guide.md", "a.mdx", "b.md", "zeta.md"]);
  });

  it("excluye node_modules, .git y dist", () => {
    const names: string[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        names.push(node.path);
        if (node.children) walk(node.children);
      }
    };
    walk(buildTree(INPUT));
    expect(names.some((path) => path.includes("node_modules"))).toBe(false);
    expect(names.some((path) => path.includes(".git"))).toBe(false);
    expect(names.some((path) => path.includes("dist"))).toBe(false);
  });

  it("anida correctamente subcarpetas", () => {
    const tree = buildTree(INPUT);
    const docs = tree.find((node) => node.name === "docs");
    expect(docs?.children?.map((node) => node.name)).toEqual(["Guide.md"]);
    const src = tree.find((node) => node.name === "src");
    expect(src?.children?.map((node) => node.name)).toEqual(["a.mdx", "b.md"]);
  });

  it("sortEntries ordena de forma insensible a mayúsculas", () => {
    const entries: TreeNode[] = [
      { name: "beta.md", path: "beta.md", type: "file" },
      { name: "Alfa.md", path: "Alfa.md", type: "file" },
    ];
    expect(sortEntries(entries).map((node) => node.name)).toEqual(["Alfa.md", "beta.md"]);
  });

  it("reconoce hermanos de idioma", () => {
    const tree = buildTree([
      { path: "README.md", type: "file" },
      { path: "README.en.md", type: "file" },
      { path: "Guia.md", type: "file" },
      { path: "Guia.es.md", type: "file" },
    ]);
    const readme = tree.find((node) => node.path === "README.md");
    const english = tree.find((node) => node.path === "README.en.md");
    const spanish = tree.find((node) => node.path === "Guia.es.md");
    expect(english).toMatchObject({ language: "en", canonicalPath: "README.md" });
    expect(spanish).toMatchObject({ language: "es", canonicalPath: "Guia.md" });
    expect(readme?.siblings).toEqual([{ lang: "en", path: "README.en.md" }]);
  });
});

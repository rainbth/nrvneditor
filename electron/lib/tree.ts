import { languageSiblingParts } from "../../src/lib/languages";
import type { TreeNode } from "../types";
import { EXCLUDED_DIRS, isMarkdownFile } from "./paths";

export interface TreeInput {
  path: string;
  type: "dir" | "file";
}

/** Directorios primero, luego archivos; alfabético insensible a mayúsculas en español. */
export function sortEntries(entries: TreeNode[]): TreeNode[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });
}

function isUsable(input: TreeInput): boolean {
  const parts = input.path.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) return false;
  if (parts.some((part) => part.startsWith("."))) return false;
  if (parts.slice(0, -1).some((part) => EXCLUDED_DIRS.has(part))) return false;
  const name = parts[parts.length - 1];
  if (input.type === "dir") return !EXCLUDED_DIRS.has(name);
  return isMarkdownFile(name);
}

function pruneEmptyDirs(nodes: TreeNode[]): TreeNode[] {
  const kept: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "dir") {
      const children = pruneEmptyDirs(node.children ?? []);
      if (children.length > 0) kept.push({ ...node, children });
      continue;
    }
    kept.push(node);
  }
  return sortEntries(kept);
}

/**
 * Construye el árbol anidado y ordenado a partir de rutas POSIX relativas.
 * Filtra directorios excluidos, dotfiles y archivos que no son `.md`/`.mdx`.
 */
export function buildTree(nodes: TreeInput[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();

  const ensureDir = (dirPath: string): TreeNode[] => {
    if (dirPath === "") return roots;
    const existing = dirs.get(dirPath);
    if (existing?.children) return existing.children;
    const slash = dirPath.lastIndexOf("/");
    const parentPath = slash === -1 ? "" : dirPath.slice(0, slash);
    const children: TreeNode[] = [];
    const dir: TreeNode = { name: dirPath.slice(slash + 1), path: dirPath, type: "dir", children };
    ensureDir(parentPath).push(dir);
    dirs.set(dirPath, dir);
    return children;
  };

  for (const input of nodes) {
    if (!isUsable(input)) continue;
    const parts = input.path.split("/").filter((part) => part.length > 0);
    const parentPath = parts.slice(0, -1).join("/");
    if (input.type === "dir") {
      ensureDir(parts.join("/"));
      continue;
    }
    ensureDir(parentPath).push({
      name: parts[parts.length - 1],
      path: input.path,
      type: "file",
    });
  }

  const tree = pruneEmptyDirs(roots);
  const files = new Map<string, TreeNode>();
  const visit = (nodes: TreeNode[]) =>
    nodes.forEach((node) => {
      if (node.type === "file") files.set(node.path, node);
      else visit(node.children ?? []);
    });
  visit(tree);
  for (const node of files.values()) {
    const parts = languageSiblingParts(node.path);
    if (!parts) continue;
    const canonical = files.get(parts.basePath);
    if (!canonical) continue;
    node.language = parts.lang;
    node.canonicalPath = parts.basePath;
    canonical.siblings ??= [];
    if (!canonical.siblings.some((item) => item.path === node.path))
      canonical.siblings.push({ lang: parts.lang, path: node.path });
  }
  for (const node of files.values()) node.siblings?.sort((a, b) => a.lang.localeCompare(b.lang));
  return tree;
}

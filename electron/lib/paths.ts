import path from "node:path";

/** Se lanza cuando una ruta relativa intenta salir de la raíz del workspace. */
export class PathTraversalError extends Error {
  constructor(relative: string) {
    super(`Ruta fuera de la carpeta abierta: ${relative}`);
    this.name = "PathTraversalError";
  }
}

/** Directorios que nunca forman parte del árbol ni se vigilan. */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set(["node_modules", ".git", "dist"]);

function isInside(root: string, abs: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(abs));
  if (rel === "") return true;
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** Comprueba que `abs` está dentro de `root`; lanza `PathTraversalError` si no. */
export function assertInsideRoot(root: string, abs: string): void {
  if (!isInside(root, abs)) {
    throw new PathTraversalError(path.relative(path.resolve(root), path.resolve(abs)));
  }
}

/** Resuelve una ruta relativa contra la raíz y valida que no escape de ella. */
export function resolveWorkspacePath(root: string, relative: string): string {
  const abs = path.resolve(root, relative);
  assertInsideRoot(root, abs);
  return abs;
}

/** `true` para `.md` y `.mdx`, sin distinguir mayúsculas. */
export function isMarkdownFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ext === ".md" || ext === ".mdx";
}

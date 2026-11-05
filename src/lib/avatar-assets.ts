import clienteEsceptico from "../assets/avatars/cliente-esceptico.png?url";
import director from "../assets/avatars/director.png?url";
import editor from "../assets/avatars/editor.png?url";
import ejecutivo from "../assets/avatars/ejecutivo.png?url";
import lectorTecnico from "../assets/avatars/lector-tecnico.png?url";
import par from "../assets/avatars/par.png?url";
import pm from "../assets/avatars/pm.png?url";
import { LEGACY_REVIEWER_ALIASES } from "./audiences";

const AVATAR_URLS = {
  director,
  ejecutivo,
  par,
  pm,
  "cliente-esceptico": clienteEsceptico,
  "lector-tecnico": lectorTecnico,
  editor,
} as const;

export type AvatarId = keyof typeof AVATAR_URLS;

export function audienceImageUrl(id: string | null | undefined): string | null {
  if (!id) return null;
  const resolvedId = LEGACY_REVIEWER_ALIASES[id] ?? id;
  if (!Object.hasOwn(AVATAR_URLS, resolvedId)) return null;
  const url = AVATAR_URLS[resolvedId as AvatarId];
  return typeof url === "string" && url.length > 0 ? url : null;
}

export const AVATAR_IDS: readonly AvatarId[] = Object.keys(AVATAR_URLS) as AvatarId[];

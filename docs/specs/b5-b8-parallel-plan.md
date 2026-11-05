# Plan de paralelización B5–B8

Estado: plan interno, 2026-10-31. No implementa código. B4 sigue en curso y es el bloque que
posee los archivos compartidos; hasta que termine y se cree una base limpia no se abren worktrees.

## Por qué no se puede paralelizar todavía

B5–B8 comparten `electron/types.ts`, `electron/ipc.ts`, `src/lib/ipc.ts`, `src/lib/blocks.ts`,
`src/store/document.ts`, `src/components/render/*`, `src/styles/*` y el rail de avisos. B4 está
editando esos mismos archivos y el árbol no tiene un commit base con el estado actual. Abrir ramas
ahora produciría conflictos garantizados y perdería trabajo.

## Estrategia

1. **Esperar a B4** y congelar una base (`develop` o commit de integración).
2. **Unidad serial 0 — contratos compartidos** (bloquea a todas):
   - `electron/types.ts`, `electron/ipc.ts`, `electron/preload.ts`, `src/lib/ipc.ts`,
     `src/lib/blocks.ts`, `src/store/document.ts`.
   - Define `PendingBlock`, `Annotation`, `Critique`, `Comment`, `VariantAxis`, `HistoryEntry`,
     `LanguageSet` y los canales IPC.
3. **Cuatro ramas paralelas de motores** (sin UI, sin tocar los archivos de la unidad 0):
   - `p-b5-engine` — `src/lib/format-actions.ts`, `src/lib/insert.ts`,
     `electron/services/assets.ts`, unit tests.
   - `p-b6-engine` — `src/lib/variants.ts`, `src/lib/history.ts`,
     `electron/services/history.ts`, unit tests.
   - `p-b7-engine` — `src/lib/critique.ts`, `src/lib/annotations.ts`,
     `electron/services/annotations.ts`, unit tests.
   - `p-b8-engine` — `src/lib/languages.ts`, `electron/services/languages.ts`, unit tests.
4. **Integración serial de UI**: B5 → B6 → B7 → B8. Cada una toca componentes compartidos y se
   valida antes de la siguiente.
5. **Gate final**: suite completa + `dist` + expert-code sobre el diff integrado.

## Contratos mínimos de la unidad 0

```ts
type PendingState = "pending" | "filled" | "cleared";

interface PendingBlock {
  blockKey: string;
  state: PendingState;
  createdAt: string;
}

type AnnotationKind = "comment" | "critique";

interface Annotation {
  id: string;
  docKey: string;
  blockKey: string;
  blockHash: string;
  kind: AnnotationKind;
  createdAt: string;
  stale: boolean;
}

interface VariantRequest {
  axis: "length" | "detail" | "tone" | "structure" | "examples" | "audience" | "free";
  scope: "block" | "range" | "document";
  blockKeys: string[];
  baseHash: string;
}

interface HistoryEntry {
  blockKey: string;
  beforeHash: string;
  afterHash: string;
  before: string;
  after: string;
  origin: "agent" | "manual" | "restored" | "variant" | "translation";
  createdAt: string;
}

interface LanguageSet {
  originalPath: string;
  sourceLang: string;
  translations: Record<string, {
    path: string;
    sourceHash: string;
    updatedAt: string;
    stale: boolean;
    humanEditedBlocks: string[];
  }>;
}
```

## Handoff por rama

Cada `@loop-jr` recibe:

- `worktree`, `branch`, `files_owned` exactos.
- `forbidden_paths`: la unidad 0, las otras ramas, `src/components/**`, `src/styles/**`,
  `package.json`, lockfiles, `.github/**`.
- Contrato de la unidad 0 como dependencia inmutable.
- Suite propia en verde y sin cambios fuera de `files_owned`.

## Orden de merge

`p-b5-engine` → `p-b6-engine` → `p-b7-engine` → `p-b8-engine` → UI B5 → UI B6 → UI B7 → UI B8.

Los motores son independientes; el orden solo simplifica la resolución de imports y tipos.

## Riesgos

- Cuota: 4 ramas multiplican el consumo. Si el proveedor limita, bajar a 2 ramas (B5+B8 y B6+B7).
- Deriva de contratos: cualquier cambio en la unidad 0 después de abrir ramas obliga a reabrir.
- UI compartida: no se paraleliza; el rail y el panel son puntos de conflicto.
- B4 puede cambiar el modelo de bloques: la unidad 0 debe absorberlo antes de abrir ramas.

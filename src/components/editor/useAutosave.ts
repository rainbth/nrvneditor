import { useEffect, useRef, useState } from "react";
import { resolveExternalConflict } from "../../lib/commands";
import { nrvn } from "../../lib/ipc";
import { useDocumentStore } from "../../store/document";

const AUTOSAVE_MS = 800;

/**
 * Autosave global del documento (montado en `DocumentView`).
 *
 * - 800 ms después de la última edición si hay cambios y ruta.
 * - Cmd+S fuerza el guardado inmediato y cancela el temporizador.
 * - Serializa escrituras: `save()` ignora llamadas concurrentes y este hook
 *   re-agenda si al terminar la escritura el documento sigue sucio.
 */
export function useAutosave(): void {
  const dirty = useDocumentStore((state) => state.dirty);
  const content = useDocumentStore((state) => state.content);
  const path = useDocumentStore((state) => state.path);
  const saveError = useDocumentStore((state) => state.saveError);
  const externalChange = useDocumentStore((state) => state.externalChange);
  const saving = useDocumentStore((state) => state.saving);
  const save = useDocumentStore((state) => state.save);
  const [tick, setTick] = useState(0);
  const timerRef = useRef<number | null>(null);
  const pendingExternal = useRef<{ path: string; hash: string } | null>(null);

  // `content` y `tick` reinician el temporizador a propósito: cada edición
  // reinicia la ventana de 800 ms y cada guardado completado re-agenda si sigue sucio.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dependencias intencionales del debounce.
  useEffect(() => {
    const cancel = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    cancel();
    if (!dirty || path === null || saveError !== null || externalChange !== null) return cancel;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void save().then(() => {
        const state = useDocumentStore.getState();
        if (state.dirty && state.path !== null && state.saveError === null) {
          setTick((value) => value + 1);
        }
      });
    }, AUTOSAVE_MS);

    return cancel;
  }, [dirty, content, path, saveError, externalChange, save, tick]);

  // Cmd+S: guardado inmediato, fuera de CodeMirror para no duplicarlo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (useDocumentStore.getState().externalChange !== null) {
        void resolveExternalConflict().then((resolved) => {
          if (resolved) void save();
        });
        return;
      }
      void save();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  // Cambio externo del archivo (evento del bridge).
  useEffect(
    () =>
      nrvn.workspace.onFileSaved(({ path: savedPath, hash }) => {
        const state = useDocumentStore.getState();
        if (savedPath !== state.path) return;
        // Eco de nuestra propia escritura.
        if (state.saving) {
          pendingExternal.current = { path: savedPath, hash };
          return;
        }
        if (hash === state.lastWriteHash) return;
        if (state.dirty) {
          state.noteExternalChange(hash);
          void resolveExternalConflict();
          return;
        }
        void state.reload();
      }),
    [],
  );

  // Evento externo recibido mientras había una escritura en vuelo: se evalúa al terminar.
  useEffect(() => {
    if (saving) return;
    const pending = pendingExternal.current;
    if (pending === null) return;
    pendingExternal.current = null;
    const state = useDocumentStore.getState();
    if (pending.path !== state.path) return;
    if (pending.hash === state.lastWriteHash) return;
    if (state.dirty) {
      state.noteExternalChange(pending.hash);
      void resolveExternalConflict();
      return;
    }
    void state.reload();
  }, [saving]);
}

# Notas de versión 1.0.6

Fecha: 2026-11-04

## Resumen

- Alineación documental con el comportamiento real de la aplicación.
- Persistencia portable en `<doc>.md.nrvn`, además de caché en Application Support.
- Actualizaciones relacionadas con OAuth y el catálogo.
- El paquete legal se incluye ahora en el `.app`.

## Notas legales

El titular designado es `rainbrth` (seudónimo del autor). El proyecto se distribuye bajo la **licencia MIT**. La revisión legal sigue pendiente.

## Versión y build

`npm run build` y `npm run dist` empaquetan `.app` y `.dmg`. Los scripts `prebuild` y `predist` incrementan el patch; `NRVN_SKIP_VERSION_BUMP=1` evita ese incremento.

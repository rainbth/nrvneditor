# Auditoría UX: simplificación de accesos

[English](ux-access-audit.en.md) | [Español](ux-access-audit.md)

> **Actualización (revisores flotantes) — 2026-11-01.** El sistema anterior de roster persistente y selector de audiencia en el panel queda sustituido: la audiencia narrativa orienta el tono y el revisor es quien critica. La selección del revisor se realiza bajo demanda en `ReviewerPicker`, un popover flotante. Capturas de referencia: [selector](assets/screenshots/reviewer-picker-light.png) y [resultado de revisión](assets/screenshots/reviewer-review-bubble-light.png).

## 1. Objetivo y alcance

### Audiencia vs revisor

La audiencia es «para quién escribo» y se muestra como chip sobre la conversación; el revisor es «quién critica» y se elige en un picker flotante. Son controles y conceptos distintos.

### Fidelidad a la voz del autor

El revisor es un ayudante con un rol concreto que critica el texto; la audiencia es para quién se escribe el documento, modula el tono y no critica. Todas las generaciones —edición por bloques, documento completo, bloque nuevo y variante desde revisión— comparten una política de fidelidad: intervención mínima, conservación de la voz, el registro, el ritmo, la longitud aproximada, la estructura y el formato Markdown; no se reescribe lo que ya funciona ni se introduce vocabulario ajeno al autor. La variante desde revisión aplica solo los cambios necesarios para resolver los problemas listados y no toca el resto del bloque. Las sugerencias del revisor son instrucciones quirúrgicas, no reescrituras ni cambios de estilo gratuitos.

### Panel lean e hilo de comentarios

Orden del panel: cabecera → chip «Para quién escribo» (`data-testid="audience-chip"`) → conversación → composer. El chip está sobre la conversación. El historial queda fuera de la UI del panel; los comentarios viven en `BlockCommentThread`, abierto desde «Comentar bloque» en el menú contextual o desde el badge del bloque. ⌘↵/Ctrl+↵ guarda, Esc cierra y los hilos resueltos quedan colapsados.

### Menú contextual por intención

El menú contextual agrupa acciones por intención (Escribir / Revisar / Bloque), con iconos y separadores. Los estados deshabilitados explican el motivo. «Pedir al agente…» abre el panel, enfoca el composer y precarga «Sobre este bloque: ». La barra del bloque de agente solo aparece con el bloque seleccionado.

### Avatares definitivos

Los siete avatares aprobados están en `src/assets/avatars/`; los PNG legacy se retiraron.

Documentar el pase de UX de simplificación de accesos y movimiento en nrvn, un editor Markdown con agentes basado en Electron y React. El alcance comprende los accesos al flujo de agente y a las acciones del documento, los retratos de audiencia y el movimiento asociado a esas superficies.

No comprende cambios profundos de OpenCode, soporte multilenguaje ni metadatos; no añade dependencias. La paleta silver/pastel y la tipografía Lato se mantienen intactas. Para las convenciones y tokens visuales, véase el [sistema de diseño](design-system.md).

## 2. Análisis de accesos por feature

| Feature | Superficie visible | Atajo | Acciones antes | Acciones después |
| --- | --- | --- | --- | --- |
| Abrir carpeta | Rail / Cmd+O | Cmd+O | Abrir menú y elegir carpeta, o usar el atajo | Sin cambios en este pase |
| Nuevo / guardar / guardar como | Menú de archivo / accesos existentes | Cmd+N, Cmd+S, ⇧Cmd+S | Usar menú o atajo | Sin cambios en este pase |
| Render / Markdown | Selector segmentado | Cmd+E | Cambiar modo desde el selector o atajo | Sin cambios en este pase |
| Mostrar árbol / agente | Controles existentes de panel | ⌘\\ para el árbol | Accionar el control del panel | Sin cambios en este pase; el agente se alterna desde rail/header |
| Insertar bloque | Control flotante de inserción | — | Abrir el control flotante y elegir inserción | Sin cambios en este pase; se anima la aparición del control |
| Formato de bloque e inline | Barra de formato flotante y burbuja de bloque | — | Abrir la barra/burbuja y elegir una acción | Se conserva la superficie; la burbuja obtiene movimiento de entrada y respuesta spring |
| Mover / duplicar / borrar | Acciones existentes del bloque | — | Abrir las acciones del bloque y elegir una acción | Sin cambios en este pase |
| Revisar un bloque o selección | `Revisar` en la burbuja del párrafo, `Revisar selección` en el menú contextual o botón del panel; abre `ReviewerPicker` | — | Elegir audiencia y revisor desde controles mezclados del panel | Elegir uno de los siete revisores en el popover flotante bajo demanda; la audiencia es independiente. La revisión aparece en `ReviewBubble` |
| Elegir audiencia narrativa | Chip «Para quién escribo» (`audience-chip`) sobre la conversación del panel | — | Se confundía con la elección de personaje/revisor | Elegir audiencia en el chip del panel, independientemente del revisor |
| Pedir al agente | `Pedir` en la burbuja de formato del bloque (`bubble-ask`) | — | Abrir el panel y enfocar el composer | Una acción: abre el panel si está cerrado y enfoca el composer |
| Comentarios / revisiones guardadas | Hilo contextual `BlockCommentThread` por bloque | — | Acceder desde sus controles existentes | Abrir desde «Comentar bloque» o el badge; no hay historial en la UI del panel |
| Metadatos | Superficie existente de metadatos | — | Acceder desde su control existente | Sin cambios en este pase |
| Tema | Selector existente de tema | — | Cambiar tema desde el selector existente | Sin cambios en este pase; paletas preservadas |

## 3. Hallazgos de UX

- Acciones relevantes del agente quedaban ocultas tras cadenas largas de interacción.
- Algunos botones de acceso eran de 22 px.
- Se confundían la audiencia narrativa (a quién se dirige el texto) y el revisor (quién lo critica).
- Un roster persistente ocupaba espacio en el estado vacío del panel; la elección de revisor debe ocurrir solo al iniciar una revisión.
- El movimiento era casi inexistente, y menús y burbujas aparecían abruptamente.

## 4. Correcciones aplicadas

- La selección bajo demanda vive en `src/components/agent/ReviewerPicker.tsx` y `src/components/render/ReviewerPopover.tsx`; el picker muestra únicamente los siete revisores. La audiencia se elige en `audience-chip` del panel y no es un revisor (C4).
- Audiencias (`TARGET_AUDIENCES`): `general` (Lector general), `tecnico` (Perfil técnico), `decisor` (Decisor ejecutivo), `academico` (Lector académico) y `cliente` (Cliente). El id legacy `ejecutivo` se resuelve a `decisor`. Revisores: Director/a, Ejecutivo/a, Par (colega de oficio), PM (responsable de producto), Cliente escéptico, Lector técnico y Editor/a de mesa.
- Las acciones `Revisar`, `Revisar selección` y el botón del panel abren el picker. Elegir revisor ejecuta la crítica del bloque y la presenta en `ReviewBubble` (`data-testid="review-bubble"`) con «Lo que funciona», «Lo que no funciona», «Sugerencias» y CTA «Crear variante que arregle estos puntos».
- Escape cierra únicamente el picker y devuelve foco al disparador; clic fuera cierra; Tab queda atrapado en el diálogo. `prefers-reduced-motion` anula las animaciones.
- El historial no aparece en el panel. `BlockCommentThread` es contextual por bloque; ⌘↵/Ctrl+↵ guarda, Esc cierra y los hilos resueltos están colapsados.

## 5. Especificación de avatares

- Siete archivos PNG definitivos de 256×256 (Nano Banana) en `src/assets/avatars/`; los cuatro PNG legacy fueron eliminados.
- Render grande de 96×96 mediante `--avatar-xl`.
- Los siete PNG definitivos se renderizan a 96×96 mediante `--avatar-xl`, junto al nombre y rol del revisor; el estilo es «mascota adorable 3D pastel».
- Se muestran a 96×96 mediante `--avatar-xl`, junto al nombre y rol del revisor; el estilo es «mascota adorable 3D pastel».
- Los retratos aparecen en el picker flotante, no en un roster del panel.
- Los tokens y las convenciones visuales están descritos en el [sistema de diseño](design-system.md).

## 6. Contrato de motion

Los nombres y valores de tokens se definen en `src/styles/tokens.css`; véase también el [sistema de diseño](design-system.md). El pase incorpora `--motion-enter` (220 ms), `--motion-exit` (140 ms), `--stagger-step` (34 ms), `--ease-out-soft`, `--ease-spring-soft` y los tokens de sombra `--shadow-float`, `--shadow-avatar` y `--shadow-overlay` para superficies flotantes, además de `--avatar-xl` y `--radius-xl`.

- Entradas: burbujas, menús, diálogos, mensajes y propuestas; los revisores del picker entran escalonadamente.
- Hover y press: respuesta spring en botones, icon-buttons, filas y superficies pertinentes.
- Estados de carga/actividad: pulso skeleton, respiración del estado ready, cursor y spinner donde corresponda.
- `prefers-reduced-motion` desactiva las animaciones y fija las duraciones de entrada, salida y escalonado en 0 ms.

## 7. Criterios de aceptación X1–X6

- **X1 — Análisis de UX escrito y accesos corregidos:** cumple. Este documento inventaría cada feature, su superficie, atajo y número de acciones; las acciones que estaban ocultas tras cadenas largas (revisar con audiencia, elegir personaje, pedir al agente) tienen ahora una superficie directa.
- **X2 — Cada feature principal accesible en ≤2 acciones desde el documento:** cumple. Las tres entradas de revisión abren el picker en una acción y elegir revisor inicia la revisión; no se requiere abrir/configurar el panel.
- **X3 — Avatares de revisores a 96×96 con retrato legible:** cumple. Siete PNG definitivos de 256×256 se renderizan con `--avatar-xl` en el picker, con nombre y rol visibles.
- **X4 — Motion real y perceptible:** cumple. Entrada escalonada en el picker y movimiento en superficies; `prefers-reduced-motion` anula animaciones. Accesibilidad del diálogo: Escape, clic fuera y focus trap.
- **X5 — Sensación orgánica/emergente:** cumple. Retratos grandes, entrada escalonada, superficie flotante y estilo de mascotas 3D pastel distinguen la elección contextual sin ocupar permanentemente el panel.
- **X6 — Sin regresiones:** los gates informados para esta actualización son typecheck OK, lint con 0 errores, 454 tests unitarios y E2E 24/24 (`--trace off`, por un flake de traces del entorno).

## 8. Verificación ejecutada

- Gates informados para la actualización: typecheck — OK; lint — 0 errores; unitarios — 454; E2E — 24/24 con `--trace off` (flake de traces del entorno).

## 9. Desviaciones y notas

- `tests/e2e/s4-inline-bubble.spec.ts` actualizó el aserto obsoleto `menu-personas` a `menu-review`, correspondiente al acceso de revisión actual.
- `tests/e2e/loop-b5a.spec.ts` dejó de depender de una carrera con el placeholder transitorio y verifica el resultado estable del bloque generado.
- El foco del composer se vuelve a intentar cuando el textarea deja de estar deshabilitado, evitando perder el foco antes de que pueda recibirlo.
- El copy del placeholder se alineó con «Pide un cambio sobre la selección».
- Se sustituye explícitamente el diseño histórico de roster persistente y audiencia seleccionable en el panel por selección flotante de revisor y audiencia de tono independiente.

## 10. Pendientes / próximos pasos

1. Revisar contraste y legibilidad del picker en tema oscuro.
2. Valorar un atajo de teclado para iniciar una revisión.
3. Mantener sincronizados los specs si cambia el copy o los roles.
4. Evaluar el comportamiento del picker en pantallas pequeñas.

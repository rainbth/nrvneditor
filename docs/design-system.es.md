# nrvn — Sistema de diseño v3 «Moon Silver / Pearl Grey»

[English](design-system.md) | [Español](design-system.es.md)

Estado: **implementado** para v1.0.6 (2026-11-04). La UI usa v3 «Moon Silver / Pearl Grey» y
Lato; v2 «Silver Lean» queda como referencia histórica. Capturas reales: `docs/assets/screenshots/v090/`.
Fecha: 2026-11-04 · Autor: rainbrth.

## 1. Intención

v3 conserva el carácter calmado y editorial de nrvn pero lo suaviza: neutros más fríos, una
superficie hundida Moon Silver, un acento azul apagado y una sola tipografía humanista para UI y
prosa. El objetivo es una superficie de escritura que desaparezca detrás del texto.

Reglas que no cambian:

- Sin gradientes. Sin glassmorphism. Sin sombras decorativas más allá de los dos tokens de abajo.
- Light y dark son paletas completas, no una inversión automática.
- Todo color, radio, duración y sombra es un token. Sin valores mágicos en componentes.
- Objetivos de contraste: 4,5:1 para texto normal, 3:1 para texto grande y UI no textual
  (WCAG 2.1 AA).

## 2. Color

### 2.1 Light — Mist / Moon Silver

| Token | Valor | Rol |
| --- | --- | --- |
| `--color-bg` | `#F4F5F5` | Fondo de la app (Mist) |
| `--color-surface` | `#FCFCFC` | Paneles, superficie del documento |
| `--color-elevated` | `#FFFFFF` | Menús, popovers, cards |
| `--color-sunken` | `#ECEEEF` | Pozos, filas inactivas (Moon Silver) |
| `--color-ink` | `#202326` | Texto primario |
| `--color-ink-secondary` | `#485056` | Texto secundario |
| `--color-muted` | `#70757A` | Placeholders, metadatos |
| `--color-line` | `#E1E4E6` | Bordes por defecto |
| `--color-line-strong` | `#848B92` | Bordes enfatizados, botones secundarios |
| `--color-accent` | `#6C8AA3` | Barras, rellenos, anillo de foco |
| `--color-accent-hover` | `#5B7C99` | Acento en hover/pressed |
| `--color-accent-text` | `#46647B` | Texto de acento pequeño y enlaces (AA) |
| `--color-accent-soft` | `#E6EDF2` | Nav activa, cromo de selección |
| `--color-selection-bg` | `#E6EDF2` | Banda de selección |
| `--color-selection-bar` | `#5B7C99` | Barra de selección de 2 px |
| `--color-pastel-blue` | `#E6EDF2` | Tinte de tag / bloque |
| `--color-pastel-sage` | `#E6EEE9` | Tinte de tag / bloque |
| `--color-pastel-lavender` | `#ECEAF2` | Tinte de tag / bloque |
| `--color-pastel-butter` | `#F4EFE1` | Tinte de tag / bloque |
| `--color-pastel-pearl` | `#F3F4F2` | Tinte neutro |
| `--color-danger` | `#A34A3C` | Errores, acciones destructivas |
| `--color-success` | `#3F7358` | Guardado, éxito |
| `--color-warning` | `#8A6A2F` | Avisos |

### 2.2 Dark

| Token | Valor | Rol |
| --- | --- | --- |
| `--color-bg` | `#191B1D` | Fondo de la app |
| `--color-surface` | `#202326` | Paneles, superficie del documento |
| `--color-elevated` | `#262A2D` | Menús, popovers, cards |
| `--color-sunken` | `#151719` | Pozos, filas inactivas |
| `--color-ink` | `#ECEEF0` | Texto primario |
| `--color-ink-secondary` | `#C3C9CE` | Texto secundario |
| `--color-muted` | `#A0A7AE` | Placeholders, metadatos |
| `--color-line` | `#30353A` | Bordes por defecto |
| `--color-line-strong` | `#6F7880` | Bordes enfatizados |
| `--color-accent` | `#A9C0D2` | Barras, rellenos, anillo de foco |
| `--color-accent-hover` | `#C7D8E4` | Acento en hover/pressed |
| `--color-accent-text` | `#C7D8E4` | Texto de acento pequeño y enlaces (AA) |
| `--color-accent-soft` | `rgba(169,192,210,.14)` | Nav activa, cromo de selección |
| `--color-selection-bg` | `#24313C` | Banda de selección |
| `--color-selection-bar` | `#A9C0D2` | Barra de selección de 2 px |
| `--color-danger` | `#E08A7A` | Errores |
| `--color-success` | `#86B79A` | Guardado, éxito |
| `--color-warning` | `#D6B26A` | Avisos |

Los tintes pastel son solo de modo light. En dark, usa `accent-soft` y `sunken` para los mismos
roles; no inventes pasteles oscuros.

`--color-accent-hover` es un token derivado: light usa el azul de la barra de selección
(`#5B7C99`), dark usa el azul de accent-text (`#C7D8E4`). Si una revisión futura de la paleta lo
define explícitamente, ese valor prevalece.

### 2.3 Reglas de uso

- `--color-accent` para barras, rellenos y el anillo de foco. Nunca para texto pequeño sobre `bg`.
- `--color-accent-text` para texto pequeño, enlaces e iconos que deban pasar AA.
- Los bordes son `line` por defecto; `line-strong` solo para botones secundarios y divisores
  enfatizados.
- Los colores semánticos son texto e iconos, no rellenos grandes; un botón de peligro relleno usa
  `danger` con texto blanco solo si el contraste pasa.
- La selección siempre usa banda + barra, nunca un bloque sólido de acento.

## 3. Tipografía

**Lato** (SIL Open Font License 1.1) para toda la UI y la prosa: clara, humanista, sencilla, al
estilo Slack. Pesos 400 y 700; itálica 400. Inter se mantiene solo como fallback del sistema si
Lato no carga. Newsreader se retira.

| Rol | Tamaño | Peso | Altura de línea | Notas |
| --- | --- | --- | --- | --- |
| UI small | 12 px | 400 | 1,4 | Metadatos, badges |
| UI base | 13 px | 400 | 1,45 | Menús, árbol, controles |
| UI large | 14 px | 400/700 | 1,45 | Cabeceras de panel, botones |
| Prosa | 16,5 px | 400 | 1,7 | Cuerpo del documento |
| Prosa strong | 16,5 px | 700 | 1,7 | Negrita inline |
| H1 | 28 px | 600 | 1,25 | Título del documento |
| H2 | 22 px | 600 | 1,3 | Sección |
| H3 | 18 px | 600 | 1,35 | Subsección |
| H4–H6 | 16,5 px | 600 | 1,4 | Headings menores |
| Código | 13,5 px | 400 | 1,6 | Monoespaciada del sistema |

Reglas:

- Medida de prosa 62–72 caracteres; columna del documento máximo 720 px.
- Sin trucos de tracking. Sin etiquetas en mayúsculas salvo metadatos de 11 px con
  `letter-spacing: .04em`.
- La itálica es para énfasis, no para etiquetas de UI.
- El código usa la pila monoespaciada del sistema:
  `ui-monospace, SFMono-Regular, Menlo, monospace`.

## 4. Espacio, radio, elevación, motion

**Espaciado** — base 4 px: `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16,
`--space-5` 20, `--space-6` 24, `--space-7` 32, `--space-8` 40, `--space-9` 48, `--space-10` 64.

**Radio** — `--radius-sm` 5 px (inputs, chips), `--radius-md` 8 px (botones, filas, menús),
`--radius-lg` 12 px (paneles, overlays).

**Elevación**

| Token | Valor | Uso |
| --- | --- | --- |
| `--shadow-card` | `0 1px 2px rgba(16,24,40,.04)` | Cards, cabeceras sticky |
| `--shadow-overlay` | `0 12px 32px rgba(16,24,40,.12)` | Menús, diálogos, popovers |

**Motion** — `--motion-fast` 120 ms para hover/press; `--motion-base` 180 ms para overlays y
cambios de panel. Easing estándar `cubic-bezier(.2,.8,.2,1)`. `prefers-reduced-motion` pone las
duraciones a 0 ms sin perder funcionalidad.

**Foco** — anillo de 2 px en `--color-accent`, `outline-offset: 2px`. Nunca se quita el foco sin
reemplazo. El foco de teclado siempre es visible; la selección con ratón no dibuja el anillo.

## 5. Layout

| Región | Tamaño | Notas |
| --- | --- | --- |
| Titlebar | 44 px a todo el ancho | Arrastrable; semáforos macOS en `{x:16, y:15}` |
| Rail | 56 px | Acciones globales, no colapsa |
| Árbol / outline | 248 px | Colapsable |
| Documento | prosa máximo 720 px | Centrado en el espacio restante |
| Panel de agente | 380 px | Colapsable |

Responsive:

- ≥ 1024 px: tres paneles visibles.
- 900–1023 px: árbol colapsado por defecto; rail + documento + agente.
- < 900 px: aviso explícito de ancho insuficiente, con opción de continuar en layout reducido.

La ventana usa `titleBarStyle: "hiddenInset"`. Los elementos interactivos dentro de la titlebar
quedan excluidos de la región de arrastre.

## 6. Componentes

### 6.1 Titlebar

44 px, todo el ancho, `-webkit-app-region: drag`. Izquierda: wordmark `nrvn` tras los semáforos.
Derecha: estado de guardado (`Guardado`, `Guardando…`, `Sin guardar`, `Error al guardar`,
`Borrador`). 13 px, `ink-secondary` para el estado por defecto, `danger` para errores.

### 6.2 Rail

56 px, vertical. Botones de icono 32×32, icono 16 px, tooltip en hover/focus. Ítem activo con
fondo `accent-soft` e icono `accent-text`. Separador de 1 px `line` con 8 px de margen vertical.

### 6.3 Árbol y outline

Filas de 28 px, sangría de 16 px por nivel, 8 px de padding horizontal. Hover `sunken`;
selección `accent-soft` con `accent-text`. Chevron de 14 px. Iconos de archivo de 15 px, `muted`.
El outline usa las mismas métricas de fila con sangría por nivel de heading. El árbol tiene
`role="tree"` y navegación completa con flechas.

### 6.4 Documento

Fondo surface, sin borde duro. Columna de prosa máximo 720 px, 32 px de padding superior y 48 px
inferior. Los headings usan la escala de arriba; los enlaces usan `accent-text` con subrayado en
hover. Los bloques de código usan fondo `sunken`, `radius-md`, 12 px de padding y sin sombra.

### 6.5 Panel de agente

380 px. Cabecera de 44 px con selector de modelo y punto de estado. El hilo scrollea; mensajes de
13 px de UI con bloques de prosa a 15 px. Composer fijo abajo: input `surface`, borde `line`,
anillo de foco de 2 px accent. Botón Enviar primario; deshabilitado al 40 % de opacidad y
`not-allowed`.

### 6.6 Menús

El menú nativo de Electron y los menús in-app de Radix comparten comandos:

- **Workspace**: Abrir carpeta…, Reabrir reciente, Recargar árbol, Revelar en Finder.
- **Archivo**: Nuevo, Guardar, Guardar como…, Copiar ruta, Cerrar documento.
- **Documento**: Render/Markdown, Seleccionar documento completo, Copiar Markdown.
- **Agente**: estado, modelo (deshabilitado hasta v0.2), limpiar hilo.

Superficie `elevated`, borde `line`, `radius-md`, `shadow-overlay`, 4 px de padding. Ítems de
32 px, 8 px de padding horizontal, icono de 15 px, atajo alineado a la derecha en `muted`,
`aria-keyshortcuts` en cada ítem accionable. Context menu en el árbol: Abrir, Revelar en Finder,
Copiar ruta.

### 6.7 Control segmentado (Render / Markdown)

Dos posiciones, 28 px de alto, pista `sunken`, `radius-sm`, thumb activo `surface` con
`shadow-card`. Etiquetas de 12 px; activa `ink`, inactiva `muted`. Teclado: flechas mueven la
selección, Enter aplica.

### 6.8 Botones

| Variante | Fondo | Borde | Texto | Hover |
| --- | --- | --- | --- | --- |
| Primario | `accent` | ninguno | blanco | `accent-hover` |
| Secundario | `surface` | 1 px `line-strong` | `ink` | `sunken` |
| Ghost | transparente | ninguno | `ink-secondary` | `sunken` |

Alturas 28 px (compacto) y 32 px (por defecto); padding horizontal 12 px; `radius-md`; 13 px
peso 400. Deshabilitado: 40 % de opacidad, sin hover.

### 6.9 Inputs

32 px de alto, fondo `surface`, 1 px `line`, `radius-sm`, 8 px de padding horizontal, texto de
13 px. Placeholder `muted`. Foco: borde de 1 px `accent` más anillo de 2 px con offset 2. Error:
borde `danger` más mensaje de 12 px debajo.

### 6.10 Badges de comentario

Círculo de 18 px en el margen del bloque, fondo `accent-soft`, contador `accent-text`, 11 px.
Estado resuelto en `muted` y 70 % de opacidad. Hover eleva a `elevated` con `shadow-card`. El
badge es un botón con nombre accesible ("3 comentarios en este bloque").

### 6.11 Selección

- Banda: `selection-bg` sobre el bloque o rango.
- Barra: 2 px `selection-bar` en el borde interior, con `padding-inline: 14px` para no tocar el
  texto.
- Rango: banda continua, sin huecos; etiqueta "3 bloques" en una píldora de 20 px al inicio.
- Modo Markdown: `cm-block-selected` usa la misma banda + barra; la selección nativa de texto usa
  `--color-selection-text`.
- Dark usa los tokens oscuros `selection-bg` / `selection-bar`.

### 6.12 Vacío, carga, error

| Estado | Patrón |
| --- | --- |
| Vacío | Título corto 14 px 600, una línea de cuerpo 13 px `muted`, un CTA primario |
| Carga | Filas skeleton con `sunken` y pulso de 180 ms; sin spinner para listas |
| Error | Icono `danger` de 16 px, causa en una línea, un botón de reintento, acción secundaria opcional |

El copy siempre se traduce (`es`/`en`) a través del catálogo de i18n.

## 7. Dark mode

- `class="dark"` en la raíz cambia el conjunto de tokens; sin lógica de color por componente.
- La elevación se expresa con superficies, no con sombras más fuertes.
- Imágenes y resaltado de código usan un tema a juego con las superficies oscuras.
- El contraste se revisa por token; existe `accent-text` oscuro porque `accent` es demasiado claro
  para texto pequeño sobre `bg`.

## 8. Accesibilidad

- WCAG 2.1 AA: 4,5:1 texto, 3:1 texto grande y UI.
- Anillo de foco siempre visible, 2 px accent + offset 2.
- Menús, árbol, diálogos y overlays usan primitivas Radix con roles y gestión de foco correctos.
- El streaming usa `aria-live="polite"`; los errores de guardado usan `assertive`.
- Todos los objetivos interactivos de al menos 28×28 px; filas del árbol de 28 px de alto.
- Se respeta `prefers-reduced-motion`.
- Los cambios de idioma se anuncian; el atributo `lang` se actualiza con el selector.

## 9. Internacionalización

La UI debe soportar español e inglés de extremo a extremo, incluido el menú nativo. El selector
de idioma vive en ajustes y en el menú, persiste en `settings.json`, se aplica sin reiniciar y
reconstruye el menú nativo. El primer arranque detecta el idioma del sistema (`es`/`en`) y cae a
inglés. Fechas y números usan `Intl` con el locale activo. El contenido del usuario nunca se
traduce.

Estado: la internacionalización de UI es parcial; la i18n completa no forma parte de v1.0.6.

## 10. Atajos

| Atajo | Acción |
| --- | --- |
| Cmd+N | Nuevo documento |
| Cmd+O | Abrir carpeta… |
| ⇧Cmd+O | Reabrir reciente |
| Cmd+S | Guardar ahora |
| ⇧Cmd+S | Guardar como… |
| Cmd+W | Cerrar documento |
| Cmd+E | Render ↔ Markdown |
| ⇧Cmd+A | Seleccionar documento completo |
| ⇧Cmd+C | Copiar Markdown |
| Cmd+Enter | Enviar al agente (v0.2) |
| Esc | Cerrar overlay → limpiar selección → cancelar generación |

## 11. Referencias

Las referencias visuales son **conceptos, no capturas del producto**:

- `docs/assets/design/ui-concept-1.png`
- `docs/assets/design/ui-concept-2.png`
- `docs/assets/design/design-sheet-01.png` — hoja de diseño v3 generada (concepto visual, no captura del producto).

Capturas reales: `docs/assets/screenshots/v090/`.

No presentes las imágenes de concepto como evidencia de UI publicada.

## 12. Checklist de implementación (v3)

1. Reemplazar los tokens v2 por el conjunto v3 en `tokens.css`; sin cambios de componentes.
2. Eliminar la importación de Newsreader; empaquetar Lato 400/700/itálica 400 y fijar la pila de
   fallback.
3. Actualizar tamaños de prosa (16,5 px / 1,7) y pesos de heading (600).
4. Aplicar radios 5/8/12 y los dos tokens de sombra.
5. Revisar contraste de `accent-text`, `muted` y `line-strong` en ambos temas.
6. Actualizar banda/barra de selección y tokens de selección en dark.
7. Actualizar capturas y la hoja de diseño tras la migración.

Sin gradientes, sin glassmorphism, sin temas adicionales.

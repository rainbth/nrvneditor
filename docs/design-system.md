# nrvn — Design System v3 "Moon Silver / Pearl Grey"

[English](design-system.md) | [Español](design-system.es.md)

Status: **implemented** for v1.0.6 (2026-11-04). v3 "Moon Silver / Pearl Grey" and Lato ship;
v2 "Silver Lean" remains a historical reference. Real screenshots: `docs/assets/screenshots/v090/`.
Date: 2026-11-04 · Author: rainbrth.

## 1. Intent

v3 keeps the calm, editorial character of nrvn but softens it: cooler neutrals, a moon-silver
sunken surface, a muted blue accent and a single humanist typeface for both UI and prose. The
goal is a writing surface that disappears behind the text.

Rules that do not change:

- No gradients. No glassmorphism. No decorative shadows beyond the two tokens below.
- Light and dark are complete palettes, not an automatic inversion.
- Every color, radius, duration and shadow is a token. No magic values in components.
- Contrast targets: 4.5:1 for normal text, 3:1 for large text and non-text UI (WCAG 2.1 AA).

## 2. Color

### 2.1 Light — Mist / Moon Silver

| Token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#F4F5F5` | App background (Mist) |
| `--color-surface` | `#FCFCFC` | Panels, document surface |
| `--color-elevated` | `#FFFFFF` | Menus, popovers, cards |
| `--color-sunken` | `#ECEEEF` | Wells, inactive rows (Moon Silver) |
| `--color-ink` | `#202326` | Primary text |
| `--color-ink-secondary` | `#485056` | Secondary text |
| `--color-muted` | `#70757A` | Placeholders, metadata |
| `--color-line` | `#E1E4E6` | Default borders |
| `--color-line-strong` | `#848B92` | Emphasized borders, secondary buttons |
| `--color-accent` | `#6C8AA3` | Bars, fills, focus ring |
| `--color-accent-hover` | `#5B7C99` | Hover/pressed accent |
| `--color-accent-text` | `#46647B` | Small accent text and links (AA) |
| `--color-accent-soft` | `#E6EDF2` | Active nav, selection chrome |
| `--color-selection-bg` | `#E6EDF2` | Selection band |
| `--color-selection-bar` | `#5B7C99` | 2 px selection bar |
| `--color-pastel-blue` | `#E6EDF2` | Tag / block tint |
| `--color-pastel-sage` | `#E6EEE9` | Tag / block tint |
| `--color-pastel-lavender` | `#ECEAF2` | Tag / block tint |
| `--color-pastel-butter` | `#F4EFE1` | Tag / block tint |
| `--color-pastel-pearl` | `#F3F4F2` | Neutral tint |
| `--color-danger` | `#A34A3C` | Errors, destructive actions |
| `--color-success` | `#3F7358` | Saved, success |
| `--color-warning` | `#8A6A2F` | Warnings |

### 2.2 Dark

| Token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#191B1D` | App background |
| `--color-surface` | `#202326` | Panels, document surface |
| `--color-elevated` | `#262A2D` | Menus, popovers, cards |
| `--color-sunken` | `#151719` | Wells, inactive rows |
| `--color-ink` | `#ECEEF0` | Primary text |
| `--color-ink-secondary` | `#C3C9CE` | Secondary text |
| `--color-muted` | `#A0A7AE` | Placeholders, metadata |
| `--color-line` | `#30353A` | Default borders |
| `--color-line-strong` | `#6F7880` | Emphasized borders |
| `--color-accent` | `#A9C0D2` | Bars, fills, focus ring |
| `--color-accent-hover` | `#C7D8E4` | Hover/pressed accent |
| `--color-accent-text` | `#C7D8E4` | Small accent text and links (AA) |
| `--color-accent-soft` | `rgba(169,192,210,.14)` | Active nav, selection chrome |
| `--color-selection-bg` | `#24313C` | Selection band |
| `--color-selection-bar` | `#A9C0D2` | 2 px selection bar |
| `--color-danger` | `#E08A7A` | Errors |
| `--color-success` | `#86B79A` | Saved, success |
| `--color-warning` | `#D6B26A` | Warnings |

Pastel tints are light-mode only. In dark mode, use `accent-soft` and `sunken` for the same
roles; do not invent dark pastels.

`--color-accent-hover` is a derived token: light uses the selection-bar blue (`#5B7C99`), dark
uses the accent-text blue (`#C7D8E4`). If a future palette revision defines it explicitly, that
value wins.

### 2.3 Usage rules

- `--color-accent` for bars, fills and the focus ring. Never for small text on `bg`.
- `--color-accent-text` for small text, links and icons that must pass AA.
- Borders are `line` by default; `line-strong` only for secondary buttons and emphasized
  dividers.
- Semantic colors are text and icons, not large fills; a filled danger button uses `danger` with
  white text only if contrast passes.
- Selection always uses band + bar, never a solid block of accent.

## 3. Typography

**Lato** (SIL Open Font License 1.1) for all UI and prose: clear, humanist, simple, Slack-like.
Weights 400 and 700; italic 400. Inter is kept only as a system fallback if Lato fails to load.
Newsreader is retired.

| Role | Size | Weight | Line height | Notes |
| --- | --- | --- | --- | --- |
| UI small | 12 px | 400 | 1.4 | Metadata, badges |
| UI base | 13 px | 400 | 1.45 | Menus, tree, controls |
| UI large | 14 px | 400/700 | 1.45 | Panel headers, buttons |
| Prose | 16.5 px | 400 | 1.7 | Document body |
| Prose strong | 16.5 px | 700 | 1.7 | Bold inline |
| H1 | 28 px | 600 | 1.25 | Document title |
| H2 | 22 px | 600 | 1.3 | Section |
| H3 | 18 px | 600 | 1.35 | Subsection |
| H4–H6 | 16.5 px | 600 | 1.4 | Minor headings |
| Code | 13.5 px | 400 | 1.6 | System monospace |

Rules:

- Prose measure 62–72 characters; document column max 720 px.
- No tracking hacks. No all-caps labels except 11 px metadata with `letter-spacing: .04em`.
- Italic is for emphasis, not for UI labels.
- Code uses the system monospace stack: `ui-monospace, SFMono-Regular, Menlo, monospace`.

## 4. Space, radius, elevation, motion

**Spacing** — 4 px base: `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16,
`--space-5` 20, `--space-6` 24, `--space-7` 32, `--space-8` 40, `--space-9` 48, `--space-10` 64.

**Radius** — `--radius-sm` 5 px (inputs, chips), `--radius-md` 8 px (buttons, rows, menus),
`--radius-lg` 12 px (panels, overlays).

**Elevation**

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-card` | `0 1px 2px rgba(16,24,40,.04)` | Cards, sticky headers |
| `--shadow-overlay` | `0 12px 32px rgba(16,24,40,.12)` | Menus, dialogs, popovers |

**Motion** — `--motion-fast` 120 ms for hover/press; `--motion-base` 180 ms for overlays and
panel changes. Standard easing `cubic-bezier(.2,.8,.2,1)`. `prefers-reduced-motion` sets
durations to 0 ms without losing function.

**Focus** — 2 px ring in `--color-accent`, `outline-offset: 2px`. Never remove focus without a
replacement. Keyboard focus is always visible; mouse selection does not draw the ring.

## 5. Layout

| Region | Size | Notes |
| --- | --- | --- |
| Titlebar | 44 px full width | Draggable; macOS traffic lights at `{x:16, y:15}` |
| Rail | 56 px | Global actions, does not collapse |
| Tree / outline | 248 px | Collapsible |
| Document | max 720 px prose | Centered in the remaining space |
| Agent panel | 380 px | Collapsible |

Responsive:

- ≥ 1024 px: three panels visible.
- 900–1023 px: tree collapsed by default; rail + document + agent.
- < 900 px: explicit notice of insufficient width, with an option to continue in a reduced
  layout.

The window uses `titleBarStyle: "hiddenInset"`. Interactive elements inside the titlebar are
excluded from the drag region.

## 6. Components

### 6.1 Titlebar

44 px, full width, `-webkit-app-region: drag`. Left: `nrvn` wordmark after the traffic lights.
Right: save state (`Saved`, `Saving…`, `Unsaved`, `Save error`, `Draft`). 13 px, `ink-secondary`
for the default state, `danger` for errors.

### 6.2 Rail

56 px, vertical. Icon buttons 32×32, icon 16 px, tooltip on hover/focus. Active item uses
`accent-soft` background and `accent-text` icon. Separator 1 px `line` with 8 px vertical margin.

### 6.3 Tree and outline

Rows 28 px, 16 px indent per level, 8 px horizontal padding. Hover `sunken`; selected
`accent-soft` with `accent-text`. Chevron 14 px. File icons 15 px, `muted`. Outline uses the same
row metrics with heading-level indent. The tree has `role="tree"` and full arrow-key navigation.

### 6.4 Document

Surface background, no hard border. Prose column max 720 px, 32 px top padding, 48 px bottom.
Headings use the type ramp above; links use `accent-text` with underline on hover. Code blocks use
`sunken` background, `radius-md`, 12 px padding, no shadow.

### 6.5 Agent panel

380 px. Header 44 px with model selector and state dot. Thread scrolls; messages 13 px UI with
prose blocks at 15 px. Composer fixed at the bottom: input `surface`, border `line`, focus ring
2 px accent. Send button primary; disabled at 40 % opacity and `not-allowed`.

### 6.6 Menus

Native Electron menu and in-app Radix menus share commands:

- **Workspace**: Open folder…, Reopen recent, Reload tree, Reveal in Finder.
- **File**: New, Save, Save as…, Copy path, Close document.
- **Document**: Render/Markdown, Select whole document, Copy Markdown.
- **Agent**: state, model (disabled until v0.2), clear thread.

Menu surface `elevated`, border `line`, `radius-md`, `shadow-overlay`, 4 px padding. Items 32 px,
8 px horizontal padding, icon 15 px, shortcut right-aligned in `muted`, `aria-keyshortcuts` on
each actionable item. Context menu on the tree: Open, Reveal in Finder, Copy path.

### 6.7 Segmented control (Render / Markdown)

Two positions, 28 px high, `sunken` track, `radius-sm`, active thumb `surface` with
`shadow-card`. Labels 12 px; active label `ink`, inactive `muted`. Keyboard: arrows move
selection, Enter applies.

### 6.8 Buttons

| Variant | Background | Border | Text | Hover |
| --- | --- | --- | --- | --- |
| Primary | `accent` | none | white | `accent-hover` |
| Secondary | `surface` | 1 px `line-strong` | `ink` | `sunken` |
| Ghost | transparent | none | `ink-secondary` | `sunken` |

Heights 28 px (compact) and 32 px (default); horizontal padding 12 px; `radius-md`; 13 px
weight 400. Disabled: 40 % opacity, no hover.

### 6.9 Inputs

Height 32 px, `surface` background, 1 px `line`, `radius-sm`, 8 px horizontal padding, 13 px
text. Placeholder `muted`. Focus: 1 px `accent` border plus 2 px ring with 2 px offset. Error:
`danger` border plus 12 px message below.

### 6.10 Comment badges

18 px circle in the block margin, `accent-soft` background, `accent-text` count, 11 px. Resolved
state uses `muted` and 70 % opacity. Hover raises to `elevated` with `shadow-card`. Badge is a
button with an accessible name ("3 comments on this block").

### 6.11 Selection

- Band: `selection-bg` across the block or range.
- Bar: 2 px `selection-bar` on the inner edge, with `padding-inline: 14px` so it never touches
  text.
- Range: continuous band, no gaps; label "3 blocks" in a 20 px pill at the start.
- Markdown mode: `cm-block-selected` uses the same band + bar; native text selection uses
  `--color-selection-text`.
- Dark mode uses the dark `selection-bg` / `selection-bar` tokens.

### 6.12 Empty, loading, error

| State | Pattern |
| --- | --- |
| Empty | Short title 14 px 600, one-line body 13 px `muted`, one primary CTA |
| Loading | Skeleton rows using `sunken` with a 180 ms pulse; no spinner for lists |
| Error | `danger` icon 16 px, one-line cause, one retry button, optional secondary action |

Copy is always translated (`es`/`en`) through the i18n catalog.

## 7. Dark mode

- `class="dark"` on the root swaps the token set; no component-level color logic.
- Elevation is expressed with surfaces, not stronger shadows.
- Images and code highlighting use a theme matched to dark surfaces.
- Contrast is re-checked per token; dark `accent-text` exists because `accent` is too light for
  small text on `bg`.

## 8. Accessibility

- WCAG 2.1 AA: 4.5:1 text, 3:1 large text and UI.
- Focus ring always visible, 2 px accent + 2 px offset.
- Menus, tree, dialogs and overlays use Radix primitives with correct roles and focus management.
- Streaming uses `aria-live="polite"`; save errors use `assertive`.
- All interactive targets at least 28×28 px; tree rows 28 px high.
- `prefers-reduced-motion` respected.
- Language changes are announced; `lang` attribute updates with the selector.

## 9. Internationalization

The UI must support Spanish and English end to end, including the native menu. The language
selector lives in settings and in the menu, persists in `settings.json`, applies without a
restart and rebuilds the native menu. First launch detects the system language (`es`/`en`) and
falls back to English. Dates and numbers use `Intl` with the active locale. User content is never
translated.

Status: UI internationalization is partial; complete end-to-end UI i18n is not included in v1.0.6.

## 10. Shortcuts

| Shortcut | Action |
| --- | --- |
| Cmd+N | New document |
| Cmd+O | Open folder… |
| ⇧Cmd+O | Reopen recent |
| Cmd+S | Save now |
| ⇧Cmd+S | Save as… |
| Cmd+W | Close document |
| Cmd+E | Render ↔ Markdown |
| ⇧Cmd+A | Select whole document |
| ⇧Cmd+C | Copy Markdown |
| Cmd+Enter | Send to agent (v0.2) |
| Esc | Close overlay → clear selection → cancel generation |

## 11. References

Visual references are **concepts, not product screenshots**:

- `docs/assets/design/ui-concept-1.png`
- `docs/assets/design/ui-concept-2.png`
- `docs/assets/design/design-sheet-01.png` — generated v3 design sheet (visual concept, not a product screenshot).

Real screenshots: `docs/assets/screenshots/v090/`.

Do not present concept images as evidence of shipped UI.

## 12. Implementation checklist (v3)

1. Replace v2 tokens with the v3 token set in `tokens.css`; no component changes.
2. Remove the Newsreader import; bundle Lato 400/700/italic 400 and set the fallback stack.
3. Update prose sizes (16.5 px / 1.7) and heading weights (600).
4. Apply radii 5/8/12 and the two shadow tokens.
5. Re-check contrast for `accent-text`, `muted`, `line-strong` in both themes.
6. Update selection band/bar and dark selection tokens.
7. Update screenshots and the design sheet after the migration.

No gradients, no glassmorphism, no additional themes.

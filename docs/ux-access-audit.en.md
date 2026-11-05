# UX audit: access simplification

[English](ux-access-audit.en.md) | [Español](ux-access-audit.md)

> **Update (floating reviewers) — 2026-11-01.** The former persistent roster and panel audience selector have been replaced: narrative audience sets the tone, while a reviewer provides critique. Reviewers are chosen on demand in the floating `ReviewerPicker` popover. Reference screenshots: [picker](assets/screenshots/reviewer-picker-light.png) and [review result](assets/screenshots/reviewer-review-bubble-light.png).

## 1. Objective and scope

### Audience vs. reviewer

Audience means “who I’m writing for” and appears as a chip above the conversation; the reviewer means “who critiques” and is selected in a floating picker. They are distinct concepts and controls.

### Fidelity to the author’s voice

The reviewer is a helper with a concrete role who critiques the text; the audience is who the document is written for, shapes the tone, and does not critique. Every generation path —block editing, full document, new block, and review-derived variant— shares one fidelity policy: minimal intervention, preserving the author’s voice, register, rhythm, approximate length, structure, and Markdown formatting; working prose is not rewritten and outside vocabulary is not introduced. A review-derived variant applies only the changes needed to resolve the listed problems and leaves the rest of the block untouched. Reviewer suggestions are surgical instructions, not rewrites or gratuitous style changes.

### Lean panel and comment threads

Panel order: header → “Who I’m writing for” audience chip (`data-testid="audience-chip"`) → conversation → composer. The chip sits above the conversation. History is entirely outside the panel UI; comments live in contextual per-block `BlockCommentThread`s, opened from “Comment on block” in the context menu or the block badge. ⌘↵/Ctrl+↵ saves, Esc closes, and resolved threads are collapsed.

### Intent-based context menu

The context menu groups actions by intent (Write / Review / Block), with icons and separators. Disabled states explain why. “Ask the agent…” opens the panel, focuses the composer, and preloads “About this block: ”. The agent block bar is contextual and appears only when its block is selected.

### Final avatars

The seven approved avatars live in `src/assets/avatars/`; the legacy PNGs have been removed.

Document the UX pass for access simplification and motion in nrvn, a Markdown editor with agents built with Electron and React. The scope covers access to agent workflows and document actions, audience portraits, and motion for those surfaces.

It does not cover deep OpenCode changes, multilingual support, or metadata; it adds no dependencies. The silver/pastel palette and Lato typeface remain unchanged. For visual conventions and tokens, see the [design system](design-system.md).

## 2. Feature access analysis

| Feature | Visible surface | Shortcut | Actions before | Actions after |
| --- | --- | --- | --- | --- |
| Open folder | Rail / Cmd+O | Cmd+O | Open the menu and choose a folder, or use the shortcut | Unchanged in this pass |
| New / save / save as | File menu / existing access | Cmd+N, Cmd+S, ⇧Cmd+S | Use the menu or shortcut | Unchanged in this pass |
| Render / Markdown | Segmented selector | Cmd+E | Change mode using the selector or shortcut | Unchanged in this pass |
| Show tree / agent | Existing panel controls | ⌘\\ for the tree | Activate the panel control | Unchanged in this pass; the agent is toggled from the rail/header |
| Insert block | Floating insert control | — | Open the floating control and choose an insertion | Unchanged in this pass; the control's appearance is animated |
| Block and inline formatting | Floating format bar and block bubble | — | Open the bar/bubble and choose an action | Surface retained; the bubble gains entrance motion and spring response |
| Move / duplicate / delete | Existing block actions | — | Open the block actions and choose an action | Unchanged in this pass |
| Review a block or selection | `Review` in the paragraph bubble, `Review selection` in the context menu, or panel button; opens `ReviewerPicker` | — | Choose audience and reviewer from mixed panel controls | Choose one of seven reviewers in the on-demand floating popover; audience is independent. The result appears in `ReviewBubble` |
| Choose narrative audience | “Who I’m writing for” chip (`audience-chip`) above the panel conversation | — | Audience and character/reviewer selection were conflated | Choose the audience in the panel chip, independently of the reviewer |
| Ask the agent | `Ask` in the block format bubble (`bubble-ask`) | — | Open the panel and focus the composer | One action: opens the panel if closed and focuses the composer |
| Comments / saved reviews | Contextual per-block `BlockCommentThread` | — | Access through their existing controls | Open from “Comment on block” or the block badge; no history in the panel UI |
| Metadata | Existing metadata surface | — | Access through its existing control | Unchanged in this pass |
| Theme | Existing theme selector | — | Change theme using the existing selector | Unchanged in this pass; palettes preserved |

## 3. UX findings

- Relevant agent actions were hidden behind long interaction sequences.
- Some access buttons were 22 px.
- Narrative audience (who the text addresses) and reviewer (who critiques it) were conflated.
- A persistent roster occupied space in the panel's empty state; reviewer choice belongs at the point a review is started.
- Motion was nearly nonexistent, and menus and bubbles appeared abruptly.

## 4. Applied corrections

- On-demand selection is implemented in `src/components/agent/ReviewerPicker.tsx` and `src/components/render/ReviewerPopover.tsx`; the picker shows only the seven reviewers. Audience is selected separately in the panel's `audience-chip` (C4).
- `TARGET_AUDIENCES`: `general` (General reader), `tecnico` (Technical profile), `decisor` (Executive decision-maker), `academico` (Academic reader), and `cliente` (Client). The legacy id `ejecutivo` resolves to `decisor`. Reviewers: Director, Executive, Peer (colleague in the field), PM (product manager), Skeptical client, Technical reader, and Desk editor.
- `Review`, `Review selection`, and the panel button open the picker. Choosing a reviewer critiques the block and displays the result in `ReviewBubble` (`data-testid="review-bubble"`) with “What works”, “What doesn’t work”, “Suggestions”, and the “Create a variant that fixes these points” CTA.
- Escape closes only the picker and restores focus to its trigger; clicking outside closes it; Tab is trapped in the dialog. `prefers-reduced-motion` disables animations.
- History is not shown in the panel. `BlockCommentThread` is contextual per block; ⌘↵/Ctrl+↵ saves, Esc closes, and resolved threads are collapsed.

## 5. Avatar specification

- The seven definitive 256×256 PNGs (Nano Banana) are in `src/assets/avatars/`; the four legacy PNGs were removed.
- Large rendering is 96×96 through `--avatar-xl`.
- The seven definitive PNGs render at 96×96 through `--avatar-xl`, alongside the reviewer's name and role; the style is “adorable pastel 3D mascot”.
- Portraits appear in the floating picker, not in a panel roster.
- Tokens and visual conventions are documented in the [design system](design-system.md).

## 6. Motion contract

Token names and values are defined in `src/styles/tokens.css`; see also the [design system](design-system.md). This pass adds `--motion-enter` (220 ms), `--motion-exit` (140 ms), `--stagger-step` (34 ms), `--ease-out-soft`, `--ease-spring-soft`, and the `--shadow-float`, `--shadow-avatar`, and `--shadow-overlay` shadow tokens for floating surfaces, as well as `--avatar-xl` and `--radius-xl`.

- Entrances: bubbles, menus, dialogs, messages, and proposals; reviewer items enter the picker with a stagger.
- Hover and press: spring response on buttons, icon-buttons, rows, and relevant surfaces.
- Loading/activity states: skeleton pulse, ready-state breathing, cursor, and spinner where applicable.
- `prefers-reduced-motion` disables animations and sets entrance, exit, and stagger durations to 0 ms.

## 7. Acceptance criteria X1–X6

- **X1 — Written UX analysis and corrected access:** meets. This document inventories each feature, its surface, shortcut, and number of actions; actions previously hidden behind long sequences (review with audience, choose character, ask the agent) now have a direct surface.
- **X2 — Every primary feature accessible in ≤2 actions from the document:** meets. Each of the three review entry points opens the picker in one action; choosing a reviewer starts the review. No panel-opening or panel configuration is required.
- **X3 — Reviewer avatars at 96×96 with legible portraits:** meets. Seven definitive 256×256 PNGs render through `--avatar-xl` in the picker, with visible names and roles.
- **X4 — Real, perceptible motion:** meets. The picker has a staggered entrance and surfaces use motion; `prefers-reduced-motion` disables animations. Dialog accessibility includes Escape, outside-click dismissal, and a focus trap.
- **X5 — Organic/emergent feel:** meets. Large portraits, staggered entrance, a floating surface, and pastel 3D mascot styling make reviewer choice contextual without permanently occupying panel space.
- **X6 — No regressions:** gates reported for this update are typecheck OK, lint with 0 errors, 454 unit tests, and E2E 24/24 (`--trace off` because of an environment trace flake).

## 8. Verification performed

- Gates reported for this update: typecheck — OK; lint — 0 errors; unit tests — 454; E2E — 24/24 with `--trace off` (environment trace flake).

## 9. Deviations and notes

- `tests/e2e/s4-inline-bubble.spec.ts` updated the obsolete `menu-personas` assertion to `menu-review`, matching the current review access.
- `tests/e2e/loop-b5a.spec.ts` no longer depends on a race against the transient placeholder and instead verifies the stable generated-block result.
- Composer focus is retried when the textarea becomes enabled, avoiding lost focus before it can receive focus.
- Placeholder copy was aligned with “Ask for a change to the selection”.
- The persistent-roster/panel-audience design is explicitly superseded by floating reviewer selection and a separate tone audience.

## 10. Pending / next steps

1. Review picker contrast and legibility in dark theme.
2. Consider a keyboard shortcut to start a review.
3. Keep specs synchronized if copy or roles change.
4. Evaluate picker behavior on small screens.

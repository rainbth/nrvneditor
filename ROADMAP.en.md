# Roadmap — nrvn

[English](ROADMAP.en.md) | [Español](ROADMAP.md)

**Status:** v1.0.6. Render operations, "variant from review", comments/critiques and language copies are available; free-form variants V-01…V-07 and the remaining pending items stay out of scope.
**Date:** 2026-11-04 · **Author:** rainbrth · **License:** MIT (open source)

This document is the prioritized view of the product. Scope and requirements live in
[`BRD.en.md`](BRD.en.md) ([Español](BRD.md)); the writing-and-review vision lives in
[`docs/editor-agentico.en.md`](docs/editor-agentico.en.md) ([Español](docs/editor-agentico.md));
the design system lives in [`docs/design-system.md`](docs/design-system.md)
([Español](docs/design-system.es.md)). Scope is not redefined here: it is ordered and measured.

## How to use this document

1. Each row is an actionable item with a stable ID (`P0-03`). IDs are never renumbered.
2. Section order is priority order: P0 first. Within a section, work top to bottom unless a
   dependency says otherwise.
3. `Status` changes only when the row's acceptance signal is met and recorded.
4. A new item enters with an explicit priority and an owner. If it has no measurable signal, it
   does not enter.
5. Decisions that block several rows are resolved in **Deferred decisions**, not in ad-hoc
   conversations.

**Priority legend**

| Priority | Meaning | Entry criterion |
| --- | --- | --- |
| **P0 — Core** | Without this there is no product. | The select → ask → accept flow breaks without the piece. |
| **P1 — Essential** | Product usable every day. | Its absence forces the user to leave the app or repeat work. |
| **P2 — High value** | Multiplies the core's value. | Turns repeated corrections into reusable assets. |
| **P3 — Growth** | Expands usage surfaces. | Increases adoption without changing the product model. |
| **P4 — Platform** | Distribution and extensibility. | Requires release or third-party infrastructure. |
| **P5 — Nice to have** | Optional, no date promised. | Does not condition the value proposition. |

**Status legend**

| Status | Meaning |
| --- | --- |
| `done` | Verified with its acceptance signal met in the current state. |
| `partial` | Partly implemented; specific gaps are documented in the row. |
| `in progress` | Active work in block B4; not announced as available. |
| `next` | Next in the queue, no work started. |
| `later` | Approved in scope, no date assigned. |
| `explore` | Idea validated with the user, no product decision yet. |

---

## P0 — Core

Without these pieces the product does not exist: a local editor that opens Markdown, lets the
user select a unit of work, and accepts or rejects proposals from an agent that can touch nothing.

| ID | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- |
| P0-01 | Markdown editor with white sheet and GFM render | Read and edit with editorial typography, without a permanent code view | — | `done` | Fixture with headings, lists, tables, task lists, code and quotes renders without errors; Render ↔ Markdown toggle keeps the approximate position. |
| P0-02 | Markdown workspace opening | Work on the user's real folder, with no file imports | — | `done` | Native dialog opens a folder; the tree shows only `.md`/`.mdx`, includes subfolders and excludes `node_modules`, `.git` and `dist`. |
| P0-03 | Disk persistence with autosave and atomic writes | Never lose content to a failed save | P0-01, P0-02 | `done` | Autosave at 800 ms; killing the process during the write leaves the original file intact. |
| P0-04 | Block and section selection | Target exactly what the user wants to change | P0-01 | `done` | Clicking a paragraph selects one block; clicking a heading selects the section up to the next heading of level ≤; Esc clears. |
| P0-05 | Multiline selection expanded to whole blocks | A drag or Shift never produces a partial selection | P0-04 | `done` | Selecting three contiguous paragraphs returns exactly three whole block keys, no fragments; covered by an e2e test. |
| P0-06 | White sheet, Lato typography and pastel selection palette | v3 visual target applied to the real document | P0-01 | `done` | Document and panels use v3 tokens and Lato; the selection band uses `selection-bg`/`selection-bar`; no v2 or warm-palette leftovers. |
| P0-07 | Reopenable side panels | Reclaim reading space without losing the tree or the agent | P0-01 | `in progress` | Each side panel collapses and reopens via button and shortcut; state persists across restarts. |
| P0-08 | Embedded OpenCode connector | The agent runs inside the app, with no terminal or external service | P0-01 | `done` | The app starts the host, lists the real models from the user's configuration, and shows a retryable error if detection fails. |
| P0-09 | Connector to a local OpenCode service | Reuse an already running OpenCode instance | P0-08 | `in progress` | The app detects a local service, connects and lists its models; if absent, it falls back to the embedded host without blocking the editor. |
| P0-10 | Connector to an OpenAI-compatible API | Use alternative providers without depending on the OpenCode SDK | P0-08, P0-14 | `explore` | A compatible endpoint configured in settings produces streaming and valid proposals under the same marker contract. |
| P0-11 | `nrvn-editor` agent with no tools | The agent proposes text and cannot execute anything | P0-08 | `in progress` | Negative test: asked to list files, it answers that it cannot; the host log records no tool call. |
| P0-12 | Streaming with cancellation | See the answer while it is generated and stop it | P0-11 | `done` | Tokens paint with per-frame coalescing; Cancel leaves the partial message marked as cancelled and the document intact. |
| P0-13 | Proposals with diff and Accept / Reject / Ask for changes | Full control over the agent's output | P0-12 | `in progress` | Each proposal shows before/after per block; Accept applies only that replacement; Reject leaves disk untouched; an out-of-contract response falls into an error state with no apply actions. |
| P0-14 | Context limited to the selection | The agent neither sees nor touches what the user did not select | P0-04, P0-11 | `done` | The prompt contains file, heading path, selected blocks and instruction; a key outside the selection invalidates the whole proposal. |
| P0-15 | Per-block versioning | Go back without losing history | P0-13 | `next` | Three accepted proposals create three navigable versions; restoring creates a fourth; history survives restarts. |
| P0-16 | Local metadata persistence | Threads, comments and annotations survive with a portable sidecar and local cache | P0-15 | `done` | Portable sidecar `<doc>.md.nrvn` next to the `.md` plus working state in `Application Support/nrvn/`; metadata never modifies the `.md`. |
| P0-17 | Mock mode with no credits | Develop and test the full flow with no network | P0-13 | `done` | `npm run mock` reproduces selection, streaming, proposal and acceptance with no credentials; Playwright runs on that build. |
| P0-18 | Agent failure recovery | The app remains a usable editor if the host fails | P0-08 | `next` | A downed host shows an actionable error with retry; open, edit and save keep working. |

---

## P1 — Essential

What turns the core into a daily writing tool: review, preserve voice, focus, and work in two
languages.

| ID | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- |
| P1-01 | Comments anchored to blocks | Review per element with threads and resolution, without editing the text | P0-16 | `done` | A created, replied, resolved and deleted comment persists after restart; if the block hash changes, it is marked "block edited". |
| P1-02 | Voice and tone profile per workspace/document | Persistent style kept separate from content | P0-14 | `next` | The prompt shows the profile in a style section distinct from content; disabling it for one request does not delete it. |
| P1-03 | Focus sessions per area | Iterate on a block or section with grouped history | P1-02 | `next` | A named focus on a section groups its history; switching documents pauses it; closing it deletes neither content nor history. |
| P1-04 | Conversation history per document | Resume work where it was left | P0-16 | `done` | Opening document A shows its thread; B's does not appear; the thread persists after restarting the app. |
| P1-05 | Render font selector | Adjust reading without touching the design system | P0-06 | `done` | The selector changes only prose typography, persists per workspace, and alters neither the Markdown nor the UI tokens. |
| P1-06 | Line numbers in Markdown mode | Locate references and errors precisely | P0-01 | `done` | Markdown mode shows aligned numbering; render does not; the number matches the real file line. |
| P1-07 | Keyboard shortcuts for the document | Operate file and view actions without a mouse | P0-02, P0-03 | `done` | Cmd+O, Cmd+E, Cmd+S and Esc work in the defined priority order (overlay → selection → generation). |
| P1-08 | Document outline | Navigate long sections without scrolling | P0-04 | `done` | The outline lists every heading with its level and jumps to the section on click. |
| P1-09 | AA accessibility | Full keyboard and screen-reader use | P0-06, P1-07 | `next` | axe-core reports no critical violations in tree, document and panel; full keyboard path; visible focus in light and dark. |
| P1-10 | UI and native menu i18n ES/EN | Product in the user's language | P1-09 | `later` | Zero hardcoded strings; dates and numbers via `Intl`; changing language does not alter the document. |
| P1-11 | Persisted language selector | Stable preference with no restart | P1-10 | `later` | The choice is stored in `settings.json`, applied live, and rebuilds the native menu. |
| P1-12 | Cmd+Enter send | Send to the agent without leaving the keyboard | P0-13 | `done` | Cmd+Enter sends with valid context (selection or explicit document); without context the composer explains why and nothing is sent. |

---

## P2 — High value

Turns repeated corrections into workspace assets and gives history depth.

| ID | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- |
| P2-01 | Guidelines inbox | Capture a style instruction at the moment it appears | P1-02 | `later` | Capture, edit, discard and reorder persist after restart; duplicates are suggested; nothing applies itself. |
| P2-02 | Consolidation into a rules block | Turn scattered guidelines into reusable rules | P2-01 | `later` | At the threshold, "Consolidate" shows a rules-block diff; accepting it versions the block and marks the included guidelines. |
| P2-03 | Consistency refactor of unedited blocks | Apply rules to the document without overwriting manual work | P2-02, P0-15 | `later` | A document with 5 blocks and 1 manually edited generates 4 proposals and 1 omission; accepting 2 changes only those 2 on disk. |
| P2-04 | Document versioning | Global history and a return point per document | P0-15 | `later` | Each relevant save creates a document entry; restoring creates a new version and deletes no previous ones. |
| P2-05 | Compare versions | See what changed between two points | P2-04 | `later` | Side-by-side or unified diff between two block or document versions, with no disk write. |
| P2-06 | Global workspace search | Find text across all documents | P0-02 | `later` | Search returns file, block and match; opening a result selects the matching block. |
| P2-07 | Document templates | Start from a structure and voice already defined | P2-02 | `later` | Creating from a template applies structure and voice profile; the template does not pollute the `.md` with metadata. |
| P2-08 | Command palette | Run any action without memorizing shortcuts | P1-07 | `later` | Every menu action is invocable by name; the list filters by text and respects the active language. |

---

## P3 — Growth

Expands outputs and work surfaces without changing the product model.

| ID | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- |
| P3-01 | PDF / HTML / MDX export | Publish or share the document | P0-01 | `later` | Export produces a readable file with the same rendered content; the original `.md` is unchanged. |
| P3-02 | Git integration (diff and commit) | Review and record changes in the user's repo | P2-04 | `later` | Working diff visible per document; commit only with explicit confirmation and without touching unrelated files. |
| P3-03 | Tabs and multiple windows | Work on several documents at once | P1-04 | `later` | Opening a second document preserves the first's selection and thread; each window keeps its own state. |
| P3-04 | Paste images | Insert screenshots without leaving the editor | P0-03 | `later` | Pasting an image creates the file in the chosen folder and inserts the Markdown link; undo reverts both. |
| P3-05 | Editable tables | Edit tables without fighting the Markdown | P0-01 | `later` | Adding a row or column updates the block and creates a version; render and Markdown stay in sync. |
| P3-06 | Internal links between documents | Connect workspace notes | P2-06 | `later` | A link to another `.md` opens the document and selects the target heading; broken links are flagged. |
| P3-07 | Document statistics | See writing volume and progress | P0-01 | `later` | Panel with words, blocks and session time, computed locally with no data sent. |

---

## P4 — Platform

Distribution, trust and extensibility. They require infrastructure that does not exist today.

| ID | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- |
| P4-01 | Packaged Windows / Linux | Broaden the user base | P0-18 | `explore` | An installable build on each platform opens, edits and saves against the same AC checklist as macOS. |
| P4-02 | Apple signing and notarization | Frictionless Gatekeeper install | P4-01 | `explore` | A notarized `.dmg` opens with no manual prompt on a clean machine. |
| P4-03 | Auto-update | Ship fixes without reinstalling | P4-02 | `explore` | A published version is detected, downloaded and applied with user confirmation. |
| P4-04 | Remote mode / managed compatible API | Use nrvn with a corporate or hosted endpoint | P0-10 | `explore` | Endpoint, credential and model configuration works with no change to the proposal contract. |
| P4-05 | Plugin API | Allow extensions without touching the core | P2-08 | `explore` | A sample plugin adds a palette command and can be uninstalled leaving no state behind. |
| P4-06 | Themes | Adapt the interface to the user's taste | P0-06 | `explore` | An alternative theme swaps tokens without breaking AA contrast or document render. |
| P4-07 | Backup and restore | Recover workspace and metadata | P0-16 | `explore` | Exporting and importing a workspace restores tree, versions and threads without duplicating files. |

---

## P5 — Nice to have

Optional. No date, no promise. Does not condition the value proposition.

| ID | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- |
| P5-01 | Optional sync | Continue on another machine | P4-07 | `explore` | Opt-in, encrypted, disableable sync; without sync the product works the same. |
| P5-02 | Real-time collaboration | Review a document among several people | P5-01 | `explore` | Two clients see changes and comments with no destructive conflict. |
| P5-03 | Mobile reading app | Read and comment away from the desktop | P5-01 | `explore` | The mobile app opens the synced workspace read-only with comments. |
| P5-04 | Voice dictation | Write without a keyboard | P0-03 | `explore` | Dictation inserts text into the active block and can be undone in parts. |
| P5-05 | Theme marketplace | Discover and share themes | P4-06 | `explore` | Installing a theme from the marketplace applies it and allows uninstalling. |
| P5-06 | Image generation (external flow) | Illustrate a document without turning the editor into a generator | P3-04 | `explore` | The image is generated in a separate flow and inserted as a link; inline generation is out of scope. |
| P5-07 | CMS publishing | Publish the document where the content lives | P3-01 | `explore` | Publishing a document creates or updates an entry and returns its URL; the local `.md` is unchanged. |

---

## Editor Agentico — writing and reviewing with agents

This block orders the vision described in [`docs/editor-agentico.en.md`](docs/editor-agentico.en.md)
([Español](docs/editor-agentico.md)): use AI to write and review without losing authorship, the
memory of decisions and document coherence. It does not replace P0–P5: it complements them. `EA-*`
IDs are new and never renumbered; priorities use the same P0–P5 scale.

**Definition of done for the block:** each delta fits in one iteration, is reviewed as a proposal
with a diff, preserves human decisions and has a verifiable acceptance signal. No item in this
block applies changes on its own or simulates human authorship.

### P1 — Authorship and control

| ID | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- |
| EA-P1-01 | Area memory — capture | Store per block/section the human decisions, instructions and the "why it is like this" | P1-02, P0-16 | `later` | Two decisions with their reason are recorded in a section; both persist after restart and are listed in the area panel. |
| EA-P1-02 | Area memory — use in prompt and panel | The agent for that area receives and respects its memory | EA-P1-01, P0-14 | `later` | The prompt snapshot for that section includes the area's decisions and not other sections'; disabling them for one request does not delete them. |
| EA-P1-03 | Human edit lock | A global pass never overwrites a block marked "do not touch" or "suggestions only" | P2-03, P0-15 | `later` | A document with 5 blocks, 2 marked "do not touch": the refactor produces 3 proposals and 2 omissions; accepting all changes does not modify the 2 locked blocks. |
| EA-P1-04 | Per-block suggestions and questions | Explore variations, improvements, risks and questions without rewriting | P0-14, P1-02 | `later` | A block shows at least 3 typed suggestions (variation, improvement, question); none changes the text until the user chooses one. |
| EA-P1-05 | Global coherence | Check how the section fits the document and propose deltas | P1-02, P0-15 | `later` | In a document with one contradiction and one unfulfilled promise, the analysis flags both with their section and proposes one delta per finding, not a rewrite. |
| EA-P1-06 | Focus closure criterion | Close an area with history and an explicit "done" | P1-03 | `later` | A focus is closed with a written criterion; its history is grouped, and reopening recovers the criterion and the area decisions. |

### P2 — Context, sources and provenance

| ID | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- |
| EA-P2-01 | Related conceptual context | Suggest related sections while editing, explaining the relationship | P0-15 | `later` | While editing a section, the panel suggests at least 2 related sections with a relationship sentence; the index is computed locally and can be disabled. |
| EA-P2-02 | Multi-source draft — ingestion and outline | Turn 2–5 sources into a reviewable outline before generating | P0-02, P0-16 | `later` | Three sources (MD, URL, text) are imported, an editable outline is extracted, and each entry keeps its source. |
| EA-P2-03 | Multi-source draft — draft with citations and provenance | Generate a block draft with explicit origin | EA-P2-02, EA-P2-05 | `later` | Each generated block shows its citation or source; accepting the draft marks blocks as generated and preserves traceability. |
| EA-P2-04 | Rules and guidelines per area | Apply consolidated rules to an area without overwriting manual work | P2-01, P2-02, P2-03, EA-P1-01 | `later` | A consolidated rule applies only to eligible blocks in the area; blocks with human memory or marked "do not touch" are excluded and the count is reported. |
| EA-P2-05 | Provenance and honesty | Mark generated, rewritten and accepted content, with AI authorship metadata | P0-15, P0-16 | `later` | Each block stores its origin (`human`, `agent`, `accepted`) and the panel shows it; deleting metadata neither alters the `.md` nor simulates human authorship. |
| EA-P2-06 | Export with provenance | Export without losing who wrote what | P3-01, EA-P2-05 | `later` | The export includes per-block provenance or an equivalent annex; the original `.md` is unchanged. |

### P3 — Risk and traceability

| ID | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- |
| EA-P3-01 | Risk review | Detect claims without a source, invented data, commitments and contradictions | EA-P1-05, EA-P2-05 | `explore` | On a fixture with an unsourced figure, a promise and a contradiction, the report finds all 3 cases and does not rewrite the document. |
| EA-P3-02 | Claim → source or decision traceability | Trace every claim to its origin | EA-P2-03, EA-P2-05 | `explore` | Selecting a claim shows its source or the associated human decision; if none exists, it is marked "unsupported". |

### Out of scope for this block

- **Automatic document rewrite.** Every change arrives as a proposal with a diff.
- **Simulating human authorship.** AI provenance is preserved and exportable.
- **Guaranteeing quality or removing bias.** The product reduces friction and makes decisions
  visible; it does not promise a correct result.
- **General-purpose chat.** The agent keeps working on the document and its context, not as an open
  assistant.

---


---

## B5 — Render operations

Goal: make Render the agent's working surface, not just a reading view. Every action respects the
block model, can be undone and never applies a proposal without confirmation.

| ID | Priority | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | P0 | Formatting bar in Render | Format without leaving the reading view | P0-04 | `done` | With a block selected, Paragraph/H1–H3, bold, italic, inline code, link, lists, quote, code block and divider change the Markdown and re-render; undo/redo works. |
| R-02 | P0 | Insert content | Create structure without editing Markdown by hand | R-01 | `partial` | Insert menu (paragraph, section, agent block, image, divider, table), hover `+` and `Enter` at the end insert at the right offset. |
| R-03 | P1 | Pending new paragraph | Leave a slot ready to describe to the agent | R-02, R-05 | `done` | The empty block shows a dashed border and “Pending edit” badge; it is selected, the composer is focused and the chip reads “Editing new paragraph”; typing or applying clears it. |
| R-04 | P1 | Image next to the document | Portable images without breaking Markdown | P0-03 | `next` | The dialog copies sanitized PNG/JPG/WebP/GIF/SVG to the document directory with a unique name, never overwrites, enforces a size limit; inserts `![alt](file)` and renders through `nrvn-asset://`. |
| R-05 | P0 | Anchored proposal bubble | Review the change where it happens | P0-14 | `done` | The bubble appears above or below the paragraph, shows preview/diff, streaming with Stop and Apply/Reject/Ask for changes; after applying it shows “Applied · Undo”. |
| R-06 | P1 | Margin notice rail | See document state without covering text | R-05, V-04, C-01, ML-04 | `next` | The 56 px rail shows proposal, pending paragraph, comment, critique and stale translation; clicking expands a card; it collapses to icons on narrow screens. |
| R-07 | P1 | Block actions on hover | Discover operations without hidden menus | R-01 | `partial` | Hover shows insert below, comment, versions, ask the agent and critique; keyboard/focus accessible; it does not steal selection. |
| R-08 | P1 | Compact context | Reduce panel noise | P0-14 | `done` | The chip shows only “Editing paragraph: “20 chars…””, “Editing section: “Principles””, “Editing N blocks…” or “Editing full document”; no path, type, count or long excerpt. |
| R-09 | P1 | Undo/redo in Render | Revert any page operation | R-01, R-02, R-05 | `done` | Formatting, inserting, applying and deleting undo with Cmd+Z and redo with Cmd+Shift+Z; selection is preserved. |
| R-10 | P0 | Block and image integrity | Operations never corrupt offsets or read outside the workspace | P0-04 | `partial` | Every change re-splits and re-hashes; images outside the workspace or with invalid magic bytes are rejected with an actionable error. |
| R-11 | P0 | Inline editing in Render | Write where you read, without switching views | R-01 | `done` | Clicking a paragraph/heading places the caret in the render; Enter splits the block, Backspace at the start merges it, Shift+Enter inserts a soft break; Esc exits without saving and Cmd+Enter confirms; the change creates a version and marks human editing. |
| R-12 | P0 | Serialization and fallback | Markdown as source of truth, without breaking syntax | R-11 | `done` | The edited block serializes to Markdown and re-renders; tables, code, HTML and frontmatter show “Edit in Markdown”; untouched syntax is not normalized. |
| R-13 | P1 | Formatting during inline editing | Apply marks without leaving the caret | R-01, R-11 | `done` | Cmd+B/I/K and the toolbar apply marks to the selection; the result appears on confirm; undo/redo preserves selection. |
| R-14 | P1 | Coexistence with agent and annotations | Edit without a proposal overwriting the caret | R-05, R-11 | `done` | While the caret is active the bubble waits; on exit it re-anchors, keys/hashes update and annotations become “block edited”. |
| R-15 | P1 | Page zoom and fit to screen | Adjust reading without changing system zoom | R-11 | `next` | Cmd+= / Cmd+- / Cmd+0 zoom only the page (50–200%), “Fit to width” fills the canvas with margins and preserves position; bubbles and gutter recalculate without jumps. |
| R-16 | P1 | View settings | Adapt the sheet for reading, writing or reviewing | R-15 | `next` | Page width (narrow/comfortable/wide), render font size, line height, reading mode, focus mode and full screen apply instantly and persist per workspace. |
| R-17 | P1 | Basic block operations | Move and reorganize without cut-and-paste Markdown | R-01 | `partial` | Move up/down, duplicate, delete, copy/cut/paste blocks work with the keyboard and create a version; never split a block or lose offsets. |
| R-18 | P1 | Find and replace in the document | Find and fix without leaving the render | P0-01 | `next` | Cmd+F opens search with highlights, next/previous and count; replace respects blocks and does not touch code or frontmatter without confirmation. |
| R-19 | P2 | Spellcheck | Avoid typos without leaving writing | R-11 | `next` | Spellcheck can be enabled from View, underlines only editable text, respects document language and can be disabled per workspace. |
| R-20 | P2 | Status bar | Know document volume and state | P0-03, P3-07 | `next` | The bar shows words, characters, blocks, reading time and save state; updates without recomputing the whole render. |
| R-21 | P0 | Selection re-anchoring after edits | Keep the edit area on the new paragraphs | R-05, R-11 | `done` | If an edit turns 1 paragraph into 3, after applying, the selection covers the 3 new blocks; the chip reads “Editing 3 blocks” and the next prompt includes all 3. If all are deleted, selection clears; undo restores the previous selection. |
| R-22 | P1 | Custom reviewers and audiences | Let each user define their own criteria | R-12 | `next` | Users can create their own reviewer and audience with a name, role and free-form description (pre-filled example). They are stored locally, appear in the picker and the audience chip, and can be edited or deleted without affecting the built-in ones. |
| R-23 | P1 | Extend and condense narrative | Lengthen or shorten a paragraph without losing voice | R-11 | `done` | Two per-block actions ask the agent for an extended (~1.6–2.2×) or condensed (~40–60%) version that preserves intent, tone, voice, meaning and formatting; the result arrives as a proposal with a diff and is never applied automatically. |
| R-24 | P2 | Page zoom | Adjust reading without changing system zoom | R-11 | `done` | Controls and shortcuts (⌘= / ⌘- / ⌘0) scale the sheet between 50% and 200% in 10% steps, persist, and recalculate bubbles, gutter and `+` without breaking layout. |

## B6 — Variants and per-block history

Goal: explore alternatives with criteria and keep every version. An applied variant is a new
version, never a silent replacement.

The only implemented variant is "variant from review" (C-05); axes V-01…V-07 remain pending.

| ID | Priority | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- | --- |
| V-01 | P0 | Variant axes | Vary one dimension without losing content | R-05 | `later` | Length, Detail, Tone, Structure, Examples, Audience and Free generate 3 labelled variants; Length preserves semantic content and Detail flags new claims. |
| V-02 | P0 | View variants after applying | Choose an alternative without starting over | V-01 | `later` | After Apply, the bubble offers View variants, 3 cards with label, rationale, preview and Apply this; Compare, Regenerate axis and Change axis work. |
| V-03 | P0 | Variant contract | Reliable parsing and scope | V-01 | `later` | The parser validates `<<<NRVN_VARIANT axis label>>>`, requires 3 distinct variants and rejects keys outside the selection. |
| V-04 | P0 | Per-block history | Return to any version and know its origin | P0-15 | `later` | ‹ › arrows in the margin, overlay with date/origin (agent/manual/restored), Restore creates a new version and everything persists after restart. |
| V-05 | P1 | Human edit lock | Protect decisions the user already made | V-04, EA-P1-03 | `later` | A block marked “do not touch” or “suggestions only” is excluded from refactors and updates; omissions are reported. |
| V-06 | P1 | Document and translation variants | Explore global or language alternatives | V-01, ML-05 | `later` | Full document and translations offer literal/natural/formal with preview and versioned apply. |
| V-07 | P2 | Persistent variants and comparison | Recover and compare earlier proposals | V-02, V-04 | `later` | Variants stay in the thread and compare side by side; applying one keeps the rest in history. |

## B7 — Comments and critiques

Goal: review without rewriting. Comments and critiques are annotations; they only become changes
when the user sends them to the agent.

| ID | Priority | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- | --- |
| C-01 | P0 | Block-anchored comments | Review by element with threads and resolution | P0-15 | `done` | Badge, thread, resolve/reopen, delete and “block edited” when the hash changes; persists across restarts. |
| C-02 | P1 | Per-block critiques | Find narrative issues without proposing text | R-07 | `done` | Critique opens an anchored bubble with dimension, severity, detail and actionable question; lavender badge with count; at most 5 critiques. |
| C-03 | P1 | Critique contract | Structured output, no invention | C-02 | `done` | `<<<NRVN_CRITIQUE ...>>>` validates dimension/severity; unsupported claims are flagged; the document is never modified. |
| C-04 | P1 | Re-request and staleness | Repeat the analysis when the block changes | C-02 | `later` | Re-request regenerates and keeps the previous batch; if the hash changes, the critique becomes “stale”. |
| C-05 | P0 | Critique → instruction | Turn a critique into a controlled edit | C-02, P0-14 | `done` | Choosing a critique fills the composer with an editable instruction; text does not change until Apply. |
| C-06 | P2 | Critic mode in the panel | Separate editing and reviewing | C-02 | `later` | The panel toggles Edit/Critique, keeps separate histories and filters by severity. |

## B8 — Multilanguage

Goal: keep the canonical original and produce editable copies per language. Translating is not
rewriting: no new ideas and the original is never modified.

| ID | Priority | Feature | Outcome / value | Depends on | Status | Acceptance signal |
| --- | --- | --- | --- | --- | --- | --- |
| ML-01 | P0 | Language set | Portable original + sibling copies | P0-02, P0-16 | `done` | `document.md` + `document.en.md` + app-data manifest with sourceHash; `.md` files carry no foreign frontmatter. |
| ML-02 | P1 | Mode and flip | Switch language without losing the reading point | ML-01 | `done` | ES · EN · + pills, `Cmd+[`/`Cmd+]`, tree grouped with badges and block anchor preserved. |
| ML-03 | P1 | Automatic first copy | Create a new language in one click | ML-01 | `done` | Adding a language generates and saves a new file without overwriting; cancellable, undoable and deletable; existing updates require confirmation. |
| ML-04 | P1 | Per-block sync | Update only what changed and respect human edits | ML-03, V-05 | `done` | Per-block sourceHash, “Update translation” translates only changed blocks; human-edited blocks stay locked and are not overwritten. |
| ML-05 | P0 | Translation contract | Faithful translation with scope and glossary | ML-03 | `later` | `<<<NRVN_TRANSLATION lang block>>>` and `<<<NRVN_DOCUMENT_TRANSLATION lang>>>`; preserves tone, glossary and structure; doubtful terms are flagged. |
| ML-06 | P2 | Translation variants | Adjust literalness without redoing everything | V-06, ML-05 | `later` | Literal/natural/formal generate 3 variants per block and apply as a version; the rail warns about stale translations. |
| ML-07 | P0 | Original safety | Translating never damages the source | ML-01 | `done` | No translation operation modifies the original or overwrites an existing translation without confirmation. |

## Deferred decisions

| ID | Decision | Owner | Criterion to close it | Impact if left open |
| --- | --- | --- | --- | --- |
| D-1 | Scope and timing of UI i18n | Product + Design | Closes when P1-09 is green and an `es`/`en` catalog exists with no hardcoded strings. | P1-10 and P1-11 stay blocked; the product remains Spanish-only. |
| D-2 | Voice profile format | Product + Design | Choose between a form with preview, editable Markdown or JSON when validating P1-02. | The voice UI and its persistence cannot be designed. |
| D-3 | Guidelines threshold to consolidate | Product | Set with usage data from P2-01; initial proposal: 8 `new`, with manual consolidation always available. | P2-02 has no clear trigger. |
| D-4 | Operational definition of "not manually edited" | Product + Engineering | Closes when implementing P2-03; proposal: hash equal to the last agent or restored version. | The consistency refactor is not verifiable. |
| D-5 | Model used to summarize rules | Engineering | Chosen when implementing P2-02, measuring diff cost and quality. | Consolidation may be expensive or imprecise. |
| D-6 | Apple signing | Product + Release | Closes when planning P4-02, with a developer account and notarization process defined. | No frictionless install and no auto-update. |
| D-7 | Area memory scope and format | Product + Engineering | Closes when implementing EA-P1-01: decide whether it lives per block, per section or both, and whether it is free text or fields. | EA-P1-02 and EA-P2-04 have no stable contract. |
| D-8 | Conceptual context method | Engineering | Chosen when implementing EA-P2-01 between local embeddings and lexical similarity, measuring cost, privacy and quality. | The acceptance signal is not comparable across methods. |
| D-9 | Citation and provenance format in export | Product + Design | Closes with EA-P2-06: decide between per-block notes, a sources annex or both. | Export may lose traceability. |
| D-10 | Operational "focus closed" criterion | Product | Defined when implementing EA-P1-06; proposal: user-written criterion + last recorded decision. | EA-P1-06 is not verifiable. |
| D-11 | Default variant axes | Product | Set when implementing V-01; initial proposal: Length and Detail first, then Tone, Structure, Examples and Audience. | The variant bubble has no stable order or copy. |
| D-12 | Critique format and persistence | Product + Engineering | Closes when implementing C-02/C-03: structured items vs prose, and whether all batches or only the current one are kept. | The rail and history have no contract. |
| D-13 | Human edit lock criterion | Product + Engineering | Closes when implementing V-05: explicit mark, manual hash or both. | Refactors and translations do not know which blocks to protect. |
| D-14 | Language manifest location and format | Engineering | Closes when implementing ML-01: app data vs sidecar; path, version and migration. | Translations cannot be reliably paired. |
| D-15 | How to measure a "new claim" | Product + Engineering | Defined when implementing V-01/ML-05: semantic diff, agent flag or human review. | Detail variants and translations cannot be validated. |
| D-16 | Fallback for complex blocks in inline editing | Product + Engineering | Closes when implementing R-12: which blocks edit inline (paragraph, heading, list item) and which open Markdown (table, code, HTML, frontmatter). | Inline editing could break unrepresentable syntax. |
| D-17 | Commit moment and undo in inline editing | Product + Engineering | Closes when implementing R-11/R-13: blur, Esc, Cmd+Enter, and native undo vs app stack. | Caret and history can desynchronize. |
| D-18 | Page zoom semantics | Product + Engineering | Closes when implementing R-15: CSS page zoom vs app zoom; impact on caret, bubbles and gutter. | Zoom can break hit-testing or misalign overlays. |
| D-19 | Find-and-replace scope | Product | Closes when implementing R-18: visible text only, whole blocks, regex and global replace. | Replace could touch code/frontmatter or leave inconsistent blocks. |
| D-20 | Selection re-anchoring policy | Product + Engineering | Closes when implementing R-21: grow on insert, collapse on delete, preserve on replace and restore with undo. | The edit area can go stale and the next prompt can target the wrong blocks. |

## We will not build

Outside the vision. They do not enter the roadmap even if a user asks for them.

- **A full word processor.** nrvn iterates Markdown blocks; it does not compete with Word or Docs.
- **A general-purpose chat.** The agent works on the document and the context the user chooses,
  not as an open assistant.
- **Image generation inside the editor.** An external flow is allowed (P5-06); never an inline
  generator that writes into the document.
- **Inline WYSIWYG.** The block model plus CodeMirror covers the need with less risk.

## Suggested milestones

### v0.2 — Agent layer and voice

- Embedded OpenCode connector, `nrvn-editor` agent with no tools, and streaming with cancellation.
- Proposals with diff, Accept / Reject / Ask for changes, and per-block versioning.
- Anchored comments and a basic voice profile.
- v3 finish: white sheet, Lato, line numbers, font selector and reopenable side panels.
- Exit: P0 complete and P1-01…P1-08 green.

### v0.3 — Render and variants

- Implemented: R-01, R-02 (partial), R-03, R-05, R-07 (partial), R-08, R-09, R-10 (partial), R-11, R-12, R-13, R-14, R-17 (partial), and R-21.
- Pending: R-04, R-06, R-15, R-16, R-18, R-19, R-20; V-01…V-07 pending, only "variant from review" exists.

### v0.4 — Review and multilanguage

- Implemented: C-01, C-02, C-03, C-05 and ML-01…ML-04 + ML-07.
- Pending: C-04, C-06, ML-05, ML-06.

### v0.5 — Consistency and Editor Agentico

- Guidelines inbox and consolidation into a rules block with diff.
- Consistency refactor of unedited blocks, always as proposals.
- Document versioning, ES/EN i18n and version comparison.
- Area memory, global coherence, conceptual context and multi-source draft with citations.
- Per-block provenance and export that preserves it.
- Exit: P2-01…P2-04 and EA-P1-01…EA-P1-06, EA-P2-01…EA-P2-06 green.

### v1.0.6 — 2026-11-04

- Closed for this release: Render/Markdown editor, selection, OpenCode and proposals, Render operations, variant from review, annotations/critiques and language copies.
- Pending and out of scope for this release: free-form variants V-01…V-07, Apple signing/notarization, Windows/Linux, auto-update, complete UI i18n, formal AA audit and sync.

### v1.1 — Platform (later)

- PDF/HTML/MDX export and scoped git integration.
- Packaged Windows/Linux, Apple signing and notarization.
- Auto-update and backup/restore.
- Audited accessibility and reviewed copy in both languages.
- Exit: the full BRD AC checklist green on macOS arm64.

# BRD — nrvn

[English](BRD.en.md) | [Español](BRD.md)

**Living feature consolidation document**
Product: `nrvn` — local Markdown editor with agents
Document version: v1.0.6 · Date: 2026-11-04 · Author: rainbrth
Product license: MIT (open source)

> This BRD is the source of truth for scope. Any feature not listed here is not approved.
> Changes are recorded in section 15 (Changelog).
> Architecture decisions marked **DECIDED** are not reopened in v1; if a decision turns out to
> be unfeasible, the deviation and its impact are documented before changing code.
> The writing-and-review vision is developed in
> [`docs/editor-agentico.en.md`](docs/editor-agentico.en.md) ([Español](docs/editor-agentico.md));
> priorities and status live in [`ROADMAP.en.md`](ROADMAP.en.md) ([Español](ROADMAP.md)).

---

## 1. Summary and purpose

`nrvn` is a desktop application for macOS (arm64 in v1) that lets users edit Markdown documents
with the help of an AI agent, without leaving the local file system and without letting the
agent touch anything on its own.

The user opens a folder, browses only its Markdown files, reads the document with editorial
typography or switches to editable Markdown, selects a block or a section, and asks the agent
for a rewrite. The agent **proposes**; the user sees a diff and decides: Accept, Reject or Ask
for changes. Each block keeps its version history and supports anchored comments.

Purpose of this document: consolidate in one place the problem, scope, verifiable requirements,
acceptance criteria, architecture and phased plan, so engineering, design and QA can execute
without ambiguity.

### 1.1 Vision

`nrvn` comes from a real problem for PMs and writers who draft documents with AI: today's tools
are either loose chat or editors that rewrite everything. What is missing is an editor that lets
you **iterate on a document in parts, preserving voice and context**, and turn repeated
corrections into reusable rules.

The unit of work is not the document: it is the block, section or range the user selects. Voice,
focus, guidelines and versions are all organized around that unit.

The vision is not "writing faster" but **being able to review without giving up**: an AI-assisted
document must remain readable, arguable and defensible as your own. nrvn exists to reduce the
friction of reviewing and preserve human decisions, not to produce dumps of generated content. That
direction includes area memory, human edit lock, global coherence, conceptual context, multi-source
generation and exportable provenance; none of those capabilities is considered implemented until
the roadmap records its acceptance signal.

### 1.2 Principles

| Principle | What it means in the product |
| --- | --- |
| **Isolated iteration** | The agent receives only the selection and can only touch it. The whole document only when the user explicitly selects it. |
| **Persistent voice and tone** | A per-workspace/document voice profile (register, person, length, lexicon, things to avoid, examples) used as style context, separate from content. |
| **Focus sessions** | The writer focuses on one area (e.g. "Introduction") for a while, iterates and closes it; history stays attached to that block or section. |
| **Guidelines inbox** | Every useful instruction is captured; once there are enough, they are summarized into a rules block applicable to the document. |
| **Consistency refactor** | Consolidated rules are applied to blocks not edited by hand, always as proposals with a diff. |
| **Per-block versioning** | Every change (AI or manual) creates a navigable version with provenance; restoring creates a new version. |
| **Anchored comments** | Review by element, with threads and resolution. |
| **Local-first and control** | Files on disk, metadata in Application Support, proposals the user accepts, an agent with no tools. |

**Governing principle:** the user's file is sacred. No write happens without explicit user
intent, and no write happens without a prior snapshot.

### 1.3 Real state and honesty

nrvn is a **personal tool**, published under the **MIT license** (source available) and **100% built with AI**. That warning is
explicit and part of the product definition.

As of 2026-11-04 (v1.0.6), the product includes Render/Markdown editing, selection, agent proposals,
Render operations, anchored comments, critiques, variant from review, language copies and `.nrvn` metadata.
Free variants V-01…V-07, block/document versioning, voice, focus, guidelines, consistency refactor,
complete i18n and formal AA audit are not implemented. Apple signing/notarization, Windows/Linux,
auto-update and sync are also unavailable.

AI accelerates writing, but it can also erode trust and authorship. nrvn does not promise to
remove bias or guarantee quality: it promises to reduce friction, make decisions visible and keep
human control of the narrative. The detail is in
[`docs/editor-agentico.en.md#5-honesty-and-limits`](docs/editor-agentico.en.md#5-honesty-and-limits).

---

## 2. Problem and context

### 2.1 Problem

Writing and reviewing high-quality Markdown is slow and fragmented:

1. **Tool friction.** Markdown editors that are good for reading are bad for editing, and good
   editors impose a code view that breaks reading.
2. **Invasive AI assistants.** Most AI writing tools work at whole-document or loose-chat level:
   the user copies and pastes, loses the context of *what* they are rewriting, and has no
   granular control over the result.
3. **Loss of control.** Agents that can run tools (shell, file writes, network) are an
   unacceptable risk over personal documents.
4. **Lost context.** AI conversations about a document are not attached to the document; when
   the file is reopened, you start from zero.
5. **Lost voice.** Regenerating a whole document flattens the author's register and the
   decisions already made.
6. **Orphan annotations.** Comments and reviews live elsewhere (or in the file itself as
    a portable `.md.nrvn` sidecar next to the document and a cache in Application Support).

### 2.2 Context

- The target user is a technical or product person who writes Markdown daily (notes,
  documentation, drafts) and already pays for a model provider.
- Today's ecosystem makes it possible to solve this locally: Electron for the desktop, embedded
  OpenCode to orchestrate the agent, and an SDK with programmatic model access.
- There is no collaboration or cloud requirement in v1. All state lives on the machine.

### 2.3 Product hypothesis

If the user can select exactly what they want to change and the agent only proposes, then they
will accept using AI on documents they would not let an automatic assistant touch today.

---

## 3. Users and use cases

### 3.1 Segments

| Segment | Description | Dominant need |
| --- | --- | --- |
| **P1 — Technical authors** | Write docs, RFCs and architecture notes in Markdown inside a local repo. | Rewrite sections precisely without breaking format or history. |
| **P2 — PM / writer drafting with AI** | Write briefs, PRDs, interview notes and essays in Markdown, with model assistance. | Iterate in parts while preserving their voice, without rewriting the whole document. |
| **P3 — Technical editor** | Review and polish other people's documentation: consistency, tone, terminology. | Apply style rules in a controlled way and keep a record of every change. |
| **P4 — Reviewer** | Read someone else's document and leave feedback per element. | Comment on specific blocks with threads and resolution, without editing the text. |
| **P5 — OpenCode users** | Already use OpenCode and have models configured. | An editing surface that reuses their existing configuration. |

### 3.2 Main use cases

- **UC-1 · Rewrite a paragraph.** The user clicks a paragraph, types "more concise, keep the 40%
  figure", reviews the diff and accepts.
- **UC-2 · Restructure a section.** Selects the level-2 heading, asks "turn this into a list of
  decisions with their rationale", accepts.
- **UC-3 · Review a range.** Selects three contiguous paragraphs with Shift and asks to unify
  tone.
- **UC-4 · Go back.** After accepting three proposals in a block, navigates history with `‹ ›`
  and restores the previous version.
- **UC-5 · Annotate.** Leaves a comment on a block, resolves it later; if the block changed, sees
  the "block edited" warning.
- **UC-6 · Continue later.** Closes the app, reopens it, and the document conversation is still
  there.
- **UC-7 · Fix the voice.** Defines the document's voice profile once ("first person, short
  sentences, no -ly adverbs") and reuses it in every request without repeating it.
- **UC-8 · Close a focus.** Works only on "Introduction" for a session, iterates with the agent
  and closes the area; that area's history is grouped.
- **UC-9 · Capture a rule.** After correcting "no adverbs" three times, saves the instruction in
  the inbox and, once there are enough, turns it into a rules block.
- **UC-10 · Final consistency.** Applies the rules block to blocks not edited by hand and
  reviews each proposal with a diff before accepting.

### 3.3 Non-users (v1)

Teams that need concurrent editing, Windows/Linux users, users expecting an inline WYSIWYG
editor.

---

## 4. Objectives and success metrics

### 4.1 Product objectives

- **O-1.** Asking for a block rewrite must be faster than copying to a chat and pasting back.
- **O-2.** The user must never lose content because of an agent or app action.
- **O-3.** The app must be usable without a terminal once installed.
- **O-4.** The app must be reliable offline except for the model provider call.

### 4.2 Measurable metrics (v1)

| ID | Metric | Operational definition | v1 target | How it is measured |
| --- | --- | --- | --- | --- |
| M-1 | Time to first proposal | From Cmd+Enter until the first parsed proposal block appears, with the reference model and a document < 20 KB. | ≤ 20 s p50, ≤ 45 s p90 | Optional local telemetry (on-disk counter) or dev-build instrumentation. |
| M-2 | Proposals applied without later manual editing | % of accepted proposals that are not reverted in the same session. | ≥ 60 % | Local count of `proposal.accept` vs `version.restore`. |
| M-3 | Broken-contract rate | % of agent responses that fail to parse. | ≤ 5 % with the shipped prompt | Local `proposal.parse_error` counter. |
| M-4 | Data loss | Reported cases of content lost after accepting or autosave. | 0 | Bug tracker + atomic-write tests. |
| M-5 | Cold start | From double click to visible tree. | ≤ 2.5 s | Dev-build instrumentation. |
| M-6 | Acceptance-criteria coverage | AC-1…AC-22 verified and green in local CI. | 22/22 | Release checklist. |
| M-7 | Test suite | Automated tests for splitter, ranges, parser and history. | ≥ 20 | `npm test`. |
| M-8 | Time to iterate a block | From having a block selected to accepting or rejecting the proposal, with a document < 20 KB. | ≤ 45 s p50, ≤ 90 s p90 | Optional local telemetry of `proposal.shown` / `proposal.decided`. |
| M-9 | Proposals accepted without rework | % of accepted proposals not manually edited in the following 60 s. | ≥ 55 % | Local counters `proposal.accept` vs subsequent `block.manual_edit`. |
| M-10 | Reduction of whole-document rewrites | % of requests using "Select whole document" out of all requests. | ≤ 10 % | Local counter by selection type. |
| M-11 | Voice consistency | Average score (1–5) on a voice rubric applied to a sample of accepted blocks: register, person, length, lexicon and things to avoid. | ≥ 4.0 | Manual rubric on a sample; not automated in v1. |
| M-12 | Guidelines retention | % of captured guidelines that reach the summarized rules block and are applied at least once. | ≥ 40 % | Local `guideline.capture`, `guideline.summarize`, `guideline.apply` counters. |

> Metrics M-1 to M-5 and M-8 to M-12 are release targets, not public promises. They are not
> published in the README until real data exists. M-6 and M-7 are internal quality criteria.

---

## 5. Scope

### 5.1 In scope (v1)

v1 ships in phases (v0.1.x → v0.2 → v0.3 → v1.0). This list is the full product scope, not the
current code state.

1. macOS arm64 packaging as `.app` and `.dmg`, unsigned.
2. Folder opening through the native dialog (File menu, in-app Workspace menu) and a tree
   filtered to `.md`/`.mdx`.
3. Reading, rendering and writing with autosave, manual save, indicator and atomic writes.
4. GFM rendering with code highlighting and editorial typography.
5. Render ↔ Markdown toggle preserving approximate position.
6. Block, section and contiguous-range selection; text-selection-to-block mapping.
7. Document outline.
8. Agent panel with streaming, cancellation, model selector and per-document history.
9. Context **strictly limited to the active selection** (block, section, contiguous range, or
   the whole document explicitly selected) on every request.
10. Proposals with diff and Accept / Reject / Ask for changes actions.
11. Per-block version history with navigation and restore.
12. Comments anchored to blocks with threads, badges, resolve/reopen and delete.
13. Keyboard shortcuts, empty/loading/error states, AA accessibility, light/dark.
14. Mock mode without credits for development and Playwright.
15. Documentation: this BRD and the README, in Spanish and English.
16. Per-workspace/document voice profile used as style context (RF-16).
17. Focus sessions attached to a block or section (RF-17).
18. Guidelines inbox and summarized rules block (RF-18, RF-19).
19. Consistency refactor over blocks not edited by hand, as proposals (RF-20).
20. Spanish/English UI and native menu, with a persisted selector and system detection
    (RF-21, RF-22).

### 5.2 Scope by phase

| Phase | Includes | Status |
| --- | --- | --- |
| **v0.1.x** | Electron shell, Markdown workspace, CodeMirror editor, GFM render, selection, native/in-app menus, titlebar, icon, v2 design and mock mode. | Done (v0.1.2) |
| **v0.2** | Embedded OpenCode, `nrvn-editor` agent with no tools, streaming, proposals/diff, per-block versions, anchored comments, basic voice profile, focus sessions, ES/EN i18n with selector. | In progress (B3): agent, connectors and proposals in validation; versions, comments, voice, focus and i18n pending. |
| **v0.3** | Guidelines inbox + rules summary, refactor of non-edited blocks, document versioning, export and git. | Planned |
| **v1.0** | Windows/Linux, signing/notarization, full i18n, audited accessibility, optional sync. | Planned |

### 5.3 Out of scope (v1) — explicit

| Excluded | Reason | Planned phase |
| --- | --- | --- |
| Multi-user / real-time collaboration | Requires sync infrastructure and conflict resolution. | Not planned |
| Cloud sync | Contradicts v1's locality promise. | v1.0 (optional, no cloud promise) |
| Git integration (diff, commit, blame) | Increases surface and expectations; v1 does not touch the user's repo. | v0.3 |
| PDF export | Requires a print engine and templates; not the core. | v0.3 |
| Inline WYSIWYG | The block model + CodeMirror covers the need with less risk. | Not planned |
| Document-level versioning | v1 versions per block; global history is a different product. | v0.3 |
| User-customizable themes | Adds design and QA surface; v1 ships curated light/dark. | v0.3 |
| Windows / Linux packaging | The code is portable, but only macOS arm64 is packaged. | v1.0 |
| Apple signing and notarization | Requires a developer account and a release process. | v1.0 |
| Agents with tools (shell, fs, network) | Unacceptable risk over personal documents. | Not planned |
| Full word processor | The product iterates Markdown blocks; it does not compete with Word/Docs. | Not planned |
| Image generation | Outside the writing core; adds cost and surface. | Not planned |
| General-purpose chat | The agent only works on the document selection. | Not planned |

---

## 6. Functional requirements

Convention: every requirement is written as "The system must…" and is verifiable. Each FR maps
to a literal acceptance criterion (AC-n) in section 6.16.

### RF-1 · Packaging and launch as an application

The system must be packaged as a macOS arm64 desktop application (`.app` and `.dmg` generated in
`release/`) and must launch with a double click, without a terminal, without environment
variables and without depending on an external running service. On launch it **always** opens a
new untitled empty document in Render; it does not restore the previous workspace or tree.

- Verification: run `npm run dist`, mount the `.dmg`, drag to `/Applications`, open from Finder.
- Note: unsigned in v1; the first launch may require manual user authorization (see R-5).

### RF-2 · Folder opening and Markdown tree

The system must let the user pick a folder through the native dialog and show a tree that
includes subfolders and **only** `.md` and `.mdx` files, excluding `node_modules`, `.git` and
`dist`. The tree must reflect on-disk changes when the window regains focus. Opening a file must
load it into the editor in under 300 ms for files up to 200 KB.

- Verification: test folder with `.md`, `.mdx`, `.txt`, images and the excluded folders; measure
  with `performance.now()` in a production build.
- Ordering rule: directories first, then files; alphabetical, case-insensitive, with `es` locale.

### RF-3 · Markdown editing, autosave and save indicator

The system must offer an editable Markdown view based on CodeMirror 6 with highlighting,
undo/redo and standard shortcuts; autosave 800 ms after the last edit and allow immediate save
with Cmd+S; if the document has no path, Cmd+S opens "Save as…" (IPC `saveDocumentAs`) and the
chosen folder becomes the workspace root; show an indicator with the states `Saving…` and
`Saved` (and `Unsaved` when there are pending changes or an error); and write atomically
(temporary file in the same directory + `rename`).

- Verification: edit and wait 800 ms → `Saved` indicator; kill the process during the write →
  the original file remains intact.
- Rule: a file is never written with empty content as a result of a failure; if the buffer is
  empty because of a user action, it is written empty but with a prior snapshot.

### RF-4 · GFM rendering with editorial typography

The system must render GitHub Flavored Markdown —headings, paragraphs, ordered and unordered
lists, tables, task lists, inline and block code, quotes, links, images, horizontal rules— with
editorial prose typography, and must highlight block-code syntax with a theme coherent with
light/dark.

- Verification: fixture document exercising every construct; visual comparison in Playwright
  (snapshot) and proof that a code block contains highlighted tokens.

### RF-5 · Block, section and range selection

The system must:

- select **one block** when clicking a paragraph, list item, table, code block or quote;
- select the **whole section** (up to the next heading of level ≤) when clicking a heading;
- extend to a **contiguous range** with Shift + click;
- map a text selection in Markdown mode to the corresponding blocks;
- clear the selection with Esc.

The selection must be visible (outline/highlight) and announced by screen readers.

- Verification: fixture with a hierarchy; test each gesture and check the set of selected block
  keys shown in the agent panel.

### RF-6 · Agent panel with per-document session

The system must show a right panel with the document conversation, the available model selector,
live token streaming, a Cancel button during generation, and must keep an agent session **per
document** with history that persists across app restarts.

- Verification: open doc A, converse, close the app, reopen → A's thread is present and B's is
  not. Cancelling mid-stream leaves the partial message marked as cancelled.
- Rule: switching documents switches the thread; an in-flight stream is cancelled when switching
  documents (with confirmation if generation is active).

### RF-7 · Request context and agent isolation

The system must build every prompt with **exclusively**: the file path, the heading path of the
selection, the exact content of the selected blocks, the user's instruction and the output
contract from section 8. The full document is **not** part of the default context: it is sent
only when the user runs the explicit **Select whole document** action, in which case the
selection *is* the whole document.

The editing agent must be the dedicated agent `nrvn-editor`, with **all** tools denied and the
user's MCP servers disabled in that instance. Its scope is the selection: it is not asked to
review, summarize or rewrite anything outside it, and the contract only allows operations on the
selected keys.

- Verification: prompt snapshot in unit tests; for a one-paragraph selection, the prompt contains
  no text from other blocks and no full document.
- Verification: negative test — ask the agent "list the files in the folder" and it must answer
  that it cannot or rephrase; there must be no tool call in the host log.
- Verification: the panel shows the active selection as the only context and the send button is
  disabled without a selection.

### RF-8 · Proposal with diff and user decision

The system must show every proposal as a before/after diff per block, and offer:

- **Accept** → applies exactly the proposed replacement for the indicated blocks.
- **Reject** → does not modify the document.
- **Ask for changes** → reopens the composer with the previous context and the rejected
  proposal.

No proposal is auto-applied. If the response does not satisfy the contract, the system must show
the raw text in an explicit error state, without a diff and without apply actions. Any operation
referencing a key **outside the active selection** invalidates the entire proposal: the agent
cannot touch blocks the user did not select.

- Verification: three proposals, one per action; and a corrupt response (missing closing marker)
  that must fall into error without touching the file.

### RF-9 · Per-block version history

The system must create a block version on every accepted change and on every relevant manual
change, and offer a per-block overlay with `‹ ›` navigation, date/origin indication
(`agent` / `manual` / `restored`) and a **Restore** action that creates a new version (it does
not delete history). History must persist across restarts and survive the app going offline.

- Verification: accept 3 proposals in a block → 3 navigable versions; restore the first → 4
  versions; restart the app → history intact.

### RF-10 · Comments anchored to blocks

The system must allow creating comments anchored to a block, shown by a badge in the block
margin, with a reply thread, resolve/reopen and delete actions. Comments must persist per
workspace and document. If the block hash changes due to an edit, the comment must remain
visible and marked as **"block edited"**.

- Verification: create a comment, edit the block manually, check the mark; resolve and reopen;
  delete; restart the app.

### RF-11 · Shortcuts, states and AA accessibility

The system must implement the shortcuts Cmd+O (open folder), Cmd+E (Render/Markdown toggle),
Cmd+S (save), Cmd+Enter (send to agent) and Esc (close overlay / clear selection / cancel
generation, in that priority order). It must cover empty, loading and error states in the tree,
document and agent panel. It must meet WCAG 2.1 AA in visible focus, roles and ARIA labels, text
contrast, `aria-live` for streaming and full keyboard navigation in the tree and panel.

- Verification: manual AA checklist + axe-core in Playwright; keyboard-only test.

### RF-12 · Design system and three-panel layout

The system must use its own design tokens (color, spacing, typography, radii, motion 120/180 ms)
without magic values in components; a collapsible three-panel layout (tree, document, agent)
with a usable minimum width; responsive behavior at ≥ 1024 px with a clear notice below 900 px;
and dependencies exclusively with permissive licenses (MIT/ISC/BSD/Apache-2.0/OFL).

- Verification: audit `package.json` against the allowed list; test collapsing each panel;
  capture at 1024 and 899 px.

### RF-13 · Embedded OpenCode host, models and mock mode

The system must start the OpenCode host embedded in the main process, detect it correctly, list
the models actually available according to the user's configuration, and show an error state
with a retry action if detection fails. There must be a working mock mode
(`VITE_MOCK_BRIDGE`) that reproduces the full flow without credits or network.

- Verification: normal build with and without credentials; mock build running the three-step
  flow in Playwright.

### RF-14 · Verifiable delivery quality

The system must pass `npm run typecheck`, `npm run lint`, `npm test` (≥ 20 tests covering block
splitter, selection ranges, proposal parser and history), `npm run build` and `npm run dist`,
and must include a Playwright smoke test with screenshots of the main flow.

- Verification: clean run in a fresh clone with `npm ci`.

### RF-15 · Documentation consistent with the real state

The system must ship with complete `README.md` and `BRD.md`, coherent with the real code state:
nothing documented as existing if it is not, and every existing feature documented.

- Verification: cross-review at release; the README commands run as written.

### RF-16 · Per-workspace/document voice profile (v0.2)

The system must allow defining and persisting a **voice profile** per workspace and, optionally,
per document, with these fields: register, grammatical person, target length, preferred lexicon,
things to avoid and examples. The profile must be sent to the agent as **style context separate
from content**, never mixed with block text, and the user must be able to see exactly what is
sent. The profile survives restarts and does not modify the `.md`.

- Verification: define a profile, send a request and check in the prompt snapshot that the
  profile sits in a style section separate from content; restart and check persistence.
- Rule: disabling the profile for one request does not delete it.

### RF-17 · Focus session (v0.2)

The system must allow starting a **focus session** on a block or section, with an editable name
(e.g. "Introduction") and, optionally, a duration. While active, the agent panel must indicate
the focus and group that area's history separately. Closing the focus does not delete history or
content. There can be only one active focus session per document.

- Verification: start a focus on a section, iterate twice, close it, reopen the app and check
  that the focus history is still attached to that section.
- Rule: switching documents pauses the focus, it does not close it.

### RF-18 · Guidelines inbox (v0.3)

The system must allow **capturing a style instruction** from the composer or from the selection
("no adverbs", "sentences of 20 words max") and saving it in a per-workspace inbox with text,
source example, date and status (`new`, `in rules`, `discarded`). The inbox must allow editing,
discarding and reordering; it must suggest duplicates and persist across restarts.

- Verification: capture three guidelines, edit one, discard another, restart and check status
  and order.
- Rule: a captured guideline is not applied on its own; it enters context only when part of the
  rules block or when the user invokes it.

### RF-19 · Rules block summary (v0.3)

The system must **consolidate** guidelines into a rules block when a configurable threshold is
reached (8 `new` guidelines by default) or when the user asks. Consolidation must be a
model-assisted operation that shows a **diff of the rules block** before saving it; the
resulting block is hand-editable, versioned and applicable as context to any request.

- Verification: with 8 guidelines, run "Consolidate", review the diff and accept; the block is
  versioned and the guidelines move to `in rules`.
- Rule: if consolidation fails or produces an empty diff, the inbox remains intact and an error
  with retry is shown.

### RF-20 · Refactor of blocks not edited by hand (v0.3)

The system must allow applying the rules block to document blocks that **have not been edited by
hand**, meaning those that keep the hash of their last agent-generated or restored version. The
result must arrive as **per-block proposals with a diff**, never as an automatic write; it must
report how many blocks are skipped due to manual editing and allow accepting or rejecting each
proposal.

- Verification: document with 5 blocks, edit one by hand, run the refactor → 4 proposals and 1
  skipped; accept 2 and check that only those two change on disk.
- Rule: a block with no prior history counts as not edited by hand and is eligible.

### RF-21 · Spanish and English UI and native menu (v0.2)

The system must support **Spanish and English** across the entire UI and the native menu: no
hardcoded strings in components, dates and numbers formatted according to the active locale, and
document content left intact (the user's text is never translated). The default language on
first run is the system language if it is `es` or `en`; otherwise, English.

- Verification: walk the tree, document, menus, agent panel and empty/loading/error states in
  both languages; check that no untranslated text remains and that the document does not change.
- Rule: language does not alter the on-disk format or metadata content.

### RF-22 · Persisted language selector (v0.2)

The system must offer a **language selector** (Español / English) in settings and in the menu,
persist the choice in `settings.json` and apply it without restarting the app, rebuilding the
native menu. The manual choice overrides system detection on later launches.

- Verification: switch to English, restart and check that the UI and native menu remain in
  English; switch to Spanish and check that it applies live.
- Rule: if the persisted value is missing or invalid, system detection applies with an English
  fallback.

### 6.16 Acceptance criteria (literal)

These 22 criteria are the definition of "done" for v1 and are cited without reinterpretation.

1. `npm run dist` generates `.app`/`.dmg` in `release/` and the app opens without a terminal.
2. Open a folder through the native dialog; the tree shows only `.md`/`.mdx` including
   subfolders and excludes `node_modules`, `.git`, `dist`; opening a file loads it in <300 ms.
3. Render/Markdown toggle with Cmd+E preserving approximate position; CodeMirror with
   highlighting, undo and shortcuts; autosave 800 ms + Cmd+S; Saving/Saved indicator; atomic
   writes.
4. GFM render (tables, task lists, code, quotes, links) with editorial typography and code
   highlighting.
5. Clicking a paragraph selects a block; clicking a heading selects a section; Shift extends a
   contiguous range; selection in edit mode maps lines to blocks; Esc clears.
6. Agent panel with conversation, model selector, per-document session, token streaming, cancel
   and history persisting across restarts.
7. The prompt includes file, heading path, block(s) and output contract; the agent cannot run
   tools (verified with a negative test).
8. Proposal shows a before/after diff; Accept applies exactly the replacement; Reject does not
   touch the document; Ask for changes reopens the prompt; broken contract = error state with no
   auto-apply.
9. Every accepted or manual change creates a block version; `‹ ›` arrows navigate versions in an
   overlay; Restore creates a new version; persists across restarts.
10. Comments anchored to a block with badge, thread, resolve/reopen and delete; they persist and
    show "block edited" if the hash changes.
11. Shortcuts Cmd+O/Cmd+E/Cmd+S/Cmd+Enter/Esc; empty/loading/error states; AA accessibility
    (visible focus, roles, contrast, aria-live on streaming, keyboard navigation in tree and
    panel).
12. Design tokens (color, spacing, typography, motion), collapsible 3-panel layout, responsive
    ≥1024 px with a notice below 900 px, permissive dependencies only.
13. Detection of the embedded OpenCode host and real model listing; error state with retry;
    working mock mode without credits.
14. `npm run typecheck`, `npm run lint`, `npm test` (≥20 tests for splitter, ranges, proposal
    parser and history), `npm run build` and `npm run dist` green; Playwright smoke with
    screenshots.
15. README.md and BRD.md complete and coherent with the real code state.
16. Per-workspace/document voice profile with register, person, length, lexicon, things to avoid
    and examples; sent as separate style context, previewable and persistent across restarts.
17. Named focus session on a block or section, with grouped history, pause on document switch and
    persistence on close.
18. Guidelines inbox with capture, editing, discarding, reordering, duplicate detection and
    persistence.
19. Consolidation of guidelines into a rules block with a prior diff, block version and `in
    rules` status for included guidelines.
20. Consistency refactor over blocks not edited by hand: per-block proposals with diff, skipping
    manually edited blocks and never writing automatically.
21. Spanish and English UI and native menu, no hardcoded strings, locale-aware dates/numbers and
    document content intact.
22. Language selector persisted in `settings.json`, applied without restart and with system
    detection on first launch (English fallback).

Status: **current release = v1.0.6**; **v1.0 final = platform completion**.

| AC | Status in current release | v1.0 final |
| --- | --- | --- |
| AC-1 | met | met |
| AC-2 | met | met |
| AC-3 | met | met |
| AC-4 | met | met |
| AC-5 | met | met |
| AC-6 | met | met |
| AC-7 | met | met |
| AC-8 | met | met |
| AC-9 | not met | met |
| AC-10 | met | met |
| AC-11 | partial | met |
| AC-12 | partial | met |
| AC-13 | met | met |
| AC-14 | met | met |
| AC-15 | met | met |
| AC-16 | not met | met |
| AC-17 | not met | met |
| AC-18 | not met | met |
| AC-19 | not met | met |
| AC-20 | not met | met |
| AC-21 | not met | met |
| AC-22 | not met | met |

AC-11: shortcuts are implemented; formal AA audit is pending. AC-12: tokens/layout are implemented; extreme responsive behavior is unverified.

**FR ↔ AC matrix:** RF-1↔AC-1, RF-2↔AC-2, RF-3↔AC-3, RF-4↔AC-4, RF-5↔AC-5,
RF-6↔AC-6, RF-7↔AC-7, RF-8↔AC-8, RF-9↔AC-9, RF-10↔AC-10, RF-11↔AC-11,
RF-12↔AC-12, RF-13↔AC-13, RF-14↔AC-14, RF-15↔AC-15, RF-16↔AC-16, RF-17↔AC-17,
RF-18↔AC-18, RF-19↔AC-19, RF-20↔AC-20, RF-21↔AC-21, RF-22↔AC-22.

---

## 7. Non-functional requirements

### RNF-1 · Performance

- Cold start ≤ 2.5 s until the tree is visible on a MacBook Air M1.
- File open ≤ 300 ms until content is painted (≤ 200 KB).
- Accepted-block write perceived ≤ 100 ms (diff + apply in renderer).
- The block splitter must process 200 KB in ≤ 50 ms on the UI thread (or move to a worker if it
  exceeds that; implementation decision, not scope).
- Streaming must paint tokens with per-frame coalescing, no more than 60 renders/s.
- Memory rule: not all documents in the folder are loaded; only the open one and its metadata
  tree.

### RNF-2 · Security

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` in the renderer.
- No direct `ipcRenderer` exposure: only a typed `contextBridge` with enumerated channels.
- The renderer does not receive arbitrary absolute paths: disk operations are validated in the
  main process against the opened folder root (path traversal prevention).
- Markdown rendering without raw HTML by default; `dangerouslySetInnerHTML` forbidden for user
  content. External links opened with `shell.openExternal` and scheme validation (`https`,
  `mailto`).
- No execution of document content (no scripts, iframes or `file://` loadable from the render).

### RNF-3 · Local privacy

- Workspace state lives under `~/Library/Application Support/nrvn/`; portable document metadata lives in `<document>.md.nrvn`. The `.md` content changes only through accepted edits.
- No remote telemetry in v1. The metric counters in section 4 are local and optional.
- Network access includes model-provider requests, querying the host's provider/model catalog, and device OAuth against `https://opencode.ai/console` when connecting an account.
- Documents are never uploaded to nrvn servers: nrvn servers do not exist.

### RNF-4 · Data integrity and recovery

- Atomic writes mandatory (temp + rename) for every document write.
- Snapshot of the block and the document before applying any accepted proposal or version
  restore.
- If the snapshot or the write fails, the document remains intact and an error with retry is
  shown; a partial apply never happens.
- Metadata (threads, versions, comments) is written with the same atomic pattern and one file
  per document to limit corruption damage.

### RNF-5 · AA accessibility

- Minimum contrast 4.5:1 for normal text and 3:1 for large text and non-text UI elements, in
  light and dark.
- Visible focus always (never `outline: none` without a replacement).
- Roles and accessible names in tree, panels, overlays and composer; `aria-live="polite"` for
  streaming and `assertive` for save errors.
- Full keyboard navigation, including block selection in render mode.
- Respect for `prefers-reduced-motion` (motion at 0 ms, no functional loss).

### RNF-6 · Portability

- Code without macOS-specific APIs in the product layer, except: native dialog,
  `Application Support` paths (via `app.getPath`) and packaging.
- No dependency on macOS-only binaries in the renderer runtime.
- v1 is only packaged and tested on macOS arm64; other platforms are not promised.

### RNF-7 · Permissive licenses

- Only MIT, ISC, BSD-2/3, Apache-2.0 and OFL (fonts) dependencies.
- GPL/AGPL/LGPL prohibited in runtime and in distributed build tools.
- Every new dependency requires license verification before entering `main`.
- Fonts are distributed under OFL with their license text included (today Inter and Newsreader;
  Lato as the v3 target, with Inter as fallback).

### RNF-8 · Maintainability and observability

- TypeScript `strict`, no implicit `any`; the IPC bridge is the only untyped boundary and is
  hand-typed in a shared module.
- Local rotating logs in `~/Library/Logs/nrvn/` with configurable level; no document content in
  logs by default (paths and lengths only).
- OpenCode host errors are translated into actionable UI messages (no stack traces).

### RNF-9 · Data compatibility

- The `.md` content receives no metadata or injected front matter and is not globally reformatted; portable metadata lives in `<doc>.md.nrvn` beside the document.
- Line-ending normalization: the detected file style (LF or CRLF) is preserved.
- Encoding: UTF-8; BOM preserved if it existed.

### RNF-10 · Internationalization (i18n)

- Every visible string goes through a translation catalog (`es`, `en`); no hardcoded text in
  components or in the native menu template.
- Dates, numbers and durations are formatted with `Intl` according to the active locale.
- User content, block keys, paths and model identifiers are never translated.
- The active language is persisted in `settings.json`; the first launch detects system `es`/`en`
  and falls back to English for anything else.
- Changing the language requires no restart and does not alter documents or metadata.

### RNF-11 · Local-first and offline operation

- The app must be fully usable as a Markdown editor offline: open folder, read, edit, save,
  render, select and navigate.
- No core functionality may depend on a running service or an account.
- Lack of network only affects the agent; the error is communicated with retry and the document
  remains intact.
- There is no nrvn backend and no mandatory synchronization.

### RNF-12 · Privacy of the voice profile and guidelines

- Voice and guidelines are unimplemented targets; when implemented, they will not be written into the `.md`.
- They are sent to the model provider only when they are part of a request's context.
- The user can view and fully delete both data sets from settings.
- They are not included in logs: logs record paths and lengths, not style content.

---

## 8. Block model and agent contract

### 8.1 Block model

A document is split into blocks by a custom, **fence-aware** splitter (respects code blocks
delimited by ``` or ~~~, including nested fences by backtick length).

Block types: `heading`, `paragraph`, `list`, `table`, `code`, `quote`, `hr`, `html`.

**Stable key (block key):** `heading path + type + ordinal`.

```
path = "H1 text" / "H2 text" / ...      (ancestor headings, normalized)
key  = `${path}#${type}:${ordinal}`      (ordinal = index of that block type under that path)
```

Example: `Style guide / Writing#paragraph:3`.

**Content hash:** SHA-256 truncated to 12 hex of the block's normalized text (trailing-space
trim, normalized line breaks). Used to detect manual edits and to mark comments as "block
edited".

**Section hierarchy:** a `heading` block of level *n* spans until the next heading of level ≤
*n*. Clicking a heading selects that whole section (heading included).

**Ranges:** Shift extends the selection to all contiguous blocks between anchor and target, in
document order. A range never includes gaps.

**Heading rename:** if a heading's text changes, its descendants' keys change. v1 mitigation:
when accepting a proposal that rewrites a heading, the system recomputes keys and **remaps**
versions and comments by the previous block's content hash (see R-3). If remapping is ambiguous,
history is kept under the old key and the user is told the block was restructured.

### 8.2 Agent contract (marker format)

The `nrvn-editor` agent responds **only** with delimited blocks. It uses no tools.

```
<<<NRVN_BLOCK>>>
id: Style guide / Writing#paragraph:3
op: replace
---
<new Markdown content of the block, without outer fences>
<<<NRVN_END>>>
```

Contract rules:

- A message may contain one or several blocks.
- `op` ∈ {`replace`, `insert_after`, `delete`}. `delete` has no body.
- `id` must be an existing key in the sent context (or, for `insert_after`, the key of the block
  after which to insert).
- Any text outside the markers is treated as the agent's commentary and shown separately; it is
  not applied.

**Tolerant parsing** (requirement, not optional):

- Blank lines and spaces around markers are ignored.
- Field names are case-insensitive (`ID:`, `Op:` accepted); spaces around `:` ignored.
- Unknown fields are ignored; missing required fields invalidate the block.
- A block with an unresolvable `id` is invalidated **only itself**; the rest of the message
  remains applicable if valid.
- Missing closing marker, duplicated opening marker or empty body where content is expected →
  invalid block.
- If **all** blocks are invalid → error state: raw response shown, no diff, no apply actions.

**Application:**

- The replacement is applied over the block's exact text, preserving external indentation and
  the file's line endings.
- `insert_after` creates a new block with a derived key and the next ordinal.
- Every application creates a block version and a prior snapshot (RF-9, RNF-4).

### 8.3 Context limits (DECIDED)

- **Hard rule: the agent works only on the selection.** The prompt contains only the active
  selection (block, section or contiguous range), the heading path, the file path and the
  instruction. Never the whole document by default.
- Global adjustments are made by explicitly selecting **the whole document** (action
  `Select whole document`); then the selection is the document and the agent operates on it as a
  single unit of work.
- No selection, no send: the composer shows "Select a block to work on" and the Send button stays
  disabled.
- The response contract may only reference keys in the selection. A foreign key invalidates the
  entire proposal.
- Configurable context limit; if the selection exceeds it, the system warns and requires
  splitting it instead of silently truncating.

---

## 9. Architecture and data flow

### 9.1 Stack (DECIDED)

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 45 (MIT) |
| UI | React 19 + TypeScript (strict) |
| Build | Vite |
| Packaging | electron-builder → `.app` / `.dmg` macOS arm64 |
| Agent | `@opencode/sdk` 2.2.3 embedded in the main process |
| Markdown editor | CodeMirror 6 |
| Render | react-markdown + remark-gfm + Shiki |
| State | Zustand |
| Accessible primitives | Radix (headless) |
| Icons | lucide |
| Diff | jsdiff |
| Tests | Vitest + Playwright |
| Lint/format | Biome |

### 9.2 Processes

**Main process:**

1. Window lifecycle and native menu (shortcuts, "Open folder…").
2. Native folder selection dialog.
3. Tree traversal and filtering (`.md`, `.mdx`, exclusions).
4. File reads/writes with atomic writes and path validation.
5. Embedded OpenCode host in memory (no external service, no terminal).
6. Metadata persistence in `~/Library/Application Support/nrvn/`.
7. Local logs.

**Preload:**

- `contextBridge` exposing a `window.nrvn` object with methods typed one-to-one over enumerated
  IPC channels (`nrvn:fs:*`, `nrvn:agent:*`, `nrvn:meta:*`, `nrvn:app:*`).
- No `ipcRenderer` access from the renderer; no `require`.

**Renderer:**

- React + Zustand. State split into: `workspace` (root, tree, active file), `document` (text,
  blocks, hash, dirty, selection), `agent` (thread, stream, models), `meta` (versions, comments),
  `ui` (panels, overlays, toasts).
- The block splitter runs in the renderer after each text change (debounced), not on every stream
  token.

### 9.3 Data flow of a proposal

```
User selects block(s) / section / whole document
  → renderer builds context ONLY from the selection (file, path, text, hash)
  → IPC nrvn:agent:send  (prompt + selection + session id)
  → main: OpenCode host (document session, nrvn-editor agent)
  → token stream  →  IPC events  →  renderer paints
  → end of stream: tolerant parser in renderer
      ├─ valid → "proposal" state with per-block diff
      └─ invalid → "error" state with raw text
  → Accept → IPC nrvn:fs:apply-block (snapshot + atomic write)
            → new block version → re-split → re-hash
  → Reject → no disk changes
  → Ask for changes → new turn with context + rejected proposal
```

### 9.4 Persistence (DECIDED)

```
~/Library/Application Support/nrvn/
  settings.json
  workspaces/
    <root path hash>/
      threads.json
      annotations.json   # history, comments and critiques
      pending.json

<document path>.md.nrvn   # portable bundle next to the .md
```

Rules:

- The sidecar contains document path/hash/savedAt, threads, pending, history, comments, critiques, languages and provenance. It is written on save and read on open using atomic temporary-file + rename writes.
- If corrupted, it is set aside as `.corrupt-<ts>`; the `.md` content is untouched. Application Support stores workspace cache/state; the `.md` receives no metadata or front matter.

#### Unimplemented target

`versions/`, `voice.json`, `guidelines.jsonl`, `rules/` and `focus.json` are targets, not current persistence.

### 9.5 Agent sessions

- One OpenCode session per document, created lazily on the first send.
- Persisted across restarts (the thread is rehydrated and the session reused if the host
  recognizes it; otherwise a new one is created and the thread summary is re-injected).
- Model selectable by the user and persisted per workspace; the `nrvn-editor` agent is fixed and
  not editable in v1.
- The user's MCP servers are disabled in that instance (DECIDED).

### 9.6 Isolation and errors

- If the OpenCode host fails to start, the app remains usable as a Markdown editor; the agent
  panel shows an error with retry (AC-13).
- If the SDK changes its streaming API, the adapter in `main` isolates the impact (see R-1).
- The renderer never interprets agent responses as executable instructions.

---

## 10. UX and design system

> **v3 "Moon Silver / Pearl Grey" (implemented).** This section describes the design system applied
> to the product. v0.1.2 started on **v2 "Silver Lean"** and the v3 migration is now applied:
> white sheet, Lato, Mist/Moon Silver palette and line numbers in Markdown. The *warm*/terracotta
> palette is **retired**: it is not used in any component and is not kept as an alternative theme.
> Full detail is in [`docs/design-system.md`](docs/design-system.md).

### 10.1 Layout

**Titlebar.** Full-width 44 px `titlebar` strip, declared `-webkit-app-region: drag` (with
interactive zones excluded from dragging). The window uses `titleBarStyle: "hiddenInset"` and
`trafficLightPosition {x:16, y:15}`, so the macOS traffic lights fall inside the strip. On the
left, after the traffic lights, the name `nrvn`; on the right, the save state (`Saved`,
`Saving…`, `Unsaved`, `Save error`; `Draft` when the document has no path).

**Three-panel shell** below the titlebar:

| Panel | Content | Default width | Collapse |
| --- | --- | --- | --- |
| Rail | Global actions (icons with tooltip) | 56 px | Does not collapse |
| Left | Folder tree (only `.md`/`.mdx`), document outline | 248 px | Button / handle |
| Center | Document with Render ↔ Markdown toggle | flexible, prose max 720 px | Does not collapse |
| Right | Agent panel (shell): selection context + composer | 380 px | Button |

- Responsive: ≥ 1024 px all three panels; 900–1023 px tree collapsed by default; < 900 px clear
  notice of insufficient size (with the option to continue in a reduced layout).
- The versions overlay and the comments overlay open over the block, not as a global modal.

### 10.2 Typography and tokens

**Typography.** **Lato** (OFL, bundled) for all UI and prose: clear, humanist and simple, in the
style of Slack. Weights 400/700 and 400 italic. UI 12/13/14 px; prose 16.5 px with line height
1.7; headings at weight 600; system monospace for code. Line measure 62–72 characters, no
aggressive tracking in prose. **Newsreader (serif) is retired**; Inter is kept only as a system
fallback if Lato fails to load.

**Palette (`--color-*` tokens).** Light and dark are complete sets, not an automatic inversion.
No gradients or glassmorphism.

| Token | Light | Dark |
| --- | --- | --- |
| `--color-bg` | `#F4F5F5` | `#191B1D` |
| `--color-surface` | `#FCFCFC` | `#202326` |
| `--color-elevated` | `#FFFFFF` | `#262A2D` |
| `--color-sunken` | `#ECEEEF` | `#151719` |
| `--color-ink` | `#202326` | `#ECEEF0` |
| `--color-ink-secondary` | `#485056` | `#C3C9CE` |
| `--color-muted` | `#70757A` | `#A0A7AE` |
| `--color-line` | `#E1E4E6` | `#30353A` |
| `--color-line-strong` | `#848B92` | `#6F7880` |
| `--color-accent` | `#6C8AA3` | `#A9C0D2` |
| `--color-accent-hover` | `#5B7C99` | `#C7D8E4` |
| `--color-accent-soft` | `#E6EDF2` | `rgba(169,192,210,.14)` |
| `--color-accent-text` | `#46647B` | `#C7D8E4` |
| `--color-selection-bg` | `#E6EDF2` | `#24313C` |
| `--color-selection-bar` | `#5B7C99` | `#A9C0D2` |
| `--color-pastel-blue` | `#E6EDF2` | — |
| `--color-pastel-sage` | `#E6EEE9` | — |
| `--color-pastel-lavender` | `#ECEAF2` | — |
| `--color-pastel-butter` | `#F4EFE1` | — |
| `--color-pastel-pearl` | `#F3F4F2` | — |
| `--color-danger` | `#A34A3C` | `#E08A7A` |
| `--color-success` | `#3F7358` | `#86B79A` |
| `--color-warning` | `#8A6A2F` | `#D6B26A` |

- **Accent and contrast.** `--color-accent` is used in bars, backgrounds and the focus ring; for
  small text and links that must meet AA, use `--color-accent-text` (light `#46647B` / dark
  `#C7D8E4`), because `--color-accent` does not reach 4.5:1 on `bg`.
- **Surfaces.** Mist `#F4F5F5` is the background; Moon Silver `#ECEEEF` is the sunken surface;
  Pearl `#F3F4F2` is used as a neutral pastel.
- **Radii:** 5 / 8 / 12 px (`--radius-sm|md|lg`).
- **Shadows:** `0 1px 2px rgba(16,24,40,.04)` (card) and `0 12px 32px rgba(16,24,40,.12)`
  (overlay).
- **Motion:** `--motion-fast: 120ms`, `--motion-base: 180ms`, standard easing;
  `prefers-reduced-motion` disables non-essential transitions.
- **Focus:** 2 px ring in `--color-accent` with 2 px offset.
- **Spacing:** 4 px base scale (`--space-1…12`).
- No hardcoded colors in components; everything goes through tokens.

### 10.3 States

| Surface | Empty | Loading | Error |
| --- | --- | --- | --- |
| Launch | New untitled, empty document in Render; workspace and tree are not reopened | — | — |
| Tree | "Open a folder to start" + Cmd+O | Row skeleton | "Could not read the folder" + retry |
| Document | Empty title in Render with editorial placeholder "Start writing…" and "Edit in Markdown" CTA | Prose skeleton | "Could not open the file" + retry / open another |
| Titlebar | `Draft` if there is no path | `Saving…` | `Save error` |
| Agent panel | "Select a block or use the whole document" | Streaming with cursor and Cancel | Broken contract, host down, no model: message + action |

- On launch a new empty document **always** opens: the previous workspace and tree are not
  restored. "Reopen recent" is only available from the menu.
- Cmd+S on an untitled document opens "Save as…" (IPC `saveDocumentAs`); Save as adopts the
  chosen folder as the workspace root.

### 10.4 Selection

- Selected block: `--color-selection-bg` pastel band + 2 px inner bar `--color-selection-bar`.
  The bar uses `padding-inline: 14px`, so it never overlaps the text.
- Selected section: same highlight spanning the whole section, heading included.
- Range: continuous highlight without gaps, with a "3 blocks" label.
- In Markdown mode: `cm-block-selected` paints the same band + bar (not just 1 px lines); native
  selection uses `--color-selection-text` to contrast with the band.
- Keyboard focus keeps its ring: selecting with the mouse does not draw it, navigating with
  arrows does.
- Esc clears; clicking outside the document clears (unless an overlay is open).

### 10.5 Shortcuts

Native (Electron) and in-app menus share the same commands.

| Shortcut | Action | Esc priority |
| --- | --- | --- |
| Cmd+N | New document | — |
| Cmd+O | Open folder… | — |
| ⇧Cmd+O | Reopen recent | — |
| Cmd+S | Save now (untitled → Save as…) | — |
| ⇧Cmd+S | Save as… | — |
| Cmd+W | Close document | — |
| Cmd+E | Toggle Render ↔ Markdown (preserves approximate position) | — |
| ⇧Cmd+A | Select whole document | — |
| ⇧Cmd+C | Copy Markdown | — |
| Cmd+Enter | Send to agent from the composer | — |
| Esc | Close overlay → clear selection → cancel generation | 1, 2, 3 |

### 10.6 Interaction accessibility

- **Menus.** Native: `nrvn` (appMenu), File, Edit, View, Window, Help. In-app with Radix
  DropdownMenu (`@radix-ui/react-dropdown-menu` 2.2.1): Workspace, File, Document, Agent.
  Radix context menu (`@radix-ui/react-context-menu` 2.4.1) on the tree with Open, Reveal in
  Finder and Copy path. 32 px items, 15 px lucide icons, aligned shortcuts and
  `aria-keyshortcuts` on each actionable item.
- **Tree** with `role="tree"`, `treeitem`, `aria-expanded`, arrow navigation, Enter to open; in
  Render and Markdown, `aria-current` marks the visible outline heading.
- **Blocks** selectable with managed (roving) `tabindex` and Enter/Space to select; Shift+Enter
  extends.
- **Streaming** with `aria-live="polite"`; on completion, focus does not move (pending B2).
- **Saving** announced with `role="status"`; errors with `aria-live="assertive"`.
- **Dialogs** with Radix, focus trapped and restored.
- AA contrast (4.5:1 text, 3:1 UI): see RNF-5. The formal AA audit is still pending; text tokens
  and `--color-accent-text` are chosen to meet it.

### 10.7 Components and patterns

| Component | Specification |
| --- | --- |
| **Titlebar** | Full-width 44 px, draggable, macOS traffic lights (`hiddenInset`, `trafficLightPosition {x:16,y:15}`), `nrvn` name and save state. |
| **Rail** | 56 px, 15–16 px lucide icons with tooltip and active state in accent-soft. |
| **Tree** | 248 px; 28 px rows, hover in sunken, selection in accent-soft, 16 px indent per level. |
| **Document** | Centered prose with 720 px max; surface background; no hard borders. |
| **Agent** | 380 px; header with model and state, scrollable thread, fixed composer. |
| **Menus** | Native (Electron) and in-app with Radix: Workspace, File, Document, Agent; 32 px items, aligned shortcuts, `aria-keyshortcuts`. |
| **Context menu** | Radix on the tree: Open, Reveal in Finder, Copy path. |
| **Segmented** | Render / Markdown in the document header; two-position control, 28 px high. |
| **Buttons** | Primary (solid accent, white text), secondary (line-strong border, surface background), ghost (no border, sunken hover). Height 28/32 px, radius 8. |
| **Inputs** | Surface background, line border, focus with 2 px accent ring + 2 px offset; placeholder in muted. |
| **Comment badges** | 18 px circle in the block margin; accent-soft with accent-text; counter if there is a thread. |
| **Selection bar** | `selection-bg` pastel band + 2 px inner `selection-bar`; `padding-inline: 14px`. |
| **States** | Empty with short copy and CTA; loading with skeleton; error with actionable message and retry. |
| **Dark mode** | Complete token set, not an automatic inversion; same AA contrast. |
| **Shortcuts** | See §10.5; menu text and tooltips are translated with the active language. |

**UI i18n.** All copy for these components lives in `es`/`en` catalogs (RNF-10). The language
selector lives in settings and in the menu; changing it rebuilds the native menu without a
restart (RF-22).

**Visual references.** Concepts are in `docs/assets/design/`; real v0.9.0 screenshots are in `docs/assets/screenshots/v090/`.

---

## 11. Phased roadmap

### v0.1.x — Historical

Outcome: a usable local Markdown editor with workspace, render, selection and menus, ready to
receive the agent layer.

| # | Initiative | Outcome | Status |
| --- | --- | --- | --- |
| I-1 | Electron shell + typed bridge | App opens without a terminal on macOS arm64 | Done |
| I-2 | Tree, reading and atomic writes with autosave | Edit without fear of data loss | Done |
| I-3 | Fence-aware splitter + block/section/range selection | The user points exactly at what they want to change | Done |
| I-4 | GFM render + CodeMirror toggle | Read and edit without friction | Done |
| I-5 | Native and in-app menus, titlebar, icon | Complete desktop surface | Done |
| I-6 | v2 design system + mock mode | Visual and development base | Done |
| I-7 | Migration to v3 "Moon Silver / Pearl Grey" + Lato | Product visual target | Done (historical cycle) |

### v0.2 — Historical

Outcome: the user asks for changes to a block, sees proposals, accepts them and keeps their
voice.

| # | Initiative | Expected outcome | Size |
| --- | --- | --- | --- |
| I-8 | Embedded OpenCode host + `nrvn-editor` agent with no tools + streaming | The agent proposes without being able to touch anything | L |
| I-9 | Marker contract, tolerant parser, diff and decision | Full control over the result | L |
| I-10 | Per-block versions + anchored comments | Continuity and local traceability | M |
| I-11 | Basic per-workspace/document voice profile (RF-16) | Persistent style separate from content | M |
| I-12 | Focus sessions (RF-17) | Scoped iteration per area with history | M |
| I-13 | ES/EN i18n + persisted selector (RF-21, RF-22) | UI and native menu in two languages | M |

Exit milestone: AC-6…AC-11, AC-13, AC-16, AC-17, AC-21 and AC-22 green.

### v0.3 — Historical; scope not fully delivered

Outcome: the user turns repeated corrections into rules and applies them to the document without
losing control.

| # | Initiative | Expected outcome | Size |
| --- | --- | --- | --- |
| I-14 | Guidelines inbox (RF-18) | Capture style without interrupting writing | M |
| I-15 | Rules block summary (RF-19) | Reusable, versioned rules | M |
| I-16 | Refactor of non-edited blocks (RF-20) | Consistency through proposals, not automatic | L |
| I-17 | Document versioning | Global history and comparison | M |
| I-18 | Export and scoped git | Publish and review without leaving the app | M |

Exit milestone: AC-18, AC-19 and AC-20 green.

### v1.0.6 — 2026-11-04

Closed scope: Render/Markdown editing, selection, agent and proposals, Render operations, variant from review,
annotations/critiques, language copies and `.nrvn` metadata. Out of scope: Apple signing and
notarization, Windows/Linux, auto-update, complete UI i18n, formal AA audit and sync.

### v1.0 — Later platform work

- Windows/Linux packaged and verified.
- Apple signing and notarization; update channel.
- Full i18n (copy review) and audited accessibility.
- Optional opt-in sync; no mandatory cloud and no multi-user.

---

## 12. Risks and mitigations

| ID | Risk | Prob. | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R-1 | **Young OpenCode SDK**: API changes across 2.x, unstable streaming behavior. | High | High | Exact pinned version (2.2.3); adapter isolated in `main`; own internal contract (`send`/`stream`/`cancel`) that does not expose SDK types to the renderer; upgrade plan with adapter integration tests. |
| R-2 | **Streaming contract**: the model ignores markers or mixes them with prose. | Medium | High | Tolerant parser; few-shot prompt with explicit contract; error state with no auto-apply; metric M-3 with a ≤ 5 % threshold; "Ask for changes" with guided retry. |
| R-3 | **Block anchoring**: unstable keys when renaming headings or reordering. | Medium | High | Content hash for detection; hash-based remapping when accepting heading changes; keep history under the old key if remapping is ambiguous; splitter and rename tests. |
| R-4 | **Data loss** from autosave, accept or metadata corruption. | Low | Critical | Atomic writes; pre-apply snapshot; one metadata file per document; `.corrupt-*` recovery; simulated-failure tests. |
| R-5 | **Gatekeeper**: unsigned app blocked or with an alarming warning. | High | Medium | Document the bypass in the README; `--dir` build for development; signing in v1.0; do not promise frictionless installation. |
| R-6 | **Credit cost** during development and testing. | Medium | Medium | Full mock mode by default in tests and Playwright; fixtures; context length limits; no automated test calls a real provider. |
| R-7 | **Licenses**: transitive copyleft dependency. | Low | High | Allowed list in CI; `package-lock.json` audit; OFL fonts with their license bundled. |
| R-8 | **Splitter performance** on large documents. | Medium | Medium | Measure with 200 KB; debounce; worker option if the RNF-1 threshold is exceeded. |
| R-9 | **Scope creep** (git, PDF, sync too early). | Medium | Medium | Explicit out of scope in section 5.3; changes only through the Changelog with approval. |
| R-10 | **Dependence on user credentials** for demo/QA. | Medium | Low | Mock mode + fixtures as the default QA path; document the provider requirement for real use. |

---

## 13. Dependencies and licenses

### 13.1 Runtime (main)

| Dependency | Version | License | Use |
| --- | --- | --- | --- |
| electron | 45.x | MIT | Desktop shell |
| @opencode/sdk | 2.2.3 (pinned) | MIT | Embedded agent host |

### 13.2 Renderer

| Dependency | License | Use |
| --- | --- | --- |
| react / react-dom | MIT | UI |
| zustand | MIT | State |
| @codemirror/* (v6) | MIT | Markdown editing |
| react-markdown | MIT | Render |
| remark-gfm | MIT | GFM |
| shiki | MIT | Code highlighting |
| @radix-ui/react-dropdown-menu 2.2.1 | MIT | In-app menus |
| @radix-ui/react-context-menu 2.4.1 | MIT | Tree context menu |
| lucide-react | ISC | Icons |
| diff (jsdiff) | BSD-3-Clause | Proposal diff |

### 13.3 Development

| Dependency | License | Use |
| --- | --- | --- |
| typescript | Apache-2.0 | Types |
| vite | MIT | Build |
| electron-builder | MIT | Packaging |
| vitest | MIT | Unit tests |
| @playwright/test | Apache-2.0 | E2E |
| @biomejs/biome | MIT | Lint/format |

### 13.4 Fonts

| Font | License | Use |
| --- | --- | --- |
| Lato | OFL-1.1 | UI and prose (v3 target) |
| Inter | OFL-1.1 | System fallback until the Lato migration |

### 13.5 License rules

- Allowed list: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, OFL-1.1, CC0.
- Any other license requires explicit review and written justification.
- The product is distributed under the MIT license (see `LICENSE`, holder: rainbrth).
- Font and dependency licenses are included in the distributed package.

---

## 14. Open questions

| # | Question | Impact | Suggested owner | Blocks v1 |
| --- | --- | --- | --- | --- |
| Q-1 | Should the persisted thread be resent whole to the host on restart, or is a summary enough? | Token cost and context fidelity. | Engineering (main) | No (default: summary + last N turns) |
| Q-2 | Which reference model is used for M-1? | Metric comparability. | Product | No |
| Q-3 | Do manual changes create a version on every autosave or only when the block closes (blur/file switch)? | History noise. | Product + Engineering | No (proposal: version per 5 s debounce or on block change) |
| Q-4 | Cmd+\ to collapse panels or buttons only? | Shortcut consistency. | Design | No |
| Q-5 | How is the first unsigned launch communicated to the user? | Installation friction. | Product | No |
| Q-6 | Exact default context limit (tokens/characters)? | Cost and quality. | Engineering | No |
| Q-7 | Can block remapping on heading rename be automatic or does it require confirmation? | User trust. | Product | No (proposal: automatic with notice) |
| Q-8 | How is "block not edited by hand" defined operationally for the consistency refactor? | Precision of RF-20 and M-10. | Product + Engineering | No (proposal: hash equal to the last agent or restored version) |
| Q-9 | What format does the voice profile have: structured JSON, editable Markdown or a form? | Portability and ease of editing. | Product + Design | No (proposal: form with prompt preview) |
| Q-10 | Which model summarizes the rules block and how is cost controlled? | Cost, quality and latency of RF-19. | Engineering | No |
| Q-11 | How many guidelines are needed before consolidating, and can it be forced earlier? | Noise vs. inbox usefulness. | Product | No (proposal: threshold 8, manual consolidation always available) |
| Q-12 | Is the v2 → v3 migration a direct replacement or do both themes coexist for one release? | Visual and QA risk. | Design | No (proposal: direct replacement, no alternative theme) |

---

## 15. Changelog

### v1.0.6 — 2026-11-04

- Documentation aligned with the current release and real persistence using the portable `<doc>.md.nrvn` sidecar.
- Build/dist automatically increments the patch version; `NRVN_SKIP_VERSION_BUMP=1` skips the increment.

### v1.0.0 — 2026-11-01 (release candidate)

- Updated status and §11 to distinguish closed scope from platform limitations.

### v0.1.0 — 2026-10-30

- BRD created with the full v1 scope.
- Defined 15 functional requirements (RF-1…RF-15) mapped 1:1 to 15 literal acceptance criteria
  (AC-1…AC-15).
- Defined 9 non-functional requirements (RNF-1…RNF-9).
- Documented the block model (stable key, hash, sections, ranges) and the agent contract with
  `<<<NRVN_BLOCK>>>` markers and tolerant parsing.
- Documented architecture decisions: Electron 45, React 19, TypeScript, Vite, `@opencode/sdk`
  2.2.3 embedded, `nrvn-editor` agent with no tools, persistence in `Application Support/nrvn`,
  three-panel layout, editorial typography with Inter/Newsreader.
- Established phased roadmap (v0.1, v0.2, v0.3), risks, dependencies and open questions.
- Status: v0.1.0 in development; no acceptance criteria verified yet.

### v0.1.1 — 2026-10-30 (scope decision)

- **Reinforced isolation rule:** the agent works exclusively on the active selection. The whole
  document is not sent by default; global adjustments require the explicit `Select whole
  document` action. A proposal with keys outside the selection is invalidated entirely (RF-7,
  RF-8, §8.3).
- Sending is disabled without a selection.

### v0.1.2 — 2026-10-30

v2 "Silver Lean" design system, menus, launch and icon. Scope: Loop B1 (documentation and UI;
agent integration remains pending in Loop B2).

- **v2 "Silver Lean" design system:** cool palette (bg/surface/elevated/sunken, ink and lines in
  blue-grey, accent `#5B7C99` / `#9DB8CC`), pastel accents, semantics and
  `--color-accent-text` for small AA text. Warm/terracotta palette retired. Radii 5/8/12,
  card/overlay shadows, 120/180 ms motion, 2 px accent focus + offset 2, no gradients or
  glassmorphism. Inter (UI), Newsreader (prose) and system mono.
- **Layout:** full-width 44 px draggable titlebar, macOS traffic lights (`hiddenInset`,
  `trafficLightPosition {x:16,y:15}`), `nrvn` name and save state; below, 56 px rail + tree +
  document + 380 px agent. Responsive ≥1024 / 900–1023 / <900 preserved.
- **Menus:** full native menu (`nrvn`, File, Edit, View, Window, Help) with New, Open folder…,
  Reopen recent, Save, Save as…, Copy path, Reveal in Finder, Close document, Select whole
  document, Copy Markdown, toggle, zoom, devtools and fullscreen. In-app menus with Radix
  DropdownMenu (Workspace, File, Document, Agent) and Radix context menu on the tree (Open,
  Reveal in Finder, Copy path).
- **Launch:** new empty untitled document in Render with "Start writing…" placeholder and "Edit
  in Markdown" CTA; workspace and tree are not reopened. `Draft` in the titlebar. Cmd+S without
  a title opens "Save as…"; "Reopen recent" only from the menu.
- **Selection:** bar with `padding-inline: 14px`, pastel band + 2 px inner bar; in Markdown
  `cm-block-selected` with band + bar and `--color-selection-text`; keyboard focus keeps its
  ring.
- **Icon:** `build/icon.icns` and `build/icon.png` wired into electron-builder (`mac.icon`) and
  the Dock in development; `README.md` as `extraResources` for Help.
- **Bugs fixed:** double dialog when opening a folder from the native menu; `copy-path` /
  `reveal-path` commands; `#heading:0` outside the main view; duplicated file name; tooltip on
  rail icons.
- **Tests:** 67 unit tests (12 files), 1 isolated performance test in `tests/perf/`
  (`npm run test:perf`) and 2 E2E flows (`editor.spec.ts`, `loop-b1.spec.ts`) with 1400×900
  screenshots in `docs/assets/screenshots/v090/`. `npm run dist` runs at loop close.
- **Pending:** OpenCode integration, `nrvn-editor` agent, streaming, diff, versions and comments
  (Loop B2).

### v0.1.3 — 2026-10-30 (documentation evolution)

Documentation block: product vision, v3 design, i18n and phased scope. **No code changes**:
v0.1.2 remains the real state.

- **Vision and principles:** isolated iteration, persistent voice, focus sessions, guidelines
  inbox, consistency refactor, per-block versioning, anchored comments and local-first (§1.1,
  §1.2).
- **Users:** added PM/writer drafting with AI, technical editor and reviewer; new use cases
  UC-7…UC-10 (§3).
- **Metrics:** added M-8 (time to iterate a block), M-9 (proposals without rework), M-10
  (reduction of whole-document rewrites), M-11 (voice consistency) and M-12 (guidelines
  retention). M-6 moves to 22 criteria (§4).
- **Scope:** restructured into v0.1.x / v0.2 / v0.3 / v1.0; added full word processor, image
  generation and general-purpose chat as out of scope (§5).
- **New requirements:** RF-16 voice profile, RF-17 focus session, RF-18 guidelines inbox, RF-19
  rules block summary, RF-20 refactor of non-edited blocks, RF-21 ES/EN i18n and RF-22 language
  selector; with AC-16…AC-22 and an updated matrix (§6).
- **New non-functional requirements:** RNF-10 i18n, RNF-11 local-first offline and RNF-12
  privacy of the voice profile and guidelines (§7).
- **v3 "Moon Silver / Pearl Grey" design:** Mist/Moon Silver palette, Lato typography
  (Newsreader retired), radii, shadows, motion, focus and components. Marked as the immediate
  target; code still on v2 (§10, `docs/design-system.md`).
- **Persistence:** added `voice.json`, `guidelines.jsonl`, `rules/` and `focus.json` (§9.4).
- **Roadmap:** aligned with v0.1.x / v0.2 / v0.3 / v1.0 (§11); signing, Windows/Linux and
  optional sync move to v1.0.
- **Bilingual documentation:** `README.md` / `README.es.md` and `BRD.md` / `BRD.en.md` with
  cross-links; new `docs/design-system.md` / `docs/design-system.es.md`. Author: rainbrth.
- **Open questions:** Q-8…Q-12 (definition of "not edited by hand", voice profile format,
  summary model, guidelines threshold, v2 → v3 migration).
- **Status:** real v0.1.2; the agent layer (OpenCode, proposals, versions, comments) remains
  pending in Loop B2. i18n and v3 are planned work, not implemented.

### v0.1.4 — 2026-10-31 (vision, honesty and B3 status)

Documentation and positioning update. It changes no code and does not expand approved scope: it
orders the authorship vision and corrects the real state.

- **Authorship vision:** expanded §1.1 and new §1.3 "Real state and honesty". nrvn is defined as a
  tool to **review without giving up**, not to produce dumps; area memory, human edit lock, global
  coherence, conceptual context, multi-source generation and exportable provenance are direction,
  not state.
- **Explicit warning:** personal tool, MIT and 100% built with AI; AI accelerates but can erode
  trust and authorship; it does not remove bias or guarantee quality.
- **Product article:** new `docs/editor-agentico.en.md` and `docs/editor-agentico.md` with
  cross-links and a "Honesty and limits" section.
- **Roadmap:** new "Editor Agentico — writing and reviewing with agents" block with `EA-*` IDs,
  P1–P3 priorities, dependencies and acceptance signals; deferred decisions D-7…D-10 and v0.4
  milestone.
- **Historical corrected status:** at that review, implemented or in validation: editor, selection, white
  sheet with Lato, line numbers in Markdown, post-it, local/embedded OpenCode connectors, OpenCode
  Console OAuth and proposals. Still not implemented: guidelines, rules bank, consistency
  refactor, document versioning, conceptual context and multi-source generation.
- **Bilingual README:** status, vision and links to `docs/editor-agentico.*` and `ROADMAP.*`; the
  agent panel is no longer described as a "shell".

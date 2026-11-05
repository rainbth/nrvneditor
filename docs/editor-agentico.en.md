# Editor Agentico — writing and reviewing with agents without losing authorship

[English](editor-agentico.en.md) | [Español](editor-agentico.md)

**Author:** rainbrth · **Date:** 2026-11-04 · **Status:** v1.0.6 · **License:** MIT (open source)

This article explains nrvn's product vision. It is not a feature list or a release promise. The
real state of each capability lives in the [roadmap](../ROADMAP.en.md); verifiable requirements
live in the [BRD](../BRD.en.md).

---

The patch version is bumped automatically during `prebuild`/`predist`; set `NRVN_SKIP_VERSION_BUMP=1` to skip it.

## 1. The problem: we write a lot with AI and review less and less

Today we write a lot with AI. Work has accelerated and we have delegated a large part of the human
task to agents. As a PM, I am increasingly frustrated by having to modulate my tone of voice for
the AI, telling it "this yes" and "this no" on every request. More and more people give up on
reviewing: long documents are created that nobody reads because they know they were produced
artificially and may change entirely tomorrow.

But at the same time, I increasingly need to review generated documents. AI can learn your tone,
your way of expressing yourself and your length, and still fail at expressing an idea or concept
the way you want. The structure may be fine and yet I have to go section by section touching
things. And by doing so I lose the ability to iterate at the whole-document level: the document
stops being a system and becomes a sum of patches.

The question that orders the product is: **how do I use AI's abilities in my favor and not against
me?**

## 2. The idea: an editor for writing and reviewing, not for dumping text

I imagined the tool that would make my writing and reviewing work easier, and that is why I built
my editor. It is not another long chat or a document generator. It is a surface where the agent
works on specific parts of the text, keeps the reason behind each decision, and gives me back
control of the narrative.

The important difference is not "writing faster". It is **being able to review without giving up**.
An AI-assisted document is only useful if I can walk through it, understand it, change it and
defend it as mine. nrvn exists for that: to reduce the friction of reviewing, not to produce more
text.

## 3. Product principles

1. **The unit of work is the area, not the document.** A block, a section, a range. The agent
   receives that area and its history; the whole document is used only when explicitly requested.
2. **A human decision is an asset.** When I decide "this section uses first person because the
   reader is a committee", that reason must survive the next edit. I do not want to explain it
   again on every request.
3. **Context matters as much as text.** A section is not understood on its own: it depends on what
   was promised before, what contradicts it later and the concept that runs through the document.
4. **The agent proposes; the person decides.** Nothing applies itself. Proposals are shown as
   deltas and are accepted, rejected or sent back for changes.
5. **Provenance is part of the document.** Knowing what a person wrote, what an agent generated
   and what was accepted is not decorative metadata: it is what makes the text trustworthy.
6. **Honesty over illusion.** If the product cannot guarantee something, it says so. It does not
   simulate human authorship or promise automatic quality.

## 4. Capabilities we want to build

The vision is organized into small, iterable, verifiable deltas. Details, dependencies and
acceptance signals live in the **"Editor Agentico"** block of the
[roadmap](../ROADMAP.en.md#editor-agentico--writing-and-reviewing-with-agents).

### 4.1 Iterating by area, with memory

Editing pieces: selecting a section, a paragraph or a block and iterating only there. That area's
context is kept. My agent knows **why** that section is the way it is, even when I edit it again or
ask for a global pass. Human edits remain as a principle or guide.

This includes:

- **Area memory:** human decisions, instructions and the "why it is like this", visible in the
  panel and present in that area's prompt.
- **Human edit lock:** marking a block as "do not touch" or "suggestions only" so no global pass
  modifies it.
- **Focus sessions:** fixing an area of work for a while, with history and an explicit "closed"
  criterion.

### 4.2 Knowing how a section affects the rest

A section can be well written and still break the document. I want the agent to be able to:

- check how the section fits the whole: duplications, contradictions, tone and unfulfilled
  promises;
- propose **deltas**, not full rewrites;
- show conceptually related sections in context, explaining the relationship;
- suggest variations, improvements and open questions per block, without rewriting on its own.

### 4.3 Generating from multiple sources without losing traceability

Generating a draft or content from multiple sources. Import two to five sources (Markdown, URL or
text), extract an outline, generate a draft with citations and provenance, and mark each block as
generated. Every claim should be traceable to a source or a human decision.

### 4.4 Turning corrections into rules

An instruction inbox, consolidation into a rules block and controlled application to blocks that
were not manually edited. The rule does not replace the person: it makes the person scalable.

### 4.5 Provenance, risk and honesty

- Mark generated, rewritten or accepted content, with AI authorship metadata.
- Export while preserving provenance.
- Detect claims without a source, invented data, commitments or promises and contradictions.
- Never simulate human authorship.

## 5. Honesty and limits

This section separates vision from real state. It is the most important part of the article.

### 5.1 Explicit warning

nrvn is a **personal tool**, published under the **MIT license** (source available) and **100% built with AI**. That
warning is not a legal detail: it describes the project. There is no team behind it and no support
commitment; there is one person iterating on a tool they need and leaving the code open for anyone
who wants to use or audit it.

### 5.2 What exists today

As of this document (v1.0.6, 2026-11-04), these are implemented:

| Capability | Status | What it means |
| --- | --- | --- |
| Markdown editor with white sheet and GFM render | Implemented | Read and edit without a permanent code view. |
| Block, section and range selection | Implemented | The unit of work exists and is visible. |
| White sheet, Lato and line numbers in Markdown | Implemented | The v3 editorial look is applied to the real document. |
| "Editor Agentico" post-it on an empty document | Implemented | A welcome note dismissed per document. |
| Embedded and local OpenCode connector | Implemented / in validation | The agent runs inside the app or against a local instance. |
| OpenCode Console OAuth | In validation | Device flow to connect an account and providers; validated against code and mock, not the real provider. |
| Per-block proposals with diff and human decision | In validation | The agent proposes and the person accepts, rejects or asks for changes. |
| Explicit whole-document context | In validation | The whole document can be worked on when the user asks for it. |
| Anchored comments and critiques/audiences | Implemented | Review annotations and audience/persona features are available in the app. |
| Variant from review | Implemented | Generates a proposal that addresses an existing critique; there are no free-form variants by axes (V-01…V-07). |
| Language copies | Implemented | Sibling files per language with per-block synchronization; this is not UI i18n. |

### 5.3 What does not exist yet

These are not implemented and **must not be presented as facts**:

- free-form variants by axes (length, detail, tone, structure, examples, audience, free);
- guidelines and the rules bank;
- consistency refactor;
- document versioning and version comparison;
- related conceptual context;
- multi-source generation;
- area memory, human edit lock and per-block suggestions;
- risk review and claim → source traceability;
- export that preserves provenance.

There is also no signed or notarized downloadable release, and no public metrics. The BRD numbers
are release targets, not results.

### 5.4 What the product does not promise

- **It does not remove bias.** An agent can reproduce the bias of its sources and instructions.
  nrvn can make it visible and arguable; it cannot make it disappear.
- **It does not guarantee quality.** It can reduce friction, organize decisions and preserve the
  why. Quality still depends on the person reviewing.
- **It does not produce dumps.** If the result is a long document nobody reads, the product has
  failed, even if the text is correct.
- **It does not replace authorship.** AI accelerates, but it can also erode trust and authorship.
  nrvn exists to keep human control of the narrative, not to surrender it.

## 6. How it fits the rest of the documentation

- [README](../README.md): what nrvn is and what is available today.
- [Roadmap](../ROADMAP.en.md): priorities, dependencies, statuses and acceptance signals.
- [BRD](../BRD.en.md): scope, verifiable requirements and acceptance criteria.
- [Design system](../docs/design-system.md): the product's visual surface.

The rule is simple: if a capability is not in the roadmap with an acceptance signal, it is not
committed; if it is not in the BRD, it is not approved. This article describes direction, not
state.

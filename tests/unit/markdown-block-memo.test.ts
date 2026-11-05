import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/ipc", () => ({ nrvn: {} }));

import { areMarkdownBlockPropsEqual } from "../../src/components/render/MarkdownBlock";
import { splitBlocks } from "../../src/lib/blocks";

describe("areMarkdownBlockPropsEqual", () => {
  const block = splitBlocks("A paragraph")[0];
  const props = { block, index: 0, selected: false, active: false, isLast: true, commentCount: 0 };

  it("ignora igualdad del raw cuando cambia selección", () => {
    expect(areMarkdownBlockPropsEqual(props, { ...props, selected: true })).toBe(false);
  });

  it("acepta props iguales y detecta cambios de conteo", () => {
    expect(areMarkdownBlockPropsEqual(props, { ...props })).toBe(true);
    expect(areMarkdownBlockPropsEqual(props, { ...props, commentCount: 1 })).toBe(false);
  });

  it("compara los valores del bloque, no su identidad", () => {
    const otherBlock = splitBlocks("A paragraph")[0];
    expect(otherBlock).not.toBe(block);
    expect(areMarkdownBlockPropsEqual(props, { ...props, block: otherBlock })).toBe(true);
  });

  it("detecta cambios en cada campo que afecta a la salida", () => {
    const changedProps = [
      { ...props, block: { ...block, key: "other" } },
      { ...props, block: { ...block, type: "heading" as const } },
      { ...props, block: { ...block, level: 1 } },
      { ...props, block: { ...block, startLine: block.startLine + 1 } },
      { ...props, block: { ...block, endLine: block.endLine + 1 } },
      { ...props, block: { ...block, raw: "other raw" } },
      { ...props, block: { ...block, hash: "other hash" } },
      { ...props, block: { ...block, pending: true } },
      { ...props, block: { ...block, anchorKey: "other anchor" } },
      { ...props, index: 1 },
      { ...props, selected: true },
      { ...props, active: true },
      { ...props, isLast: false },
      {
        ...props,
        preview: {
          blockKey: block.key,
          original: "old",
          proposed: "new",
          source: "chat" as const,
          proposalId: "p",
        },
      },
      { ...props, commentCount: 1 },
    ];
    for (const changed of changedProps) {
      expect(areMarkdownBlockPropsEqual(props, changed)).toBe(false);
    }
  });

  it("ignora campos del bloque que no afectan al render", () => {
    const unrelatedBlock = {
      ...block,
      headingPath: ["other path"],
      ordinal: block.ordinal + 1,
      startOffset: block.startOffset + 1,
      endOffset: block.endOffset + 1,
    };
    expect(areMarkdownBlockPropsEqual(props, { ...props, block: unrelatedBlock })).toBe(true);
  });
});

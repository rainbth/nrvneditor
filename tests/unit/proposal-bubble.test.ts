import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/ipc", () => ({
  nrvn: {
    app: { openExternal: async () => true },
    agent: {},
    settings: { patch: async () => ({}) },
  },
}));

import type { AgentProposal } from "../../electron/types";
import type { Block } from "../../src/lib/blocks";
import { resolveProposalAnchorKey } from "../../src/lib/proposal";

const proposal: AgentProposal = {
  id: "p1",
  createdAt: 0,
  prompt: "",
  kind: "blocks",
  document: null,
  blocks: [
    { key: "b", before: "antes", after: "después" },
    { key: "c", before: "", after: "" },
  ],
};
const blocks = [{ key: "a" }, { key: "b" }, { key: "c" }] as Block[];

describe("resolveProposalAnchorKey", () => {
  it("elige primero un bloque seleccionado que pertenece a la propuesta", () => {
    expect(resolveProposalAnchorKey(proposal, blocks, [0, 2])).toBe("c");
  });
  it("usa la primera clave presente, y devuelve null para documento o sin coincidencia", () => {
    expect(resolveProposalAnchorKey(proposal, blocks, [])).toBe("b");
    expect(resolveProposalAnchorKey({ ...proposal, kind: "document" }, blocks, [])).toBeNull();
    expect(
      resolveProposalAnchorKey(
        { ...proposal, blocks: [{ key: "x", before: "", after: "" }] },
        blocks,
        [],
      ),
    ).toBeNull();
  });
});

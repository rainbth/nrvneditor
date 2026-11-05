import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/ipc", () => ({
  nrvn: {
    app: { openExternal: async () => true },
    agent: {},
    settings: { patch: async () => ({}) },
  },
}));

import { diffRows } from "../../src/components/agent/ProposalCard";

describe("diffRows", () => {
  it("no marca todo como cambiado si before y after solo difieren en EOL", () => {
    const before = "uno\r\ndos\r\ntres\r\n";
    const after = "uno\ndos\ntres\n";
    const rows = diffRows(before, after);

    expect(rows.some((row) => row.kind === "add")).toBe(false);
    expect(rows.some((row) => row.kind === "del")).toBe(false);
    expect(rows.map((row) => row.text)).toEqual(["uno", "dos", "tres"]);
  });

  it("marca solo la línea modificada", () => {
    const rows = diffRows("uno\ndos\n", "uno\nDOS\n");
    expect(rows.filter((row) => row.kind === "del").map((row) => row.text)).toEqual(["dos"]);
    expect(rows.filter((row) => row.kind === "add").map((row) => row.text)).toEqual(["DOS"]);
  });
});

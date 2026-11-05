import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  saveBlockVersions: vi.fn(async () => undefined),
  load: vi.fn(async () => ({
    exists: false,
    history: [],
    comments: [],
    critiques: [],
    blockVersions: [],
  })),
  appendHistory: vi.fn(async () => undefined),
  saveComments: vi.fn(async () => undefined),
  saveCritiques: vi.fn(async () => undefined),
}));

vi.mock("../../src/lib/ipc", () => ({
  nrvn: { annotations: persistence },
}));

import type { BlockVersion } from "../../electron/types";
import { useAnnotationsStore } from "../../src/store/annotations";

const version = (id: string, blockKey = "a"): BlockVersion => ({
  id,
  blockKey,
  raw: id,
  createdAt: Number(id.replace(/\D/g, "")) || 1,
  source: "chat",
});

beforeEach(() => {
  useAnnotationsStore.setState({ docKey: "doc.md", blockVersions: [] });
  persistence.saveBlockVersions.mockClear();
  persistence.load.mockReset();
  persistence.load.mockResolvedValue({
    exists: false,
    history: [],
    comments: [],
    critiques: [],
    blockVersions: [],
  });
});

describe("block versions", () => {
  it("caps versions at 10 per block and persists", () => {
    for (let i = 1; i <= 12; i += 1)
      useAnnotationsStore.getState().addBlockVersion("a", `v${i}`, "chat");

    const versions = useAnnotationsStore
      .getState()
      .blockVersions.filter((item) => item.blockKey === "a");
    expect(versions).toHaveLength(10);
    expect(versions[0]?.raw).toBe("v3");
    expect(versions.at(-1)?.raw).toBe("v12");
    expect(persistence.saveBlockVersions).toHaveBeenCalled();
  });

  it("deduplicates consecutive identical raw values", () => {
    useAnnotationsStore.getState().addBlockVersion("a", "same", "chat");
    useAnnotationsStore.getState().addBlockVersion("a", "same", "chat");
    expect(useAnnotationsStore.getState().blockVersions).toHaveLength(1);
  });

  it("does not evict versions belonging to other blocks", () => {
    for (let i = 1; i <= 11; i += 1)
      useAnnotationsStore.getState().addBlockVersion("a", `a${i}`, "chat");
    for (let i = 1; i <= 2; i += 1)
      useAnnotationsStore.getState().addBlockVersion("b", `b${i}`, "chat");
    const versions = useAnnotationsStore.getState().blockVersions;
    expect(versions.filter((item) => item.blockKey === "a")).toHaveLength(10);
    expect(versions.filter((item) => item.blockKey === "b")).toHaveLength(2);
  });

  it("rekeys and deletes versions in one persisted sync", () => {
    useAnnotationsStore.setState({ blockVersions: [version("to-move"), version("old", "old")] });
    useAnnotationsStore.getState().syncBlockVersionKeys({ a: "to" }, ["old"]);
    expect(useAnnotationsStore.getState().blockVersions.map((item) => item.blockKey)).toEqual([
      "to",
    ]);
    expect(persistence.saveBlockVersions).toHaveBeenCalledTimes(1);
  });

  it("prunes loaded versions to the newest ten for each block", async () => {
    persistence.load.mockResolvedValue({
      exists: true,
      history: [],
      comments: [],
      critiques: [],
      blockVersions: Array.from({ length: 12 }, (_, i) => version(`v${i + 1}`)),
    });
    await useAnnotationsStore.getState().loadForDocument("doc.md", true);
    const versions = useAnnotationsStore.getState().blockVersions;
    expect(versions).toHaveLength(10);
    expect(versions[0]?.raw).toBe("v3");
    expect(versions.at(-1)?.raw).toBe("v12");
  });
});

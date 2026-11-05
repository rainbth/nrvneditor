import { beforeEach, describe, expect, it, vi } from "vitest";

const { readDocument, writeDocument } = vi.hoisted(() => ({
  readDocument: vi.fn(),
  writeDocument: vi.fn(),
}));
vi.mock("../../src/lib/ipc", () => ({
  nrvn: { workspace: { readDocument, writeDocument } },
}));

import { useDocumentStore } from "../../src/store/document";

describe("external document conflicts", () => {
  beforeEach(() => {
    useDocumentStore.getState().newDocument();
    readDocument.mockReset();
    writeDocument.mockReset();
  });
  it("blocks silent writes and supports overwrite/reload resolution", async () => {
    useDocumentStore.setState({
      path: "a",
      localId: "a",
      content: "local",
      original: "old",
      dirty: true,
    });
    useDocumentStore.getState().noteExternalChange("external");
    expect(await useDocumentStore.getState().save()).toBe(false);
    expect(writeDocument).not.toHaveBeenCalled();
    writeDocument.mockResolvedValueOnce({ ok: true, hash: "written" });
    await useDocumentStore.getState().resolveExternalChange("overwrite");
    expect(writeDocument).toHaveBeenCalledWith("a", "local");
    useDocumentStore.setState({ dirty: true });
    useDocumentStore.getState().noteExternalChange("external-2");
    expect(await useDocumentStore.getState().save()).toBe(false);
    expect(writeDocument).toHaveBeenCalledTimes(1);
    readDocument.mockResolvedValueOnce({ content: "disk" });
    await useDocumentStore.getState().resolveExternalChange("reload");
    expect(useDocumentStore.getState()).toMatchObject({
      externalChange: null,
      content: "disk",
      dirty: false,
    });
  });
});

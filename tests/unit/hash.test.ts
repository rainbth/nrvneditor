import { describe, expect, it } from "vitest";
import { hashBlock, normalizeForHash, sha256Hex } from "../../src/lib/hash";

describe("sha256Hex", () => {
  it("vector vacío", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("vector abc", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("vector quick brown fox", () => {
    expect(sha256Hex("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });
});

describe("hashBlock", () => {
  it("normaliza CRLF y espacios finales antes de hashear", () => {
    expect(normalizeForHash("a  \r\nb\t\r\n")).toBe("a\nb");
    expect(hashBlock("a\r\nb   ")).toBe(hashBlock("a\nb"));
  });

  it("devuelve 12 hex minúsculas", () => {
    expect(hashBlock("hola")).toMatch(/^[0-9a-f]{12}$/);
  });
});

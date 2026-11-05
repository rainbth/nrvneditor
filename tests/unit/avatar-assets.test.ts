import { describe, expect, it } from "vitest";
import { AUDIENCES } from "../../src/lib/audiences";
import { AVATAR_IDS, audienceImageUrl } from "../../src/lib/avatar-assets";

describe("audience avatar assets", () => {
  it("maps the seven reviewer ids and legacy aliases to PNG assets", () => {
    const audienceIds = AUDIENCES.map(({ id }) => id);
    expect(AVATAR_IDS).toContain("director");
    expect(AVATAR_IDS).toContain("ejecutivo");
    expect(AVATAR_IDS).toContain("par");
    expect(AVATAR_IDS).toContain("pm");
    expect(AVATAR_IDS).toContain("cliente-esceptico");
    expect(AVATAR_IDS).toContain("lector-tecnico");
    expect(AVATAR_IDS).toContain("editor");
    for (const id of audienceIds) {
      const url = audienceImageUrl(id);
      expect(url).toBeTruthy();
      expect(url?.split("?")[0]).toMatch(/\.png$/);
    }
    for (const alias of ["publico-general", "docente", "desarrollador", "producto"]) {
      expect(audienceImageUrl(alias)?.split("?")[0]).toMatch(/\.png$/);
    }
    expect(AVATAR_IDS).toHaveLength(7);
  });

  it("returns null for unknown or absent ids", () => {
    expect(audienceImageUrl("inexistente")).toBeNull();
    expect(audienceImageUrl(null)).toBeNull();
    expect(audienceImageUrl(undefined)).toBeNull();
  });
});

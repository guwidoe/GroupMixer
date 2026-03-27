import { describe, expect, it } from "vitest";
import { isRenderableModelContentType, resolvePublicAssetUrl } from "./modelAssets";

describe("modelAssets", () => {
  it("resolves public asset URLs against the app base path", () => {
    expect(resolvePublicAssetUrl("models/character.glb", "/")).toBe("/models/character.glb");
    expect(resolvePublicAssetUrl("/models/character.glb", "/groupmixer/")).toBe(
      "/groupmixer/models/character.glb"
    );
  });

  it("treats html and json responses as non-renderable model assets", () => {
    expect(isRenderableModelContentType("model/gltf-binary")).toBe(true);
    expect(isRenderableModelContentType("application/octet-stream")).toBe(true);
    expect(isRenderableModelContentType("text/html; charset=utf-8")).toBe(false);
    expect(isRenderableModelContentType("application/json")).toBe(false);
    expect(isRenderableModelContentType(null)).toBe(true);
  });
});

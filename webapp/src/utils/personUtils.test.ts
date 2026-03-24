import { describe, expect, it } from "vitest";
import { getPersonDisplayName } from "./personUtils";

describe("getPersonDisplayName", () => {
  it("prefers the case-insensitive name attribute", () => {
    expect(
      getPersonDisplayName({
        id: "p1",
        attributes: { Name: "Alice" },
      })
    ).toBe("Alice");
  });

  it("falls back to the person id when no name attribute exists", () => {
    expect(
      getPersonDisplayName({
        id: "p2",
        attributes: { team: "A" },
      })
    ).toBe("p2");
  });
});

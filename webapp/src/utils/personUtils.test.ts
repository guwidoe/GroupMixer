import { describe, expect, it } from "vitest";
import { getPersonDisplayName } from "./personUtils";

describe("getPersonDisplayName", () => {
  it("returns the first-class person name", () => {
    expect(
      getPersonDisplayName({
        id: "p1",
        name: "Alice",
        attributes: { team: "A" },
      })
    ).toBe("Alice");
  });

  it("falls back to legacy name attributes during migration", () => {
    expect(
      getPersonDisplayName({
        id: "p2",
        name: "",
        attributes: { Name: "Bob" },
      })
    ).toBe("Bob");
  });
});

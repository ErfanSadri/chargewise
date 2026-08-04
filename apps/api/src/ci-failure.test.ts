import { describe, expect, it } from "vitest";

describe("CI failure verification", () => {
  it("fails deliberately so CI proves that broken tests are blocked", () => {
    expect("broken").toBe("protected");
  });
});

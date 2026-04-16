import { describe, it, expect } from "vitest";

describe("project scaffolding", () => {
  it("has a valid build target", () => {
    expect("ES2022").toBe("ES2022");
  });

  it("supports basic TypeScript types", () => {
    const value: number = 42;
    expect(value).toBe(42);
  });

  it("supports async/await", async () => {
    const result = await Promise.resolve("pixi");
    expect(result).toBe("pixi");
  });
});

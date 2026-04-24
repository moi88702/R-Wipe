import { describe, expect, it } from "vitest";
import { layoutBlueprint, previewSocketWorld } from "./geometry";
import type { Blueprint } from "../../types/shipBuilder";

describe("layoutBlueprint", () => {
  it("places the root core at the origin", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-starter", parentId: null, parentSocketId: null, colourId: null },
      ],
    };
    const L = layoutBlueprint(bp);
    expect(L.placements).toHaveLength(1);
    expect(L.placements[0]!.worldX).toBe(0);
    expect(L.placements[0]!.worldY).toBe(0);
  });

  it("places children at their parent socket offsets", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-mid", parentId: null, parentSocketId: null, colourId: null },
        { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
      ],
    };
    const L = layoutBlueprint(bp);
    const hull = L.placements.find((p) => p.placed.id === "hull")!;
    // s-hull socket on core-mid is at (0, 0).
    expect(hull.worldX).toBe(0);
    expect(hull.worldY).toBe(0);
  });

  it("computes an AABB covering every placed part", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-mid", parentId: null, parentSocketId: null, colourId: null },
        { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
      ],
    };
    const L = layoutBlueprint(bp);
    // Hull is 28×22 centred at (0,0) → bbox should match at least 28×22.
    expect(L.bbox.width).toBeGreaterThanOrEqual(28);
    expect(L.bbox.height).toBeGreaterThanOrEqual(22);
  });

  it("returns an empty layout when there's no root", () => {
    const L = layoutBlueprint({ id: "e", name: "e", parts: [] });
    expect(L.placements).toHaveLength(0);
    expect(L.bbox.width).toBe(0);
  });
});

describe("previewSocketWorld", () => {
  it("returns the world position a child would occupy", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-mid", parentId: null, parentSocketId: null, colourId: null },
        { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
      ],
    };
    const L = layoutBlueprint(bp);
    // hull-starter's s-nose is at (+12, 0) relative to hull centre, which is at
    // (0, 0) world.
    const pos = previewSocketWorld(L, "hull", "s-nose");
    expect(pos).toEqual({ x: 12, y: 0 });
  });

  it("returns null for unknown parent or socket", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-starter", parentId: null, parentSocketId: null, colourId: null },
      ],
    };
    const L = layoutBlueprint(bp);
    expect(previewSocketWorld(L, "nope", "s-hull")).toBeNull();
    expect(previewSocketWorld(L, "core", "s-unknown")).toBeNull();
  });
});

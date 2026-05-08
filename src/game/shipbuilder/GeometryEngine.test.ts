import { describe, it, expect } from "vitest";
import { GeometryEngine } from "./GeometryEngine";
import { SolarModuleRegistry } from "../data/SolarModuleRegistry";
import type { SolarShipBlueprint } from "../../types/solarShipBuilder";

// ── Helpers ───────────────────────────────────────────────────────────────────

function coreOnlyBlueprint(coreSideCount = 6): SolarShipBlueprint {
  return {
    id: "test-bp",
    name: "Test",
    sizeClass: 1,
    coreSideCount,
    modules: [
      { placedId: "core", moduleDefId: "core-c1-balanced", parentPlacedId: null, parentSideIndex: null, ownSideIndex: null },
    ],
  };
}

const defs = SolarModuleRegistry.getModuleMap();

// ── Primitive math ────────────────────────────────────────────────────────────

describe("GeometryEngine.circumradius", () => {
  it("equilateral triangle: R = S / √3", () => {
    // circumradius of eq. triangle = S / (2·sin(60°)) = S / √3
    expect(GeometryEngine.circumradius(3, 60)).toBeCloseTo(60 / Math.sqrt(3), 5);
  });

  it("square: R = S·√2 / 2", () => {
    expect(GeometryEngine.circumradius(4, 60)).toBeCloseTo((60 * Math.SQRT2) / 2, 5);
  });

  it("hexagon: R = S", () => {
    expect(GeometryEngine.circumradius(6, 60)).toBeCloseTo(60, 5);
  });
});

describe("GeometryEngine.apothem", () => {
  it("square: apothem = S / 2", () => {
    expect(GeometryEngine.apothem(4, 60)).toBeCloseTo(30, 5);
  });

  it("equilateral triangle: apothem = S / (2·√3)", () => {
    expect(GeometryEngine.apothem(3, 60)).toBeCloseTo(60 / (2 * Math.sqrt(3)), 5);
  });

  it("hexagon: apothem = S·√3 / 2", () => {
    expect(GeometryEngine.apothem(6, 60)).toBeCloseTo((60 * Math.sqrt(3)) / 2, 5);
  });
});

// ── buildVertices ─────────────────────────────────────────────────────────────

describe("GeometryEngine.buildVertices", () => {
  it("returns N vertices for an N-gon", () => {
    expect(GeometryEngine.buildVertices(6, 60, 0, 0, 0)).toHaveLength(6);
    expect(GeometryEngine.buildVertices(3, 60, 0, 0, 0)).toHaveLength(3);
  });

  it("hexagon at origin, rotation 0: vertex 0 is on the +x axis", () => {
    const verts = GeometryEngine.buildVertices(6, 60, 0, 0, 0);
    expect(verts[0]!.x).toBeCloseTo(60, 4);
    expect(verts[0]!.y).toBeCloseTo(0, 4);
  });

  it("all vertices are circumradius away from center", () => {
    const R = GeometryEngine.circumradius(5, 60);
    const verts = GeometryEngine.buildVertices(5, 60, 10, 20, 0.3);
    for (const v of verts) {
      expect(Math.hypot(v.x - 10, v.y - 20)).toBeCloseTo(R, 4);
    }
  });

  it("adjacent vertices are sideLengthPx apart", () => {
    const verts = GeometryEngine.buildVertices(6, 60, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = verts[i]!;
      const b = verts[(i + 1) % 6]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(60, 4);
    }
  });
});

// ── Core-only blueprint geometry ──────────────────────────────────────────────

describe("GeometryEngine.deriveAllGeometries — core only", () => {
  it("core is placed at (0, 0) with rotation 0", () => {
    const geoms = GeometryEngine.deriveAllGeometries(
      coreOnlyBlueprint(6).modules, defs, 6,
    );
    const core = geoms.get("core")!;
    expect(core.worldX).toBeCloseTo(0, 5);
    expect(core.worldY).toBeCloseTo(0, 5);
    expect(core.rotationRad).toBeCloseTo(0, 5);
  });

  it("6-sided core has 6 sides, all as open attachment points", () => {
    const geoms = GeometryEngine.deriveAllGeometries(
      coreOnlyBlueprint(6).modules, defs, 6,
    );
    const core = geoms.get("core")!;
    expect(core.sides).toHaveLength(6);
    for (const s of core.sides) {
      expect(s.isAttachmentPoint).toBe(true);
      expect(s.isOccupied).toBe(false);
    }
  });

  it("3-sided core has 3 sides", () => {
    const geoms = GeometryEngine.deriveAllGeometries(
      coreOnlyBlueprint(3).modules, defs, 3,
    );
    expect(geoms.get("core")!.sides).toHaveLength(3);
  });
});

// ── Two-module blueprint geometry ─────────────────────────────────────────────

describe("GeometryEngine.deriveAllGeometries — core + child", () => {
  function twoModuleBp(): SolarShipBlueprint {
    return {
      id: "test",
      name: "Test",
      sizeClass: 1,
      coreSideCount: 6,
      modules: [
        { placedId: "core", moduleDefId: "core-c1-balanced", parentPlacedId: null, parentSideIndex: null, ownSideIndex: null },
        { placedId: "w1",   moduleDefId: "weapon-cannon-c1",  parentPlacedId: "core", parentSideIndex: 0, ownSideIndex: null as unknown as number },
      ],
    };
  }

  // We need to let the engine compute ownSideIndex. Simulate BlueprintEngine.placeModule.
  it("child center is apothem-distance from core's side-0 midpoint", () => {
    // Manually compute the expected child transform
    const coreSideCount = 6;
    const childDef = defs.get("weapon-cannon-c1")!;
    const bp = coreOnlyBlueprint(coreSideCount);
    const geoms = GeometryEngine.deriveAllGeometries(bp.modules, defs, coreSideCount);
    const coreGeom = geoms.get("core")!;
    const side0 = coreGeom.sides[0]!;
    const α = side0.normalAngle;

    const childN = childDef.shape.sides; // 3
    const childS = childDef.shape.sideLengthPx; // 60
    const a = GeometryEngine.apothem(childN, childS);

    const expectedX = side0.midX + a * Math.cos(α);
    const expectedY = side0.midY + a * Math.sin(α);

    // Compute snap transform (does not require placing)
    const sp = {
      ownerPlacedId: "core",
      sideIndex: 0,
      worldX: side0.midX,
      worldY: side0.midY,
      normalAngle: α,
      sizeClass: 1 as const,
    };
    const transform = GeometryEngine.computeSnapTransform(childDef, sp, coreSideCount)!;

    expect(transform.worldX).toBeCloseTo(expectedX, 4);
    expect(transform.worldY).toBeCloseTo(expectedY, 4);
  });

  it("child's ownSide outward normal points toward parent (angle = α + π)", () => {
    const coreSideCount = 6;
    const childDef = defs.get("weapon-cannon-c1")!;
    const coreGeom = GeometryEngine.deriveAllGeometries(
      coreOnlyBlueprint(coreSideCount).modules, defs, coreSideCount,
    ).get("core")!;
    const side0 = coreGeom.sides[0]!;
    const α = side0.normalAngle;

    const sp = {
      ownerPlacedId: "core", sideIndex: 0,
      worldX: side0.midX, worldY: side0.midY,
      normalAngle: α, sizeClass: 1 as const,
    };
    const transform = GeometryEngine.computeSnapTransform(childDef, sp, coreSideCount)!;
    const j = transform.ownSideIndex;
    const N = childDef.shape.sides;

    // Side j outward normal at child rotation:
    const childNormal = transform.rotationRad + j * (2 * Math.PI / N) + Math.PI / N;
    // Normalise and compare to α + π
    const diff = Math.abs(((childNormal - (α + Math.PI)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
    // diff should be 0 or very close (mod 2π)
    expect(Math.min(diff, 2 * Math.PI - diff)).toBeCloseTo(0, 3);
  });
});

// ── Snap points ───────────────────────────────────────────────────────────────

describe("GeometryEngine.getOpenSnapPoints", () => {
  it("core-only ship has N open snap points for an N-sided core", () => {
    const N = 6;
    const geoms = GeometryEngine.deriveAllGeometries(
      coreOnlyBlueprint(N).modules, defs, N,
    );
    const snaps = GeometryEngine.getOpenSnapPoints(geoms, coreOnlyBlueprint(N).modules, defs);
    expect(snaps).toHaveLength(N);
  });

  it("each snap point carries sizeClass from its owner module", () => {
    const geoms = GeometryEngine.deriveAllGeometries(
      coreOnlyBlueprint(4).modules, defs, 4,
    );
    const snaps = GeometryEngine.getOpenSnapPoints(geoms, coreOnlyBlueprint(4).modules, defs);
    for (const s of snaps) {
      expect(s.sizeClass).toBe(1);
    }
  });
});

// ── computeSnapTransform ──────────────────────────────────────────────────────

describe("GeometryEngine.computeSnapTransform", () => {
  it("returns null when size classes differ", () => {
    const c2Def = defs.get("weapon-cannon-c2")!; // sizeClass 2
    const sp = {
      ownerPlacedId: "core", sideIndex: 0,
      worldX: 0, worldY: 0, normalAngle: 0, sizeClass: 1 as const,
    };
    expect(GeometryEngine.computeSnapTransform(c2Def, sp, 6)).toBeNull();
  });

  it("returns a valid transform when size classes match", () => {
    const def = defs.get("weapon-cannon-c1")!;
    const sp = {
      ownerPlacedId: "core", sideIndex: 0,
      worldX: 50, worldY: 0, normalAngle: 0, sizeClass: 1 as const,
    };
    const t = GeometryEngine.computeSnapTransform(def, sp, 6);
    expect(t).not.toBeNull();
    expect(typeof t!.worldX).toBe("number");
    expect(typeof t!.rotationRad).toBe("number");
    expect(t!.ownSideIndex).toBeGreaterThanOrEqual(0);
    expect(t!.ownSideIndex).toBeLessThan(def.shape.sides);
  });
});

// ── findNearestSnap ───────────────────────────────────────────────────────────

describe("GeometryEngine.findNearestSnap", () => {
  it("returns null when cursor is far from all snap points", () => {
    const N = 6;
    const bp = coreOnlyBlueprint(N);
    const geoms = GeometryEngine.deriveAllGeometries(bp.modules, defs, N);
    const snaps = GeometryEngine.getOpenSnapPoints(geoms, bp.modules, defs);
    const def = defs.get("struct-quad-c1")!;
    const result = GeometryEngine.findNearestSnap(99999, 99999, def, snaps, N);
    expect(result).toBeNull();
  });

  it("returns the nearest snap when cursor is close enough", () => {
    const N = 6;
    const bp = coreOnlyBlueprint(N);
    const geoms = GeometryEngine.deriveAllGeometries(bp.modules, defs, N);
    const snaps = GeometryEngine.getOpenSnapPoints(geoms, bp.modules, defs);
    const def = defs.get("struct-quad-c1")!;

    // Place cursor exactly at the computed snap center for snap 0
    const transform = GeometryEngine.computeSnapTransform(def, snaps[0]!, N)!;
    const result = GeometryEngine.findNearestSnap(transform.worldX, transform.worldY, def, snaps, N);
    expect(result).not.toBeNull();
    expect(result!.snapPoint.sideIndex).toBe(snaps[0]!.sideIndex);
  });
});

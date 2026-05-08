import { describe, it, expect, beforeEach } from "vitest";
import { BlueprintEngine } from "./BlueprintEngine";
import { SolarModuleRegistry } from "../data/SolarModuleRegistry";

// ── Setup helpers ─────────────────────────────────────────────────────────────

function freshEngine() {
  return BlueprintEngine.create("core-c1-balanced", 6, "Test Ship");
}

function coreSideSnap(engine: BlueprintEngine, sideIndex: number) {
  // The core's placedId is always "core"
  return { parentPlacedId: "core", parentSideIndex: sideIndex };
}

const weaponDef  = SolarModuleRegistry.getModule("weapon-cannon-c1")!;
const extDef     = SolarModuleRegistry.getModule("ext-shield-c1")!;
const intDef     = SolarModuleRegistry.getModule("int-engine-c1")!;
const structDef  = SolarModuleRegistry.getModule("struct-tri-c1")!;
const convDef    = SolarModuleRegistry.getModule("conv-w-to-e-c1")!;   // lvl1, costs 5
const convL2Def  = SolarModuleRegistry.getModule("conv-w-to-e-c1-l2")!; // lvl2, costs 2

// ── Factory ───────────────────────────────────────────────────────────────────

describe("BlueprintEngine.create", () => {
  it("starts with one module (the core)", () => {
    const e = freshEngine();
    expect(e.getBlueprint().modules).toHaveLength(1);
    expect(e.getBlueprint().modules[0]!.placedId).toBe("core");
  });

  it("throws when given a non-core module id", () => {
    expect(() => BlueprintEngine.create("weapon-cannon-c1", 6)).toThrow();
  });

  it("clamps coreSideCount to [3, 20]", () => {
    expect(BlueprintEngine.create("core-c1-balanced", 1).getBlueprint().coreSideCount).toBe(3);
    expect(BlueprintEngine.create("core-c1-balanced", 25).getBlueprint().coreSideCount).toBe(20);
  });
});

// ── Initial budget ────────────────────────────────────────────────────────────

describe("BlueprintEngine budget — initial state (core-c1-balanced: 2W 2E 2I)", () => {
  let engine: BlueprintEngine;
  beforeEach(() => { engine = freshEngine(); });

  it("weaponTotal matches core definition", () => {
    expect(engine.getBudget().weaponTotal).toBe(2);
    expect(engine.getBudget().weaponUsed).toBe(0);
  });

  it("externalTotal matches core definition", () => {
    expect(engine.getBudget().externalTotal).toBe(2);
  });

  it("internalTotal matches core definition", () => {
    expect(engine.getBudget().internalTotal).toBe(2);
  });

  it("converterTotal is always 5", () => {
    expect(engine.getBudget().converterTotal).toBe(5);
  });

  it("partsUsed = 1 (just the core), partsMax = 50", () => {
    const b = engine.getBudget();
    expect(b.partsUsed).toBe(1);
    expect(b.partsMax).toBe(50);
  });
});

// ── placeModule ───────────────────────────────────────────────────────────────

describe("BlueprintEngine.placeModule", () => {
  it("weapon costs one weapon point", () => {
    const e = freshEngine();
    e.placeModule(weaponDef, "core", 0, 0);
    expect(e.getBudget().weaponUsed).toBe(1);
  });

  it("external costs one external point", () => {
    const e = freshEngine();
    e.placeModule(extDef, "core", 0, 0);
    expect(e.getBudget().externalUsed).toBe(1);
  });

  it("engine (external type) costs one external point", () => {
    const e = freshEngine();
    e.placeModule(intDef, "core", 0, 0);
    expect(e.getBudget().externalUsed).toBe(1);
  });

  it("structure does not consume any budget point", () => {
    const e = freshEngine();
    const before = e.getBudget();
    e.placeModule(structDef, "core", 0, 0);
    const after = e.getBudget();
    expect(after.weaponUsed).toBe(before.weaponUsed);
    expect(after.externalUsed).toBe(before.externalUsed);
    expect(after.internalUsed).toBe(before.internalUsed);
  });

  it("partsUsed increases by 1 on each placement", () => {
    const e = freshEngine();
    e.placeModule(structDef, "core", 0, 0);
    expect(e.getBudget().partsUsed).toBe(2);
    e.placeModule(structDef, "core", 1, 0);
    expect(e.getBudget().partsUsed).toBe(3);
  });

  it("returns the new placedId and updated budget", () => {
    const e = freshEngine();
    const { placedId, budget } = e.placeModule(weaponDef, "core", 0, 0);
    expect(typeof placedId).toBe("string");
    expect(budget.weaponUsed).toBe(1);
  });
});

// ── canPlace ──────────────────────────────────────────────────────────────────

describe("BlueprintEngine.canPlace", () => {
  it("allows placement when budget is available", () => {
    const e = freshEngine();
    expect(e.canPlace(weaponDef, "core", 0).ok).toBe(true);
  });

  it("rejects placement when weapon budget is full", () => {
    const e = freshEngine();
    e.placeModule(weaponDef, "core", 0, 0); // weaponUsed = 1
    e.placeModule(weaponDef, "core", 1, 0); // weaponUsed = 2 = total
    const result = e.canPlace(weaponDef, "core", 2);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe("budget");
  });

  it("rejects placement when side is already occupied", () => {
    const e = freshEngine();
    e.placeModule(structDef, "core", 0, 0);
    const result = e.canPlace(structDef, "core", 0);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe("side-occupied");
  });

  it("rejects placement when parent does not exist", () => {
    const e = freshEngine();
    const result = e.canPlace(structDef, "no-such-parent", 0);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe("no-such-parent");
  });

  it("rejects placement when size classes differ", () => {
    const e = freshEngine(); // class 1 core
    const c2Def = SolarModuleRegistry.getModule("weapon-cannon-c2")!;
    const result = e.canPlace(c2Def, "core", 0);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe("size-mismatch");
  });
});

// ── removeModule ──────────────────────────────────────────────────────────────

describe("BlueprintEngine.removeModule", () => {
  it("removes a leaf module and frees its budget", () => {
    const e = freshEngine();
    const { placedId } = e.placeModule(weaponDef, "core", 0, 0);
    expect(e.getBudget().weaponUsed).toBe(1);
    e.removeModule(placedId);
    expect(e.getBudget().weaponUsed).toBe(0);
    expect(e.getBlueprint().modules).toHaveLength(1);
  });

  it("removing a parent removes the entire subtree", () => {
    const e = freshEngine();
    const { placedId: s1 } = e.placeModule(structDef, "core", 0, 0);
    const { placedId: s2 } = e.placeModule(structDef, s1, 1, 0);
    e.placeModule(weaponDef, s2, 1, 0);
    expect(e.getBlueprint().modules).toHaveLength(4); // core + 3
    e.removeModule(s1);
    expect(e.getBlueprint().modules).toHaveLength(1); // only core remains
  });

  it("does not remove the core", () => {
    const e = freshEngine();
    e.removeModule("core");
    expect(e.getBlueprint().modules).toHaveLength(1);
  });
});

// ── Converter budget ──────────────────────────────────────────────────────────

describe("BlueprintEngine — converter budget", () => {
  it("level-1 converter costs 5 converter points (fills the entire budget)", () => {
    const e = freshEngine();
    e.placeModule(convDef, "core", 0, 0);
    expect(e.getBudget().converterUsed).toBe(5);
    expect(e.getBudget().converterTotal).toBe(5);
  });

  it("level-1 converter adjusts weapon→external pool swap", () => {
    const e = freshEngine();
    e.placeModule(convDef, "core", 0, 0); // weapon→external: weaponTotal--, externalTotal++
    const b = e.getBudget();
    expect(b.weaponTotal).toBe(1);   // was 2, now 1
    expect(b.externalTotal).toBe(3); // was 2, now 3
  });

  it("cannot place a second level-1 converter (budget exhausted)", () => {
    const e = freshEngine();
    e.placeModule(convDef, "core", 0, 0);
    const result = e.canPlace(convDef, "core", 1);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe("budget");
  });

  it("can place up to 2 level-2 converters (cost 2 each, total 4 ≤ 5)", () => {
    const e = freshEngine();
    expect(e.canPlace(convL2Def, "core", 0).ok).toBe(true);
    e.placeModule(convL2Def, "core", 0, 0);
    expect(e.canPlace(convL2Def, "core", 1).ok).toBe(true);
    e.placeModule(convL2Def, "core", 1, 0);
    // converterUsed = 4, converterTotal = 5 → still 1 remaining
    expect(e.getBudget().converterUsed).toBe(4);
  });
});

// ── rename ────────────────────────────────────────────────────────────────────

describe("BlueprintEngine.rename", () => {
  it("changes the blueprint name", () => {
    const e = freshEngine();
    e.rename("My Cool Ship");
    expect(e.getBlueprint().name).toBe("My Cool Ship");
  });
});

// ── BlueprintEngine.load ──────────────────────────────────────────────────────

describe("BlueprintEngine.load", () => {
  it("loads an existing blueprint and preserves its modules", () => {
    const original = freshEngine();
    original.placeModule(weaponDef, "core", 0, 0);
    const bp = original.getBlueprint();
    const loaded = BlueprintEngine.load(bp);
    expect(loaded.getBlueprint().modules).toHaveLength(2);
    expect(loaded.getBudget().weaponUsed).toBe(1);
  });
});

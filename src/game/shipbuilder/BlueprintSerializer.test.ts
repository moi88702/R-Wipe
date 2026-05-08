import { describe, it, expect } from "vitest";
import { BlueprintSerializer } from "./BlueprintSerializer";
import { BlueprintEngine } from "./BlueprintEngine";
import { SolarModuleRegistry } from "../data/SolarModuleRegistry";
import type { SolarShipBlueprint } from "../../types/solarShipBuilder";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sampleBlueprint(): SolarShipBlueprint {
  const engine = BlueprintEngine.create("core-c1-balanced", 5, "Serialise Me");
  engine.placeModule(SolarModuleRegistry.getModule("weapon-cannon-c1")!, "core", 0, 0);
  engine.placeModule(SolarModuleRegistry.getModule("ext-shield-c1")!, "core", 1, 0);
  return engine.getBlueprint();
}

// ── serialize / deserialize round-trip ───────────────────────────────────────

describe("BlueprintSerializer round-trip", () => {
  it("preserves all top-level fields", () => {
    const original = sampleBlueprint();
    const json = BlueprintSerializer.serialize(original);
    const restored = BlueprintSerializer.deserialize(json);

    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
    expect(restored.sizeClass).toBe(original.sizeClass);
    expect(restored.coreSideCount).toBe(original.coreSideCount);
  });

  it("preserves all modules including their placement tree", () => {
    const original = sampleBlueprint();
    const restored = BlueprintSerializer.deserialize(BlueprintSerializer.serialize(original));

    expect(restored.modules).toHaveLength(original.modules.length);
    for (let i = 0; i < original.modules.length; i++) {
      const o = original.modules[i]!;
      const r = restored.modules[i]!;
      expect(r.placedId).toBe(o.placedId);
      expect(r.moduleDefId).toBe(o.moduleDefId);
      expect(r.parentPlacedId).toBe(o.parentPlacedId);
      expect(r.parentSideIndex).toBe(o.parentSideIndex);
      expect(r.ownSideIndex).toBe(o.ownSideIndex);
    }
  });

  it("restored blueprint loads correctly into BlueprintEngine", () => {
    const original = sampleBlueprint();
    const restored = BlueprintSerializer.deserialize(BlueprintSerializer.serialize(original));
    const engine = BlueprintEngine.load(restored);

    const b = engine.getBudget();
    expect(b.weaponUsed).toBe(1);
    expect(b.externalUsed).toBe(1);
    expect(b.partsUsed).toBe(3);
  });
});

// ── deserialize error cases ───────────────────────────────────────────────────

describe("BlueprintSerializer.deserialize — error cases", () => {
  it("throws on invalid JSON", () => {
    expect(() => BlueprintSerializer.deserialize("{not valid json")).toThrow(
      "BlueprintSerializer: invalid JSON",
    );
  });

  it("throws when v field is missing or wrong version", () => {
    const json = JSON.stringify({ v: 99, blueprint: sampleBlueprint() });
    expect(() => BlueprintSerializer.deserialize(json)).toThrow("unsupported schema version");
  });

  it("throws when blueprint field is missing", () => {
    const json = JSON.stringify({ v: 1 });
    expect(() => BlueprintSerializer.deserialize(json)).toThrow("missing blueprint field");
  });

  it("throws when modules field is missing", () => {
    const bp = { ...sampleBlueprint() } as unknown as Record<string, unknown>;
    delete bp["modules"];
    const json = JSON.stringify({ v: 1, blueprint: bp });
    expect(() => BlueprintSerializer.deserialize(json)).toThrow("modules must be an array");
  });
});

// ── diffAgainstInventory ──────────────────────────────────────────────────────

describe("BlueprintSerializer.diffAgainstInventory", () => {
  it("returns empty when inventory covers everything", () => {
    const bp = sampleBlueprint();
    const inv = new Map([
      ["core-c1-balanced", 1],
      ["weapon-cannon-c1", 1],
      ["ext-shield-c1", 1],
    ]);
    expect(BlueprintSerializer.diffAgainstInventory(bp, inv)).toHaveLength(0);
  });

  it("returns shortfall entries for missing parts", () => {
    const bp = sampleBlueprint();
    const inv = new Map<string, number>(); // empty inventory
    const diff = BlueprintSerializer.diffAgainstInventory(bp, inv);

    expect(diff.length).toBeGreaterThan(0);
    for (const entry of diff) {
      expect(entry.have).toBe(0);
      expect(entry.need).toBeGreaterThan(0);
    }
  });

  it("correctly counts need when the same module appears multiple times", () => {
    const engine = BlueprintEngine.create("core-c1-balanced", 6);
    const def = SolarModuleRegistry.getModule("struct-tri-c1")!;
    engine.placeModule(def, "core", 0, 0);
    engine.placeModule(def, "core", 1, 0);
    engine.placeModule(def, "core", 2, 0);
    const bp = engine.getBlueprint();
    const inv = new Map([["struct-tri-c1", 1], ["core-c1-balanced", 1]]);
    const diff = BlueprintSerializer.diffAgainstInventory(bp, inv);
    const structEntry = diff.find(d => d.moduleDefId === "struct-tri-c1")!;
    expect(structEntry.need).toBe(3);
    expect(structEntry.have).toBe(1);
  });

  it("returns nothing when all parts are already owned in sufficient quantity", () => {
    const engine = BlueprintEngine.create("core-c1-armor", 4);
    const bp = engine.getBlueprint();
    const inv = new Map([["core-c1-armor", 2]]);
    expect(BlueprintSerializer.diffAgainstInventory(bp, inv)).toHaveLength(0);
  });
});

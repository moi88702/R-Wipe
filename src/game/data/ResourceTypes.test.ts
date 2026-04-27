import { describe, it, expect } from "vitest";
import { ResourceTypes } from "./ResourceTypes";

// ── getResourceDefinition ─────────────────────────────────────────────────────

describe("ResourceTypes.getResourceDefinition", () => {
  it("returns the correct definition for 'alloy'", () => {
    // Given the canonical alloy resource id
    // When we look it up
    const def = ResourceTypes.getResourceDefinition("alloy");

    // Then we get the full definition
    expect(def).toBeDefined();
    expect(def!.id).toBe("alloy");
    expect(def!.displayName).toBe("Alloy");
    expect(def!.baseQuantity).toBeGreaterThan(0);
    expect(def!.baseHarvestRatePerSecond).toBeGreaterThan(0);
    expect(def!.baseMarketValue).toBeGreaterThan(0);
  });

  it("returns the correct definition for 'power-crystal'", () => {
    const def = ResourceTypes.getResourceDefinition("power-crystal");
    expect(def).toBeDefined();
    expect(def!.id).toBe("power-crystal");
    expect(def!.displayName).toBe("Power Crystal");
  });

  it("returns the correct definition for 'exotic-material'", () => {
    const def = ResourceTypes.getResourceDefinition("exotic-material");
    expect(def).toBeDefined();
    expect(def!.id).toBe("exotic-material");
    expect(def!.displayName).toBe("Exotic Material");
  });

  it("returns undefined for an unknown resource id", () => {
    // Given an id that does not exist
    // When we look it up
    const def = ResourceTypes.getResourceDefinition("does-not-exist");

    // Then we get undefined, not a throw
    expect(def).toBeUndefined();
  });
});

// ── getAllResources ───────────────────────────────────────────────────────────

describe("ResourceTypes.getAllResources", () => {
  it("returns exactly three resources in a frozen array", () => {
    // Given the registry is initialised
    // When we request all resources
    const all = ResourceTypes.getAllResources();

    // Then there are exactly three and the array is immutable
    expect(all).toHaveLength(3);
    expect(Object.isFrozen(all)).toBe(true);
  });

  it("contains alloy, power-crystal, and exotic-material", () => {
    const ids = ResourceTypes.getAllResources().map((r) => r.id);
    expect(ids).toContain("alloy");
    expect(ids).toContain("power-crystal");
    expect(ids).toContain("exotic-material");
  });

  it("every resource has valid colour values (0–255)", () => {
    for (const r of ResourceTypes.getAllResources()) {
      expect(r.color.r).toBeGreaterThanOrEqual(0);
      expect(r.color.r).toBeLessThanOrEqual(255);
      expect(r.color.g).toBeGreaterThanOrEqual(0);
      expect(r.color.g).toBeLessThanOrEqual(255);
      expect(r.color.b).toBeGreaterThanOrEqual(0);
      expect(r.color.b).toBeLessThanOrEqual(255);
    }
  });

  it("exotic-material is more valuable per unit than alloy", () => {
    const alloy = ResourceTypes.getResourceDefinition("alloy")!;
    const exotic = ResourceTypes.getResourceDefinition("exotic-material")!;
    expect(exotic.baseMarketValue).toBeGreaterThan(alloy.baseMarketValue);
  });
});

// ── getAllResourceIds ─────────────────────────────────────────────────────────

describe("ResourceTypes.getAllResourceIds", () => {
  it("returns ids matching getAllResources", () => {
    const ids = ResourceTypes.getAllResourceIds();
    const expected = ResourceTypes.getAllResources().map((r) => r.id);
    expect(ids).toEqual(expected);
  });
});

// ── getAbundanceMultiplier ────────────────────────────────────────────────────

describe("ResourceTypes.getAbundanceMultiplier", () => {
  it("hard zones are more abundant than easy zones for alloy", () => {
    // Given the alloy resource
    // When we compare zone multipliers
    const easy = ResourceTypes.getAbundanceMultiplier("alloy", "easy");
    const normal = ResourceTypes.getAbundanceMultiplier("alloy", "normal");
    const hard = ResourceTypes.getAbundanceMultiplier("alloy", "hard");

    // Then hard > normal > easy
    expect(hard).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(easy);
  });

  it("exotic-material has zero abundance in easy zones", () => {
    // Given exotic-material is extremely rare
    // When we check easy zone multiplier
    const multiplier = ResourceTypes.getAbundanceMultiplier("exotic-material", "easy");

    // Then it is zero — no exotic deposits in easy areas
    expect(multiplier).toBe(0);
  });

  it("returns 0 for an unknown resource id", () => {
    const multiplier = ResourceTypes.getAbundanceMultiplier("unknown", "hard");
    expect(multiplier).toBe(0);
  });
});

// ── getDepositQuantity ────────────────────────────────────────────────────────

describe("ResourceTypes.getDepositQuantity", () => {
  it("returns zero for exotic-material in an easy zone", () => {
    // Given exotic-material has a 0.0 easy multiplier
    // When we compute the deposit quantity
    const qty = ResourceTypes.getDepositQuantity("exotic-material", "easy");

    // Then the deposit is empty — no exotic in easy areas
    expect(qty).toBe(0);
  });

  it("returns more alloy in a hard zone than in an easy zone", () => {
    // Given alloy has different zone multipliers
    const easy = ResourceTypes.getDepositQuantity("alloy", "easy");
    const hard = ResourceTypes.getDepositQuantity("alloy", "hard");

    // Then hard has strictly more
    expect(hard).toBeGreaterThan(easy);
  });

  it("equals baseQuantity * zoneMultiplier", () => {
    // Given alloy base quantity and multipliers
    const def = ResourceTypes.getResourceDefinition("alloy")!;
    const expectedNormal = def.baseQuantity * def.zoneAbundanceMultipliers.normal;

    // When we call getDepositQuantity
    const actual = ResourceTypes.getDepositQuantity("alloy", "normal");

    // Then it matches the formula
    expect(actual).toBe(expectedNormal);
  });

  it("returns 0 for an unknown resource id", () => {
    expect(ResourceTypes.getDepositQuantity("unknown", "hard")).toBe(0);
  });
});

// ── getHarvestRate ────────────────────────────────────────────────────────────

describe("ResourceTypes.getHarvestRate", () => {
  it("returns a positive harvest rate for alloy in a normal zone", () => {
    const rate = ResourceTypes.getHarvestRate("alloy", "normal");
    expect(rate).toBeGreaterThan(0);
  });

  it("returns a positive harvest rate even in an easy zone (floor applied)", () => {
    // Easy zones have low multipliers, but the harvest rate should still be positive
    const rate = ResourceTypes.getHarvestRate("alloy", "easy");
    expect(rate).toBeGreaterThan(0);
  });

  it("returns 0 for an unknown resource id", () => {
    expect(ResourceTypes.getHarvestRate("unknown", "normal")).toBe(0);
  });
});

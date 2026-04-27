import { describe, it, expect } from "vitest";
import { CapitalShipUpgradeRegistry } from "./CapitalShipUpgradeRegistry";

// ── getUpgrade ────────────────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getUpgrade", () => {
  it("returns the correct definition for a known upgrade id", () => {
    // Given a known upgrade id
    // When we look it up
    const upgrade = CapitalShipUpgradeRegistry.getUpgrade("upgrade-laser-1");

    // Then we get the full definition with the expected shape
    expect(upgrade).toBeDefined();
    expect(upgrade!.id).toBe("upgrade-laser-1");
    expect(upgrade!.name).toBe("Laser Cannon Mk I");
    expect(upgrade!.type).toBe("weapon");
    expect(upgrade!.tier).toBe(1);
    expect(upgrade!.hardpointType).toBe("weapon-slot");
    expect(upgrade!.hullCompatibility).toContain("light-frigate");
    expect(upgrade!.cost).toBeGreaterThan(0);
  });

  it("returns undefined for an unknown upgrade id", () => {
    // Given an id that does not exist
    // When we look it up
    const upgrade = CapitalShipUpgradeRegistry.getUpgrade("does-not-exist");

    // Then we get undefined, not a throw
    expect(upgrade).toBeUndefined();
  });

  it("can look up every registered upgrade by its own id", () => {
    // Given all upgrade definitions
    for (const upgrade of CapitalShipUpgradeRegistry.getAllUpgrades()) {
      // When we look each one up by id
      const found = CapitalShipUpgradeRegistry.getUpgrade(upgrade.id);
      // Then we get the same object back
      expect(found).toBe(upgrade);
    }
  });
});

// ── getAllUpgrades ────────────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getAllUpgrades", () => {
  it("returns a non-empty frozen array", () => {
    // Given the registry is initialised
    // When we request all upgrades
    const all = CapitalShipUpgradeRegistry.getAllUpgrades();

    // Then the array is non-empty and immutable
    expect(all.length).toBeGreaterThan(0);
    expect(Object.isFrozen(all)).toBe(true);
  });

  it("contains between 10 and 15 upgrades", () => {
    const count = CapitalShipUpgradeRegistry.getAllUpgrades().length;
    expect(count).toBeGreaterThanOrEqual(10);
    expect(count).toBeLessThanOrEqual(15);
  });

  it("every upgrade has a non-empty id, name, and valid tier (1–11)", () => {
    for (const u of CapitalShipUpgradeRegistry.getAllUpgrades()) {
      expect(u.id.length).toBeGreaterThan(0);
      expect(u.name.length).toBeGreaterThan(0);
      expect(u.tier).toBeGreaterThanOrEqual(1);
      expect(u.tier).toBeLessThanOrEqual(11);
    }
  });

  it("every upgrade has a valid type", () => {
    const validTypes = new Set(["weapon", "shield", "engine", "sensor", "special"]);
    for (const u of CapitalShipUpgradeRegistry.getAllUpgrades()) {
      expect(validTypes.has(u.type)).toBe(true);
    }
  });

  it("every upgrade has a valid hardpointType", () => {
    const validSlots = new Set(["weapon-slot", "defense-slot", "special-slot", "engine-slot"]);
    for (const u of CapitalShipUpgradeRegistry.getAllUpgrades()) {
      expect(validSlots.has(u.hardpointType)).toBe(true);
    }
  });

  it("every upgrade has a positive cost and non-negative mass and powerDraw", () => {
    for (const u of CapitalShipUpgradeRegistry.getAllUpgrades()) {
      expect(u.cost).toBeGreaterThan(0);
      expect(u.mass).toBeGreaterThanOrEqual(0);
      expect(u.powerDraw).toBeGreaterThanOrEqual(0);
    }
  });

  it("upgrades span at least tiers 1, 5, and 11", () => {
    // Verifies the catalogue is not clustered at low tiers
    const tiers = new Set(CapitalShipUpgradeRegistry.getAllUpgrades().map((u) => u.tier));
    expect(tiers.has(1)).toBe(true);
    expect(tiers.has(5)).toBe(true);
    expect(tiers.has(11)).toBe(true);
  });

  it("every upgrade lists at least one compatible hull", () => {
    for (const u of CapitalShipUpgradeRegistry.getAllUpgrades()) {
      expect(u.hullCompatibility.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── getAllUpgradeIds ───────────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getAllUpgradeIds", () => {
  it("returns ids matching getAllUpgrades", () => {
    const ids = CapitalShipUpgradeRegistry.getAllUpgradeIds();
    const expected = CapitalShipUpgradeRegistry.getAllUpgrades().map((u) => u.id);
    expect(ids).toEqual(expected);
  });
});

// ── getUpgradesByTier ─────────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getUpgradesByTier", () => {
  it("returns upgrades at tier 1", () => {
    // Given tier-1 upgrades exist
    const upgrades = CapitalShipUpgradeRegistry.getUpgradesByTier(1);

    // Then we get at least one and all are tier 1
    expect(upgrades.length).toBeGreaterThan(0);
    for (const u of upgrades) {
      expect(u.tier).toBe(1);
    }
  });

  it("returns the tier-11 singularity drive", () => {
    // Given a tier-11 upgrade exists
    const upgrades = CapitalShipUpgradeRegistry.getUpgradesByTier(11);
    const ids = upgrades.map((u) => u.id);
    expect(ids).toContain("upgrade-singularity-drive");
  });

  it("returns an empty array for a tier with no upgrades (e.g. tier 6)", () => {
    // Tier 6 is intentionally unpopulated in the catalogue
    const upgrades = CapitalShipUpgradeRegistry.getUpgradesByTier(6);
    expect(upgrades).toEqual([]);
  });

  it("returns an empty array for out-of-range tiers", () => {
    expect(CapitalShipUpgradeRegistry.getUpgradesByTier(0)).toEqual([]);
    expect(CapitalShipUpgradeRegistry.getUpgradesByTier(12)).toEqual([]);
  });
});

// ── getUpgradesByType ─────────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getUpgradesByType", () => {
  it("returns only weapon upgrades", () => {
    const upgrades = CapitalShipUpgradeRegistry.getUpgradesByType("weapon");
    expect(upgrades.length).toBeGreaterThan(0);
    for (const u of upgrades) {
      expect(u.type).toBe("weapon");
    }
  });

  it("returns only shield upgrades", () => {
    const upgrades = CapitalShipUpgradeRegistry.getUpgradesByType("shield");
    expect(upgrades.length).toBeGreaterThan(0);
    for (const u of upgrades) {
      expect(u.type).toBe("shield");
    }
  });

  it("returns only special upgrades (includes e-war and tractor beam)", () => {
    const upgrades = CapitalShipUpgradeRegistry.getUpgradesByType("special");
    const ids = upgrades.map((u) => u.id);
    expect(ids).toContain("upgrade-ewar-1");
    expect(ids).toContain("upgrade-tractor-1");
    expect(ids).toContain("upgrade-singularity-drive");
  });
});

// ── getUpgradesByHull ─────────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getUpgradesByHull", () => {
  it("returns all upgrades compatible with light-frigate", () => {
    // Given light-frigate is the starting hull
    const upgrades = CapitalShipUpgradeRegistry.getUpgradesByHull("light-frigate");

    // Then we get at least the tier-1 starting upgrades
    const ids = upgrades.map((u) => u.id);
    expect(ids).toContain("upgrade-laser-1");
    expect(ids).toContain("upgrade-shield-1");
    for (const u of upgrades) {
      expect(u.hullCompatibility).toContain("light-frigate");
    }
  });

  it("dreadnought can use all upgrades that light-frigate can, and more", () => {
    const frigateIds = new Set(
      CapitalShipUpgradeRegistry.getUpgradesByHull("light-frigate").map((u) => u.id),
    );
    const dreadIds = new Set(
      CapitalShipUpgradeRegistry.getUpgradesByHull("dreadnought").map((u) => u.id),
    );
    // Every light-frigate upgrade should also work on dreadnought
    for (const id of frigateIds) {
      expect(dreadIds.has(id)).toBe(true);
    }
    // Dreadnought should have at least one exclusive upgrade
    expect(dreadIds.size).toBeGreaterThan(frigateIds.size);
  });

  it("returns an empty array for an unknown hull id", () => {
    const upgrades = CapitalShipUpgradeRegistry.getUpgradesByHull("nonexistent-hull");
    expect(upgrades).toEqual([]);
  });
});

// ── getCompatibleUpgrades ─────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getCompatibleUpgrades", () => {
  it("returns only upgrades within the slot's tier capacity", () => {
    // Given a weapon-slot on light-frigate with capacity 5
    const upgrades = CapitalShipUpgradeRegistry.getCompatibleUpgrades(
      "light-frigate",
      "weapon-slot",
      5,
    );

    // Then all returned upgrades have tier ≤ 5
    for (const u of upgrades) {
      expect(u.tier).toBeLessThanOrEqual(5);
      expect(u.hullCompatibility).toContain("light-frigate");
      expect(u.hardpointType).toBe("weapon-slot");
    }
  });

  it("excludes high-tier upgrades that exceed the slot capacity", () => {
    // Given a capacity-1 slot
    const upgrades = CapitalShipUpgradeRegistry.getCompatibleUpgrades(
      "dreadnought",
      "weapon-slot",
      1,
    );
    for (const u of upgrades) {
      expect(u.tier).toBeLessThanOrEqual(1);
    }
  });

  it("returns an empty array when no upgrades match hull + slot + capacity", () => {
    // light-frigate has no special-slot upgrades at all
    const upgrades = CapitalShipUpgradeRegistry.getCompatibleUpgrades(
      "light-frigate",
      "special-slot",
      11,
    );
    expect(upgrades).toEqual([]);
  });
});

// ── getHull ───────────────────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getHull", () => {
  it("returns the correct hull for 'light-frigate'", () => {
    // Given the starting hull id
    // When we look it up
    const hull = CapitalShipUpgradeRegistry.getHull("light-frigate");

    // Then we get the full definition
    expect(hull).toBeDefined();
    expect(hull!.id).toBe("light-frigate");
    expect(hull!.displayName).toBe("Light Frigate");
    expect(hull!.maxHealth).toBeGreaterThan(0);
    expect(hull!.hardpoints.length).toBeGreaterThan(0);
    expect(hull!.basePowerCapacity).toBeGreaterThan(0);
  });

  it("returns undefined for an unknown hull id", () => {
    const hull = CapitalShipUpgradeRegistry.getHull("unknown-hull");
    expect(hull).toBeUndefined();
  });

  it("can look up every registered hull by its own id", () => {
    for (const hull of CapitalShipUpgradeRegistry.getAllHulls()) {
      const found = CapitalShipUpgradeRegistry.getHull(hull.id);
      expect(found).toBe(hull);
    }
  });
});

// ── getAllHulls ────────────────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getAllHulls", () => {
  it("returns exactly three hulls in a frozen array", () => {
    const all = CapitalShipUpgradeRegistry.getAllHulls();
    expect(all).toHaveLength(3);
    expect(Object.isFrozen(all)).toBe(true);
  });

  it("contains light-frigate, heavy-cruiser, and dreadnought", () => {
    const ids = CapitalShipUpgradeRegistry.getAllHulls().map((h) => h.id);
    expect(ids).toContain("light-frigate");
    expect(ids).toContain("heavy-cruiser");
    expect(ids).toContain("dreadnought");
  });

  it("each hull has at least two hardpoints", () => {
    for (const hull of CapitalShipUpgradeRegistry.getAllHulls()) {
      expect(hull.hardpoints.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("dreadnought has more hardpoints than light-frigate", () => {
    const frigate = CapitalShipUpgradeRegistry.getHull("light-frigate")!;
    const dread = CapitalShipUpgradeRegistry.getHull("dreadnought")!;
    expect(dread.hardpoints.length).toBeGreaterThan(frigate.hardpoints.length);
  });

  it("every hull's hardpoint capacities are within 1–11", () => {
    for (const hull of CapitalShipUpgradeRegistry.getAllHulls()) {
      for (const hp of hull.hardpoints) {
        expect(hp.capacity).toBeGreaterThanOrEqual(1);
        expect(hp.capacity).toBeLessThanOrEqual(11);
      }
    }
  });
});

// ── getAllHullIds ──────────────────────────────────────────────────────────────

describe("CapitalShipUpgradeRegistry.getAllHullIds", () => {
  it("returns ids matching getAllHulls", () => {
    const ids = CapitalShipUpgradeRegistry.getAllHullIds();
    const expected = CapitalShipUpgradeRegistry.getAllHulls().map((h) => h.id);
    expect(ids).toEqual(expected);
  });
});

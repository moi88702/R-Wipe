import { describe, it, expect } from "vitest";
import { FactionRegistry } from "./FactionRegistry";

// ── getFaction ────────────────────────────────────────────────────────────────

describe("FactionRegistry.getFaction", () => {
  it("returns the correct definition for a known faction id", () => {
    // Given a known faction id
    // When we look it up
    const faction = FactionRegistry.getFaction("terran-federation");

    // Then we get the full definition back with the right shape
    expect(faction).toBeDefined();
    expect(faction!.id).toBe("terran-federation");
    expect(faction!.name).toBe("Terran Federation");
    expect(faction!.color).toEqual({ r: 50, g: 120, b: 220 });
    expect(faction!.allies).toContain("void-merchants");
    expect(faction!.enemies).toContain("scavenger-clans");
  });

  it("returns undefined for an unknown faction id", () => {
    // Given an id that does not exist in the registry
    // When we look it up
    const faction = FactionRegistry.getFaction("does-not-exist");

    // Then we get undefined, not a throw
    expect(faction).toBeUndefined();
  });

  it("can look up every registered faction by its own id", () => {
    // Given all faction definitions
    for (const faction of FactionRegistry.getAllFactions()) {
      // When we look each one up by id
      const found = FactionRegistry.getFaction(faction.id);
      // Then we get the same object back
      expect(found).toBe(faction);
    }
  });
});

// ── getAllFactions ────────────────────────────────────────────────────────────

describe("FactionRegistry.getAllFactions", () => {
  it("returns a non-empty frozen array", () => {
    // Given the registry is initialised
    // When we request all factions
    const all = FactionRegistry.getAllFactions();

    // Then the array is non-empty and immutable
    expect(all.length).toBeGreaterThan(0);
    expect(Object.isFrozen(all)).toBe(true);
  });

  it("contains exactly the six expected factions", () => {
    const ids = FactionRegistry.getAllFactions().map((f) => f.id);
    expect(ids).toContain("terran-federation");
    expect(ids).toContain("xeno-collective");
    expect(ids).toContain("void-merchants");
    expect(ids).toContain("scavenger-clans");
    expect(ids).toContain("deep-miners");
    expect(ids).toContain("nova-rebels");
    expect(ids).toContain("mercenary");
    expect(ids).toHaveLength(7);
  });

  it("every definition has a non-empty id, name, and colour", () => {
    for (const f of FactionRegistry.getAllFactions()) {
      expect(f.id.length).toBeGreaterThan(0);
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.color.r).toBeGreaterThanOrEqual(0);
      expect(f.color.g).toBeGreaterThanOrEqual(0);
      expect(f.color.b).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── getAllFactionIds ───────────────────────────────────────────────────────────

describe("FactionRegistry.getAllFactionIds", () => {
  it("returns an array of strings matching getAllFactions ids", () => {
    const ids = FactionRegistry.getAllFactionIds();
    const expected = FactionRegistry.getAllFactions().map((f) => f.id);
    expect(ids).toEqual(expected);
  });
});

// ── getFactionsByAlly ─────────────────────────────────────────────────────────

describe("FactionRegistry.getFactionsByAlly", () => {
  it("returns factions that list the given id as an ally", () => {
    // Given void-merchants is an ally of terran-federation
    // When we ask who has terran-federation as ally
    const allies = FactionRegistry.getFactionsByAlly("terran-federation");

    // Then we get void-merchants back (they list TF as ally)
    expect(allies.map((f) => f.id)).toContain("void-merchants");
  });

  it("returns an empty array when no faction lists the given id as an ally", () => {
    const allies = FactionRegistry.getFactionsByAlly("scavenger-clans");
    expect(allies).toEqual([]);
  });
});

// ── getFactionsByEnemy ────────────────────────────────────────────────────────

describe("FactionRegistry.getFactionsByEnemy", () => {
  it("returns factions that list the given id as an enemy", () => {
    // Given terran-federation and xeno-collective both list nova-rebels as enemy
    const enemies = FactionRegistry.getFactionsByEnemy("nova-rebels");
    const ids = enemies.map((f) => f.id);
    expect(ids).toContain("terran-federation");
    expect(ids).toContain("xeno-collective");
  });

  it("returns an empty array when no faction lists the given id as an enemy", () => {
    // deep-miners has no enemies that list it
    const result = FactionRegistry.getFactionsByEnemy("deep-miners");
    expect(result).toEqual([]);
  });
});

// ── getFactionsForLocation ────────────────────────────────────────────────────

describe("FactionRegistry.getFactionsForLocation", () => {
  it("returns the faction whose baselineLocations contains the given id", () => {
    // Given station-alpha is a baseline location of terran-federation
    const result = FactionRegistry.getFactionsForLocation("station-alpha");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("terran-federation");
  });

  it("returns an empty array for an unknown location id", () => {
    const result = FactionRegistry.getFactionsForLocation("nonexistent-location");
    expect(result).toEqual([]);
  });
});

// ── getFactionForNpc ──────────────────────────────────────────────────────────

describe("FactionRegistry.getFactionForNpc", () => {
  it("returns the faction that owns the given NPC id", () => {
    // Given npc-commander-voss belongs to terran-federation
    const faction = FactionRegistry.getFactionForNpc("npc-commander-voss");
    expect(faction).toBeDefined();
    expect(faction!.id).toBe("terran-federation");
  });

  it("returns undefined for an unknown NPC id", () => {
    const faction = FactionRegistry.getFactionForNpc("npc-nobody");
    expect(faction).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { LocationRegistry } from "./LocationRegistry";

// ── getLocation ───────────────────────────────────────────────────────────────

describe("LocationRegistry.getLocation", () => {
  it("returns the correct definition for a known location id", () => {
    // Given a known location id
    // When we look it up
    const loc = LocationRegistry.getLocation("station-alpha");

    // Then we get the full definition back
    expect(loc).toBeDefined();
    expect(loc!.id).toBe("station-alpha");
    expect(loc!.name).toBe("Station Alpha");
    expect(loc!.bodyId).toBe("planet-terran");
    expect(loc!.controllingFaction).toBe("terran-federation");
    expect(loc!.type).toBe("station");
  });

  it("returns undefined for an unknown location id", () => {
    // Given an id that does not exist
    // When we look it up
    const loc = LocationRegistry.getLocation("does-not-exist");

    // Then we get undefined, not a throw
    expect(loc).toBeUndefined();
  });

  it("can look up every registered location by its own id", () => {
    for (const loc of LocationRegistry.getAllLocations()) {
      expect(LocationRegistry.getLocation(loc.id)).toBe(loc);
    }
  });
});

// ── getAllLocations ───────────────────────────────────────────────────────────

describe("LocationRegistry.getAllLocations", () => {
  it("returns a non-empty frozen array", () => {
    const all = LocationRegistry.getAllLocations();
    expect(all.length).toBeGreaterThan(0);
    expect(Object.isFrozen(all)).toBe(true);
  });

  it("contains all expected locations", () => {
    const ids = LocationRegistry.getAllLocations().map((l) => l.id);
    const expected = [
      "station-alpha",
      "outpost-frontier",
      "station-beta",
      "neutral-hub",
      "xeno-nexus",
      "crystal-spire",
      "scavenger-haven",
      "mining-outpost-gamma",
      "deep-core-station",
      "rebel-base",
      "station-earth-orbit",
      "outpost-mars",
    ];
    for (const id of expected) {
      expect(ids).toContain(id);
    }
    expect(ids).toHaveLength(12);
  });

  it("every location has a non-empty id, name, bodyId, and valid type", () => {
    const validTypes = new Set(["station", "settlement", "outpost"]);
    for (const loc of LocationRegistry.getAllLocations()) {
      expect(loc.id.length).toBeGreaterThan(0);
      expect(loc.name.length).toBeGreaterThan(0);
      expect(loc.bodyId.length).toBeGreaterThan(0);
      expect(validTypes.has(loc.type)).toBe(true);
    }
  });
});

// ── getAllLocationIds ──────────────────────────────────────────────────────────

describe("LocationRegistry.getAllLocationIds", () => {
  it("returns ids matching getAllLocations", () => {
    const ids = LocationRegistry.getAllLocationIds();
    const expected = LocationRegistry.getAllLocations().map((l) => l.id);
    expect(ids).toEqual(expected);
  });
});

// ── getLocationsByFaction ─────────────────────────────────────────────────────

describe("LocationRegistry.getLocationsByFaction", () => {
  it("returns all locations controlled by the given faction", () => {
    // Given terran-federation controls station-alpha and outpost-frontier
    const locs = LocationRegistry.getLocationsByFaction("terran-federation");
    const ids = locs.map((l) => l.id);
    expect(ids).toContain("station-alpha");
    expect(ids).toContain("outpost-frontier");
    expect(locs.every((l) => l.controllingFaction === "terran-federation")).toBe(true);
  });

  it("returns an empty array for a faction that controls no locations", () => {
    const locs = LocationRegistry.getLocationsByFaction("unknown-faction");
    expect(locs).toEqual([]);
  });
});

// ── getLocationsByBody ────────────────────────────────────────────────────────

describe("LocationRegistry.getLocationsByBody", () => {
  it("returns all locations on the given celestial body", () => {
    // Given planet-terran has station-alpha and outpost-frontier
    const locs = LocationRegistry.getLocationsByBody("planet-terran");
    const ids = locs.map((l) => l.id);
    expect(ids).toContain("station-alpha");
    expect(ids).toContain("outpost-frontier");
    expect(locs.every((l) => l.bodyId === "planet-terran")).toBe(true);
  });

  it("returns an empty array for an unknown body id", () => {
    const locs = LocationRegistry.getLocationsByBody("unknown-body");
    expect(locs).toEqual([]);
  });
});

// ── getLocationsForNPC ────────────────────────────────────────────────────────

describe("LocationRegistry.getLocationsForNPC", () => {
  it("returns locations that host the given NPC", () => {
    // Given npc-commander-voss appears at station-alpha and outpost-frontier
    const locs = LocationRegistry.getLocationsForNPC("npc-commander-voss");
    const ids = locs.map((l) => l.id);
    expect(ids).toContain("station-alpha");
    expect(ids).toContain("outpost-frontier");
  });

  it("returns an empty array for an NPC id not present at any location", () => {
    const locs = LocationRegistry.getLocationsForNPC("npc-nobody");
    expect(locs).toEqual([]);
  });
});

// ── getRestrictedLocations ────────────────────────────────────────────────────

describe("LocationRegistry.getRestrictedLocations", () => {
  it("returns only locations that have at least one docking prerequisite", () => {
    // Given outpost-frontier requires a mission, xeno-nexus requires reputation,
    // crystal-spire requires reputation + items, deep-core-station requires a mission
    const restricted = LocationRegistry.getRestrictedLocations();
    const ids = restricted.map((l) => l.id);
    expect(ids).toContain("outpost-frontier");
    expect(ids).toContain("xeno-nexus");
    expect(ids).toContain("crystal-spire");
    expect(ids).toContain("deep-core-station");
  });

  it("does not include locations with no docking prerequisites", () => {
    // station-alpha has no item/mission/reputation requirements
    const restricted = LocationRegistry.getRestrictedLocations();
    const ids = restricted.map((l) => l.id);
    expect(ids).not.toContain("station-alpha");
    expect(ids).not.toContain("station-beta");
    expect(ids).not.toContain("neutral-hub");
  });

  it("rebel-base (requiredReputation: 0) is not treated as restricted", () => {
    // requiredReputation of exactly 0 means open to all — not restricted
    const restricted = LocationRegistry.getRestrictedLocations();
    const ids = restricted.map((l) => l.id);
    expect(ids).not.toContain("rebel-base");
  });
});

// ── getControllingFaction ─────────────────────────────────────────────────────

describe("LocationRegistry.getControllingFaction", () => {
  it("returns the controlling faction id derived from the location object", () => {
    // When we ask for the controlling faction of a known location
    const factionId = LocationRegistry.getControllingFaction("xeno-nexus");
    // Then we get the same value as the location's own controllingFaction field
    expect(factionId).toBe("xeno-collective");
    expect(factionId).toBe(LocationRegistry.getLocation("xeno-nexus")!.controllingFaction);
  });

  it("returns undefined for an unknown location id", () => {
    const factionId = LocationRegistry.getControllingFaction("ghost-station");
    expect(factionId).toBeUndefined();
  });

  it("is consistent with the location object for every registered location", () => {
    // Ensures there is no divergence between getControllingFaction and the
    // controllingFaction field on the Location object (previously a separate
    // LOCATION_FACTION map could fall out of sync).
    for (const loc of LocationRegistry.getAllLocations()) {
      expect(LocationRegistry.getControllingFaction(loc.id)).toBe(loc.controllingFaction);
    }
  });
});

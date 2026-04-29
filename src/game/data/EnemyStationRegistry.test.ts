/**
 * Tests for EnemyStationRegistry
 *
 * Pure registry tests — no external boundaries, no mocking.
 *
 * Observable contracts under test:
 *
 *   getStation
 *     1. Returns correct definition for known id.
 *     2. Returns undefined for unknown id.
 *     3. Every registered station is retrievable by its own id.
 *
 *   getAllStations / getAllStationIds
 *     4. Returns all four expected stations in a frozen array.
 *     5. getAllStationIds matches getAllStations map.
 *
 *   getStationsByFaction
 *     6. Returns all stations for a known hostile faction.
 *     7. Returns empty array for unknown faction.
 *     8. All returned stations carry the requested factionId.
 *
 *   getStationsByBody
 *     9. Returns all stations near a known body.
 *     10. Returns empty array for unknown body.
 *
 *   createInitialStates
 *     11. Produces one state per registered station.
 *     12. Every initial state is dormant, not destroyed, with full hull and shields.
 *     13. activeEnemyIds is empty and lastSpawnAtMs is 0 for every initial state.
 *     14. Each state's stationId matches a registered station.
 *
 *   Shape invariants
 *     15. Every station has turretCount > 0, maxActiveShips > 0, shipsPerWave > 0.
 *     16. Every station's alertRadiusKm > turrets.rangeKm (station alerts before turrets fire).
 */

import { describe, it, expect } from "vitest";
import { EnemyStationRegistry } from "./EnemyStationRegistry";

// ── getStation ────────────────────────────────────────────────────────────────

describe("EnemyStationRegistry.getStation", () => {
  it("returns the correct definition for a known station id", () => {
    // Given a known enemy station id
    const station = EnemyStationRegistry.getStation("enemy-station-scav-belt");

    // Then we get a well-formed definition back
    expect(station).toBeDefined();
    expect(station!.id).toBe("enemy-station-scav-belt");
    expect(station!.name).toBe("Scav Belt Outpost");
    expect(station!.factionId).toBe("scavenger-clans");
    expect(station!.bodyId).toBe("asteroid-belt");
  });

  it("returns undefined for an unknown station id", () => {
    // Given an id that does not exist
    const station = EnemyStationRegistry.getStation("does-not-exist");

    // Then we get undefined, not a throw
    expect(station).toBeUndefined();
  });

  it("can look up every registered station by its own id", () => {
    for (const station of EnemyStationRegistry.getAllStations()) {
      expect(EnemyStationRegistry.getStation(station.id)).toBe(station);
    }
  });
});

// ── getAllStations ────────────────────────────────────────────────────────────

describe("EnemyStationRegistry.getAllStations", () => {
  it("returns a non-empty frozen array", () => {
    const all = EnemyStationRegistry.getAllStations();
    expect(all.length).toBeGreaterThan(0);
    expect(Object.isFrozen(all)).toBe(true);
  });

  it("contains all four expected station ids", () => {
    const ids = EnemyStationRegistry.getAllStations().map((s) => s.id);
    expect(ids).toContain("enemy-station-scav-belt");
    expect(ids).toContain("enemy-station-scav-wreck");
    expect(ids).toContain("enemy-station-rebel-strike");
    expect(ids).toContain("enemy-station-rebel-forward");
    expect(ids).toHaveLength(4);
  });

  it("every station has non-empty id, name, factionId, and bodyId", () => {
    for (const s of EnemyStationRegistry.getAllStations()) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.factionId.length).toBeGreaterThan(0);
      expect(s.bodyId.length).toBeGreaterThan(0);
    }
  });
});

// ── getAllStationIds ──────────────────────────────────────────────────────────

describe("EnemyStationRegistry.getAllStationIds", () => {
  it("returns ids matching getAllStations", () => {
    const ids = EnemyStationRegistry.getAllStationIds();
    const expected = EnemyStationRegistry.getAllStations().map((s) => s.id);
    expect(ids).toEqual(expected);
  });
});

// ── getStationsByFaction ──────────────────────────────────────────────────────

describe("EnemyStationRegistry.getStationsByFaction", () => {
  it("returns all scavenger-clans stations", () => {
    // Given the scavenger-clans faction owns two stations
    const stations = EnemyStationRegistry.getStationsByFaction("scavenger-clans");

    expect(stations.length).toBe(2);
    expect(stations.map((s) => s.id)).toContain("enemy-station-scav-belt");
    expect(stations.map((s) => s.id)).toContain("enemy-station-scav-wreck");
    expect(stations.every((s) => s.factionId === "scavenger-clans")).toBe(true);
  });

  it("returns all nova-rebels stations", () => {
    // Given the nova-rebels faction owns two stations
    const stations = EnemyStationRegistry.getStationsByFaction("nova-rebels");

    expect(stations.length).toBe(2);
    expect(stations.map((s) => s.id)).toContain("enemy-station-rebel-strike");
    expect(stations.map((s) => s.id)).toContain("enemy-station-rebel-forward");
    expect(stations.every((s) => s.factionId === "nova-rebels")).toBe(true);
  });

  it("returns an empty array for a faction that controls no hostile stations", () => {
    const stations = EnemyStationRegistry.getStationsByFaction("terran-federation");
    expect(stations).toEqual([]);
  });

  it("returns an empty array for an unknown faction id", () => {
    const stations = EnemyStationRegistry.getStationsByFaction("unknown-faction");
    expect(stations).toEqual([]);
  });
});

// ── getStationsByBody ─────────────────────────────────────────────────────────

describe("EnemyStationRegistry.getStationsByBody", () => {
  it("returns both scavenger stations near the asteroid belt", () => {
    // Given two scavenger stations are located near the asteroid belt
    const stations = EnemyStationRegistry.getStationsByBody("asteroid-belt");

    expect(stations.length).toBe(2);
    expect(stations.map((s) => s.id)).toContain("enemy-station-scav-belt");
    expect(stations.map((s) => s.id)).toContain("enemy-station-scav-wreck");
    expect(stations.every((s) => s.bodyId === "asteroid-belt")).toBe(true);
  });

  it("returns the rebel base near moon-petra", () => {
    const stations = EnemyStationRegistry.getStationsByBody("moon-petra");

    expect(stations).toHaveLength(1);
    expect(stations[0]!.id).toBe("enemy-station-rebel-strike");
  });

  it("returns an empty array for an unknown celestial body id", () => {
    const stations = EnemyStationRegistry.getStationsByBody("unknown-body");
    expect(stations).toEqual([]);
  });
});

// ── createInitialStates ───────────────────────────────────────────────────────

describe("EnemyStationRegistry.createInitialStates", () => {
  it("produces one state entry per registered station", () => {
    // Given there are four stations
    const states = EnemyStationRegistry.createInitialStates();

    expect(states).toHaveLength(EnemyStationRegistry.getAllStations().length);
  });

  it("every initial state is dormant and not destroyed", () => {
    const states = EnemyStationRegistry.createInitialStates();

    for (const state of states) {
      expect(state.alertLevel).toBe("dormant");
      expect(state.isDestroyed).toBe(false);
    }
  });

  it("every initial state has full hull and shields matching the definition", () => {
    const states = EnemyStationRegistry.createInitialStates();

    for (const state of states) {
      const def = EnemyStationRegistry.getStation(state.stationId)!;
      expect(state.currentHull).toBe(def.hullHealth);
      expect(state.currentShield).toBe(def.shieldCapacity);
    }
  });

  it("every initial state has an empty activeEnemyIds list and lastSpawnAtMs of 0", () => {
    const states = EnemyStationRegistry.createInitialStates();

    for (const state of states) {
      expect(state.activeEnemyIds).toEqual([]);
      expect(state.lastSpawnAtMs).toBe(0);
    }
  });

  it("each state's stationId references a registered station definition", () => {
    const states = EnemyStationRegistry.createInitialStates();

    for (const state of states) {
      const def = EnemyStationRegistry.getStation(state.stationId);
      expect(def).toBeDefined();
    }
  });
});

// ── Shape invariants ──────────────────────────────────────────────────────────

describe("EnemyStationRegistry — shape invariants", () => {
  it("every station has at least one turret, max active ship slot, and ships per wave", () => {
    for (const s of EnemyStationRegistry.getAllStations()) {
      expect(s.turrets.count).toBeGreaterThan(0);
      expect(s.spawnConfig.maxActiveShips).toBeGreaterThan(0);
      expect(s.spawnConfig.shipsPerWave).toBeGreaterThan(0);
    }
  });

  it("every station's alertRadiusKm is larger than its turret rangeKm", () => {
    // Ensures the station alerts before its turrets can reach the player.
    for (const s of EnemyStationRegistry.getAllStations()) {
      expect(s.alertRadiusKm).toBeGreaterThan(s.turrets.rangeKm);
    }
  });

  it("every station's spawn config references at least one valid enemy type", () => {
    const validTypes = new Set([
      "grunt", "spinner", "stalker", "darter", "orbiter",
      "lancer", "torpedoer", "cannoneer", "pulsar",
    ]);
    for (const s of EnemyStationRegistry.getAllStations()) {
      expect(s.spawnConfig.shipTypes.length).toBeGreaterThan(0);
      for (const type of s.spawnConfig.shipTypes) {
        expect(validTypes.has(type)).toBe(true);
      }
    }
  });

  it("every station's spawn radius is smaller than its alert radius", () => {
    // Ships should spawn near the station, not at the edge of its alert zone.
    for (const s of EnemyStationRegistry.getAllStations()) {
      expect(s.spawnConfig.spawnRadiusKm).toBeLessThan(s.alertRadiusKm);
    }
  });

  it("rebel forward post is the most heavily defended station", () => {
    // Narrative / balance check: the primary rebel staging area is the strongest.
    const forward = EnemyStationRegistry.getStation("enemy-station-rebel-forward")!;
    const all = EnemyStationRegistry.getAllStations();
    const maxHull = Math.max(...all.map((s) => s.hullHealth));
    const maxShield = Math.max(...all.map((s) => s.shieldCapacity));
    expect(forward.hullHealth).toBe(maxHull);
    expect(forward.shieldCapacity).toBe(maxShield);
  });
});

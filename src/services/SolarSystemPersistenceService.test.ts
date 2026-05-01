import { describe, expect, it } from "vitest";
import { InMemoryStorage, StorageMigrationError } from "./LocalStorageService";
import {
  SolarSystemPersistenceService,
  type PersistedSolarSystemState,
} from "./SolarSystemPersistenceService";
import type { CapitalShipState } from "../types/capital-ship";
import type { TargetingState } from "../systems/combat/types";

/**
 * Integration-first test suite for SolarSystemPersistenceService.
 *
 * Tests focus on the **boundary contract**: what goes in must come out unchanged
 * (modulo timestamp updates), and state persists across saves/loads.
 */

function createMockShipState(): CapitalShipState {
  return {
    blueprintId: "blueprint-1",
    position: { x: 100, y: 200 },
    velocity: { x: 10, y: 20 },
    heading: 45,
    health: 100,
    maxHealth: 100,
    shieldsFront: 50,
    shieldsRear: 75,
    weapons: [
      {
        upgradeId: "weapon-1",
        ammo: 100,
        cooldownMs: 0,
      },
    ],
    isInCombat: true,
    targetShipId: "enemy-1",
    lastDamagedAt: Date.now(),
  };
}

function createMockTargetingState(): TargetingState {
  return {
    allLocks: [
      {
        id: "lock-1",
        targetId: "enemy-1",
        targetName: "Scav Fighter",
        lockedAtMs: Date.now() - 5000,
        distanceKm: 25.5,
        isFocused: true,
        lockStrength: 0.95,
      },
      {
        id: "lock-2",
        targetId: "enemy-2",
        targetName: "Scav Scout",
        lockedAtMs: Date.now() - 3000,
        distanceKm: 45.0,
        isFocused: false,
        lockStrength: 0.7,
      },
    ],
    focusedLockId: "lock-1",
    lastTabCycleMs: Date.now() - 1000,
    lastClickLockMs: Date.now() - 2000,
  };
}

describe("SolarSystemPersistenceService", () => {
  describe("happy path: save and load", () => {
    it("persists ship state and locks, restoring them unchanged on load", () => {
      const storage = new InMemoryStorage();
      const svc = new SolarSystemPersistenceService(storage);

      const state: PersistedSolarSystemState = {
        shipState: createMockShipState(),
        playerTargetingState: createMockTargetingState(),
        dockedLocationId: null,
        primaryGravitySourceId: "sun",
        zoomLevel: 1.5,
        discoveredLocations: ["earth-orbit", "mars-base"],
        enemyStationStates: {
          "station-scav-1": {
            stationId: "station-scav-1",
            currentHull: 500,
            currentShield: 200,
            alertLevel: "combat",
            activeEnemyIds: ["enemy-1", "enemy-2"],
            lastSpawnAtMs: Date.now() - 2000,
            isDestroyed: false,
          },
        },
        savedAtMs: Date.now(),
      };

      // Save
      svc.save(state);

      // Load
      const loaded = svc.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.shipState).toEqual(state.shipState);
      expect(loaded!.playerTargetingState).toEqual(state.playerTargetingState);
      expect(loaded!.dockedLocationId).toBe(null);
      expect(loaded!.discoveredLocations).toEqual(["earth-orbit", "mars-base"]);
      expect(loaded!.enemyStationStates).toEqual(state.enemyStationStates);
    });

    it("handles docked state with pre-dock snapshot", () => {
      const storage = new InMemoryStorage();
      const svc = new SolarSystemPersistenceService(storage);

      const state: PersistedSolarSystemState = {
        shipState: createMockShipState(),
        dockedLocationId: "earth-orbit-station",
        preDockSnapshot: {
          position: { x: 50, y: 100 },
          velocity: { x: 5, y: 10 },
          heading: 90,
          stationId: "earth-orbit-station",
          stationPosition: { x: 200, y: 300 },
        },
        primaryGravitySourceId: "earth",
        zoomLevel: 1.0,
        discoveredLocations: ["earth-orbit"],
        savedAtMs: Date.now(),
      };

      svc.save(state);
      const loaded = svc.load();

      expect(loaded).not.toBeNull();
      expect(loaded!.dockedLocationId).toBe("earth-orbit-station");
      expect(loaded!.preDockSnapshot).toEqual(state.preDockSnapshot);
    });

    it("persists multiple enemy stations with different alert levels", () => {
      const storage = new InMemoryStorage();
      const svc = new SolarSystemPersistenceService(storage);

      const state: PersistedSolarSystemState = {
        shipState: createMockShipState(),
        dockedLocationId: null,
        primaryGravitySourceId: "sun",
        zoomLevel: 1.0,
        discoveredLocations: [],
        enemyStationStates: {
          "dormant-station": {
            stationId: "dormant-station",
            currentHull: 1000,
            currentShield: 500,
            alertLevel: "dormant",
            activeEnemyIds: [],
            lastSpawnAtMs: 0,
            isDestroyed: false,
          },
          "combat-station": {
            stationId: "combat-station",
            currentHull: 200,
            currentShield: 0,
            alertLevel: "combat",
            activeEnemyIds: ["e1", "e2", "e3"],
            lastSpawnAtMs: Date.now(),
            isDestroyed: false,
          },
          "destroyed-station": {
            stationId: "destroyed-station",
            currentHull: 0,
            currentShield: 0,
            alertLevel: "combat",
            activeEnemyIds: [],
            lastSpawnAtMs: 0,
            isDestroyed: true,
          },
        },
        savedAtMs: Date.now(),
      };

      svc.save(state);
      const loaded = svc.load();

      expect(loaded!.enemyStationStates).toEqual(state.enemyStationStates);
      // Type guard: if we got here, enemyStationStates must exist (from previous expect)
      expect(loaded!.enemyStationStates?.["destroyed-station"]?.isDestroyed).toBe(
        true,
      );
    });
  });

  describe("unhappy paths", () => {
    it("returns null when no save exists", () => {
      const storage = new InMemoryStorage();
      const svc = new SolarSystemPersistenceService(storage);
      expect(svc.load()).toBeNull();
    });

    it("throws StorageMigrationError on corrupt JSON", () => {
      const storage = new InMemoryStorage();
      storage.setItem("rwipe.solarsystem.v1", "{not-valid-json");
      const svc = new SolarSystemPersistenceService(storage);
      expect(() => svc.load()).toThrow(StorageMigrationError);
    });

    it("throws StorageMigrationError when required fields are missing", () => {
      const storage = new InMemoryStorage();
      // Store envelope with missing shipState
      storage.setItem(
        "rwipe.solarsystem.v1",
        JSON.stringify({
          schemaVersion: 1,
          data: { dockedLocationId: null, primaryGravitySourceId: "sun" },
        }),
      );
      const svc = new SolarSystemPersistenceService(storage);
      expect(() => svc.load()).toThrow(StorageMigrationError);
    });

    it("throws when stored version is newer than app version", () => {
      const storage = new InMemoryStorage();
      // Simulate a future version
      storage.setItem(
        "rwipe.solarsystem.v1",
        JSON.stringify({
          schemaVersion: 99,
          data: {
            shipState: createMockShipState(),
            dockedLocationId: null,
            primaryGravitySourceId: "sun",
            zoomLevel: 1.0,
            discoveredLocations: [],
            savedAtMs: Date.now(),
          },
        }),
      );
      const svc = new SolarSystemPersistenceService(storage);
      expect(() => svc.load()).toThrow(StorageMigrationError);
    });
  });

  describe("boundary: state mutations do not affect persisted data", () => {
    it("modifying loaded state does not affect future loads", () => {
      const storage = new InMemoryStorage();
      const svc = new SolarSystemPersistenceService(storage);

      const shipState = createMockShipState();
      const locks = createMockTargetingState();
      const original: PersistedSolarSystemState = {
        shipState,
        playerTargetingState: locks,
        dockedLocationId: null,
        primaryGravitySourceId: "sun",
        zoomLevel: 1.0,
        discoveredLocations: ["loc-1", "loc-2"],
        savedAtMs: Date.now(),
      };

      svc.save(original);
      const loaded1 = svc.load();

      // Mutate the loaded state
      if (loaded1 && loaded1.discoveredLocations) {
        loaded1.discoveredLocations.push("loc-3");
        loaded1.shipState.health = 0;
      }

      // Load again and verify original is unchanged
      const loaded2 = svc.load();
      expect(loaded2!.discoveredLocations).toEqual(["loc-1", "loc-2"]);
      expect(loaded2!.shipState.health).toBe(100);
    });
  });

  describe("clear() operation", () => {
    it("removes persisted state from storage", () => {
      const storage = new InMemoryStorage();
      const svc = new SolarSystemPersistenceService(storage);

      const state: PersistedSolarSystemState = {
        shipState: createMockShipState(),
        dockedLocationId: null,
        primaryGravitySourceId: "sun",
        zoomLevel: 1.0,
        discoveredLocations: [],
        savedAtMs: Date.now(),
      };

      svc.save(state);
      expect(svc.load()).not.toBeNull();

      svc.clear();
      expect(svc.load()).toBeNull();
    });
  });

  describe("timestamp handling", () => {
    it("updates savedAtMs to current time on each save", () => {
      const storage = new InMemoryStorage();
      const svc = new SolarSystemPersistenceService(storage);

      const state: PersistedSolarSystemState = {
        shipState: createMockShipState(),
        dockedLocationId: null,
        primaryGravitySourceId: "sun",
        zoomLevel: 1.0,
        discoveredLocations: [],
        savedAtMs: 12345, // old timestamp
      };

      const beforeSave = Date.now();
      svc.save(state);
      const afterSave = Date.now();

      const loaded = svc.load();
      expect(loaded!.savedAtMs).toBeGreaterThanOrEqual(beforeSave);
      expect(loaded!.savedAtMs).toBeLessThanOrEqual(afterSave);
    });
  });

  describe("large state handling", () => {
    it("persists and restores a large number of locks", () => {
      const storage = new InMemoryStorage();
      const svc = new SolarSystemPersistenceService(storage);

      // Create a targeting state with many locks (approaching real combat scenario)
      const manyLocks: TargetingState = {
        allLocks: Array.from({ length: 50 }, (_, i) => ({
          id: `lock-${i}`,
          targetId: `enemy-${i}`,
          targetName: `Enemy ${i}`,
          lockedAtMs: Date.now() - i * 1000,
          distanceKm: 10 + i * 5,
          isFocused: i === 0,
          lockStrength: 1.0 - i * 0.01,
        })),
        focusedLockId: "lock-0",
        lastTabCycleMs: Date.now(),
        lastClickLockMs: Date.now(),
      };

      const state: PersistedSolarSystemState = {
        shipState: createMockShipState(),
        playerTargetingState: manyLocks,
        dockedLocationId: null,
        primaryGravitySourceId: "sun",
        zoomLevel: 1.0,
        discoveredLocations: Array.from({ length: 20 }, (_, i) => `location-${i}`),
        savedAtMs: Date.now(),
      };

      svc.save(state);
      const loaded = svc.load();

      expect(loaded!.playerTargetingState!.allLocks.length).toBe(50);
      expect(loaded!.discoveredLocations.length).toBe(20);
    });
  });
});

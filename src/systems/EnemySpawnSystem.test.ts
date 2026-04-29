/**
 * Tests for EnemySpawnSystem
 *
 * All tests are pure — no mocks, no external I/O. Every method is a pure
 * function that receives state and returns new state.
 *
 * Observable contracts under test:
 *
 *   updateAlertStates
 *     1. Dormant station transitions to alerted when player is within alertRadiusKm.
 *     2. Player exactly on the alert boundary triggers alert (inclusive).
 *     3. Player just outside alert radius leaves station dormant.
 *     4. Already-alerted station stays alerted (no revert).
 *     5. Combat station is unchanged.
 *     6. Destroyed station is unchanged.
 *     7. Unknown stationId in state leaves that state unchanged.
 *
 *   escalateToCombat
 *     8. Alerted station becomes combat.
 *     9. Dormant station is unchanged (must go through alerted first).
 *     10. Already-combat station is unchanged.
 *     11. Destroyed station is unchanged.
 *     12. Only the target station is affected; others unchanged.
 *
 *   trySpawn
 *     13. Returns no-spawn when station is dormant.
 *     14. Returns no-spawn when station is alerted (not combat).
 *     15. Returns no-spawn when destroyed.
 *     16. Returns no-spawn when cooldown has not elapsed.
 *     17. Returns no-spawn when maxActiveShips is already reached.
 *     18. Happy path: returns didSpawn=true, correct position count, updated lastSpawnAtMs.
 *     19. Wave size is capped by available slots when near maxActiveShips.
 *     20. First spawn fires immediately (lastSpawnAtMs starts at 0).
 *     21. All spawn positions are within spawnRadiusKm of the station centre.
 *
 *   registerSpawnedEnemies
 *     22. Adds ids to the correct station's activeEnemyIds.
 *     23. Other stations are not modified.
 *     24. Handles empty id list as a no-op.
 *
 *   onEnemyDestroyed
 *     25. Removes the enemy id from the tracking station's activeEnemyIds.
 *     26. No-op when id is not tracked by any station.
 *     27. Only removes the matching id; other ids are preserved.
 *
 *   applyDamage
 *     28. Shields absorb damage before hull takes any.
 *     29. Damage that exceeds shields overflows to hull.
 *     30. Station is destroyed when hull reaches 0.
 *     31. Destroyed station clears activeEnemyIds.
 *     32. Damage call on an already-destroyed station is a no-op.
 *     33. Damage exactly equal to shield depletes shields to 0 but hull unchanged.
 *
 *   rechargeShields
 *     34. Increases shield by rechargeRate × deltaMs/1000.
 *     35. Shield does not exceed shieldCapacity.
 *     36. Station at full shield receives no update.
 *     37. Destroyed station receives no recharge.
 *     38. Station with rechargeRate = 0 receives no recharge (uses custom station).
 *
 *   getActiveStations
 *     39. Returns only alerted and combat stations.
 *     40. Dormant stations are excluded.
 *     41. Destroyed stations are excluded.
 *     42. Returns paired definition + state for each active station.
 *
 *   getStationsInAlertRange
 *     43. Returns stations whose alertRadius encloses the player.
 *     44. Player exactly on the alert boundary is included (inclusive).
 *     45. Player outside all alert radii → empty list.
 */

import { describe, it, expect } from "vitest";
import { EnemySpawnSystem } from "./EnemySpawnSystem";
import { EnemyStationRegistry } from "../game/data/EnemyStationRegistry";
import type { EnemyStationDefinition, EnemyStationState } from "../types/combat";

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Build a minimal EnemyStationDefinition for isolated unit tests. */
function makeDefinition(
  overrides: Partial<EnemyStationDefinition> = {},
): EnemyStationDefinition {
  return {
    id: "test-station",
    name: "Test Station",
    factionId: "scavenger-clans",
    bodyId: "asteroid-belt",
    position: { x: 100, y: 100 },
    alertRadiusKm: 20,
    hullHealth: 500,
    shieldCapacity: 200,
    shieldRechargeRatePerS: 10,
    turrets: {
      count: 3,
      damagePerShot: 25,
      fireRateMs: 1000,
      rangeKm: 15,
      weaponKind: "bullet",
    },
    spawnConfig: {
      shipTypes: ["grunt", "darter"],
      maxActiveShips: 6,
      spawnIntervalMs: 5000,
      shipsPerWave: 2,
      spawnRadiusKm: 4,
    },
    ...overrides,
  };
}

/** Build a minimal EnemyStationState for isolated unit tests. */
function makeState(overrides: Partial<EnemyStationState> = {}): EnemyStationState {
  return {
    stationId: "test-station",
    currentHull: 500,
    currentShield: 200,
    alertLevel: "dormant",
    activeEnemyIds: [],
    lastSpawnAtMs: 0,
    isDestroyed: false,
    ...overrides,
  };
}

/** A deterministic RNG that returns a fixed sequence of values. */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

// ── (1–7) updateAlertStates ───────────────────────────────────────────────────

describe("EnemySpawnSystem.updateAlertStates — dormant → alerted transitions", () => {
  it("given player well inside alertRadiusKm, dormant station transitions to alerted", () => {
    // Given
    const def = makeDefinition({ position: { x: 0, y: 0 }, alertRadiusKm: 20 });
    const state = makeState({ alertLevel: "dormant" });
    const playerPos = { x: 10, y: 0 }; // 10 km — inside 20 km radius

    // When
    const result = EnemySpawnSystem.updateAlertStates(playerPos, [def], [state]);

    // Then
    expect(result[0]!.alertLevel).toBe("alerted");
  });

  it("given player exactly on the alert radius boundary, station is alerted (inclusive)", () => {
    // Given — player is exactly 20 km from station with alertRadiusKm = 20
    const def = makeDefinition({ position: { x: 0, y: 0 }, alertRadiusKm: 20 });
    const state = makeState({ alertLevel: "dormant" });
    const playerPos = { x: 20, y: 0 }; // exactly on boundary

    // When
    const result = EnemySpawnSystem.updateAlertStates(playerPos, [def], [state]);

    // Then — boundary is inclusive
    expect(result[0]!.alertLevel).toBe("alerted");
  });

  it("given player just outside the alert radius, station stays dormant", () => {
    // Given — player is 20.001 km away
    const def = makeDefinition({ position: { x: 0, y: 0 }, alertRadiusKm: 20 });
    const state = makeState({ alertLevel: "dormant" });
    const playerPos = { x: 20.001, y: 0 };

    // When
    const result = EnemySpawnSystem.updateAlertStates(playerPos, [def], [state]);

    // Then
    expect(result[0]!.alertLevel).toBe("dormant");
  });

  it("given an already-alerted station, stays alerted (no regression)", () => {
    // Given
    const def = makeDefinition({ position: { x: 0, y: 0 }, alertRadiusKm: 20 });
    const state = makeState({ alertLevel: "alerted" });
    const playerPos = { x: 5, y: 0 }; // well inside

    // When
    const result = EnemySpawnSystem.updateAlertStates(playerPos, [def], [state]);

    // Then
    expect(result[0]!.alertLevel).toBe("alerted");
  });

  it("given a combat station, it remains in combat regardless of player position", () => {
    // Given
    const def = makeDefinition({ position: { x: 0, y: 0 }, alertRadiusKm: 20 });
    const state = makeState({ alertLevel: "combat" });
    const playerPos = { x: 5, y: 0 };

    // When
    const result = EnemySpawnSystem.updateAlertStates(playerPos, [def], [state]);

    // Then — combat stations are only affected by escalateToCombat, not this method
    expect(result[0]!.alertLevel).toBe("combat");
  });

  it("given a destroyed station, it stays destroyed and unchanged", () => {
    // Given
    const def = makeDefinition({ position: { x: 0, y: 0 }, alertRadiusKm: 20 });
    const state = makeState({ isDestroyed: true, alertLevel: "dormant" });
    const playerPos = { x: 5, y: 0 };

    // When
    const result = EnemySpawnSystem.updateAlertStates(playerPos, [def], [state]);

    // Then
    expect(result[0]!.alertLevel).toBe("dormant");
    expect(result[0]!.isDestroyed).toBe(true);
  });

  it("given a state whose stationId has no matching definition, state is returned unchanged", () => {
    // Given — definition list is empty; state references an id that has no def
    const state = makeState({ stationId: "unknown-station", alertLevel: "dormant" });
    const playerPos = { x: 5, y: 0 };

    // When
    const result = EnemySpawnSystem.updateAlertStates(playerPos, [], [state]);

    // Then
    expect(result[0]).toEqual(state);
  });
});

// ── (8–12) escalateToCombat ───────────────────────────────────────────────────

describe("EnemySpawnSystem.escalateToCombat — alerted → combat", () => {
  it("given an alerted station, escalates it to combat", () => {
    // Given
    const state = makeState({ alertLevel: "alerted" });

    // When
    const result = EnemySpawnSystem.escalateToCombat("test-station", [state]);

    // Then
    expect(result[0]!.alertLevel).toBe("combat");
  });

  it("given a dormant station, escalateToCombat is a no-op", () => {
    // Given — must be alerted first; direct dormant → combat is not allowed
    const state = makeState({ alertLevel: "dormant" });

    // When
    const result = EnemySpawnSystem.escalateToCombat("test-station", [state]);

    // Then
    expect(result[0]!.alertLevel).toBe("dormant");
  });

  it("given an already-combat station, escalateToCombat is a no-op", () => {
    // Given
    const state = makeState({ alertLevel: "combat" });

    // When
    const result = EnemySpawnSystem.escalateToCombat("test-station", [state]);

    // Then
    expect(result[0]!.alertLevel).toBe("combat");
  });

  it("given a destroyed station, escalateToCombat is a no-op", () => {
    // Given
    const state = makeState({ alertLevel: "alerted", isDestroyed: true });

    // When
    const result = EnemySpawnSystem.escalateToCombat("test-station", [state]);

    // Then — destroyed stations are frozen
    expect(result[0]!.alertLevel).toBe("alerted");
  });

  it("only the targeted station is escalated; others are unchanged", () => {
    // Given — two stations: A is alerted, B is dormant
    const stateA = makeState({ stationId: "station-a", alertLevel: "alerted" });
    const stateB = makeState({ stationId: "station-b", alertLevel: "dormant" });

    // When — escalate only A
    const result = EnemySpawnSystem.escalateToCombat("station-a", [stateA, stateB]);

    // Then
    expect(result[0]!.alertLevel).toBe("combat");  // A escalated
    expect(result[1]!.alertLevel).toBe("dormant"); // B untouched
  });
});

// ── (13–21) trySpawn ──────────────────────────────────────────────────────────

describe("EnemySpawnSystem.trySpawn — spawn preconditions", () => {
  it("given station is dormant, no spawn occurs", () => {
    // Given
    const def = makeDefinition();
    const state = makeState({ alertLevel: "dormant" });

    // When
    const result = EnemySpawnSystem.trySpawn(def, state, 10000, Math.random);

    // Then
    expect(result.didSpawn).toBe(false);
    expect(result.spawnPositions).toHaveLength(0);
  });

  it("given station is alerted (not combat), no spawn occurs", () => {
    // Given
    const def = makeDefinition();
    const state = makeState({ alertLevel: "alerted" });

    // When
    const result = EnemySpawnSystem.trySpawn(def, state, 10000, Math.random);

    // Then — spawning only begins in combat mode
    expect(result.didSpawn).toBe(false);
  });

  it("given station is destroyed, no spawn occurs", () => {
    // Given
    const def = makeDefinition();
    const state = makeState({ alertLevel: "combat", isDestroyed: true });

    // When
    const result = EnemySpawnSystem.trySpawn(def, state, 10000, Math.random);

    // Then
    expect(result.didSpawn).toBe(false);
  });

  it("given cooldown has not elapsed, no spawn occurs", () => {
    // Given — spawnIntervalMs = 5000; only 2000 ms have passed since last spawn
    const def = makeDefinition({ spawnConfig: {
      shipTypes: ["grunt"],
      maxActiveShips: 6,
      spawnIntervalMs: 5000,
      shipsPerWave: 2,
      spawnRadiusKm: 4,
    }});
    const state = makeState({
      alertLevel: "combat",
      lastSpawnAtMs: 8000,
    });

    // When — current time is 10000; 10000 − 8000 = 2000 < 5000
    const result = EnemySpawnSystem.trySpawn(def, state, 10000, Math.random);

    // Then
    expect(result.didSpawn).toBe(false);
  });

  it("given maxActiveShips is already reached, no spawn occurs", () => {
    // Given — 6 ships already active, max is 6
    const def = makeDefinition({ spawnConfig: {
      shipTypes: ["grunt"],
      maxActiveShips: 6,
      spawnIntervalMs: 5000,
      shipsPerWave: 2,
      spawnRadiusKm: 4,
    }});
    const state = makeState({
      alertLevel: "combat",
      lastSpawnAtMs: 0,
      activeEnemyIds: ["e1", "e2", "e3", "e4", "e5", "e6"],
    });

    // When — cooldown elapsed (time = 10000 > 0 + 5000)
    const result = EnemySpawnSystem.trySpawn(def, state, 10000, Math.random);

    // Then
    expect(result.didSpawn).toBe(false);
  });
});

describe("EnemySpawnSystem.trySpawn — successful spawn", () => {
  it("happy path: returns didSpawn=true with the expected number of positions", () => {
    // Given — station is in combat, cooldown elapsed, slots available
    const def = makeDefinition({
      position: { x: 100, y: 100 },
      spawnConfig: {
        shipTypes: ["grunt", "darter"],
        maxActiveShips: 6,
        spawnIntervalMs: 5000,
        shipsPerWave: 2,
        spawnRadiusKm: 4,
      },
    });
    const state = makeState({ alertLevel: "combat", lastSpawnAtMs: 0, activeEnemyIds: [] });
    const rng = seededRng([0.5, 0.75, 0.25, 0.9]);

    // When — first ever spawn (lastSpawnAtMs = 0)
    const result = EnemySpawnSystem.trySpawn(def, state, 5000, rng);

    // Then
    expect(result.didSpawn).toBe(true);
    expect(result.spawnPositions).toHaveLength(2); // shipsPerWave = 2
  });

  it("updates lastSpawnAtMs to currentTimeMs", () => {
    // Given
    const def = makeDefinition();
    const state = makeState({ alertLevel: "combat", lastSpawnAtMs: 0 });

    // When
    const result = EnemySpawnSystem.trySpawn(def, state, 12345, seededRng([0.5, 0.5, 0.5, 0.5]));

    // Then
    expect(result.updatedState.lastSpawnAtMs).toBe(12345);
  });

  it("first spawn fires immediately (lastSpawnAtMs = 0, currentTimeMs = 0 + interval)", () => {
    // Given — station just entered combat; lastSpawnAtMs = 0; interval = 5000
    const def = makeDefinition({ spawnConfig: {
      shipTypes: ["grunt"],
      maxActiveShips: 6,
      spawnIntervalMs: 5000,
      shipsPerWave: 1,
      spawnRadiusKm: 2,
    }});
    const state = makeState({ alertLevel: "combat", lastSpawnAtMs: 0 });

    // When — exactly one interval has elapsed
    const result = EnemySpawnSystem.trySpawn(def, state, 5000, seededRng([0.5, 0.5]));

    // Then
    expect(result.didSpawn).toBe(true);
  });

  it("wave size is limited by available slots when near maxActiveShips", () => {
    // Given — 5 active ships, max is 6, wave size is 3 → only 1 slot left
    const def = makeDefinition({ spawnConfig: {
      shipTypes: ["grunt"],
      maxActiveShips: 6,
      spawnIntervalMs: 5000,
      shipsPerWave: 3,
      spawnRadiusKm: 4,
    }});
    const state = makeState({
      alertLevel: "combat",
      lastSpawnAtMs: 0,
      activeEnemyIds: ["e1", "e2", "e3", "e4", "e5"],
    });

    // When — cooldown elapsed (5001 > 0 + 5000)
    const result = EnemySpawnSystem.trySpawn(def, state, 5001, seededRng([0.5, 0.5, 0.5, 0.5]));

    // Then — only 1 ship can spawn (6 - 5 = 1 slot)
    expect(result.didSpawn).toBe(true);
    expect(result.spawnPositions).toHaveLength(1);
  });

  it("all spawn positions are within spawnRadiusKm of the station centre", () => {
    // Given
    const def = makeDefinition({
      position: { x: 0, y: 0 },
      spawnConfig: {
        shipTypes: ["grunt"],
        maxActiveShips: 10,
        spawnIntervalMs: 1000,
        shipsPerWave: 3,
        spawnRadiusKm: 5,
      },
    });
    const state = makeState({ alertLevel: "combat", lastSpawnAtMs: 0, activeEnemyIds: [] });

    // Use real Math.random — we only check the constraint, not exact positions.
    const result = EnemySpawnSystem.trySpawn(def, state, 1000, Math.random);

    expect(result.didSpawn).toBe(true);
    for (const pos of result.spawnPositions) {
      const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      expect(dist).toBeLessThanOrEqual(5 + 1e-9); // spawnRadiusKm + floating-point epsilon
    }
  });
});

// ── (22–24) registerSpawnedEnemies ────────────────────────────────────────────

describe("EnemySpawnSystem.registerSpawnedEnemies", () => {
  it("appends new enemy ids to the correct station's activeEnemyIds", () => {
    // Given
    const state = makeState({ activeEnemyIds: ["e1"] });

    // When
    const result = EnemySpawnSystem.registerSpawnedEnemies(
      "test-station",
      ["e2", "e3"],
      [state],
    );

    // Then
    expect(result[0]!.activeEnemyIds).toEqual(["e1", "e2", "e3"]);
  });

  it("other stations are not modified", () => {
    // Given — two stations
    const stateA = makeState({ stationId: "station-a", activeEnemyIds: ["e1"] });
    const stateB = makeState({ stationId: "station-b", activeEnemyIds: [] });

    // When — register to A only
    const result = EnemySpawnSystem.registerSpawnedEnemies(
      "station-a",
      ["e2"],
      [stateA, stateB],
    );

    // Then
    expect(result[0]!.activeEnemyIds).toEqual(["e1", "e2"]); // A updated
    expect(result[1]!.activeEnemyIds).toEqual([]); // B unchanged
  });

  it("handles an empty id list as a no-op", () => {
    // Given
    const state = makeState({ activeEnemyIds: ["e1"] });

    // When
    const result = EnemySpawnSystem.registerSpawnedEnemies(
      "test-station",
      [],
      [state],
    );

    // Then — no change
    expect(result[0]!.activeEnemyIds).toEqual(["e1"]);
  });
});

// ── (25–27) onEnemyDestroyed ──────────────────────────────────────────────────

describe("EnemySpawnSystem.onEnemyDestroyed", () => {
  it("removes the enemy id from the tracking station's activeEnemyIds", () => {
    // Given
    const state = makeState({ activeEnemyIds: ["e1", "e2", "e3"] });

    // When
    const result = EnemySpawnSystem.onEnemyDestroyed("e2", [state]);

    // Then
    expect(result[0]!.activeEnemyIds).toEqual(["e1", "e3"]);
  });

  it("is a no-op when the id is not tracked by any station", () => {
    // Given
    const state = makeState({ activeEnemyIds: ["e1", "e2"] });

    // When
    const result = EnemySpawnSystem.onEnemyDestroyed("unknown-id", [state]);

    // Then — state is returned unchanged
    expect(result[0]!.activeEnemyIds).toEqual(["e1", "e2"]);
  });

  it("only removes the matching id; other ids are preserved", () => {
    // Given — two stations; only one tracks the enemy
    const stateA = makeState({ stationId: "station-a", activeEnemyIds: ["e1", "target"] });
    const stateB = makeState({ stationId: "station-b", activeEnemyIds: ["e2"] });

    // When
    const result = EnemySpawnSystem.onEnemyDestroyed("target", [stateA, stateB]);

    // Then
    expect(result[0]!.activeEnemyIds).toEqual(["e1"]);  // "target" removed from A
    expect(result[1]!.activeEnemyIds).toEqual(["e2"]); // B unchanged
  });
});

// ── (28–33) applyDamage ───────────────────────────────────────────────────────

describe("EnemySpawnSystem.applyDamage — shield-before-hull model", () => {
  it("shields absorb damage before hull takes any", () => {
    // Given — station with 200 shield, 500 hull; 80 damage applied
    const state = makeState({ currentShield: 200, currentHull: 500 });

    // When
    const result = EnemySpawnSystem.applyDamage("test-station", 80, [state]);

    // Then — shield drops, hull untouched
    expect(result[0]!.currentShield).toBe(120); // 200 - 80
    expect(result[0]!.currentHull).toBe(500);    // unchanged
    expect(result[0]!.isDestroyed).toBe(false);
  });

  it("damage exceeding shield capacity overflows to hull", () => {
    // Given — 50 shield remaining, 300 hull; 150 damage applied
    const state = makeState({ currentShield: 50, currentHull: 300 });

    // When
    const result = EnemySpawnSystem.applyDamage("test-station", 150, [state]);

    // Then — shield gone, 100 overflow hits hull
    expect(result[0]!.currentShield).toBe(0);   // shield depleted
    expect(result[0]!.currentHull).toBe(200);   // 300 - 100 overflow
    expect(result[0]!.isDestroyed).toBe(false);
  });

  it("station is destroyed when hull reaches exactly 0", () => {
    // Given — no shield, 100 hull; 100 damage
    const state = makeState({ currentShield: 0, currentHull: 100, activeEnemyIds: ["e1", "e2"] });

    // When
    const result = EnemySpawnSystem.applyDamage("test-station", 100, [state]);

    // Then
    expect(result[0]!.currentHull).toBe(0);
    expect(result[0]!.isDestroyed).toBe(true);
  });

  it("destruction clears activeEnemyIds so caller knows no more spawns are expected", () => {
    // Given — station with active ships
    const state = makeState({
      currentShield: 0,
      currentHull: 50,
      activeEnemyIds: ["e1", "e2", "e3"],
    });

    // When — overkill damage
    const result = EnemySpawnSystem.applyDamage("test-station", 200, [state]);

    // Then
    expect(result[0]!.isDestroyed).toBe(true);
    expect(result[0]!.activeEnemyIds).toEqual([]);
  });

  it("damage on an already-destroyed station is a no-op", () => {
    // Given — already destroyed
    const state = makeState({ isDestroyed: true, currentHull: 0, currentShield: 0 });
    const originalState = { ...state };

    // When — apply more damage
    const result = EnemySpawnSystem.applyDamage("test-station", 100, [state]);

    // Then — no change
    expect(result[0]).toEqual(originalState);
  });

  it("damage exactly equal to shield depletes shields to 0 but hull is unchanged", () => {
    // Given — 200 shield, 500 hull; exactly 200 damage
    const state = makeState({ currentShield: 200, currentHull: 500 });

    // When
    const result = EnemySpawnSystem.applyDamage("test-station", 200, [state]);

    // Then
    expect(result[0]!.currentShield).toBe(0);
    expect(result[0]!.currentHull).toBe(500);
    expect(result[0]!.isDestroyed).toBe(false);
  });
});

// ── (34–38) rechargeShields ───────────────────────────────────────────────────

describe("EnemySpawnSystem.rechargeShields", () => {
  it("increases shield by rechargeRate × deltaMs/1000", () => {
    // Given — station with 10 HP/s recharge, 50 shield remaining, capacity 200
    const def = makeDefinition({ shieldRechargeRatePerS: 10, shieldCapacity: 200 });
    const state = makeState({ currentShield: 50 });

    // When — 1000 ms tick
    const result = EnemySpawnSystem.rechargeShields(1000, [def], [state]);

    // Then — 50 + (10 * 1000/1000) = 60
    expect(result[0]!.currentShield).toBeCloseTo(60, 5);
  });

  it("shield does not exceed shieldCapacity", () => {
    // Given — station with 100 HP/s recharge and shield almost full (195/200)
    const def = makeDefinition({ shieldRechargeRatePerS: 100, shieldCapacity: 200 });
    const state = makeState({ currentShield: 195 });

    // When — 1000 ms tick would add 100, but cap is 200
    const result = EnemySpawnSystem.rechargeShields(1000, [def], [state]);

    // Then — capped at capacity
    expect(result[0]!.currentShield).toBe(200);
  });

  it("station already at full shield receives no update", () => {
    // Given
    const def = makeDefinition({ shieldRechargeRatePerS: 10, shieldCapacity: 200 });
    const state = makeState({ currentShield: 200 });

    // When
    const result = EnemySpawnSystem.rechargeShields(1000, [def], [state]);

    // Then — state object is returned as-is
    expect(result[0]).toBe(state);
  });

  it("destroyed station receives no shield recharge", () => {
    // Given
    const def = makeDefinition({ shieldRechargeRatePerS: 10, shieldCapacity: 200 });
    const state = makeState({ isDestroyed: true, currentShield: 0 });

    // When
    const result = EnemySpawnSystem.rechargeShields(1000, [def], [state]);

    // Then
    expect(result[0]!.currentShield).toBe(0);
    expect(result[0]).toBe(state); // same reference
  });

  it("station with zero recharge rate receives no recharge", () => {
    // Given — custom definition with no recharge
    const def = makeDefinition({ shieldRechargeRatePerS: 0, shieldCapacity: 200 });
    const state = makeState({ currentShield: 50 });

    // When
    const result = EnemySpawnSystem.rechargeShields(1000, [def], [state]);

    // Then
    expect(result[0]).toBe(state); // unchanged
  });
});

// ── (39–42) getActiveStations ─────────────────────────────────────────────────

describe("EnemySpawnSystem.getActiveStations", () => {
  it("returns only alerted and combat stations; excludes dormant", () => {
    // Given — three stations in different alert states
    const defA = makeDefinition({ id: "station-a" });
    const defB = makeDefinition({ id: "station-b" });
    const defC = makeDefinition({ id: "station-c" });
    const stateA = makeState({ stationId: "station-a", alertLevel: "dormant" });
    const stateB = makeState({ stationId: "station-b", alertLevel: "alerted" });
    const stateC = makeState({ stationId: "station-c", alertLevel: "combat" });

    // When
    const result = EnemySpawnSystem.getActiveStations(
      [defA, defB, defC],
      [stateA, stateB, stateC],
    );

    // Then — only B and C are returned
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.definition.id);
    expect(ids).not.toContain("station-a");
    expect(ids).toContain("station-b");
    expect(ids).toContain("station-c");
  });

  it("excludes destroyed stations even if they are in combat mode", () => {
    // Given
    const def = makeDefinition();
    const state = makeState({ alertLevel: "combat", isDestroyed: true });

    // When
    const result = EnemySpawnSystem.getActiveStations([def], [state]);

    // Then
    expect(result).toHaveLength(0);
  });

  it("returns paired definition and state objects for each active station", () => {
    // Given
    const def = makeDefinition({ id: "test-station" });
    const state = makeState({ stationId: "test-station", alertLevel: "combat" });

    // When
    const result = EnemySpawnSystem.getActiveStations([def], [state]);

    // Then — returns the definition/state pair
    expect(result).toHaveLength(1);
    expect(result[0]!.definition).toBe(def);
    expect(result[0]!.state).toBe(state);
  });
});

// ── (43–45) getStationsInAlertRange ──────────────────────────────────────────

describe("EnemySpawnSystem.getStationsInAlertRange", () => {
  it("returns stations whose alertRadiusKm encloses the player", () => {
    // Given — two stations; player is within A's radius but outside B's
    const defA = makeDefinition({ id: "station-a", position: { x: 0, y: 0 }, alertRadiusKm: 20 });
    const defB = makeDefinition({ id: "station-b", position: { x: 100, y: 0 }, alertRadiusKm: 10 });
    const playerPos = { x: 10, y: 0 }; // 10 km from A (inside 20), 90 km from B (outside 10)

    // When
    const result = EnemySpawnSystem.getStationsInAlertRange(playerPos, [defA, defB]);

    // Then
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("station-a");
  });

  it("player exactly on the alert boundary is included (inclusive)", () => {
    // Given
    const def = makeDefinition({ position: { x: 0, y: 0 }, alertRadiusKm: 15 });
    const playerPos = { x: 15, y: 0 }; // exactly 15 km away

    // When
    const result = EnemySpawnSystem.getStationsInAlertRange(playerPos, [def]);

    // Then
    expect(result).toHaveLength(1);
  });

  it("returns empty list when player is outside all alert radii", () => {
    // Given
    const defA = makeDefinition({ id: "station-a", position: { x: 0, y: 0 }, alertRadiusKm: 10 });
    const defB = makeDefinition({ id: "station-b", position: { x: 50, y: 0 }, alertRadiusKm: 10 });
    const playerPos = { x: 200, y: 200 }; // far from everything

    // When
    const result = EnemySpawnSystem.getStationsInAlertRange(playerPos, [defA, defB]);

    // Then
    expect(result).toHaveLength(0);
  });
});

// ── Gherkin: end-to-end encounter lifecycle ───────────────────────────────────

describe("Scenario: Enemy station encounters the player and spawns a wave of ships", () => {
  /**
   * Given: a hostile enemy station is dormant
   *   And: the player navigates within the station's alert radius
   *  When: the system updates alert states
   *  Then: the station transitions to alerted
   *  When: the combat escalation is triggered
   *  Then: the station transitions to combat
   *  When: the spawn cooldown elapses
   *  Then: a wave of enemy ships is spawned around the station
   *   And: their ids are registered with the station
   *  When: one ship is destroyed
   *  Then: its id is removed from the station's active fleet
   */
  it("full encounter lifecycle: dormant → alerted → combat → spawn → destruction", () => {
    // Setup: use a real station from the registry
    const def = EnemyStationRegistry.getStation("enemy-station-scav-belt")!;
    const [initialState] = EnemyStationRegistry.createInitialStates().filter(
      (s) => s.stationId === "enemy-station-scav-belt",
    );
    expect(initialState).toBeDefined();
    let states = [initialState!];

    // Given — player outside alert radius
    const farPos = { x: def.position.x + def.alertRadiusKm + 5, y: def.position.y };
    states = EnemySpawnSystem.updateAlertStates(farPos, [def], states);
    expect(states[0]!.alertLevel).toBe("dormant");

    // When — player moves within alert radius
    const approachPos = { x: def.position.x + def.alertRadiusKm * 0.5, y: def.position.y };
    states = EnemySpawnSystem.updateAlertStates(approachPos, [def], states);

    // Then
    expect(states[0]!.alertLevel).toBe("alerted");

    // When — combat is escalated (delay passed / station fires first shot)
    states = EnemySpawnSystem.escalateToCombat(def.id, states);

    // Then
    expect(states[0]!.alertLevel).toBe("combat");

    // When — spawn cooldown elapses (spawnIntervalMs has passed since lastSpawnAtMs = 0)
    const spawnTime = def.spawnConfig.spawnIntervalMs;
    const spawnResult = EnemySpawnSystem.trySpawn(def, states[0]!, spawnTime, Math.random);

    // Then — spawn fires
    expect(spawnResult.didSpawn).toBe(true);
    expect(spawnResult.spawnPositions.length).toBe(def.spawnConfig.shipsPerWave);

    // When — caller creates entities and registers their ids
    const newIds = spawnResult.spawnPositions.map((_, i) => `spawned-enemy-${i}`);
    states = [spawnResult.updatedState];
    states = EnemySpawnSystem.registerSpawnedEnemies(def.id, newIds, states);

    // Then — station tracks the active fleet
    expect(states[0]!.activeEnemyIds).toEqual(newIds);

    // When — one enemy is destroyed
    const destroyedId = newIds[0]!;
    states = EnemySpawnSystem.onEnemyDestroyed(destroyedId, states);

    // Then — that id is removed; others remain
    expect(states[0]!.activeEnemyIds).not.toContain(destroyedId);
    expect(states[0]!.activeEnemyIds.length).toBe(newIds.length - 1);
  });
});

describe("Scenario: Player destroys a hostile enemy station", () => {
  /**
   * Given: a hostile station is in combat with active spawned ships
   *  When: the player deals enough damage to destroy the station
   *  Then: isDestroyed becomes true
   *   And: activeEnemyIds is cleared
   *   And: no further spawns occur
   *   And: shield recharge no longer applies
   */
  it("applying lethal damage destroys station and prevents further interaction", () => {
    // Given — station in combat with some active ships and partial shields
    const def = makeDefinition({
      hullHealth: 400,
      shieldCapacity: 200,
      shieldRechargeRatePerS: 10,
    });
    let states = [makeState({
      alertLevel: "combat",
      currentHull: 100,
      currentShield: 50,
      activeEnemyIds: ["fighter-1", "fighter-2"],
    })];

    // When — player fires enough to kill the station (150 > 50 shield + 100 hull)
    states = EnemySpawnSystem.applyDamage("test-station", 200, states);

    // Then
    expect(states[0]!.isDestroyed).toBe(true);
    expect(states[0]!.currentHull).toBe(0);
    expect(states[0]!.activeEnemyIds).toEqual([]);

    // And — no further spawns
    const spawnResult = EnemySpawnSystem.trySpawn(def, states[0]!, 99999, Math.random);
    expect(spawnResult.didSpawn).toBe(false);

    // And — shield recharge is a no-op
    const recharged = EnemySpawnSystem.rechargeShields(5000, [def], states);
    expect(recharged[0]).toBe(states[0]); // same reference; no update
  });
});

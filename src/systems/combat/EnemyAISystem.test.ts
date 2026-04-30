/**
 * Tests for EnemyAISystem
 *
 * Integration-first, no mocks: EnemyAISystem is a pure-logic module with no
 * I/O boundaries. All collaborators (TargetLockManager, ScannerEquipment,
 * TargetingState, CelestialBody) are real — no doubles or fakes needed.
 *
 * Observable contracts under test
 * ────────────────────────────────
 *
 * createState
 *   CS1.  Returns a fresh EnemyAIState with empty targeting state and the
 *         supplied scanner, position, and default NEUTRAL aggression.
 *   CS2.  An explicit initial aggression overrides the default.
 *
 * updateAggression
 *   AG1.  NEUTRAL enemy + player within vigilance range → becomes VIGILANT.
 *   AG2.  NEUTRAL enemy + player beyond vigilance range → stays NEUTRAL.
 *   AG3.  NEUTRAL enemy + player fires on it → becomes HOSTILE immediately
 *         (skips VIGILANT).
 *   AG4.  VIGILANT enemy + player fires on it → becomes HOSTILE.
 *   AG5.  VIGILANT enemy + player outside vigilance range → stays VIGILANT
 *         (no reversion to NEUTRAL).
 *   AG6.  HOSTILE enemy + any input → stays HOSTILE.
 *   AG7.  lastAggravatedByPlayerAt is set to nowMs when player fires.
 *   AG8.  lastAggravatedByPlayerAt is NOT set when aggression changes only
 *         due to proximity (NEUTRAL → VIGILANT).
 *
 * shouldEngage
 *   SE1.  NEUTRAL → false.
 *   SE2.  VIGILANT → true.
 *   SE3.  HOSTILE → true.
 *
 * canDetectPlayer
 *   CD1.  Player in scanner range, clear LOS → true.
 *   CD2.  Player beyond scanner range → false.
 *   CD3.  Player in range, blocked by opaque body (no penetration) → false.
 *   CD4.  Player in range, body present but scanner penetrates it → true.
 *   CD5.  Player in range, body off to the side (not on path) → true.
 *
 * acquirePlayerLock
 *   AP1.  HOSTILE enemy + player in range + clear LOS → lock acquired, returns true.
 *   AP2.  Player out of scanner range → no lock acquired, returns false.
 *   AP3.  Player in range but LOS blocked → no lock acquired.
 *   AP4.  Player already locked → returns false (no duplicate), existing lock kept.
 *   AP5.  Lock limit reached → returns false.
 *
 * validateEnemyLocks
 *   VE1.  Player still in range → lock kept.
 *   VE2.  Player moved out of range → lock broken, returned in broken ids.
 *   VE3.  Player destroyed (null position) → lock broken.
 *
 * getFocusedTarget
 *   FT1.  No locks held → returns undefined.
 *   FT2.  Lock acquired → returns the focused TargetLock.
 *   FT3.  After a lock is broken → returns undefined.
 *
 * tick — happy paths
 *   T1.  HOSTILE enemy + player in range: lock acquired, shouldFire=true.
 *   T2.  NEUTRAL enemy + player within vigilance range but not yet aggressive:
 *        aggression escalates to VIGILANT, lock acquired, shouldFire=true.
 *   T3.  Player fires on NEUTRAL enemy: aggression → HOSTILE, lock acquired,
 *        aggressionChanged=true, shouldFire=true.
 *   T4.  NEUTRAL enemy + player out of both vigilance range and scanner range:
 *        no aggression change, no lock, shouldFire=false.
 *
 * tick — unhappy branches
 *   T5.  NEUTRAL enemy + player in vigilance range but behind opaque body:
 *        aggression → VIGILANT but lock not acquired (LOS blocked).
 *   T6.  Active lock becomes stale mid-tick (player moved out of range):
 *        brokenLockIds populated, shouldFire=false afterward.
 *   T7.  aggressionChanged=false when aggression does not change.
 *   T8.  HOSTILE enemy with no LOS to player: lock cannot be acquired,
 *        shouldFire=false.
 *
 * Multi-enemy independence
 *   ME1. Ticking enemy A does not affect enemy B's state.
 *   ME2. Two enemies with different scanners behave independently (one locks,
 *        one does not).
 */

import { describe, expect, it } from "vitest";
import { EnemyAISystem } from "./EnemyAISystem";
import type { EnemyAIState } from "./EnemyAISystem";
import { TargetLockManager } from "./TargetLockManager";
import { Aggression } from "./types";
import type { ScannerEquipment } from "./types";
import type { CelestialBody } from "../../types/solarsystem";

// ── Shared test helpers ───────────────────────────────────────────────────────

/** Minimal OrbitalParams stub (satisfies the CelestialBody shape). */
const STUB_ORBITAL: CelestialBody["orbital"] = {
  parentId: "star-1",
  semiMajorAxis: 100_000,
  eccentricity: 0,
  inclination: 0,
  longitudeAscendingNode: 0,
  argumentOfPeriapsis: 0,
  meanAnomalyAtEpoch: 0,
  orbitalPeriodMs: 1e10,
  currentAnomaly: 0,
};

function makeBody(
  overrides: Partial<CelestialBody> & { type: CelestialBody["type"] },
): CelestialBody {
  return {
    id: "body-test",
    name: "Test Body",
    position: { x: 0, y: 0 },
    radius: 10,
    mass: 5e24,
    gravityStrength: 9.8,
    color: { r: 128, g: 128, b: 128 },
    orbital: STUB_ORBITAL,
    isPrimaryGravitySource: false,
    ...overrides,
  };
}

function makeScanner(overrides: Partial<ScannerEquipment> = {}): ScannerEquipment {
  return {
    id: "scanner-test",
    name: "Test Scanner",
    range: 500,
    penetrationLevel: 0,
    maxSimultaneousLocks: 3,
    ...overrides,
  };
}

function makeEnemy(
  id: string,
  pos: { x: number; y: number } = { x: 300, y: 0 },
  aggression: Aggression = Aggression.NEUTRAL,
  scannerOverrides: Partial<ScannerEquipment> = {},
): EnemyAIState {
  return EnemyAISystem.createState(id, `Enemy-${id}`, pos, makeScanner(scannerOverrides), aggression);
}

function makePlayer(
  pos: { x: number; y: number } = { x: 0, y: 0 },
  id = "player-1",
  name = "Player",
) {
  return { id, name, position: pos };
}

// ── createState ───────────────────────────────────────────────────────────────

describe("EnemyAISystem.createState", () => {
  it("CS1 — creates fresh state with empty targeting, supplied scanner + position, default NEUTRAL aggression", () => {
    // Given
    const scanner = makeScanner({ range: 400, maxSimultaneousLocks: 2 });
    // When
    const state = EnemyAISystem.createState("e1", "Grunt", { x: 100, y: 50 }, scanner);
    // Then
    expect(state.id).toBe("e1");
    expect(state.name).toBe("Grunt");
    expect(state.position).toEqual({ x: 100, y: 50 });
    expect(state.scanner).toBe(scanner);
    expect(state.aggression).toBe(Aggression.NEUTRAL);
    expect(state.targetingState.allLocks).toHaveLength(0);
    expect(state.targetingState.focusedLockId).toBeUndefined();
    expect(state.lastAggravatedByPlayerAt).toBeUndefined();
  });

  it("CS2 — explicit initial aggression overrides the default NEUTRAL", () => {
    // Given / When
    const hostile = EnemyAISystem.createState("e2", "Boss", { x: 0, y: 0 }, makeScanner(), Aggression.HOSTILE);
    // Then
    expect(hostile.aggression).toBe(Aggression.HOSTILE);
  });
});

// ── updateAggression ──────────────────────────────────────────────────────────

describe("EnemyAISystem.updateAggression", () => {
  it("AG1 — NEUTRAL + player within vigilance range → becomes VIGILANT", () => {
    // Given — player is just inside the default 200 km vigilance range
    const enemy = makeEnemy("e1", { x: 150, y: 0 }, Aggression.NEUTRAL);
    const playerPos = { x: 0, y: 0 }; // 150 km away
    // When
    EnemyAISystem.updateAggression(enemy, playerPos, false, 1000);
    // Then
    expect(enemy.aggression).toBe(Aggression.VIGILANT);
  });

  it("AG2 — NEUTRAL + player beyond vigilance range → stays NEUTRAL", () => {
    // Given — player is 250 km away (beyond 200 km threshold)
    const enemy = makeEnemy("e1", { x: 250, y: 0 }, Aggression.NEUTRAL);
    const playerPos = { x: 0, y: 0 };
    // When
    EnemyAISystem.updateAggression(enemy, playerPos, false, 1000);
    // Then
    expect(enemy.aggression).toBe(Aggression.NEUTRAL);
  });

  it("AG3 — NEUTRAL + player fires on it → becomes HOSTILE immediately (skips VIGILANT)", () => {
    // Given — player is far away but fires on the enemy
    const enemy = makeEnemy("e1", { x: 400, y: 0 }, Aggression.NEUTRAL);
    const playerPos = { x: 0, y: 0 };
    // When
    EnemyAISystem.updateAggression(enemy, playerPos, true, 2000);
    // Then — skips VIGILANT, goes straight to HOSTILE
    expect(enemy.aggression).toBe(Aggression.HOSTILE);
  });

  it("AG4 — VIGILANT + player fires → becomes HOSTILE", () => {
    // Given
    const enemy = makeEnemy("e1", { x: 50, y: 0 }, Aggression.VIGILANT);
    // When
    EnemyAISystem.updateAggression(enemy, { x: 0, y: 0 }, true, 3000);
    // Then
    expect(enemy.aggression).toBe(Aggression.HOSTILE);
  });

  it("AG5 — VIGILANT + player outside vigilance range → stays VIGILANT (no reversion)", () => {
    // Given — enemy was already VIGILANT; player has retreated far away
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.VIGILANT);
    const farPlayer = { x: 999, y: 0 }; // far beyond 200 km threshold
    // When
    EnemyAISystem.updateAggression(enemy, farPlayer, false, 4000);
    // Then — no reversion back to NEUTRAL
    expect(enemy.aggression).toBe(Aggression.VIGILANT);
  });

  it("AG6 — HOSTILE + any input → stays HOSTILE", () => {
    // Given
    const enemy = makeEnemy("e1", { x: 10, y: 0 }, Aggression.HOSTILE);
    // When — player fires AND is in range (both triggers should be no-ops)
    EnemyAISystem.updateAggression(enemy, { x: 0, y: 0 }, true, 5000);
    // Then
    expect(enemy.aggression).toBe(Aggression.HOSTILE);
  });

  it("AG7 — lastAggravatedByPlayerAt is set to nowMs when player fires", () => {
    // Given
    const enemy = makeEnemy("e1", { x: 100, y: 0 }, Aggression.NEUTRAL);
    // When
    EnemyAISystem.updateAggression(enemy, { x: 0, y: 0 }, true, 7777);
    // Then
    expect(enemy.lastAggravatedByPlayerAt).toBe(7777);
  });

  it("AG8 — lastAggravatedByPlayerAt NOT set when only proximity triggers VIGILANT", () => {
    // Given
    const enemy = makeEnemy("e1", { x: 50, y: 0 }, Aggression.NEUTRAL);
    // When — proximity trigger (no player fire)
    EnemyAISystem.updateAggression(enemy, { x: 0, y: 0 }, false, 8888);
    // Then
    expect(enemy.aggression).toBe(Aggression.VIGILANT);
    expect(enemy.lastAggravatedByPlayerAt).toBeUndefined();
  });
});

// ── shouldEngage ──────────────────────────────────────────────────────────────

describe("EnemyAISystem.shouldEngage", () => {
  it("SE1 — NEUTRAL → false", () => {
    expect(EnemyAISystem.shouldEngage(makeEnemy("e1", { x: 0, y: 0 }, Aggression.NEUTRAL))).toBe(false);
  });

  it("SE2 — VIGILANT → true", () => {
    expect(EnemyAISystem.shouldEngage(makeEnemy("e1", { x: 0, y: 0 }, Aggression.VIGILANT))).toBe(true);
  });

  it("SE3 — HOSTILE → true", () => {
    expect(EnemyAISystem.shouldEngage(makeEnemy("e1", { x: 0, y: 0 }, Aggression.HOSTILE))).toBe(true);
  });
});

// ── canDetectPlayer ───────────────────────────────────────────────────────────

describe("EnemyAISystem.canDetectPlayer", () => {
  it("CD1 — player in scanner range, clear LOS → true", () => {
    // Given — enemy at (200,0) with 500 km scanner, player at (0,0) = 200 km away
    const enemy = makeEnemy("e1", { x: 200, y: 0 });
    // When / Then
    expect(EnemyAISystem.canDetectPlayer(enemy, { x: 0, y: 0 }, [])).toBe(true);
  });

  it("CD2 — player beyond scanner range → false", () => {
    // Given — enemy at (0,0), scanner range 100 km, player at (200,0)
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.NEUTRAL, { range: 100 });
    // When / Then
    expect(EnemyAISystem.canDetectPlayer(enemy, { x: 200, y: 0 }, [])).toBe(false);
  });

  it("CD3 — player in range, blocked by opaque body (penetration 0) → false", () => {
    // Given — planet at midpoint between enemy and player
    const enemy = makeEnemy("e1", { x: 0, y: 0 });
    const planet = makeBody({ type: "planet", position: { x: 100, y: 0 }, radius: 10 });
    // When / Then
    expect(EnemyAISystem.canDetectPlayer(enemy, { x: 200, y: 0 }, [planet])).toBe(false);
  });

  it("CD4 — player in range, body present but scanner penetrates it → true", () => {
    // Given — planet on path, but scanner has penetrationLevel 2 (penetrates planets)
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.NEUTRAL, { range: 500, penetrationLevel: 2 });
    const planet = makeBody({ type: "planet", position: { x: 100, y: 0 }, radius: 10 });
    // When / Then
    expect(EnemyAISystem.canDetectPlayer(enemy, { x: 200, y: 0 }, [planet])).toBe(true);
  });

  it("CD5 — player in range, body present but off to the side (not on path) → true", () => {
    // Given — moon is 60 km off to the side of the direct line
    const enemy = makeEnemy("e1", { x: 0, y: 0 });
    const moon = makeBody({ type: "moon", position: { x: 100, y: 60 }, radius: 10 });
    // When / Then
    expect(EnemyAISystem.canDetectPlayer(enemy, { x: 200, y: 0 }, [moon])).toBe(true);
  });
});

// ── acquirePlayerLock ─────────────────────────────────────────────────────────

describe("EnemyAISystem.acquirePlayerLock", () => {
  it("AP1 — player in scanner range, clear LOS → lock acquired, returns true", () => {
    // Given — HOSTILE enemy at (200,0), player at (0,0) = 200 km (within 500 km range)
    const enemy = makeEnemy("e1", { x: 200, y: 0 }, Aggression.HOSTILE);
    const player = makePlayer({ x: 0, y: 0 });
    // When
    const acquired = EnemyAISystem.acquirePlayerLock(enemy, player, [], 1000);
    // Then
    expect(acquired).toBe(true);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
    expect(enemy.targetingState.allLocks[0]!.targetId).toBe("player-1");
    expect(enemy.targetingState.allLocks[0]!.isFocused).toBe(true);
  });

  it("AP2 — player beyond scanner range → no lock acquired, returns false", () => {
    // Given — scanner range 100 km, player 600 km away
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.HOSTILE, { range: 100 });
    const player = makePlayer({ x: 600, y: 0 });
    // When
    const acquired = EnemyAISystem.acquirePlayerLock(enemy, player, [], 1000);
    // Then
    expect(acquired).toBe(false);
    expect(enemy.targetingState.allLocks).toHaveLength(0);
  });

  it("AP3 — player in range but LOS blocked by opaque body → no lock acquired", () => {
    // Given — planet sits between enemy and player
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.HOSTILE);
    const player = makePlayer({ x: 200, y: 0 });
    const planet = makeBody({ type: "planet", position: { x: 100, y: 0 }, radius: 10 });
    // When
    const acquired = EnemyAISystem.acquirePlayerLock(enemy, player, [planet], 1000);
    // Then
    expect(acquired).toBe(false);
    expect(enemy.targetingState.allLocks).toHaveLength(0);
  });

  it("AP4 — player already locked → returns false (no duplicate), existing lock kept", () => {
    // Given — enemy already has a lock on the player
    const enemy = makeEnemy("e1", { x: 200, y: 0 }, Aggression.HOSTILE);
    const player = makePlayer({ x: 0, y: 0 });
    EnemyAISystem.acquirePlayerLock(enemy, player, [], 1000);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
    // When — attempt to acquire again
    const acquired = EnemyAISystem.acquirePlayerLock(enemy, player, [], 2000);
    // Then — false returned (no new lock), count stays at 1
    expect(acquired).toBe(false);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
  });

  it("AP5 — lock limit reached → returns false, no new lock", () => {
    // Given — scanner max 1 lock; already locked on "other-target"
    const enemy = makeEnemy("e1", { x: 100, y: 0 }, Aggression.HOSTILE, { maxSimultaneousLocks: 1 });
    // Manually add a lock on a different target to fill the single slot
    TargetLockManager.attemptLock(
      enemy.targetingState,
      enemy.position,
      { id: "other-target", name: "Other", position: { x: 50, y: 0 } },
      enemy.scanner,
      [],
      500,
    );
    expect(enemy.targetingState.allLocks).toHaveLength(1);
    // When — try to also lock the player
    const player = makePlayer({ x: 0, y: 0 });
    const acquired = EnemyAISystem.acquirePlayerLock(enemy, player, [], 1000);
    // Then — rejected due to lock limit
    expect(acquired).toBe(false);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
  });
});

// ── validateEnemyLocks ────────────────────────────────────────────────────────

describe("EnemyAISystem.validateEnemyLocks", () => {
  it("VE1 — player still in range → lock kept", () => {
    // Given — lock established, player still nearby
    const enemy = makeEnemy("e1", { x: 100, y: 0 }, Aggression.HOSTILE);
    const player = makePlayer({ x: 0, y: 0 });
    EnemyAISystem.acquirePlayerLock(enemy, player, [], 1000);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
    // When
    const broken = EnemyAISystem.validateEnemyLocks(
      enemy,
      (id) => (id === "player-1" ? { x: 0, y: 0 } : null),
      [],
    );
    // Then — no locks broken
    expect(broken).toHaveLength(0);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
  });

  it("VE2 — player moved out of scanner range → lock broken, id returned", () => {
    // Given — lock on player within 500 km scanner
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.HOSTILE, { range: 200 });
    const player = makePlayer({ x: 100, y: 0 }); // 100 km — within range
    EnemyAISystem.acquirePlayerLock(enemy, player, [], 1000);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
    // When — player drifts to 300 km (beyond 200 km range)
    const broken = EnemyAISystem.validateEnemyLocks(
      enemy,
      () => ({ x: 300, y: 0 }),
      [],
    );
    // Then — lock broken
    expect(broken).toHaveLength(1);
    expect(enemy.targetingState.allLocks).toHaveLength(0);
  });

  it("VE3 — player destroyed (null position) → lock broken", () => {
    // Given
    const enemy = makeEnemy("e1", { x: 100, y: 0 }, Aggression.HOSTILE);
    EnemyAISystem.acquirePlayerLock(enemy, makePlayer({ x: 0, y: 0 }), [], 1000);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
    // When — player no longer exists
    const broken = EnemyAISystem.validateEnemyLocks(
      enemy,
      () => null,
      [],
    );
    // Then
    expect(broken).toHaveLength(1);
    expect(enemy.targetingState.allLocks).toHaveLength(0);
    expect(enemy.targetingState.focusedLockId).toBeUndefined();
  });
});

// ── getFocusedTarget ──────────────────────────────────────────────────────────

describe("EnemyAISystem.getFocusedTarget", () => {
  it("FT1 — no locks held → returns undefined", () => {
    // Given
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.HOSTILE);
    // When / Then
    expect(EnemyAISystem.getFocusedTarget(enemy)).toBeUndefined();
  });

  it("FT2 — lock acquired → returns the focused TargetLock", () => {
    // Given
    const enemy = makeEnemy("e1", { x: 200, y: 0 }, Aggression.HOSTILE);
    const player = makePlayer({ x: 0, y: 0 });
    EnemyAISystem.acquirePlayerLock(enemy, player, [], 1000);
    // When
    const focused = EnemyAISystem.getFocusedTarget(enemy);
    // Then
    expect(focused).toBeDefined();
    expect(focused!.targetId).toBe("player-1");
    expect(focused!.isFocused).toBe(true);
  });

  it("FT3 — after the focused lock is broken → returns undefined", () => {
    // Given — lock acquired then broken
    const enemy = makeEnemy("e1", { x: 100, y: 0 }, Aggression.HOSTILE);
    EnemyAISystem.acquirePlayerLock(enemy, makePlayer({ x: 0, y: 0 }), [], 1000);
    EnemyAISystem.validateEnemyLocks(enemy, () => null, []); // player destroyed
    // When / Then
    expect(EnemyAISystem.getFocusedTarget(enemy)).toBeUndefined();
  });
});

// ── tick — happy paths ────────────────────────────────────────────────────────

describe("EnemyAISystem.tick — happy paths", () => {
  it("T1 — HOSTILE enemy + player in range: lock acquired, shouldFire=true", () => {
    // Given
    const enemy = makeEnemy("e1", { x: 200, y: 0 }, Aggression.HOSTILE);
    const player = makePlayer({ x: 0, y: 0 });
    // When
    const result = EnemyAISystem.tick(enemy, player, false, [], 1000);
    // Then
    expect(result.lockAcquired).toBe(true);
    expect(result.shouldFire).toBe(true);
    expect(result.aggressionChanged).toBe(false);
    expect(result.brokenLockIds).toHaveLength(0);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
    expect(EnemyAISystem.getFocusedTarget(enemy)?.targetId).toBe("player-1");
  });

  it("T2 — NEUTRAL enemy + player within vigilance range: aggression→VIGILANT, lock acquired, shouldFire=true", () => {
    // Given — player at (0,0), enemy at (150,0) = 150 km (inside 200 km vigilance range)
    const enemy = makeEnemy("e1", { x: 150, y: 0 }, Aggression.NEUTRAL);
    const player = makePlayer({ x: 0, y: 0 });
    // When
    const result = EnemyAISystem.tick(enemy, player, false, [], 1000);
    // Then
    expect(enemy.aggression).toBe(Aggression.VIGILANT);
    expect(result.aggressionChanged).toBe(true);
    expect(result.lockAcquired).toBe(true);
    expect(result.shouldFire).toBe(true);
  });

  it("T3 — player fires on NEUTRAL enemy: aggression→HOSTILE, lock acquired, aggressionChanged=true, shouldFire=true", () => {
    // Given — player far away but fires on the enemy
    const enemy = makeEnemy("e1", { x: 400, y: 0 }, Aggression.NEUTRAL);
    const player = makePlayer({ x: 0, y: 0 });
    // When
    const result = EnemyAISystem.tick(enemy, player, true, [], 1000);
    // Then
    expect(enemy.aggression).toBe(Aggression.HOSTILE);
    expect(result.aggressionChanged).toBe(true);
    expect(result.lockAcquired).toBe(true);
    expect(result.shouldFire).toBe(true);
    expect(enemy.lastAggravatedByPlayerAt).toBe(1000);
  });

  it("T4 — NEUTRAL enemy + player beyond vigilance and scanner range: no changes, shouldFire=false", () => {
    // Given — enemy scanner range 300 km; player 600 km away (beyond both thresholds)
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.NEUTRAL, { range: 300 });
    const player = makePlayer({ x: 600, y: 0 });
    // When
    const result = EnemyAISystem.tick(enemy, player, false, [], 1000);
    // Then
    expect(result.aggressionChanged).toBe(false);
    expect(result.lockAcquired).toBe(false);
    expect(result.shouldFire).toBe(false);
    expect(enemy.aggression).toBe(Aggression.NEUTRAL);
    expect(enemy.targetingState.allLocks).toHaveLength(0);
  });
});

// ── tick — unhappy branches ───────────────────────────────────────────────────

describe("EnemyAISystem.tick — unhappy branches", () => {
  it("T5 — NEUTRAL + player within vigilance range but behind opaque body: aggression→VIGILANT but lock NOT acquired", () => {
    // Given — enemy at (0,0), player at (150,0), planet at (75,0) blocking LOS
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.NEUTRAL);
    const player = makePlayer({ x: 150, y: 0 });
    const planet = makeBody({ type: "planet", position: { x: 75, y: 0 }, radius: 10 });
    // When
    const result = EnemyAISystem.tick(enemy, player, false, [planet], 1000);
    // Then — aggression escalated to VIGILANT (proximity still detected), but lock blocked by planet
    expect(enemy.aggression).toBe(Aggression.VIGILANT);
    expect(result.aggressionChanged).toBe(true);
    expect(result.lockAcquired).toBe(false);
    expect(result.shouldFire).toBe(false);
  });

  it("T6 — active lock becomes stale (player moved out of range): brokenLockIds populated, shouldFire=false", () => {
    // Given — enemy already has a lock; then player drifts beyond range on this tick
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.HOSTILE, { range: 200 });
    // Pre-seed a lock by calling tick with player in range
    EnemyAISystem.tick(enemy, makePlayer({ x: 100, y: 0 }), false, [], 1000);
    expect(enemy.targetingState.allLocks).toHaveLength(1);
    // When — player now 300 km away (beyond 200 km range)
    const result = EnemyAISystem.tick(enemy, makePlayer({ x: 300, y: 0 }), false, [], 2000);
    // Then — lock broken, new lock cannot be re-acquired (still beyond range)
    expect(result.brokenLockIds).toHaveLength(1);
    expect(result.shouldFire).toBe(false);
    expect(enemy.targetingState.allLocks).toHaveLength(0);
  });

  it("T7 — aggressionChanged=false when aggression does not change", () => {
    // Given — already HOSTILE, player in range
    const enemy = makeEnemy("e1", { x: 100, y: 0 }, Aggression.HOSTILE);
    // When
    const result = EnemyAISystem.tick(enemy, makePlayer({ x: 0, y: 0 }), true, [], 1000);
    // Then
    expect(result.aggressionChanged).toBe(false);
    expect(enemy.aggression).toBe(Aggression.HOSTILE);
  });

  it("T8 — HOSTILE enemy with no LOS to player: lock cannot be acquired, shouldFire=false", () => {
    // Given — planet blocks LOS
    const enemy = makeEnemy("e1", { x: 0, y: 0 }, Aggression.HOSTILE);
    const player = makePlayer({ x: 200, y: 0 });
    const planet = makeBody({ type: "planet", position: { x: 100, y: 0 }, radius: 10 });
    // When
    const result = EnemyAISystem.tick(enemy, player, false, [planet], 1000);
    // Then
    expect(result.lockAcquired).toBe(false);
    expect(result.shouldFire).toBe(false);
    expect(enemy.targetingState.allLocks).toHaveLength(0);
  });
});

// ── Multi-enemy independence ──────────────────────────────────────────────────

describe("EnemyAISystem — multi-enemy independence", () => {
  it("ME1 — ticking enemy A does not affect enemy B's state", () => {
    // Given — two separate enemies
    const enemyA = makeEnemy("a", { x: 100, y: 0 }, Aggression.HOSTILE);
    const enemyB = makeEnemy("b", { x: 400, y: 0 }, Aggression.NEUTRAL);
    const player = makePlayer({ x: 0, y: 0 });
    // When — tick only enemy A
    EnemyAISystem.tick(enemyA, player, false, [], 1000);
    // Then — B is unchanged
    expect(enemyB.aggression).toBe(Aggression.NEUTRAL);
    expect(enemyB.targetingState.allLocks).toHaveLength(0);
  });

  it("ME2 — two enemies with different scanner ranges behave independently (one locks, one cannot)", () => {
    // Given
    // enemyNear: 100 km scanner range, sitting 50 km away → can lock player
    const enemyNear = makeEnemy("near", { x: 50, y: 0 }, Aggression.HOSTILE, { range: 100 });
    // enemyFar: 100 km scanner range, sitting 200 km away → cannot reach player
    const enemyFar = makeEnemy("far", { x: 200, y: 0 }, Aggression.HOSTILE, { range: 100 });
    const player = makePlayer({ x: 0, y: 0 });
    // When
    const resultNear = EnemyAISystem.tick(enemyNear, player, false, [], 1000);
    const resultFar = EnemyAISystem.tick(enemyFar, player, false, [], 1000);
    // Then
    expect(resultNear.lockAcquired).toBe(true);
    expect(resultNear.shouldFire).toBe(true);
    expect(resultFar.lockAcquired).toBe(false);
    expect(resultFar.shouldFire).toBe(false);
  });
});

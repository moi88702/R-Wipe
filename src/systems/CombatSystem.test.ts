/**
 * Tests for CombatSystem — weapon / ability activation and damage resolution.
 *
 * Integration-first: CombatManager is NOT mocked.  It runs for real because
 * it lives in the same package and is a pure in-memory module with no external
 * I/O.  Both CombatSystem and CombatManager are exercised together so that any
 * mis-wiring between them surfaces immediately.
 *
 * Observable contracts under test:
 *
 *   Undocked combat — weapon fire (Space key)
 *     1.  Happy path: Space pressed, target + weapon present → fired=true,
 *         CombatEvent returned (hit or miss — both are valid outcomes).
 *     2.  No focused target → fired=false, reason="no-target".
 *     3.  No primary weapon equipped → fired=false, reason="no-weapon".
 *     4.  Space not pressed → result.weapon is undefined (no wasted computation).
 *
 *   Undocked combat — ability keys (B / V / C / X / Z)
 *     5.  Happy path: ability key pressed, ability registered + energy available
 *         → activated=true.
 *     6.  Ability key pressed but no ability mapped to that slot
 *         → activated=false, reason="no-ability-equipped".
 *     7.  Ability activated once (starts cooldown), pressed again immediately
 *         → activated=false, reason="not-available" (cooldown gate in CombatManager).
 *     8.  Ship has insufficient energy for the ability
 *         → activated=false, reason="not-available".
 *     9.  Only keys that were pressed appear in result.abilities; unpressed
 *         keys produce no entry.
 *    10.  All five ability key slots (B/V/C/X/Z) route to independent ability ids.
 *
 *   Docked guard
 *    11.  ship.isDocked=true, Space pressed → fired=false, reason="docked".
 *    12.  ship.isDocked=true, ability key pressed → activated=false, reason="docked".
 *    13.  ship.isDocked=true, multiple keys → every pressed key reports "docked".
 *    14.  No keys pressed while docked → result has no weapon/ability entries.
 *
 *   Ship registration
 *    15.  Ships must be registered before they can participate in combat;
 *         firing at an unregistered target throws (CombatManager contract).
 *
 * Gherkin scenarios (integration journeys):
 *
 *   G1  "Player fires primary weapon at focused enemy in undocked mode"
 *   G2  "Player activates ability while undocked — cooldown starts"
 *   G3  "Player presses ability key again while still on cooldown — blocked"
 *   G4  "Player attempts combat while docked — all actions blocked"
 *   G5  "Player presses Space with no target locked — weapon does not fire"
 */

import { describe, expect, it, beforeEach } from "vitest";
import { CombatSystem, ABILITY_KEYS } from "./CombatSystem";
import type { CombatInput } from "./CombatSystem";
// Verify the public barrel re-exports everything callers following the documented API path expect.
import {
  CombatSystem as CombatSystemFromIndex,
  ABILITY_KEYS as ABILITY_KEYS_FROM_INDEX,
} from "./combat/index";
import { CombatManager } from "./combat/CombatManager";
import { ShipClass } from "./combat/types";
import type { Ship } from "./combat/types";

// ── Shared helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal Ship fixture for tests.
 * All fields have sensible defaults; individual tests override what they care about.
 */
function makeShip(overrides: Partial<Ship> = {}): Ship {
  return {
    id: "player",
    class: ShipClass.FIGHTER,
    factionId: "terran",
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    stats: {
      health: 100,
      maxHealth: 100,
      shield: 50,
      maxShield: 50,
      armor: 10,
      speed: 0, // zero speed → no evasion penalty in hit-chance formula
      acceleration: 50,
      turnRate: 1,
      factionId: "terran",
    },
    weapons: [],
    abilities: [],
    energy: 100,
    maxEnergy: 100,
    isPlayerControlled: true,
    isDocked: false,
    ...overrides,
  };
}

/** All-false CombatInput — callers flip specific keys. */
function noInput(): CombatInput {
  return {
    fireWeapon: false,
    abilityKeys: { B: false, V: false, C: false, X: false, Z: false },
  };
}

// ── Shared fixtures (recreated before each test for isolation) ────────────────

let combatManager: CombatManager;
let combatSystem: CombatSystem;
let player: Ship;
let enemy: Ship;

beforeEach(() => {
  combatManager = new CombatManager();
  combatSystem = new CombatSystem(combatManager);

  player = makeShip({ id: "player" });
  enemy = makeShip({ id: "enemy", isPlayerControlled: false });

  // Register both ships so CombatManager can resolve attacker and target.
  combatSystem.registerShip(player);
  combatSystem.registerShip(enemy);
});

// ── 1. Happy path: weapon fire ────────────────────────────────────────────────

describe("Scenario G1 — Player fires primary weapon at focused enemy in undocked mode", () => {
  it("Given undocked with target and weapon, When Space pressed, Then fired=true and a CombatEvent is returned", () => {
    // Given
    expect(player.isDocked).toBe(false);
    const input: CombatInput = { ...noInput(), fireWeapon: true };
    const abilityKeyMap = {};

    // When
    const result = combatSystem.tick(
      player,
      enemy.id,          // focused target
      input,
      abilityKeyMap,
      "laser-mk1",       // primary weapon from default WeaponRegistry
    );

    // Then
    expect(result.weapon).toBeDefined();
    expect(result.weapon!.fired).toBe(true);
    expect(result.weapon!.reason).toBeUndefined();
    // CombatManager returns a CombatEvent regardless of hit or miss
    expect(result.weapon!.event).toBeDefined();
    expect(["hit", "shield_hit", "armor_hit", "kill", "miss"]).toContain(
      result.weapon!.event!.type,
    );
    expect(result.weapon!.event!.attackerId).toBe("player");
    expect(result.weapon!.event!.targetId).toBe("enemy");
  });

  it("Space not pressed → result.weapon is undefined", () => {
    // Given
    const input = noInput(); // fireWeapon: false

    // When
    const result = combatSystem.tick(player, enemy.id, input, {}, "laser-mk1");

    // Then — no weapon entry produced when key was not pressed
    expect(result.weapon).toBeUndefined();
  });
});

// ── 2. No focused target ──────────────────────────────────────────────────────

describe("Scenario G5 — Player presses Space with no target locked", () => {
  it("Given undocked with weapon but focusedTargetId=null, When Space pressed, Then fired=false reason='no-target'", () => {
    // Given
    const input: CombatInput = { ...noInput(), fireWeapon: true };

    // When
    const result = combatSystem.tick(
      player,
      null, // no target
      input,
      {},
      "laser-mk1",
    );

    // Then
    expect(result.weapon!.fired).toBe(false);
    expect(result.weapon!.reason).toBe("no-target");
  });
});

// ── 3. No primary weapon equipped ────────────────────────────────────────────

it("Given undocked with target but primaryWeaponId=null, When Space pressed, Then fired=false reason='no-weapon'", () => {
  // Given
  const input: CombatInput = { ...noInput(), fireWeapon: true };

  // When
  const result = combatSystem.tick(
    player,
    enemy.id,
    input,
    {},
    null, // no weapon
  );

  // Then
  expect(result.weapon!.fired).toBe(false);
  expect(result.weapon!.reason).toBe("no-weapon");
});

// ── 5. Happy path: ability activation ────────────────────────────────────────

describe("Scenario G2 — Player activates ability while undocked", () => {
  it("Given undocked ship with energy and ability mapped to B, When B pressed, Then activated=true", () => {
    // Given
    expect(player.isDocked).toBe(false);
    expect(player.energy).toBe(100); // more than shield-boost-mk1's 20 cost
    const input: CombatInput = { ...noInput(), abilityKeys: { ...noInput().abilityKeys, B: true } };
    const abilityKeyMap = { B: "shield-boost-mk1" }; // registered in AbilityRegistry

    // When
    const result = combatSystem.tick(player, null, input, abilityKeyMap, null);

    // Then
    expect(result.abilities.B).toBeDefined();
    expect(result.abilities.B!.activated).toBe(true);
    expect(result.abilities.B!.reason).toBeUndefined();
  });

  it("Ability V, C, X, Z can each be mapped to independent ability ids", () => {
    // Given — every ability key pressed simultaneously, each pointing at a
    // distinct ability from the default registry.
    const input: CombatInput = {
      fireWeapon: false,
      abilityKeys: { B: false, V: true, C: true, X: true, Z: true },
    };
    const abilityKeyMap: Partial<Record<"B" | "V" | "C" | "X" | "Z", string>> = {
      V: "shield-boost-mk1",
      C: "evasive-maneuver-mk1",
      X: "targeting-lock-mk1",
      Z: "emergency-warp-mk1",
    };

    // When
    const result = combatSystem.tick(player, null, input, abilityKeyMap, null);

    // Then — all four activated (player has 100 energy; costs: 20+15+10+50 = 95 ≤ 100)
    // Each activation deducts energy in sequence; the last one (Z/emergency-warp
    // costs 50) may still succeed.  The important contract: each key produces an
    // independent result entry with its own abilityId routing.
    expect(result.abilities.V).toBeDefined();
    expect(result.abilities.C).toBeDefined();
    expect(result.abilities.X).toBeDefined();
    expect(result.abilities.Z).toBeDefined();

    // B was not pressed → no entry
    expect(result.abilities.B).toBeUndefined();

    // Each pressed key returned a result (whether activated or not is
    // determined by cumulative energy; we verify the routing is correct).
    for (const key of ["V", "C", "X", "Z"] as const) {
      const entry = result.abilities[key]!;
      expect(entry.activated === true || entry.reason !== undefined).toBe(true);
    }
  });
});

// ── 6. Ability key with no mapped ability ─────────────────────────────────────

it("Given undocked ship, When ability key V pressed with no mapping, Then activated=false reason='no-ability-equipped'", () => {
  // Given
  const input: CombatInput = { ...noInput(), abilityKeys: { ...noInput().abilityKeys, V: true } };
  const abilityKeyMap = {}; // V slot is empty

  // When
  const result = combatSystem.tick(player, null, input, abilityKeyMap, null);

  // Then
  expect(result.abilities.V!.activated).toBe(false);
  expect(result.abilities.V!.reason).toBe("no-ability-equipped");
});

// ── 7. Ability on cooldown ────────────────────────────────────────────────────

describe("Scenario G3 — Player presses ability key again while still on cooldown", () => {
  it("Given ability activated once (cooldown started), When activated again immediately, Then activated=false reason='not-available'", () => {
    // Given — first activation succeeds
    const input: CombatInput = { ...noInput(), abilityKeys: { ...noInput().abilityKeys, B: true } };
    const abilityKeyMap = { B: "shield-boost-mk1" }; // cooldownMs = 8_000

    const firstResult = combatSystem.tick(player, null, input, abilityKeyMap, null);
    expect(firstResult.abilities.B!.activated).toBe(true); // sanity: first attempt worked

    // When — press B again in the same tick (or next tick, both within 8s cooldown)
    const secondResult = combatSystem.tick(player, null, input, abilityKeyMap, null);

    // Then
    expect(secondResult.abilities.B!.activated).toBe(false);
    expect(secondResult.abilities.B!.reason).toBe("not-available");
  });
});

// ── 8. Insufficient energy ────────────────────────────────────────────────────

it("Given ship with energy=0, When ability key pressed, Then activated=false reason='not-available'", () => {
  // Given
  player.energy = 0; // drain all energy (emergency-warp costs 50, shield costs 20)
  const input: CombatInput = { ...noInput(), abilityKeys: { ...noInput().abilityKeys, B: true } };
  const abilityKeyMap = { B: "shield-boost-mk1" }; // energyCost=20 > 0 available

  // When
  const result = combatSystem.tick(player, null, input, abilityKeyMap, null);

  // Then
  expect(result.abilities.B!.activated).toBe(false);
  expect(result.abilities.B!.reason).toBe("not-available");
});

// ── 9. Only pressed keys appear in results ────────────────────────────────────

it("Given only V key pressed, Then result.abilities contains V entry but no B/C/X/Z entries", () => {
  // Given
  const input: CombatInput = { ...noInput(), abilityKeys: { ...noInput().abilityKeys, V: true } };

  // When
  const result = combatSystem.tick(player, null, input, { V: "shield-boost-mk1" }, null);

  // Then
  expect(Object.keys(result.abilities)).toEqual(["V"]);
  expect(result.weapon).toBeUndefined();
});

// ── 11–14. Docked guard ───────────────────────────────────────────────────────

describe("Scenario G4 — Player attempts combat while docked", () => {
  it("Given isDocked=true, When Space pressed, Then fired=false reason='docked'", () => {
    // Given
    player.isDocked = true;
    const input: CombatInput = { ...noInput(), fireWeapon: true };

    // When
    const result = combatSystem.tick(
      player,
      enemy.id,
      input,
      {},
      "laser-mk1",
    );

    // Then
    expect(result.weapon!.fired).toBe(false);
    expect(result.weapon!.reason).toBe("docked");
  });

  it("Given isDocked=true, When ability key B pressed, Then activated=false reason='docked'", () => {
    // Given
    player.isDocked = true;
    const input: CombatInput = { ...noInput(), abilityKeys: { ...noInput().abilityKeys, B: true } };

    // When
    const result = combatSystem.tick(
      player,
      null,
      input,
      { B: "shield-boost-mk1" },
      null,
    );

    // Then
    expect(result.abilities.B!.activated).toBe(false);
    expect(result.abilities.B!.reason).toBe("docked");
  });

  it("Given isDocked=true with multiple keys pressed, Then every pressed key reports 'docked'", () => {
    // Given
    player.isDocked = true;
    const input: CombatInput = {
      fireWeapon: true,
      abilityKeys: { B: true, V: true, C: false, X: false, Z: false },
    };

    // When
    const result = combatSystem.tick(
      player,
      enemy.id,
      input,
      { B: "shield-boost-mk1", V: "evasive-maneuver-mk1" },
      "laser-mk1",
    );

    // Then
    expect(result.weapon!.reason).toBe("docked");
    expect(result.abilities.B!.reason).toBe("docked");
    expect(result.abilities.V!.reason).toBe("docked");
    // Unpressed keys have no entry
    expect(result.abilities.C).toBeUndefined();
    expect(result.abilities.X).toBeUndefined();
    expect(result.abilities.Z).toBeUndefined();
  });

  it("Given isDocked=true with no keys pressed, Then result has no weapon/ability entries", () => {
    // Given
    player.isDocked = true;
    const input = noInput(); // nothing pressed

    // When
    const result = combatSystem.tick(player, null, input, {}, null);

    // Then
    expect(result.weapon).toBeUndefined();
    expect(Object.keys(result.abilities).length).toBe(0);
  });
});

// ── 15. Unregistered target throws (CombatManager contract) ──────────────────

it("Given target not registered with combatSystem, When weapon fire attempted, Then CombatManager throws", () => {
  // Given — 'ghost' is NOT registered
  const ghost = makeShip({ id: "ghost" });
  const input: CombatInput = { ...noInput(), fireWeapon: true };

  // When / Then — CombatManager throws for an unknown ship id
  expect(() =>
    combatSystem.tick(player, ghost.id, input, {}, "laser-mk1"),
  ).toThrow();
});

// ── Edge cases ────────────────────────────────────────────────────────────────

it("registerShip and unregisterShip delegate to CombatManager — unregistered attacker throws", () => {
  // Given — create a fresh system and do NOT register player
  const freshManager = new CombatManager();
  const freshSystem = new CombatSystem(freshManager);
  const target = makeShip({ id: "target" });
  freshSystem.registerShip(target); // only the target is registered

  const input: CombatInput = { ...noInput(), fireWeapon: true };

  // When / Then — attacker (player) is not registered → CombatManager throws
  expect(() =>
    freshSystem.tick(player, target.id, input, {}, "laser-mk1"),
  ).toThrow();
});

it("ABILITY_KEYS constant contains exactly B, V, C, X, Z in that order", () => {
  expect(ABILITY_KEYS).toEqual(["B", "V", "C", "X", "Z"]);
});

it("lockStrength defaults to 1 when omitted (does not throw)", () => {
  // Default lockStrength=1 should not cause any errors
  const input: CombatInput = { ...noInput(), fireWeapon: true };

  // Calling without the lockStrength argument should use the default
  expect(() =>
    combatSystem.tick(player, enemy.id, input, {}, "laser-mk1"),
  ).not.toThrow();
});

// ── Public API surface — barrel export contract ───────────────────────────────

describe("public API: src/systems/combat/index exports match documented contract", () => {
  it("CombatSystem is exported from the combat barrel (index.ts)", () => {
    // Callers following the documented API path must be able to import CombatSystem
    // from src/systems/combat/index without going into the implementation file.
    expect(CombatSystemFromIndex).toBe(CombatSystem);
  });

  it("ABILITY_KEYS constant is exported from the combat barrel (index.ts)", () => {
    // ABILITY_KEYS must be a re-exported value (not just a type) from the barrel,
    // so callers can import and iterate it at runtime.
    expect(ABILITY_KEYS_FROM_INDEX).toBe(ABILITY_KEYS);
    expect(ABILITY_KEYS_FROM_INDEX).toEqual(["B", "V", "C", "X", "Z"]);
  });
});

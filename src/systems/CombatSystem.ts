/**
 * CombatSystem — weapon and ability activation for solar-system combat.
 *
 * Sits above CombatManager: translates per-frame key input into weapon-fire
 * and ability-activation requests, enforces the undocked guard, and delegates
 * all damage resolution to the existing CombatManager.
 *
 * Key design decisions:
 *  - Combat is gated behind `ship.isDocked === false`.  When the ship is
 *    docked every combat action is rejected with `reason: "docked"`.
 *  - Weapon fire (Space key → `CombatInput.fireWeapon`) requires both a
 *    primary weapon id AND a focused target id.  Either missing → no-fire.
 *  - Ability keys (B / V / C / X / Z) look up the ability id from an
 *    `abilityKeyMap` provided by the caller (sourced from ship builder
 *    configuration).  Unmapped keys → `reason: "no-ability-equipped"`.
 *  - Cooldown and energy checks are delegated to CombatManager.activateAbility
 *    which returns false when the ability cannot fire; CombatSystem reports
 *    `reason: "not-available"` in that case.
 *  - Ships must be registered via `registerShip` before participating in
 *    combat (matches the CombatManager contract).
 *
 * Input wiring (how callers construct CombatInput):
 *   Space  → CombatInput.fireWeapon  (from InputState.fire)
 *   B      → CombatInput.abilityKeys.B  (from InputState.bomb, one-frame pulse)
 *   V      → CombatInput.abilityKeys.V  (from InputState.abilityV pulse)
 *   C      → CombatInput.abilityKeys.C  (from InputState.abilityC pulse)
 *   X      → CombatInput.abilityKeys.X  (from InputState.abilityX pulse)
 *   Z      → CombatInput.abilityKeys.Z  (from InputState.abilityZ pulse)
 */

import { CombatManager } from "./combat/CombatManager";
import type { CombatEvent, Ship } from "./combat/types";

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Ability key identifiers matching the product-spec bindings.
 * B uses the same keyboard key as the arcade-mode bomb; in solar-system mode
 * it activates the ability assigned to the B slot instead.
 */
export type AbilityKey = "B" | "V" | "C" | "X" | "Z";

/** All ability keys in declaration order (used for iteration). */
export const ABILITY_KEYS: readonly AbilityKey[] = [
  "B",
  "V",
  "C",
  "X",
  "Z",
] as const;

/**
 * One-frame combat input snapshot.
 * Constructed by the game loop from InputState before calling tick().
 *
 * All booleans are one-frame pulses (cleared by InputHandler.endFrame()):
 * holding a key does NOT re-fire every tick while on cooldown — the
 * CombatManager's cooldown gate handles that case anyway, but the pulse
 * design avoids superfluous internal checks on every frame the key is held.
 */
export interface CombatInput {
  /** Space key pressed this frame — fire the primary weapon at the focused target. */
  fireWeapon: boolean;
  /** Ability key presses this frame, keyed by ability slot identifier. */
  abilityKeys: Record<AbilityKey, boolean>;
}

/**
 * Result of a single weapon-fire attempt within one tick.
 */
export interface WeaponFireResult {
  /** True when the fire request was successfully delegated to CombatManager. */
  fired: boolean;
  /**
   * Populated when `fired` is false:
   * - "docked"     — ship is currently docked; combat is disabled.
   * - "no-target"  — no focused lock target was provided.
   * - "no-weapon"  — no primary weapon id was provided.
   */
  reason?: "docked" | "no-target" | "no-weapon";
  /**
   * The CombatEvent returned by CombatManager (present when `fired` is true).
   * May be a hit, shield_hit, armor_hit, kill, or miss depending on RNG and
   * ship stats.
   */
  event?: CombatEvent;
}

/**
 * Result of a single ability-activation attempt within one tick.
 */
export interface AbilityActivationResult {
  /** True when CombatManager confirmed the ability was activated. */
  activated: boolean;
  /**
   * Populated when `activated` is false:
   * - "docked"              — ship is docked; combat is disabled.
   * - "no-ability-equipped" — no ability id is mapped to this key slot.
   * - "not-available"       — CombatManager rejected (on cooldown or
   *                           insufficient energy).
   */
  reason?: "docked" | "no-ability-equipped" | "not-available";
}

/**
 * Aggregate result of one CombatSystem.tick() call.
 *
 * Only keys that were actually pressed (input === true) produce entries; a
 * key that was not pressed has no entry in `abilities` and `weapon` is
 * undefined when `fireWeapon` was false.
 */
export interface CombatTickResult {
  /** Present when `input.fireWeapon` was true. */
  weapon?: WeaponFireResult;
  /** Map of ability key → activation result for every pressed ability key. */
  abilities: Partial<Record<AbilityKey, AbilityActivationResult>>;
}

// ── CombatSystem ──────────────────────────────────────────────────────────────

/**
 * CombatSystem processes Space / B / V / C / X / Z combat input each frame
 * and delegates weapon fire and ability activation to the CombatManager.
 *
 * All combat is disabled while the player ship is docked.
 */
export class CombatSystem {
  constructor(private readonly combatManager: CombatManager) {}

  // ── Ship registration ─────────────────────────────────────────────────────

  /**
   * Register a ship so it can attack, be targeted, and use abilities.
   * Delegates directly to CombatManager.registerShip.
   * Must be called before the ship appears in any tick() call.
   */
  registerShip(ship: Ship): void {
    this.combatManager.registerShip(ship);
  }

  /**
   * Remove a ship from the combat system (destruction or undocking cleanup).
   * Delegates directly to CombatManager.unregisterShip.
   */
  unregisterShip(shipId: string): void {
    this.combatManager.unregisterShip(shipId);
  }

  // ── Per-frame tick ────────────────────────────────────────────────────────

  /**
   * Process one frame of combat input for the player ship.
   *
   * Checks the docking gate first — if the ship is docked, every pressed
   * action is returned as blocked with `reason: "docked"` and processing
   * stops.  When undocked, weapon fire and each pressed ability key are
   * resolved in order.
   *
   * @param playerShip      - Player's ship. `isDocked` gates all combat.
   * @param focusedTargetId - Id of the currently locked / focused enemy.
   *                          Pass `null` when no target is selected.
   * @param input           - Which combat keys were pressed this frame.
   * @param abilityKeyMap   - Maps each ability key (B/V/C/X/Z) to an ability
   *                          id registered in the AbilityRegistry.  Omit a
   *                          key to leave that slot empty.
   * @param primaryWeaponId - Weapon id to fire on Space.  Pass `null` when
   *                          no primary weapon is equipped.
   * @param lockStrength    - Current lock quality [0–1] fed into the hit-chance
   *                          formula in CombatManager.  Defaults to 1.
   * @returns A result object describing every action attempted this tick.
   */
  tick(
    playerShip: Ship,
    focusedTargetId: string | null,
    input: CombatInput,
    abilityKeyMap: Partial<Record<AbilityKey, string>>,
    primaryWeaponId: string | null,
    lockStrength: number = 1,
  ): CombatTickResult {
    const result: CombatTickResult = { abilities: {} };

    // ── Docking guard ──────────────────────────────────────────────────────
    // When docked, report every pressed action as blocked and exit early.
    if (playerShip.isDocked) {
      if (input.fireWeapon) {
        result.weapon = { fired: false, reason: "docked" };
      }
      for (const key of ABILITY_KEYS) {
        if (input.abilityKeys[key]) {
          result.abilities[key] = { activated: false, reason: "docked" };
        }
      }
      return result;
    }

    // ── Weapon fire — Space key ────────────────────────────────────────────
    if (input.fireWeapon) {
      result.weapon = this.resolveWeaponFire(
        playerShip,
        focusedTargetId,
        primaryWeaponId,
        lockStrength,
      );
    }

    // ── Ability activations — B / V / C / X / Z keys ──────────────────────
    for (const key of ABILITY_KEYS) {
      if (input.abilityKeys[key]) {
        result.abilities[key] = this.resolveAbilityActivation(
          playerShip,
          abilityKeyMap[key] ?? null,
        );
      }
    }

    return result;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Attempt to fire the primary weapon at the focused target.
   * Pre-validates that both a weapon id and a target id exist before
   * calling CombatManager.fireWeapon.
   */
  private resolveWeaponFire(
    ship: Ship,
    targetId: string | null,
    weaponId: string | null,
    lockStrength: number,
  ): WeaponFireResult {
    if (!weaponId) {
      return { fired: false, reason: "no-weapon" };
    }
    if (!targetId) {
      return { fired: false, reason: "no-target" };
    }

    // Delegate to CombatManager for damage resolution (hit/miss, shield
    // absorption, armor degradation, kill detection, event logging).
    const event = this.combatManager.fireWeapon(
      ship.id,
      targetId,
      weaponId,
      lockStrength,
    );
    return { fired: true, event };
  }

  /**
   * Attempt to activate an ability by id via CombatManager.
   * Returns "no-ability-equipped" when no ability is mapped to the key, and
   * "not-available" when CombatManager rejects (cooldown or low energy).
   */
  private resolveAbilityActivation(
    ship: Ship,
    abilityId: string | null,
  ): AbilityActivationResult {
    if (!abilityId) {
      return { activated: false, reason: "no-ability-equipped" };
    }

    const activated = this.combatManager.activateAbility(ship.id, abilityId);
    return activated
      ? { activated: true }
      : { activated: false, reason: "not-available" };
  }
}

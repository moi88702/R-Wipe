/**
 * LoadoutManager.ts — owns the set of abilities installed on the player
 * ship, tracks cooldowns + ammo, and mediates activation requests.
 *
 * Phase B introduces this as the canonical abstraction for abilities. It is
 * NOT yet used by arcade mode — PowerUpManager still routes power-ups
 * through the direct PowerUpEffect path to preserve byte-for-byte behaviour.
 * Phases C (campaign) and D (ship builder) will flip the switch.
 *
 * Pure logic — no Pixi dependency. Node-testable.
 */

import {
  type AbilityDef,
  type AbilityId,
  type AmmoId,
  getAbilityDef,
} from "../game/abilities/registry";

export interface InstalledAbility {
  readonly def: AbilityDef;
  /** Remaining cooldown in ms. 0 = ready to fire. */
  currentCooldownMs: number;
  /** Remaining ammo. `Infinity` for infinite (e.g. arcade default). */
  ammo: number;
  /** Maximum ammo capacity. */
  ammoMax: number;
}

/** Why a tryActivate call failed. `null` on success. */
export type ActivateFailure = "unknown-ability" | "on-cooldown" | "no-ammo" | "passive";

export interface ActivateResult {
  ok: boolean;
  /** Populated when `ok === false`. */
  reason: ActivateFailure | null;
}

export class LoadoutManager {
  private readonly installed = new Map<AbilityId, InstalledAbility>();

  /** Clears every installed ability. Call on new run / new ship equip. */
  initialize(): void {
    this.installed.clear();
  }

  /**
   * Installs an ability at the given ammo level. If the ability is already
   * installed, its capacity + ammo are updated (ammo clamps to the new max).
   *
   * Pass `ammo = Infinity` for arcade-style unlimited ammo.
   */
  install(id: AbilityId, ammoMax: number, startingAmmo?: number): InstalledAbility {
    const def = getAbilityDef(id);
    const ammo = startingAmmo ?? ammoMax;
    const existing = this.installed.get(id);
    if (existing) {
      existing.ammoMax = ammoMax;
      existing.ammo = Math.min(ammo, ammoMax);
      return existing;
    }
    const inst: InstalledAbility = {
      def,
      currentCooldownMs: 0,
      ammo,
      ammoMax,
    };
    this.installed.set(id, inst);
    return inst;
  }

  /** Removes an ability. No-op if it was not installed. */
  uninstall(id: AbilityId): void {
    this.installed.delete(id);
  }

  /** Returns the installed entry, or undefined if this ability isn't mounted. */
  get(id: AbilityId): InstalledAbility | undefined {
    return this.installed.get(id);
  }

  /** Returns true if the ability is installed on the ship. */
  has(id: AbilityId): boolean {
    return this.installed.has(id);
  }

  /** All installed abilities (iteration order preserved from install()). */
  list(): ReadonlyArray<InstalledAbility> {
    return [...this.installed.values()];
  }

  /**
   * Attempts to activate an ability.
   *  - Returns `{ ok: true }` if cooldown and ammo checks pass. The caller is
   *    responsible for applying the gameplay effect; this call updates the
   *    loadout state (spends ammo, starts cooldown).
   *  - Returns `{ ok: false, reason }` on rejection. No state is mutated.
   *
   * Passive abilities always return `{ ok: false, reason: "passive" }` — they
   * are never "activated" via this path.
   */
  tryActivate(id: AbilityId): ActivateResult {
    const inst = this.installed.get(id);
    if (!inst) return { ok: false, reason: "unknown-ability" };
    if (inst.def.kind === "passive") return { ok: false, reason: "passive" };
    if (inst.currentCooldownMs > 0) return { ok: false, reason: "on-cooldown" };

    if (inst.def.ammoType !== "none") {
      if (inst.ammo < inst.def.ammoCostPerUse) return { ok: false, reason: "no-ammo" };
      if (inst.ammo !== Infinity) inst.ammo -= inst.def.ammoCostPerUse;
    }

    inst.currentCooldownMs = inst.def.cooldownMs;
    return { ok: true, reason: null };
  }

  /**
   * Refills ammo on all installed abilities of a given ammo type.
   * Used when the player picks up an ammo crate or buys ammo at a station.
   * Clamps to each ability's ammoMax.
   */
  refillAmmo(ammoType: AmmoId, amount: number): void {
    if (ammoType === "none") return;
    for (const inst of this.installed.values()) {
      if (inst.def.ammoType !== ammoType) continue;
      if (inst.ammo === Infinity) continue;
      inst.ammo = Math.min(inst.ammoMax, inst.ammo + amount);
    }
  }

  /**
   * Forcibly set the ammo on an installed ability.
   * Clamps to ammoMax. No-op if the ability isn't installed.
   */
  setAmmo(id: AbilityId, ammo: number): void {
    const inst = this.installed.get(id);
    if (!inst) return;
    inst.ammo = Math.min(inst.ammoMax, Math.max(0, ammo));
  }

  /**
   * Advances all cooldowns by `deltaTimeMs`. Clamps at 0.
   * Call once per frame during gameplay.
   */
  tick(deltaTimeMs: number): void {
    for (const inst of this.installed.values()) {
      if (inst.currentCooldownMs > 0) {
        inst.currentCooldownMs = Math.max(0, inst.currentCooldownMs - deltaTimeMs);
      }
    }
  }

  /**
   * Total power draw across all installed abilities. Used by the ship builder
   * (phase D) to enforce the reactor budget.
   */
  totalPowerDraw(): number {
    let sum = 0;
    for (const inst of this.installed.values()) sum += inst.def.powerDraw;
    return sum;
  }
}

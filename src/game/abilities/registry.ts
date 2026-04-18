/**
 * abilities/registry.ts — declarative registry of every player ability.
 *
 * An Ability is a behaviour the player ship can perform (fire main gun,
 * drop a panic bomb, pop a shield, fire the mega-laser, etc.). Each
 * ability is installed into a *bay* on the ship and optionally consumes
 * *ammo* from the ship's stores.
 *
 * Phase B goal: declare the abstraction and register every existing
 * power-up-driven ability against it. This module is NOT wired into the
 * live arcade loop — phases C (campaign) and D (ship builder) will route
 * activations through LoadoutManager. Arcade mode keeps using the direct
 * PowerUpEffect path in PowerUpManager.ts so behaviour is preserved.
 *
 * No Pixi dependencies — safe for the Node test env.
 */

import type { PowerUpType } from "../../types/index";

// ── IDs ────────────────────────────────────────────────────────────────────────

export type AbilityId =
  | "primary-weapon"
  | "weapon-spread"
  | "weapon-bomb"
  | "panic-bomb"
  | "mega-laser"
  | "shield"
  | "nanorepair"
  | "afterburner"
  | "weapon-upgrade";

/**
 * Ammo types the economy tracks. `"none"` is for passives and abilities
 * that are cooldown-gated only (shield, afterburner).
 */
export type AmmoId =
  | "none"
  | "panic-bombs"
  | "prox-bombs"
  | "nanobots"
  | "charge-cells"
  | "fuel-cells";

export type BayCategory =
  | "primary"
  | "utility"
  | "defensive"
  | "engine"
  | "reactor";

// ── Ability definition ─────────────────────────────────────────────────────────

export interface AbilityDef {
  id: AbilityId;
  /** `"active"` — triggered by player input. `"passive"` — always-on / on-pickup. */
  kind: "active" | "passive";
  bayCategory: BayCategory;
  /** Cooldown in ms between successful activations. 0 = none. */
  cooldownMs: number;
  /** Ammo consumed per activation. `"none"` for infinite. */
  ammoType: AmmoId;
  /** Units of ammo consumed per activation (ignored if ammoType = "none"). */
  ammoCostPerUse: number;
  /** Power draw on the ship's reactor budget. */
  powerDraw: number;
  /** Human label for UI. */
  name: string;
}

export const ABILITY_REGISTRY: Readonly<Record<AbilityId, AbilityDef>> = {
  "primary-weapon": {
    id: "primary-weapon",
    kind: "active",
    bayCategory: "primary",
    cooldownMs: 0, // fire-rate is weapon-state driven, not ability cooldown
    ammoType: "none",
    ammoCostPerUse: 0,
    powerDraw: 10,
    name: "Primary Weapon",
  },
  "weapon-spread": {
    id: "weapon-spread",
    kind: "passive",
    bayCategory: "primary",
    cooldownMs: 0,
    ammoType: "none",
    ammoCostPerUse: 0,
    powerDraw: 0,
    name: "Spread Shot",
  },
  "weapon-bomb": {
    id: "weapon-bomb",
    kind: "active",
    bayCategory: "primary",
    cooldownMs: 0,
    ammoType: "prox-bombs",
    ammoCostPerUse: 1,
    powerDraw: 0,
    name: "Proximity Bomb",
  },
  "panic-bomb": {
    id: "panic-bomb",
    kind: "active",
    bayCategory: "utility",
    cooldownMs: 8_000,
    ammoType: "panic-bombs",
    ammoCostPerUse: 1,
    powerDraw: 25,
    name: "Panic Bomb",
  },
  "mega-laser": {
    id: "mega-laser",
    kind: "active",
    bayCategory: "primary",
    cooldownMs: 30_000,
    ammoType: "charge-cells",
    ammoCostPerUse: 1,
    powerDraw: 50,
    name: "Mega Laser",
  },
  "shield": {
    id: "shield",
    kind: "active",
    bayCategory: "defensive",
    cooldownMs: 12_000,
    ammoType: "none",
    ammoCostPerUse: 0,
    powerDraw: 20,
    name: "Shield Emitter",
  },
  "nanorepair": {
    id: "nanorepair",
    kind: "active",
    bayCategory: "utility",
    cooldownMs: 15_000,
    ammoType: "nanobots",
    ammoCostPerUse: 1,
    powerDraw: 15,
    name: "Nanorepair Bay",
  },
  "afterburner": {
    id: "afterburner",
    kind: "active",
    bayCategory: "engine",
    cooldownMs: 6_000,
    ammoType: "fuel-cells",
    ammoCostPerUse: 1,
    powerDraw: 15,
    name: "Afterburner",
  },
  "weapon-upgrade": {
    id: "weapon-upgrade",
    kind: "passive",
    bayCategory: "primary",
    cooldownMs: 0,
    ammoType: "none",
    ammoCostPerUse: 0,
    powerDraw: 0,
    name: "Weapon Upgrade",
  },
};

// ── PowerUpType → AbilityId mapping ────────────────────────────────────────────

/**
 * Maps arcade-mode PowerUpType pickups to the ability they activate or upgrade.
 * Used by the campaign side (future phases) to translate a drop into an ability
 * refill / activation. Arcade mode still uses the direct PowerUpEffect path.
 */
export const POWER_UP_TO_ABILITY: Readonly<Record<PowerUpType, AbilityId>> = {
  "weapon-upgrade": "weapon-upgrade",
  "weapon-spread": "weapon-spread",
  "weapon-bomb": "weapon-bomb",
  "shield": "shield",
  "health-recovery": "nanorepair",
  "extra-life": "nanorepair", // no campaign ability yet — placeholder
  "speed-boost": "afterburner",
  "mega-laser": "mega-laser",
};

/** Lookup, or throw if id is unknown. */
export function getAbilityDef(id: AbilityId): AbilityDef {
  const def = ABILITY_REGISTRY[id];
  if (!def) throw new Error(`Unknown AbilityId: ${id}`);
  return def;
}

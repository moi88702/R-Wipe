/**
 * Pure stat aggregation for ship blueprints.
 *
 * Given a Blueprint (list of placed parts) and the parts registry, fold every
 * part's StatDelta into a single ShipStats. `computeShipStats` is
 * deterministic and side-effect-free — used by the stats preview in the
 * shipyard UI and by GameManager at mission start to override player stats.
 */

import type {
  BayCategory,
  Blueprint,
  PartDef,
  ShipStats,
} from "../../types/shipBuilder";
import { PARTS_REGISTRY } from "./registry";

/** Baseline stats for a ship before any parts are applied. */
const BASE: ShipStats = Object.freeze({
  hp: 100,
  speed: 420,
  fireRate: 1,
  damage: 10,
  bays: { primary: 0, utility: 0, defensive: 0, engine: 0, reactor: 0 },
  hitbox: { width: 0, height: 0 },
  cost: 0,
}) as ShipStats;

const BAY_KEYS: readonly BayCategory[] = [
  "primary",
  "utility",
  "defensive",
  "engine",
  "reactor",
];

function emptyBays(): Record<BayCategory, number> {
  return { primary: 0, utility: 0, defensive: 0, engine: 0, reactor: 0 };
}

/**
 * Aggregate a blueprint into a ShipStats. Missing parts are silently skipped
 * so a content update removing a part doesn't break saved blueprints —
 * `validateBlueprint` (assembly.ts) is the place to surface that kind of
 * structural issue.
 */
export function computeShipStats(blueprint: Blueprint): ShipStats {
  let hp = BASE.hp;
  let speed = BASE.speed;
  let fireRate = BASE.fireRate;
  let damage = BASE.damage;
  const bays = emptyBays();
  let hitboxW = 0;
  let hitboxH = 0;
  let cost = 0;

  for (const placed of blueprint.parts) {
    const def: PartDef | undefined = PARTS_REGISTRY[placed.partId];
    if (!def) continue;
    const s = def.stats;
    hp += s.hpDelta ?? 0;
    speed += s.speedDelta ?? 0;
    fireRate += s.fireRateDelta ?? 0;
    damage += s.damageDelta ?? 0;
    if (s.bays) {
      for (const k of BAY_KEYS) {
        bays[k] += s.bays[k] ?? 0;
      }
    }
    // Hitbox: additive in both dimensions, capped below so a minimal ship
    // still has a real hit target.
    hitboxW += s.hitboxWidth ?? 0;
    hitboxH += s.hitboxHeight ?? 0;
    cost += s.cost ?? 0;
  }

  return {
    hp: Math.max(10, hp),
    speed: Math.max(100, speed),
    fireRate: Math.max(0.25, fireRate),
    damage: Math.max(1, Math.round(damage)),
    bays,
    hitbox: {
      width: Math.max(16, hitboxW),
      height: Math.max(12, hitboxH),
    },
    cost,
  };
}

export function getBaseStats(): ShipStats {
  return {
    ...BASE,
    bays: emptyBays(),
    hitbox: { ...BASE.hitbox },
  };
}

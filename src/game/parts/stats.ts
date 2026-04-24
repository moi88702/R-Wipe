/**
 * Pure stat aggregation for ship blueprints (v2).
 *
 * Hitbox comes from `geometry.layoutBlueprint(blueprint).bbox` — i.e. the real
 * assembled silhouette. Stat deltas from each part fold into the baseline.
 * Power usage is tracked alongside stats for the shipyard HUD.
 */

import type {
  BayCategory,
  Blueprint,
  PartDef,
  ShipStats,
} from "../../types/shipBuilder";
import { PARTS_REGISTRY } from "./registry";
import { layoutBlueprint } from "./geometry";

const BASE: ShipStats = Object.freeze({
  hp: 100,
  speed: 420,
  fireRate: 1,
  damage: 10,
  bays: { primary: 0, utility: 0, defensive: 0, engine: 0, reactor: 0 },
  hitbox: { width: 0, height: 0 },
  cost: 0,
  powerUsed: 0,
  powerCapacity: 0,
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

export function computeShipStats(blueprint: Blueprint): ShipStats {
  let hp = BASE.hp;
  let speed = BASE.speed;
  let fireRate = BASE.fireRate;
  let damage = BASE.damage;
  const bays = emptyBays();
  let cost = 0;
  let powerUsed = 0;
  let powerCapacity = 0;

  for (const placed of blueprint.parts) {
    const def: PartDef | undefined = PARTS_REGISTRY[placed.partId];
    if (!def) continue;
    const s = def.stats;
    hp += s.hpDelta ?? 0;
    speed += s.speedDelta ?? 0;
    fireRate += s.fireRateDelta ?? 0;
    damage += s.damageDelta ?? 0;
    if (s.bays) {
      for (const k of BAY_KEYS) bays[k] += s.bays[k] ?? 0;
    }
    cost += s.cost ?? 0;
    if (def.category === "core") {
      powerCapacity += def.powerCapacity ?? 0;
    } else {
      powerUsed += def.powerCost;
    }
  }

  const layout = layoutBlueprint(blueprint);
  const hitboxW = Math.max(16, Math.round(layout.bbox.width));
  const hitboxH = Math.max(12, Math.round(layout.bbox.height));

  return {
    hp: Math.max(10, hp),
    speed: Math.max(100, speed),
    fireRate: Math.max(0.25, fireRate),
    damage: Math.max(1, Math.round(damage)),
    bays,
    hitbox: { width: hitboxW, height: hitboxH },
    cost,
    powerUsed,
    powerCapacity,
  };
}

export function getBaseStats(): ShipStats {
  return {
    ...BASE,
    bays: emptyBays(),
    hitbox: { ...BASE.hitbox },
  };
}

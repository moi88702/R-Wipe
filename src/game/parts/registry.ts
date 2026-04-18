/**
 * Parts registry — the canonical catalogue of ship parts available for the
 * builder. Hand-authored today; future content passes can extend this table
 * without touching the assembly/stats logic.
 *
 * Stats here are *deltas* from the vanilla ship. `computeShipStats` folds
 * them on top of the base profile defined in PlayerManager. Numbers are
 * intentionally conservative — a fully kitted ship shouldn't feel like an
 * arcade-mode god.
 */

import type { PartDef, Socket } from "../../types/shipBuilder";

const sockets = (...list: Socket[]): readonly Socket[] => Object.freeze(list);

// ── Hulls — the spine every other part plugs into ──────────────────────────

const HULL_STANDARD: PartDef = {
  id: "hull-standard-t1",
  category: "hull",
  name: "Standard Hull",
  tier: 1,
  plugsInto: "hull-front", // hulls are roots; plugsInto is unused
  sockets: sockets(
    { id: "s-nose", type: "cockpit-mount", x: 20, y: 0 },
    { id: "s-tail", type: "engine-mount", x: -20, y: 0 },
    { id: "s-wingL", type: "wing-root-left", x: 0, y: -12 },
    { id: "s-wingR", type: "wing-root-right", x: 0, y: 12 },
  ),
  stats: {
    hpDelta: 0,
    bays: { primary: 1, utility: 0, defensive: 0, engine: 1, reactor: 1 },
    hitboxWidth: 40,
    hitboxHeight: 24,
    cost: 0,
  },
};

const HULL_REINFORCED: PartDef = {
  id: "hull-reinforced-t1",
  category: "hull",
  name: "Reinforced Hull",
  tier: 1,
  plugsInto: "hull-front",
  sockets: sockets(
    { id: "s-nose", type: "cockpit-mount", x: 22, y: 0 },
    { id: "s-tail", type: "engine-mount", x: -22, y: 0 },
    { id: "s-wingL", type: "wing-root-left", x: 0, y: -14 },
    { id: "s-wingR", type: "wing-root-right", x: 0, y: 14 },
  ),
  stats: {
    hpDelta: 35,
    speedDelta: -20,
    bays: { primary: 1, utility: 0, defensive: 1, engine: 1, reactor: 1 },
    hitboxWidth: 46,
    hitboxHeight: 28,
    cost: 400,
  },
};

const HULL_LARGE: PartDef = {
  id: "hull-large-t2",
  category: "hull",
  name: "Large Hull",
  tier: 2,
  plugsInto: "hull-front",
  sockets: sockets(
    { id: "s-nose", type: "cockpit-mount", x: 28, y: 0 },
    { id: "s-tail", type: "engine-mount", x: -28, y: 0 },
    { id: "s-wingL", type: "wing-root-left", x: 0, y: -18 },
    { id: "s-wingR", type: "wing-root-right", x: 0, y: 18 },
  ),
  stats: {
    hpDelta: 75,
    speedDelta: -40,
    bays: { primary: 2, utility: 1, defensive: 1, engine: 1, reactor: 2 },
    hitboxWidth: 58,
    hitboxHeight: 34,
    cost: 1200,
  },
};

// ── Cockpits — sit on hull-front, drive fire rate + utility bays ───────────

const COCKPIT_STANDARD: PartDef = {
  id: "cockpit-standard-t1",
  category: "cockpit",
  name: "Standard Cockpit",
  tier: 1,
  plugsInto: "cockpit-mount",
  sockets: sockets(),
  stats: {
    hitboxWidth: 8,
    hitboxHeight: 6,
    cost: 0,
  },
};

const COCKPIT_TECHNO: PartDef = {
  id: "cockpit-techno-t2",
  category: "cockpit",
  name: "Techno Cockpit",
  tier: 2,
  plugsInto: "cockpit-mount",
  sockets: sockets(),
  stats: {
    fireRateDelta: 0.15,
    bays: { utility: 1 },
    hitboxWidth: 10,
    hitboxHeight: 7,
    cost: 900,
  },
};

// ── Wings — left/right mirrored, raise damage + stability ──────────────────

const WING_STANDARD_L: PartDef = {
  id: "wing-standard-l-t1",
  category: "wing",
  name: "Standard Wing (L)",
  tier: 1,
  plugsInto: "wing-root-left",
  sockets: sockets(),
  stats: {
    damageDelta: 1,
    hitboxWidth: 14,
    hitboxHeight: 20,
    cost: 0,
  },
};

const WING_STANDARD_R: PartDef = {
  id: "wing-standard-r-t1",
  category: "wing",
  name: "Standard Wing (R)",
  tier: 1,
  plugsInto: "wing-root-right",
  sockets: sockets(),
  stats: {
    damageDelta: 1,
    hitboxWidth: 14,
    hitboxHeight: 20,
    cost: 0,
  },
};

const WING_ARMOURED: PartDef = {
  id: "wing-armoured-t2",
  category: "wing",
  name: "Armoured Wing",
  tier: 2,
  // Mirrored automatically at assembly time — this part accepts either root.
  plugsInto: "wing-root-left",
  sockets: sockets(),
  stats: {
    hpDelta: 20,
    damageDelta: 2,
    speedDelta: -10,
    bays: { defensive: 1 },
    hitboxWidth: 18,
    hitboxHeight: 26,
    cost: 700,
  },
};

const WING_ARMOURED_R: PartDef = {
  ...WING_ARMOURED,
  id: "wing-armoured-r-t2",
  name: "Armoured Wing (R)",
  plugsInto: "wing-root-right",
};

// ── Engines — drive speed, grant engine-bay slots ──────────────────────────

const ENGINE_STANDARD: PartDef = {
  id: "engine-standard-t1",
  category: "engine",
  name: "Standard Engine",
  tier: 1,
  plugsInto: "engine-mount",
  sockets: sockets(),
  stats: {
    speedDelta: 0,
    hitboxWidth: 14,
    hitboxHeight: 14,
    cost: 0,
  },
};

const ENGINE_PLASMA: PartDef = {
  id: "engine-plasma-t3",
  category: "engine",
  name: "Plasma Engine",
  tier: 3,
  plugsInto: "engine-mount",
  sockets: sockets(),
  stats: {
    speedDelta: 60,
    fireRateDelta: -0.05,
    bays: { engine: 1, reactor: 1 },
    hitboxWidth: 18,
    hitboxHeight: 18,
    cost: 1800,
  },
};

export const PARTS_REGISTRY: Readonly<Record<string, PartDef>> = Object.freeze({
  [HULL_STANDARD.id]: HULL_STANDARD,
  [HULL_REINFORCED.id]: HULL_REINFORCED,
  [HULL_LARGE.id]: HULL_LARGE,
  [COCKPIT_STANDARD.id]: COCKPIT_STANDARD,
  [COCKPIT_TECHNO.id]: COCKPIT_TECHNO,
  [WING_STANDARD_L.id]: WING_STANDARD_L,
  [WING_STANDARD_R.id]: WING_STANDARD_R,
  [WING_ARMOURED.id]: WING_ARMOURED,
  [WING_ARMOURED_R.id]: WING_ARMOURED_R,
  [ENGINE_STANDARD.id]: ENGINE_STANDARD,
  [ENGINE_PLASMA.id]: ENGINE_PLASMA,
});

/** Default parts every new campaign run starts with. */
export const DEFAULT_UNLOCKED_PARTS: readonly string[] = Object.freeze([
  HULL_STANDARD.id,
  COCKPIT_STANDARD.id,
  WING_STANDARD_L.id,
  WING_STANDARD_R.id,
  ENGINE_STANDARD.id,
]);

export function getPart(id: string): PartDef | undefined {
  return PARTS_REGISTRY[id];
}

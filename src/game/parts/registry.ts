/**
 * Parts registry (v2) — cores, hulls, wings, engines, weapons, utility.
 *
 * Every ship roots on a core (power producer). Every other part costs power.
 * Baseline part size is 28×28 — small parts are 12–18 px, large parts 36–40.
 * Shapes are the AABB used for both the rendered silhouette and the assembled
 * ship's hitbox (via geometry.ts).
 */

import type { PartDef, Socket } from "../../types/shipBuilder";

const sockets = (...list: Socket[]): readonly Socket[] => Object.freeze(list);
const s = (id: string, x: number, y: number): Socket => ({ id, type: "mount", x, y });

// ── Cores — the required root; provide power capacity ──────────────────────

const CORE_STARTER: PartDef = {
  id: "core-starter",
  category: "core",
  name: "Starter Core",
  tier: 1,
  shape: { width: 12, height: 12 },
  visualKind: "core-hex",
  colour: 0x3df0ff,
  sockets: sockets(s("s-hull", 0, 0)),
  plugsInto: null,
  powerCost: 0,
  powerCapacity: 1,
  stats: { cost: 0 },
};

const CORE_MID: PartDef = {
  id: "core-mid",
  category: "core",
  name: "Fusion Core",
  tier: 2,
  shape: { width: 18, height: 18 },
  visualKind: "core-hex",
  colour: 0xff9e3d,
  sockets: sockets(s("s-hull", 0, 0)),
  plugsInto: null,
  powerCost: 0,
  powerCapacity: 4,
  stats: { hpDelta: 10, damageDelta: 2, cost: 800 },
};

const CORE_LARGE: PartDef = {
  id: "core-large",
  category: "core",
  name: "Antimatter Core",
  tier: 3,
  shape: { width: 24, height: 24 },
  visualKind: "core-hex",
  colour: 0xff3df0,
  sockets: sockets(s("s-hull", 0, 0)),
  plugsInto: null,
  powerCost: 0,
  powerCapacity: 10,
  stats: { hpDelta: 40, damageDelta: 5, cost: 3000 },
};

// ── Hulls — root chassis; the starter is all-in-one (cockpit+engine+weapon) ─

const HULL_STARTER: PartDef = {
  id: "hull-starter",
  category: "hull",
  name: "Starter Hull",
  tier: 1,
  shape: { width: 28, height: 22 },
  visualKind: "hull-delta",
  colour: 0x3df0ff,
  sockets: sockets(
    s("s-nose", 12, 0),
    s("s-tail", -12, 0),
    s("s-top", -2, -10),
    s("s-bot", -2, 10),
  ),
  plugsInto: "mount",
  powerCost: 1,
  stats: { cost: 0 },
};

const HULL_HEAVY: PartDef = {
  id: "hull-heavy",
  category: "hull",
  name: "Heavy Hull",
  tier: 2,
  shape: { width: 40, height: 26 },
  visualKind: "hull-block",
  colour: 0xffc347,
  sockets: sockets(
    s("s-nose", 18, 0),
    s("s-tail", -18, 0),
    s("s-top-l", -8, -12),
    s("s-top-r", 6, -12),
    s("s-bot-l", -8, 12),
    s("s-bot-r", 6, 12),
  ),
  plugsInto: "mount",
  powerCost: 2,
  stats: { hpDelta: 25, speedDelta: -30, cost: 600 },
};

// ── Wings — visually asymmetric fins, mirrored L/R ────────────────────────

const WING_FIN_L: PartDef = {
  id: "wing-fin-l",
  category: "wing",
  name: "Fin Wing (Top)",
  tier: 1,
  shape: { width: 18, height: 16 },
  visualKind: "wing-fin-top",
  colour: 0x3df0ff,
  sockets: sockets(),
  plugsInto: "mount",
  powerCost: 1,
  stats: { damageDelta: 1, hpDelta: 5, cost: 300 },
};

const WING_FIN_R: PartDef = {
  id: "wing-fin-r",
  category: "wing",
  name: "Fin Wing (Bot)",
  tier: 1,
  shape: { width: 18, height: 16 },
  visualKind: "wing-fin-bot",
  colour: 0x3df0ff,
  sockets: sockets(),
  plugsInto: "mount",
  powerCost: 1,
  stats: { damageDelta: 1, hpDelta: 5, cost: 300 },
};

const WING_LONG: PartDef = {
  id: "wing-long",
  category: "wing",
  name: "Long Wing",
  tier: 2,
  shape: { width: 10, height: 36 },
  visualKind: "wing-long",
  colour: 0xa78bfa,
  sockets: sockets(),
  plugsInto: "mount",
  powerCost: 2,
  stats: { hpDelta: 15, damageDelta: 2, speedDelta: -10, cost: 900 },
};

// ── Engines ───────────────────────────────────────────────────────────────

const ENGINE_BOOST: PartDef = {
  id: "engine-boost",
  category: "engine",
  name: "Boost Engine",
  tier: 1,
  shape: { width: 14, height: 12 },
  visualKind: "engine-nozzle",
  colour: 0xff9e3d,
  sockets: sockets(),
  plugsInto: "mount",
  powerCost: 1,
  stats: { speedDelta: 40, cost: 500 },
};

const ENGINE_PLASMA: PartDef = {
  id: "engine-plasma",
  category: "engine",
  name: "Plasma Engine",
  tier: 3,
  shape: { width: 18, height: 16 },
  visualKind: "engine-plasma",
  colour: 0xff3df0,
  sockets: sockets(),
  plugsInto: "mount",
  powerCost: 2,
  stats: { speedDelta: 80, fireRateDelta: -0.05, cost: 1800 },
};

// ── Weapons ───────────────────────────────────────────────────────────────

const CANNON_HEAVY: PartDef = {
  id: "cannon-heavy",
  category: "weapon",
  name: "Heavy Cannon",
  tier: 2,
  shape: { width: 14, height: 10 },
  visualKind: "cannon-barrel",
  colour: 0xff5555,
  sockets: sockets(),
  plugsInto: "mount",
  powerCost: 2,
  stats: { damageDelta: 6, fireRateDelta: -0.1, cost: 1200 },
};

// ── Utility ───────────────────────────────────────────────────────────────

const SHIELD_MOD: PartDef = {
  id: "shield-mod",
  category: "utility",
  name: "Shield Module",
  tier: 2,
  shape: { width: 12, height: 12 },
  visualKind: "shield-ring",
  colour: 0x7dffb8,
  sockets: sockets(),
  plugsInto: "mount",
  powerCost: 2,
  stats: { hpDelta: 50, speedDelta: -15, bays: { defensive: 1 }, cost: 1500 },
};

export const PARTS_REGISTRY: Readonly<Record<string, PartDef>> = Object.freeze({
  [CORE_STARTER.id]: CORE_STARTER,
  [CORE_MID.id]: CORE_MID,
  [CORE_LARGE.id]: CORE_LARGE,
  [HULL_STARTER.id]: HULL_STARTER,
  [HULL_HEAVY.id]: HULL_HEAVY,
  [WING_FIN_L.id]: WING_FIN_L,
  [WING_FIN_R.id]: WING_FIN_R,
  [WING_LONG.id]: WING_LONG,
  [ENGINE_BOOST.id]: ENGINE_BOOST,
  [ENGINE_PLASMA.id]: ENGINE_PLASMA,
  [CANNON_HEAVY.id]: CANNON_HEAVY,
  [SHIELD_MOD.id]: SHIELD_MOD,
});

/** Parts every campaign starts with — just enough to build the starter ship. */
export const DEFAULT_UNLOCKED_PARTS: readonly string[] = Object.freeze([
  CORE_STARTER.id,
  HULL_STARTER.id,
]);

export const STARTER_CORE_ID = CORE_STARTER.id;
export const STARTER_HULL_ID = HULL_STARTER.id;

export function getPart(id: string): PartDef | undefined {
  return PARTS_REGISTRY[id];
}

/**
 * Builds the default starter blueprint: one power core + one all-in-one hull.
 * Used by GameManager for the first-campaign-launch seed and by the shipyard
 * when the player hits "NEW".
 */
export function makeStarterBlueprint(): import("../../types/shipBuilder").Blueprint {
  return {
    id: "bp-starter",
    name: "Starter",
    parts: [
      { id: "core", partId: STARTER_CORE_ID, parentId: null, parentSocketId: null, colourId: null },
      { id: "hull", partId: STARTER_HULL_ID, parentId: "core", parentSocketId: "s-hull", colourId: null },
    ],
  };
}

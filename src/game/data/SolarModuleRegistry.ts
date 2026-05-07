/**
 * SolarModuleRegistry — static definitions for all solar-system ship modules.
 *
 * Modules are organised by type and sizeClass. Phase 1 covers class-1 (frigate)
 * fully; higher classes are stubs for future expansion.
 *
 * Side-length scale per class (px):
 *   1=60  2=80  3=110  4=145  5=185  6=225  7=225  8=270  9=270
 *
 * Core shape.sides is a placeholder (6) — the actual polygon side count is
 * supplied by SolarShipBlueprint.coreSideCount at runtime.
 */

import type {
  SolarModuleDefinition,
  CoreDefinition,
  ShipClass,
} from "../../types/solarShipBuilder";

// ── Class side lengths ────────────────────────────────────────────────────────

const SIDE_PX: Record<ShipClass, number> = {
  1: 60, 2: 80, 3: 110, 4: 145, 5: 185, 6: 225, 7: 225, 8: 270, 9: 270,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function core(
  id: string,
  cls: ShipClass,
  variant: CoreDefinition["variant"],
  wp: number,
  ep: number,
  ip: number,
  hp: number,
  cost: number,
): CoreDefinition {
  return {
    id,
    name: `${cls === 1 ? "Frigate" : cls === 2 ? "Destroyer" : cls === 3 ? "Cruiser" : `Class-${cls}`} Core — ${variant.charAt(0).toUpperCase() + variant.slice(1)}`,
    type: "core",
    sizeClass: cls,
    variant,
    shape: { sides: 6, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: null },
    budgetCost: 0,
    stats: { hp },
    weaponPoints: wp,
    externalPoints: ep,
    internalPoints: ip,
    converterPoints: 5,
    maxParts: 50,
    shopCost: cost,
  };
}

function weapon(
  id: string,
  cls: ShipClass,
  name: string,
  sides: number,
  damage: number,
  rateHz: number,
  cost: number,
): SolarModuleDefinition {
  return {
    id, name, type: "weapon", sizeClass: cls,
    // Weapons are leaf nodes — nothing can attach to them (no barrel children)
    shape: { sides, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: [] },
    budgetCost: 1,
    stats: { damagePerShot: damage, fireRateHz: rateHz },
    shopCost: cost,
  };
}

function external(
  id: string,
  cls: ShipClass,
  name: string,
  sides: number,
  stats: SolarModuleDefinition["stats"],
  cost: number,
): SolarModuleDefinition {
  return {
    id, name, type: "external", sizeClass: cls,
    // External modules are leaf nodes — the emitter/sensor face cannot have children
    shape: { sides, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: [] },
    budgetCost: 1,
    stats,
    shopCost: cost,
  };
}

function internal(
  id: string,
  cls: ShipClass,
  name: string,
  sides: number,
  stats: SolarModuleDefinition["stats"],
  cost: number,
): SolarModuleDefinition {
  return {
    id, name, type: "internal", sizeClass: cls,
    shape: { sides, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: null },
    budgetCost: 1,
    stats,
    shopCost: cost,
  };
}

function structure(
  id: string,
  cls: ShipClass,
  name: string,
  sides: number,
  cost: number,
): SolarModuleDefinition {
  return {
    id, name, type: "structure", sizeClass: cls,
    shape: { sides, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: null },
    budgetCost: 0,
    stats: {},
    shopCost: cost,
  };
}

import type { ConverterSpec, SolarModuleType } from "../../types/solarShipBuilder";

function converter(
  id: string,
  cls: ShipClass,
  from: SolarModuleType,
  to: SolarModuleType,
  lvl: 1 | 2 | 3,
  cost: number,
): SolarModuleDefinition {
  const budgetCost = lvl === 1 ? 5 : lvl === 2 ? 2 : 1;
  const spec: ConverterSpec = { fromType: from, toType: to, converterBudgetCost: budgetCost };
  return {
    id,
    name: `${from.charAt(0).toUpperCase()}→${to.charAt(0).toUpperCase()} Converter Lv${lvl}`,
    type: "converter",
    sizeClass: cls,
    shape: { sides: 4, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: null },
    budgetCost: 0,
    stats: {},
    converterSpec: spec,
    shopCost: cost,
  };
}

// ── Module definitions ────────────────────────────────────────────────────────

const ALL_MODULES: ReadonlyArray<SolarModuleDefinition> = [

  // ── Cores: class 1 (frigate) ───────────────────────────────────────────────
  //   armor: more HP / fewer slots    power: more slots / less HP    balanced: middle
  core("core-c1-armor",    1, "armor",    2, 1, 1, 120, 1_000),
  core("core-c1-power",    1, "power",    1, 2, 2,  60, 1_000),
  core("core-c1-balanced", 1, "balanced", 2, 2, 2,  90, 1_200),

  // ── Cores: class 2 (destroyer) ────────────────────────────────────────────
  core("core-c2-armor",    2, "armor",    3, 2, 2, 200, 3_500),
  core("core-c2-power",    2, "power",    2, 3, 3, 120, 3_500),
  core("core-c2-balanced", 2, "balanced", 3, 3, 3, 160, 4_000),

  // ── Cores: class 3 (cruiser) ──────────────────────────────────────────────
  core("core-c3-armor",    3, "armor",    4, 3, 3, 350, 8_000),
  core("core-c3-power",    3, "power",    3, 4, 4, 200, 8_000),
  core("core-c3-balanced", 3, "balanced", 4, 4, 4, 280, 9_500),

  // ── Weapons: class 1 ──────────────────────────────────────────────────────
  weapon("weapon-cannon-c1",  1, "Light Cannon",  3, 25, 0.8, 300),
  weapon("weapon-laser-c1",   1, "Pulse Laser",   4, 10, 3.0, 400),
  weapon("weapon-torpedo-c1", 1, "Mini Torpedo",  3, 60, 0.3, 500),

  // ── Weapons: class 2 ──────────────────────────────────────────────────────
  weapon("weapon-cannon-c2",  2, "Heavy Cannon",  3,  50, 0.8,   900),
  weapon("weapon-laser-c2",   2, "Beam Laser",    4,  20, 3.0, 1_200),
  weapon("weapon-torpedo-c2", 2, "Torpedo Bay",   3, 120, 0.3, 1_500),

  // ── External systems: class 1 ─────────────────────────────────────────────
  external("ext-shield-c1",  1, "Shield Module",   4, { shieldCapacity: 80 },         350),
  external("ext-sensor-c1",  1, "Sensor Array",    3, { sensorRangeKm: 500 },         250),
  internal("ext-armor-c1",   1, "Armor Plate",     4, { armor: 20, hp: 40 },          200),

  // ── External systems: class 2 ─────────────────────────────────────────────
  external("ext-shield-c2",  2, "Heavy Shield",    4, { shieldCapacity: 160 },       1_050),
  external("ext-sensor-c2",  2, "Long-Range Scan", 3, { sensorRangeKm: 1_200 },        750),
  internal("ext-armor-c2",   2, "Reinforced Hull", 4, { armor: 40, hp: 80 },           600),

  // ── Internal systems: class 1 ─────────────────────────────────────────────
  external("int-engine-c1",  1, "Thruster",          3, { thrustMs2: 2_000 },          300),
  internal("int-power-c1",   1, "Power Core",        4, { powerOutput: 100 },          300),
  internal("int-crew-c1",    1, "Crew Quarters",     5, {},                            200),

  // ── Internal systems: class 2 ─────────────────────────────────────────────
  external("int-engine-c2",  2, "Fusion Thruster",   3, { thrustMs2: 4_500 },          900),
  internal("int-power-c2",   2, "Reactor Cell",      4, { powerOutput: 250 },          900),
  internal("int-crew-c2",    2, "Officer Quarters",  5, {},                            600),

  // ── Structure: class 1 ────────────────────────────────────────────────────
  structure("struct-tri-c1",  1, "Tri-Frame",   3,  50),
  structure("struct-quad-c1", 1, "Quad-Frame",  4,  75),
  structure("struct-pent-c1", 1, "Penta-Frame", 5,  90),
  structure("struct-hex-c1",  1, "Hex-Junction",6, 110),

  // ── Structure: class 2 ────────────────────────────────────────────────────
  structure("struct-tri-c2",  2, "Tri-Frame II",   3, 150),
  structure("struct-quad-c2", 2, "Quad-Frame II",  4, 220),
  structure("struct-hex-c2",  2, "Hex-Junction II",6, 330),

  // ── Converters: class 1, all six permutations at level 1 (cost 5) ─────────
  converter("conv-w-to-e-c1", 1, "weapon",   "external", 1,  500),
  converter("conv-w-to-i-c1", 1, "weapon",   "internal", 1,  500),
  converter("conv-e-to-w-c1", 1, "external", "weapon",   1,  500),
  converter("conv-e-to-i-c1", 1, "external", "internal", 1,  500),
  converter("conv-i-to-w-c1", 1, "internal", "weapon",   1,  500),
  converter("conv-i-to-e-c1", 1, "internal", "external", 1,  500),

  // ── Converters: class 1, level 2 (cost 2) ────────────────────────────────
  converter("conv-w-to-e-c1-l2", 1, "weapon",   "external", 2,  800),
  converter("conv-w-to-i-c1-l2", 1, "weapon",   "internal", 2,  800),
  converter("conv-e-to-w-c1-l2", 1, "external", "weapon",   2,  800),
  converter("conv-e-to-i-c1-l2", 1, "external", "internal", 2,  800),
  converter("conv-i-to-w-c1-l2", 1, "internal", "weapon",   2,  800),
  converter("conv-i-to-e-c1-l2", 1, "internal", "external", 2,  800),

  // ── Converters: class 1, level 3 (cost 1) ────────────────────────────────
  converter("conv-w-to-e-c1-l3", 1, "weapon",   "external", 3, 1_200),
  converter("conv-w-to-i-c1-l3", 1, "weapon",   "internal", 3, 1_200),
  converter("conv-e-to-w-c1-l3", 1, "external", "weapon",   3, 1_200),
  converter("conv-e-to-i-c1-l3", 1, "external", "internal", 3, 1_200),
  converter("conv-i-to-w-c1-l3", 1, "internal", "weapon",   3, 1_200),
  converter("conv-i-to-e-c1-l3", 1, "internal", "external", 3, 1_200),

  // ── Cores: class 4 (battlecruiser) ───────────────────────────────────────
  core("core-c4-armor",    4, "armor",     5, 4, 4,   500, 20_000),
  core("core-c4-power",    4, "power",     4, 5, 5,   300, 20_000),
  core("core-c4-balanced", 4, "balanced",  5, 5, 5,   400, 24_000),

  // ── Cores: class 5 (battleship) ──────────────────────────────────────────
  core("core-c5-armor",    5, "armor",     6, 5, 5,   750, 45_000),
  core("core-c5-power",    5, "power",     5, 6, 6,   450, 45_000),
  core("core-c5-balanced", 5, "balanced",  6, 6, 6,   600, 54_000),

  // ── Cores: class 6 (dreadnought) ─────────────────────────────────────────
  core("core-c6-armor",    6, "armor",     7, 6, 6, 1_100, 90_000),
  core("core-c6-power",    6, "power",     6, 7, 7,   660, 90_000),
  core("core-c6-balanced", 6, "balanced",  7, 7, 7,   880, 110_000),

  // ── Cores: class 7 (carrier) ─────────────────────────────────────────────
  core("core-c7-armor",    7, "armor",     6, 7, 8, 1_500, 180_000),
  core("core-c7-power",    7, "power",     5, 8, 9,   900, 180_000),
  core("core-c7-balanced", 7, "balanced",  6, 8, 8, 1_200, 220_000),

  // ── Cores: class 8 (super-dreadnought) ───────────────────────────────────
  core("core-c8-armor",    8, "armor",     9, 7, 7, 2_000, 360_000),
  core("core-c8-power",    8, "power",     8, 8, 8, 1_200, 360_000),
  core("core-c8-balanced", 8, "balanced",  9, 8, 8, 1_600, 440_000),

  // ── Cores: class 9 (titan) ───────────────────────────────────────────────
  core("core-c9-armor",    9, "armor",    10, 8, 8, 3_000, 720_000),
  core("core-c9-power",    9, "power",     9, 9, 9, 1_800, 720_000),
  core("core-c9-balanced", 9, "balanced", 10, 9, 9, 2_400, 880_000),

  // ── Weapons: class 3 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c3",  3, "Auto-Cannon",    3,  80, 0.8,   2_500),
  weapon("weapon-laser-c3",   3, "Strike Laser",   4,  35, 3.0,   3_000),
  weapon("weapon-torpedo-c3", 3, "Heavy Torpedo",  3, 200, 0.3,   4_000),

  // ── Weapons: class 4 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c4",  4, "Mass Driver",    3, 130, 0.8,   7_000),
  weapon("weapon-laser-c4",   4, "Focused Beam",   4,  55, 3.0,   9_000),
  weapon("weapon-torpedo-c4", 4, "Siege Torpedo",  3, 320, 0.3,  12_000),

  // ── Weapons: class 5 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c5",  5, "Railgun",        3, 200, 0.8,  18_000),
  weapon("weapon-laser-c5",   5, "Beam Array",     4,  80, 3.0,  22_000),
  weapon("weapon-torpedo-c5", 5, "Barrage Bay",    3, 500, 0.3,  30_000),

  // ── Weapons: class 6 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c6",  6, "Gauss Cannon",   3,   300, 0.8,  40_000),
  weapon("weapon-laser-c6",   6, "Lance Array",    4,   120, 3.0,  50_000),
  weapon("weapon-torpedo-c6", 6, "Siege Rack",     3,   750, 0.3,  65_000),

  // ── Weapons: class 7 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c7",  7, "Macro Cannon",   3,   450, 0.8,  80_000),
  weapon("weapon-laser-c7",   7, "Spinal Laser",   4,   180, 3.0, 100_000),
  weapon("weapon-torpedo-c7", 7, "Broadside Bay",  3, 1_100, 0.3, 130_000),

  // ── Weapons: class 8 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c8",  8, "Void Cannon",    3,   650, 0.8, 160_000),
  weapon("weapon-laser-c8",   8, "Annihilator",    4,   260, 3.0, 200_000),
  weapon("weapon-torpedo-c8", 8, "Doomsday Rack",  3, 1_600, 0.3, 260_000),

  // ── Weapons: class 9 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c9",  9, "World-Breaker",  3, 1_000, 0.8, 320_000),
  weapon("weapon-laser-c9",   9, "Titan Beam",     4,   400, 3.0, 400_000),
  weapon("weapon-torpedo-c9", 9, "Armageddon Bay", 3, 2_500, 0.3, 520_000),

  // ── External systems: class 3 ────────────────────────────────────────────
  external("ext-shield-c3",  3, "Battle Shield",     4, { shieldCapacity: 300 },          3_000),
  external("ext-sensor-c3",  3, "Combat Array",      3, { sensorRangeKm: 2_500 },         2_000),
  internal("ext-armor-c3",   3, "Battle Plate",      4, { armor: 70, hp: 150 },           2_500),

  // ── External systems: class 4 ────────────────────────────────────────────
  external("ext-shield-c4",  4, "Aegis Shield",      4, { shieldCapacity: 500 },          8_000),
  external("ext-sensor-c4",  4, "Deep Scanner",      3, { sensorRangeKm: 5_000 },         5_500),
  internal("ext-armor-c4",   4, "Laminate Plate",    4, { armor: 120, hp: 250 },          7_000),

  // ── External systems: class 5 ────────────────────────────────────────────
  external("ext-shield-c5",  5, "Barrier Array",     4, { shieldCapacity: 800 },         18_000),
  external("ext-sensor-c5",  5, "Horizon Scanner",   3, { sensorRangeKm: 8_000 },        13_000),
  internal("ext-armor-c5",   5, "Composite Hull",    4, { armor: 200, hp: 400 },         16_000),

  // ── External systems: class 6 ────────────────────────────────────────────
  external("ext-shield-c6",  6, "Void Shield",       4, { shieldCapacity: 1_300 },       38_000),
  external("ext-sensor-c6",  6, "Stellar Scanner",   3, { sensorRangeKm: 12_000 },       27_000),
  internal("ext-armor-c6",   6, "Ablative Armor",    4, { armor: 330, hp: 650 },         34_000),

  // ── External systems: class 7 ────────────────────────────────────────────
  external("ext-shield-c7",  7, "Fleet Shield",      4, { shieldCapacity: 2_000 },       75_000),
  external("ext-sensor-c7",  7, "Sector Scanner",    3, { sensorRangeKm: 18_000 },       55_000),
  internal("ext-armor-c7",   7, "Nano-Armor",        4, { armor: 500, hp: 1_000 },       68_000),

  // ── External systems: class 8 ────────────────────────────────────────────
  external("ext-shield-c8",  8, "Grand Barrier",     4, { shieldCapacity: 3_200 },      150_000),
  external("ext-sensor-c8",  8, "Arc Scanner",       3, { sensorRangeKm: 25_000 },      110_000),
  internal("ext-armor-c8",   8, "Chromite Armor",    4, { armor: 750, hp: 1_500 },      135_000),

  // ── External systems: class 9 ────────────────────────────────────────────
  external("ext-shield-c9",  9, "Titan Bulwark",     4, { shieldCapacity: 5_000 },      300_000),
  external("ext-sensor-c9",  9, "Galaxy Scanner",    3, { sensorRangeKm: 40_000 },      220_000),
  internal("ext-armor-c9",   9, "Impervium Plating", 4, { armor: 1_200, hp: 2_400 },    270_000),

  // ── Internal systems: class 3 ────────────────────────────────────────────
  external("int-engine-c3",  3, "Ion Thruster",       3, { thrustMs2: 8_000 },            2_500),
  internal("int-power-c3",   3, "Fusion Core",        4, { powerOutput: 500 },            2_500),

  // ── Internal systems: class 4 ────────────────────────────────────────────
  external("int-engine-c4",  4, "Plasma Drive",       3, { thrustMs2: 14_000 },           7_500),
  internal("int-power-c4",   4, "Fission Reactor",    4, { powerOutput: 900 },            7_500),

  // ── Internal systems: class 5 ────────────────────────────────────────────
  external("int-engine-c5",  5, "Warp Nacelle",       3, { thrustMs2: 22_000 },          18_000),
  internal("int-power-c5",   5, "Quantum Cell",       4, { powerOutput: 1_500 },         18_000),

  // ── Internal systems: class 6 ────────────────────────────────────────────
  external("int-engine-c6",  6, "Gravity Drive",      3, { thrustMs2: 35_000 },          38_000),
  internal("int-power-c6",   6, "Dark Reactor",       4, { powerOutput: 2_500 },         38_000),

  // ── Internal systems: class 7 ────────────────────────────────────────────
  external("int-engine-c7",  7, "Singularity Drive",  3, { thrustMs2: 55_000 },          75_000),
  internal("int-power-c7",   7, "Vortex Reactor",     4, { powerOutput: 4_000 },         75_000),

  // ── Internal systems: class 8 ────────────────────────────────────────────
  external("int-engine-c8",  8, "Titan Drive",        3, { thrustMs2: 80_000 },         150_000),
  internal("int-power-c8",   8, "Neutron Core",       4, { powerOutput: 6_500 },        150_000),

  // ── Internal systems: class 9 ────────────────────────────────────────────
  external("int-engine-c9",  9, "Omega Drive",        3, { thrustMs2: 120_000 },        300_000),
  internal("int-power-c9",   9, "Stellar Forge",      4, { powerOutput: 10_000 },       300_000),

  // ── Structure: class 3 ───────────────────────────────────────────────────
  structure("struct-tri-c3",  3, "Tri-Frame III",    3,    400),
  structure("struct-quad-c3", 3, "Quad-Frame III",   4,    600),
  structure("struct-hex-c3",  3, "Hex-Junction III", 6,    900),

  // ── Structure: class 4 ───────────────────────────────────────────────────
  structure("struct-tri-c4",  4, "Tri-Frame IV",     3,    800),
  structure("struct-quad-c4", 4, "Quad-Frame IV",    4,  1_200),
  structure("struct-hex-c4",  4, "Hex-Junction IV",  6,  1_800),

  // ── Structure: class 5 ───────────────────────────────────────────────────
  structure("struct-tri-c5",  5, "Tri-Frame V",      3,  1_600),
  structure("struct-quad-c5", 5, "Quad-Frame V",     4,  2_400),
  structure("struct-hex-c5",  5, "Hex-Junction V",   6,  3_600),

  // ── Structure: class 6 ───────────────────────────────────────────────────
  structure("struct-tri-c6",  6, "Tri-Frame VI",     3,  3_200),
  structure("struct-quad-c6", 6, "Quad-Frame VI",    4,  4_800),
  structure("struct-hex-c6",  6, "Hex-Junction VI",  6,  7_200),

  // ── Structure: class 7 ───────────────────────────────────────────────────
  structure("struct-tri-c7",  7, "Tri-Frame VII",    3,  6_400),
  structure("struct-quad-c7", 7, "Quad-Frame VII",   4,  9_600),
  structure("struct-hex-c7",  7, "Hex-Junction VII", 6, 14_400),

  // ── Structure: class 8 ───────────────────────────────────────────────────
  structure("struct-tri-c8",  8, "Tri-Frame VIII",    3, 12_800),
  structure("struct-quad-c8", 8, "Quad-Frame VIII",   4, 19_200),
  structure("struct-hex-c8",  8, "Hex-Junction VIII", 6, 28_800),

  // ── Structure: class 9 ───────────────────────────────────────────────────
  structure("struct-tri-c9",  9, "Tri-Frame IX",    3, 25_600),
  structure("struct-quad-c9", 9, "Quad-Frame IX",   4, 38_400),
  structure("struct-hex-c9",  9, "Hex-Junction IX", 6, 57_600),
];

// ── Index ─────────────────────────────────────────────────────────────────────

const MODULE_MAP = new Map<string, SolarModuleDefinition>(
  ALL_MODULES.map(m => [m.id, m]),
);

// ── Public API ────────────────────────────────────────────────────────────────

export const SolarModuleRegistry = {
  getModule(id: string): SolarModuleDefinition | undefined {
    return MODULE_MAP.get(id);
  },

  getCores(sizeClass?: ShipClass): CoreDefinition[] {
    return ALL_MODULES.filter(
      (m): m is CoreDefinition =>
        m.type === "core" && (sizeClass === undefined || m.sizeClass === sizeClass),
    );
  },

  getByType(type: SolarModuleType, sizeClass?: ShipClass): SolarModuleDefinition[] {
    return ALL_MODULES.filter(
      m => m.type === type && (sizeClass === undefined || m.sizeClass === sizeClass),
    );
  },

  getAllModules(): ReadonlyArray<SolarModuleDefinition> {
    return ALL_MODULES;
  },

  getModuleMap(): ReadonlyMap<string, SolarModuleDefinition> {
    return MODULE_MAP;
  },
} as const;

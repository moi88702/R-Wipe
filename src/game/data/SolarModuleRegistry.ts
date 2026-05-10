/**
 * SolarModuleRegistry — static definitions for all solar-system ship modules.
 *
 * Modules are organised by type and sizeClass (1–9). Classes pair into 5 size tiers:
 *   Tier 1 (Small):    C1 Frigate (light)  / C2 Destroyer (heavy)
 *   Tier 2 (Medium):   C3 Cruiser (light)  / C4 Heavy Cruiser (heavy)
 *   Tier 3 (Large):    C5 Battleship (light) / C6 Battlecruiser (heavy)
 *   Tier 4 (Capital):  C7 Capital (light)  / C8 Heavy Capital (heavy)
 *   Tier 5 (Supercap): C9 Supercap (heavy)
 *
 * Side-length scale per class (px):
 *   1=60  2=80  3=110  4=145  5=185  6=225  7=225  8=270  9=270
 *
 * See docs/design/ship-system.md for full mass, budget, and physics tables.
 */

import type {
  SolarModuleDefinition,
  CoreDefinition,
  ShipClass,
  ShipTier,
  HullVariant,
  PartKind,
  PolygonShape,
} from "../../types/solarShipBuilder";

// ── Tier / hull classification ─────────────────────────────────────────────────

/** Physical size tier from ship class: C1-2 → T1, C3-4 → T2, C5-6 → T3, C7-8 → T4, C9 → T5. */
export function classToTier(cls: ShipClass): ShipTier {
  return Math.ceil(cls / 2) as ShipTier;
}

const HULL_INFO_BY_CLASS: Record<ShipClass, { hullVariant: HullVariant; hullName: string }> = {
  1: { hullVariant: "light", hullName: "Frigate" },
  2: { hullVariant: "heavy", hullName: "Destroyer" },
  3: { hullVariant: "light", hullName: "Cruiser" },
  4: { hullVariant: "heavy", hullName: "Heavy Cruiser" },
  5: { hullVariant: "light", hullName: "Battleship" },
  6: { hullVariant: "heavy", hullName: "Battlecruiser" },
  7: { hullVariant: "light", hullName: "Capital" },
  8: { hullVariant: "heavy", hullName: "Heavy Capital" },
  9: { hullVariant: "heavy", hullName: "Supercap" },
};

// ── Module physics constants ───────────────────────────────────────────────────

/** Maximum module mass (kg) for the heaviest part kind at each tier. */
export const TIER_BASE_MASS_KG: Record<ShipTier, number> = {
  1: 500, 2: 2_500, 3: 12_500, 4: 60_000, 5: 300_000,
};

/** Hull structural mass before any modules are fitted (kg). Equal to 10 × TIER_BASE_MASS_KG. */
export const HULL_BASE_MASS_KG: Record<ShipTier, number> = {
  1: 5_000, 2: 25_000, 3: 125_000, 4: 600_000, 5: 3_000_000,
};

/**
 * Mass fraction per part kind relative to TIER_BASE_MASS_KG.
 *   physicalMassKg = TIER_BASE_MASS_KG[classToTier(cls)] × KIND_MASS_FACTOR[partKind]
 *
 * Tier-1 range: 100 kg (crew-quarters/cargo) → 500 kg (core/armor).
 */
export const KIND_MASS_FACTOR: Record<PartKind, number> = {
  "core":            1.00,
  "armor":           1.00,
  "reactor":         0.90,
  "cannon":          0.70,
  "torpedo":         0.60,
  "plasma":          0.60,
  "factory-bay":     0.60,
  "shield":          0.45,
  "laser":           0.50,
  "warp-nacelle":    0.50,
  "gravity-drive":   0.50,
  "ion-engine":      0.40,
  "thruster":        0.40,
  "warp-stabilizer": 0.40,
  "converter-unit":  0.34,
  "cloak":           0.30,
  "radar":           0.28,
  "lidar":           0.28,
  "frame":           0.26,
  "scrambler":       0.24,
  "webber":          0.24,
  "crew-quarters":   0.20,
  "cargo-hold":      0.20,
};

// ── Class side lengths ────────────────────────────────────────────────────────

const SIDE_PX: Record<ShipClass, number> = {
  1: 60, 2: 80, 3: 110, 4: 145, 5: 185, 6: 225, 7: 225, 8: 270, 9: 270,
};

// ── Visual vertex templates ───────────────────────────────────────────────────
// Unit coords where 1.0 = sideLengthPx. Output/tip at -Y, attachment base at +Y.
// BASE CONSTRAINT: attachment-side edge must sit at Y = apothem of the polygon:
//   N=3 (triangle): a = 1/(2√3) ≈ 0.289
//   N=4 (square):   a = 1/2     = 0.500
// Applied only to leaf modules (attachmentSideIndices: []).

type Verts = PolygonShape["verts"];

// Apothem constants (unit coords, 1.0 = sideLengthPx)
const A3 = 0.289; // triangle: 1/(2·tan(π/3))
const A4 = 0.500; // square:   1/(2·tan(π/4))

const WEAPON_VERTS: Partial<Record<PartKind, Verts>> = {
  // Cannon — T-shape gun barrel. Barrel tip at -Y, wide mount base at +Y.
  // Base at A3 (+0.289) exactly, full side-width (±0.50).
  cannon: [
    [-0.13, -0.65], [+0.13, -0.65],          // narrow barrel tip
    [+0.13, +0.06], [+0.50, +0.06],          // right shoulder step
    [+0.50, +A3],   [-0.50, +A3],            // full-width base at apothem
    [-0.50, +0.06], [-0.13, +0.06],          // left shoulder step
  ],
  // Laser — asymmetric blade spike. Tip at -Y, wide flat base at +Y.
  // Base at A4 (+0.500), full side-width.
  laser: [
    [0,     -0.75],                           // spike tip
    [+0.22, -0.30], [+0.50, +0.15],          // right blade profile
    [+0.50, +A4],   [-0.50, +A4],            // base at apothem
    [-0.50, +0.15], [-0.22, -0.30],          // left blade profile
  ],
  // Torpedo — tapered tube. Rounded tip at -Y, flared base at +Y.
  // Base at A3 (+0.289), full side-width.
  torpedo: [
    [-0.28, -0.55], [+0.28, -0.55],          // tip
    [+0.50, +0.00], [+0.50, +A3],            // right side → base
    [-0.50, +A3],   [-0.50, +0.00],          // base → left side
  ],
};

// Bell nozzle: wide exhaust bell at -Y, narrow throat mount at +Y.
// Mount base at A3 (+0.289), narrow width (±0.22) — intentionally narrower
// so the nozzle throat looks realistic against the full-width parent side.
const THRUSTER_VERTS: Verts = [
  [-0.60, -0.40], [+0.60, -0.40],            // wide bell output
  [+0.60, +0.00], [+0.22, +0.00],            // right inner step
  [+0.22, +A3],   [-0.22, +A3],              // narrow throat at apothem
  [-0.22, +0.00], [-0.60, +0.00],            // left inner step
];

const EXTERNAL_VERTS: Partial<Record<PartKind, Verts>> = {
  // Shield dome: rounded dome at -Y, flat base at +Y.
  // Base at A4 (+0.500), full side-width.
  shield: [
    [-0.50, +A4],   [+0.50, +A4],            // flat base at apothem
    [+0.70, +0.15], [+0.50, -0.40],          // right profile
    [0,     -0.70], [-0.50, -0.40],          // dome apex + left
    [-0.70, +0.15],                          // left profile
  ],
  // Radar dish: wide parabolic dish at -Y, narrow stem at +Y.
  // Stem base at A3 (+0.289), dish extends to ±0.65.
  radar: [
    [-0.65, -0.30], [+0.65, -0.30],          // dish wide edge
    [+0.65, -0.05], [+0.22, -0.05],          // dish inner right
    [+0.22, +A3],   [-0.22, +A3],            // narrow stem base at apothem
    [-0.22, -0.05], [-0.65, -0.05],          // dish inner left
  ],
  lidar: [
    [-0.65, -0.30], [+0.65, -0.30],
    [+0.65, -0.05], [+0.22, -0.05],
    [+0.22, +A3],   [-0.22, +A3],
    [-0.22, -0.05], [-0.65, -0.05],
  ],
  thruster:        THRUSTER_VERTS,
  "ion-engine":    THRUSTER_VERTS,
  "warp-nacelle":  THRUSTER_VERTS,
  "gravity-drive": THRUSTER_VERTS,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Base scanner ranges per ship class (km).  Ships without a dedicated sensor
// module fall back to this built-in antenna range.
// Class 1 minimum = 0.6 × Earth–Sol distance (0.6 × 900 km = 540 km).
const CORE_SENSOR_RANGE_KM: Record<ShipClass, number> = {
  1: 540, 2: 720, 3: 1_000, 4: 1_400, 5: 1_800,
  6: 2_400, 7: 3_000, 8: 4_000, 9: 5_000,
};

// Base shield recharge rate per ship class (HP/s).
// Internal shield-regen modules add on top of this.
const CORE_SHIELD_REGEN_PER_SEC: Record<ShipClass, number> = {
  1: 2, 2: 3, 3: 5, 4: 8, 5: 12,
  6: 18, 7: 25, 8: 35, 9: 50,
};

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
  const { hullVariant, hullName } = HULL_INFO_BY_CLASS[cls];
  return {
    id,
    name: `${hullName} Core — ${variant.charAt(0).toUpperCase() + variant.slice(1)}`,
    type: "core",
    partKind: "core",
    sizeClass: cls,
    variant,
    hullVariant,
    hullName,
    shape: { sides: 6, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: null },
    budgetCost: 0,
    stats: { hp, sensorRangeKm: CORE_SENSOR_RANGE_KM[cls], shieldRechargeRatePerSec: CORE_SHIELD_REGEN_PER_SEC[cls] },
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
  kind: PartKind,
  name: string,
  sides: number,
  damage: number,
  rateHz: number,
  cost: number,
  rangeKm: number,
): SolarModuleDefinition {
  const verts = WEAPON_VERTS[kind];
  return {
    id, name, type: "weapon", partKind: kind, sizeClass: cls,
    shape: { sides, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: [], ...(verts ? { verts } : {}) },
    budgetCost: 1,
    stats: { damagePerShot: damage, fireRateHz: rateHz, rangeKm },
    shopCost: cost,
  };
}

function external(
  id: string,
  cls: ShipClass,
  kind: PartKind,
  name: string,
  sides: number,
  stats: SolarModuleDefinition["stats"],
  cost: number,
): SolarModuleDefinition {
  const verts = EXTERNAL_VERTS[kind];
  return {
    id, name, type: "external", partKind: kind, sizeClass: cls,
    shape: { sides, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: [], ...(verts ? { verts } : {}) },
    budgetCost: 1,
    stats,
    shopCost: cost,
  };
}

function internal(
  id: string,
  cls: ShipClass,
  kind: PartKind,
  name: string,
  sides: number,
  stats: SolarModuleDefinition["stats"],
  cost: number,
): SolarModuleDefinition {
  return {
    id, name, type: "internal", partKind: kind, sizeClass: cls,
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
    id, name, type: "structure", partKind: "frame", sizeClass: cls,
    shape: { sides, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: null },
    budgetCost: 0,
    stats: {},
    shopCost: cost,
  };
}

import type { ConverterSpec, SolarModuleType } from "../../types/solarShipBuilder";

function factory(
  id: string,
  cls: ShipClass,
  name: string,
  sides: number,
  maxClass: number,
  cost: number,
): SolarModuleDefinition {
  return {
    id, name, type: "factory", partKind: "factory-bay", sizeClass: cls,
    shape: { sides, sideLengthPx: SIDE_PX[cls], attachmentSideIndices: [] },
    budgetCost: 1,
    stats: { shipFactoryMaxClass: maxClass },
    shopCost: cost,
  };
}

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
    partKind: "converter-unit",
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
  core("core-c1-armor",      1, "armor",      2, 1, 1, 120, 1_000),
  core("core-c1-power",      1, "power",      1, 2, 2,  60, 1_000),
  core("core-c1-balanced",   1, "balanced",   2, 2, 2,  90, 1_200),
  // Named frigate hulls — H=weapon, M=external, L=internal
  core("core-c1-pathfinder", 1, "pathfinder", 1, 2, 2,  70, 1_000), // 1H 2M 2L — utility scout
  core("core-c1-raptor",     1, "raptor",     2, 2, 1,  85, 1_000), // 2H 2M 1L — combat interceptor
  core("core-c1-wolfpack",   1, "wolfpack",   3, 3, 2, 100, 1_200), // 3H 3M 2L — strike frigate
  core("core-c1-providence", 1, "providence", 2, 3, 3,  75, 1_200), // 2H 3M 3L — fleet support

  // ── Cores: class 2 (destroyer) ────────────────────────────────────────────
  core("core-c2-armor",    2, "armor",    3, 2, 2, 200, 3_500),
  core("core-c2-power",    2, "power",    2, 3, 3, 120, 3_500),
  core("core-c2-balanced", 2, "balanced", 3, 3, 3, 160, 4_000),

  // ── Cores: class 3 (cruiser) ──────────────────────────────────────────────
  core("core-c3-armor",    3, "armor",    4, 3, 3, 350, 8_000),
  core("core-c3-power",    3, "power",    3, 4, 4, 200, 8_000),
  core("core-c3-balanced", 3, "balanced", 4, 4, 4, 280, 9_500),

  // ── Weapons: class 1 ──────────────────────────────────────────────────────
  weapon("weapon-cannon-c1",  1, "cannon",  "Light Cannon",  3, 25, 0.8, 300,    120),
  weapon("weapon-laser-c1",   1, "laser",   "Pulse Laser",   4, 10, 3.0, 400,     60),
  weapon("weapon-torpedo-c1", 1, "torpedo", "Mini Torpedo",  3, 60, 0.3, 500,    250),

  // ── Weapons: class 2 ──────────────────────────────────────────────────────
  weapon("weapon-cannon-c2",  2, "cannon",  "Heavy Cannon",  3,  50, 0.8,   900, 175),
  weapon("weapon-laser-c2",   2, "laser",   "Beam Laser",    4,  20, 3.0, 1_200,  90),
  weapon("weapon-torpedo-c2", 2, "torpedo", "Torpedo Bay",   3, 120, 0.3, 1_500, 360),

  // ── External systems: class 1 ─────────────────────────────────────────────
  external("ext-shield-c1",  1, "shield", "Shield Module",   4, { shieldCapacity: 80 },         350),
  external("ext-sensor-c1",  1, "radar",  "Sensor Array",    3, { sensorRangeKm: 500 },         250),
  internal("ext-armor-c1",   1, "armor",  "Armor Plate",     4, { armor: 20, hp: 40 },          200),

  // ── External systems: class 2 ─────────────────────────────────────────────
  external("ext-shield-c2",  2, "shield", "Heavy Shield",    4, { shieldCapacity: 160 },       1_050),
  external("ext-sensor-c2",  2, "radar",  "Long-Range Scan", 3, { sensorRangeKm: 1_200 },        750),
  internal("ext-armor-c2",   2, "armor",  "Reinforced Hull", 4, { armor: 40, hp: 80 },           600),

  // ── Internal systems: class 1 ─────────────────────────────────────────────
  external("int-engine-c1",  1, "thruster",  "Thruster",          3, { thrustMs2: 2_000 },          300),
  internal("int-power-c1",   1, "reactor",   "Power Core",        4, { powerOutput: 100 },          300),
  internal("int-crew-c1",    1, "crew-quarters", "Crew Quarters",  5, {},                            200),
  internal("int-cargo-c1",   1, "cargo-hold", "Cargo Bay",        4, { cargoSlots: 8 },             500),

  // ── Internal systems: class 2 ─────────────────────────────────────────────
  external("int-engine-c2",  2, "thruster",  "Fusion Thruster",   3, { thrustMs2: 4_500 },          900),
  internal("int-power-c2",   2, "reactor",   "Reactor Cell",      4, { powerOutput: 250 },          900),
  internal("int-crew-c2",    2, "crew-quarters", "Officer Quarters", 5, {},                          600),
  internal("int-cargo-c2",   2, "cargo-hold", "Expanded Cargo Bay",  4, { cargoSlots: 20 },       1_500),

  // ── Cargo hold: class 3 ───────────────────────────────────────────────────
  internal("int-cargo-c3",   3, "cargo-hold", "Deep Storage Module", 4, { cargoSlots: 40 },       3_500),

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

  // ── Cores: class 4 (heavy cruiser — tier 2 heavy) ────────────────────────────────────────────────────────────────
  core("core-c4-armor",    4, "armor",     5, 4, 4,   500, 20_000),
  core("core-c4-power",    4, "power",     4, 5, 5,   300, 20_000),
  core("core-c4-balanced", 4, "balanced",  5, 5, 5,   400, 24_000),

  // ── Cores: class 5 (battleship — tier 3 light) ──────────────────────────────────────────────────────────────────────
  core("core-c5-armor",    5, "armor",     6, 5, 5,   750, 45_000),
  core("core-c5-power",    5, "power",     5, 6, 6,   450, 45_000),
  core("core-c5-balanced", 5, "balanced",  6, 6, 6,   600, 54_000),

  // ── Cores: class 6 (battlecruiser — tier 3 heavy) ──────────────────────────────────────────────────────────────────
  core("core-c6-armor",    6, "armor",     7, 6, 6, 1_100, 90_000),
  core("core-c6-power",    6, "power",     6, 7, 7,   660, 90_000),
  core("core-c6-balanced", 6, "balanced",  7, 7, 7,   880, 110_000),

  // ── Cores: class 7 (capital — tier 4 light) ────────────────────────────────────────────────────────────────────────────
  core("core-c7-armor",    7, "armor",     6, 7, 8, 1_500, 180_000),
  core("core-c7-power",    7, "power",     5, 8, 9,   900, 180_000),
  core("core-c7-balanced", 7, "balanced",  6, 8, 8, 1_200, 220_000),

  // ── Cores: class 8 (heavy capital — tier 4 heavy) ────────────────────────────────────────────────────────────
  core("core-c8-armor",    8, "armor",     9, 7, 7, 2_000, 360_000),
  core("core-c8-power",    8, "power",     8, 8, 8, 1_200, 360_000),
  core("core-c8-balanced", 8, "balanced",  9, 8, 8, 1_600, 440_000),

  // ── Cores: class 9 (supercap — tier 5) ───────────────────────────────────────────────────────────────────────────────────
  core("core-c9-armor",    9, "armor",    10, 8, 8, 3_000, 720_000),
  core("core-c9-power",    9, "power",     9, 9, 9, 1_800, 720_000),
  core("core-c9-balanced", 9, "balanced", 10, 9, 9, 2_400, 880_000),

  // ── Weapons: class 3 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c3",  3, "cannon",  "Auto-Cannon",    3,  80, 0.8,   2_500,  250),
  weapon("weapon-laser-c3",   3, "laser",   "Strike Laser",   4,  35, 3.0,   3_000,  130),
  weapon("weapon-torpedo-c3", 3, "torpedo", "Heavy Torpedo",  3, 200, 0.3,   4_000,  520),

  // ── Weapons: class 4 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c4",  4, "cannon",  "Mass Driver",    3, 130, 0.8,   7_000,  320),
  weapon("weapon-laser-c4",   4, "laser",   "Focused Beam",   4,  55, 3.0,   9_000,  165),
  weapon("weapon-torpedo-c4", 4, "torpedo", "Siege Torpedo",  3, 320, 0.3,  12_000,  680),

  // ── Weapons: class 5 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c5",  5, "cannon",  "Railgun",        3, 200, 0.8,  18_000,  400),
  weapon("weapon-laser-c5",   5, "laser",   "Beam Array",     4,  80, 3.0,  22_000,  200),
  weapon("weapon-torpedo-c5", 5, "torpedo", "Barrage Bay",    3, 500, 0.3,  30_000,  850),

  // ── Weapons: class 6 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c6",  6, "cannon",  "Gauss Cannon",   3,   300, 0.8,  40_000,  490),
  weapon("weapon-laser-c6",   6, "laser",   "Lance Array",    4,   120, 3.0,  50_000,  245),
  weapon("weapon-torpedo-c6", 6, "torpedo", "Siege Rack",     3,   750, 0.3,  65_000, 1_020),

  // ── Weapons: class 7 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c7",  7, "cannon",  "Macro Cannon",   3,   450, 0.8,  80_000,  580),
  weapon("weapon-laser-c7",   7, "laser",   "Spinal Laser",   4,   180, 3.0, 100_000,  290),
  weapon("weapon-torpedo-c7", 7, "torpedo", "Broadside Bay",  3, 1_100, 0.3, 130_000, 1_180),

  // ── Weapons: class 8 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c8",  8, "cannon",  "Void Cannon",    3,   650, 0.8, 160_000,  680),
  weapon("weapon-laser-c8",   8, "laser",   "Annihilator",    4,   260, 3.0, 200_000,  340),
  weapon("weapon-torpedo-c8", 8, "torpedo", "Doomsday Rack",  3, 1_600, 0.3, 260_000, 1_380),

  // ── Weapons: class 9 ─────────────────────────────────────────────────────
  weapon("weapon-cannon-c9",  9, "cannon",  "World-Breaker",  3, 1_000, 0.8, 320_000,  780),
  weapon("weapon-laser-c9",   9, "laser",   "Titan Beam",     4,   400, 3.0, 400_000,  390),
  weapon("weapon-torpedo-c9", 9, "torpedo", "Armageddon Bay", 3, 2_500, 0.3, 520_000, 1_550),

  // ── External systems: class 3 ────────────────────────────────────────────
  external("ext-shield-c3",  3, "shield", "Battle Shield",     4, { shieldCapacity: 300 },          3_000),
  external("ext-sensor-c3",  3, "radar",  "Combat Array",      3, { sensorRangeKm: 2_500 },         2_000),
  internal("ext-armor-c3",   3, "armor",  "Battle Plate",      4, { armor: 70, hp: 150 },           2_500),

  // ── External systems: class 4 ────────────────────────────────────────────
  external("ext-shield-c4",  4, "shield", "Aegis Shield",      4, { shieldCapacity: 500 },          8_000),
  external("ext-sensor-c4",  4, "radar",  "Deep Scanner",      3, { sensorRangeKm: 5_000 },         5_500),
  internal("ext-armor-c4",   4, "armor",  "Laminate Plate",    4, { armor: 120, hp: 250 },          7_000),

  // ── External systems: class 5 ────────────────────────────────────────────
  external("ext-shield-c5",  5, "shield", "Barrier Array",     4, { shieldCapacity: 800 },         18_000),
  external("ext-sensor-c5",  5, "radar",  "Horizon Scanner",   3, { sensorRangeKm: 8_000 },        13_000),
  internal("ext-armor-c5",   5, "armor",  "Composite Hull",    4, { armor: 200, hp: 400 },         16_000),

  // ── External systems: class 6 ────────────────────────────────────────────
  external("ext-shield-c6",  6, "shield", "Void Shield",       4, { shieldCapacity: 1_300 },       38_000),
  external("ext-sensor-c6",  6, "radar",  "Stellar Scanner",   3, { sensorRangeKm: 12_000 },       27_000),
  internal("ext-armor-c6",   6, "armor",  "Ablative Armor",    4, { armor: 330, hp: 650 },         34_000),

  // ── External systems: class 7 ────────────────────────────────────────────
  external("ext-shield-c7",  7, "shield", "Fleet Shield",      4, { shieldCapacity: 2_000 },       75_000),
  external("ext-sensor-c7",  7, "radar",  "Sector Scanner",    3, { sensorRangeKm: 18_000 },       55_000),
  internal("ext-armor-c7",   7, "armor",  "Nano-Armor",        4, { armor: 500, hp: 1_000 },       68_000),

  // ── External systems: class 8 ────────────────────────────────────────────
  external("ext-shield-c8",  8, "shield", "Grand Barrier",     4, { shieldCapacity: 3_200 },      150_000),
  external("ext-sensor-c8",  8, "radar",  "Arc Scanner",       3, { sensorRangeKm: 25_000 },      110_000),
  internal("ext-armor-c8",   8, "armor",  "Chromite Armor",    4, { armor: 750, hp: 1_500 },      135_000),

  // ── External systems: class 9 ────────────────────────────────────────────
  external("ext-shield-c9",  9, "shield", "Titan Bulwark",     4, { shieldCapacity: 5_000 },      300_000),
  external("ext-sensor-c9",  9, "radar",  "Galaxy Scanner",    3, { sensorRangeKm: 40_000 },      220_000),
  internal("ext-armor-c9",   9, "armor",  "Impervium Plating", 4, { armor: 1_200, hp: 2_400 },    270_000),

  // ── Internal systems: class 3 ────────────────────────────────────────────
  external("int-engine-c3",  3, "ion-engine",  "Ion Thruster",       3, { thrustMs2: 8_000 },            2_500),
  internal("int-power-c3",   3, "reactor",     "Fusion Core",        4, { powerOutput: 500 },            2_500),

  // ── Internal systems: class 4 ────────────────────────────────────────────
  external("int-engine-c4",  4, "ion-engine",  "Plasma Drive",       3, { thrustMs2: 14_000 },           7_500),
  internal("int-power-c4",   4, "reactor",     "Fission Reactor",    4, { powerOutput: 900 },            7_500),

  // ── Internal systems: class 5 ────────────────────────────────────────────
  external("int-engine-c5",  5, "warp-nacelle", "Warp Nacelle",       3, { thrustMs2: 22_000 },          18_000),
  internal("int-power-c5",   5, "reactor",      "Quantum Cell",       4, { powerOutput: 1_500 },         18_000),

  // ── Internal systems: class 6 ────────────────────────────────────────────
  external("int-engine-c6",  6, "gravity-drive", "Gravity Drive",      3, { thrustMs2: 35_000 },          38_000),
  internal("int-power-c6",   6, "reactor",        "Dark Reactor",       4, { powerOutput: 2_500 },         38_000),

  // ── Internal systems: class 7 ────────────────────────────────────────────
  external("int-engine-c7",  7, "gravity-drive", "Singularity Drive",  3, { thrustMs2: 55_000 },          75_000),
  internal("int-power-c7",   7, "reactor",        "Vortex Reactor",     4, { powerOutput: 4_000 },         75_000),

  // ── Internal systems: class 8 ────────────────────────────────────────────
  external("int-engine-c8",  8, "gravity-drive", "Titan Drive",        3, { thrustMs2: 80_000 },         150_000),
  internal("int-power-c8",   8, "reactor",        "Neutron Core",       4, { powerOutput: 6_500 },        150_000),

  // ── Internal systems: class 9 ────────────────────────────────────────────
  external("int-engine-c9",  9, "gravity-drive", "Omega Drive",        3, { thrustMs2: 120_000 },        300_000),
  internal("int-power-c9",   9, "reactor",        "Stellar Forge",      4, { powerOutput: 10_000 },       300_000),

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

  // ── Factory modules (capital-class and above, stations only) ─────────────
  factory("int-factory-c4",  4, "Ship Foundry",   5, 4,  15_000),
  factory("int-factory-c6",  6, "Fleet Foundry",  6, 6,  60_000),

  // ── Shield recharger (internal, capital+) ─────────────────────────────────
  internal("int-shield-regen-c4", 4, "shield", "Shield Regen Core",   4, { shieldRechargeRatePerSec: 50 },   10_000),
  internal("int-shield-regen-c6", 6, "shield", "Barrier Regen Core",  4, { shieldRechargeRatePerSec: 100 },  45_000),

  // ── Electronic warfare suite (internal, capital+) ─────────────────────────
  internal("int-ew-c4", 4, "scrambler", "E-War Suite",    5, { specialEffect: "electronic-warfare" }, 12_000),
  internal("int-ew-c6", 6, "scrambler", "E-War Platform", 5, { specialEffect: "electronic-warfare" }, 50_000),

  // ── Shield Projector (external, capital+ only) ────────────────────────────
  // Projects a large shield bubble. Max 1 per ship. Boosts do not require a projector — they add
  // capacity/recharge to whatever projector is installed.
  // Capacity is large by design: a station shield must withstand sustained multi-capital
  // assault for 10-20 min before collapsing. Radius is roughly 2× ship-scale projectors.
  external("ext-proj-shield-c4", 4, "shield", "Shield Projector Alpha",  4, { projectedShieldRadius:  56, projectedShieldCapacity:   60_000 },   20_000),
  external("ext-proj-shield-c5", 5, "shield", "Shield Projector Beta",   4, { projectedShieldRadius:  72, projectedShieldCapacity:   80_000 },   45_000),
  external("ext-proj-shield-c6", 6, "shield", "Shield Projector I",      4, { projectedShieldRadius:  92, projectedShieldCapacity:  100_000 },   80_000),
  external("ext-proj-shield-c7", 7, "shield", "Shield Projector II",     4, { projectedShieldRadius: 116, projectedShieldCapacity:  200_000 },  160_000),
  external("ext-proj-shield-c8", 8, "shield", "Shield Projector III",    4, { projectedShieldRadius: 148, projectedShieldCapacity:  375_000 },  320_000),
  external("ext-proj-shield-c9", 9, "shield", "Shield Projector IV",     4, { projectedShieldRadius: 190, projectedShieldCapacity:  700_000 },  640_000),

  // ── Shield Amplifier — raises max projected shield HP ─────────────────────
  external("ext-proj-amp-c4", 4, "shield", "Shield Amplifier Alpha",  4, { projectedShieldCapacity:  35_000 },  14_000),
  external("ext-proj-amp-c5", 5, "shield", "Shield Amplifier Beta",   4, { projectedShieldCapacity:  50_000 },  30_000),
  external("ext-proj-amp-c6", 6, "shield", "Shield Amplifier I",      4, { projectedShieldCapacity:  60_000 },  55_000),
  external("ext-proj-amp-c7", 7, "shield", "Shield Amplifier II",     4, { projectedShieldCapacity: 125_000 }, 110_000),
  external("ext-proj-amp-c8", 8, "shield", "Shield Amplifier III",    4, { projectedShieldCapacity: 250_000 }, 220_000),
  external("ext-proj-amp-c9", 9, "shield", "Shield Amplifier IV",     4, { projectedShieldCapacity: 450_000 }, 440_000),

  // ── Shield Regenerator — increases projected shield recharge rate ──────────
  internal("int-proj-regen-c4", 4, "shield", "Projector Regen Alpha",  4, { projectedShieldRechargeRate:   160 },  15_000),
  internal("int-proj-regen-c5", 5, "shield", "Projector Regen Beta",   4, { projectedShieldRechargeRate:   240 },  35_000),
  internal("int-proj-regen-c6", 6, "shield", "Projector Regen I",      4, { projectedShieldRechargeRate:   320 },  60_000),
  internal("int-proj-regen-c7", 7, "shield", "Projector Regen II",     4, { projectedShieldRechargeRate:   720 }, 120_000),
  internal("int-proj-regen-c8", 8, "shield", "Projector Regen III",    4, { projectedShieldRechargeRate: 1_400 }, 240_000),
  internal("int-proj-regen-c9", 9, "shield", "Projector Regen IV",     4, { projectedShieldRechargeRate: 2_400 }, 480_000),

  // ── Bond Armor — transfers HP bonus to directly connected modules ─────────
  // High own HP; each neighbour gains connectedHpBonus to their max HP.
  internal("ext-armor-bond-c1", 1, "armor", "Bonded Plate I",     4, { hp:   60, connectedHpBonus:   30 },      400),
  internal("ext-armor-bond-c2", 2, "armor", "Bonded Plate II",    4, { hp:  130, connectedHpBonus:   60 },    1_200),
  internal("ext-armor-bond-c3", 3, "armor", "Bonded Plate III",   4, { hp:  240, connectedHpBonus:  110 },    3_000),
  internal("ext-armor-bond-c4", 4, "armor", "Bonded Plate IV",    4, { hp:  380, connectedHpBonus:  170 },    8_000),
  internal("ext-armor-bond-c5", 5, "armor", "Bonded Plate V",     4, { hp:  560, connectedHpBonus:  250 },   19_000),
  internal("ext-armor-bond-c6", 6, "armor", "Bonded Frame I",     4, { hp:  800, connectedHpBonus:  360 },   40_000),
  internal("ext-armor-bond-c7", 7, "armor", "Bonded Frame II",    4, { hp: 1_100, connectedHpBonus:  500 },  80_000),
  internal("ext-armor-bond-c8", 8, "armor", "Bonded Frame III",   4, { hp: 1_600, connectedHpBonus:  720 }, 160_000),
  internal("ext-armor-bond-c9", 9, "armor", "Bonded Frame IV",    4, { hp: 2_400, connectedHpBonus: 1_050 }, 320_000),

  // ── Repair Bot — restores HP to damaged modules over time ────────────────
  // Requires power; repairs the most-damaged surviving module each tick.
  internal("int-repair-c1", 1, "armor", "Repair Drone I",     4, { repairRatePerSec:   8, repairPowerCost:  10 },    600),
  internal("int-repair-c2", 2, "armor", "Repair Drone II",    4, { repairRatePerSec:  18, repairPowerCost:  22 },  1_800),
  internal("int-repair-c3", 3, "armor", "Repair Drone III",   4, { repairRatePerSec:  35, repairPowerCost:  40 },  4_500),
  internal("int-repair-c4", 4, "armor", "Repair Drone IV",    4, { repairRatePerSec:  60, repairPowerCost:  65 }, 12_000),
  internal("int-repair-c5", 5, "armor", "Repair Suite I",     4, { repairRatePerSec: 100, repairPowerCost: 100 }, 28_000),
  internal("int-repair-c6", 6, "armor", "Repair Suite II",    4, { repairRatePerSec: 160, repairPowerCost: 150 }, 58_000),
  internal("int-repair-c7", 7, "armor", "Repair Suite III",   4, { repairRatePerSec: 250, repairPowerCost: 220 }, 115_000),
  internal("int-repair-c8", 8, "armor", "Repair Suite IV",    4, { repairRatePerSec: 380, repairPowerCost: 320 }, 230_000),
  internal("int-repair-c9", 9, "armor", "Repair Suite V",     4, { repairRatePerSec: 580, repairPowerCost: 460 }, 460_000),

  // ── Targeting Computer — extends target lock range ────────────────────────
  external("ext-targeting-c1", 1, "lidar", "Targeting Array I",    3, { lockRangeBoostKm:   150 },     350),
  external("ext-targeting-c2", 2, "lidar", "Targeting Array II",   3, { lockRangeBoostKm:   350 },   1_050),
  external("ext-targeting-c3", 3, "lidar", "Targeting Array III",  3, { lockRangeBoostKm:   700 },   2_800),
  external("ext-targeting-c4", 4, "lidar", "Targeting Array IV",   3, { lockRangeBoostKm: 1_200 },   7_500),
  external("ext-targeting-c5", 5, "lidar", "Target Forge I",       3, { lockRangeBoostKm: 2_000 },  18_000),
  external("ext-targeting-c6", 6, "lidar", "Target Forge II",      3, { lockRangeBoostKm: 3_200 },  38_000),
  external("ext-targeting-c7", 7, "lidar", "Target Forge III",     3, { lockRangeBoostKm: 5_000 },  75_000),
  external("ext-targeting-c8", 8, "lidar", "Target Forge IV",      3, { lockRangeBoostKm: 7_500 }, 150_000),
  external("ext-targeting-c9", 9, "lidar", "Target Forge V",       3, { lockRangeBoostKm:11_000 }, 300_000),

  // ── Multi-Lock Array — additional simultaneous target lock slots ──────────
  external("ext-multi-scan-c1", 1, "lidar", "Multi-Lock Array I",   3, { additionalTargetSlots: 1 },     500),
  external("ext-multi-scan-c2", 2, "lidar", "Multi-Lock Array II",  3, { additionalTargetSlots: 1 },   1_500),
  external("ext-multi-scan-c3", 3, "lidar", "Multi-Lock Array III", 3, { additionalTargetSlots: 2 },   3_800),
  external("ext-multi-scan-c4", 4, "lidar", "Multi-Lock Array IV",  3, { additionalTargetSlots: 2 },  10_000),
  external("ext-multi-scan-c5", 5, "lidar", "Multi-Lock Suite I",   3, { additionalTargetSlots: 3 },  24_000),
  external("ext-multi-scan-c6", 6, "lidar", "Multi-Lock Suite II",  3, { additionalTargetSlots: 3 },  50_000),
  external("ext-multi-scan-c7", 7, "lidar", "Multi-Lock Suite III", 3, { additionalTargetSlots: 4 }, 100_000),
  external("ext-multi-scan-c8", 8, "lidar", "Multi-Lock Suite IV",  3, { additionalTargetSlots: 4 }, 200_000),
  external("ext-multi-scan-c9", 9, "lidar", "Multi-Lock Suite V",   3, { additionalTargetSlots: 5 }, 400_000),
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

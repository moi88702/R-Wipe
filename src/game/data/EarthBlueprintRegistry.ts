/**
 * EarthBlueprintRegistry — Terran Federation ship blueprints (C1–C3).
 *
 * TF ships are laser-and-shield focused: mobile strike platforms designed
 * for sustained engagements with superior firepower and defensive screens.
 *
 * Budget (balanced cores):
 *   C1 balanced: 2W 2E 2I   C2 balanced: 3W 3E 3I   C3 balanced: 4W 4E 4I
 */

import type { SolarShipBlueprint } from "../../types/solarShipBuilder";

export const EARTH_BLUEPRINTS: ReadonlyArray<SolarShipBlueprint> = [

  // ── C1 "TF Sentinel" — fast laser frigate ───────────────────────────────
  // Used: 2W 2E(shield + engine) 0I
  {
    id: "earth-c1-tf-sentinel",
    name: "TF Sentinel",
    sizeClass: 1,
    coreSideCount: 5,
    modules: [
      { placedId: "e1-core", moduleDefId: "core-c1-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "e1-m1",   moduleDefId: "weapon-laser-c1",   parentPlacedId: "e1-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "e1-m2",   moduleDefId: "weapon-laser-c1",   parentPlacedId: "e1-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "e1-m3",   moduleDefId: "ext-shield-c1",     parentPlacedId: "e1-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "e1-m4",   moduleDefId: "int-engine-c1",     parentPlacedId: "e1-core", parentSideIndex: 3,    ownSideIndex: 0 },
    ],
  },

  // ── C2 "TF Vanguard" — destroyer with beam barrage ──────────────────────
  // Used: 3W(laser×2+torpedo) 3E(shield×2+engine) 0I
  {
    id: "earth-c2-tf-vanguard",
    name: "TF Vanguard",
    sizeClass: 2,
    coreSideCount: 6,
    modules: [
      { placedId: "e2-core", moduleDefId: "core-c2-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "e2-m1",   moduleDefId: "weapon-laser-c2",   parentPlacedId: "e2-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "e2-m2",   moduleDefId: "weapon-laser-c2",   parentPlacedId: "e2-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "e2-m3",   moduleDefId: "weapon-torpedo-c2", parentPlacedId: "e2-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "e2-m4",   moduleDefId: "ext-shield-c2",     parentPlacedId: "e2-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "e2-m5",   moduleDefId: "ext-shield-c2",     parentPlacedId: "e2-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "e2-m6",   moduleDefId: "int-engine-c2",     parentPlacedId: "e2-core", parentSideIndex: 5,    ownSideIndex: 0 },
    ],
  },

  // ── C3 "TF Bastion" — cruiser, maximum firepower + shields ──────────────
  // Used: 4W(laser×2+torpedo×2) 4E(struct+shield×2+engine) 1I(power)
  {
    id: "earth-c3-tf-bastion",
    name: "TF Bastion",
    sizeClass: 3,
    coreSideCount: 7,
    modules: [
      { placedId: "e3-core", moduleDefId: "core-c3-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "e3-m1",   moduleDefId: "weapon-laser-c3",   parentPlacedId: "e3-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "e3-m2",   moduleDefId: "weapon-laser-c3",   parentPlacedId: "e3-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "e3-m3",   moduleDefId: "weapon-torpedo-c3", parentPlacedId: "e3-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "e3-m4",   moduleDefId: "weapon-torpedo-c3", parentPlacedId: "e3-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "e3-m5",   moduleDefId: "struct-hex-c3",     parentPlacedId: "e3-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "e3-m6",   moduleDefId: "ext-shield-c3",     parentPlacedId: "e3-m5",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "e3-m7",   moduleDefId: "ext-shield-c3",     parentPlacedId: "e3-m5",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "e3-m8",   moduleDefId: "int-engine-c3",     parentPlacedId: "e3-m5",   parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "e3-m9",   moduleDefId: "int-power-c3",      parentPlacedId: "e3-core", parentSideIndex: 5,    ownSideIndex: 0 },
    ],
  },


  // ── C6 "Earth Orbital Platform" — super-capital station ─────────────────
  // No engine: stationary defense platform.  Weapon clusters on hex-junction
  // arms, heavy shields, fleet foundry, and power core.
  // Budget (core-c6-balanced: 7W 7E 7I): used 7W, 4E, 2I — no engine.
  {
    id: "earth-c6-orbital-platform",
    name: "Earth Orbital Platform",
    sizeClass: 6,
    coreSideCount: 9,
    modules: [
      { placedId: "eo-core", moduleDefId: "core-c6-balanced",  parentPlacedId: null,       parentSideIndex: null, ownSideIndex: null },
      // Weapon cluster A — port side
      { placedId: "eo-s1",   moduleDefId: "struct-hex-c6",     parentPlacedId: "eo-core",  parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "eo-w1",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "eo-s1",    parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "eo-w2",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "eo-s1",    parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "eo-w3",   moduleDefId: "weapon-laser-c6",   parentPlacedId: "eo-s1",    parentSideIndex: 3,    ownSideIndex: 0 },
      // Weapon cluster B — starboard side
      { placedId: "eo-s2",   moduleDefId: "struct-hex-c6",     parentPlacedId: "eo-core",  parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "eo-w4",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "eo-s2",    parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "eo-w5",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "eo-s2",    parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "eo-w6",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "eo-s2",    parentSideIndex: 3,    ownSideIndex: 0 },
      // Direct forward weapon
      { placedId: "eo-w7",   moduleDefId: "weapon-laser-c6",   parentPlacedId: "eo-core",  parentSideIndex: 2,    ownSideIndex: 0 },
      // Heavy shields
      { placedId: "eo-e1",   moduleDefId: "ext-shield-c6",     parentPlacedId: "eo-core",  parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "eo-e2",   moduleDefId: "ext-shield-c6",     parentPlacedId: "eo-core",  parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "eo-e3",   moduleDefId: "ext-shield-c6",     parentPlacedId: "eo-core",  parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "eo-e4",   moduleDefId: "ext-shield-c6",     parentPlacedId: "eo-core",  parentSideIndex: 6,    ownSideIndex: 0 },
      // Utility: power + fleet foundry
      { placedId: "eo-i1",   moduleDefId: "int-power-c6",      parentPlacedId: "eo-core",  parentSideIndex: 7,    ownSideIndex: 0 },
      { placedId: "eo-i2",   moduleDefId: "int-factory-c6",    parentPlacedId: "eo-core",  parentSideIndex: 8,    ownSideIndex: 0 },
    ],
  },

];

export function getEarthBlueprint(sizeClass: number): SolarShipBlueprint | undefined {
  return EARTH_BLUEPRINTS.find(b => b.sizeClass === sizeClass);
}

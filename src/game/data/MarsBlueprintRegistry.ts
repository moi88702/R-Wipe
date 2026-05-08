/**
 * MarsBlueprintRegistry — Mars Colonial Authority ship blueprints (C1–C3).
 *
 * Mars ships are cannon-and-armor focused: tough industrial hulls designed
 * for frontier defence and asteroid-belt operations. They carry heavier
 * plating and devastating cannon/torpedo loadouts at the cost of speed.
 *
 * Budget (balanced cores):
 *   C1 balanced: 2W 2E 2I   C2 balanced: 3W 3E 3I   C3 balanced: 4W 4E 4I
 */

import type { SolarShipBlueprint } from "../../types/solarShipBuilder";

export const MARS_BLUEPRINTS: ReadonlyArray<SolarShipBlueprint> = [

  // ── C1 "Ares Scout" — light patrol frigate ──────────────────────────────
  // Used: 2W(cannon×2) 2E(armor+engine) 0I
  {
    id: "mars-c1-ares-scout",
    name: "Ares Scout",
    sizeClass: 1,
    coreSideCount: 5,
    modules: [
      { placedId: "m1-core", moduleDefId: "core-c1-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "m1-m1",   moduleDefId: "weapon-cannon-c1",  parentPlacedId: "m1-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "m1-m2",   moduleDefId: "weapon-cannon-c1",  parentPlacedId: "m1-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "m1-m3",   moduleDefId: "ext-armor-c1",      parentPlacedId: "m1-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "m1-m4",   moduleDefId: "int-engine-c1",     parentPlacedId: "m1-core", parentSideIndex: 3,    ownSideIndex: 0 },
    ],
  },

  // ── C2 "Olympus Patrol" — destroyer, armored brawler ────────────────────
  // Used: 3W(cannon×2+torpedo) 3E(sensor+armor+engine) 0I
  {
    id: "mars-c2-olympus-patrol",
    name: "Olympus Patrol",
    sizeClass: 2,
    coreSideCount: 6,
    modules: [
      { placedId: "m2-core", moduleDefId: "core-c2-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "m2-m1",   moduleDefId: "weapon-cannon-c2",  parentPlacedId: "m2-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "m2-m2",   moduleDefId: "weapon-cannon-c2",  parentPlacedId: "m2-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "m2-m3",   moduleDefId: "weapon-torpedo-c2", parentPlacedId: "m2-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "m2-m4",   moduleDefId: "ext-sensor-c2",     parentPlacedId: "m2-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "m2-m5",   moduleDefId: "ext-armor-c2",      parentPlacedId: "m2-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "m2-m6",   moduleDefId: "int-engine-c2",     parentPlacedId: "m2-core", parentSideIndex: 5,    ownSideIndex: 0 },
    ],
  },

  // ── C3 "Valles Ranger" — cruiser, heavy siege platform ──────────────────
  // Used: 4W(cannon×2+torpedo×2) 4E(struct+sensor+armor+engine) 1I(power)
  {
    id: "mars-c3-valles-ranger",
    name: "Valles Ranger",
    sizeClass: 3,
    coreSideCount: 7,
    modules: [
      { placedId: "m3-core", moduleDefId: "core-c3-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "m3-m1",   moduleDefId: "weapon-cannon-c3",  parentPlacedId: "m3-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "m3-m2",   moduleDefId: "weapon-cannon-c3",  parentPlacedId: "m3-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "m3-m3",   moduleDefId: "weapon-torpedo-c3", parentPlacedId: "m3-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "m3-m4",   moduleDefId: "weapon-torpedo-c3", parentPlacedId: "m3-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "m3-m5",   moduleDefId: "struct-hex-c3",     parentPlacedId: "m3-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "m3-m6",   moduleDefId: "ext-sensor-c3",     parentPlacedId: "m3-m5",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "m3-m7",   moduleDefId: "ext-armor-c3",      parentPlacedId: "m3-m5",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "m3-m8",   moduleDefId: "int-engine-c3",     parentPlacedId: "m3-m5",   parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "m3-m9",   moduleDefId: "int-power-c3",      parentPlacedId: "m3-core", parentSideIndex: 5,    ownSideIndex: 0 },
    ],
  },


  // ── C4 "Mars Citadel" — capital station ─────────────────────────────────
  // No engine: stationary fortress.  Cannon/torpedo cluster on hex arm,
  // ECA shield wall, a ship foundry and power reactor.
  // Budget (core-c4-armor: 5W 4E 4I): used 5W, 3E, 2I — no engine.
  {
    id: "mars-c4-citadel",
    name: "Mars Citadel",
    sizeClass: 4,
    coreSideCount: 8,
    modules: [
      { placedId: "mc-core", moduleDefId: "core-c4-armor",     parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      // Weapon cluster
      { placedId: "mc-s1",   moduleDefId: "struct-hex-c4",     parentPlacedId: "mc-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "mc-w1",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "mc-s1",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "mc-w2",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "mc-s1",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "mc-w3",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "mc-s1",   parentSideIndex: 3,    ownSideIndex: 0 },
      // Direct weapons
      { placedId: "mc-w4",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "mc-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "mc-w5",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "mc-core", parentSideIndex: 2,    ownSideIndex: 0 },
      // Shields
      { placedId: "mc-e1",   moduleDefId: "ext-shield-c4",     parentPlacedId: "mc-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "mc-e2",   moduleDefId: "ext-shield-c4",     parentPlacedId: "mc-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "mc-e3",   moduleDefId: "ext-armor-c4",      parentPlacedId: "mc-core", parentSideIndex: 5,    ownSideIndex: 0 },
      // Utility
      { placedId: "mc-i1",   moduleDefId: "int-factory-c4",    parentPlacedId: "mc-core", parentSideIndex: 6,    ownSideIndex: 0 },
      { placedId: "mc-i2",   moduleDefId: "int-power-c4",      parentPlacedId: "mc-core", parentSideIndex: 7,    ownSideIndex: 0 },
    ],
  },

];

export function getMarsBlueprint(sizeClass: number): SolarShipBlueprint | undefined {
  return MARS_BLUEPRINTS.find(b => b.sizeClass === sizeClass);
}

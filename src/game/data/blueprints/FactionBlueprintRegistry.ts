/**
 * FactionBlueprintRegistry — all faction ship blueprints in one place.
 *
 * Factions:
 *   Earth (Terran Federation) — laser + shield, C1–C3 + two C4/C6 stations
 *   Mars  (Colonial Authority)  — cannon + armor, C1–C3 + C4 station
 *   Pirate (Scavenger Clans)    — cannon heavy, C1–C9 + two C4 stations
 *   Mercenary                   — player's starting ship ("The Drifter")
 *
 * Original per-faction files in src/game/data/ re-export from here.
 */

import type { SolarShipBlueprint } from "../../../types/solarShipBuilder";

// ── Earth (Terran Federation) ─────────────────────────────────────────────────

export const EARTH_BLUEPRINTS: ReadonlyArray<SolarShipBlueprint> = [

  // C1 "TF Sentinel" — fast laser frigate. Used: 2W 2E(shield+engine) 0I
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

  // C2 "TF Vanguard" — destroyer with beam barrage. Used: 3W(laser×2+torp) 3E(shield×2+engine) 0I
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

  // C3 "TF Bastion" — cruiser, max firepower + shields. Used: 4W(laser×2+torp×2) 4E(struct+shield×2+engine) 1I(power)
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

  // C4 "Lunar Garrison" — capital moon defense station. Used: 3W, 5E(struct+proj+amp+shield×2), 3I
  {
    id: "earth-c4-moon-garrison",
    name: "Lunar Garrison",
    sizeClass: 4,
    coreSideCount: 8,
    modules: [
      { placedId: "em-core", moduleDefId: "core-c4-balanced",    parentPlacedId: null,       parentSideIndex: null, ownSideIndex: null },
      { placedId: "em-s1",   moduleDefId: "struct-hex-c4",       parentPlacedId: "em-core",  parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "em-w1",   moduleDefId: "weapon-cannon-c4",    parentPlacedId: "em-s1",    parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "em-w2",   moduleDefId: "weapon-cannon-c4",    parentPlacedId: "em-s1",    parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "em-w3",   moduleDefId: "weapon-torpedo-c4",   parentPlacedId: "em-s1",    parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "em-ps1",  moduleDefId: "ext-proj-shield-c4",  parentPlacedId: "em-core",  parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "em-pa1",  moduleDefId: "ext-proj-amp-c4",     parentPlacedId: "em-core",  parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "em-e1",   moduleDefId: "ext-shield-c4",       parentPlacedId: "em-core",  parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "em-e2",   moduleDefId: "ext-shield-c4",       parentPlacedId: "em-core",  parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "em-pr1",  moduleDefId: "int-proj-regen-c4",   parentPlacedId: "em-core",  parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "em-i1",   moduleDefId: "int-power-c4",        parentPlacedId: "em-core",  parentSideIndex: 6,    ownSideIndex: 0 },
      { placedId: "em-i2",   moduleDefId: "int-factory-c4",      parentPlacedId: "em-core",  parentSideIndex: 7,    ownSideIndex: 0 },
    ],
  },

  // C6 "Earth Orbital Platform" — super-capital station. Used: 7W, 6E(shield×4+proj-shield+amp), 3I
  {
    id: "earth-c6-orbital-platform",
    name: "Earth Orbital Platform",
    sizeClass: 6,
    coreSideCount: 9,
    modules: [
      { placedId: "eo-core", moduleDefId: "core-c6-balanced",  parentPlacedId: null,       parentSideIndex: null, ownSideIndex: null },
      { placedId: "eo-s1",   moduleDefId: "struct-hex-c6",     parentPlacedId: "eo-core",  parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "eo-w1",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "eo-s1",    parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "eo-w2",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "eo-s1",    parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "eo-w3",   moduleDefId: "weapon-laser-c6",   parentPlacedId: "eo-s1",    parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "eo-ps1",  moduleDefId: "ext-proj-shield-c6",parentPlacedId: "eo-s1",    parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "eo-pa1",  moduleDefId: "ext-proj-amp-c6",   parentPlacedId: "eo-s1",    parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "eo-s2",   moduleDefId: "struct-hex-c6",     parentPlacedId: "eo-core",  parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "eo-w4",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "eo-s2",    parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "eo-w5",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "eo-s2",    parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "eo-w6",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "eo-s2",    parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "eo-pr1",  moduleDefId: "int-proj-regen-c6", parentPlacedId: "eo-s2",    parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "eo-w7",   moduleDefId: "weapon-laser-c6",   parentPlacedId: "eo-core",  parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "eo-e1",   moduleDefId: "ext-shield-c6",     parentPlacedId: "eo-core",  parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "eo-e2",   moduleDefId: "ext-shield-c6",     parentPlacedId: "eo-core",  parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "eo-e3",   moduleDefId: "ext-shield-c6",     parentPlacedId: "eo-core",  parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "eo-e4",   moduleDefId: "ext-shield-c6",     parentPlacedId: "eo-core",  parentSideIndex: 6,    ownSideIndex: 0 },
      { placedId: "eo-i1",   moduleDefId: "int-power-c6",      parentPlacedId: "eo-core",  parentSideIndex: 7,    ownSideIndex: 0 },
      { placedId: "eo-i2",   moduleDefId: "int-factory-c6",    parentPlacedId: "eo-core",  parentSideIndex: 8,    ownSideIndex: 0 },
    ],
  },

];

// ── Mars (Colonial Authority) ─────────────────────────────────────────────────

export const MARS_BLUEPRINTS: ReadonlyArray<SolarShipBlueprint> = [

  // C1 "Ares Scout" — light patrol frigate. Used: 2W(cannon×2) 2E(armor+engine) 0I
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

  // C2 "Olympus Patrol" — destroyer, armored brawler. Used: 3W(cannon×2+torp) 3E(sensor+armor+engine) 0I
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

  // C3 "Valles Ranger" — cruiser, heavy siege. Used: 4W(cannon×2+torp×2) 4E(struct+sensor+armor+engine) 1I(power)
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

  // C4 "Mars Citadel" — capital station. Used: 5W, 4E(proj-shield+amp+shield×2), 3I
  {
    id: "mars-c4-citadel",
    name: "Mars Citadel",
    sizeClass: 4,
    coreSideCount: 8,
    modules: [
      { placedId: "mc-core", moduleDefId: "core-c4-armor",     parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "mc-s1",   moduleDefId: "struct-hex-c4",     parentPlacedId: "mc-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "mc-w1",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "mc-s1",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "mc-w2",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "mc-s1",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "mc-w3",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "mc-s1",   parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "mc-ps1",  moduleDefId: "ext-proj-shield-c4",parentPlacedId: "mc-s1",   parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "mc-pa1",  moduleDefId: "ext-proj-amp-c4",   parentPlacedId: "mc-s1",   parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "mc-w4",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "mc-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "mc-w5",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "mc-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "mc-e1",   moduleDefId: "ext-shield-c4",     parentPlacedId: "mc-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "mc-e2",   moduleDefId: "ext-shield-c4",     parentPlacedId: "mc-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "mc-i1",   moduleDefId: "int-factory-c4",    parentPlacedId: "mc-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "mc-i2",   moduleDefId: "int-power-c4",      parentPlacedId: "mc-core", parentSideIndex: 6,    ownSideIndex: 0 },
      { placedId: "mc-pr1",  moduleDefId: "int-proj-regen-c4", parentPlacedId: "mc-i2",   parentSideIndex: 1,    ownSideIndex: 0 },
    ],
  },

];

// ── Pirate (Scavenger Clans) ──────────────────────────────────────────────────

export const PIRATE_BLUEPRINTS: ReadonlyArray<SolarShipBlueprint> = [

  // C1 "Scavenger's Bite" — frigate. Used: 2W 2E(armor+engine) 0I
  {
    id: "pirate-c1-scavengers-bite",
    name: "Scavenger's Bite",
    sizeClass: 1,
    coreSideCount: 5,
    modules: [
      { placedId: "p1-core", moduleDefId: "core-c1-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "p1-m1",   moduleDefId: "weapon-cannon-c1",  parentPlacedId: "p1-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "p1-m2",   moduleDefId: "weapon-cannon-c1",  parentPlacedId: "p1-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p1-m3",   moduleDefId: "ext-armor-c1",      parentPlacedId: "p1-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p1-m4",   moduleDefId: "int-engine-c1",     parentPlacedId: "p1-core", parentSideIndex: 3,    ownSideIndex: 0 },
    ],
  },

  // C2 "Iron Marauder" — destroyer. Used: 3W 3E(shield+armor+engine) 0I
  {
    id: "pirate-c2-iron-marauder",
    name: "Iron Marauder",
    sizeClass: 2,
    coreSideCount: 6,
    modules: [
      { placedId: "p2-core", moduleDefId: "core-c2-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "p2-m1",   moduleDefId: "weapon-cannon-c2",  parentPlacedId: "p2-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "p2-m2",   moduleDefId: "weapon-cannon-c2",  parentPlacedId: "p2-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p2-m3",   moduleDefId: "weapon-torpedo-c2", parentPlacedId: "p2-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p2-m4",   moduleDefId: "ext-shield-c2",     parentPlacedId: "p2-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p2-m5",   moduleDefId: "ext-armor-c2",      parentPlacedId: "p2-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p2-m6",   moduleDefId: "int-engine-c2",     parentPlacedId: "p2-core", parentSideIndex: 5,    ownSideIndex: 0 },
    ],
  },

  // C3 "Corsair Warlord" — cruiser. Used: 4W 4E(shield+armor+engine×2) 1I(power)
  {
    id: "pirate-c3-corsair-warlord",
    name: "Corsair Warlord",
    sizeClass: 3,
    coreSideCount: 7,
    modules: [
      { placedId: "p3-core", moduleDefId: "core-c3-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "p3-m1",   moduleDefId: "weapon-cannon-c3",  parentPlacedId: "p3-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "p3-m2",   moduleDefId: "weapon-cannon-c3",  parentPlacedId: "p3-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p3-m3",   moduleDefId: "weapon-cannon-c3",  parentPlacedId: "p3-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p3-m4",   moduleDefId: "weapon-torpedo-c3", parentPlacedId: "p3-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p3-m5",   moduleDefId: "struct-hex-c3",     parentPlacedId: "p3-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p3-m6",   moduleDefId: "ext-shield-c3",     parentPlacedId: "p3-m5",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p3-m7",   moduleDefId: "ext-armor-c3",      parentPlacedId: "p3-m5",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p3-m8",   moduleDefId: "int-engine-c3",     parentPlacedId: "p3-m5",   parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p3-m9",   moduleDefId: "int-engine-c3",     parentPlacedId: "p3-m5",   parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p3-m10",  moduleDefId: "int-power-c3",      parentPlacedId: "p3-core", parentSideIndex: 5,    ownSideIndex: 0 },
    ],
  },

  // C4 "Void Ravager" — battlecruiser. Used: 5W 4E(shield+armor+engine×2) 1I(power)
  {
    id: "pirate-c4-void-ravager",
    name: "Void Ravager",
    sizeClass: 4,
    coreSideCount: 8,
    modules: [
      { placedId: "p4-core", moduleDefId: "core-c4-armor",     parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "p4-m1",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "p4-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "p4-m2",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "p4-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p4-m3",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "p4-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p4-m4",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "p4-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p4-m5",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "p4-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p4-m6",   moduleDefId: "struct-hex-c4",     parentPlacedId: "p4-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p4-m7",   moduleDefId: "ext-shield-c4",     parentPlacedId: "p4-m6",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p4-m8",   moduleDefId: "ext-armor-c4",      parentPlacedId: "p4-m6",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p4-m9",   moduleDefId: "int-engine-c4",     parentPlacedId: "p4-m6",   parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p4-m10",  moduleDefId: "int-engine-c4",     parentPlacedId: "p4-m6",   parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p4-m11",  moduleDefId: "int-power-c4",      parentPlacedId: "p4-core", parentSideIndex: 6,    ownSideIndex: 0 },
    ],
  },

  // C5 "Hellfire Bulwark" — battleship. Used: 6W 6E(shield×2+armor+engine×2+armor) 1I(power)
  {
    id: "pirate-c5-hellfire-bulwark",
    name: "Hellfire Bulwark",
    sizeClass: 5,
    coreSideCount: 9,
    modules: [
      { placedId: "p5-core", moduleDefId: "core-c5-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "p5-m1",   moduleDefId: "weapon-cannon-c5",  parentPlacedId: "p5-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "p5-m2",   moduleDefId: "weapon-cannon-c5",  parentPlacedId: "p5-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p5-m3",   moduleDefId: "weapon-cannon-c5",  parentPlacedId: "p5-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p5-m4",   moduleDefId: "weapon-torpedo-c5", parentPlacedId: "p5-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p5-m5",   moduleDefId: "weapon-torpedo-c5", parentPlacedId: "p5-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p5-m6",   moduleDefId: "weapon-torpedo-c5", parentPlacedId: "p5-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p5-m7",   moduleDefId: "struct-hex-c5",     parentPlacedId: "p5-core", parentSideIndex: 6,    ownSideIndex: 0 },
      { placedId: "p5-m8",   moduleDefId: "ext-shield-c5",     parentPlacedId: "p5-m7",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p5-m9",   moduleDefId: "ext-shield-c5",     parentPlacedId: "p5-m7",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p5-m10",  moduleDefId: "ext-armor-c5",      parentPlacedId: "p5-m7",   parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p5-m11",  moduleDefId: "int-engine-c5",     parentPlacedId: "p5-m7",   parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p5-m12",  moduleDefId: "int-engine-c5",     parentPlacedId: "p5-m7",   parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p5-m13",  moduleDefId: "ext-armor-c5",      parentPlacedId: "p5-core", parentSideIndex: 7,    ownSideIndex: 0 },
      { placedId: "p5-m14",  moduleDefId: "int-power-c5",      parentPlacedId: "p5-core", parentSideIndex: 8,    ownSideIndex: 0 },
    ],
  },

  // C6 "Dread Sovereign" — dreadnought. Used: 7W 6E(shield×2+armor+engine×2+armor) 1I(power)
  {
    id: "pirate-c6-dread-sovereign",
    name: "Dread Sovereign",
    sizeClass: 6,
    coreSideCount: 10,
    modules: [
      { placedId: "p6-core", moduleDefId: "core-c6-balanced",  parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "p6-m1",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "p6-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "p6-m2",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "p6-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p6-m3",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "p6-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p6-m4",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "p6-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p6-m5",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "p6-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p6-m6",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "p6-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p6-m7",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "p6-core", parentSideIndex: 6,    ownSideIndex: 0 },
      { placedId: "p6-m8",   moduleDefId: "struct-hex-c6",     parentPlacedId: "p6-core", parentSideIndex: 7,    ownSideIndex: 0 },
      { placedId: "p6-m9",   moduleDefId: "ext-shield-c6",     parentPlacedId: "p6-m8",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p6-m10",  moduleDefId: "ext-shield-c6",     parentPlacedId: "p6-m8",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p6-m11",  moduleDefId: "ext-armor-c6",      parentPlacedId: "p6-m8",   parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p6-m12",  moduleDefId: "int-engine-c6",     parentPlacedId: "p6-m8",   parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p6-m13",  moduleDefId: "int-engine-c6",     parentPlacedId: "p6-m8",   parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p6-m14",  moduleDefId: "ext-armor-c6",      parentPlacedId: "p6-core", parentSideIndex: 8,    ownSideIndex: 0 },
      { placedId: "p6-m15",  moduleDefId: "int-power-c6",      parentPlacedId: "p6-core", parentSideIndex: 9,    ownSideIndex: 0 },
    ],
  },

  // C7 "Carrier of Ruin" — carrier. Used: 6W 7E(shield×2+armor+engine×2+armor+engine) 1I(power)
  {
    id: "pirate-c7-carrier-of-ruin",
    name: "Carrier of Ruin",
    sizeClass: 7,
    coreSideCount: 9,
    modules: [
      { placedId: "p7-core", moduleDefId: "core-c7-armor",     parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "p7-m1",   moduleDefId: "weapon-cannon-c7",  parentPlacedId: "p7-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "p7-m2",   moduleDefId: "weapon-cannon-c7",  parentPlacedId: "p7-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p7-m3",   moduleDefId: "weapon-cannon-c7",  parentPlacedId: "p7-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p7-m4",   moduleDefId: "weapon-torpedo-c7", parentPlacedId: "p7-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p7-m5",   moduleDefId: "weapon-torpedo-c7", parentPlacedId: "p7-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p7-m6",   moduleDefId: "weapon-torpedo-c7", parentPlacedId: "p7-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p7-m7",   moduleDefId: "struct-hex-c7",     parentPlacedId: "p7-core", parentSideIndex: 6,    ownSideIndex: 0 },
      { placedId: "p7-m8",   moduleDefId: "ext-shield-c7",     parentPlacedId: "p7-m7",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p7-m9",   moduleDefId: "ext-shield-c7",     parentPlacedId: "p7-m7",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p7-m10",  moduleDefId: "ext-armor-c7",      parentPlacedId: "p7-m7",   parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p7-m11",  moduleDefId: "int-engine-c7",     parentPlacedId: "p7-m7",   parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p7-m12",  moduleDefId: "int-engine-c7",     parentPlacedId: "p7-m7",   parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p7-m13",  moduleDefId: "struct-quad-c7",    parentPlacedId: "p7-core", parentSideIndex: 7,    ownSideIndex: 0 },
      { placedId: "p7-m14",  moduleDefId: "ext-armor-c7",      parentPlacedId: "p7-m13",  parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p7-m15",  moduleDefId: "int-engine-c7",     parentPlacedId: "p7-m13",  parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p7-m16",  moduleDefId: "int-power-c7",      parentPlacedId: "p7-m13",  parentSideIndex: 3,    ownSideIndex: 0 },
    ],
  },

  // C8 "Abyssal Reaper" — super-dreadnought. Used: 9W 7E(hex1: shield×2+armor+engine×2 + hex2: armor×2) 1I
  {
    id: "pirate-c8-abyssal-reaper",
    name: "Abyssal Reaper",
    sizeClass: 8,
    coreSideCount: 12,
    modules: [
      { placedId: "p8-core", moduleDefId: "core-c8-armor",     parentPlacedId: null,      parentSideIndex: null,  ownSideIndex: null },
      { placedId: "p8-m1",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 0,     ownSideIndex: 0 },
      { placedId: "p8-m2",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 1,     ownSideIndex: 0 },
      { placedId: "p8-m3",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 2,     ownSideIndex: 0 },
      { placedId: "p8-m4",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 3,     ownSideIndex: 0 },
      { placedId: "p8-m5",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 4,     ownSideIndex: 0 },
      { placedId: "p8-m6",   moduleDefId: "weapon-torpedo-c8", parentPlacedId: "p8-core", parentSideIndex: 5,     ownSideIndex: 0 },
      { placedId: "p8-m7",   moduleDefId: "weapon-torpedo-c8", parentPlacedId: "p8-core", parentSideIndex: 6,     ownSideIndex: 0 },
      { placedId: "p8-m8",   moduleDefId: "weapon-torpedo-c8", parentPlacedId: "p8-core", parentSideIndex: 7,     ownSideIndex: 0 },
      { placedId: "p8-m9",   moduleDefId: "weapon-torpedo-c8", parentPlacedId: "p8-core", parentSideIndex: 8,     ownSideIndex: 0 },
      { placedId: "p8-m10",  moduleDefId: "struct-hex-c8",     parentPlacedId: "p8-core", parentSideIndex: 9,     ownSideIndex: 0 },
      { placedId: "p8-m11",  moduleDefId: "ext-shield-c8",     parentPlacedId: "p8-m10",  parentSideIndex: 1,     ownSideIndex: 0 },
      { placedId: "p8-m12",  moduleDefId: "ext-shield-c8",     parentPlacedId: "p8-m10",  parentSideIndex: 2,     ownSideIndex: 0 },
      { placedId: "p8-m13",  moduleDefId: "ext-armor-c8",      parentPlacedId: "p8-m10",  parentSideIndex: 3,     ownSideIndex: 0 },
      { placedId: "p8-m14",  moduleDefId: "int-engine-c8",     parentPlacedId: "p8-m10",  parentSideIndex: 4,     ownSideIndex: 0 },
      { placedId: "p8-m15",  moduleDefId: "int-engine-c8",     parentPlacedId: "p8-m10",  parentSideIndex: 5,     ownSideIndex: 0 },
      { placedId: "p8-m16",  moduleDefId: "struct-hex-c8",     parentPlacedId: "p8-core", parentSideIndex: 10,    ownSideIndex: 0 },
      { placedId: "p8-m17",  moduleDefId: "ext-armor-c8",      parentPlacedId: "p8-m16",  parentSideIndex: 1,     ownSideIndex: 0 },
      { placedId: "p8-m18",  moduleDefId: "ext-armor-c8",      parentPlacedId: "p8-m16",  parentSideIndex: 2,     ownSideIndex: 0 },
      { placedId: "p8-m19",  moduleDefId: "int-power-c8",      parentPlacedId: "p8-m16",  parentSideIndex: 3,     ownSideIndex: 0 },
    ],
  },

  // C9 "Titan's Wrath" — titan. Used: 10W 8E(hex1: shield×2+armor+engine×2 + hex2: armor×3) 4I(power×4)
  {
    id: "pirate-c9-titans-wrath",
    name: "Titan's Wrath",
    sizeClass: 9,
    coreSideCount: 14,
    modules: [
      { placedId: "p9-core", moduleDefId: "core-c9-armor",     parentPlacedId: null,      parentSideIndex: null,  ownSideIndex: null },
      { placedId: "p9-m1",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 0,     ownSideIndex: 0 },
      { placedId: "p9-m2",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 1,     ownSideIndex: 0 },
      { placedId: "p9-m3",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 2,     ownSideIndex: 0 },
      { placedId: "p9-m4",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 3,     ownSideIndex: 0 },
      { placedId: "p9-m5",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 4,     ownSideIndex: 0 },
      { placedId: "p9-m6",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 5,     ownSideIndex: 0 },
      { placedId: "p9-m7",   moduleDefId: "weapon-torpedo-c9", parentPlacedId: "p9-core", parentSideIndex: 6,     ownSideIndex: 0 },
      { placedId: "p9-m8",   moduleDefId: "weapon-torpedo-c9", parentPlacedId: "p9-core", parentSideIndex: 7,     ownSideIndex: 0 },
      { placedId: "p9-m9",   moduleDefId: "weapon-torpedo-c9", parentPlacedId: "p9-core", parentSideIndex: 8,     ownSideIndex: 0 },
      { placedId: "p9-m10",  moduleDefId: "weapon-torpedo-c9", parentPlacedId: "p9-core", parentSideIndex: 9,     ownSideIndex: 0 },
      { placedId: "p9-m11",  moduleDefId: "struct-hex-c9",     parentPlacedId: "p9-core", parentSideIndex: 10,    ownSideIndex: 0 },
      { placedId: "p9-m12",  moduleDefId: "ext-shield-c9",     parentPlacedId: "p9-m11",  parentSideIndex: 1,     ownSideIndex: 0 },
      { placedId: "p9-m13",  moduleDefId: "ext-shield-c9",     parentPlacedId: "p9-m11",  parentSideIndex: 2,     ownSideIndex: 0 },
      { placedId: "p9-m14",  moduleDefId: "ext-armor-c9",      parentPlacedId: "p9-m11",  parentSideIndex: 3,     ownSideIndex: 0 },
      { placedId: "p9-m15",  moduleDefId: "int-engine-c9",     parentPlacedId: "p9-m11",  parentSideIndex: 4,     ownSideIndex: 0 },
      { placedId: "p9-m16",  moduleDefId: "int-engine-c9",     parentPlacedId: "p9-m11",  parentSideIndex: 5,     ownSideIndex: 0 },
      { placedId: "p9-m17",  moduleDefId: "struct-hex-c9",     parentPlacedId: "p9-core", parentSideIndex: 11,    ownSideIndex: 0 },
      { placedId: "p9-m18",  moduleDefId: "ext-armor-c9",      parentPlacedId: "p9-m17",  parentSideIndex: 1,     ownSideIndex: 0 },
      { placedId: "p9-m19",  moduleDefId: "ext-armor-c9",      parentPlacedId: "p9-m17",  parentSideIndex: 2,     ownSideIndex: 0 },
      { placedId: "p9-m20",  moduleDefId: "ext-armor-c9",      parentPlacedId: "p9-m17",  parentSideIndex: 3,     ownSideIndex: 0 },
      { placedId: "p9-m21",  moduleDefId: "struct-quad-c9",    parentPlacedId: "p9-core", parentSideIndex: 12,    ownSideIndex: 0 },
      { placedId: "p9-m22",  moduleDefId: "int-power-c9",      parentPlacedId: "p9-m21",  parentSideIndex: 1,     ownSideIndex: 0 },
      { placedId: "p9-m23",  moduleDefId: "int-power-c9",      parentPlacedId: "p9-m21",  parentSideIndex: 2,     ownSideIndex: 0 },
      { placedId: "p9-m24",  moduleDefId: "int-power-c9",      parentPlacedId: "p9-m21",  parentSideIndex: 3,     ownSideIndex: 0 },
      { placedId: "p9-m25",  moduleDefId: "int-power-c9",      parentPlacedId: "p9-core", parentSideIndex: 13,    ownSideIndex: 0 },
    ],
  },

  // C4 "Pirate Stronghold" — capital station (near-Earth). Used: 5W, 2E, 2I
  {
    id: "pirate-c4-stronghold",
    name: "Pirate Stronghold",
    sizeClass: 4,
    coreSideCount: 7,
    modules: [
      { placedId: "pst-core", moduleDefId: "core-c4-armor",     parentPlacedId: null,       parentSideIndex: null, ownSideIndex: null },
      { placedId: "pst-s1",   moduleDefId: "struct-hex-c4",     parentPlacedId: "pst-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "pst-w1",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "pst-s1",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "pst-w2",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "pst-s1",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "pst-w3",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "pst-s1",   parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "pst-w4",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "pst-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "pst-w5",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "pst-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "pst-e1",   moduleDefId: "ext-armor-c4",      parentPlacedId: "pst-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "pst-e2",   moduleDefId: "ext-armor-c4",      parentPlacedId: "pst-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "pst-i1",   moduleDefId: "int-factory-c4",    parentPlacedId: "pst-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "pst-i2",   moduleDefId: "int-ew-c4",         parentPlacedId: "pst-core", parentSideIndex: 6,    ownSideIndex: 0 },
    ],
  },

  // C4 "Pirate Outpost" — capital station (far side of sun). Used: 4W, 2E, 1I
  {
    id: "pirate-c4-outpost",
    name: "Pirate Outpost",
    sizeClass: 4,
    coreSideCount: 7,
    modules: [
      { placedId: "po-core", moduleDefId: "core-c4-power",     parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "po-w1",   moduleDefId: "weapon-laser-c4",   parentPlacedId: "po-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "po-w2",   moduleDefId: "weapon-laser-c4",   parentPlacedId: "po-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "po-w3",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "po-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "po-w4",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "po-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "po-e1",   moduleDefId: "ext-shield-c4",     parentPlacedId: "po-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "po-e2",   moduleDefId: "ext-sensor-c4",     parentPlacedId: "po-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "po-i1",   moduleDefId: "int-factory-c4",    parentPlacedId: "po-core", parentSideIndex: 6,    ownSideIndex: 0 },
    ],
  },

];

// ── Mercenary (player) ────────────────────────────────────────────────────────

export const MERCENARY_BLUEPRINTS: ReadonlyArray<SolarShipBlueprint> = [

  // "The Drifter" — class 1 starter ship. Budget used: 1W / 1E of core-c1-power's 1W + 2E + 2I
  {
    id: "merc-c1-the-drifter",
    name: "The Drifter",
    sizeClass: 1,
    coreSideCount: 3,
    modules: [
      { placedId: "d-core",   moduleDefId: "core-c1-power",    parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      { placedId: "d-frame",  moduleDefId: "struct-tri-c1",    parentPlacedId: "d-core",  parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "d-cannon", moduleDefId: "weapon-cannon-c1", parentPlacedId: "d-frame", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "d-engine", moduleDefId: "int-engine-c1",    parentPlacedId: "d-frame", parentSideIndex: 2,    ownSideIndex: 0 },
    ],
  },

];

// ── Combined index ────────────────────────────────────────────────────────────

export const ALL_BLUEPRINTS: ReadonlyArray<SolarShipBlueprint> = [
  ...EARTH_BLUEPRINTS,
  ...MARS_BLUEPRINTS,
  ...PIRATE_BLUEPRINTS,
  ...MERCENARY_BLUEPRINTS,
];

export type BlueprintFaction = "earth" | "mars" | "pirate" | "mercenary";

export function getBlueprintsForFaction(faction: BlueprintFaction): ReadonlyArray<SolarShipBlueprint> {
  if (faction === "earth") return EARTH_BLUEPRINTS;
  if (faction === "mars")  return MARS_BLUEPRINTS;
  if (faction === "mercenary") return MERCENARY_BLUEPRINTS;
  return PIRATE_BLUEPRINTS;
}

// ── Per-faction lookup helpers (kept for callers that import by faction name) ─

export function getEarthBlueprint(sizeClass: number): SolarShipBlueprint | undefined {
  return EARTH_BLUEPRINTS.find(b => b.sizeClass === sizeClass);
}

export function getMarsBlueprint(sizeClass: number): SolarShipBlueprint | undefined {
  return MARS_BLUEPRINTS.find(b => b.sizeClass === sizeClass);
}

/** Returns the standard combat ship for a given pirate class (excludes station blueprints). */
export function getPirateBlueprint(sizeClass: number): SolarShipBlueprint | undefined {
  return PIRATE_BLUEPRINTS.find(
    b => b.sizeClass === sizeClass && !b.id.endsWith("-stronghold") && !b.id.endsWith("-outpost"),
  );
}

export function getPirateBlueprintById(id: string): SolarShipBlueprint | undefined {
  return PIRATE_BLUEPRINTS.find(b => b.id === id);
}

/** Returns the player's canonical starting blueprint ("The Drifter"). */
export function makePlayerStarterBlueprint(): SolarShipBlueprint {
  return MERCENARY_BLUEPRINTS[0]!;
}

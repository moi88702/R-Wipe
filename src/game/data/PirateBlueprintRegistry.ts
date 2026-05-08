/**
 * PirateBlueprintRegistry — one enemy ship blueprint per size class (1–9).
 *
 * All ships belong to the Scavenger Clans pirate faction.
 * Builds are weapon-heavy with moderate armor/shields and engines.
 *
 * NOTE: int-engine-c* modules now have type "external" — they consume
 * externalPoints (E) budget alongside shields, sensors, and armor.
 *
 * Budget key per class (core variant used):
 *   C1 balanced: 2W 2E 2I   C2 balanced: 3W 3E 3I   C3 balanced: 4W 4E 4I
 *   C4 armor:    5W 4E 4I   C5 balanced: 6W 6E 6I   C6 balanced: 7W 7E 7I
 *   C7 armor:    6W 7E 8I   C8 armor:    9W 7E 7I   C9 armor:   10W 8E 8I
 *
 * Module tree: modules[0] = core (parentPlacedId: null).
 * ownSideIndex: 0 on all non-core modules (first face connects to parent).
 * Structure modules (hex/quad) branch on sides 1–N (side 0 faces parent).
 */

import type { SolarShipBlueprint } from "../../types/solarShipBuilder";

export const PIRATE_BLUEPRINTS: ReadonlyArray<SolarShipBlueprint> = [

  // ── Class 1 — "Scavenger's Bite" (frigate) ───────────────────────────────
  // Used: 2W 2E(1 armor + 1 engine) 0I
  {
    id: "pirate-c1-scavengers-bite",
    name: "Scavenger's Bite",
    sizeClass: 1,
    coreSideCount: 5,
    modules: [
      { placedId: "p1-core", moduleDefId: "core-c1-balanced",  parentPlacedId: null,     parentSideIndex: null, ownSideIndex: null },
      { placedId: "p1-m1",   moduleDefId: "weapon-cannon-c1",  parentPlacedId: "p1-core", parentSideIndex: 0,   ownSideIndex: 0 },
      { placedId: "p1-m2",   moduleDefId: "weapon-cannon-c1",  parentPlacedId: "p1-core", parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p1-m3",   moduleDefId: "ext-armor-c1",      parentPlacedId: "p1-core", parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p1-m4",   moduleDefId: "int-engine-c1",     parentPlacedId: "p1-core", parentSideIndex: 3,   ownSideIndex: 0 },
    ],
  },

  // ── Class 2 — "Iron Marauder" (destroyer) ────────────────────────────────
  // Used: 3W 3E(1 shield + 1 armor + 1 engine) 0I
  {
    id: "pirate-c2-iron-marauder",
    name: "Iron Marauder",
    sizeClass: 2,
    coreSideCount: 6,
    modules: [
      { placedId: "p2-core", moduleDefId: "core-c2-balanced",  parentPlacedId: null,     parentSideIndex: null, ownSideIndex: null },
      { placedId: "p2-m1",   moduleDefId: "weapon-cannon-c2",  parentPlacedId: "p2-core", parentSideIndex: 0,   ownSideIndex: 0 },
      { placedId: "p2-m2",   moduleDefId: "weapon-cannon-c2",  parentPlacedId: "p2-core", parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p2-m3",   moduleDefId: "weapon-torpedo-c2", parentPlacedId: "p2-core", parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p2-m4",   moduleDefId: "ext-shield-c2",     parentPlacedId: "p2-core", parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p2-m5",   moduleDefId: "ext-armor-c2",      parentPlacedId: "p2-core", parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p2-m6",   moduleDefId: "int-engine-c2",     parentPlacedId: "p2-core", parentSideIndex: 5,   ownSideIndex: 0 },
    ],
  },

  // ── Class 3 — "Corsair Warlord" (cruiser) ────────────────────────────────
  // Used: 4W 4E(shield + armor + engine×2) 1I(power)
  {
    id: "pirate-c3-corsair-warlord",
    name: "Corsair Warlord",
    sizeClass: 3,
    coreSideCount: 7,
    modules: [
      { placedId: "p3-core", moduleDefId: "core-c3-balanced",  parentPlacedId: null,     parentSideIndex: null, ownSideIndex: null },
      { placedId: "p3-m1",   moduleDefId: "weapon-cannon-c3",  parentPlacedId: "p3-core", parentSideIndex: 0,   ownSideIndex: 0 },
      { placedId: "p3-m2",   moduleDefId: "weapon-cannon-c3",  parentPlacedId: "p3-core", parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p3-m3",   moduleDefId: "weapon-cannon-c3",  parentPlacedId: "p3-core", parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p3-m4",   moduleDefId: "weapon-torpedo-c3", parentPlacedId: "p3-core", parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p3-m5",   moduleDefId: "struct-hex-c3",     parentPlacedId: "p3-core", parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p3-m6",   moduleDefId: "ext-shield-c3",     parentPlacedId: "p3-m5",   parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p3-m7",   moduleDefId: "ext-armor-c3",      parentPlacedId: "p3-m5",   parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p3-m8",   moduleDefId: "int-engine-c3",     parentPlacedId: "p3-m5",   parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p3-m9",   moduleDefId: "int-engine-c3",     parentPlacedId: "p3-m5",   parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p3-m10",  moduleDefId: "int-power-c3",      parentPlacedId: "p3-core", parentSideIndex: 5,   ownSideIndex: 0 },
    ],
  },

  // ── Class 4 — "Void Ravager" (battlecruiser) ─────────────────────────────
  // Used: 5W 4E(shield + armor + engine×2) 1I(power)
  {
    id: "pirate-c4-void-ravager",
    name: "Void Ravager",
    sizeClass: 4,
    coreSideCount: 8,
    modules: [
      { placedId: "p4-core", moduleDefId: "core-c4-armor",     parentPlacedId: null,     parentSideIndex: null, ownSideIndex: null },
      { placedId: "p4-m1",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "p4-core", parentSideIndex: 0,   ownSideIndex: 0 },
      { placedId: "p4-m2",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "p4-core", parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p4-m3",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "p4-core", parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p4-m4",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "p4-core", parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p4-m5",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "p4-core", parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p4-m6",   moduleDefId: "struct-hex-c4",     parentPlacedId: "p4-core", parentSideIndex: 5,   ownSideIndex: 0 },
      { placedId: "p4-m7",   moduleDefId: "ext-shield-c4",     parentPlacedId: "p4-m6",   parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p4-m8",   moduleDefId: "ext-armor-c4",      parentPlacedId: "p4-m6",   parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p4-m9",   moduleDefId: "int-engine-c4",     parentPlacedId: "p4-m6",   parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p4-m10",  moduleDefId: "int-engine-c4",     parentPlacedId: "p4-m6",   parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p4-m11",  moduleDefId: "int-power-c4",      parentPlacedId: "p4-core", parentSideIndex: 6,   ownSideIndex: 0 },
    ],
  },

  // ── Class 5 — "Hellfire Bulwark" (battleship) ────────────────────────────
  // Used: 6W 6E(shield×2 + armor + engine×2 + armor) 1I(power)
  {
    id: "pirate-c5-hellfire-bulwark",
    name: "Hellfire Bulwark",
    sizeClass: 5,
    coreSideCount: 9,
    modules: [
      { placedId: "p5-core", moduleDefId: "core-c5-balanced",  parentPlacedId: null,     parentSideIndex: null, ownSideIndex: null },
      { placedId: "p5-m1",   moduleDefId: "weapon-cannon-c5",  parentPlacedId: "p5-core", parentSideIndex: 0,   ownSideIndex: 0 },
      { placedId: "p5-m2",   moduleDefId: "weapon-cannon-c5",  parentPlacedId: "p5-core", parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p5-m3",   moduleDefId: "weapon-cannon-c5",  parentPlacedId: "p5-core", parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p5-m4",   moduleDefId: "weapon-torpedo-c5", parentPlacedId: "p5-core", parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p5-m5",   moduleDefId: "weapon-torpedo-c5", parentPlacedId: "p5-core", parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p5-m6",   moduleDefId: "weapon-torpedo-c5", parentPlacedId: "p5-core", parentSideIndex: 5,   ownSideIndex: 0 },
      { placedId: "p5-m7",   moduleDefId: "struct-hex-c5",     parentPlacedId: "p5-core", parentSideIndex: 6,   ownSideIndex: 0 },
      { placedId: "p5-m8",   moduleDefId: "ext-shield-c5",     parentPlacedId: "p5-m7",   parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p5-m9",   moduleDefId: "ext-shield-c5",     parentPlacedId: "p5-m7",   parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p5-m10",  moduleDefId: "ext-armor-c5",      parentPlacedId: "p5-m7",   parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p5-m11",  moduleDefId: "int-engine-c5",     parentPlacedId: "p5-m7",   parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p5-m12",  moduleDefId: "int-engine-c5",     parentPlacedId: "p5-m7",   parentSideIndex: 5,   ownSideIndex: 0 },
      { placedId: "p5-m13",  moduleDefId: "ext-armor-c5",      parentPlacedId: "p5-core", parentSideIndex: 7,   ownSideIndex: 0 },
      { placedId: "p5-m14",  moduleDefId: "int-power-c5",      parentPlacedId: "p5-core", parentSideIndex: 8,   ownSideIndex: 0 },
    ],
  },

  // ── Class 6 — "Dread Sovereign" (dreadnought) ────────────────────────────
  // Used: 7W 6E(shield×2 + armor + engine×2 + armor) 1I(power)
  {
    id: "pirate-c6-dread-sovereign",
    name: "Dread Sovereign",
    sizeClass: 6,
    coreSideCount: 10,
    modules: [
      { placedId: "p6-core", moduleDefId: "core-c6-balanced",  parentPlacedId: null,     parentSideIndex: null, ownSideIndex: null },
      { placedId: "p6-m1",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "p6-core", parentSideIndex: 0,   ownSideIndex: 0 },
      { placedId: "p6-m2",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "p6-core", parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p6-m3",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "p6-core", parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p6-m4",   moduleDefId: "weapon-cannon-c6",  parentPlacedId: "p6-core", parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p6-m5",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "p6-core", parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p6-m6",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "p6-core", parentSideIndex: 5,   ownSideIndex: 0 },
      { placedId: "p6-m7",   moduleDefId: "weapon-torpedo-c6", parentPlacedId: "p6-core", parentSideIndex: 6,   ownSideIndex: 0 },
      { placedId: "p6-m8",   moduleDefId: "struct-hex-c6",     parentPlacedId: "p6-core", parentSideIndex: 7,   ownSideIndex: 0 },
      { placedId: "p6-m9",   moduleDefId: "ext-shield-c6",     parentPlacedId: "p6-m8",   parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p6-m10",  moduleDefId: "ext-shield-c6",     parentPlacedId: "p6-m8",   parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p6-m11",  moduleDefId: "ext-armor-c6",      parentPlacedId: "p6-m8",   parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p6-m12",  moduleDefId: "int-engine-c6",     parentPlacedId: "p6-m8",   parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p6-m13",  moduleDefId: "int-engine-c6",     parentPlacedId: "p6-m8",   parentSideIndex: 5,   ownSideIndex: 0 },
      { placedId: "p6-m14",  moduleDefId: "ext-armor-c6",      parentPlacedId: "p6-core", parentSideIndex: 8,   ownSideIndex: 0 },
      { placedId: "p6-m15",  moduleDefId: "int-power-c6",      parentPlacedId: "p6-core", parentSideIndex: 9,   ownSideIndex: 0 },
    ],
  },

  // ── Class 7 — "Carrier of Ruin" (carrier) ────────────────────────────────
  // Used: 6W 7E(shield×2 + armor + engine×2 + armor + engine) 1I(power)
  {
    id: "pirate-c7-carrier-of-ruin",
    name: "Carrier of Ruin",
    sizeClass: 7,
    coreSideCount: 9,
    modules: [
      { placedId: "p7-core", moduleDefId: "core-c7-armor",     parentPlacedId: null,     parentSideIndex: null, ownSideIndex: null },
      { placedId: "p7-m1",   moduleDefId: "weapon-cannon-c7",  parentPlacedId: "p7-core", parentSideIndex: 0,   ownSideIndex: 0 },
      { placedId: "p7-m2",   moduleDefId: "weapon-cannon-c7",  parentPlacedId: "p7-core", parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p7-m3",   moduleDefId: "weapon-cannon-c7",  parentPlacedId: "p7-core", parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p7-m4",   moduleDefId: "weapon-torpedo-c7", parentPlacedId: "p7-core", parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p7-m5",   moduleDefId: "weapon-torpedo-c7", parentPlacedId: "p7-core", parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p7-m6",   moduleDefId: "weapon-torpedo-c7", parentPlacedId: "p7-core", parentSideIndex: 5,   ownSideIndex: 0 },
      { placedId: "p7-m7",   moduleDefId: "struct-hex-c7",     parentPlacedId: "p7-core", parentSideIndex: 6,   ownSideIndex: 0 },
      { placedId: "p7-m8",   moduleDefId: "ext-shield-c7",     parentPlacedId: "p7-m7",   parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p7-m9",   moduleDefId: "ext-shield-c7",     parentPlacedId: "p7-m7",   parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p7-m10",  moduleDefId: "ext-armor-c7",      parentPlacedId: "p7-m7",   parentSideIndex: 3,   ownSideIndex: 0 },
      { placedId: "p7-m11",  moduleDefId: "int-engine-c7",     parentPlacedId: "p7-m7",   parentSideIndex: 4,   ownSideIndex: 0 },
      { placedId: "p7-m12",  moduleDefId: "int-engine-c7",     parentPlacedId: "p7-m7",   parentSideIndex: 5,   ownSideIndex: 0 },
      { placedId: "p7-m13",  moduleDefId: "struct-quad-c7",    parentPlacedId: "p7-core", parentSideIndex: 7,   ownSideIndex: 0 },
      { placedId: "p7-m14",  moduleDefId: "ext-armor-c7",      parentPlacedId: "p7-m13",  parentSideIndex: 1,   ownSideIndex: 0 },
      { placedId: "p7-m15",  moduleDefId: "int-engine-c7",     parentPlacedId: "p7-m13",  parentSideIndex: 2,   ownSideIndex: 0 },
      { placedId: "p7-m16",  moduleDefId: "int-power-c7",      parentPlacedId: "p7-m13",  parentSideIndex: 3,   ownSideIndex: 0 },
    ],
  },

  // ── Class 8 — "Abyssal Reaper" (super-dreadnought) ───────────────────────
  // Used: 9W 7E(hex1: shield×2+armor+engine×2 + hex2: armor×2) 1I(power)
  {
    id: "pirate-c8-abyssal-reaper",
    name: "Abyssal Reaper",
    sizeClass: 8,
    coreSideCount: 12,
    modules: [
      { placedId: "p8-core", moduleDefId: "core-c8-armor",     parentPlacedId: null,     parentSideIndex: null,  ownSideIndex: null },
      { placedId: "p8-m1",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "p8-m2",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p8-m3",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p8-m4",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p8-m5",   moduleDefId: "weapon-cannon-c8",  parentPlacedId: "p8-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p8-m6",   moduleDefId: "weapon-torpedo-c8", parentPlacedId: "p8-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p8-m7",   moduleDefId: "weapon-torpedo-c8", parentPlacedId: "p8-core", parentSideIndex: 6,    ownSideIndex: 0 },
      { placedId: "p8-m8",   moduleDefId: "weapon-torpedo-c8", parentPlacedId: "p8-core", parentSideIndex: 7,    ownSideIndex: 0 },
      { placedId: "p8-m9",   moduleDefId: "weapon-torpedo-c8", parentPlacedId: "p8-core", parentSideIndex: 8,    ownSideIndex: 0 },
      { placedId: "p8-m10",  moduleDefId: "struct-hex-c8",     parentPlacedId: "p8-core", parentSideIndex: 9,    ownSideIndex: 0 },
      { placedId: "p8-m11",  moduleDefId: "ext-shield-c8",     parentPlacedId: "p8-m10",  parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p8-m12",  moduleDefId: "ext-shield-c8",     parentPlacedId: "p8-m10",  parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p8-m13",  moduleDefId: "ext-armor-c8",      parentPlacedId: "p8-m10",  parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p8-m14",  moduleDefId: "int-engine-c8",     parentPlacedId: "p8-m10",  parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p8-m15",  moduleDefId: "int-engine-c8",     parentPlacedId: "p8-m10",  parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p8-m16",  moduleDefId: "struct-hex-c8",     parentPlacedId: "p8-core", parentSideIndex: 10,   ownSideIndex: 0 },
      { placedId: "p8-m17",  moduleDefId: "ext-armor-c8",      parentPlacedId: "p8-m16",  parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p8-m18",  moduleDefId: "ext-armor-c8",      parentPlacedId: "p8-m16",  parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p8-m19",  moduleDefId: "int-power-c8",      parentPlacedId: "p8-m16",  parentSideIndex: 3,    ownSideIndex: 0 },
    ],
  },

  // ── Class 9 — "Titan's Wrath" (titan) ────────────────────────────────────
  // Used: 10W 8E(hex1: shield×2+armor+engine×2 + hex2: armor×3) 4I(power×4)
  {
    id: "pirate-c9-titans-wrath",
    name: "Titan's Wrath",
    sizeClass: 9,
    coreSideCount: 14,
    modules: [
      { placedId: "p9-core", moduleDefId: "core-c9-armor",     parentPlacedId: null,     parentSideIndex: null,  ownSideIndex: null },
      { placedId: "p9-m1",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "p9-m2",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p9-m3",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p9-m4",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p9-m5",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p9-m6",   moduleDefId: "weapon-cannon-c9",  parentPlacedId: "p9-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p9-m7",   moduleDefId: "weapon-torpedo-c9", parentPlacedId: "p9-core", parentSideIndex: 6,    ownSideIndex: 0 },
      { placedId: "p9-m8",   moduleDefId: "weapon-torpedo-c9", parentPlacedId: "p9-core", parentSideIndex: 7,    ownSideIndex: 0 },
      { placedId: "p9-m9",   moduleDefId: "weapon-torpedo-c9", parentPlacedId: "p9-core", parentSideIndex: 8,    ownSideIndex: 0 },
      { placedId: "p9-m10",  moduleDefId: "weapon-torpedo-c9", parentPlacedId: "p9-core", parentSideIndex: 9,    ownSideIndex: 0 },
      { placedId: "p9-m11",  moduleDefId: "struct-hex-c9",     parentPlacedId: "p9-core", parentSideIndex: 10,   ownSideIndex: 0 },
      { placedId: "p9-m12",  moduleDefId: "ext-shield-c9",     parentPlacedId: "p9-m11",  parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p9-m13",  moduleDefId: "ext-shield-c9",     parentPlacedId: "p9-m11",  parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p9-m14",  moduleDefId: "ext-armor-c9",      parentPlacedId: "p9-m11",  parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p9-m15",  moduleDefId: "int-engine-c9",     parentPlacedId: "p9-m11",  parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "p9-m16",  moduleDefId: "int-engine-c9",     parentPlacedId: "p9-m11",  parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "p9-m17",  moduleDefId: "struct-hex-c9",     parentPlacedId: "p9-core", parentSideIndex: 11,   ownSideIndex: 0 },
      { placedId: "p9-m18",  moduleDefId: "ext-armor-c9",      parentPlacedId: "p9-m17",  parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p9-m19",  moduleDefId: "ext-armor-c9",      parentPlacedId: "p9-m17",  parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p9-m20",  moduleDefId: "ext-armor-c9",      parentPlacedId: "p9-m17",  parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p9-m21",  moduleDefId: "struct-quad-c9",    parentPlacedId: "p9-core", parentSideIndex: 12,   ownSideIndex: 0 },
      { placedId: "p9-m22",  moduleDefId: "int-power-c9",      parentPlacedId: "p9-m21",  parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "p9-m23",  moduleDefId: "int-power-c9",      parentPlacedId: "p9-m21",  parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "p9-m24",  moduleDefId: "int-power-c9",      parentPlacedId: "p9-m21",  parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "p9-m25",  moduleDefId: "int-power-c9",      parentPlacedId: "p9-core", parentSideIndex: 13,   ownSideIndex: 0 },
    ],
  },


  // ── C4 "Pirate Stronghold" — capital station (near-Earth) ───────────────
  // Heavy cannon platform: maximum firepower, salvaged armor, no shields.
  // E-war suite jams enemy sensors.  No engine — anchored to asteroid field.
  // Budget (core-c4-armor: 5W 4E 4I): used 5W, 2E, 2I — no engine.
  {
    id: "pirate-c4-stronghold",
    name: "Pirate Stronghold",
    sizeClass: 4,
    coreSideCount: 7,
    modules: [
      { placedId: "pst-core", moduleDefId: "core-c4-armor",     parentPlacedId: null,       parentSideIndex: null, ownSideIndex: null },
      // Weapon cluster — three cannons on a hex arm
      { placedId: "pst-s1",   moduleDefId: "struct-hex-c4",     parentPlacedId: "pst-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "pst-w1",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "pst-s1",   parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "pst-w2",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "pst-s1",   parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "pst-w3",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "pst-s1",   parentSideIndex: 3,    ownSideIndex: 0 },
      // Direct siege torpedoes
      { placedId: "pst-w4",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "pst-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "pst-w5",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "pst-core", parentSideIndex: 2,    ownSideIndex: 0 },
      // Salvaged armor (no shields — pirates don't trust them)
      { placedId: "pst-e1",   moduleDefId: "ext-armor-c4",      parentPlacedId: "pst-core", parentSideIndex: 3,    ownSideIndex: 0 },
      { placedId: "pst-e2",   moduleDefId: "ext-armor-c4",      parentPlacedId: "pst-core", parentSideIndex: 4,    ownSideIndex: 0 },
      // Utility: foundry + e-war
      { placedId: "pst-i1",   moduleDefId: "int-factory-c4",    parentPlacedId: "pst-core", parentSideIndex: 5,    ownSideIndex: 0 },
      { placedId: "pst-i2",   moduleDefId: "int-ew-c4",         parentPlacedId: "pst-core", parentSideIndex: 6,    ownSideIndex: 0 },
    ],
  },

  // ── C4 "Pirate Outpost" — capital station (far side of sun) ─────────────
  // Different doctrine: laser/torpedo long-range platform with shielding.
  // Located deep on the far side — a staging base for raids.
  // Budget (core-c4-power: 4W 5E 5I): used 4W, 2E, 1I — no engine.
  {
    id: "pirate-c4-outpost",
    name: "Pirate Outpost",
    sizeClass: 4,
    coreSideCount: 7,
    modules: [
      { placedId: "po-core", moduleDefId: "core-c4-power",     parentPlacedId: null,      parentSideIndex: null, ownSideIndex: null },
      // Long-range weapons: lasers + torpedo
      { placedId: "po-w1",   moduleDefId: "weapon-laser-c4",   parentPlacedId: "po-core", parentSideIndex: 0,    ownSideIndex: 0 },
      { placedId: "po-w2",   moduleDefId: "weapon-laser-c4",   parentPlacedId: "po-core", parentSideIndex: 1,    ownSideIndex: 0 },
      { placedId: "po-w3",   moduleDefId: "weapon-cannon-c4",  parentPlacedId: "po-core", parentSideIndex: 2,    ownSideIndex: 0 },
      { placedId: "po-w4",   moduleDefId: "weapon-torpedo-c4", parentPlacedId: "po-core", parentSideIndex: 3,    ownSideIndex: 0 },
      // Shielded (outpost is more cautious than stronghold)
      { placedId: "po-e1",   moduleDefId: "ext-shield-c4",     parentPlacedId: "po-core", parentSideIndex: 4,    ownSideIndex: 0 },
      { placedId: "po-e2",   moduleDefId: "ext-sensor-c4",     parentPlacedId: "po-core", parentSideIndex: 5,    ownSideIndex: 0 },
      // Utility: staging foundry
      { placedId: "po-i1",   moduleDefId: "int-factory-c4",    parentPlacedId: "po-core", parentSideIndex: 6,    ownSideIndex: 0 },
    ],
  },

];

export function getPirateBlueprint(sizeClass: number): SolarShipBlueprint | undefined {
  return PIRATE_BLUEPRINTS.find(b => b.sizeClass === sizeClass && !b.id.endsWith("-stronghold") && !b.id.endsWith("-outpost"));
}

export function getPirateBlueprintById(id: string): SolarShipBlueprint | undefined {
  return PIRATE_BLUEPRINTS.find(b => b.id === id);
}

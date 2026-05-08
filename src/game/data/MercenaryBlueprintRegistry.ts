/**
 * MercenaryBlueprintRegistry — the player's starting ship and any future
 * mercenary-faction vessels.
 *
 * "The Drifter" is the worst ship in the game by design: a class-1 power
 * core (60 HP) with a triangular scaffold hanging off one face, carrying one
 * Light Cannon and one Thruster.  Nothing else.
 *
 * Budget used: 1W / 1E of core-c1-power's 1W + 2E + 2I — leaves room to
 * upgrade from the very first shipyard visit.
 *
 * Module tree (ownSideIndex: 0 on every non-core module):
 *   core (triangle, coreSideCount 3)
 *   └─ side 0: Tri-Frame scaffold
 *              ├─ side 1: Light Cannon
 *              └─ side 2: Thruster
 */

import type { SolarShipBlueprint } from "../../types/solarShipBuilder";

export const MERCENARY_BLUEPRINTS: ReadonlyArray<SolarShipBlueprint> = [

  // ── "The Drifter" — class 1 starter (the player's starting vessel) ───────
  {
    id: "merc-c1-the-drifter",
    name: "The Drifter",
    sizeClass: 1,
    coreSideCount: 3,
    modules: [
      // Root core — bare-minimum power core, 60 HP
      { placedId: "d-core",   moduleDefId: "core-c1-power",    parentPlacedId: null,     parentSideIndex: null, ownSideIndex: null },
      // Tri-frame scaffold bolted to the core's front face
      { placedId: "d-frame",  moduleDefId: "struct-tri-c1",    parentPlacedId: "d-core",  parentSideIndex: 0,    ownSideIndex: 0 },
      // One Light Cannon on the scaffold
      { placedId: "d-cannon", moduleDefId: "weapon-cannon-c1", parentPlacedId: "d-frame", parentSideIndex: 1,    ownSideIndex: 0 },
      // One Thruster on the other scaffold face
      { placedId: "d-engine", moduleDefId: "int-engine-c1",    parentPlacedId: "d-frame", parentSideIndex: 2,    ownSideIndex: 0 },
    ],
  },

];

/** Returns the player's canonical starting blueprint (always "The Drifter"). */
export function makePlayerStarterBlueprint(): SolarShipBlueprint {
  return MERCENARY_BLUEPRINTS[0]!;
}

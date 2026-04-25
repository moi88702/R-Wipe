/**
 * FactionRegistry — static definitions for every faction in the solar system.
 *
 * Factions are pure, immutable data. They define:
 *  - Colour for map markers and UI accents
 *  - Alliance / enemy relationships
 *  - Which NPC ids and location ids belong to the faction by default
 *
 * Usage:
 *   FactionRegistry.getFaction("terran-federation")
 *   FactionRegistry.getAllFactions()
 *   FactionRegistry.getFactionsByAlly("void-merchants")
 */

import type { FactionDefinition } from "../../types/factions";

// ── Faction definitions ───────────────────────────────────────────────────────

const TERRAN_FEDERATION: FactionDefinition = {
  id: "terran-federation",
  name: "Terran Federation",
  color: { r: 50, g: 120, b: 220 },
  baselineNpcs: ["npc-commander-voss", "npc-trader-halley"],
  baselineLocations: ["station-alpha", "outpost-frontier"],
  allies: ["void-merchants"],
  enemies: ["scavenger-clans", "nova-rebels"],
};

const XENO_COLLECTIVE: FactionDefinition = {
  id: "xeno-collective",
  name: "Xeno Collective",
  color: { r: 140, g: 40, b: 200 },
  baselineNpcs: ["npc-emissary-zyx", "npc-archivist-krell"],
  baselineLocations: ["xeno-nexus", "crystal-spire"],
  allies: ["deep-miners"],
  enemies: ["terran-federation", "nova-rebels"],
};

const VOID_MERCHANTS: FactionDefinition = {
  id: "void-merchants",
  name: "Void Merchants Guild",
  color: { r: 220, g: 180, b: 40 },
  baselineNpcs: ["npc-broker-sable", "npc-captain-mira"],
  baselineLocations: ["neutral-hub", "station-beta"],
  allies: ["terran-federation"],
  enemies: [],
};

const SCAVENGER_CLANS: FactionDefinition = {
  id: "scavenger-clans",
  name: "Scavenger Clans",
  color: { r: 200, g: 80, b: 30 },
  baselineNpcs: ["npc-chief-rask", "npc-scrapper-dex"],
  baselineLocations: ["scavenger-haven"],
  allies: [],
  enemies: ["terran-federation", "void-merchants"],
};

const DEEP_MINERS: FactionDefinition = {
  id: "deep-miners",
  name: "Deep Miners Collective",
  color: { r: 60, g: 170, b: 80 },
  baselineNpcs: ["npc-foreman-groth", "npc-geologist-pera"],
  baselineLocations: ["mining-outpost-gamma", "deep-core-station"],
  allies: ["xeno-collective"],
  enemies: [],
};

const NOVA_REBELS: FactionDefinition = {
  id: "nova-rebels",
  name: "Nova Rebels",
  color: { r: 220, g: 40, b: 160 },
  baselineNpcs: ["npc-insurgent-tyne", "npc-strategist-orion"],
  baselineLocations: ["rebel-base"],
  allies: [],
  enemies: ["terran-federation", "void-merchants", "xeno-collective"],
};

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_FACTIONS: readonly FactionDefinition[] = Object.freeze([
  TERRAN_FEDERATION,
  XENO_COLLECTIVE,
  VOID_MERCHANTS,
  SCAVENGER_CLANS,
  DEEP_MINERS,
  NOVA_REBELS,
]);

const FACTION_MAP: Readonly<Record<string, FactionDefinition>> = Object.freeze(
  Object.fromEntries(ALL_FACTIONS.map((f) => [f.id, f])),
);

// ── Public API ────────────────────────────────────────────────────────────────

export const FactionRegistry = {
  /**
   * Returns the faction definition for the given id, or `undefined` if unknown.
   */
  getFaction(id: string): FactionDefinition | undefined {
    return FACTION_MAP[id];
  },

  /**
   * Returns every faction definition in an immutable array.
   */
  getAllFactions(): readonly FactionDefinition[] {
    return ALL_FACTIONS;
  },

  /**
   * Returns all faction ids in the registry.
   */
  getAllFactionIds(): string[] {
    return ALL_FACTIONS.map((f) => f.id);
  },

  /**
   * Returns factions that list `factionId` as an ally.
   */
  getFactionsByAlly(factionId: string): FactionDefinition[] {
    return ALL_FACTIONS.filter((f) => f.allies.includes(factionId));
  },

  /**
   * Returns factions that list `factionId` as an enemy.
   */
  getFactionsByEnemy(factionId: string): FactionDefinition[] {
    return ALL_FACTIONS.filter((f) => f.enemies.includes(factionId));
  },

  /**
   * Returns the factions that control the given location id by default.
   * There should typically be exactly one, but the lookup is defensive.
   */
  getFactionsForLocation(locationId: string): FactionDefinition[] {
    return ALL_FACTIONS.filter((f) =>
      f.baselineLocations.includes(locationId),
    );
  },

  /**
   * Returns the faction that owns a given NPC id by default.
   */
  getFactionForNpc(npcId: string): FactionDefinition | undefined {
    return ALL_FACTIONS.find((f) => f.baselineNpcs.includes(npcId));
  },
} as const;

/**
 * LocationRegistry — static location templates for the solar system.
 *
 * Locations are dockable points of interest (stations, outposts, settlements).
 * Each location specifies:
 *   - Which celestial body it resides on (bodyId)
 *   - Which faction controls it by default
 *   - Which NPCs are present and which services are available
 *   - Optional docking prerequisites (items or mission completion)
 *
 * Usage:
 *   LocationRegistry.getLocation("station-alpha")
 *   LocationRegistry.getLocationsByFaction("terran-federation")
 *   LocationRegistry.getLocationsByBody("planet-terran")
 *   LocationRegistry.getAllLocations()
 */

import type { Location } from "../../types/solarsystem";

// ── Location templates ────────────────────────────────────────────────────────

const STATION_ALPHA: Location = {
  id: "station-alpha",
  name: "Station Alpha",
  bodyId: "planet-terran",
  position: { x: 0, y: 0 },
  dockingRadius: 2,
  controllingFaction: "terran-federation",
  npcs: ["npc-commander-voss", "npc-trader-halley"],
  shops: ["shop-tf-alpha"],
  type: "station",
};

const OUTPOST_FRONTIER: Location = {
  id: "outpost-frontier",
  name: "Frontier Outpost",
  bodyId: "planet-terran",
  position: { x: 120, y: -80 },
  dockingRadius: 1.5,
  controllingFaction: "terran-federation",
  npcs: ["npc-commander-voss"],
  shops: ["shop-tf-frontier"],
  type: "outpost",
  requiredMissions: ["mission-tf-courier-alpha"],
};

const STATION_BETA: Location = {
  id: "station-beta",
  name: "Station Beta",
  bodyId: "planet-void",
  position: { x: 0, y: 0 },
  dockingRadius: 2,
  controllingFaction: "void-merchants",
  npcs: ["npc-broker-sable", "npc-captain-mira"],
  shops: ["shop-vm-beta"],
  type: "station",
};

const NEUTRAL_HUB: Location = {
  id: "neutral-hub",
  name: "Neutral Hub",
  bodyId: "planet-void",
  position: { x: -200, y: 50 },
  dockingRadius: 3,
  controllingFaction: "void-merchants",
  npcs: ["npc-broker-sable", "npc-captain-mira"],
  shops: ["shop-vm-neutral"],
  type: "station",
};

const XENO_NEXUS: Location = {
  id: "xeno-nexus",
  name: "Xeno Nexus",
  bodyId: "planet-xeno",
  position: { x: 0, y: 0 },
  dockingRadius: 2.5,
  controllingFaction: "xeno-collective",
  npcs: ["npc-emissary-zyx"],
  shops: ["shop-xc-nexus"],
  type: "station",
  requiredReputation: 50,
};

const CRYSTAL_SPIRE: Location = {
  id: "crystal-spire",
  name: "Crystal Spire",
  bodyId: "planet-xeno",
  position: { x: 90, y: 140 },
  dockingRadius: 1.5,
  controllingFaction: "xeno-collective",
  npcs: ["npc-archivist-krell"],
  shops: ["shop-xc-spire"],
  type: "outpost",
  requiredReputation: 100,
  requiredItems: ["xeno-access-pass"],
};

const SCAVENGER_HAVEN: Location = {
  id: "scavenger-haven",
  name: "Scavenger Haven",
  bodyId: "asteroid-belt",
  position: { x: 300, y: -120 },
  dockingRadius: 2,
  controllingFaction: "scavenger-clans",
  npcs: ["npc-chief-rask", "npc-scrapper-dex"],
  shops: ["shop-sc-haven"],
  type: "settlement",
};

const MINING_OUTPOST_GAMMA: Location = {
  id: "mining-outpost-gamma",
  name: "Mining Outpost Gamma",
  bodyId: "asteroid-belt",
  position: { x: -180, y: 220 },
  dockingRadius: 1.5,
  controllingFaction: "deep-miners",
  npcs: ["npc-foreman-groth", "npc-geologist-pera"],
  shops: ["shop-dm-gamma"],
  type: "outpost",
};

const DEEP_CORE_STATION: Location = {
  id: "deep-core-station",
  name: "Deep Core Station",
  bodyId: "moon-petra",
  position: { x: 0, y: 0 },
  dockingRadius: 2,
  controllingFaction: "deep-miners",
  npcs: ["npc-foreman-groth", "npc-geologist-pera"],
  shops: ["shop-dm-core"],
  type: "station",
  requiredMissions: ["mission-dm-courier-gamma"],
};

const REBEL_BASE: Location = {
  id: "rebel-base",
  name: "Rebel Base",
  bodyId: "moon-petra",
  position: { x: -60, y: 90 },
  dockingRadius: 1.5,
  controllingFaction: "nova-rebels",
  npcs: ["npc-insurgent-tyne", "npc-strategist-orion"],
  shops: ["shop-nr-base"],
  type: "outpost",
  requiredReputation: 0,
};

// ── Sol system locations ─────────────────────────────────────────────────────

const STATION_EARTH_ORBIT: Location = {
  id: "station-earth-orbit",
  name: "Earth Station",
  bodyId: "planet-earth",
  position: { x: 0, y: 0 },
  dockingRadius: 3,
  controllingFaction: "terran-federation",
  npcs: ["npc-commander-voss", "npc-trader-halley", "npc-foreman-groth"],
  shops: ["shop-tf-earth"],
  type: "station",
};

const OUTPOST_MARS: Location = {
  id: "outpost-mars",
  name: "Curiosity Base",
  bodyId: "planet-mars",
  position: { x: 0, y: 0 },
  dockingRadius: 2,
  controllingFaction: "terran-federation",
  npcs: [],
  shops: [],
  type: "outpost",
};

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_LOCATIONS: readonly Location[] = Object.freeze([
  STATION_ALPHA,
  OUTPOST_FRONTIER,
  STATION_BETA,
  NEUTRAL_HUB,
  XENO_NEXUS,
  CRYSTAL_SPIRE,
  SCAVENGER_HAVEN,
  MINING_OUTPOST_GAMMA,
  DEEP_CORE_STATION,
  REBEL_BASE,
  STATION_EARTH_ORBIT,
  OUTPOST_MARS,
]);

const LOCATION_MAP: Readonly<Record<string, Location>> = Object.freeze(
  Object.fromEntries(ALL_LOCATIONS.map((l) => [l.id, l])),
);

// ── Public API ────────────────────────────────────────────────────────────────

export const LocationRegistry = {
  /**
   * Returns the location definition for the given id, or `undefined`.
   */
  getLocation(id: string): Location | undefined {
    return LOCATION_MAP[id];
  },

  /**
   * Returns every location definition.
   */
  getAllLocations(): readonly Location[] {
    return ALL_LOCATIONS;
  },

  /**
   * Returns all location ids.
   */
  getAllLocationIds(): string[] {
    return ALL_LOCATIONS.map((l) => l.id);
  },

  /**
   * Returns all locations whose `controllingFaction` matches `factionId`.
   */
  getLocationsByFaction(factionId: string): Location[] {
    return ALL_LOCATIONS.filter((l) => l.controllingFaction === factionId);
  },

  /**
   * Returns all locations on the given celestial body.
   */
  getLocationsByBody(bodyId: string): Location[] {
    return ALL_LOCATIONS.filter((l) => l.bodyId === bodyId);
  },

  /**
   * Returns locations that host a given NPC.
   */
  getLocationsForNPC(npcId: string): Location[] {
    return ALL_LOCATIONS.filter((l) => l.npcs.includes(npcId));
  },

  /**
   * Returns locations that have docking prerequisites (items or missions).
   */
  getRestrictedLocations(): Location[] {
    return ALL_LOCATIONS.filter(
      (l) =>
        (l.requiredItems && l.requiredItems.length > 0) ||
        (l.requiredMissions && l.requiredMissions.length > 0) ||
        (l.requiredReputation !== undefined && l.requiredReputation > 0),
    );
  },

  /**
   * Returns the default controlling faction id for the given location id.
   * Derived directly from the location object — no separate map to keep in sync.
   */
  getControllingFaction(locationId: string): string | undefined {
    return LOCATION_MAP[locationId]?.controllingFaction;
  },
} as const;

/**
 * EnemyStationRegistry — static definitions for all hostile stations in the
 * solar system.
 *
 * Hostile stations are persistent enemy strongholds that:
 *   - Belong to hostile factions (scavenger-clans, nova-rebels).
 *   - Defend themselves with automated turrets.
 *   - Spawn enemy ship waves at configurable intervals when the player is
 *     within alert range and the station is in combat mode.
 *   - Have a two-layer health model: shields absorb hits before hull takes
 *     damage; hull at 0 = station destroyed.
 *
 * Positions are in km (world space), matching CelestialBody / Location
 * conventions. bodyId values match celestial body ids in the solar system.
 *
 * Usage:
 *   EnemyStationRegistry.getStation("enemy-station-scav-belt")
 *   EnemyStationRegistry.getStationsByFaction("scavenger-clans")
 *   EnemyStationRegistry.createInitialStates()
 */

import type { EnemyStationDefinition, EnemyStationState } from "../../types/combat";

// ── Scavenger Clan stations ───────────────────────────────────────────────────

/**
 * A mid-sized raider outpost deep in the asteroid belt.
 * Fast-moving grunt / darter / spinner patrols ambush passing traders.
 */
const SCAV_BELT_OUTPOST: EnemyStationDefinition = {
  id: "enemy-station-scav-belt",
  name: "Scav Belt Outpost",
  factionId: "scavenger-clans",
  bodyId: "asteroid-belt",
  position: { x: 450, y: -60 },
  alertRadiusKm: 15,
  hullHealth: 400,
  shieldCapacity: 200,
  shieldRechargeRatePerS: 5,
  turrets: {
    count: 3,
    damagePerShot: 20,
    fireRateMs: 1200,
    rangeKm: 12,
    weaponKind: "bullet",
  },
  spawnConfig: {
    shipTypes: ["grunt", "darter", "spinner"],
    maxActiveShips: 6,
    spawnIntervalMs: 8000,
    shipsPerWave: 2,
    spawnRadiusKm: 3,
  },
};

/**
 * A camouflaged haven built from salvaged wreckage near the inner belt.
 * Ambush specialists: slower spawn rate but hard to detect until close.
 */
const SCAV_WRECK_HAVEN: EnemyStationDefinition = {
  id: "enemy-station-scav-wreck",
  name: "Wreck Haven",
  factionId: "scavenger-clans",
  bodyId: "asteroid-belt",
  position: { x: 120, y: 380 },
  alertRadiusKm: 12,
  hullHealth: 300,
  shieldCapacity: 100,
  shieldRechargeRatePerS: 3,
  turrets: {
    count: 2,
    damagePerShot: 15,
    fireRateMs: 1500,
    rangeKm: 10,
    weaponKind: "bullet",
  },
  spawnConfig: {
    shipTypes: ["grunt", "orbiter"],
    maxActiveShips: 4,
    spawnIntervalMs: 10000,
    shipsPerWave: 2,
    spawnRadiusKm: 2.5,
  },
};

// ── Nova Rebel stations ───────────────────────────────────────────────────────

/**
 * A fortified rebel strike base carved into the moon Petra.
 * Deploys stalkers and lancers; laser turrets shred unshielded ships.
 */
const REBEL_STRIKE_BASE: EnemyStationDefinition = {
  id: "enemy-station-rebel-strike",
  name: "Strike Base Kappa",
  factionId: "nova-rebels",
  bodyId: "moon-petra",
  position: { x: -120, y: 160 },
  alertRadiusKm: 18,
  hullHealth: 600,
  shieldCapacity: 350,
  shieldRechargeRatePerS: 8,
  turrets: {
    count: 4,
    damagePerShot: 30,
    fireRateMs: 1000,
    rangeKm: 15,
    weaponKind: "laser",
  },
  spawnConfig: {
    shipTypes: ["stalker", "lancer", "torpedoer"],
    maxActiveShips: 8,
    spawnIntervalMs: 6000,
    shipsPerWave: 2,
    spawnRadiusKm: 4,
  },
};

/**
 * The rebels' primary staging area in the Void system — heavily armed and
 * permanently on a war footing. The most dangerous non-boss encounter in the
 * solar system.
 */
const REBEL_FORWARD_POST: EnemyStationDefinition = {
  id: "enemy-station-rebel-forward",
  name: "Forward Post Sigma",
  factionId: "nova-rebels",
  bodyId: "planet-void",
  position: { x: 350, y: 120 },
  alertRadiusKm: 20,
  hullHealth: 800,
  shieldCapacity: 500,
  shieldRechargeRatePerS: 12,
  turrets: {
    count: 6,
    damagePerShot: 35,
    fireRateMs: 800,
    rangeKm: 18,
    weaponKind: "cannon",
  },
  spawnConfig: {
    shipTypes: ["lancer", "cannoneer", "pulsar"],
    maxActiveShips: 10,
    spawnIntervalMs: 5000,
    shipsPerWave: 3,
    spawnRadiusKm: 5,
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_STATIONS: readonly EnemyStationDefinition[] = Object.freeze([
  SCAV_BELT_OUTPOST,
  SCAV_WRECK_HAVEN,
  REBEL_STRIKE_BASE,
  REBEL_FORWARD_POST,
]);

const STATION_MAP: Readonly<Record<string, EnemyStationDefinition>> = Object.freeze(
  Object.fromEntries(ALL_STATIONS.map((s) => [s.id, s])),
);

// ── Public API ────────────────────────────────────────────────────────────────

export const EnemyStationRegistry = {
  /**
   * Returns the station definition for the given id, or `undefined` if unknown.
   */
  getStation(id: string): EnemyStationDefinition | undefined {
    return STATION_MAP[id];
  },

  /**
   * Returns every station definition.
   */
  getAllStations(): readonly EnemyStationDefinition[] {
    return ALL_STATIONS;
  },

  /**
   * Returns all station ids.
   */
  getAllStationIds(): string[] {
    return ALL_STATIONS.map((s) => s.id);
  },

  /**
   * Returns all stations controlled by the given faction.
   */
  getStationsByFaction(factionId: string): EnemyStationDefinition[] {
    return ALL_STATIONS.filter((s) => s.factionId === factionId);
  },

  /**
   * Returns all stations located near the given celestial body.
   */
  getStationsByBody(bodyId: string): EnemyStationDefinition[] {
    return ALL_STATIONS.filter((s) => s.bodyId === bodyId);
  },

  /**
   * Create the initial runtime state for every registered station.
   *
   * Call this when starting a new session or when no persisted state exists.
   * Every station begins dormant, fully healed, and with no active spawns.
   */
  createInitialStates(): EnemyStationState[] {
    return ALL_STATIONS.map((s) => ({
      stationId: s.id,
      currentHull: s.hullHealth,
      currentShield: s.shieldCapacity,
      alertLevel: "dormant" as const,
      activeEnemyIds: [],
      lastSpawnAtMs: 0,
      isDestroyed: false,
    }));
  },
} as const;

/**
 * SolarStationRegistry — data-driven definitions for all combat stations
 * in the solar system modes.
 *
 * Each definition captures everything the engine needs to run a station:
 * faction, health pool, turret spec, ship-spawn roster, and starting alert
 * state. GameManager reads this at init time; adding a new station here
 * is all that is required to introduce it into the game.
 */

export type StationFaction = "pirate" | "earth" | "mars";

/** A single entry in a station's ship-spawn roster. */
export interface StationSpawnRosterEntry {
  /** Human-readable ship name shown in future HUD/comms. */
  name: string;
  /** Index into SOLAR_ENEMY_TYPES (determines weapon loadout and base stats). */
  typeIdx: number;
  /** Ship size class 1–9 (determines blueprint visual and base health). */
  sizeClass: number;
}

/** Turret configuration — all turrets on a station share the same spec. */
export interface StationTurretDef {
  /** Maximum attack range in km. */
  rangeKm: number;
  /** Damage per shot (instant hit). */
  damage: number;
  /** Milliseconds between shots. */
  cooldownMs: number;
  /** Index into SOLAR_WEAPONS for projectile visual color. */
  weaponIdx: number;
}

export interface SolarStationDefinition {
  id: string;
  name: string;
  faction: StationFaction;
  /** System this station belongs to. */
  systemId: string;
  /** World-space position in km. */
  position: { x: number; y: number };
  health: number;
  /** Station activates when player enters this radius (km). */
  alertRadiusKm: number;
  /**
   * When true the station starts in full "combat" mode from game load —
   * ships spawn immediately and turrets are active.
   * When false the station starts dormant until the player gets within
   * alertRadiusKm or an external trigger sets it to combat.
   */
  startInCombat: boolean;
  turret: StationTurretDef;
  spawn: {
    /** Roster cycled round-robin for each new ship. */
    roster: ReadonlyArray<StationSpawnRosterEntry>;
    /** Milliseconds between successive spawns. */
    intervalMs: number;
    /** Maximum ships alive from this station at one time. */
    maxShips: number;
    /** Spawn point scatter radius in km around station position. */
    radiusKm: number;
  };
}

const SOL_STATIONS: ReadonlyArray<SolarStationDefinition> = [

  // ── Pirate Stronghold ────────────────────────────────────────────────────
  {
    id: "pirate-base-sol",
    name: "Pirate Stronghold",
    faction: "pirate",
    systemId: "sol",
    position: { x: 250, y: 120 },
    health: 800,
    alertRadiusKm: 180,
    startInCombat: true,
    turret: {
      rangeKm: 80,
      damage: 20,
      cooldownMs: 2500,
      weaponIdx: 5, // Ion Cannon
    },
    spawn: {
      roster: [
        { name: "Scav Raider",    typeIdx: 0, sizeClass: 1 },
        { name: "Scav Hunter",    typeIdx: 2, sizeClass: 1 },
        { name: "Scav Gunship",   typeIdx: 3, sizeClass: 2 },
        { name: "Scav Destroyer", typeIdx: 4, sizeClass: 2 },
        { name: "Scav Predator",  typeIdx: 5, sizeClass: 1 },
        { name: "Scav Corsair",   typeIdx: 9, sizeClass: 2 },
      ],
      intervalMs: 6000,
      maxShips: 8,
      radiusKm: 25,
    },
  },

  // ── Earth Station ────────────────────────────────────────────────────────
  {
    id: "earth-base-sol",
    name: "Earth Station",
    faction: "earth",
    systemId: "sol",
    position: { x: 312, y: 0 },
    health: 2000,
    alertRadiusKm: 120,
    startInCombat: true,
    turret: {
      rangeKm: 100,
      damage: 40,
      cooldownMs: 1500,
      weaponIdx: 1, // Hyper Laser
    },
    spawn: {
      roster: [
        { name: "TF Sentinel",  typeIdx: 0, sizeClass: 1 },
        { name: "TF Falcon",    typeIdx: 1, sizeClass: 1 },
        { name: "TF Vanguard",  typeIdx: 4, sizeClass: 2 },
        { name: "TF Enforcer",  typeIdx: 3, sizeClass: 2 },
        { name: "TF Bastion",   typeIdx: 6, sizeClass: 3 },
      ],
      intervalMs: 10000,
      maxShips: 6,
      radiusKm: 20,
    },
  },

  // ── Mars Outpost ─────────────────────────────────────────────────────────
  {
    id: "mars-base-sol",
    name: "Mars Outpost",
    faction: "mars",
    systemId: "sol",
    position: { x: 488, y: 82 },
    health: 1500,
    alertRadiusKm: 100,
    startInCombat: true, // spawns patrol ships but they are neutral unless provoked
    turret: {
      rangeKm: 90,
      damage: 35,
      cooldownMs: 2000,
      weaponIdx: 5, // Ion Cannon
    },
    spawn: {
      roster: [
        { name: "Ares Scout",      typeIdx: 0, sizeClass: 1 },
        { name: "Dustrunner",      typeIdx: 2, sizeClass: 1 },
        { name: "Olympus Patrol",  typeIdx: 3, sizeClass: 2 },
        { name: "Hellas Guard",    typeIdx: 4, sizeClass: 2 },
        { name: "Valles Ranger",   typeIdx: 7, sizeClass: 3 },
      ],
      intervalMs: 12000,
      maxShips: 5,
      radiusKm: 18,
    },
  },

];

export const SolarStationRegistry = {
  getStationsBySystem(systemId: string): ReadonlyArray<SolarStationDefinition> {
    return SOL_STATIONS.filter(s => s.systemId === systemId);
  },

  getStation(id: string): SolarStationDefinition | undefined {
    return SOL_STATIONS.find(s => s.id === id);
  },

  getAllStations(): ReadonlyArray<SolarStationDefinition> {
    return SOL_STATIONS;
  },
};

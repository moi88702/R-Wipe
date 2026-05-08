/**
 * SolarStationRegistry — data-driven definitions for all combat stations
 * in the solar system modes.
 *
 * Each definition captures everything the engine needs to run a station:
 * faction, health pool, turret spec, ship-spawn roster, and starting alert
 * state. GameManager reads this at init time; adding a new station here
 * is all that is required to introduce it into the game.
 *
 * ── STATION DESIGN RULES ──────────────────────────────────────────────────
 *
 * Stations are large ships without engines — they cannot move.  Every station
 * definition MUST include:
 *
 *   1. A blueprintId referencing a sizeClass 4+ blueprint with NO engine
 *      modules and at least one int-factory-c* module.
 *   2. Enough turrets (turretRangeKm > 0) to defend the inner perimeter.
 *   3. A spawn roster sized to protect the approaches: a station that can only
 *      field 2–3 ships will fall to any determined attacker — use maxShips ≥ 6
 *      for outposts and ≥ 10 for strongholds.
 *   4. A defenseRadiusKm that gives spawned ships a sensible patrol area.
 *
 * Stations with only factories and no turrets/ships will be sitting ducks.
 * ──────────────────────────────────────────────────────────────────────────
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
   * Ships of this faction will not pursue enemies beyond this radius from
   * their station.  0 means no limit (pursue freely).
   */
  defenseRadiusKm: number;
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
  /**
   * Ship class of this station's hull blueprint.
   * sizeClass 4 = capital (battlecruiser), 6 = super-capital (dreadnought).
   * Used to scale the station's visual representation.
   */
  sizeClass: number;
  /**
   * ID of the SolarShipBlueprint used to render this station.
   * Must exist in the relevant faction's blueprint registry.
   */
  blueprintId: string;
}

const SOL_STATIONS: ReadonlyArray<SolarStationDefinition> = [

  // ── Pirate Stronghold ────────────────────────────────────────────────────
  // Capital-class hull between Sol and Earth — cannon-heavy, armor-plated.
  // DESIGN NOTE: 10 max ships + brutal turrets required to hold the approaches.
  {
    id: "pirate-base-sol",
    name: "Pirate Stronghold",
    faction: "pirate",
    systemId: "sol",
    position: { x: 680, y: 380 },
    health: 5000,
    alertRadiusKm: 350,
    defenseRadiusKm: 0, // pirates pursue freely
    startInCombat: true,
    sizeClass: 4,
    blueprintId: "pirate-c4-stronghold",
    turret: {
      rangeKm: 120,
      damage: 60,
      cooldownMs: 1800,
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
      intervalMs: 5000,
      maxShips: 10,
      radiusKm: 75,
    },
  },

  // ── Pirate Outpost ───────────────────────────────────────────────────────
  // Laser/torpedo staging base on the far side of the sun from Earth & Mars.
  // Different doctrine: long-range fire, shielded, smaller patrol wing.
  // DESIGN NOTE: fewer ships (8) but sensors + turrets cover the approaches.
  {
    id: "pirate-outpost-sol",
    name: "Pirate Outpost",
    faction: "pirate",
    systemId: "sol",
    position: { x: -1050, y: -300 },
    health: 3500,
    alertRadiusKm: 300,
    defenseRadiusKm: 0, // pirates pursue freely
    startInCombat: true,
    sizeClass: 4,
    blueprintId: "pirate-c4-outpost",
    turret: {
      rangeKm: 150,   // long-range laser doctrine
      damage: 50,
      cooldownMs: 1400,
      weaponIdx: 1, // Hyper Laser
    },
    spawn: {
      roster: [
        { name: "Scav Raider",    typeIdx: 0, sizeClass: 1 },
        { name: "Scav Lancer",    typeIdx: 5, sizeClass: 1 },
        { name: "Scav Corsair",   typeIdx: 9, sizeClass: 2 },
        { name: "Scav Destroyer", typeIdx: 4, sizeClass: 2 },
        { name: "Scav Gunship",   typeIdx: 3, sizeClass: 2 },
      ],
      intervalMs: 6000,
      maxShips: 8,
      radiusKm: 60,
    },
  },

  // ── Earth Orbital Platform ───────────────────────────────────────────────
  // Super-capital high-orbit platform above Earth. Immense range covers the
  // entire Earth-Mars corridor.
  // DESIGN NOTE: 10 ships + extreme-range turrets lock down the inner system.
  {
    id: "earth-base-sol",
    name: "Earth Orbital Platform",
    faction: "earth",
    systemId: "sol",
    // High orbit: Earth at (900,0) + ~120km offset
    position: { x: 1020, y: 80 },
    health: 15000,
    alertRadiusKm: 400,
    defenseRadiusKm: 400, // ships retreat if pushed beyond this
    startInCombat: true,
    sizeClass: 6,
    blueprintId: "earth-c6-orbital-platform",
    turret: {
      rangeKm: 300,    // immense range — covers the planet and approaches
      damage: 140,
      cooldownMs: 800,
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
      intervalMs: 4000,
      maxShips: 10,
      radiusKm: 60,
    },
  },

  // ── Mars Citadel ─────────────────────────────────────────────────────────
  // Capital-class high-orbit citadel.  Neutral patrol — fights if provoked.
  // Immense range locks down the outer system from the Mars belt.
  // DESIGN NOTE: 6 patrol ships + turrets can repel opportunistic attackers.
  {
    id: "mars-base-sol",
    name: "Mars Citadel",
    faction: "mars",
    systemId: "sol",
    // High orbit: Mars at (1440,240) + ~110km offset
    position: { x: 1550, y: 175 },
    health: 8000,
    alertRadiusKm: 330,
    defenseRadiusKm: 330,
    startInCombat: true, // spawns patrol ships but neutral unless provoked
    sizeClass: 4,
    blueprintId: "mars-c4-citadel",
    turret: {
      rangeKm: 220,   // immense range — guards Mars and the surrounding belt
      damage: 100,
      cooldownMs: 1100,
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
      intervalMs: 9000,
      maxShips: 6,
      radiusKm: 55,
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

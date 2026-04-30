/**
 * Solar system data models for the Open World Solar System Exploration feature.
 *
 * Covers procedurally generated, persistent solar systems including celestial
 * bodies, locations, orbital mechanics, and session state.
 */

// ── Seed & Generation ────────────────────────────────────────────────────────

/**
 * Deterministic seed for reproducible solar system generation.
 * Stored with the system state for recovery and reset.
 */
export interface SystemSeed {
  /** Human-readable name for the system (e.g. "Kepler-442"). */
  name: string;
  /** Unix timestamp (ms) when the system was first generated. */
  timestamp: number;
  /** Integer seed value fed into the seeded RNG (e.g. mulberry32). */
  randomSeed: number;
}

// ── Orbital Mechanics ────────────────────────────────────────────────────────

/**
 * Keplerian orbital parameters for a celestial body orbiting a parent.
 * All angles are in degrees; distances in km.
 */
export interface OrbitalParams {
  /** Id of the body being orbited. `null` for the root star (no parent). */
  parentId: string | null;
  /** Semi-major axis of the elliptical orbit (km). */
  semiMajorAxis: number;
  /** Orbital eccentricity (0 = circular, < 1 = elliptical). */
  eccentricity: number;
  /** Orbital inclination relative to the reference plane (degrees). */
  inclination: number;
  /** Longitude of the ascending node (degrees). */
  longitudeAscendingNode: number;
  /** Argument of periapsis (degrees). */
  argumentOfPeriapsis: number;
  /** Mean anomaly at the epoch reference time (degrees). */
  meanAnomalyAtEpoch: number;
  /** Time to complete one full orbit (milliseconds). */
  orbitalPeriodMs: number;
  /** Current mean anomaly, updated each simulation tick (degrees). */
  currentAnomaly: number;
}

// ── Celestial Bodies ─────────────────────────────────────────────────────────

/**
 * A single celestial object in the solar system.
 * Positions and radii are in km (world space).
 */
export interface CelestialBody {
  /** Unique identifier, e.g. "star-1", "planet-2", "station-3". */
  id: string;
  /** Display name shown on the map. */
  name: string;
  /** Classification that drives rendering and gameplay behaviour. */
  type: "star" | "planet" | "moon" | "asteroid" | "station";
  /** World-space centre position (km). Updated each orbital tick. */
  position: { x: number; y: number };
  /** Body radius (km). Used for collision boundaries and gravity falloff. */
  radius: number;
  /** Approximate mass (kg). Used in gravity calculations. */
  mass: number;
  /** Gravitational acceleration at the body's surface (m/s²). */
  gravityStrength: number;
  /** Base render colour (0–255 per channel). */
  color: { r: number; g: number; b: number };
  /** Orbital parameters relative to the body's parent. */
  orbital: OrbitalParams;
  /**
   * When true, this body is the single primary gravity source that applies
   * acceleration to the player's capital ship each frame. Exactly one body
   * per system should carry this flag.
   */
  isPrimaryGravitySource: boolean;
}

// ── Locations ────────────────────────────────────────────────────────────────

/**
 * A dockable / visitable location associated with a celestial body.
 * Locations host NPCs, shops, and missions.
 */
export interface Location {
  /** Unique identifier, e.g. "station-alpha-1". */
  id: string;
  /** Display name shown in the approach and docking menus. */
  name: string;
  /** Id of the parent celestial body this location orbits / rests on. */
  bodyId: string;
  /** World-space offset from the parent body's centre (km). */
  position: { x: number; y: number };
  /** Approach radius that triggers the docking menu (km). */
  dockingRadius: number;
  /** Faction that currently controls this location (faction id). */
  controllingFaction: string;
  /** NPC ids offering missions or trade at this location. */
  npcs: string[];
  /** Shop ids available at this location. */
  shops: string[];
  /**
   * Item ids the player must carry to be granted docking permission.
   * Absent or empty means no item requirement.
   */
  requiredItems?: string[];
  /**
   * Mission ids the player must have completed before docking is allowed.
   * Absent or empty means no mission prerequisite.
   */
  requiredMissions?: string[];
  /**
   * Minimum faction reputation the player must hold with the controlling
   * faction to be granted docking permission. Absent or 0 means no
   * reputation gate.
   */
  requiredReputation?: number;
  /** Structural classification of the location. */
  type: "station" | "settlement" | "outpost";
}

// ── State Change Log ─────────────────────────────────────────────────────────

/** A single immutable entry in the solar system's state change log. */
export interface StateChangeLogEntry {
  /** Unix timestamp (ms) when the event occurred. */
  timestamp: number;
  /** Category of the state change for filtering and replay. */
  eventType:
    | "docking"
    | "mission-completed"
    | "faction-takeover"
    | "reputation-change";
  /** Event-specific payload. Shape is determined by `eventType`. */
  details: Record<string, unknown>;
}

/**
 * Append-only log of all state changes within a solar system.
 * Persisted alongside the system snapshot for auditing and recovery.
 */
export interface StateChangeLog {
  entries: StateChangeLogEntry[];
}

// ── Solar System State ───────────────────────────────────────────────────────

/**
 * Complete, persistable snapshot of a solar system.
 * Stored in the `rwipe.solarsystem.v1` localStorage slot.
 */
export interface SolarSystemState {
  /** Deterministic seed used to (re)generate this system. */
  seed: SystemSeed;
  /** All celestial bodies in the system (star, planets, moons, etc.). */
  celestialBodies: CelestialBody[];
  /** All dockable locations in the system. */
  locations: Location[];
  /**
   * Faction assignments at generation time. locationId → factionId.
   * Never mutated after generation; used as the historical baseline.
   */
  initialFactionAssignments: Record<string, string>;
  /**
   * Current faction control state. locationId → factionId.
   * Updated by faction takeover events.
   */
  currentFactionControl: Record<string, string>;
  /** Ordered record of all state changes since generation. */
  stateChangeLog: StateChangeLog;
  /** Unix timestamp (ms) of the most recent state mutation. */
  lastUpdatedAt: number;
}

// ── System Gates ─────────────────────────────────────────────────────────────

/**
 * A traversal gate placed at the edge of a solar system.
 *
 * Gates always come in **pairs**: the gate's `sisterGateId` points to the
 * matching gate in another system.  Travelling through gate A deposits the
 * player at gate B's position (and vice versa), creating bidirectional
 * fast travel between systems.
 *
 * Positions are in km (world space), matching `CelestialBody.position` and
 * `Location.position` conventions.  A gate's `triggerRadius` is the approach
 * sphere the player must enter to initiate the transit.
 */
export interface SystemGate {
  /** Unique identifier, e.g. `"gate-sol-to-kepler"`. */
  id: string;
  /** Display name shown in the HUD on approach, e.g. `"Sol → Kepler Gate"`. */
  name: string;
  /**
   * Id of the solar system this gate resides in.
   * Matches the generating system's `SystemSeed.name`.
   */
  systemId: string;
  /** World-space centre position of the gate structure (km). */
  position: { x: number; y: number };
  /**
   * Approach radius (km).  When the player ship is within this distance the
   * teleportation transit is triggered.
   */
  triggerRadius: number;
  /** Id of the gate this one connects to (in another system). */
  sisterGateId: string;
  /**
   * Id of the solar system that the sister gate belongs to.
   * Lets callers determine the destination without fetching the sister gate.
   */
  destinationSystemId: string;
}

// ── Session State ────────────────────────────────────────────────────────────

/**
 * In-memory state for the active solar system play session.
 * Holds fast-changing values (position, velocity) alongside the persisted
 * system snapshot. Not persisted directly; reconstructed from the snapshot
 * plus capital ship state on session load.
 */
export interface SolarSystemSessionState {
  /** The loaded (or freshly generated) solar system. */
  currentSystem: SolarSystemState;
  /**
   * Id of the celestial body currently applying gravity to the player ship.
   * Exactly one at a time per the single-primary-body design.
   */
  primaryGravitySourceId: string;
  /** Player capital ship position in world space (km). */
  playerPosition: { x: number; y: number };
  /** Player capital ship velocity (m/s). */
  playerVelocity: { x: number; y: number };
  /** Player capital ship heading (degrees, 0–359, clockwise from North). */
  playerHeading: number;
  /**
   * Current map zoom level.
   * Constrained to [0.5, 3.0]; default 1.0.
   */
  zoomLevel: number;
  /**
   * Id of the location the player is currently docked at.
   * `null` when the ship is in free flight.
   */
  dockedLocationId: string | null;
  /** Location ids whose docking radius currently overlaps the player ship. */
  nearbyLocations: string[];
  /**
   * Location ids the player has visited at least once this save file.
   * Persisted via the solar system state on session end.
   */
  discoveredLocations: Set<string>;
}

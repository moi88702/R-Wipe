/**
 * SolarSystemManager — session orchestrator for the open-world solar system.
 *
 * Owns:
 *  - Procedural system generation (star + planets + locations).
 *  - Per-frame orbital simulation (planet mean-anomaly advance).
 *  - Gravity application to the player's capital ship while undocked.
 *  - Docking proximity detection.
 *  - Render data assembly for GameRenderer.
 *
 * No Pixi. No DOM. Pure logic + math.
 *
 * Units (following SolarSystemState convention):
 *   Positions  : km  (world space)
 *   Velocities : m/s
 *   Gravity    : m/s² (surface, then scaled by inverse-square)
 *   Time       : ms  (externally), seconds (internally in physics)
 */

import type { CelestialBody, Location, SolarSystemState, SolarSystemSessionState } from "../types/solarsystem";
import { GravitySystem } from "../game/solarsystem/GravitySystem";

// ── Render data types ─────────────────────────────────────────────────────────

export interface SolarSystemBodyRenderDatum {
  id: string;
  name: string;
  type: CelestialBody["type"];
  screenX: number;
  screenY: number;
  /** Radius in screen pixels (clamped to at least 2). */
  screenRadius: number;
  color: { r: number; g: number; b: number };
  isPrimaryGravitySource: boolean;
}

export interface SolarSystemLocationRenderDatum {
  id: string;
  name: string;
  screenX: number;
  screenY: number;
  /** Faction controlling this location — used for marker colour. */
  factionId: string;
  isDocked: boolean;
  isNearby: boolean;
}

export interface SolarSystemRenderData {
  systemName: string;
  playerScreenX: number;
  playerScreenY: number;
  playerHeading: number;
  playerIsDocked: boolean;
  dockedLocationName: string | null;
  bodies: SolarSystemBodyRenderDatum[];
  locations: SolarSystemLocationRenderDatum[];
  zoomLevel: number;
}

// ── System generation constants ───────────────────────────────────────────────

/** Gravitational constant at the star's surface (m/s²). */
const STAR_GRAVITY = 274; // Sun-like

/**
 * World-space KM per screen pixel at zoom=1. Set so the innermost planet
 * sits ~150 px from the star on a 1280-wide canvas.
 */
const KM_PER_PX_BASE = 1_000;

/** Player's initial thrust magnitude on undock (m/s). */
const UNDOCK_VELOCITY = 0.5;

/** Docking proximity radius (km). */
const DOCK_RANGE_KM = 5;

// ── Default system definition (deterministic, seed-independent base) ──────────

function makeDefaultSystem(): SolarSystemState {
  // ── Celestial bodies ──────────────────────────────────────────────────────
  const EPOCH = 0; // reference time

  const star: CelestialBody = {
    id: "star-sol",
    name: "Sol",
    type: "star",
    position: { x: 0, y: 0 },
    radius: 5_000, // km (gameplay radius — well inside 150 000 km innermost orbit)
    mass: 1.989e30,
    gravityStrength: STAR_GRAVITY,
    color: { r: 255, g: 230, b: 80 },
    orbital: {
      parentId: null,
      semiMajorAxis: 0,
      eccentricity: 0,
      inclination: 0,
      longitudeAscendingNode: 0,
      argumentOfPeriapsis: 0,
      meanAnomalyAtEpoch: 0,
      orbitalPeriodMs: 0,
      currentAnomaly: 0,
    },
    isPrimaryGravitySource: true,
  };

  // Orbital period scaled for gameplay (1 in-game "day" = 5 s real time).
  const GAME_DAY_MS = 5_000;

  const planetTerran: CelestialBody = {
    id: "planet-terran",
    name: "Terran",
    type: "planet",
    position: { x: 150_000, y: 0 },
    radius: 6_371,
    mass: 5.972e24,
    gravityStrength: 9.8,
    color: { r: 60, g: 130, b: 220 },
    orbital: {
      parentId: "star-sol",
      semiMajorAxis: 150_000,
      eccentricity: 0.017,
      inclination: 0,
      longitudeAscendingNode: 0,
      argumentOfPeriapsis: 0,
      meanAnomalyAtEpoch: 0,
      orbitalPeriodMs: 365 * GAME_DAY_MS,
      currentAnomaly: 0,
    },
    isPrimaryGravitySource: false,
  };

  const planetVoid: CelestialBody = {
    id: "planet-void",
    name: "Void",
    type: "planet",
    position: { x: 280_000, y: 0 },
    radius: 7_120,
    mass: 6.4e24,
    gravityStrength: 11.2,
    color: { r: 90, g: 40, b: 140 },
    orbital: {
      parentId: "star-sol",
      semiMajorAxis: 280_000,
      eccentricity: 0.093,
      inclination: 0,
      longitudeAscendingNode: 0,
      argumentOfPeriapsis: 0,
      meanAnomalyAtEpoch: 60,
      orbitalPeriodMs: 687 * GAME_DAY_MS,
      currentAnomaly: 60,
    },
    isPrimaryGravitySource: false,
  };

  const asteroidRing: CelestialBody = {
    id: "asteroid-belt-1",
    name: "Kessler Belt",
    type: "asteroid",
    position: { x: 400_000, y: 0 },
    radius: 500,
    mass: 1e18,
    gravityStrength: 0.05,
    color: { r: 140, g: 120, b: 90 },
    orbital: {
      parentId: "star-sol",
      semiMajorAxis: 400_000,
      eccentricity: 0.2,
      inclination: 0,
      longitudeAscendingNode: 0,
      argumentOfPeriapsis: 0,
      meanAnomalyAtEpoch: 120,
      orbitalPeriodMs: 1_100 * GAME_DAY_MS,
      currentAnomaly: 120,
    },
    isPrimaryGravitySource: false,
  };

  void EPOCH;

  const celestialBodies = [star, planetTerran, planetVoid, asteroidRing];

  // ── Locations ─────────────────────────────────────────────────────────────

  const locations: Location[] = [
    {
      id: "station-alpha",
      name: "Station Alpha",
      bodyId: "planet-terran",
      position: { x: 150_000, y: 8_000 }, // near Terran
      dockingRadius: DOCK_RANGE_KM,
      controllingFaction: "terran-federation",
      npcs: ["npc-commander-voss", "npc-trader-halley"],
      shops: ["shop-tf-alpha"],
      type: "station",
    },
    {
      id: "outpost-frontier",
      name: "Frontier Outpost",
      bodyId: "planet-terran",
      position: { x: 145_000, y: -9_000 },
      dockingRadius: DOCK_RANGE_KM,
      controllingFaction: "terran-federation",
      npcs: ["npc-commander-voss"],
      shops: ["shop-tf-frontier"],
      type: "outpost",
      requiredMissions: ["mission-tf-courier-alpha"],
    },
    {
      id: "station-beta",
      name: "Station Beta",
      bodyId: "planet-void",
      position: { x: 280_000, y: 9_000 },
      dockingRadius: DOCK_RANGE_KM,
      controllingFaction: "void-merchants",
      npcs: ["npc-broker-sable", "npc-captain-mira"],
      shops: ["shop-vm-beta"],
      type: "station",
    },
    {
      id: "neutral-hub",
      name: "Neutral Hub",
      bodyId: "asteroid-belt-1",
      position: { x: 400_000, y: 2_000 },
      dockingRadius: DOCK_RANGE_KM,
      controllingFaction: "void-merchants",
      npcs: ["npc-broker-sable"],
      shops: ["shop-neutral-hub"],
      type: "station",
    },
  ];

  const initialFactionAssignments: Record<string, string> = {};
  for (const loc of locations) {
    initialFactionAssignments[loc.id] = loc.controllingFaction;
  }

  return {
    seed: {
      name: "Sol System",
      timestamp: 0,
      randomSeed: 0,
    },
    celestialBodies,
    locations,
    initialFactionAssignments,
    currentFactionControl: { ...initialFactionAssignments },
    stateChangeLog: { entries: [] },
    lastUpdatedAt: 0,
  };
}

// ── Orbital simulation ─────────────────────────────────────────────────────────

/**
 * Compute a body's world-space position from its current anomaly and its
 * parent's position. Uses a simplified elliptical formula (eccentricity
 * shifts periapsis but keeps the orbit closed).
 */
function orbitPosition(
  semiMajorAxis: number,
  eccentricity: number,
  anomalyDeg: number,
  parentPos: { x: number; y: number },
): { x: number; y: number } {
  const a = anomalyDeg * (Math.PI / 180);
  // True anomaly approximation for small eccentricities: ν ≈ M + 2e·sin(M)
  const trueAnomaly = a + 2 * eccentricity * Math.sin(a);
  // Radius from focus: r = a(1 - e²)/(1 + e·cos(ν))
  const r = (semiMajorAxis * (1 - eccentricity * eccentricity)) /
    (1 + eccentricity * Math.cos(trueAnomaly));
  return {
    x: parentPos.x + r * Math.cos(trueAnomaly),
    y: parentPos.y + r * Math.sin(trueAnomaly),
  };
}

// ── SolarSystemManager ────────────────────────────────────────────────────────

export class SolarSystemManager {
  private system: SolarSystemState;
  private session: SolarSystemSessionState;

  constructor(system?: SolarSystemState) {
    this.system = system ?? makeDefaultSystem();

    const startLocation = this.system.locations.find(
      (l) => l.id === "station-alpha",
    ) ?? this.system.locations[0]!;

    this.session = {
      currentSystem: this.system,
      primaryGravitySourceId:
        this.system.celestialBodies.find((b) => b.isPrimaryGravitySource)?.id ??
        this.system.celestialBodies[0]!.id,
      playerPosition: { ...startLocation.position },
      playerVelocity: { x: 0, y: 0 },
      playerHeading: 90,
      zoomLevel: 1.0,
      dockedLocationId: startLocation.id,
      nearbyLocations: [startLocation.id],
      discoveredLocations: new Set([startLocation.id]),
    };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getSessionState(): Readonly<SolarSystemSessionState> {
    return this.session;
  }

  getSystem(): Readonly<SolarSystemState> {
    return this.system;
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  /**
   * Undock from the current location, giving the player a small outward
   * velocity so they drift away from the station.
   */
  undock(): void {
    if (!this.session.dockedLocationId) return;
    const heading = this.session.playerHeading * (Math.PI / 180);
    this.session = {
      ...this.session,
      dockedLocationId: null,
      playerVelocity: {
        x: Math.cos(heading) * UNDOCK_VELOCITY,
        y: -Math.sin(heading) * UNDOCK_VELOCITY, // y-axis flipped (screen coords)
      },
    };
  }

  /**
   * Attempt to dock at the named location. Succeeds only if the player is
   * within the location's docking radius. Returns true on success.
   */
  dock(locationId: string): boolean {
    const loc = this.system.locations.find((l) => l.id === locationId);
    if (!loc) return false;
    const dx = this.session.playerPosition.x - loc.position.x;
    const dy = this.session.playerPosition.y - loc.position.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > loc.dockingRadius * loc.dockingRadius) return false;
    this.session = {
      ...this.session,
      playerVelocity: { x: 0, y: 0 },
      dockedLocationId: locationId,
      nearbyLocations: [...new Set([...this.session.nearbyLocations, locationId])],
      discoveredLocations: new Set([...this.session.discoveredLocations, locationId]),
    };
    return true;
  }

  // ── Simulation tick ───────────────────────────────────────────────────────

  /**
   * Advance the simulation by `deltaMs` milliseconds:
   *  1. Advance each body's mean anomaly and recompute its world position.
   *  2. Recompute location world positions (they orbit with their parent body).
   *  3. Apply gravity to the player ship (if undocked).
   *  4. Advance the player's position by the updated velocity.
   *  5. Update nearby-locations list.
   */
  tick(deltaMs: number): void {
    // 1. Advance orbital positions.
    const bodyPosById = new Map<string, { x: number; y: number }>();
    const updatedBodies = this.system.celestialBodies.map((body) => {
      if (body.orbital.parentId === null || body.orbital.orbitalPeriodMs === 0) {
        // Star / non-orbiting body — position is fixed.
        bodyPosById.set(body.id, body.position);
        return body;
      }
      const parentPos = bodyPosById.get(body.orbital.parentId) ?? { x: 0, y: 0 };
      const degreesPerMs = 360 / body.orbital.orbitalPeriodMs;
      const newAnomaly = (body.orbital.currentAnomaly + degreesPerMs * deltaMs) % 360;
      const newPos = orbitPosition(
        body.orbital.semiMajorAxis,
        body.orbital.eccentricity,
        newAnomaly,
        parentPos,
      );
      bodyPosById.set(body.id, newPos);
      return {
        ...body,
        orbital: { ...body.orbital, currentAnomaly: newAnomaly },
        position: newPos,
      };
    });

    // 2. Recompute location positions (follow their parent body's movement).
    const updatedLocations = this.system.locations.map((loc) => {
      const bodyPos = bodyPosById.get(loc.bodyId);
      if (!bodyPos) return loc;
      // Locations store their position as an offset from the body; we want
      // the absolute world position so gravity + proximity can use it.
      // For simplicity, locations sit at a fixed offset from their body.
      const bodyBefore = this.system.celestialBodies.find((b) => b.id === loc.bodyId);
      if (!bodyBefore) return loc;
      const dx = loc.position.x - bodyBefore.position.x;
      const dy = loc.position.y - bodyBefore.position.y;
      return { ...loc, position: { x: bodyPos.x + dx, y: bodyPos.y + dy } };
    });

    // Commit body + location updates.
    this.system = {
      ...this.system,
      celestialBodies: updatedBodies,
      locations: updatedLocations,
    };

    // 3. Apply gravity + advance player position (only when not docked).
    let { playerPosition, playerVelocity } = this.session;
    if (!this.session.dockedLocationId) {
      const primaryBody = updatedBodies.find(
        (b) => b.id === this.session.primaryGravitySourceId,
      );
      if (primaryBody) {
        playerVelocity = GravitySystem.applyGravity(
          playerPosition,
          playerVelocity,
          primaryBody,
          deltaMs,
        );
      }

      // 4. Advance player position (Euler integration, km/frame from m/s).
      const dtS = deltaMs / 1_000;
      // Velocity is in m/s; positions are in km → divide by 1000.
      playerPosition = {
        x: playerPosition.x + (playerVelocity.x * dtS) / 1_000,
        y: playerPosition.y + (playerVelocity.y * dtS) / 1_000,
      };
    }

    // 5. Update nearby locations list.
    const nearbyLocations = updatedLocations
      .filter((loc) => {
        const dx = playerPosition.x - loc.position.x;
        const dy = playerPosition.y - loc.position.y;
        return dx * dx + dy * dy <= loc.dockingRadius * loc.dockingRadius;
      })
      .map((l) => l.id);

    this.session = {
      ...this.session,
      currentSystem: this.system,
      playerPosition,
      playerVelocity,
      nearbyLocations,
    };
  }

  // ── Render data ───────────────────────────────────────────────────────────

  /**
   * Build the render payload the GameRenderer consumes to draw the solar
   * system map. Converts world-space km positions to screen-space pixels
   * centred on the player's ship.
   */
  buildRenderData(width: number, height: number): SolarSystemRenderData {
    const { playerPosition, zoomLevel } = this.session;
    const scale = (1 / KM_PER_PX_BASE) * zoomLevel;
    const cx = width / 2;
    const cy = height / 2;

    const toScreen = (worldX: number, worldY: number) => ({
      screenX: cx + (worldX - playerPosition.x) * scale,
      screenY: cy + (worldY - playerPosition.y) * scale,
    });

    const bodies: SolarSystemBodyRenderDatum[] = this.system.celestialBodies.map((b) => {
      const { screenX, screenY } = toScreen(b.position.x, b.position.y);
      const screenRadius = Math.max(
        2,
        (b.radius / KM_PER_PX_BASE) * zoomLevel,
      );
      return {
        id: b.id,
        name: b.name,
        type: b.type,
        screenX,
        screenY,
        screenRadius,
        color: b.color,
        isPrimaryGravitySource: b.isPrimaryGravitySource,
      };
    });

    const docked = this.session.dockedLocationId;
    const nearby = new Set(this.session.nearbyLocations);

    const locations: SolarSystemLocationRenderDatum[] = this.system.locations.map((loc) => {
      const { screenX, screenY } = toScreen(loc.position.x, loc.position.y);
      return {
        id: loc.id,
        name: loc.name,
        screenX,
        screenY,
        factionId: this.system.currentFactionControl[loc.id] ?? loc.controllingFaction,
        isDocked: loc.id === docked,
        isNearby: nearby.has(loc.id),
      };
    });

    const dockedLoc = docked
      ? this.system.locations.find((l) => l.id === docked)
      : null;

    const { screenX: playerScreenX, screenY: playerScreenY } = toScreen(
      playerPosition.x,
      playerPosition.y,
    );

    return {
      systemName: this.system.seed.name,
      playerScreenX,
      playerScreenY,
      playerHeading: this.session.playerHeading,
      playerIsDocked: !!docked,
      dockedLocationName: dockedLoc?.name ?? null,
      bodies,
      locations,
      zoomLevel,
    };
  }
}

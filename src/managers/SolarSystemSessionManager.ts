/**
 * SolarSystemSessionManager — runtime orchestrator for the solar system exploration mode.
 *
 * Owns and maintains:
 *  - SolarSystemSessionState (player position, velocity, heading, zoom, docking status, nearby locations)
 *  - CapitalShipState (ship health, shields, weapons, targeting state)
 *  - Integration with subsystems: gravity, docking, gates, combat
 *
 * No Pixi dependency. Coordinates pure-function subsystems and state mutations.
 */

import type {
  SolarSystemSessionState,
  SolarSystemState,
  Location,
  CelestialBody,
} from "../types/solarsystem";
import type { CapitalShipState, CapitalShipBlueprint } from "../types/capital-ship";
import type { TargetingState } from "../systems/combat/types";
import { ShipControlManager, type ShipControlConfig } from "../game/solarsystem/ShipControlManager";
import type { InputState } from "../types/index";

export const DEFAULT_SHIP_CONTROL_CONFIG: ShipControlConfig = {
  hullMass: 5000,
  thrusterPower: 15000,  // m/s² — decelerates from max speed in < 1 s
  strafePower: 10000,
  turnRateRadPerS: Math.PI,  // 180° per second
  maxSpeedMs: 10000,         // 10 km/s; gravity stays well below this everywhere
};

export class SolarSystemSessionManager {
  private sessionState: SolarSystemSessionState;
  private shipState: CapitalShipState;
  private targetingState: TargetingState;
  private _lastThrustActive = false;

  constructor(system: SolarSystemState, blueprint: CapitalShipBlueprint) {
    this.sessionState = this.initializeSessionState(system);
    this.shipState = this.initializeShipState(blueprint);
    this.targetingState = {
      allLocks: [],
      focusedLockId: undefined,
      lastTabCycleMs: 0,
      lastClickLockMs: 0,
    };
  }

  private initializeSessionState(system: SolarSystemState): SolarSystemSessionState {
    const primaryBody = system.celestialBodies.find(b => b.isPrimaryGravitySource);
    if (!primaryBody) {
      throw new Error("No primary gravity source found in system");
    }

    const firstPlanet = system.celestialBodies.find(b => !b.isPrimaryGravitySource);
    let playerPosition: { x: number; y: number };
    let playerVelocity: { x: number; y: number };

    if (firstPlanet) {
      // Start 50 km further from the star than the planet, in the same direction
      const px = firstPlanet.position.x;
      const py = firstPlanet.position.y;
      const dist = Math.hypot(px, py) || 300;
      const orbitDist = dist + 50;
      const scale = orbitDist / dist;
      playerPosition = { x: px * scale, y: py * scale };

      // Approximate circular orbital velocity: v = sqrt(grav × r² / orbitDist × 1000)
      // positions in km, velocity in m/s → factor of 1000 converts km→m
      const grav = primaryBody.gravityStrength ?? 0;
      const r = primaryBody.radius;
      const v = grav > 0 ? Math.sqrt((grav * r * r * 1000) / orbitDist) : 0;
      // Tangential (counterclockwise in math coords): perpendicular to radial
      playerVelocity = { x: -(py / dist) * v, y: (px / dist) * v };
    } else {
      playerPosition = { x: 0, y: 400 };
      playerVelocity = { x: 0, y: 0 };
    }

    return {
      currentSystem: system,
      primaryGravitySourceId: primaryBody.id,
      playerPosition,
      playerVelocity,
      playerHeading: 0,
      zoomLevel: 1.0,
      dockedLocationId: null,
      nearbyLocations: [],
      discoveredLocations: new Set(),
      solarCredits: 100_000,
      moduleInventory: new Map(),
      carriedItems: new Map(),
      gameTimeMs: 0,
    };
  }

  private initializeShipState(blueprint: CapitalShipBlueprint): CapitalShipState {
    return {
      blueprintId: blueprint.id,
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      heading: 0,
      health: 100,
      maxHealth: 100,
      shieldsFront: 100,
      shieldsRear: 100,
      weapons: [],
      isInCombat: false,
      targetShipId: null,
      lastDamagedAt: 0,
    };
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  getSessionState(): SolarSystemSessionState {
    return this.sessionState;
  }

  getShipState(): CapitalShipState {
    return this.shipState;
  }

  getTargetingState(): TargetingState {
    return this.targetingState;
  }

  getCurrentSystem(): SolarSystemState {
    return this.sessionState.currentSystem;
  }

  getPrimaryGravitySource(): CelestialBody | null {
    return (
      this.sessionState.currentSystem.celestialBodies.find(
        b => b.id === this.sessionState.primaryGravitySourceId,
      ) || null
    );
  }

  getNearbyLocations(): Location[] {
    return this.sessionState.nearbyLocations
      .map(id => this.sessionState.currentSystem.locations.find(l => l.id === id))
      .filter((l): l is Location => l !== undefined);
  }

  getLastThrustActive(): boolean {
    return this._lastThrustActive;
  }

  // ── Physics Update ────────────────────────────────────────────────────

  /**
   * Update ship movement based on input and gravity.
   * Called once per frame from the solar system game loop.
   */
  updateShipPhysics(input: InputState, deltaMs: number, skipGravity = false, speedMultiplier = 1): void {
    const baseMax = DEFAULT_SHIP_CONTROL_CONFIG.maxSpeedMs ?? 10000;
    const config: ShipControlConfig = (skipGravity || speedMultiplier !== 1)
      ? { ...DEFAULT_SHIP_CONTROL_CONFIG, maxSpeedMs: baseMax * speedMultiplier }
      : DEFAULT_SHIP_CONTROL_CONFIG;
    const primaryBody = skipGravity ? null : this.getPrimaryGravitySource();

    if (!skipGravity && !primaryBody) return;

    // Convert heading degrees to radians for ShipControlManager
    const headingRadians = (this.sessionState.playerHeading * Math.PI) / 180;

    // Build ShipControlInput from InputState
    const shipControlInput = {
      thrustForward: (input as any).thrustForward ?? false,
      thrustReverse: (input as any).thrustReverse ?? false,
      turnLeft: (input as any).turnLeft ?? false,
      turnRight: (input as any).turnRight ?? false,
      strafeLeft: (input as any).strafeLeft ?? false,
      strafeRight: (input as any).strafeRight ?? false,
      mouseHeadingTarget: (input as any).mouseHeadingTarget ?? null,
    };

    // Apply ship control (WASD, mouse aiming)
    const shipResult = ShipControlManager.update(
      {
        position: this.sessionState.playerPosition,
        velocity: this.sessionState.playerVelocity,
        headingRadians,
      },
      shipControlInput,
      config,
      primaryBody,
      deltaMs,
    );

    this.sessionState.playerPosition = shipResult.position;
    this.sessionState.playerVelocity = shipResult.velocity;
    this.sessionState.playerHeading = (shipResult.headingRadians * 180) / Math.PI;
    this._lastThrustActive = shipResult.isThrustActive;

    // Sync ship state with session state (visual consistency)
    this.shipState.position = this.sessionState.playerPosition;
    this.shipState.velocity = this.sessionState.playerVelocity;
    this.shipState.heading = this.sessionState.playerHeading;
  }

  // ── Proximity Detection ────────────────────────────────────────────────

  /**
   * Check which locations are nearby (within docking range).
   * Called once per frame to update the nearby locations list.
   *
   * `Location.position` is an offset from its parent body's centre, so the
   * absolute world position is `parentBody.position + location.position`.
   */
  updateNearbyLocations(): void {
    const nearby: string[] = [];
    const bodies = this.sessionState.currentSystem.celestialBodies;
    for (const loc of this.sessionState.currentSystem.locations) {
      const parent = bodies.find((b) => b.id === loc.bodyId);
      const worldX = (parent?.position.x ?? 0) + loc.position.x;
      const worldY = (parent?.position.y ?? 0) + loc.position.y;
      const distance = Math.hypot(
        this.sessionState.playerPosition.x - worldX,
        this.sessionState.playerPosition.y - worldY,
      );
      if (distance <= loc.dockingRadius) {
        nearby.push(loc.id);
        this.sessionState.discoveredLocations.add(loc.id);
      }
    }
    this.sessionState.nearbyLocations = nearby;
  }

  /**
   * Returns the absolute world position of a location (parent body offset
   * plus the location's local position). Returns the local position if the
   * parent body is unknown.
   */
  getLocationWorldPosition(loc: Location): { x: number; y: number } {
    const parent = this.sessionState.currentSystem.celestialBodies.find(
      (b) => b.id === loc.bodyId,
    );
    return {
      x: (parent?.position.x ?? 0) + loc.position.x,
      y: (parent?.position.y ?? 0) + loc.position.y,
    };
  }

  // ── Docking ──────────────────────────────────────────────────────────

  dock(locationId: string): boolean {
    if (this.sessionState.dockedLocationId) return false; // Already docked
    if (!this.sessionState.nearbyLocations.includes(locationId)) return false; // Not in range

    this.sessionState.dockedLocationId = locationId;
    return true;
  }

  undock(): void {
    this.sessionState.dockedLocationId = null;
  }

  isDocked(): boolean {
    return this.sessionState.dockedLocationId !== null;
  }

  getDockedLocation(): Location | null {
    if (!this.sessionState.dockedLocationId) return null;
    return (
      this.sessionState.currentSystem.locations.find(
        l => l.id === this.sessionState.dockedLocationId,
      ) || null
    );
  }

  // ── Zoom ─────────────────────────────────────────────────────────────

  setZoomLevel(level: number): void {
    this.sessionState.zoomLevel = Math.max(0.5, Math.min(20.0, level));
  }

  adjustZoom(delta: number): void {
    this.setZoomLevel(this.sessionState.zoomLevel + delta);
  }

  // ── System Transitions ───────────────────────────────────────────────

  /**
   * Change to a different solar system (via gate jump).
   * Updates the current system and resets nearby locations.
   */
  switchSystem(newSystem: SolarSystemState): void {
    const primaryBody = newSystem.celestialBodies.find(b => b.isPrimaryGravitySource);
    if (!primaryBody) {
      throw new Error("Destination system has no primary gravity source");
    }

    this.sessionState.currentSystem = newSystem;
    this.sessionState.primaryGravitySourceId = primaryBody.id;
    this.sessionState.nearbyLocations = [];
    this.sessionState.dockedLocationId = null;
  }

  // ── Targeting ────────────────────────────────────────────────────────

  setTargetingState(state: TargetingState): void {
    this.targetingState = state;
  }
}

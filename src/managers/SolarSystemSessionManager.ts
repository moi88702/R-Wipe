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
import { GravitySystem } from "../game/solarsystem/GravitySystem";
import type { InputState } from "../types/index";

export const DEFAULT_SHIP_CONTROL_CONFIG: ShipControlConfig = {
  hullMass: 5000,
  thrusterPower: 100,
  strafePower: 75,
  turnRateRadPerS: Math.PI / 2, // 90 degrees per second
  maxSpeedMs: 500,
};

export class SolarSystemSessionManager {
  private sessionState: SolarSystemSessionState;
  private shipState: CapitalShipState;
  private targetingState: TargetingState;

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

    return {
      currentSystem: system,
      primaryGravitySourceId: primaryBody.id,
      playerPosition: { x: 0, y: 1000 }, // Start in orbit around primary
      playerVelocity: { x: 100, y: 0 }, // Some initial velocity
      playerHeading: 0,
      zoomLevel: 1.0,
      dockedLocationId: null,
      nearbyLocations: [],
      discoveredLocations: new Set(),
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

  // ── Physics Update ────────────────────────────────────────────────────

  /**
   * Update ship movement based on input and gravity.
   * Called once per frame from the solar system game loop.
   */
  updateShipPhysics(input: InputState, deltaMs: number): void {
    const config = DEFAULT_SHIP_CONTROL_CONFIG;
    const primaryBody = this.getPrimaryGravitySource();

    if (!primaryBody) return;

    // Convert heading degrees to radians for ShipControlManager
    const headingRadians = (this.sessionState.playerHeading * Math.PI) / 180;

    // Build ShipControlInput from InputState
    // Note: strafeLeft, strafeRight, mouseHeadingTarget will be wired in Phase 3
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

    // Apply gravity acceleration
    const gravityResult = GravitySystem.applyGravity(
      this.sessionState.playerPosition,
      this.sessionState.playerVelocity,
      primaryBody,
      deltaMs,
    );

    this.sessionState.playerVelocity = gravityResult;

    // Sync ship state with session state (visual consistency)
    this.shipState.position = this.sessionState.playerPosition;
    this.shipState.velocity = this.sessionState.playerVelocity;
    this.shipState.heading = this.sessionState.playerHeading;
  }

  // ── Proximity Detection ────────────────────────────────────────────────

  /**
   * Check which locations are nearby (within docking range).
   * Called once per frame to update the nearby locations list.
   */
  updateNearbyLocations(): void {
    const nearby: string[] = [];
    for (const loc of this.sessionState.currentSystem.locations) {
      const distance = Math.hypot(
        this.sessionState.playerPosition.x - loc.position.x,
        this.sessionState.playerPosition.y - loc.position.y,
      );
      if (distance <= loc.dockingRadius) {
        nearby.push(loc.id);
        this.sessionState.discoveredLocations.add(loc.id);
      }
    }
    this.sessionState.nearbyLocations = nearby;
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
    this.sessionState.zoomLevel = Math.max(0.5, Math.min(3.0, level));
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

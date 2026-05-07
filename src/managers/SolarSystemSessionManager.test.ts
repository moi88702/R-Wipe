/**
 * Integration tests for SolarSystemSessionManager
 *
 * Coverage strategy (integration-first TDD)
 * ─────────────────────────────────────────
 * SolarSystemSessionManager orchestrates session state mutations and subsystem
 * updates (physics, docking, proximity). Tests verify observable outcomes:
 * position, velocity, heading, docking state, nearby locations.
 *
 * Pure-function subsystems (ShipControlManager, GravitySystem) run for real,
 * not mocked, ensuring integration works end-to-end.
 *
 * Test groups
 * ───────────
 *   Session initialization
 *     1. Creates valid session state with player at starting position
 *     2. Initializes ship state with max health and shields
 *     3. Identifies primary gravity source
 *
 *   Physics updates (WASD movement, gravity)
 *     4. W key (thrust forward) increases velocity in heading direction
 *     5. S key (thrust reverse) decreases velocity
 *     6. A/D keys rotate the ship
 *     7. Gravity pulls ship toward primary body
 *     8. Velocity capped at maxSpeed
 *
 *   Docking
 *     9. dock() succeeds when location is nearby
 *    10. dock() fails when already docked
 *    11. dock() fails when location not in range
 *    12. undock() clears docked state
 *    13. isDocked() returns correct state
 *
 *   Proximity detection
 *    14. updateNearbyLocations() finds locations within dockingRadius
 *    15. nearbyLocations populated from session state
 *    16. discoveredLocations accumulate over time
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SolarSystemSessionManager } from "./SolarSystemSessionManager";
import type {
  SolarSystemState,
  CelestialBody,
  Location,
} from "../types/solarsystem";
import type { CapitalShipBlueprint } from "../types/capital-ship";
import type { InputState } from "../types/index";

function createTestSystem(): SolarSystemState {
  const star: CelestialBody = {
    id: "star-sol",
    name: "Sol",
    position: { x: 0, y: 0 },
    radius: 100,
    color: { r: 255, g: 200, b: 0 },
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
    gravityStrength: 9.81,
  };

  const station: Location = {
    id: "station-1",
    name: "Test Station",
    position: { x: 100, y: 0 },
    dockingRadius: 50,
    faction: "neutral",
    type: "station",
  };

  return {
    id: "test-system",
    name: "Test System",
    seed: 12345,
    celestialBodies: [star],
    locations: [station],
    initialFactionAssignments: {},
    currentFactionControl: {},
    stateChangeLog: { entries: [] },
    lastUpdatedAt: Date.now(),
  };
}

function createTestBlueprint(): CapitalShipBlueprint {
  return {
    id: "test-blueprint",
    name: "Test Ship",
    hullId: "test-hull",
    installedUpgrades: {},
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
}

function createInputState(overrides?: Partial<InputState>): InputState {
  return {
    moveUp: false,
    moveDown: false,
    moveLeft: false,
    moveRight: false,
    fire: false,
    bomb: false,
    pause: false,
    menuConfirm: false,
    menuBack: false,
    abilityV: false,
    abilityC: false,
    abilityX: false,
    abilityZ: false,
    ...overrides,
  };
}

describe("SolarSystemSessionManager", () => {
  let manager: SolarSystemSessionManager;

  beforeEach(() => {
    const system = createTestSystem();
    const blueprint = createTestBlueprint();
    manager = new SolarSystemSessionManager(system, blueprint);
  });

  describe("Session initialization", () => {
    it("creates valid session state with player at starting position", () => {
      const state = manager.getSessionState();
      expect(state.playerPosition).toEqual({ x: 0, y: 400 });
      expect(state.nearbyLocations).toEqual([]);
      expect(state.dockedLocationId).toBeNull();
    });

    it("initializes ship state with max health and shields", () => {
      const ship = manager.getShipState();
      expect(ship.health).toBe(100);
      expect(ship.maxHealth).toBe(100);
      expect(ship.shieldsFront).toBe(100);
      expect(ship.shieldsRear).toBe(100);
    });

    it("identifies primary gravity source", () => {
      const primary = manager.getPrimaryGravitySource();
      expect(primary).not.toBeNull();
      expect(primary?.id).toBe("star-sol");
      expect(primary?.isPrimaryGravitySource).toBe(true);
    });
  });

  describe("Physics updates", () => {
    it("thrust forward increases velocity in heading direction", () => {
      const before = manager.getSessionState().playerVelocity;
      const input = createInputState({ thrustForward: true });
      manager.updateShipPhysics(input, 16);
      const after = manager.getSessionState().playerVelocity;

      // Velocity should increase when thrusting
      expect(Math.hypot(after.x, after.y)).toBeGreaterThan(
        Math.hypot(before.x, before.y),
      );
    });

    it("ship heading rotates with A/D keys", () => {
      const beforeHeading = manager.getSessionState().playerHeading;
      const input = createInputState({ turnRight: true });
      manager.updateShipPhysics(input, 16);
      const afterHeading = manager.getSessionState().playerHeading;

      // Heading should change (increase when turning right)
      expect(afterHeading).not.toBe(beforeHeading);
    });

    it("gravity pulls ship toward primary body", () => {
      const input = createInputState({ thrustForward: false });
      const before = manager.getSessionState().playerVelocity;

      // Apply gravity without thrust; ship should develop downward velocity
      manager.updateShipPhysics(input, 100);
      const after = manager.getSessionState().playerVelocity;

      // Since gravity pulls toward the star at origin, y-velocity should become more negative
      expect(after.y).toBeLessThan(before.y);
    });

    it("velocity is capped at maxSpeed", () => {
      const input = createInputState({ thrustForward: true });

      // Thrust many times to try to exceed max speed
      for (let i = 0; i < 100; i++) {
        manager.updateShipPhysics(input, 16);
      }

      const velocity = manager.getSessionState().playerVelocity;
      const speed = Math.hypot(velocity.x, velocity.y);
      expect(speed).toBeLessThanOrEqual(30000); // maxSpeedMs from config
    });
  });

  describe("Docking", () => {
    it("dock() succeeds when location is nearby", () => {
      const session = manager.getSessionState();
      const station = manager.getCurrentSystem().locations[0];

      // Move player close to station
      session.playerPosition = { x: 120, y: 0 }; // Within docking radius of 50
      manager.updateNearbyLocations();

      const result = manager.dock(station!.id);
      expect(result).toBe(true);
      expect(manager.isDocked()).toBe(true);
      expect(manager.getDockedLocation()?.id).toBe("station-1");
    });

    it("dock() fails when not in range", () => {
      const station = manager.getCurrentSystem().locations[0];
      // Player stays at starting position (400 km away)

      const result = manager.dock(station!.id);
      expect(result).toBe(false);
      expect(manager.isDocked()).toBe(false);
    });

    it("dock() fails when already docked", () => {
      const station = manager.getCurrentSystem().locations[0];
      const session = manager.getSessionState();
      session.playerPosition = { x: 120, y: 0 };
      manager.updateNearbyLocations();

      // Dock successfully first time
      manager.dock(station!.id);
      expect(manager.isDocked()).toBe(true);

      // Try to dock again
      const result = manager.dock(station!.id);
      expect(result).toBe(false);
    });

    it("undock() clears docked state", () => {
      const station = manager.getCurrentSystem().locations[0];
      const session = manager.getSessionState();
      session.playerPosition = { x: 120, y: 0 };
      manager.updateNearbyLocations();

      manager.dock(station!.id);
      expect(manager.isDocked()).toBe(true);

      manager.undock();
      expect(manager.isDocked()).toBe(false);
      expect(manager.getDockedLocation()).toBeNull();
    });
  });

  describe("Proximity detection", () => {
    it("updateNearbyLocations() finds locations within dockingRadius", () => {
      const session = manager.getSessionState();
      const station = manager.getCurrentSystem().locations[0];

      // Place player at boundary of docking radius
      session.playerPosition = { x: 140, y: 0 }; // distance ~140 from origin, ~40 from station at 100
      manager.updateNearbyLocations();

      expect(session.nearbyLocations).toContain(station!.id);
    });

    it("updateNearbyLocations() finds no locations when too far", () => {
      const session = manager.getSessionState();
      session.playerPosition = { x: 1000, y: 1000 };
      manager.updateNearbyLocations();

      expect(session.nearbyLocations).toEqual([]);
    });

    it("discoveredLocations accumulate when approaching stations", () => {
      const session = manager.getSessionState();
      const station = manager.getCurrentSystem().locations[0];

      // Start with empty discovered set
      expect(session.discoveredLocations.size).toBe(0);

      // Approach station
      session.playerPosition = { x: 120, y: 0 };
      manager.updateNearbyLocations();

      expect(session.discoveredLocations.has(station!.id)).toBe(true);
    });
  });

  describe("System transitions", () => {
    it("switchSystem() updates current system and primary gravity source", () => {
      const newSystem = createTestSystem();
      newSystem.id = "new-system";
      newSystem.name = "New System";

      manager.switchSystem(newSystem);

      expect(manager.getCurrentSystem().id).toBe("new-system");
      const primary = manager.getPrimaryGravitySource();
      expect(primary?.name).toBe("Sol"); // Both systems have a star named Sol
    });

    it("switchSystem() clears nearby locations", () => {
      const session = manager.getSessionState();
      session.playerPosition = { x: 120, y: 0 };
      manager.updateNearbyLocations();

      expect(session.nearbyLocations.length).toBeGreaterThan(0);

      const newSystem = createTestSystem();
      manager.switchSystem(newSystem);

      expect(session.nearbyLocations).toEqual([]);
    });
  });

  describe("Zoom control", () => {
    it("setZoomLevel() clamps to valid range", () => {
      manager.setZoomLevel(0.001); // Below min 0.5
      expect(manager.getSessionState().zoomLevel).toBe(0.5);

      manager.setZoomLevel(100); // Above max 20.0
      expect(manager.getSessionState().zoomLevel).toBe(20.0);

      manager.setZoomLevel(1.5); // Within range
      expect(manager.getSessionState().zoomLevel).toBe(1.5);
    });

    it("adjustZoom() applies relative delta", () => {
      manager.setZoomLevel(1.0);
      manager.adjustZoom(0.5);
      expect(manager.getSessionState().zoomLevel).toBe(1.5);

      manager.adjustZoom(-0.5);
      expect(manager.getSessionState().zoomLevel).toBe(1.0);
    });
  });
});

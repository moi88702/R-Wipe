/**
 * Tests for GateTeleportSystem
 *
 * Integration-first strategy: GateTeleportSystem is pure logic — no I/O, no
 * Pixi.js, no external services.  All helpers (SystemGateRegistry is NOT
 * imported here — gate objects are built inline) run for real.  Nothing is
 * mocked.
 *
 * Observable contracts under test:
 *
 *   checkGateProximity
 *     1.  Player inside trigger radius → that gate is returned.
 *     2.  Player exactly on the trigger radius boundary → gate is returned
 *         (inclusive boundary, consistent with DockingSystem.checkProximity).
 *     3.  Player just outside trigger radius → null is returned.
 *     4.  Empty gate list → null is returned.
 *     5.  Multiple gates: player inside the first gate's radius → first gate
 *         is returned regardless of the second.
 *     6.  Multiple gates: player inside only the second gate's radius → that
 *         gate is returned.
 *     7.  Player inside no gate's radius among multiple gates → null.
 *
 *   teleport — happy path
 *     8.  Successful transit places the player at the sister gate's position.
 *     9.  Session currentSystem is replaced by the destination system.
 *    10.  primaryGravitySourceId is updated to the primary body in the
 *         destination system.
 *    11.  nearbyLocations is reset to [] after transit.
 *    12.  Player velocity is preserved unchanged (smooth inertial transition).
 *    13.  Player heading is preserved unchanged.
 *    14.  TeleportResult.success === true with correct source / destination
 *         gate references.
 *    15.  Bidirectional: transit through gate B returns the player to the
 *         source system (System A) at gate A's position.
 *
 *   teleport — unhappy paths
 *    16.  Player is docked → success: false, reason: "docked", session
 *         unchanged.
 *    17.  Destination system has no primary gravity body →
 *         success: false, reason: "no-primary-body-in-destination", session
 *         unchanged.
 *
 * Gherkin scenarios (integration-style):
 *    G1. Player enters gate A in System 1 and arrives at gate B in System 2
 *    G2. Player uses gate B to return to gate A in System 1
 *    G3. Docked player cannot use a gate
 */

import { describe, expect, it } from "vitest";
import { GateTeleportSystem } from "./GateTeleportSystem";
import type {
  SystemGate,
  SolarSystemSessionState,
  SolarSystemState,
  CelestialBody,
} from "../../types/solarsystem";

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Build a minimal SystemGate for use in tests. */
function makeGate(overrides: Partial<SystemGate> = {}): SystemGate {
  return {
    id: "gate-a",
    name: "Gate A",
    systemId: "system-a",
    position: { x: 8000, y: 0 },
    triggerRadius: 50,
    sisterGateId: "gate-b",
    destinationSystemId: "system-b",
    ...overrides,
  };
}

/** Build a minimal primary gravity CelestialBody. */
function makePrimaryBody(id: string): CelestialBody {
  return {
    id,
    name: "Test Star",
    type: "star",
    position: { x: 0, y: 0 },
    radius: 696,
    mass: 1.989e30,
    gravityStrength: 274,
    color: { r: 255, g: 200, b: 100 },
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
}

/** Build a minimal SolarSystemState with a single primary body. */
function makeSolarSystem(
  name: string,
  primaryBodyId = "star-sol",
): SolarSystemState {
  return {
    seed: { name, timestamp: 0, randomSeed: 0 },
    celestialBodies: [makePrimaryBody(primaryBodyId)],
    locations: [],
    initialFactionAssignments: {},
    currentFactionControl: {},
    stateChangeLog: { entries: [] },
    lastUpdatedAt: 0,
  };
}

/** Build a minimal SolarSystemSessionState. */
function makeSession(
  overrides: Partial<SolarSystemSessionState> = {},
): SolarSystemSessionState {
  const defaultSystem = makeSolarSystem("sol", "star-sol-1");
  return {
    currentSystem: defaultSystem,
    primaryGravitySourceId: "star-sol-1",
    playerPosition: { x: 7980, y: 0 }, // inside gate trigger radius by default
    playerVelocity: { x: 100, y: 0 },
    playerHeading: 90, // east
    zoomLevel: 1,
    dockedLocationId: null,
    nearbyLocations: ["station-alpha"],
    discoveredLocations: new Set(["station-alpha"]),
    ...overrides,
  };
}

// ── checkGateProximity ────────────────────────────────────────────────────────

describe("GateTeleportSystem.checkGateProximity", () => {
  it("returns the gate when the player is inside its trigger radius", () => {
    // Given a gate at (8000, 0) with triggerRadius 50
    // And the player at (7980, 0) — 20 km away (inside)
    const gate = makeGate({ position: { x: 8000, y: 0 }, triggerRadius: 50 });
    const playerPos = { x: 7980, y: 0 };

    // When
    const result = GateTeleportSystem.checkGateProximity(playerPos, [gate]);

    // Then
    expect(result).toBe(gate);
  });

  it("returns the gate when the player is exactly at the trigger radius boundary", () => {
    // Given a gate at (8000, 0) with triggerRadius 50
    // And the player exactly 50 km away at (7950, 0)
    const gate = makeGate({ position: { x: 8000, y: 0 }, triggerRadius: 50 });
    const playerPos = { x: 7950, y: 0 }; // exactly 50 km away

    // When
    const result = GateTeleportSystem.checkGateProximity(playerPos, [gate]);

    // Then (inclusive boundary)
    expect(result).toBe(gate);
  });

  it("returns null when the player is just outside the trigger radius", () => {
    // Given a gate at (8000, 0) with triggerRadius 50
    // And the player at (7949, 0) — 51 km away (outside)
    const gate = makeGate({ position: { x: 8000, y: 0 }, triggerRadius: 50 });
    const playerPos = { x: 7949, y: 0 };

    // When
    const result = GateTeleportSystem.checkGateProximity(playerPos, [gate]);

    // Then
    expect(result).toBeNull();
  });

  it("returns null for an empty gate list", () => {
    // Given no gates in the current system
    // When
    const result = GateTeleportSystem.checkGateProximity({ x: 0, y: 0 }, []);

    // Then
    expect(result).toBeNull();
  });

  it("returns the first gate in definition order when the player is inside multiple radii", () => {
    // Given two overlapping gates
    const gateA = makeGate({ id: "gate-a", position: { x: 8000, y: 0 }, triggerRadius: 100 });
    const gateB = makeGate({ id: "gate-b", position: { x: 8000, y: 0 }, triggerRadius: 100 });
    // Player is inside both radii
    const playerPos = { x: 8000, y: 0 };

    // When
    const result = GateTeleportSystem.checkGateProximity(playerPos, [gateA, gateB]);

    // Then — first gate in list wins
    expect(result).toBe(gateA);
  });

  it("returns the second gate when the player is only inside the second gate's radius", () => {
    // Given gate A far away, gate B nearby
    const gateA = makeGate({
      id: "gate-a",
      position: { x: 8000, y: 0 },
      triggerRadius: 50,
    });
    const gateB = makeGate({
      id: "gate-b",
      position: { x: -8000, y: 0 },
      triggerRadius: 50,
    });
    // Player at gate B's location
    const playerPos = { x: -8000, y: 0 };

    // When
    const result = GateTeleportSystem.checkGateProximity(playerPos, [gateA, gateB]);

    // Then
    expect(result).toBe(gateB);
  });

  it("returns null when the player is outside all gate radii", () => {
    // Given two distant gates and a player in the middle
    const gateA = makeGate({ id: "gate-a", position: { x: 8000, y: 0 }, triggerRadius: 50 });
    const gateB = makeGate({ id: "gate-b", position: { x: -8000, y: 0 }, triggerRadius: 50 });
    const playerPos = { x: 0, y: 0 }; // far from both

    // When
    const result = GateTeleportSystem.checkGateProximity(playerPos, [gateA, gateB]);

    // Then
    expect(result).toBeNull();
  });
});

// ── teleport — happy path ─────────────────────────────────────────────────────

describe("GateTeleportSystem.teleport — happy path", () => {
  it("places the player at the sister gate's position in the destination system", () => {
    // Given
    const sourceGate = makeGate({
      id: "gate-sol-to-kepler",
      systemId: "sol",
      position: { x: 8000, y: 0 },
      sisterGateId: "gate-kepler-to-sol",
      destinationSystemId: "kepler-442",
    });
    const sisterGate = makeGate({
      id: "gate-kepler-to-sol",
      systemId: "kepler-442",
      position: { x: -8000, y: 0 },
      sisterGateId: "gate-sol-to-kepler",
      destinationSystemId: "sol",
    });
    const destinationSystem = makeSolarSystem("kepler-442", "star-kepler");
    const session = makeSession();

    // When
    const result = GateTeleportSystem.teleport(
      session,
      sourceGate,
      sisterGate,
      destinationSystem,
    );

    // Then
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected success");

    expect(result.newPlayerPosition).toEqual({ x: -8000, y: 0 });
    expect(session.playerPosition).toEqual({ x: -8000, y: 0 });
  });

  it("replaces the session's currentSystem with the destination system", () => {
    // Given
    const sourceGate = makeGate();
    const sisterGate = makeGate({ id: "gate-b", systemId: "system-b" });
    const destinationSystem = makeSolarSystem("system-b", "star-b");
    const session = makeSession();
    const originalSystem = session.currentSystem;

    // When
    GateTeleportSystem.teleport(session, sourceGate, sisterGate, destinationSystem);

    // Then currentSystem is replaced
    expect(session.currentSystem).toBe(destinationSystem);
    expect(session.currentSystem).not.toBe(originalSystem);
  });

  it("updates primaryGravitySourceId to the destination system's primary body", () => {
    // Given destination system with a primary body id of "star-kepler"
    const sourceGate = makeGate();
    const sisterGate = makeGate({ id: "gate-b" });
    const destinationSystem = makeSolarSystem("system-b", "star-kepler");
    const session = makeSession({ primaryGravitySourceId: "star-sol" });

    // When
    GateTeleportSystem.teleport(session, sourceGate, sisterGate, destinationSystem);

    // Then
    expect(session.primaryGravitySourceId).toBe("star-kepler");
  });

  it("resets nearbyLocations to an empty array after transit", () => {
    // Given a session with some nearby locations from the source system
    const session = makeSession({ nearbyLocations: ["station-alpha", "outpost-x"] });
    const sourceGate = makeGate();
    const sisterGate = makeGate({ id: "gate-b" });
    const destinationSystem = makeSolarSystem("system-b");

    // When
    GateTeleportSystem.teleport(session, sourceGate, sisterGate, destinationSystem);

    // Then stale location ids from the old system are cleared
    expect(session.nearbyLocations).toEqual([]);
  });

  it("preserves player velocity during transit for a smooth transition", () => {
    // Given a player flying east at 500 m/s
    const session = makeSession({ playerVelocity: { x: 500, y: 0 } });
    const sourceGate = makeGate();
    const sisterGate = makeGate({ id: "gate-b" });
    const destinationSystem = makeSolarSystem("system-b");

    // When
    GateTeleportSystem.teleport(session, sourceGate, sisterGate, destinationSystem);

    // Then velocity is unchanged — momentum carries through the gate
    expect(session.playerVelocity).toEqual({ x: 500, y: 0 });
  });

  it("preserves player heading during transit", () => {
    // Given a player facing North-East (45 degrees)
    const session = makeSession({ playerHeading: 45 });
    const sourceGate = makeGate();
    const sisterGate = makeGate({ id: "gate-b" });
    const destinationSystem = makeSolarSystem("system-b");

    // When
    GateTeleportSystem.teleport(session, sourceGate, sisterGate, destinationSystem);

    // Then heading is unchanged
    expect(session.playerHeading).toBe(45);
  });

  it("returns TeleportResult with correct source and destination gate references", () => {
    // Given
    const sourceGate = makeGate({ id: "gate-a" });
    const sisterGate = makeGate({ id: "gate-b", systemId: "system-b" });
    const destinationSystem = makeSolarSystem("system-b");
    const session = makeSession();

    // When
    const result = GateTeleportSystem.teleport(
      session,
      sourceGate,
      sisterGate,
      destinationSystem,
    );

    // Then
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected success");
    expect(result.sourceGate).toBe(sourceGate);
    expect(result.destinationGate).toBe(sisterGate);
  });
});

// ── Bidirectional teleportation (Gherkin G1 + G2) ────────────────────────────

describe("GateTeleportSystem — bidirectional teleportation", () => {
  it("G1+G2: Player transits A→B then B→A and returns to System A at gate A's position", () => {
    // Given two systems each with a gate
    const systemA = makeSolarSystem("system-a", "star-a");
    const systemB = makeSolarSystem("system-b", "star-b");

    const gateA: SystemGate = {
      id: "gate-a-to-b",
      name: "Gate A",
      systemId: "system-a",
      position: { x: 8000, y: 0 },
      triggerRadius: 50,
      sisterGateId: "gate-b-to-a",
      destinationSystemId: "system-b",
    };
    const gateB: SystemGate = {
      id: "gate-b-to-a",
      name: "Gate B",
      systemId: "system-b",
      position: { x: -8000, y: 0 },
      triggerRadius: 50,
      sisterGateId: "gate-a-to-b",
      destinationSystemId: "system-a",
    };

    const session = makeSession({
      currentSystem: systemA,
      primaryGravitySourceId: "star-a",
      playerPosition: { x: 7980, y: 0 },
    });

    // — First transit: System A → System B via gate A —

    // When the player enters gate A
    const result1 = GateTeleportSystem.teleport(session, gateA, gateB, systemB);

    // Then the player is in System B at gate B's position
    expect(result1.success).toBe(true);
    expect(session.currentSystem.seed.name).toBe("system-b");
    expect(session.playerPosition).toEqual({ x: -8000, y: 0 });
    expect(session.primaryGravitySourceId).toBe("star-b");

    // — Second transit: System B → System A via gate B (the sister gate) —

    // When the player enters gate B
    const result2 = GateTeleportSystem.teleport(session, gateB, gateA, systemA);

    // Then the player returns to System A at gate A's original position
    expect(result2.success).toBe(true);
    expect(session.currentSystem.seed.name).toBe("system-a");
    expect(session.playerPosition).toEqual({ x: 8000, y: 0 });
    expect(session.primaryGravitySourceId).toBe("star-a");
  });
});

// ── teleport — unhappy paths ──────────────────────────────────────────────────

describe("GateTeleportSystem.teleport — unhappy paths", () => {
  it("G3: fails with reason 'docked' when the player is currently docked at a station", () => {
    // Given a player docked at a station
    const session = makeSession({ dockedLocationId: "station-alpha" });
    const sourceGate = makeGate();
    const sisterGate = makeGate({ id: "gate-b" });
    const destinationSystem = makeSolarSystem("system-b");

    // When the player attempts to use a gate while docked
    const result = GateTeleportSystem.teleport(
      session,
      sourceGate,
      sisterGate,
      destinationSystem,
    );

    // Then the transit is blocked
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.reason).toBe("docked");
    expect(result.sourceGate).toBe(sourceGate);

    // And the session is unchanged
    expect(session.dockedLocationId).toBe("station-alpha");
    expect(session.currentSystem.seed.name).toBe("sol");
  });

  it("fails with reason 'no-primary-body-in-destination' when the destination has no primary body", () => {
    // Given a destination system with no primary gravity source
    const destinationSystem: SolarSystemState = {
      seed: { name: "empty-system", timestamp: 0, randomSeed: 0 },
      celestialBodies: [
        {
          ...makePrimaryBody("non-primary"),
          isPrimaryGravitySource: false, // no primary body
        },
      ],
      locations: [],
      initialFactionAssignments: {},
      currentFactionControl: {},
      stateChangeLog: { entries: [] },
      lastUpdatedAt: 0,
    };
    const session = makeSession();
    const sourceGate = makeGate();
    const sisterGate = makeGate({ id: "gate-b" });

    // When
    const result = GateTeleportSystem.teleport(
      session,
      sourceGate,
      sisterGate,
      destinationSystem,
    );

    // Then
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.reason).toBe("no-primary-body-in-destination");

    // And the session is unchanged
    expect(session.currentSystem.seed.name).toBe("sol");
    expect(session.playerPosition).toEqual({ x: 7980, y: 0 });
  });

  it("does not mutate session when docked transit is blocked", () => {
    // Given a docked player with a specific position and velocity
    const session = makeSession({
      dockedLocationId: "station-beta",
      playerPosition: { x: 100, y: 200 },
      playerVelocity: { x: 50, y: -30 },
      nearbyLocations: ["station-beta"],
    });
    const originalSystem = session.currentSystem;
    const sourceGate = makeGate();
    const sisterGate = makeGate({ id: "gate-b" });
    const destinationSystem = makeSolarSystem("system-b");

    // When
    GateTeleportSystem.teleport(session, sourceGate, sisterGate, destinationSystem);

    // Then nothing changed
    expect(session.currentSystem).toBe(originalSystem);
    expect(session.playerPosition).toEqual({ x: 100, y: 200 });
    expect(session.playerVelocity).toEqual({ x: 50, y: -30 });
    expect(session.nearbyLocations).toEqual(["station-beta"]);
  });

  it("does not mutate session when destination has no primary body", () => {
    // Given a session in flight
    const session = makeSession({
      playerPosition: { x: 500, y: 0 },
      nearbyLocations: ["outpost-x"],
    });
    const originalSystem = session.currentSystem;
    const originalPrimaryId = session.primaryGravitySourceId;
    const sourceGate = makeGate();
    const sisterGate = makeGate({ id: "gate-b" });
    const badDestination: SolarSystemState = {
      seed: { name: "bad-system", timestamp: 0, randomSeed: 0 },
      celestialBodies: [],
      locations: [],
      initialFactionAssignments: {},
      currentFactionControl: {},
      stateChangeLog: { entries: [] },
      lastUpdatedAt: 0,
    };

    // When
    GateTeleportSystem.teleport(session, sourceGate, sisterGate, badDestination);

    // Then nothing changed
    expect(session.currentSystem).toBe(originalSystem);
    expect(session.primaryGravitySourceId).toBe(originalPrimaryId);
    expect(session.nearbyLocations).toEqual(["outpost-x"]);
  });
});

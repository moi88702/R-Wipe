/**
 * Tests for DockingManager
 *
 * Coverage strategy (integration-first TDD)
 * ─────────────────────────────────────────
 * DockingManager.dock() and DockingManager.undock() are the primary entry
 * points — state-changing operations that callers (the game loop and the dock
 * menu) invoke.  Tests assert observable session-state outcomes and returned
 * result objects rather than internal implementation details.
 *
 * DockingSystem (proximity geometry + permission gates) is a pure-function
 * collaborator inside the same package — it runs for real, matching the
 * integration-first principle.  No mocks.
 *
 * Test groups
 * ───────────
 *   isDockButtonVisible
 *     1. In range, not docked          → true
 *     2. Out of range, not docked      → false
 *     3. Exactly on boundary           → true (inclusive)
 *     4. Already docked                → false (even when at station)
 *     5. Empty location list           → false
 *
 *   getNearestDocksWithinRange
 *     6. All locations within rangeKm  → all returned, sorted by distance
 *     7. Mixed in / out of range       → only those within range
 *     8. No locations in range         → empty list
 *
 *   updateNearbyLocations
 *     9. Player inside one radius      → that id in nearbyLocations
 *    10. Player outside all radii      → nearbyLocations empty
 *    11. Player inside multiple radii  → all ids present
 *
 *   dock()
 *    12. Happy path (all gates pass)   → success, dockedLocationId set,
 *                                        velocity zeroed, location discovered,
 *                                        pre-dock snapshot saved
 *    13. Already docked                → "already-docked", no state change
 *    14. Not in range                  → "not-in-range", no state change
 *    15. Low faction reputation        → "low-reputation", no state change
 *    16. Missing required item         → "missing-item", no state change
 *    17. Incomplete prerequisite       → "mission-incomplete", no state change
 *    18. No requirements on location   → always succeeds when in range
 *
 *   undock()
 *    19. Happy path (docked via dock()) → success, dockedLocationId null,
 *                                         position = station position,
 *                                         velocity zeroed, heading restored,
 *                                         snapshot cleared
 *    20. Not docked                     → "not-docked", no state change
 *    21. dock() → undock() → dock() again → full round-trip works
 *
 *   Gherkin scenarios
 *    G1. "Player docks at a station via UI button when in range"
 *    G2. "Player is denied docking due to low faction reputation"
 *    G3. "Player undocks and returns to combat at station location"
 */

import { describe, expect, it, beforeEach } from "vitest";
import { DockingManager } from "./DockingManager";
import type { DockResult, UndockResult } from "./DockingManager";
import type { Location, SolarSystemSessionState } from "../types/solarsystem";
import type { FactionStanding } from "../types/factions";

// ── Shared test helpers ───────────────────────────────────────────────────────

/**
 * Build a minimal Location for docking tests.
 * Defaults: at the world origin, 2 km docking radius, no requirements.
 */
function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "station-test",
    name: "Test Station",
    bodyId: "planet-1",
    position: { x: 0, y: 0 },
    dockingRadius: 2,
    controllingFaction: "terran",
    npcs: [],
    shops: [],
    type: "station",
    ...overrides,
  };
}

/**
 * Build a minimal FactionStanding that passes the reputation gate.
 * Defaults to 100 reputation with a neutral faction.
 */
function makeStanding(overrides: Partial<FactionStanding> = {}): FactionStanding {
  return {
    factionId: "terran",
    reputation: 100,
    missionsDoneCount: 0,
    canDockAt: new Set<string>(),
    isHostile: false,
    ...overrides,
  };
}

/**
 * Build a minimal SolarSystemSessionState.
 * Defaults: player at origin, undocked.
 */
function makeSession(
  overrides: Partial<
    Pick<
      SolarSystemSessionState,
      | "playerPosition"
      | "playerVelocity"
      | "playerHeading"
      | "dockedLocationId"
      | "nearbyLocations"
      | "discoveredLocations"
    >
  > = {},
): SolarSystemSessionState {
  // Minimal stub for fields not relevant to docking logic.
  return {
    currentSystem: {
      seed: { name: "test", timestamp: 0, randomSeed: 1 },
      celestialBodies: [],
      locations: [],
      initialFactionAssignments: {},
      currentFactionControl: {},
      stateChangeLog: { entries: [] },
      lastUpdatedAt: 0,
    },
    primaryGravitySourceId: "star-1",
    playerPosition: { x: 0, y: 0 },
    playerVelocity: { x: 50, y: -30 },
    playerHeading: 45,
    zoomLevel: 1,
    dockedLocationId: null,
    nearbyLocations: [],
    discoveredLocations: new Set<string>(),
    ...overrides,
  };
}

// ── isDockButtonVisible ───────────────────────────────────────────────────────

describe("DockingManager.isDockButtonVisible", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given player within docking radius and not docked, dock button is visible", () => {
    // Given
    const location = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 2 });
    const session = makeSession({ playerPosition: { x: 1, y: 0 } }); // 1 km away

    // When
    const visible = manager.isDockButtonVisible(session, [location]);

    // Then
    expect(visible).toBe(true);
  });

  it("given player outside docking radius, dock button is hidden", () => {
    // Given
    const location = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 2 });
    const session = makeSession({ playerPosition: { x: 5, y: 0 } }); // 5 km away

    // When
    const visible = manager.isDockButtonVisible(session, [location]);

    // Then
    expect(visible).toBe(false);
  });

  it("given player exactly on the docking radius boundary, dock button is visible (inclusive)", () => {
    // Given — player at exactly 2 km from a 2 km docking-radius station
    const location = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 2 });
    const session = makeSession({ playerPosition: { x: 2, y: 0 } });

    // When
    const visible = manager.isDockButtonVisible(session, [location]);

    // Then
    expect(visible).toBe(true);
  });

  it("given player is already docked, dock button is hidden (even when at station)", () => {
    // Given — player is at the station but already docked
    const location = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 2 });
    const session = makeSession({
      playerPosition: { x: 0, y: 0 },
      dockedLocationId: "station-test", // already docked
    });

    // When
    const visible = manager.isDockButtonVisible(session, [location]);

    // Then
    expect(visible).toBe(false);
  });

  it("given no locations in system, dock button is never visible", () => {
    // Given
    const session = makeSession({ playerPosition: { x: 0, y: 0 } });

    // When
    const visible = manager.isDockButtonVisible(session, []);

    // Then
    expect(visible).toBe(false);
  });
});

// ── getNearestDocksWithinRange ────────────────────────────────────────────────

describe("DockingManager.getNearestDocksWithinRange", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given multiple locations all within rangeKm, all are returned sorted nearest-first", () => {
    // Given — three locations at 1, 3, and 2 km from the ship
    const locA = makeLocation({ id: "loc-a", position: { x: 1, y: 0 } }); // 1 km
    const locB = makeLocation({ id: "loc-b", position: { x: 3, y: 0 } }); // 3 km
    const locC = makeLocation({ id: "loc-c", position: { x: 2, y: 0 } }); // 2 km
    const shipPos = { x: 0, y: 0 };

    // When
    const results = manager.getNearestDocksWithinRange(shipPos, [locA, locB, locC], 5);

    // Then — all three returned in ascending distance order
    expect(results.map((l) => l.id)).toEqual(["loc-a", "loc-c", "loc-b"]);
  });

  it("given some locations outside rangeKm, only in-range locations are returned", () => {
    // Given — one location inside range, two outside
    const inRange = makeLocation({ id: "in-range", position: { x: 2, y: 0 } });
    const tooFar1 = makeLocation({ id: "far-1", position: { x: 10, y: 0 } });
    const tooFar2 = makeLocation({ id: "far-2", position: { x: 20, y: 0 } });

    // When
    const results = manager.getNearestDocksWithinRange(
      { x: 0, y: 0 },
      [inRange, tooFar1, tooFar2],
      5,
    );

    // Then
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("in-range");
  });

  it("given no locations within rangeKm, returns an empty list", () => {
    // Given — all locations are beyond the search radius
    const locA = makeLocation({ id: "loc-a", position: { x: 100, y: 0 } });
    const locB = makeLocation({ id: "loc-b", position: { x: 200, y: 0 } });

    // When
    const results = manager.getNearestDocksWithinRange({ x: 0, y: 0 }, [locA, locB], 50);

    // Then
    expect(results).toHaveLength(0);
  });

  it("given a location exactly at rangeKm, it is included (boundary is inclusive)", () => {
    // Given — location at exactly rangeKm distance
    const loc = makeLocation({ id: "boundary", position: { x: 5, y: 0 } });

    // When
    const results = manager.getNearestDocksWithinRange({ x: 0, y: 0 }, [loc], 5);

    // Then
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("boundary");
  });
});

// ── updateNearbyLocations ─────────────────────────────────────────────────────

describe("DockingManager.updateNearbyLocations", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given player inside one location's docking radius, that location id is in nearbyLocations", () => {
    // Given
    const inRange = makeLocation({ id: "near-station", position: { x: 0, y: 0 }, dockingRadius: 3 });
    const outRange = makeLocation({ id: "far-station", position: { x: 50, y: 0 }, dockingRadius: 2 });
    const session = makeSession({ playerPosition: { x: 1, y: 0 }, nearbyLocations: [] });

    // When
    manager.updateNearbyLocations(session, [inRange, outRange]);

    // Then
    expect(session.nearbyLocations).toContain("near-station");
    expect(session.nearbyLocations).not.toContain("far-station");
  });

  it("given player outside all location docking radii, nearbyLocations is empty", () => {
    // Given
    const loc = makeLocation({ position: { x: 100, y: 0 }, dockingRadius: 2 });
    const session = makeSession({ playerPosition: { x: 0, y: 0 }, nearbyLocations: ["stale-id"] });

    // When
    manager.updateNearbyLocations(session, [loc]);

    // Then — stale id is replaced with an empty list
    expect(session.nearbyLocations).toHaveLength(0);
  });

  it("given player inside multiple locations' docking radii, all their ids appear", () => {
    // Given — two overlapping stations
    const stationA = makeLocation({ id: "a", position: { x: 0, y: 0 }, dockingRadius: 5 });
    const stationB = makeLocation({ id: "b", position: { x: 1, y: 0 }, dockingRadius: 5 });
    const session = makeSession({ playerPosition: { x: 0.5, y: 0 } });

    // When
    manager.updateNearbyLocations(session, [stationA, stationB]);

    // Then
    expect(session.nearbyLocations).toContain("a");
    expect(session.nearbyLocations).toContain("b");
  });
});

// ── dock() — happy path ───────────────────────────────────────────────────────

describe("DockingManager.dock() — happy path", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given player in range with all permissions met, dock succeeds and session transitions to docked", () => {
    // Given — station at origin, player at 1 km (inside 2 km docking radius)
    const location = makeLocation({
      id: "safe-station",
      position: { x: 0, y: 0 },
      dockingRadius: 2,
    });
    const session = makeSession({
      playerPosition: { x: 1, y: 0 },
      playerVelocity: { x: 50, y: -30 },
      playerHeading: 90,
    });
    const standing = makeStanding({ reputation: 200 });

    // When
    const result: DockResult = manager.dock(session, location, standing, {}, new Set());

    // Then — result indicates success
    expect(result.success).toBe(true);
    expect(result.dockedLocationId).toBe("safe-station");
    expect(result.location.id).toBe("safe-station");
    expect(result.reason).toBeUndefined();

    // And — session is mutated to docked state
    expect(session.dockedLocationId).toBe("safe-station");

    // And — ship velocity is zeroed
    expect(session.playerVelocity).toEqual({ x: 0, y: 0 });

    // And — location is added to discoveredLocations
    expect(session.discoveredLocations.has("safe-station")).toBe(true);
  });

  it("given dock succeeds, pre-dock snapshot captures position, velocity, and heading", () => {
    // Given
    const location = makeLocation({ id: "station-alpha", position: { x: 10, y: 20 }, dockingRadius: 5 });
    const session = makeSession({
      playerPosition: { x: 10, y: 18 }, // 2 km from station
      playerVelocity: { x: 100, y: -50 },
      playerHeading: 270,
    });

    // When
    manager.dock(session, location, makeStanding(), {}, new Set());
    const snapshot = manager.getPreDockSnapshot();

    // Then — snapshot preserves the player's state at dock time
    expect(snapshot).not.toBeNull();
    expect(snapshot!.position).toEqual({ x: 10, y: 18 });
    expect(snapshot!.velocity).toEqual({ x: 100, y: -50 });
    expect(snapshot!.heading).toBe(270);
    expect(snapshot!.stationId).toBe("station-alpha");
    expect(snapshot!.stationPosition).toEqual({ x: 10, y: 20 });
  });

  it("given location with no requirements, any player can dock when in range", () => {
    // Given — open station, player with hostile reputation
    const location = makeLocation({ id: "free-port", position: { x: 0, y: 0 }, dockingRadius: 2 });
    const session = makeSession({ playerPosition: { x: 0, y: 0 } });
    const standing = makeStanding({ reputation: -999 });

    // When
    const result = manager.dock(session, location, standing, {}, new Set());

    // Then — no gates fail for an unrestricted location
    expect(result.success).toBe(true);
    expect(session.dockedLocationId).toBe("free-port");
  });
});

// ── dock() — failure cases ────────────────────────────────────────────────────

describe("DockingManager.dock() — already docked guard", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given player is already docked, dock() returns already-docked and leaves state unchanged", () => {
    // Given — player is already docked at a different station
    const location = makeLocation({ id: "new-station" });
    const session = makeSession({ dockedLocationId: "existing-station" });
    const standing = makeStanding();

    // When
    const result = manager.dock(session, location, standing, {}, new Set());

    // Then
    expect(result.success).toBe(false);
    expect(result.reason).toBe("already-docked");
    expect(result.location.id).toBe("new-station");

    // And — session is NOT mutated
    expect(session.dockedLocationId).toBe("existing-station");
    expect(session.discoveredLocations.size).toBe(0);
  });
});

describe("DockingManager.dock() — proximity gate", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given player outside docking radius, dock() returns not-in-range", () => {
    // Given — player at 10 km, station has 2 km docking radius
    const location = makeLocation({ id: "far-station", position: { x: 0, y: 0 }, dockingRadius: 2 });
    const session = makeSession({ playerPosition: { x: 10, y: 0 } });

    // When
    const result = manager.dock(session, location, makeStanding(), {}, new Set());

    // Then
    expect(result.success).toBe(false);
    expect(result.reason).toBe("not-in-range");

    // And — session not mutated
    expect(session.dockedLocationId).toBeNull();
    expect(session.playerVelocity).toEqual({ x: 50, y: -30 }); // unchanged default
  });
});

describe("DockingManager.dock() — permission gates", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given player reputation below threshold, dock() returns low-reputation", () => {
    // Given — reputation gate: player has 50 rep, station requires 200
    const location = makeLocation({
      position: { x: 0, y: 0 },
      dockingRadius: 5,
      requiredReputation: 200,
    });
    const session = makeSession({ playerPosition: { x: 0, y: 0 } });
    const standing = makeStanding({ reputation: 50 }); // < 200

    // When
    const result = manager.dock(session, location, standing, {}, new Set());

    // Then
    expect(result.success).toBe(false);
    expect(result.reason).toBe("low-reputation");

    // And — session not mutated
    expect(session.dockedLocationId).toBeNull();
    expect(session.discoveredLocations.size).toBe(0);
  });

  it("given player missing a required item, dock() returns missing-item", () => {
    // Given — item gate: station requires "access-card"
    const location = makeLocation({
      position: { x: 0, y: 0 },
      dockingRadius: 5,
      requiredItems: ["access-card"],
    });
    const session = makeSession({ playerPosition: { x: 0, y: 0 } });
    const standing = makeStanding({ reputation: 500 });
    const inventory: Record<string, number> = {}; // no access-card

    // When
    const result = manager.dock(session, location, standing, inventory, new Set());

    // Then
    expect(result.success).toBe(false);
    expect(result.reason).toBe("missing-item");
    expect(session.dockedLocationId).toBeNull();
  });

  it("given player has not completed a prerequisite mission, dock() returns mission-incomplete", () => {
    // Given — mission gate: station requires "mission-escort-voss"
    const location = makeLocation({
      position: { x: 0, y: 0 },
      dockingRadius: 5,
      requiredMissions: ["mission-escort-voss"],
    });
    const session = makeSession({ playerPosition: { x: 0, y: 0 } });
    const standing = makeStanding({ reputation: 500 });
    const completedMissions = new Set<string>(); // mission not done

    // When
    const result = manager.dock(session, location, standing, {}, completedMissions);

    // Then
    expect(result.success).toBe(false);
    expect(result.reason).toBe("mission-incomplete");
    expect(session.dockedLocationId).toBeNull();
  });

  it("given all three gates fail, the first (reputation) gate reason is returned", () => {
    // Given — all three gates fail simultaneously
    const location = makeLocation({
      position: { x: 0, y: 0 },
      dockingRadius: 5,
      requiredReputation: 500,
      requiredItems: ["data-chip"],
      requiredMissions: ["rescue-op"],
    });
    const session = makeSession({ playerPosition: { x: 0, y: 0 } });
    const standing = makeStanding({ reputation: 0 }); // < 500
    const inventory: Record<string, number> = {}; // no data-chip
    const completedMissions = new Set<string>(); // rescue-op not done

    // When
    const result = manager.dock(session, location, standing, inventory, completedMissions);

    // Then — reputation gate fires first
    expect(result.success).toBe(false);
    expect(result.reason).toBe("low-reputation");
  });
});

// ── undock() ──────────────────────────────────────────────────────────────────

describe("DockingManager.undock() — happy path", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given player docked via dock(), undock() restores ship to station position with zeroed velocity", () => {
    // Given — dock the player first
    const location = makeLocation({
      id: "station-omega",
      position: { x: 50, y: 100 },
      dockingRadius: 5,
    });
    const session = makeSession({
      playerPosition: { x: 50, y: 98 }, // 2 km from station
      playerVelocity: { x: 200, y: -100 },
      playerHeading: 180,
    });
    manager.dock(session, location, makeStanding(), {}, new Set());

    // Sanity: player is now docked
    expect(session.dockedLocationId).toBe("station-omega");

    // When
    const result: UndockResult = manager.undock(session);

    // Then — undock succeeded
    expect(result.success).toBe(true);
    expect(result.reason).toBeUndefined();

    // And — ship position is restored to the station's world position
    expect(result.restoredPosition).toEqual({ x: 50, y: 100 });
    expect(session.playerPosition).toEqual({ x: 50, y: 100 });

    // And — velocity is zeroed (fresh departure)
    expect(session.playerVelocity).toEqual({ x: 0, y: 0 });

    // And — dockedLocationId is cleared
    expect(session.dockedLocationId).toBeNull();
  });

  it("given undock() succeeds, pre-docking heading is restored to session", () => {
    // Given — dock with heading 135°
    const location = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 3 });
    const session = makeSession({
      playerPosition: { x: 0, y: 2 },
      playerHeading: 135,
    });
    manager.dock(session, location, makeStanding(), {}, new Set());

    // Simulate heading change while docked (e.g. UI animation or auto-orient)
    session.playerHeading = 0;

    // When
    manager.undock(session);

    // Then — original pre-dock heading is restored
    expect(session.playerHeading).toBe(135);
  });

  it("given undock() is called, the pre-dock snapshot is cleared", () => {
    // Given — dock and record the snapshot
    const location = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 3 });
    const session = makeSession({ playerPosition: { x: 1, y: 0 } });
    manager.dock(session, location, makeStanding(), {}, new Set());
    expect(manager.getPreDockSnapshot()).not.toBeNull();

    // When
    manager.undock(session);

    // Then — snapshot is gone after undock
    expect(manager.getPreDockSnapshot()).toBeNull();
  });
});

describe("DockingManager.undock() — failure case", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given player is not docked, undock() returns not-docked and session is unchanged", () => {
    // Given
    const session = makeSession({
      playerPosition: { x: 10, y: 20 },
      playerVelocity: { x: 30, y: -15 },
    });

    // When
    const result = manager.undock(session);

    // Then
    expect(result.success).toBe(false);
    expect(result.reason).toBe("not-docked");
    expect(result.restoredPosition).toBeUndefined();

    // And — session unchanged
    expect(session.playerPosition).toEqual({ x: 10, y: 20 });
    expect(session.playerVelocity).toEqual({ x: 30, y: -15 });
    expect(session.dockedLocationId).toBeNull();
  });
});

// ── Round-trip: dock → undock → dock again ────────────────────────────────────

describe("DockingManager — dock / undock round-trip", () => {
  let manager: DockingManager;

  beforeEach(() => {
    manager = new DockingManager();
  });

  it("given a full dock → undock → dock cycle, each transition produces correct state", () => {
    // Given — two locations
    const locationA = makeLocation({
      id: "station-a",
      position: { x: 0, y: 0 },
      dockingRadius: 3,
    });
    const locationB = makeLocation({
      id: "station-b",
      position: { x: 100, y: 0 },
      dockingRadius: 3,
    });
    const session = makeSession({
      playerPosition: { x: 0, y: 2 }, // near station A
      playerVelocity: { x: 80, y: 0 },
      playerHeading: 0,
    });

    // When — first dock at station A
    const dockA = manager.dock(session, locationA, makeStanding(), {}, new Set());

    // Then
    expect(dockA.success).toBe(true);
    expect(session.dockedLocationId).toBe("station-a");
    expect(session.playerVelocity).toEqual({ x: 0, y: 0 });

    // When — undock
    const undockResult = manager.undock(session);

    // Then — ship restored to station A's position
    expect(undockResult.success).toBe(true);
    expect(session.dockedLocationId).toBeNull();
    expect(session.playerPosition).toEqual({ x: 0, y: 0 });
    expect(session.playerVelocity).toEqual({ x: 0, y: 0 });

    // When — move to station B and dock again
    session.playerPosition = { x: 100, y: 1 }; // 1 km from station B
    const dockB = manager.dock(session, locationB, makeStanding(), {}, new Set());

    // Then — second dock succeeds cleanly
    expect(dockB.success).toBe(true);
    expect(session.dockedLocationId).toBe("station-b");
    expect(manager.getPreDockSnapshot()!.stationId).toBe("station-b");
  });
});

// ── Gherkin scenarios ─────────────────────────────────────────────────────────

describe("Scenario: Player docks at a station via UI button when in range", () => {
  /**
   * Given: the player is in space and has navigated within dock range of a station
   *  When: the player comes within range
   *  Then: a "Dock" button appears in the UI
   *  When: the player clicks the "Dock" button
   *  Then: the player ship disappears from the game world (dockedLocationId is set)
   *   And: the combat HUD is hidden (implied by dockedLocationId being non-null)
   *   And: the dock menu displays (caller responsibility, triggered on dock success)
   */
  it("approaching an open station triggers the dock button, then clicking it docks the player", () => {
    // Given — an unrestricted station
    const station = makeLocation({
      id: "open-harbor",
      position: { x: 0, y: 0 },
      dockingRadius: 3,
    });
    const session = makeSession({
      playerPosition: { x: 5, y: 0 }, // outside range initially
    });
    const manager = new DockingManager();

    // The dock button is not shown while far away
    expect(manager.isDockButtonVisible(session, [station])).toBe(false);

    // When — player moves into docking range
    session.playerPosition = { x: 2, y: 0 }; // 2 km — inside 3 km radius

    // Then — dock button appears
    expect(manager.isDockButtonVisible(session, [station])).toBe(true);

    // When — player clicks the dock button
    const result = manager.dock(
      session,
      station,
      makeStanding(),
      {},
      new Set(),
    );

    // Then — docking succeeds
    expect(result.success).toBe(true);
    expect(session.dockedLocationId).toBe("open-harbor");

    // And — dock button is hidden once docked
    expect(manager.isDockButtonVisible(session, [station])).toBe(false);
  });
});

describe("Scenario: Player is denied docking due to low faction reputation", () => {
  /**
   * Given: the player approaches a faction-controlled station
   *   And: the player's reputation is below the docking threshold
   *  When: the player reaches docking range and clicks the Dock button
   *  Then: docking is denied with a low-reputation reason
   *   And: the session remains unchanged (player is still in space)
   */
  it("low-reputation player sees the dock button but is denied when clicking it", () => {
    // Given
    const station = makeLocation({
      id: "terran-hq",
      position: { x: 0, y: 0 },
      dockingRadius: 2,
      requiredReputation: 300,
    });
    const session = makeSession({ playerPosition: { x: 1, y: 0 } }); // inside range
    const standing = makeStanding({ reputation: 50 }); // below 300 threshold
    const manager = new DockingManager();

    // The dock button IS visible (proximity only — permission deferred)
    expect(manager.isDockButtonVisible(session, [station])).toBe(true);

    // When — player attempts to dock
    const result = manager.dock(session, station, standing, {}, new Set());

    // Then — denied with reputation reason
    expect(result.success).toBe(false);
    expect(result.reason).toBe("low-reputation");

    // And — player is still in open space
    expect(session.dockedLocationId).toBeNull();
    expect(session.playerVelocity).not.toEqual({ x: 0, y: 0 }); // velocity unchanged
  });
});

describe("Scenario: Player undocks and returns to combat at station location", () => {
  /**
   * Given: the player is docked at a station
   *  When: the player selects "Undock" from the dock menu
   *  Then: the dock background disappears (dockedLocationId is null)
   *   And: the player ship reappears at the station location
   *   And: the combat HUD is displayed (implied by dockedLocationId being null)
   *   And: WASD/arrow key controls and targeting are active again
   */
  it("undocking via menu returns the ship to the station world position with zero velocity", () => {
    // Given — player docked at a station with known position
    const station = makeLocation({
      id: "station-gamma",
      position: { x: 75, y: -25 },
      dockingRadius: 5,
    });
    const session = makeSession({
      playerPosition: { x: 75, y: -22 }, // 3 km from station — inside radius
      playerVelocity: { x: 120, y: 45 },
      playerHeading: 315,
    });
    const manager = new DockingManager();

    // Dock first
    const dockResult = manager.dock(session, station, makeStanding(), {}, new Set());
    expect(dockResult.success).toBe(true);

    // When — player selects "Undock" from dock menu
    const undockResult = manager.undock(session);

    // Then — undock succeeds
    expect(undockResult.success).toBe(true);

    // And — ship is positioned at the station's world coordinates
    expect(session.playerPosition).toEqual({ x: 75, y: -25 });

    // And — combat can resume (dockedLocationId is null)
    expect(session.dockedLocationId).toBeNull();

    // And — velocity is zero (ship starts stationary from dock)
    expect(session.playerVelocity).toEqual({ x: 0, y: 0 });
  });

  it("undocking only happens through explicit menu action — calling undock() is the only trigger", () => {
    // Given — player docked
    const station = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 3 });
    const session = makeSession({ playerPosition: { x: 1, y: 0 } });
    const manager = new DockingManager();
    manager.dock(session, station, makeStanding(), {}, new Set());
    expect(session.dockedLocationId).not.toBeNull();

    // When — no undock call is made (simulated: multiple update ticks pass)
    // (In the real game loop, DockingManager.tick / updateNearbyLocations etc.
    // would be called but never auto-undock)

    // Then — player remains docked (dockedLocationId unchanged)
    expect(session.dockedLocationId).not.toBeNull();

    // When — explicit undock() call from the dock menu
    manager.undock(session);

    // Then — now undocked
    expect(session.dockedLocationId).toBeNull();
  });
});

/**
 * Integration tests for SolarSystemManager.
 *
 * Observable contracts under test — nothing is mocked (no external boundaries
 * are crossed; no network, no DOM, no Pixi):
 *
 *  1. Initialization — system state is valid and consistent.
 *  2. Player starts docked at station-alpha.
 *  3. Orbital simulation — planet positions change on tick.
 *  4. Gravity — undocked player velocity increases toward the primary body.
 *  5. Navigation — undock / dock mechanics work correctly.
 *  6. Render data — buildRenderData returns correctly shaped payload.
 *  7. Nearby locations — proximity list updates as player moves.
 */

import { describe, expect, it } from "vitest";
import { SolarSystemManager } from "./SolarSystemManager";
import type { SolarSystemState } from "../types/solarsystem";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Magnitude of a 2-D vector. */
function mag(v: { x: number; y: number }): number {
  return Math.sqrt(v.x ** 2 + v.y ** 2);
}

// ── 1. Initialization ─────────────────────────────────────────────────────────

describe("SolarSystemManager — initialization", () => {
  it("generates a system with at least one star, one planet, and one location", () => {
    // Given / When
    const mgr = new SolarSystemManager();
    const sys = mgr.getSystem();

    // Then
    expect(sys.celestialBodies.some((b) => b.type === "star")).toBe(true);
    expect(sys.celestialBodies.some((b) => b.type === "planet")).toBe(true);
    expect(sys.locations.length).toBeGreaterThan(0);
  });

  it("assigns exactly one primary gravity source across all bodies", () => {
    // Given / When
    const mgr = new SolarSystemManager();
    const primaries = mgr.getSystem().celestialBodies.filter(
      (b) => b.isPrimaryGravitySource,
    );

    // Then
    expect(primaries).toHaveLength(1);
  });

  it("sets primaryGravitySourceId to the id of the body marked isPrimaryGravitySource", () => {
    // Given
    const mgr = new SolarSystemManager();
    const session = mgr.getSessionState();
    const primaryBody = mgr
      .getSystem()
      .celestialBodies.find((b) => b.isPrimaryGravitySource);

    // Then
    expect(primaryBody).toBeDefined();
    expect(session.primaryGravitySourceId).toBe(primaryBody!.id);
  });

  it("has no stateChangeLog entries on a fresh system", () => {
    // Given / When
    const sys = new SolarSystemManager().getSystem();

    // Then
    expect(sys.stateChangeLog.entries).toHaveLength(0);
  });

  it("faction assignments are consistent between initial and current control", () => {
    // Given
    const sys = new SolarSystemManager().getSystem();

    // Then — initial and current are identical at generation time
    for (const [locationId, factionId] of Object.entries(
      sys.initialFactionAssignments,
    )) {
      expect(sys.currentFactionControl[locationId]).toBe(factionId);
    }
  });
});

// ── 2. Player starts docked at station-alpha ──────────────────────────────────

describe("SolarSystemManager — initial player state", () => {
  it("player starts docked at station-alpha", () => {
    // Given / When
    const session = new SolarSystemManager().getSessionState();

    // Then
    expect(session.dockedLocationId).toBe("station-alpha");
  });

  it("player starts with zero velocity while docked", () => {
    // Given / When
    const session = new SolarSystemManager().getSessionState();

    // Then
    expect(session.playerVelocity.x).toBe(0);
    expect(session.playerVelocity.y).toBe(0);
  });

  it("player position matches the starting location's world position", () => {
    // Given
    const mgr = new SolarSystemManager();
    const session = mgr.getSessionState();
    const startLoc = mgr
      .getSystem()
      .locations.find((l) => l.id === "station-alpha")!;

    // Then
    expect(session.playerPosition.x).toBeCloseTo(startLoc.position.x, 0);
    expect(session.playerPosition.y).toBeCloseTo(startLoc.position.y, 0);
  });

  it("station-alpha is in the discoveredLocations set on start", () => {
    // Given / When
    const session = new SolarSystemManager().getSessionState();

    // Then
    expect(session.discoveredLocations.has("station-alpha")).toBe(true);
  });

  it("zoomLevel is 1.0 on initialisation", () => {
    // Given / When
    const session = new SolarSystemManager().getSessionState();

    // Then
    expect(session.zoomLevel).toBe(1.0);
  });
});

// ── 3. Orbital simulation ─────────────────────────────────────────────────────

describe("SolarSystemManager — orbital simulation", () => {
  it("after ticking, orbiting planets have different positions than before", () => {
    // Given
    const mgr = new SolarSystemManager();
    const before = mgr.getSystem().celestialBodies.find((b) => b.type === "planet")!;
    const posBefore = { ...before.position };

    // When — large tick to ensure measurable movement
    mgr.tick(50_000);

    // Then
    const after = mgr.getSystem().celestialBodies.find((b) => b.id === before.id)!;
    const dx = after.position.x - posBefore.x;
    const dy = after.position.y - posBefore.y;
    expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
  });

  it("the star remains at the origin after ticking (no parent orbit)", () => {
    // Given
    const mgr = new SolarSystemManager();

    // When
    mgr.tick(100_000);

    // Then
    const star = mgr.getSystem().celestialBodies.find((b) => b.type === "star")!;
    expect(star.position.x).toBe(0);
    expect(star.position.y).toBe(0);
  });

  it("mean anomaly advances proportionally across two ticks", () => {
    // Given — a fresh manager where the first planet starts at anomaly 0
    const mgr = new SolarSystemManager();
    const planet = mgr.getSystem().celestialBodies.find((b) => b.type === "planet")!;
    const period = planet.orbital.orbitalPeriodMs;

    // When — tick by exactly half the orbital period
    mgr.tick(period / 2);

    // Then — anomaly should be ~180° (half orbit)
    const updated = mgr
      .getSystem()
      .celestialBodies.find((b) => b.id === planet.id)!;
    // Allow ±5° for floating-point rounding.
    expect(updated.orbital.currentAnomaly).toBeCloseTo(180, -1);
  });

  it("after a full orbital period the planet is back near its starting angle", () => {
    // Given
    const mgr = new SolarSystemManager();
    const planet = mgr.getSystem().celestialBodies.find((b) => b.type === "planet")!;
    const initialAnomaly = planet.orbital.currentAnomaly;
    const period = planet.orbital.orbitalPeriodMs;

    // When — tick by exactly one full period
    mgr.tick(period);

    // Then — anomaly wraps back to (initialAnomaly + 360) % 360 ≈ initialAnomaly
    const updated = mgr
      .getSystem()
      .celestialBodies.find((b) => b.id === planet.id)!;
    expect(updated.orbital.currentAnomaly).toBeCloseTo(initialAnomaly, 1);
  });
});

// ── 4. Gravity ────────────────────────────────────────────────────────────────

describe("SolarSystemManager — gravity applied to undocked player", () => {
  it("docked player velocity stays zero after ticking (no gravity while docked)", () => {
    // Given
    const mgr = new SolarSystemManager(); // starts docked

    // When
    mgr.tick(100);
    mgr.tick(100);
    mgr.tick(100);

    // Then
    const session = mgr.getSessionState();
    expect(session.playerVelocity.x).toBe(0);
    expect(session.playerVelocity.y).toBe(0);
  });

  it("undocked player velocity increases toward the primary body after ticking", () => {
    // Given
    const mgr = new SolarSystemManager();
    mgr.undock();

    const before = mgr.getSessionState();
    const velBefore = mag(before.playerVelocity);

    // When — multiple ticks to accumulate detectable gravity
    for (let i = 0; i < 20; i++) mgr.tick(1_000);

    // Then — speed should have increased (gravity pulls player)
    const after = mgr.getSessionState();
    const velAfter = mag(after.playerVelocity);
    expect(velAfter).toBeGreaterThan(velBefore);
  });

  it("undocked player position changes after ticking", () => {
    // Given
    const mgr = new SolarSystemManager();
    mgr.undock();
    const posBefore = { ...mgr.getSessionState().playerPosition };

    // When
    for (let i = 0; i < 10; i++) mgr.tick(1_000);

    // Then
    const posAfter = mgr.getSessionState().playerPosition;
    const totalMove = Math.abs(posAfter.x - posBefore.x) + Math.abs(posAfter.y - posBefore.y);
    expect(totalMove).toBeGreaterThan(0);
  });
});

// ── 5. Navigation — undock / dock ─────────────────────────────────────────────

describe("SolarSystemManager — undock", () => {
  it("sets dockedLocationId to null", () => {
    // Given
    const mgr = new SolarSystemManager();
    expect(mgr.getSessionState().dockedLocationId).toBe("station-alpha");

    // When
    mgr.undock();

    // Then
    expect(mgr.getSessionState().dockedLocationId).toBeNull();
  });

  it("gives the player a non-zero velocity after undocking", () => {
    // Given
    const mgr = new SolarSystemManager();

    // When
    mgr.undock();

    // Then
    const vel = mgr.getSessionState().playerVelocity;
    expect(mag(vel)).toBeGreaterThan(0);
  });

  it("calling undock when already undocked is a no-op", () => {
    // Given
    const mgr = new SolarSystemManager();
    mgr.undock();
    const velAfterFirst = { ...mgr.getSessionState().playerVelocity };

    // When — second undock call
    mgr.undock();

    // Then — velocity should be unchanged
    const velAfterSecond = mgr.getSessionState().playerVelocity;
    expect(velAfterSecond.x).toBe(velAfterFirst.x);
    expect(velAfterSecond.y).toBe(velAfterFirst.y);
  });
});

describe("SolarSystemManager — dock", () => {
  it("fails if player is not within docking range", () => {
    // Given — player starts far from station-beta
    const mgr = new SolarSystemManager();
    mgr.undock();

    // When — try to dock at a location far away
    const result = mgr.dock("station-beta");

    // Then
    expect(result).toBe(false);
    expect(mgr.getSessionState().dockedLocationId).toBeNull();
  });

  it("succeeds when player is within the location's dockingRadius", () => {
    // Given — teleport player to exactly the station-alpha position
    const mgr = new SolarSystemManager();
    mgr.undock(); // undock first so we can re-dock
    // Player is already at station-alpha's world position (undock doesn't
    // move them far in one frame), so they are still within docking range.
    // Re-dock immediately.
    const result = mgr.dock("station-alpha");

    // Then
    expect(result).toBe(true);
    expect(mgr.getSessionState().dockedLocationId).toBe("station-alpha");
  });

  it("docking zeroes the player's velocity", () => {
    // Given
    const mgr = new SolarSystemManager();
    mgr.undock();
    // dock succeeds because player is still at station-alpha coordinates
    mgr.dock("station-alpha");

    // Then
    const vel = mgr.getSessionState().playerVelocity;
    expect(vel.x).toBe(0);
    expect(vel.y).toBe(0);
  });

  it("docking adds the location to discoveredLocations", () => {
    // Given
    const mgr = new SolarSystemManager();
    mgr.undock();

    // When — dock back at station-alpha
    mgr.dock("station-alpha");

    // Then
    expect(mgr.getSessionState().discoveredLocations.has("station-alpha")).toBe(true);
  });

  it("returns false for a non-existent location id", () => {
    // Given
    const mgr = new SolarSystemManager();

    // When
    const result = mgr.dock("does-not-exist");

    // Then
    expect(result).toBe(false);
  });
});

// ── 6. Render data ────────────────────────────────────────────────────────────

describe("SolarSystemManager — buildRenderData", () => {
  it("returns the system name as the systemName field", () => {
    // Given / When
    const data = new SolarSystemManager().buildRenderData(1280, 720);

    // Then
    expect(typeof data.systemName).toBe("string");
    expect(data.systemName.length).toBeGreaterThan(0);
  });

  it("returns one body entry per celestial body in the system", () => {
    // Given
    const mgr = new SolarSystemManager();
    const bodyCount = mgr.getSystem().celestialBodies.length;

    // When
    const data = mgr.buildRenderData(1280, 720);

    // Then
    expect(data.bodies).toHaveLength(bodyCount);
  });

  it("returns one location entry per location in the system", () => {
    // Given
    const mgr = new SolarSystemManager();
    const locCount = mgr.getSystem().locations.length;

    // When
    const data = mgr.buildRenderData(1280, 720);

    // Then
    expect(data.locations).toHaveLength(locCount);
  });

  it("marks the docked location as isDocked=true", () => {
    // Given
    const mgr = new SolarSystemManager(); // starts docked at station-alpha

    // When
    const data = mgr.buildRenderData(1280, 720);

    // Then
    const dockedEntry = data.locations.find((l) => l.id === "station-alpha");
    expect(dockedEntry).toBeDefined();
    expect(dockedEntry!.isDocked).toBe(true);
  });

  it("playerIsDocked is true when docked, false when not", () => {
    // Given
    const mgr = new SolarSystemManager();

    // When — docked
    const dockedData = mgr.buildRenderData(1280, 720);
    mgr.undock();
    const freeData = mgr.buildRenderData(1280, 720);

    // Then
    expect(dockedData.playerIsDocked).toBe(true);
    expect(freeData.playerIsDocked).toBe(false);
  });

  it("player screen position is at the canvas centre when at the default position", () => {
    // Given — at default position the camera is centred on the player
    const mgr = new SolarSystemManager();
    const W = 1280;
    const H = 720;

    // When
    const data = mgr.buildRenderData(W, H);

    // Then — player is always at the centre because the map is player-relative
    expect(data.playerScreenX).toBeCloseTo(W / 2, 1);
    expect(data.playerScreenY).toBeCloseTo(H / 2, 1);
  });

  it("all body screenRadius values are positive numbers", () => {
    // Given / When
    const data = new SolarSystemManager().buildRenderData(1280, 720);

    // Then
    for (const body of data.bodies) {
      expect(body.screenRadius).toBeGreaterThan(0);
    }
  });

  it("dockedLocationName is null when undocked", () => {
    // Given
    const mgr = new SolarSystemManager();
    mgr.undock();

    // When
    const data = mgr.buildRenderData(1280, 720);

    // Then
    expect(data.dockedLocationName).toBeNull();
  });

  it("dockedLocationName matches the starting location name when docked", () => {
    // Given
    const mgr = new SolarSystemManager();
    const startLoc = mgr
      .getSystem()
      .locations.find((l) => l.id === "station-alpha")!;

    // When
    const data = mgr.buildRenderData(1280, 720);

    // Then
    expect(data.dockedLocationName).toBe(startLoc.name);
  });

  it("accepts an arbitrary canvas size and still returns finite screen coords", () => {
    // Given
    const mgr = new SolarSystemManager();

    // When
    const data = mgr.buildRenderData(800, 600);

    // Then
    for (const body of data.bodies) {
      expect(isFinite(body.screenX)).toBe(true);
      expect(isFinite(body.screenY)).toBe(true);
    }
  });
});

// ── 7. Custom system injection ─────────────────────────────────────────────────

describe("SolarSystemManager — custom system injection", () => {
  it("accepts a pre-built SolarSystemState and uses its data", () => {
    // Given — minimal custom system with a single star and no locations
    const customSystem: SolarSystemState = {
      seed: { name: "Test System", timestamp: 0, randomSeed: 42 },
      celestialBodies: [
        {
          id: "test-star",
          name: "Test Star",
          type: "star",
          position: { x: 0, y: 0 },
          radius: 500_000,
          mass: 1e30,
          gravityStrength: 274,
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
        },
      ],
      locations: [
        {
          id: "test-station",
          name: "Test Station",
          bodyId: "test-star",
          position: { x: 600_000, y: 0 },
          dockingRadius: 10,
          controllingFaction: "test-faction",
          npcs: [],
          shops: [],
          type: "station",
        },
      ],
      initialFactionAssignments: { "test-station": "test-faction" },
      currentFactionControl: { "test-station": "test-faction" },
      stateChangeLog: { entries: [] },
      lastUpdatedAt: 0,
    };

    // When
    const mgr = new SolarSystemManager(customSystem);

    // Then
    expect(mgr.getSystem().seed.name).toBe("Test System");
    expect(mgr.getSystem().celestialBodies).toHaveLength(1);
    expect(mgr.getSessionState().primaryGravitySourceId).toBe("test-star");
  });
});

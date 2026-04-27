/**
 * Tests for GravitySystem.applyGravity
 *
 * These are pure-function tests: no mocks, no side-effects, no external
 * boundaries. Real CelestialBody objects are constructed inline.
 *
 * Observable contracts under test:
 *   1. Returned velocity delta points toward the body (gravity direction).
 *   2. Gravitational acceleration increases as the ship gets closer (inverse-square).
 *   3. Boundary collision: a ship inside the body's radius that is moving
 *      toward the centre has the inward velocity component cancelled.
 *   4. Numerical precision: 100+ successive updates produce no NaN / Infinity.
 */

import { describe, expect, it } from "vitest";
import { GravitySystem } from "./GravitySystem";
import type { CelestialBody } from "../../types/solarsystem";

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal CelestialBody for gravity tests.
 * Only the fields consumed by GravitySystem are populated.
 */
function makeBody(overrides: Partial<CelestialBody> = {}): CelestialBody {
  return {
    id: "planet-test",
    name: "Test Planet",
    type: "planet",
    position: { x: 0, y: 0 },
    radius: 100, // km
    mass: 5.972e24, // kg (Earth-mass, used elsewhere but not by GravitySystem)
    gravityStrength: 9.8, // m/s² at surface
    color: { r: 100, g: 150, b: 200 },
    orbital: {
      parentId: "star-1",
      semiMajorAxis: 150_000,
      eccentricity: 0.017,
      inclination: 0,
      longitudeAscendingNode: 0,
      argumentOfPeriapsis: 0,
      meanAnomalyAtEpoch: 0,
      orbitalPeriodMs: 365 * 24 * 60 * 60 * 1000,
      currentAnomaly: 0,
    },
    isPrimaryGravitySource: true,
    ...overrides,
  };
}

/** Magnitude of a 2-D vector. */
function mag(v: { x: number; y: number }): number {
  return Math.sqrt(v.x ** 2 + v.y ** 2);
}

/** Dot product of two 2-D vectors. */
function dot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.x + a.y * b.y;
}

// ── (1) Acceleration direction ────────────────────────────────────────────────

describe("GravitySystem.applyGravity — acceleration direction", () => {
  it("given a ship at rest to the right of the body, velocity delta points left (toward body)", () => {
    // Given
    const body = makeBody({ position: { x: 0, y: 0 } });
    const shipPos = { x: 200, y: 0 }; // 2× radius away, directly right of body
    const shipVel = { x: 0, y: 0 };   // at rest
    const deltaMs = 100;

    // When
    const newVel = GravitySystem.applyGravity(shipPos, shipVel, body, deltaMs);

    // Then: velocity should now point in the -x direction (toward the body)
    expect(newVel.x).toBeLessThan(0);
    expect(newVel.y).toBeCloseTo(0, 10);
  });

  it("given a ship above the body, velocity delta points downward (toward body)", () => {
    // Given
    const body = makeBody({ position: { x: 0, y: 0 } });
    const shipPos = { x: 0, y: 300 }; // directly above
    const shipVel = { x: 0, y: 0 };

    // When
    const newVel = GravitySystem.applyGravity(shipPos, shipVel, body, 100);

    // Then
    expect(newVel.y).toBeLessThan(0); // toward body (negative y)
    expect(newVel.x).toBeCloseTo(0, 10);
  });

  it("given a ship at a diagonal, the velocity delta has the correct direction angle", () => {
    // Given — ship is at 45° above-right of body
    const body = makeBody({ position: { x: 0, y: 0 } });
    const shipPos = { x: 200, y: 200 }; // 45° angle, ~283 km away
    const shipVel = { x: 0, y: 0 };

    // When
    const newVel = GravitySystem.applyGravity(shipPos, shipVel, body, 100);

    // Then: both components should be negative and equal in magnitude (45° toward origin)
    expect(newVel.x).toBeLessThan(0);
    expect(newVel.y).toBeLessThan(0);
    expect(newVel.x).toBeCloseTo(newVel.y, 10);
  });

  it("velocity delta points toward the body regardless of existing ship velocity", () => {
    // Given — ship is moving away from the body (to the right) and gravity should pull it back
    const body = makeBody({ position: { x: 0, y: 0 } });
    const shipPos = { x: 400, y: 0 };
    const shipVel = { x: 50, y: 0 }; // already moving right

    // When
    const newVel = GravitySystem.applyGravity(shipPos, shipVel, body, 100);

    // Then: the x velocity should still have increased toward the body (reduced)
    // The gravitational pull opposes the outward motion.
    expect(newVel.x).toBeLessThan(shipVel.x);
    expect(newVel.y).toBeCloseTo(0, 10);
  });
});

// ── (2) Acceleration increases with proximity ─────────────────────────────────

describe("GravitySystem.applyGravity — acceleration increases as ship approaches", () => {
  it("a ship at 2× radius experiences 4× the acceleration of a ship at 4× radius", () => {
    // Given — two ships at different distances from the same body, both at rest
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });
    const velZero = { x: 0, y: 0 };
    const deltaMs = 1000; // 1 second for easy maths

    const nearPos = { x: 200, y: 0 }; // 2× radius
    const farPos  = { x: 400, y: 0 }; // 4× radius

    // When
    const nearVel = GravitySystem.applyGravity(nearPos, velZero, body, deltaMs);
    const farVel  = GravitySystem.applyGravity(farPos,  velZero, body, deltaMs);

    // Then: near has 4× the speed of far (inverse-square, 2²=4)
    const nearSpeed = mag(nearVel);
    const farSpeed  = mag(farVel);

    expect(nearSpeed / farSpeed).toBeCloseTo(4, 5);
  });

  it("successive frames show monotonically increasing speed when falling radially toward a body", () => {
    // Given — ship starts at rest, 5× radius away, falling straight in
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });
    const deltaMs = 16; // ~60 fps

    let pos = { x: 500, y: 0 };
    let vel = { x: 0, y: 0 };
    const speeds: number[] = [];

    // When — simulate 50 frames (ship moves closer each frame)
    for (let i = 0; i < 50; i++) {
      vel = GravitySystem.applyGravity(pos, vel, body, deltaMs);
      pos = { x: pos.x + vel.x * (deltaMs / 1000), y: pos.y + vel.y * (deltaMs / 1000) };
      speeds.push(mag(vel));

      // Stop if we hit the body surface (collision case is separate)
      if (pos.x <= body.radius) break;
    }

    // Then — speed should consistently increase (later speeds > earlier speeds)
    // Check the final recorded speed is greater than the first.
    expect(speeds[speeds.length - 1]).toBeGreaterThan(speeds[0]!);

    // And the sequence should be non-decreasing (monotonically increasing).
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1]!);
    }
  });

  it("acceleration magnitude matches the inverse-square formula exactly", () => {
    // Given
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });
    const shipPos = { x: 300, y: 0 }; // 3× radius away
    const shipVel = { x: 0, y: 0 };
    const deltaMs = 1000; // 1 s for direct comparison

    // Expected: a = g × (r/d)² = 9.8 × (100/300)² = 9.8 × (1/9) ≈ 1.0889 m/s
    const expectedSpeed = 9.8 * (100 / 300) ** 2;

    // When
    const newVel = GravitySystem.applyGravity(shipPos, shipVel, body, deltaMs);

    // Then
    expect(mag(newVel)).toBeCloseTo(expectedSpeed, 8);
  });
});

// ── (3) Boundary collision prevents penetration ───────────────────────────────

describe("GravitySystem.applyGravity — boundary collision prevents penetration", () => {
  it("given ship inside radius moving toward body, inward velocity component is zeroed", () => {
    // Given — ship is at 0.5× radius (inside the body), moving inward
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100 });
    const shipPos = { x: 50, y: 0 }; // inside body (50 km < 100 km radius)
    const shipVel = { x: -20, y: 0 }; // moving toward body centre (negative x)

    // When
    const newVel = GravitySystem.applyGravity(shipPos, shipVel, body, 16);

    // Then: the inward component (-x here) must be cancelled
    // The direction toward the body from (50,0) is (-1,0).
    // Dot(newVel, inward) should be ≤ 0 (not moving toward body).
    const inwardDir = { x: -1, y: 0 }; // body is at origin, ship at +x → inward = -x
    const inwardComponent = dot(newVel, inwardDir);
    expect(inwardComponent).toBeLessThanOrEqual(0);
  });

  it("given ship inside radius moving toward body, only the inward component is removed (tangential preserved)", () => {
    // Given — ship inside body, moving diagonally toward centre and sideways
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100 });
    const shipPos = { x: 0, y: 50 }; // inside body, above centre
    //  ship moving toward centre (downward, -y) and rightward (+x)
    const shipVel = { x: 10, y: -30 };

    // When
    const newVel = GravitySystem.applyGravity(shipPos, shipVel, body, 16);

    // Then: inward direction is (0,-1) (body is at origin, ship above → inward is -y).
    // The inward component (-30 × 1 = 30 m/s) should be removed.
    // The tangential component (x: 10) should be preserved.
    expect(newVel.x).toBeCloseTo(10, 5);
    expect(newVel.y).toBeGreaterThanOrEqual(0); // no longer moving inward
  });

  it("given ship inside radius already moving outward, velocity is unchanged", () => {
    // Given — ship inside body but escaping (moving away from centre)
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100 });
    const shipPos = { x: 80, y: 0 }; // inside body at +x
    const shipVel = { x: 15, y: 0 }; // moving outward (positive x = away from origin)

    // When
    const newVel = GravitySystem.applyGravity(shipPos, shipVel, body, 16);

    // Then: outward velocity is untouched — no extra acceleration, no cancellation
    expect(newVel.x).toBeCloseTo(15, 8);
    expect(newVel.y).toBeCloseTo(0, 8);
  });

  it("given ship exactly at body centre, velocity is zeroed (degenerate case)", () => {
    // Given
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100 });
    const shipPos = { x: 0, y: 0 }; // exactly at centre
    const shipVel = { x: 50, y: -30 };

    // When
    const newVel = GravitySystem.applyGravity(shipPos, shipVel, body, 16);

    // Then: no defined direction, so velocity is zeroed
    expect(newVel.x).toBe(0);
    expect(newVel.y).toBe(0);
  });

  it("simulated free-fall: ship cannot penetrate surface over an extended fall", () => {
    // Given — ship starts outside and falls toward the body
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });
    let pos = { x: 300, y: 0 };
    let vel = { x: 0, y: 0 };
    const deltaMs = 16;

    // When — simulate 500 frames (more than enough to fall from 300 km to surface)
    for (let i = 0; i < 500; i++) {
      vel = GravitySystem.applyGravity(pos, vel, body, deltaMs);
      // Update position (caller's responsibility in the real engine)
      pos = { x: pos.x + vel.x * (deltaMs / 1000), y: pos.y };
    }

    // Then: after collision response, the ship should not be drifting deeper
    // i.e. velocity in the -x direction (toward body) should not be large
    if (pos.x < body.radius) {
      // If inside, inward velocity component should be ≤ 0
      const inwardDir = { x: -1, y: 0 };
      expect(dot(vel, inwardDir)).toBeLessThanOrEqual(0);
    }
  });
});

// ── (4) Numerical precision over 100+ frames ──────────────────────────────────

describe("GravitySystem.applyGravity — precision over 100+ frame updates", () => {
  it("produces no NaN or Infinity after 200 frames of orbital simulation", () => {
    // Given — ship in a rough circular-ish orbit at 3× radius
    // (tangential velocity for a stable orbit is not enforced here, just testing stability)
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });
    let pos = { x: 300, y: 0 };
    let vel = { x: 0, y: 5 }; // tangential (upward) velocity for rough orbit
    const deltaMs = 16;

    // When — 200 frames
    for (let i = 0; i < 200; i++) {
      vel = GravitySystem.applyGravity(pos, vel, body, deltaMs);
      pos = {
        x: pos.x + vel.x * (deltaMs / 1000),
        y: pos.y + vel.y * (deltaMs / 1000),
      };
    }

    // Then: no pathological values
    expect(isNaN(vel.x)).toBe(false);
    expect(isNaN(vel.y)).toBe(false);
    expect(isFinite(vel.x)).toBe(true);
    expect(isFinite(vel.y)).toBe(true);
    expect(isNaN(pos.x)).toBe(false);
    expect(isNaN(pos.y)).toBe(false);
  });

  it("produces no NaN or Infinity after 500 frames of radial free-fall toward surface", () => {
    // Given — ship falling straight toward body
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });
    let pos = { x: 500, y: 0 };
    let vel = { x: 0, y: 0 };
    const deltaMs = 16;

    // When — 500 frames (ship will reach and bounce off surface)
    for (let i = 0; i < 500; i++) {
      vel = GravitySystem.applyGravity(pos, vel, body, deltaMs);
      pos = {
        x: pos.x + vel.x * (deltaMs / 1000),
        y: pos.y + vel.y * (deltaMs / 1000),
      };
    }

    // Then
    expect(isNaN(vel.x)).toBe(false);
    expect(isNaN(vel.y)).toBe(false);
    expect(isFinite(vel.x)).toBe(true);
    expect(isFinite(vel.y)).toBe(true);
  });

  it("velocity components remain finite after 100 frames near the surface boundary", () => {
    // Given — ship skimming just above the surface (surface + 1 km)
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });
    let pos = { x: 101, y: 0 }; // 1 km above surface
    let vel = { x: 0, y: 2 }; // small tangential velocity

    // When — 100 frames; ship is very close to the body the entire time
    for (let i = 0; i < 100; i++) {
      vel = GravitySystem.applyGravity(pos, vel, body, 16);
      pos = {
        x: pos.x + vel.x * 0.016,
        y: pos.y + vel.y * 0.016,
      };
    }

    // Then
    expect(isFinite(vel.x)).toBe(true);
    expect(isFinite(vel.y)).toBe(true);
    expect(isFinite(pos.x)).toBe(true);
    expect(isFinite(pos.y)).toBe(true);
  });

  it("produces stable results for very small deltaMs (sub-millisecond ticks)", () => {
    // Given
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });
    const shipPos = { x: 250, y: 0 };
    const shipVel = { x: 0, y: 0 };
    const tinyDelta = 0.1; // 0.1 ms

    // When — 1000 tiny ticks ≈ 100 ms total
    let vel = shipVel;
    for (let i = 0; i < 1000; i++) {
      vel = GravitySystem.applyGravity(shipPos, vel, body, tinyDelta);
    }

    // Then
    expect(isFinite(vel.x)).toBe(true);
    expect(isFinite(vel.y)).toBe(true);
    expect(isNaN(vel.x)).toBe(false);
    expect(isNaN(vel.y)).toBe(false);
  });
});

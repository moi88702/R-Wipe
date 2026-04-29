/**
 * Tests for ShipControlManager
 *
 * Integration-first tests: the ShipControlManager is a pure logic module —
 * no DOM, no Pixi.js, no external I/O — so we exercise the full update()
 * pipeline from input → physics → result without any mocks. GravitySystem is
 * the only other internal module called; we let it run for real because it is
 * also a pure function in the same package.
 *
 * Observable contracts under test:
 *
 * Forward / reverse thrust
 *   1. W held → velocity increases in the ship's facing direction.
 *   2. S held → velocity increases opposite the ship's facing direction.
 *   3. Thrust magnitude scales proportionally with thrusterPower and deltaMs.
 *   4. No thrust → velocity is unchanged (inertial drift).
 *
 * Strafe (arrow keys)
 *   5. ArrowRight held → velocity increases perpendicular-right to heading.
 *   6. ArrowLeft held  → velocity increases perpendicular-left to heading.
 *   7. Strafe is always perpendicular to facing, regardless of heading.
 *   8. Separate strafePower config is respected.
 *
 * Rotation (A / D keys)
 *   9. D held → heading increases (clockwise / rightward turn).
 *  10. A held → heading decreases (counter-clockwise / leftward turn).
 *  11. Turn delta equals turnRateRadPerS × deltaMs / 1000.
 *  12. Heading wraps correctly at [0, 2π) boundaries.
 *
 * Mouse heading
 *  13. mouseHeadingTarget snaps to exact target when within one turn step.
 *  14. mouseHeadingTarget rotates toward target at turnRateRadPerS when far.
 *  15. mouseHeadingTarget takes shortest path (clockwise or counter-clockwise).
 *
 * Gravity integration
 *  16. Without thrust, gravity body pulls the ship toward it.
 *  17. With thrust and gravity, both accelerations are applied in the same tick.
 *  18. null primaryBody → no gravity change to velocity.
 *
 * Position integration
 *  19. Position advances by (velocity × deltaS / 1000) each tick (km).
 *  20. No input, no gravity → position drifts with existing velocity.
 *
 * Speed cap
 *  21. maxSpeedMs clamps velocity magnitude without changing direction.
 *  22. Velocity below cap is unaffected by the cap.
 *
 * Simultaneous inputs
 *  23. Forward + strafe applies both thrust components independently.
 *  24. Rotation and thrust can occur in the same tick.
 *
 * isThrustActive / isRotating flags
 *  25. isThrustActive is true when any thrust key is held.
 *  26. isRotating is true when any rotation is happening.
 *  27. Both are false when no input is provided.
 *
 * Heading helpers
 *  28. degreesToRadians / radiansToDegrees round-trip correctly.
 *  29. normalizeHeading handles negative angles and angles > 2π.
 *  30. forwardVector and strafeRightVector are perpendicular unit vectors.
 */

import { describe, expect, it } from "vitest";
import {
  ShipControlManager,
  type ShipControlConfig,
  type ShipControlInput,
  type ShipPhysicsState,
} from "./ShipControlManager";
import type { CelestialBody } from "../../types/solarsystem";

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Build a minimal ShipPhysicsState at the world origin, at rest, facing North. */
function makeState(overrides: Partial<ShipPhysicsState> = {}): ShipPhysicsState {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    headingRadians: 0, // North
    ...overrides,
  };
}

/** Build a ShipControlConfig with sensible defaults for testing. */
function makeConfig(overrides: Partial<ShipControlConfig> = {}): ShipControlConfig {
  return {
    hullMass: 1000,        // 1 000 kg
    thrusterPower: 100,    // 100 m/s²
    turnRateRadPerS: Math.PI, // 180°/s — fast for legible test deltas
    ...overrides,
  };
}

/** No-input snapshot — all keys released, no mouse target. */
function noInput(): ShipControlInput {
  return {
    thrustForward: false,
    thrustReverse: false,
    turnLeft: false,
    turnRight: false,
    strafeLeft: false,
    strafeRight: false,
  };
}

/** Build a minimal CelestialBody for gravity tests. */
function makeBody(overrides: Partial<CelestialBody> = {}): CelestialBody {
  return {
    id: "star-test",
    name: "Test Star",
    type: "star",
    position: { x: 0, y: 0 },
    radius: 100,         // km
    mass: 2e30,
    gravityStrength: 9.8, // m/s² at surface
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
    ...overrides,
  };
}

/** Euclidean magnitude of a 2-D vector. */
function mag(v: { x: number; y: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Dot product of two 2-D vectors. */
function dot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.x + a.y * b.y;
}

// ── (1–4) Forward / reverse thrust ───────────────────────────────────────────

describe("ShipControlManager — forward / reverse thrust", () => {
  it("(1) W held: velocity increases in the ship's facing direction (North)", () => {
    // Given — ship at rest, facing North (0 rad)
    const state = makeState({ headingRadians: 0 });
    const input: ShipControlInput = { ...noInput(), thrustForward: true };
    const config = makeConfig({ thrusterPower: 100 });
    const deltaMs = 1000;

    // When
    const result = ShipControlManager.update(state, input, config, null, deltaMs);

    // Then — velocity should point North (negative y, zero x)
    expect(result.velocity.y).toBeLessThan(0); // northward = −y
    expect(result.velocity.x).toBeCloseTo(0, 8);
    // Exact magnitude: a × dt = 100 × 1 = 100 m/s
    expect(result.velocity.y).toBeCloseTo(-100, 6);
  });

  it("(1) W held: velocity increases in the ship's facing direction (East)", () => {
    // Given — ship at rest, facing East (π/2 rad)
    const state = makeState({ headingRadians: Math.PI / 2 });
    const input: ShipControlInput = { ...noInput(), thrustForward: true };
    const config = makeConfig({ thrusterPower: 50 });
    const deltaMs = 2000;

    // When
    const result = ShipControlManager.update(state, input, config, null, deltaMs);

    // Then — velocity should point East (+x), zero y
    expect(result.velocity.x).toBeCloseTo(100, 6); // 50 m/s² × 2s
    expect(result.velocity.y).toBeCloseTo(0, 8);
  });

  it("(2) S held: velocity increases opposite the ship's facing direction", () => {
    // Given — ship at rest, facing North (0 rad)
    const state = makeState({ headingRadians: 0, velocity: { x: 0, y: -50 } });
    const input: ShipControlInput = { ...noInput(), thrustReverse: true };
    const config = makeConfig({ thrusterPower: 100 });
    const deltaMs = 500; // 0.5 s → deceleration: 100 × 0.5 = 50 m/s opposing

    // When
    const result = ShipControlManager.update(state, input, config, null, deltaMs);

    // Then — reverse thrust should be +y at (100 × 0.5) = 50 m/s added to −50
    expect(result.velocity.y).toBeCloseTo(0, 6);
    expect(result.velocity.x).toBeCloseTo(0, 8);
  });

  it("(3) thrust magnitude scales with thrusterPower × deltaMs", () => {
    // Given — ship at rest, facing East
    const state = makeState({ headingRadians: Math.PI / 2 });
    const config = makeConfig({ thrusterPower: 200 });
    const deltaMs = 250; // 0.25 s → expected Δv = 200 × 0.25 = 50 m/s

    // When
    const result = ShipControlManager.update(
      state,
      { ...noInput(), thrustForward: true },
      config,
      null,
      deltaMs,
    );

    // Then
    expect(result.velocity.x).toBeCloseTo(50, 6);
  });

  it("(4) no thrust key held → velocity is unchanged", () => {
    // Given — ship drifting, no keys pressed
    const state = makeState({ velocity: { x: 30, y: -20 } });

    // When
    const result = ShipControlManager.update(state, noInput(), makeConfig(), null, 1000);

    // Then — velocity must be unchanged (no drag in space)
    expect(result.velocity.x).toBeCloseTo(30, 8);
    expect(result.velocity.y).toBeCloseTo(-20, 8);
  });
});

// ── (5–8) Strafe ──────────────────────────────────────────────────────────────

describe("ShipControlManager — strafe (arrow keys)", () => {
  it("(5) ArrowRight held: velocity increases perpendicular-right to heading (North)", () => {
    // Given — ship at rest, facing North (0), strafe right = East (+x)
    const state = makeState({ headingRadians: 0 });
    const input: ShipControlInput = { ...noInput(), strafeRight: true };
    const config = makeConfig({ thrusterPower: 100 });

    // When
    const result = ShipControlManager.update(state, input, config, null, 1000);

    // Then — velocity points East (+x)
    expect(result.velocity.x).toBeCloseTo(100, 6);
    expect(result.velocity.y).toBeCloseTo(0, 8);
  });

  it("(6) ArrowLeft held: velocity increases perpendicular-left to heading (North)", () => {
    // Given — ship at rest, facing North (0), strafe left = West (−x)
    const state = makeState({ headingRadians: 0 });
    const input: ShipControlInput = { ...noInput(), strafeLeft: true };
    const config = makeConfig({ thrusterPower: 100 });

    // When
    const result = ShipControlManager.update(state, input, config, null, 1000);

    // Then — velocity points West (−x)
    expect(result.velocity.x).toBeCloseTo(-100, 6);
    expect(result.velocity.y).toBeCloseTo(0, 8);
  });

  it("(7) strafe is always perpendicular to heading regardless of heading", () => {
    // Given — ship facing East (π/2), strafe right = South (+y)
    const state = makeState({ headingRadians: Math.PI / 2 });
    const input: ShipControlInput = { ...noInput(), strafeRight: true };
    const config = makeConfig({ thrusterPower: 100 });

    // When
    const result = ShipControlManager.update(state, input, config, null, 1000);

    // Then — velocity should be South (+y), not East (+x)
    expect(result.velocity.y).toBeCloseTo(100, 6);
    expect(result.velocity.x).toBeCloseTo(0, 8);
  });

  it("(7) strafe perpendicular — facing South, strafe left = East (+x)", () => {
    // Given — ship facing South (π), strafe left = East (+x)
    // forwardVector(π) = (0, 1); strafeRightVector(π) = (-1, 0)
    // strafeLeft = opposite of strafeRight = +x
    const state = makeState({ headingRadians: Math.PI });
    const input: ShipControlInput = { ...noInput(), strafeLeft: true };
    const config = makeConfig({ thrusterPower: 100 });

    // When
    const result = ShipControlManager.update(state, input, config, null, 1000);

    // Then
    expect(result.velocity.x).toBeCloseTo(100, 6);
    expect(result.velocity.y).toBeCloseTo(0, 8);
  });

  it("(8) strafePower config is respected independently of thrusterPower", () => {
    // Given — strafePower set to half of thrusterPower
    const state = makeState({ headingRadians: 0 });
    const config = makeConfig({ thrusterPower: 200, strafePower: 80 });
    const deltaMs = 1000;

    // When — strafe right
    const result = ShipControlManager.update(
      state,
      { ...noInput(), strafeRight: true },
      config,
      null,
      deltaMs,
    );

    // Then — strafe velocity = 80 m/s², not 200
    expect(result.velocity.x).toBeCloseTo(80, 6);
  });
});

// ── (9–12) Rotation ───────────────────────────────────────────────────────────

describe("ShipControlManager — rotation (A / D keys)", () => {
  it("(9) D held: heading increases (clockwise)", () => {
    // Given — facing North (0), D key held for 0.5 s at π rad/s turn rate
    const state = makeState({ headingRadians: 0 });
    const config = makeConfig({ turnRateRadPerS: Math.PI });
    const deltaMs = 500;

    // When
    const result = ShipControlManager.update(
      state,
      { ...noInput(), turnRight: true },
      config,
      null,
      deltaMs,
    );

    // Then — heading = 0 + π × 0.5 = π/2 (facing East)
    expect(result.headingRadians).toBeCloseTo(Math.PI / 2, 6);
  });

  it("(10) A held: heading decreases (counter-clockwise), wraps around 0", () => {
    // Given — facing North (0), A key for 0.5 s at π rad/s
    const state = makeState({ headingRadians: 0 });
    const config = makeConfig({ turnRateRadPerS: Math.PI });
    const deltaMs = 500;

    // When
    const result = ShipControlManager.update(
      state,
      { ...noInput(), turnLeft: true },
      config,
      null,
      deltaMs,
    );

    // Then — heading = 0 − π/2 = −π/2, normalised to 3π/2 (West)
    expect(result.headingRadians).toBeCloseTo((3 * Math.PI) / 2, 6);
  });

  it("(11) turn delta equals turnRateRadPerS × deltaS", () => {
    // Given — various deltaMs values should give proportional heading changes
    const config = makeConfig({ turnRateRadPerS: 2 }); // 2 rad/s
    const initialHeading = Math.PI / 4; // 45° NE

    for (const deltaMs of [100, 250, 500]) {
      const state = makeState({ headingRadians: initialHeading });
      const result = ShipControlManager.update(
        state,
        { ...noInput(), turnRight: true },
        config,
        null,
        deltaMs,
      );
      const expectedHeading = ShipControlManager.normalizeHeading(
        initialHeading + 2 * (deltaMs / 1000),
      );
      expect(result.headingRadians).toBeCloseTo(expectedHeading, 8);
    }
  });

  it("(12) heading wraps at 2π: D key past 2π normalises to [0, 2π)", () => {
    // Given — ship almost facing North from the clockwise side
    const state = makeState({ headingRadians: (3 * Math.PI) / 2 }); // 270° West
    const config = makeConfig({ turnRateRadPerS: Math.PI }); // 180°/s
    const deltaMs = 1000; // 1 s → turn 180° = should land at 3π/2 + π = 5π/2 → normalised π/2

    // When
    const result = ShipControlManager.update(
      state,
      { ...noInput(), turnRight: true },
      config,
      null,
      deltaMs,
    );

    // Then — heading wraps and lands at π/2 (East)
    expect(result.headingRadians).toBeCloseTo(Math.PI / 2, 6);
  });

  it("(12) heading normalised: negative heading wraps to [0, 2π)", () => {
    // Given — facing East, turn left fast enough to wrap past 0
    const state = makeState({ headingRadians: Math.PI / 4 }); // 45°
    const config = makeConfig({ turnRateRadPerS: Math.PI * 2 }); // 360°/s
    const deltaMs = 200; // 0.2 s → Δθ = −2π × 0.2 = −0.4π → −0.4π + 0.25π = −0.15π → ~5.52 rad

    // When
    const result = ShipControlManager.update(
      state,
      { ...noInput(), turnLeft: true },
      config,
      null,
      deltaMs,
    );

    // Then — result must be in [0, 2π)
    expect(result.headingRadians).toBeGreaterThanOrEqual(0);
    expect(result.headingRadians).toBeLessThan(2 * Math.PI);
  });
});

// ── (13–15) Mouse heading target ──────────────────────────────────────────────

describe("ShipControlManager — mouse heading target", () => {
  it("(13) snaps to target when target is within one turn step", () => {
    // Given — facing North (0), mouse target = East (π/2)
    // Turn rate = 2π rad/s, deltaMs = 1000 ms → can turn 2π rad in 1 s
    const state = makeState({ headingRadians: 0 });
    const config = makeConfig({ turnRateRadPerS: 2 * Math.PI });

    // When — mouse at π/2, dt = 500 ms → max turn = π rad > diff of π/2
    const result = ShipControlManager.update(
      state,
      { ...noInput(), mouseHeadingTarget: Math.PI / 2 },
      config,
      null,
      500,
    );

    // Then — exact snap to target
    expect(result.headingRadians).toBeCloseTo(Math.PI / 2, 8);
  });

  it("(14) rotates toward target at turnRateRadPerS when far", () => {
    // Given — facing North (0), mouse target = South (π)
    // Turn rate = 1 rad/s, deltaMs = 100 ms → should advance 0.1 rad
    const state = makeState({ headingRadians: 0 });
    const config = makeConfig({ turnRateRadPerS: 1 });

    // When
    const result = ShipControlManager.update(
      state,
      { ...noInput(), mouseHeadingTarget: Math.PI },
      config,
      null,
      100,
    );

    // Then — heading advanced 0.1 rad toward target (clockwise is shorter)
    expect(result.headingRadians).toBeCloseTo(0.1, 6);
    expect(result.isRotating).toBe(true);
  });

  it("(15) takes shortest path — counter-clockwise when closer that way", () => {
    // Given — facing just past East (π/2 + 0.1), target = North (0)
    // Shortest path: counter-clockwise by (π/2 + 0.1), not clockwise by (3π/2 − 0.1)
    const heading = Math.PI / 2 + 0.1;
    const state = makeState({ headingRadians: heading });
    const config = makeConfig({ turnRateRadPerS: 0.05 }); // slow turn

    // When — 1 frame at 100 ms → max turn = 0.005 rad
    const result = ShipControlManager.update(
      state,
      { ...noInput(), mouseHeadingTarget: 0 },
      config,
      null,
      100,
    );

    // Then — heading should have decreased (counter-clockwise toward 0)
    expect(result.headingRadians).toBeLessThan(heading);
  });

  it("mouse target null → uses keyboard turning instead", () => {
    // Given — mouseHeadingTarget explicitly null, D held
    const state = makeState({ headingRadians: 0 });
    const config = makeConfig({ turnRateRadPerS: Math.PI });

    // When
    const result = ShipControlManager.update(
      state,
      { ...noInput(), turnRight: true, mouseHeadingTarget: null },
      config,
      null,
      500,
    );

    // Then — turned clockwise by π × 0.5 = π/2
    expect(result.headingRadians).toBeCloseTo(Math.PI / 2, 6);
  });
});

// ── (16–18) Gravity integration ───────────────────────────────────────────────

describe("ShipControlManager — gravity integration", () => {
  it("(16) no thrust + gravity body pulls ship toward it", () => {
    // Given — ship at rest at (500, 0), star at (0, 0)
    const state = makeState({ position: { x: 500, y: 0 }, velocity: { x: 0, y: 0 } });
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });

    // When — 1 s tick
    const result = ShipControlManager.update(state, noInput(), makeConfig(), body, 1000);

    // Then — velocity should point toward the star (−x direction)
    expect(result.velocity.x).toBeLessThan(0);
    expect(result.velocity.y).toBeCloseTo(0, 5);
  });

  it("(17) thrust + gravity both applied in same tick", () => {
    // Given — ship at (0, 500) facing North, thrusting forward
    //   • Thrust (heading = 0 = North = −y): Δvy = −100 m/s after 1 s
    //   • Star at (0, 1000) — 500 km south of ship — so gravity pulls south (+y),
    //     opposing the northward thrust:
    //     a = 9.8 × (100/500)² ≈ +0.392 m/s² (southward = +y)
    //   Net vy = −100 + 0.392 ≈ −99.608 m/s  (still northward, but weakened)
    const state = makeState({
      position: { x: 0, y: 500 },
      velocity: { x: 0, y: 0 },
      headingRadians: 0, // North (−y direction)
    });
    const body = makeBody({
      position: { x: 0, y: 1000 }, // 500 km south of the ship
      radius: 100,
      gravityStrength: 9.8,
    });
    const config = makeConfig({ thrusterPower: 100 });
    const deltaMs = 1000;

    // When
    const result = ShipControlManager.update(
      state,
      { ...noInput(), thrustForward: true },
      config,
      body,
      deltaMs,
    );

    // Then — thrust dominates (northward = negative y)
    expect(result.velocity.y).toBeLessThan(0);
    expect(result.velocity.x).toBeCloseTo(0, 5);
    // Gravity slightly opposes the thrust, so |vy| < 100
    expect(Math.abs(result.velocity.y)).toBeLessThan(100);
    // But stays close to 100 (gravity is weak at 500 km)
    expect(Math.abs(result.velocity.y)).toBeGreaterThan(98);
  });

  it("(18) null primaryBody → velocity unaffected by gravity", () => {
    // Given — ship drifting, no gravity body
    const state = makeState({ velocity: { x: 10, y: -5 } });

    // When
    const result = ShipControlManager.update(state, noInput(), makeConfig(), null, 1000);

    // Then — velocity unchanged (just drift)
    expect(result.velocity.x).toBeCloseTo(10, 8);
    expect(result.velocity.y).toBeCloseTo(-5, 8);
  });
});

// ── (19–20) Position integration ─────────────────────────────────────────────

describe("ShipControlManager — position integration", () => {
  it("(19) position advances by (velocity × deltaS / 1000) in km", () => {
    // Given — ship at (0, 0) moving at (1000, 0) m/s (1 km/s = fast but clean math)
    const state = makeState({ position: { x: 0, y: 0 }, velocity: { x: 1000, y: 0 } });

    // When — 1 second tick
    const result = ShipControlManager.update(state, noInput(), makeConfig(), null, 1000);

    // Then — Δx = 1000 m/s × 1 s / 1000 = 1 km
    expect(result.position.x).toBeCloseTo(1, 8);
    expect(result.position.y).toBeCloseTo(0, 8);
  });

  it("(19) position advances correctly with a smaller velocity and dt", () => {
    // Given — ship moving at (500, −300) m/s
    const state = makeState({
      position: { x: 10, y: 20 },
      velocity: { x: 500, y: -300 },
    });

    // When — 500 ms tick
    const result = ShipControlManager.update(state, noInput(), makeConfig(), null, 500);

    // Then — Δpos = vel × 0.5s / 1000
    // x: 10 + 500 × 0.5 / 1000 = 10 + 0.25 = 10.25 km
    // y: 20 + (−300) × 0.5 / 1000 = 20 − 0.15 = 19.85 km
    expect(result.position.x).toBeCloseTo(10.25, 8);
    expect(result.position.y).toBeCloseTo(19.85, 8);
  });

  it("(20) no input + no gravity → position drifts with existing velocity", () => {
    // Given — ship moving diagonally, no forces
    const vel = { x: 200, y: -400 };
    const state = makeState({ position: { x: 5, y: 5 }, velocity: vel });

    // When — 2 s tick
    const result = ShipControlManager.update(state, noInput(), makeConfig(), null, 2000);

    // Then — position = 5 + 200×2/1000, 5 + (−400)×2/1000
    expect(result.position.x).toBeCloseTo(5.4, 8);
    expect(result.position.y).toBeCloseTo(4.2, 8);
    // Velocity unchanged
    expect(result.velocity.x).toBeCloseTo(200, 8);
    expect(result.velocity.y).toBeCloseTo(-400, 8);
  });
});

// ── (21–22) Speed cap ─────────────────────────────────────────────────────────

describe("ShipControlManager — speed cap", () => {
  it("(21) maxSpeedMs clamps velocity magnitude, preserving direction", () => {
    // Given — ship moving at (600, 800) m/s (speed = 1000 m/s), cap = 500 m/s
    const state = makeState({ velocity: { x: 600, y: 800 } });
    const config = makeConfig({ maxSpeedMs: 500 });

    // When — zero deltaMs to skip position/thrust changes, just apply cap
    const result = ShipControlManager.update(state, noInput(), config, null, 0);

    // Then — speed clamped to 500, direction preserved (3:4 ratio)
    const speed = mag(result.velocity);
    expect(speed).toBeCloseTo(500, 5);
    // Direction: original was (0.6, 0.8), should be same after clamping
    expect(result.velocity.x / speed).toBeCloseTo(0.6, 5);
    expect(result.velocity.y / speed).toBeCloseTo(0.8, 5);
  });

  it("(22) velocity below cap is unaffected", () => {
    // Given — ship moving at (30, 40) m/s (speed = 50), cap = 500 m/s
    const state = makeState({ velocity: { x: 30, y: 40 } });
    const config = makeConfig({ maxSpeedMs: 500 });

    // When
    const result = ShipControlManager.update(state, noInput(), config, null, 0);

    // Then — velocity unchanged
    expect(result.velocity.x).toBeCloseTo(30, 8);
    expect(result.velocity.y).toBeCloseTo(40, 8);
  });
});

// ── (23–24) Simultaneous inputs ───────────────────────────────────────────────

describe("ShipControlManager — simultaneous inputs", () => {
  it("(23) forward + strafe right both applied independently (facing North)", () => {
    // Given — ship at rest, facing North (0), W + ArrowRight
    const state = makeState({ headingRadians: 0 });
    const config = makeConfig({ thrusterPower: 100 });
    const input: ShipControlInput = {
      ...noInput(),
      thrustForward: true,
      strafeRight: true,
    };
    const deltaMs = 1000;

    // When
    const result = ShipControlManager.update(state, input, config, null, deltaMs);

    // Then — northward thrust (−y) + eastward strafe (+x), each 100 m/s
    expect(result.velocity.x).toBeCloseTo(100, 6);
    expect(result.velocity.y).toBeCloseTo(-100, 6);
  });

  it("(24) rotation and thrust can occur in the same tick", () => {
    // Given — facing North (0), D held + W held
    const state = makeState({ headingRadians: 0 });
    const config = makeConfig({ thrusterPower: 100, turnRateRadPerS: Math.PI });
    const input: ShipControlInput = {
      ...noInput(),
      turnRight: true,
      thrustForward: true,
    };

    // When — 500 ms → heading turns π/2 → East, then W applies thrust East
    const result = ShipControlManager.update(state, input, config, null, 500);

    // Then — heading = π/2 (East)
    expect(result.headingRadians).toBeCloseTo(Math.PI / 2, 6);
    // Thrust was applied in the NEW heading (East), so velocity.x > 0
    expect(result.velocity.x).toBeGreaterThan(0);
    // isRotating and isThrustActive both true
    expect(result.isRotating).toBe(true);
    expect(result.isThrustActive).toBe(true);
  });
});

// ── (25–27) isThrustActive / isRotating flags ─────────────────────────────────

describe("ShipControlManager — status flags", () => {
  it("(25) isThrustActive is true when any thrust key is held", () => {
    const state = makeState();
    const config = makeConfig();

    for (const key of [
      "thrustForward",
      "thrustReverse",
      "strafeLeft",
      "strafeRight",
    ] as const) {
      const result = ShipControlManager.update(
        state,
        { ...noInput(), [key]: true },
        config,
        null,
        16,
      );
      expect(result.isThrustActive).toBe(true);
    }
  });

  it("(26) isRotating is true when A, D, or mouse heading target active", () => {
    const state = makeState();
    const config = makeConfig({ turnRateRadPerS: 0.1 });

    // D key
    expect(
      ShipControlManager.update(
        state,
        { ...noInput(), turnRight: true },
        config,
        null,
        16,
      ).isRotating,
    ).toBe(true);

    // A key
    expect(
      ShipControlManager.update(
        state,
        { ...noInput(), turnLeft: true },
        config,
        null,
        16,
      ).isRotating,
    ).toBe(true);

    // Mouse target far away (slow turn rate won't snap in 16 ms)
    expect(
      ShipControlManager.update(
        state,
        { ...noInput(), mouseHeadingTarget: Math.PI },
        config,
        null,
        16,
      ).isRotating,
    ).toBe(true);
  });

  it("(27) both flags are false with no input and no gravity", () => {
    const result = ShipControlManager.update(
      makeState(),
      noInput(),
      makeConfig(),
      null,
      16,
    );
    expect(result.isThrustActive).toBe(false);
    expect(result.isRotating).toBe(false);
  });
});

// ── (28–30) Heading helpers ───────────────────────────────────────────────────

describe("ShipControlManager — heading utility helpers", () => {
  it("(28) degreesToRadians / radiansToDegrees round-trip for cardinal points", () => {
    const cases = [0, 90, 180, 270, 360];
    for (const deg of cases) {
      const rad = ShipControlManager.degreesToRadians(deg);
      const back = ShipControlManager.radiansToDegrees(rad);
      expect(back).toBeCloseTo(deg % 360, 6);
    }
  });

  it("(28) degreesToRadians produces correct values", () => {
    expect(ShipControlManager.degreesToRadians(0)).toBeCloseTo(0, 10);
    expect(ShipControlManager.degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 10);
    expect(ShipControlManager.degreesToRadians(180)).toBeCloseTo(Math.PI, 10);
    expect(ShipControlManager.degreesToRadians(270)).toBeCloseTo((3 * Math.PI) / 2, 10);
  });

  it("(29) normalizeHeading handles negative angles and angles > 2π", () => {
    expect(ShipControlManager.normalizeHeading(-Math.PI / 2)).toBeCloseTo(
      (3 * Math.PI) / 2,
      8,
    );
    expect(ShipControlManager.normalizeHeading(3 * Math.PI)).toBeCloseTo(Math.PI, 8);
    expect(ShipControlManager.normalizeHeading(0)).toBeCloseTo(0, 10);
    expect(ShipControlManager.normalizeHeading(2 * Math.PI)).toBeCloseTo(0, 10);
  });

  it("(30) forwardVector and strafeRightVector are perpendicular unit vectors", () => {
    const headings = [0, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

    for (const h of headings) {
      const fwd = ShipControlManager.forwardVector(h);
      const rgt = ShipControlManager.strafeRightVector(h);

      // Unit vectors: magnitude ≈ 1
      expect(mag(fwd)).toBeCloseTo(1, 8);
      expect(mag(rgt)).toBeCloseTo(1, 8);

      // Perpendicular: dot product ≈ 0
      expect(dot(fwd, rgt)).toBeCloseTo(0, 8);
    }
  });
});

// ── Multi-frame / integration scenario ───────────────────────────────────────

describe("ShipControlManager — multi-frame scenario (Gherkin-style)", () => {
  it("ship moves forward then strafes, accumulating velocity correctly over frames", () => {
    /**
     * Given the player is undocked and in space
     * And the ship is at rest at (0, 0) facing North, thrusterPower = 100 m/s²
     */
    const config = makeConfig({ thrusterPower: 100, turnRateRadPerS: Math.PI });
    let state = makeState({ headingRadians: 0 });

    /**
     * When the player presses W for 3 frames × 100 ms
     */
    for (let i = 0; i < 3; i++) {
      state = ShipControlManager.update(
        state,
        { ...noInput(), thrustForward: true },
        config,
        null,
        100,
      );
    }

    /**
     * Then the ship should be moving northward (−y) at ~30 m/s
     */
    expect(state.velocity.y).toBeCloseTo(-30, 5);
    expect(state.velocity.x).toBeCloseTo(0, 8);

    /**
     * And when the player rotates 90° clockwise (D held for 500 ms)
     */
    state = ShipControlManager.update(
      state,
      { ...noInput(), turnRight: true },
      config,
      null,
      500,
    );
    expect(state.headingRadians).toBeCloseTo(Math.PI / 2, 5); // facing East

    /**
     * And then strafes right (ArrowRight) for 2 frames × 100 ms
     * (strafe-right when facing East = southward)
     */
    for (let i = 0; i < 2; i++) {
      state = ShipControlManager.update(
        state,
        { ...noInput(), strafeRight: true },
        config,
        null,
        100,
      );
    }

    /**
     * Then the ship has both northward (−y ≈ −30 m/s) and southward (+y ≈ +20 m/s)
     * velocity components — net northward ~−10 m/s, plus eastward ~0
     */
    expect(state.velocity.y).toBeCloseTo(-10, 5);
    // x velocity: strafe-right facing East = +y (not x), so x should still be ~0
    expect(state.velocity.x).toBeCloseTo(0, 6);
  });

  it("gravity integration over 30 frames pulls drifting ship toward star", () => {
    /**
     * Given the player ship is at (500, 0) with zero velocity
     * And a star is at (0, 0) with Earth-like gravity
     */
    const body = makeBody({ position: { x: 0, y: 0 }, radius: 100, gravityStrength: 9.8 });
    let state = makeState({ position: { x: 500, y: 0 }, velocity: { x: 0, y: 0 } });
    const config = makeConfig();

    /**
     * When the simulation runs for 30 frames of 16 ms with no thrust
     */
    for (let i = 0; i < 30; i++) {
      state = ShipControlManager.update(state, noInput(), config, body, 16);
    }

    /**
     * Then the ship should have moved closer to the star (x decreased)
     * And velocity should point toward the star (negative x)
     */
    expect(state.position.x).toBeLessThan(500);
    expect(state.velocity.x).toBeLessThan(0);
  });
});

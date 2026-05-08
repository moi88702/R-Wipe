/**
 * ShipControlManager — per-frame ship movement physics for solar-system mode.
 *
 * Translates WASD / arrow-key input into velocity changes, integrates
 * gravitational acceleration from a primary celestial body via GravitySystem,
 * and advances the ship's position by explicit Euler integration.
 *
 * Key design decisions:
 *  - Pure static API (no mutable instance state) — safe to call from any
 *    system without ownership concerns.
 *  - Heading convention: radians, 0 = North (up / −y), clockwise. Matches the
 *    degrees-based convention of SolarSystemSessionState after conversion.
 *  - Units: position in km, velocity in m/s, time in ms (converted internally
 *    to seconds for integration), acceleration in m/s².
 *  - No drag — pure Newtonian inertia so the player "slides" in space. An
 *    optional maxSpeedMs cap prevents runaway velocity.
 *
 * Input mapping (mirroring the product spec):
 *  - W              → forward thrust (ship's heading direction)
 *  - S              → reverse / retro-thrust (opposite heading)
 *  - A              → rotate counter-clockwise (turn left)
 *  - D              → rotate clockwise (turn right)
 *  - ArrowLeft      → strafe left (perpendicular to heading, leftward)
 *  - ArrowRight     → strafe right (perpendicular to heading, rightward)
 *  - mouseHeadingTarget (optional) → override keyboard turning; ship turns
 *    toward the mouse-cursor heading at the configured turn rate.
 */

import type { CelestialBody } from "../../types/solarsystem";
import { GravitySystem } from "./GravitySystem";

// ── Two-PI constant (avoids recomputing every frame) ──────────────────────────

const TWO_PI = 2 * Math.PI;

// ── Public interfaces ─────────────────────────────────────────────────────────

/**
 * Ship movement physics configuration.
 * Derived from the Ship Builder's computed stats and passed into each
 * ShipControlManager.update call.
 */
export interface ShipControlConfig {
  /**
   * Hull mass (kg).
   * Stored for physics reference and future extensions (e.g. momentum
   * decay, collision response). Heavier ships are more affected by gravity
   * relative to their thrust budget.
   */
  hullMass: number;

  /**
   * Forward / reverse thruster maximum acceleration (m/s²).
   * Applied directly each second when the thrust key is held.
   * Larger values produce snappier, more responsive ships.
   */
  thrusterPower: number;

  /**
   * Strafe thruster maximum acceleration (m/s²).
   * When omitted, strafe power defaults to the same value as thrusterPower.
   * Set this lower than thrusterPower to make lateral thrusters feel weaker.
   */
  strafePower?: number;

  /**
   * Maximum angular rotation rate (rad/s) when turning.
   * Higher values let the ship pivot faster; lower values require wider arcs.
   */
  turnRateRadPerS: number;

  /**
   * Angular acceleration (rad/s²). When provided, turning ramps up gradually
   * to turnRateRadPerS instead of snapping to full rate immediately.
   * Omit for legacy instant-rate behaviour.
   */
  turnAccelRadPerS2?: number;

  /**
   * Optional top-speed cap (m/s).
   * When provided, the ship's velocity magnitude is clamped to this value
   * after thrust and gravity have been integrated, preventing runaway speeds.
   * Omit for uncapped Newtonian drift (realistic but potentially hard to
   * control at high velocities).
   */
  maxSpeedMs?: number;
}

/**
 * Per-frame control input for the ship.
 *
 * Bridge this from InputState / InputHandler in the game-loop tick.
 * All boolean fields correspond to whether the relevant key is *held* this
 * frame (not edge-triggered — hold W to keep thrusting).
 */
export interface ShipControlInput {
  /** W key — apply thrust in the ship's current heading direction. */
  thrustForward: boolean;
  /** S key — apply thrust opposite the ship's heading (retro-burn). */
  thrustReverse: boolean;
  /** A key — rotate counter-clockwise (turn left). */
  turnLeft: boolean;
  /** D key — rotate clockwise (turn right). */
  turnRight: boolean;
  /** ArrowLeft key — strafe perpendicular-left relative to current heading. */
  strafeLeft: boolean;
  /** ArrowRight key — strafe perpendicular-right relative to current heading. */
  strafeRight: boolean;

  /**
   * Mouse-driven heading target (radians, same 0 = North clockwise convention
   * as ShipPhysicsState.headingRadians).
   *
   * When present (not null / undefined), keyboard turnLeft / turnRight are
   * ignored and the ship instead turns toward this angle at its configured
   * turnRateRadPerS.
   *
   * Pass null or omit the field to use keyboard turning.
   */
  mouseHeadingTarget?: number | null;
}

/**
 * Minimal in-flight physics state consumed and produced by ShipControlManager.
 * Mirrors the motion-relevant subset of SolarSystemSessionState.
 *
 * Units:
 *   position  → km  (world-space, matching CelestialBody.position)
 *   velocity  → m/s
 *   heading   → radians, 0 = North (−y), clockwise; range [0, 2π)
 */
export interface ShipPhysicsState {
  /** World-space position (km). */
  position: { x: number; y: number };
  /** Velocity vector (m/s). */
  velocity: { x: number; y: number };
  /**
   * Ship heading in radians.
   *  0   = North (up, −y screen direction)
   *  π/2 = East  (right, +x)
   *  π   = South (down, +y)
   * 3π/2 = West  (left, −x)
   * Range: [0, 2π).
   */
  headingRadians: number;
  /**
   * Current angular velocity (rad/s). Positive = clockwise, negative = CCW.
   * Optional: omit or set to 0 for legacy callers.
   * Only used when config.turnAccelRadPerS2 is set.
   */
  angularVelocity?: number;
}

/**
 * Result of one ShipControlManager.update tick.
 * Extends ShipPhysicsState with per-frame metadata for HUD indicators and FX.
 */
export interface ShipControlResult extends ShipPhysicsState {
  /**
   * True if any linear thrust (forward, reverse, or strafe) was applied this
   * frame. Used to toggle thruster-exhaust particle effects.
   */
  isThrustActive: boolean;
  /**
   * True if the ship is rotating this frame (keyboard turning or turning
   * toward a mouse heading target).
   */
  isRotating: boolean;
  /** Angular velocity carried forward (rad/s). Always present in result. */
  angularVelocity: number;
}

// ── ShipControlManager ────────────────────────────────────────────────────────

export class ShipControlManager {
  // ── Heading helpers ─────────────────────────────────────────────────────────

  /**
   * Convert degrees (0–359, clockwise from North) to radians (same convention).
   * Useful when bridging from SolarSystemSessionState.playerHeading.
   */
  static degreesToRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Convert radians (0 = North, clockwise) to degrees in [0, 360).
   * Useful when writing back to SolarSystemSessionState.playerHeading.
   */
  static radiansToDegrees(radians: number): number {
    const deg = (radians * 180) / Math.PI;
    return ((deg % 360) + 360) % 360;
  }

  /**
   * Normalise a heading to [0, 2π).
   * Handles large positive angles, negative angles, and multi-revolution
   * accumulation from continuous turning.
   */
  static normalizeHeading(radians: number): number {
    return ((radians % TWO_PI) + TWO_PI) % TWO_PI;
  }

  /**
   * Normalise an angle delta to (−π, π].
   * Returns the shortest-path signed rotation needed to reach a target heading.
   * Positive = clockwise, negative = counter-clockwise.
   */
  static normalizeAngleDiff(angle: number): number {
    let a = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
    if (a > Math.PI) a -= TWO_PI;
    return a;
  }

  // ── Direction vectors ────────────────────────────────────────────────────────

  /**
   * Unit vector in the ship's forward direction.
   *
   * Heading convention (0 = North = −y, clockwise):
   *   heading = 0    → (0, −1)  North
   *   heading = π/2  → (1,  0)  East
   *   heading = π    → (0,  1)  South
   *   heading = 3π/2 → (−1, 0)  West
   *
   * @param headingRad - Ship heading in radians.
   */
  static forwardVector(headingRad: number): { x: number; y: number } {
    return {
      x: Math.sin(headingRad),
      y: -Math.cos(headingRad),
    };
  }

  /**
   * Unit vector perpendicular to the forward direction, pointing to the ship's
   * right (strafe-right direction). This is the forward vector rotated 90°
   * clockwise.
   *
   *   heading = 0    → (1, 0)   East  (right when facing North)
   *   heading = π/2  → (0, 1)   South (right when facing East)
   *   heading = π    → (−1, 0)  West  (right when facing South)
   *   heading = 3π/2 → (0, −1)  North (right when facing West)
   *
   * @param headingRad - Ship heading in radians.
   */
  static strafeRightVector(headingRad: number): { x: number; y: number } {
    return {
      x: Math.cos(headingRad),
      y: Math.sin(headingRad),
    };
  }

  // ── Main update ─────────────────────────────────────────────────────────────

  /**
   * Compute the ship physics state after one simulation tick.
   *
   * Steps (in fixed order):
   *   1. Rotation  — rotate heading by turnRateRadPerS × Δt, OR turn toward
   *                  mouseHeadingTarget at the same rate.
   *   2. Thrust    — accumulate forward, reverse, and strafe accelerations;
   *                  integrate into velocity: v += a × Δt.
   *   3. Gravity   — apply GravitySystem.applyGravity from primaryBody (if any).
   *   4. Speed cap — optionally clamp velocity magnitude to maxSpeedMs.
   *   5. Position  — integrate position from final velocity: p += v × Δt / 1000.
   *                  (Division by 1000 converts m/s × s → km.)
   *
   * @param current     Current ship physics state.
   * @param input       Control inputs for this frame.
   * @param config      Ship stats driving the movement physics.
   * @param primaryBody Gravity source for this tick, or null for none.
   * @param deltaMs     Elapsed simulation time (ms).
   */
  static update(
    current: ShipPhysicsState,
    input: ShipControlInput,
    config: ShipControlConfig,
    primaryBody: CelestialBody | null,
    deltaMs: number,
  ): ShipControlResult {
    const dtS = deltaMs / 1000;
    const strafePower = config.strafePower ?? config.thrusterPower;

    // ── 1. Rotation ─────────────────────────────────────────────────────────
    let headingRad = current.headingRadians;
    let angularVel = current.angularVelocity ?? 0;
    let isRotating = false;

    const mouseTarget = input.mouseHeadingTarget;
    if (mouseTarget !== null && mouseTarget !== undefined) {
      // Mouse-driven turning: rotate toward the target at the configured rate.
      const diff = ShipControlManager.normalizeAngleDiff(mouseTarget - headingRad);
      const maxTurn = config.turnRateRadPerS * dtS;
      if (Math.abs(diff) <= maxTurn) {
        headingRad = mouseTarget;
        angularVel = 0;
      } else {
        headingRad += Math.sign(diff) * maxTurn;
        angularVel = Math.sign(diff) * config.turnRateRadPerS;
        isRotating = true;
      }
    } else if (config.turnAccelRadPerS2 !== undefined) {
      // Accelerated keyboard turning: ramp up/down angular velocity.
      const dir = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
      if (dir !== 0) {
        angularVel += dir * config.turnAccelRadPerS2 * dtS;
        // Clamp to configured maximum rate
        angularVel = Math.max(-config.turnRateRadPerS, Math.min(config.turnRateRadPerS, angularVel));
        isRotating = true;
      } else {
        // Decelerate: exponential decay toward zero
        angularVel *= Math.exp(-8 * dtS);
        if (Math.abs(angularVel) < 0.001) angularVel = 0;
        isRotating = Math.abs(angularVel) > 0.001;
      }
      headingRad += angularVel * dtS;
    } else if (input.turnLeft || input.turnRight) {
      // Legacy instant-rate keyboard turning.
      const dir = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
      angularVel = dir * config.turnRateRadPerS;
      headingRad += angularVel * dtS;
      isRotating = true;
    } else {
      angularVel = 0;
    }

    headingRad = ShipControlManager.normalizeHeading(headingRad);

    // ── 2. Thrust ────────────────────────────────────────────────────────────
    const fwd = ShipControlManager.forwardVector(headingRad);
    const rgt = ShipControlManager.strafeRightVector(headingRad);

    let ax = 0;
    let ay = 0;
    let isThrustActive = false;

    if (input.thrustForward) {
      ax += fwd.x * config.thrusterPower;
      ay += fwd.y * config.thrusterPower;
      isThrustActive = true;
    }
    if (input.thrustReverse) {
      ax -= fwd.x * config.thrusterPower;
      ay -= fwd.y * config.thrusterPower;
      isThrustActive = true;
    }
    if (input.strafeRight) {
      ax += rgt.x * strafePower;
      ay += rgt.y * strafePower;
      isThrustActive = true;
    }
    if (input.strafeLeft) {
      ax -= rgt.x * strafePower;
      ay -= rgt.y * strafePower;
      isThrustActive = true;
    }

    // v += a × Δt  (m/s² × s = m/s)
    let vx = current.velocity.x + ax * dtS;
    let vy = current.velocity.y + ay * dtS;

    // ── 3. Gravity ───────────────────────────────────────────────────────────
    if (primaryBody !== null) {
      const gravVel = GravitySystem.applyGravity(
        current.position,
        { x: vx, y: vy },
        primaryBody,
        deltaMs,
      );
      vx = gravVel.x;
      vy = gravVel.y;
    }

    // ── 4. Speed cap ─────────────────────────────────────────────────────────
    if (config.maxSpeedMs !== undefined) {
      const speedSq = vx * vx + vy * vy;
      const capSq = config.maxSpeedMs * config.maxSpeedMs;
      if (speedSq > capSq) {
        const scale = config.maxSpeedMs / Math.sqrt(speedSq);
        vx *= scale;
        vy *= scale;
      }
    }

    // ── 5. Position integration ──────────────────────────────────────────────
    // position in km, velocity in m/s → Δpos (km) = vel (m/s) × Δt (s) / 1000
    const newPosX = current.position.x + (vx * dtS) / 1000;
    const newPosY = current.position.y + (vy * dtS) / 1000;

    return {
      position: { x: newPosX, y: newPosY },
      velocity: { x: vx, y: vy },
      headingRadians: headingRad,
      angularVelocity: angularVel,
      isThrustActive,
      isRotating,
    };
  }
}

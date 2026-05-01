/**
 * HUDSystem – orchestrates HUD data collection and rendering for solar-system combat.
 *
 * Each frame, collects the current state from:
 * - Ship's targeting state (locks)
 * - Ship's health and shield
 * - Ability cooldowns
 * - Navigation waypoints
 *
 * Then delegates to HUDRenderer for actual drawing.
 *
 * This is a pure-logic system with no Pixi dependency — it constructs
 * HUDRenderData from game state and can be tested independently.
 */

import type { TargetingState } from "./combat/types";
import type { Waypoint } from "../types";
import type { HUDRenderData, WaypointMarker } from "../rendering/HUDRenderer";

export class HUDSystem {
  /**
   * Construct HUD render data from current game state.
   *
   * Called once per frame to populate HUD display elements.
   */
  static buildHUDData(options: {
    playerTargetingState: TargetingState;
    playerHealth: number;
    playerMaxHealth: number;
    playerShield: number;
    playerMaxShield: number;
    abilityCooldownsMs: Record<"B" | "V" | "C" | "X" | "Z", number>;
    maxAbilityCooldownMs: Record<"B" | "V" | "C" | "X" | "Z", number>;
    currentWaypoints?: Waypoint[];
    playerPositionKm?: { x: number; y: number };
  }): HUDRenderData {
    // Convert absolute cooldown times to 0–1 ratios
    const abilityCooldowns: Record<"B" | "V" | "C" | "X" | "Z", number> = {
      B: this.calculateCooldownRatio(
        options.abilityCooldownsMs.B,
        options.maxAbilityCooldownMs.B,
      ),
      V: this.calculateCooldownRatio(
        options.abilityCooldownsMs.V,
        options.maxAbilityCooldownMs.V,
      ),
      C: this.calculateCooldownRatio(
        options.abilityCooldownsMs.C,
        options.maxAbilityCooldownMs.C,
      ),
      X: this.calculateCooldownRatio(
        options.abilityCooldownsMs.X,
        options.maxAbilityCooldownMs.X,
      ),
      Z: this.calculateCooldownRatio(
        options.abilityCooldownsMs.Z,
        options.maxAbilityCooldownMs.Z,
      ),
    };

    // Convert waypoints to HUD markers
    const waypointMarkers: WaypointMarker[] = (options.currentWaypoints ?? []).map(
      (wp) => ({
        name: wp.targetId,
        positionKm: wp.targetPosition,
        color: this.rgbToHex(wp.color.r, wp.color.g, wp.color.b),
        type: wp.type,
      }),
    );

    return {
      playerLocks: options.playerTargetingState,
      shipHealth: options.playerHealth,
      shipMaxHealth: options.playerMaxHealth,
      shipShield: options.playerShield,
      shipMaxShield: options.playerMaxShield,
      abilityCooldowns,
      waypointMarkers,
      playerPositionKm: options.playerPositionKm ?? { x: 0, y: 0 },
    };
  }

  /**
   * Convert absolute cooldown milliseconds to a 0–1 ratio.
   * 0 = ready (no cooldown), 1 = full cooldown.
   */
  private static calculateCooldownRatio(currentMs: number, maxMs: number): number {
    if (maxMs <= 0) return 0;
    return Math.max(0, Math.min(1, currentMs / maxMs));
  }

  /**
   * Convert RGB values (0–255) to a hex color number.
   */
  private static rgbToHex(r: number, g: number, b: number): number {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }
}

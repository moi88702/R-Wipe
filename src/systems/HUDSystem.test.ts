/**
 * HUDSystem tests — data construction for HUD rendering.
 *
 * Tests that HUDSystem correctly builds HUD render data from game state,
 * including lock display, status metrics, cooldown ratios, and waypoint conversion.
 */

import { describe, it, expect } from "vitest";
import { HUDSystem } from "./HUDSystem";
import type { TargetingState, TargetLock } from "./combat/types";
import type { Waypoint } from "../types";

describe("HUDSystem", () => {
  describe("buildHUDData", () => {
    it("converts targeting state to HUD-renderable format with locks", () => {
      const state: TargetingState = {
        allLocks: [
          {
            id: "lock-1",
            targetId: "enemy-1",
            targetName: "Interceptor",
            lockedAtMs: 1000,
            distanceKm: 50,
            isFocused: true,
            lockStrength: 1.0,
          } as TargetLock,
        ],
        focusedLockId: "lock-1",
        lastTabCycleMs: 0,
        lastClickLockMs: 0,
      };

      const hud = HUDSystem.buildHUDData({
        playerTargetingState: state,
        playerHealth: 80,
        playerMaxHealth: 100,
        playerShield: 60,
        playerMaxShield: 100,
        abilityCooldownsMs: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
      });

      expect(hud.playerLocks.allLocks).toHaveLength(1);
      expect(hud.playerLocks.allLocks[0]?.targetName).toBe("Interceptor");
      expect(hud.shipHealth).toBe(80);
      expect(hud.shipMaxHealth).toBe(100);
    });

    it("converts cooldown milliseconds to 0–1 ratios", () => {
      const hud = HUDSystem.buildHUDData({
        playerTargetingState: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        playerHealth: 100,
        playerMaxHealth: 100,
        playerShield: 100,
        playerMaxShield: 100,
        abilityCooldownsMs: { B: 2500, V: 0, C: 5000, X: 1000, Z: 0 },
        maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
      });

      // B is half-way through cooldown
      expect(hud.abilityCooldowns.B).toBe(0.5);
      // V is ready (0 cooldown)
      expect(hud.abilityCooldowns.V).toBe(0);
      // C is full cooldown
      expect(hud.abilityCooldowns.C).toBe(1);
      // X is 20% through cooldown
      expect(hud.abilityCooldowns.X).toBeCloseTo(0.2);
      // Z is ready
      expect(hud.abilityCooldowns.Z).toBe(0);
    });

    it("clamps cooldown ratios to [0, 1]", () => {
      const hud = HUDSystem.buildHUDData({
        playerTargetingState: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        playerHealth: 100,
        playerMaxHealth: 100,
        playerShield: 100,
        playerMaxShield: 100,
        abilityCooldownsMs: {
          B: 10000, // Overflowed — should clamp to 1
          V: -1000, // Negative — should clamp to 0
          C: 0,
          X: 0,
          Z: 0,
        },
        maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
      });

      expect(hud.abilityCooldowns.B).toBe(1);
      expect(hud.abilityCooldowns.V).toBe(0);
    });

    it("converts waypoints to HUD markers with correct colors", () => {
      const waypoints: Waypoint[] = [
        {
          id: "wp-1",
          type: "primary",
          targetId: "loc-1",
          targetPosition: { x: 500, y: 1000 },
          color: { r: 255, g: 255, b: 0 }, // yellow
        } as Waypoint,
        {
          id: "wp-2",
          type: "secondary",
          targetId: "loc-2",
          targetPosition: { x: 5000, y: 2000 },
          color: { r: 255, g: 0, b: 255 }, // magenta
        } as Waypoint,
      ];

      const hud = HUDSystem.buildHUDData({
        playerTargetingState: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        playerHealth: 100,
        playerMaxHealth: 100,
        playerShield: 100,
        playerMaxShield: 100,
        abilityCooldownsMs: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
        currentWaypoints: waypoints,
      });

      expect(hud.waypointMarkers).toHaveLength(2);
      expect(hud.waypointMarkers[0]?.name).toBe("loc-1");
      expect(hud.waypointMarkers[0]?.color).toBe(0xffff00); // yellow
      expect(hud.waypointMarkers[1]?.name).toBe("loc-2");
      expect(hud.waypointMarkers[1]?.color).toBe(0xff00ff); // magenta
    });

    it("handles missing waypoints gracefully", () => {
      const hud = HUDSystem.buildHUDData({
        playerTargetingState: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        playerHealth: 100,
        playerMaxHealth: 100,
        playerShield: 100,
        playerMaxShield: 100,
        abilityCooldownsMs: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
        // currentWaypoints undefined
      });

      expect(hud.waypointMarkers).toEqual([]);
    });
  });
});

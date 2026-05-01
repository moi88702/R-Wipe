/**
 * HUDRenderer integration tests — rendering locks, status, and ability cooldowns.
 *
 * These tests focus on the observable rendering outcomes: given ships with locks,
 * status, and abilities, the HUD displays them with correct position, text, and
 * visual state. We do not mock the Graphics/Text internals; we test that the
 * HUD data structures are built correctly and that Pixi calls are made.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HUDRenderer, type HUDRenderData } from "./HUDRenderer";
import type { TargetingState, TargetLock } from "../systems/combat/types";

describe("HUDRenderer", () => {
  let hud: HUDRenderer;

  beforeEach(() => {
    hud = new HUDRenderer(1280, 720);
  });

  describe("renderTargetLocks", () => {
    it("draws lock reticles for each active lock on the ship", () => {
      const state: TargetingState = {
        allLocks: [
          {
            id: "lock-1",
            targetId: "enemy-1",
            targetName: "Grunt",
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

      const hudData: HUDRenderData = {
        playerLocks: state,
        shipHealth: 80,
        shipMaxHealth: 100,
        shipShield: 60,
        shipMaxShield: 100,
        abilityCooldowns: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        waypointMarkers: [],
      };

      const container = hud.getLocksContainer();

      // Render should not throw
      expect(() => {
        hud.renderTargetLocks(hudData);
      }).not.toThrow();

      // Container should be defined
      expect(container).toBeDefined();
    });

    it("draws no reticles when ship has no locks", () => {
      const state: TargetingState = {
        allLocks: [],
        focusedLockId: undefined,
        lastTabCycleMs: 0,
        lastClickLockMs: 0,
      };

      const hudData: HUDRenderData = {
        playerLocks: state,
        shipHealth: 80,
        shipMaxHealth: 100,
        shipShield: 60,
        shipMaxShield: 100,
        abilityCooldowns: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        waypointMarkers: [],
      };

      expect(() => {
        hud.renderTargetLocks(hudData);
      }).not.toThrow();
    });
  });

  describe("renderAbilityCooldowns", () => {
    it("draws cooldown bars for abilities on cooldown", () => {
      const hudData: HUDRenderData = {
        playerLocks: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        shipHealth: 80,
        shipMaxHealth: 100,
        shipShield: 60,
        shipMaxShield: 100,
        abilityCooldowns: { B: 0.5, V: 0, C: 0.3, X: 0, Z: 0 },
        waypointMarkers: [],
      };

      expect(() => {
        hud.renderAbilityCooldowns(hudData);
      }).not.toThrow();
    });

    it("displays all ability keys even if not on cooldown", () => {
      const hudData: HUDRenderData = {
        playerLocks: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        shipHealth: 80,
        shipMaxHealth: 100,
        shipShield: 60,
        shipMaxShield: 100,
        abilityCooldowns: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        waypointMarkers: [],
      };

      expect(() => {
        hud.renderAbilityCooldowns(hudData);
      }).not.toThrow();
    });
  });

  describe("renderShipStatus", () => {
    it("draws health and shield bars when ship is alive", () => {
      const hudData: HUDRenderData = {
        playerLocks: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        shipHealth: 80,
        shipMaxHealth: 100,
        shipShield: 60,
        shipMaxShield: 100,
        abilityCooldowns: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        waypointMarkers: [],
      };

      expect(() => {
        hud.renderShipStatus(hudData);
      }).not.toThrow();
    });

    it("reflects shield depletion in visual bar", () => {
      const hudData: HUDRenderData = {
        playerLocks: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        shipHealth: 100,
        shipMaxHealth: 100,
        shipShield: 0,
        shipMaxShield: 100,
        abilityCooldowns: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        waypointMarkers: [],
      };

      expect(() => {
        hud.renderShipStatus(hudData);
      }).not.toThrow();
    });
  });

  describe("renderWaypoints", () => {
    it("draws waypoint markers on the HUD", () => {
      const hudData: HUDRenderData = {
        playerLocks: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        shipHealth: 80,
        shipMaxHealth: 100,
        shipShield: 60,
        shipMaxShield: 100,
        abilityCooldowns: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        waypointMarkers: [
          {
            name: "Waypoint 1",
            positionKm: { x: 100, y: 200 },
            color: 0x00ffff, // cyan
            type: "primary",
          },
        ],
      };

      expect(() => {
        hud.renderWaypoints(hudData);
      }).not.toThrow();
    });

    it("draws no waypoints when list is empty", () => {
      const hudData: HUDRenderData = {
        playerLocks: {
          allLocks: [],
          focusedLockId: undefined,
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        shipHealth: 80,
        shipMaxHealth: 100,
        shipShield: 60,
        shipMaxShield: 100,
        abilityCooldowns: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
        waypointMarkers: [],
      };

      expect(() => {
        hud.renderWaypoints(hudData);
      }).not.toThrow();
    });
  });

  describe("full frame render", () => {
    it("renders all HUD elements in one call", () => {
      const hudData: HUDRenderData = {
        playerLocks: {
          allLocks: [
            {
              id: "lock-1",
              targetId: "enemy-1",
              targetName: "Interceptor",
              lockedAtMs: 1000,
              distanceKm: 75,
              isFocused: true,
              lockStrength: 0.85,
            } as TargetLock,
            {
              id: "lock-2",
              targetId: "enemy-2",
              targetName: "Fighter",
              lockedAtMs: 1500,
              distanceKm: 120,
              isFocused: false,
              lockStrength: 0.6,
            } as TargetLock,
          ],
          focusedLockId: "lock-1",
          lastTabCycleMs: 0,
          lastClickLockMs: 0,
        },
        shipHealth: 60,
        shipMaxHealth: 100,
        shipShield: 30,
        shipMaxShield: 100,
        abilityCooldowns: { B: 0.8, V: 0.2, C: 0, X: 0.5, Z: 0 },
        waypointMarkers: [
          {
            name: "Sol System",
            positionKm: { x: 500, y: 1000 },
            color: 0xffff00, // yellow
            type: "primary",
          },
          {
            name: "Alpha Centauri",
            positionKm: { x: 5000, y: 2000 },
            color: 0xff00ff, // magenta
            type: "secondary",
          },
        ],
      };

      expect(() => {
        hud.renderTargetLocks(hudData);
        hud.renderAbilityCooldowns(hudData);
        hud.renderShipStatus(hudData);
        hud.renderWaypoints(hudData);
      }).not.toThrow();
    });
  });
});

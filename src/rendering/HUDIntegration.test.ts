/**
 * HUD Integration tests — HUDRenderer + HUDSystem working together.
 *
 * These tests verify that the HUD systems work correctly end-to-end when
 * rendering combat state with locks, cooldowns, and status information.
 */

import { describe, it, expect } from "vitest";
import { HUDRenderer } from "./HUDRenderer";
import { HUDSystem } from "../systems/HUDSystem";
import type { TargetingState, TargetLock } from "../systems/combat/types";
import type { Waypoint } from "../types";

describe("HUD Integration — Renderer + System", () => {
  it("renders a complete HUD with locks, abilities, status, and waypoints", () => {
    const hud = new HUDRenderer(1280, 720);

    // Set up player combat state with locks
    const playerTargetingState: TargetingState = {
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
    };

    // Set up waypoints
    const waypoints: Waypoint[] = [
      {
        id: "wp-primary",
        type: "primary",
        targetId: "sol-system",
        targetPosition: { x: 500, y: 1000 },
        color: { r: 255, g: 255, b: 0 }, // yellow
      } as Waypoint,
    ];

    // Build HUD data from game state
    const hudData = HUDSystem.buildHUDData({
      playerTargetingState,
      playerHealth: 60,
      playerMaxHealth: 100,
      playerShield: 40,
      playerMaxShield: 100,
      abilityCooldownsMs: { B: 1000, V: 0, C: 2000, X: 500, Z: 0 },
      maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
      currentWaypoints: waypoints,
    });

    // Render all HUD elements
    expect(() => {
      hud.renderTargetLocks(hudData);
      hud.renderAbilityCooldowns(hudData);
      hud.renderShipStatus(hudData);
      hud.renderWaypoints(hudData);
    }).not.toThrow();

    // Verify locks were built correctly
    expect(hudData.playerLocks.allLocks).toHaveLength(2);
    expect(hudData.playerLocks.focusedLockId).toBe("lock-1");

    // Verify status is correct
    expect(hudData.shipHealth).toBe(60);
    expect(hudData.shipMaxHealth).toBe(100);
    expect(hudData.shipShield).toBe(40);

    // Verify cooldowns are converted to 0–1 ratios
    expect(hudData.abilityCooldowns.B).toBe(0.2); // 1000/5000
    expect(hudData.abilityCooldowns.V).toBe(0); // 0/5000
    expect(hudData.abilityCooldowns.C).toBe(0.4); // 2000/5000

    // Verify waypoints are converted correctly
    expect(hudData.waypointMarkers).toHaveLength(1);
    expect(hudData.waypointMarkers[0]?.name).toBe("sol-system");
    expect(hudData.waypointMarkers[0]?.color).toBe(0xffff00); // yellow
  });

  it("handles empty locks and ready abilities gracefully", () => {
    const hud = new HUDRenderer(1280, 720);

    const playerTargetingState: TargetingState = {
      allLocks: [],
      focusedLockId: undefined,
      lastTabCycleMs: 0,
      lastClickLockMs: 0,
    };

    const hudData = HUDSystem.buildHUDData({
      playerTargetingState,
      playerHealth: 100,
      playerMaxHealth: 100,
      playerShield: 100,
      playerMaxShield: 100,
      abilityCooldownsMs: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
      maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
    });

    expect(() => {
      hud.renderTargetLocks(hudData);
      hud.renderAbilityCooldowns(hudData);
      hud.renderShipStatus(hudData);
      hud.renderWaypoints(hudData);
    }).not.toThrow();

    expect(hudData.playerLocks.allLocks).toHaveLength(0);
    expect(hudData.abilityCooldowns.B).toBe(0);
    expect(hudData.shipHealth).toBe(100);
  });

  it("updates HUD when focused lock changes", () => {
    const playerTargetingState: TargetingState = {
      allLocks: [
        {
          id: "lock-1",
          targetId: "enemy-1",
          targetName: "Interceptor",
          lockedAtMs: 1000,
          distanceKm: 75,
          isFocused: true, // initially focused
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
    };

    let hudData = HUDSystem.buildHUDData({
      playerTargetingState,
      playerHealth: 100,
      playerMaxHealth: 100,
      playerShield: 100,
      playerMaxShield: 100,
      abilityCooldownsMs: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
      maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
    });

    expect(hudData.playerLocks.focusedLockId).toBe("lock-1");

    // Simulate Tab-cycling to next lock
    playerTargetingState.focusedLockId = "lock-2";
    const lock0 = playerTargetingState.allLocks[0];
    const lock1 = playerTargetingState.allLocks[1];
    if (lock0) lock0.isFocused = false;
    if (lock1) lock1.isFocused = true;

    hudData = HUDSystem.buildHUDData({
      playerTargetingState,
      playerHealth: 100,
      playerMaxHealth: 100,
      playerShield: 100,
      playerMaxShield: 100,
      abilityCooldownsMs: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
      maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
    });

    expect(hudData.playerLocks.focusedLockId).toBe("lock-2");
    expect(hudData.playerLocks.allLocks[1]?.isFocused).toBe(true);
  });

  it("updates HUD when ship health decreases", () => {
    const playerTargetingState: TargetingState = {
      allLocks: [],
      focusedLockId: undefined,
      lastTabCycleMs: 0,
      lastClickLockMs: 0,
    };

    // Full health
    let hudData = HUDSystem.buildHUDData({
      playerTargetingState,
      playerHealth: 100,
      playerMaxHealth: 100,
      playerShield: 100,
      playerMaxShield: 100,
      abilityCooldownsMs: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
      maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
    });

    expect(hudData.shipHealth).toBe(100);
    expect(hudData.shipShield).toBe(100);

    // Damaged: shield fully depleted, health reduced
    hudData = HUDSystem.buildHUDData({
      playerTargetingState,
      playerHealth: 70,
      playerMaxHealth: 100,
      playerShield: 0,
      playerMaxShield: 100,
      abilityCooldownsMs: { B: 0, V: 0, C: 0, X: 0, Z: 0 },
      maxAbilityCooldownMs: { B: 5000, V: 5000, C: 5000, X: 5000, Z: 5000 },
    });

    expect(hudData.shipHealth).toBe(70);
    expect(hudData.shipShield).toBe(0);
  });
});

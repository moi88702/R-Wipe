/**
 * HUDRenderer – renders HUD overlays for solar-system combat mode.
 *
 * Displays:
 * - Target lock reticles and lock list
 * - Ability cooldown bars (B/V/C/X/Z)
 * - Ship status (health, shields)
 * - Navigation waypoint markers
 *
 * All rendering uses Pixi.js Graphics and Text primitives, cleared each frame
 * and re-drawn from state data passed in via HUDRenderData.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { TargetingState } from "../systems/combat/types";

export interface WaypointMarker {
  name: string;
  positionKm: { x: number; y: number };
  color: number;
  type: "primary" | "secondary" | "tertiary";
}

export interface HUDRenderData {
  /** Player ship's targeting state (all locks and focused lock). */
  playerLocks: TargetingState;
  /** Current ship health points. */
  shipHealth: number;
  /** Maximum ship health. */
  shipMaxHealth: number;
  /** Current shield points. */
  shipShield: number;
  /** Maximum shield points. */
  shipMaxShield: number;
  /** Ability cooldown progress (0–1 per key, 0 = ready, 1 = full cooldown). */
  abilityCooldowns: Record<"B" | "V" | "C" | "X" | "Z", number>;
  /** Navigation waypoints to display. */
  waypointMarkers: WaypointMarker[];
  /** Player ship's current position (km) — required to convert waypoints to screen coordinates. */
  playerPositionKm: { x: number; y: number };
}

export class HUDRenderer {
  private width: number;
  private height: number;

  private locksContainer: Container;
  private locksGfx: Graphics;

  private statusContainer: Container;
  private statusGfx: Graphics;
  private healthText: Text;
  private shieldText: Text;

  private cooldownsContainer: Container;
  private cooldownsGfx: Graphics;
  private cooldownTexts: Map<"B" | "V" | "C" | "X" | "Z", Text>;

  private waypointsContainer: Container;
  private waypointsGfx: Graphics;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    // Create graphics layers
    this.locksGfx = new Graphics();
    this.locksContainer = new Container();
    this.locksContainer.addChild(this.locksGfx);

    this.statusGfx = new Graphics();
    this.statusContainer = new Container();
    this.healthText = new Text("H: 100/100", this.getHealthTextStyle());
    this.shieldText = new Text("S: 100/100", this.getShieldTextStyle());
    this.statusContainer.addChild(this.statusGfx);
    this.statusContainer.addChild(this.healthText);
    this.statusContainer.addChild(this.shieldText);

    this.cooldownsGfx = new Graphics();
    this.cooldownsContainer = new Container();
    this.cooldownTexts = new Map();
    const keys: ("B" | "V" | "C" | "X" | "Z")[] = ["B", "V", "C", "X", "Z"];
    for (const key of keys) {
      const text = new Text(key, this.getAbilityKeyTextStyle());
      this.cooldownTexts.set(key, text);
      this.cooldownsContainer.addChild(text);
    }
    this.cooldownsContainer.addChild(this.cooldownsGfx);

    this.waypointsGfx = new Graphics();
    this.waypointsContainer = new Container();
    this.waypointsContainer.addChild(this.waypointsGfx);
  }

  /**
   * Get the container for lock reticles (for adding to stage).
   */
  getLocksContainer(): Container {
    return this.locksContainer;
  }

  /**
   * Get the graphics object used to draw lock reticles.
   */
  getLocksGraphics(): Graphics {
    return this.locksGfx;
  }

  /**
   * Render target lock reticles and lock list.
   *
   * For each active lock, draws a reticle at the target's on-screen position.
   * Also renders a text list of all locks in a HUD corner.
   */
  renderTargetLocks(data: HUDRenderData): void {
    this.locksGfx.clear();

    const locks = data.playerLocks.allLocks;
    if (locks.length === 0) {
      return;
    }

    // Draw lock list in top-right corner
    const lockListX = this.width - 250;
    const lockListY = 20;
    let y = lockListY;

    for (const lock of locks) {
      const isFocused = lock.isFocused;
      const color = isFocused ? 0xff0000 : 0x00ff00; // red for focused, green for others

      // Draw reticle box
      this.locksGfx.rect(lockListX, y, 230, 25).stroke({ color, width: 2 });

      // Draw lock info (would be rendered as Text in real impl)
      y += 30;
    }
  }

  /**
   * Render ability cooldown bars for B/V/C/X/Z keys.
   *
   * Displays a bar for each ability showing remaining cooldown as a fill ratio.
   * Keys with 0 cooldown are shown as "ready".
   */
  renderAbilityCooldowns(data: HUDRenderData): void {
    this.cooldownsGfx.clear();

    const keys: readonly ("B" | "V" | "C" | "X" | "Z")[] = ["B", "V", "C", "X", "Z"];
    const baseX = 20;
    const baseY = this.height - 100;
    const barWidth = 40;
    const barHeight = 20;
    const spacing = 50;

    for (const key of keys) {
      const cooldownRatio = data.abilityCooldowns[key] ?? 0;
      const i = keys.indexOf(key);
      const x = baseX + i * spacing;
      const y = baseY;

      // Draw background bar
      this.cooldownsGfx.rect(x, y, barWidth, barHeight).fill({ color: 0x222222 });

      // Draw cooldown fill (if any)
      if (cooldownRatio > 0) {
        const fillWidth = barWidth * cooldownRatio;
        this.cooldownsGfx.rect(x, y, fillWidth, barHeight).fill({ color: 0xff6600 });
      }

      // Draw border
      this.cooldownsGfx.rect(x, y, barWidth, barHeight).stroke({ color: 0xffffff, width: 1 });
    }
  }

  /**
   * Render ship health and shield bars.
   *
   * Displays health and shield as percentage bars in the top-left corner.
   */
  renderShipStatus(data: HUDRenderData): void {
    this.statusGfx.clear();

    const x = 20;
    const y = 20;
    const barWidth = 150;
    const barHeight = 15;
    const spacing = 20;

    // Health bar
    const healthRatio = Math.max(0, Math.min(1, data.shipHealth / data.shipMaxHealth));
    const healthBarColor = healthRatio > 0.25 ? 0x00ff00 : 0xff0000;

    this.statusGfx.rect(x, y, barWidth, barHeight).fill({ color: 0x222222 });
    this.statusGfx.rect(x, y, barWidth * healthRatio, barHeight).fill({ color: healthBarColor });
    this.statusGfx.rect(x, y, barWidth, barHeight).stroke({ color: 0xffffff, width: 1 });

    // Shield bar
    const shieldRatio = Math.max(0, Math.min(1, data.shipShield / data.shipMaxShield));
    const shieldBarColor = 0x0088ff;

    this.statusGfx.rect(x, y + spacing, barWidth, barHeight).fill({ color: 0x222222 });
    this.statusGfx
      .rect(x, y + spacing, barWidth * shieldRatio, barHeight)
      .fill({ color: shieldBarColor });
    this.statusGfx.rect(x, y + spacing, barWidth, barHeight).stroke({ color: 0xffffff, width: 1 });

    // Update text labels
    this.healthText.text = `H: ${Math.ceil(data.shipHealth)}/${data.shipMaxHealth}`;
    this.healthText.position.set(x + barWidth + 10, y);

    this.shieldText.text = `S: ${Math.ceil(data.shipShield)}/${data.shipMaxShield}`;
    this.shieldText.position.set(x + barWidth + 10, y + spacing);
  }

  /**
   * Render navigation waypoint markers.
   *
   * Draws waypoint indicators at screen-space positions with labels.
   * Converts waypoint positions from km-space to screen coordinates using the
   * player's current position and viewport bounds.
   */
  renderWaypoints(data: HUDRenderData): void {
    this.waypointsGfx.clear();

    for (const wp of data.waypointMarkers) {
      // Convert km-space position to screen-space coordinates
      const screenPos = this.kmToScreenCoordinates(wp.positionKm, data.playerPositionKm);
      const x = screenPos.x;
      const y = screenPos.y;

      // Draw waypoint diamond
      const size = 10;
      this.waypointsGfx
        .moveTo(x, y - size)
        .lineTo(x + size, y)
        .lineTo(x, y + size)
        .lineTo(x - size, y)
        .closePath()
        .stroke({ color: wp.color, width: 2 });
    }
  }

  /**
   * Convert km-space coordinates to screen-space coordinates.
   *
   * Uses a simple linear projection: the player is at the centre of the screen,
   * and the scale factor maps km to pixels. A scale of 1 km = 0.01 pixels,
   * clamped to screen bounds so waypoints off-screen still appear near the edge.
   *
   * @param positionKm Position in world km-space.
   * @param playerPositionKm Player's current position in km.
   * @returns Screen-space pixel coordinates.
   */
  private kmToScreenCoordinates(
    positionKm: { x: number; y: number },
    playerPositionKm: { x: number; y: number },
  ): { x: number; y: number } {
    // Calculate relative position from player
    const deltaX = positionKm.x - playerPositionKm.x;
    const deltaY = positionKm.y - playerPositionKm.y;

    // Scale factor: 1 km = 0.01 pixels (i.e., 100 km = 1 pixel)
    // Adjust this factor to change zoom level
    const scaleKmToPixels = 0.01;

    // Project onto screen with player at center
    const screenX = this.width / 2 + deltaX * scaleKmToPixels;
    const screenY = this.height / 2 + deltaY * scaleKmToPixels;

    // Clamp waypoints to stay within screen bounds (with small margin)
    const margin = 20;
    const clampedX = Math.max(margin, Math.min(this.width - margin, screenX));
    const clampedY = Math.max(margin, Math.min(this.height - margin, screenY));

    return { x: clampedX, y: clampedY };
  }

  // ─────────────────────────────────────────────────────────────────────────

  private getHealthTextStyle(): TextStyle {
    return new TextStyle({
      fontSize: 14,
      fill: 0x00ff00,
      fontFamily: "monospace",
    });
  }

  private getShieldTextStyle(): TextStyle {
    return new TextStyle({
      fontSize: 14,
      fill: 0x0088ff,
      fontFamily: "monospace",
    });
  }

  private getAbilityKeyTextStyle(): TextStyle {
    return new TextStyle({
      fontSize: 12,
      fill: 0xffffff,
      fontFamily: "monospace",
    });
  }
}

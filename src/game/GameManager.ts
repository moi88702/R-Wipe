/**
 * GameManager – top-level orchestrator.
 *
 * Owns every subsystem and drives the per-frame update + render cycle based on
 * the current screen. Screen transitions (main-menu ↔ gameplay ↔ game-over) are
 * driven by input.
 */

import type { Application } from "pixi.js";
import type { DevCheats, EnemyType, PowerUp, Projectile, ScreenType } from "../types/index";
import { InputHandler } from "../input/InputHandler";
import { StateManager } from "../managers/StateManager";
import { PlayerManager } from "../managers/PlayerManager";
import { EnemyManager } from "../managers/EnemyManager";
import { LevelManager } from "../managers/LevelManager";
import { PowerUpManager } from "../managers/PowerUpManager";
import { OverworldManager } from "../managers/OverworldManager";
import { missionToLevelState } from "../managers/MissionManager";
import { BlueprintStore } from "../managers/BlueprintStore";
import { CollisionSystem } from "../systems/CollisionSystem";
import { GameRenderer, type PlayerBlueprintVisual, type ShipyardRenderData, type ShipyardPaletteTile } from "../rendering/GameRenderer";
import type { MissionId, NodeId } from "../types/campaign";
import type { Blueprint, PartCategory, PlacedPart } from "../types/shipBuilder";
import { STARTER_SECTOR } from "./campaign/StarterSector";
import {
  PARTS_REGISTRY,
  DEFAULT_UNLOCKED_PARTS,
  makeStarterBlueprint,
  getPart,
} from "./parts/registry";
import { computeShipStats } from "./parts/stats";
import { layoutBlueprint, type Placement } from "./parts/geometry";
import { canSnap } from "./parts/assembly";

/** Menu item ids used by updateMenu / updatePause. */
type MainMenuItem = "play" | "campaign" | "shipyard" | "stats";
type PauseMenuItem = "continue" | "stats" | "quit";
const MAIN_MENU_ITEMS: readonly MainMenuItem[] = ["play", "campaign", "shipyard", "stats"];
const PAUSE_MENU_ITEMS: readonly PauseMenuItem[] = ["continue", "stats", "quit"];

export interface GameManagerOptions {
  width: number;
  height: number;
}

/** Minimum delay between menu-confirm triggers so a held key doesn't re-fire. */
const MENU_DEBOUNCE_MS = 350;

export class GameManager {
  private readonly width: number;
  private readonly height: number;

  private readonly state: StateManager;
  private readonly input: InputHandler;
  private readonly player: PlayerManager;
  private readonly enemies: EnemyManager;
  private readonly level: LevelManager;
  private readonly powerUps: PowerUpManager;
  private readonly collisions: CollisionSystem;
  private readonly renderer: GameRenderer;
  private readonly overworld: OverworldManager;
  private readonly blueprints: BlueprintStore;

  private safeTimerMs = 0;
  private menuDebounceMs = 0;

  /**
   * When non-null, gameplay is inside a campaign mission. Level-clear and
   * game-over branches both return to the starmap instead of advancing the
   * arcade level counter. Cleared when the mission resolves.
   */
  private activeMissionId: MissionId | null = null;
  /** Starmap selection index into `overworld.getSector().nodes`. */
  private starmapSelection = 0;
  /**
   * Working copy of the blueprint being edited inside the shipyard. Null when
   * the shipyard is closed. Committed back to the store on SAVE; discarded on
   * BACK.
   */
  private shipyardBlueprint: Blueprint | null = null;
  /** Part id currently "held" by the cursor, waiting to be snapped. */
  private shipyardHeldPartId: string | null = null;
  /** Selected placed part on the ship canvas (for deletion). */
  private shipyardSelectedPlacedId: string | null = null;
  /** Auto-incrementing counter used to make unique PlacedPart ids in the editor. */
  private shipyardNextPlacedIdx = 0;
  /** Transient status message shown in the shipyard (e.g. "SAVED", "FULL"). */
  private shipyardStatusMsg: string | null = null;
  private shipyardStatusMs = 0;

  // Edge-triggered menu input tracking. `prev*` mirrors last frame's poll.
  private prevPausePressed = false;
  private prevMenuConfirmPressed = false;
  private prevMenuBackPressed = false;
  private prevUpPressed = false;
  private prevDownPressed = false;
  /** Active selection index within the current menu list. */
  private menuSelection = 0;
  /** Where the stats screen should return to when ESC/back is pressed. */
  private statsReturnTo: ScreenType = "main-menu";

  // Death / respawn state machine
  /** While > 0, gameplay is paused on a death explosion. */
  private deathAnimationMs = 0;
  /** True when the in-flight death animation should end in game-over (no lives). */
  private finalDeath = false;
  /** True while the post-respawn 3s invulnerability is still up for early-cancel on fire. */
  private respawnInvulnArmed = false;
  /** Rising-edge detection for fire: only cancel on a fresh press, not a held key. */
  private prevFirePressed = false;
  /** After respawn, require fire to be released once before it can cancel invuln. */
  private awaitingFireRelease = false;

  // Level transition state machine
  /** While > 0, gameplay is frozen on a "level clear" banner + lingering boss FX. */
  private levelTransitionMs = 0;

  constructor(app: Application, opts: GameManagerOptions) {
    this.width = opts.width;
    this.height = opts.height;

    this.state = new StateManager(opts.width, opts.height);
    this.input = new InputHandler();
    this.player = new PlayerManager(opts.width, opts.height);
    this.enemies = new EnemyManager(opts.width, opts.height);
    this.level = new LevelManager(opts.height);
    this.powerUps = new PowerUpManager();
    this.collisions = new CollisionSystem();
    this.renderer = new GameRenderer(app, opts.width, opts.height);
    this.overworld = new OverworldManager(STARTER_SECTOR);
    try {
      this.overworld.load();
    } catch {
      // Corrupt / incompatible save — start fresh rather than crashing.
      this.overworld.clearSaved();
    }

    this.blueprints = new BlueprintStore();
    try {
      this.blueprints.load();
    } catch {
      this.blueprints.clearSaved();
    }
    // Seed a sensible starter blueprint the first time campaign is opened
    // so the shipyard always has at least one option to equip.
    this.seedStarterBlueprintIfMissing();
  }

  /**
   * On first campaign launch the player has no saved ships. Drop a minimal
   * starter blueprint into the store (a starter core + a starter all-in-one
   * hull) so the shipyard always has something to open and equip.
   */
  private seedStarterBlueprintIfMissing(): void {
    if (this.blueprints.list().length > 0) return;
    const starter: Blueprint = makeStarterBlueprint();
    this.blueprints.upsert(starter);
    this.blueprints.save();
    // Auto-equip the starter if nothing is equipped yet so the first campaign
    // mission picks up its hitbox / HP without a shipyard visit.
    if (this.overworld.getState().inventory.equippedBlueprintId === null) {
      this.overworld.equipBlueprintForced(starter.id);
      try {
        this.overworld.save();
      } catch {
        // best-effort
      }
    }
  }

  /**
   * Wire drag-to-move / hold-to-fire / double-tap-bomb / two-finger-pause
   * gestures to the given element (typically the Pixi canvas).
   */
  enableTouchControls(element: HTMLElement): void {
    this.input.attachTouch(element, this.width, this.height);
  }

  /**
   * Wire mouse pointer events on the given element so menu screens (shipyard,
   * starmap) can respond to clicks. Safe to call alongside enableTouchControls.
   */
  enablePointerControls(element: HTMLElement): void {
    this.input.attachPointer(element, this.width, this.height);
  }

  // ── Public loop entry ────────────────────────────────────────────────────

  tick(deltaMs: number): void {
    const clamped = Math.min(deltaMs, 100); // cap to avoid huge jumps on tab-switch

    this.menuDebounceMs = Math.max(0, this.menuDebounceMs - clamped);
    const screen = this.state.getScreen();

    if (screen === "main-menu") {
      this.updateMenu();
    } else if (screen === "gameplay") {
      this.updateGameplay(clamped);
    } else if (screen === "pause") {
      this.updatePause();
    } else if (screen === "stats") {
      this.updateStats();
    } else if (screen === "game-over") {
      this.updateGameOver();
    } else if (screen === "starmap") {
      this.updateStarmap();
    } else if (screen === "shipyard") {
      this.updateShipyard(clamped);
    }

    // Commit edge-trigger prev-state AFTER all update*() have consumed edges.
    const input = this.input.poll();
    this.prevPausePressed = input.pause;
    this.prevMenuConfirmPressed = input.menuConfirm;
    this.prevMenuBackPressed = input.menuBack;
    this.prevUpPressed = input.moveUp;
    this.prevDownPressed = input.moveDown;

    this.renderFrame(clamped);

    // Clear one-frame touch pulses (bomb, menuConfirm, pause from a tap) so
    // they don't leak into the next frame. Must come after every poll() caller
    // in this tick has had a chance to see them.
    this.input.endFrame();
  }

  // ── Menu input helpers ───────────────────────────────────────────────────

  /** Moves the menu selection by ±1, wrapping, on Up/Down edge presses. */
  private stepMenuSelection(itemCount: number): void {
    const input = this.input.poll();
    const upEdge = input.moveUp && !this.prevUpPressed;
    const downEdge = input.moveDown && !this.prevDownPressed;
    if (upEdge) {
      this.menuSelection = (this.menuSelection - 1 + itemCount) % itemCount;
    }
    if (downEdge) {
      this.menuSelection = (this.menuSelection + 1) % itemCount;
    }
  }

  /** True when menuConfirm is newly pressed (edge-triggered). */
  private wasMenuConfirmPressed(): boolean {
    const input = this.input.poll();
    return input.menuConfirm && !this.prevMenuConfirmPressed;
  }

  /** True when menuBack is newly pressed (edge-triggered). */
  private wasMenuBackPressed(): boolean {
    const input = this.input.poll();
    return input.menuBack && !this.prevMenuBackPressed;
  }

  /** True when pause toggle (ESC/P) is newly pressed (edge-triggered). */
  private wasPausePressed(): boolean {
    const input = this.input.poll();
    return input.pause && !this.prevPausePressed;
  }

  /** Public accessor for the renderer. */
  getMenuSelection(): number {
    return this.menuSelection;
  }

  // ── Screen: main menu ────────────────────────────────────────────────────

  private updateMenu(): void {
    this.stepMenuSelection(MAIN_MENU_ITEMS.length);
    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      const pick = MAIN_MENU_ITEMS[this.menuSelection]!;
      if (pick === "play") {
        this.startNewRun();
      } else if (pick === "campaign") {
        this.openStarmap();
      } else if (pick === "shipyard") {
        this.openShipyard();
      } else {
        this.openStats("main-menu");
      }
    }
  }

  // ── Screen: pause ────────────────────────────────────────────────────────

  private updatePause(): void {
    // ESC closes the pause menu (toggle off).
    if (this.wasPausePressed() || this.wasMenuBackPressed()) {
      this.menuSelection = 0;
      this.state.setScreen("gameplay");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    this.stepMenuSelection(PAUSE_MENU_ITEMS.length);
    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      const pick = PAUSE_MENU_ITEMS[this.menuSelection]!;
      if (pick === "continue") {
        this.menuSelection = 0;
        this.state.setScreen("gameplay");
      } else if (pick === "stats") {
        this.openStats("pause");
      } else if (pick === "quit") {
        // Finalize run so quit counts the session in all-time stats.
        this.state.finalizeRun("no-lives");
        this.menuSelection = 0;
        this.state.setScreen("main-menu");
      }
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    }
  }

  // ── Screen: stats ────────────────────────────────────────────────────────

  private updateStats(): void {
    if (
      (this.wasMenuBackPressed() || this.wasMenuConfirmPressed()) &&
      this.menuDebounceMs === 0
    ) {
      this.menuSelection = 0;
      this.state.setScreen(this.statsReturnTo);
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    }
  }

  private openStats(returnTo: ScreenType): void {
    this.statsReturnTo = returnTo;
    this.state.setScreen("stats");
    this.menuDebounceMs = MENU_DEBOUNCE_MS;
  }

  // ── Screen: game over ────────────────────────────────────────────────────

  private updateGameOver(): void {
    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      this.state.setScreen("main-menu");
      this.menuSelection = 0;
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    }
  }

  // ── Screen: shipyard (visual ship builder) ───────────────────────────────

  /**
   * Open the shipyard editor. Loads the equipped blueprint (deep-cloned) into
   * the working copy so edits can be discarded via BACK. If nothing is
   * equipped yet, fall back to a fresh starter blueprint.
   */
  private openShipyard(): void {
    const equippedId = this.overworld.getState().inventory.equippedBlueprintId;
    const source = equippedId ? this.blueprints.get(equippedId) : undefined;
    this.shipyardBlueprint = cloneBlueprint(source ?? makeStarterBlueprint());
    this.shipyardHeldPartId = null;
    this.shipyardSelectedPlacedId = null;
    this.shipyardNextPlacedIdx = this.shipyardBlueprint.parts.length;
    this.menuDebounceMs = MENU_DEBOUNCE_MS;
    this.state.setScreen("shipyard");
  }

  private updateShipyard(deltaMs: number): void {
    const bp = this.shipyardBlueprint;
    if (!bp) return;
    if (this.shipyardStatusMs > 0) {
      this.shipyardStatusMs = Math.max(0, this.shipyardStatusMs - deltaMs);
      if (this.shipyardStatusMs === 0) this.shipyardStatusMsg = null;
    }
    // Keyboard back — discard changes.
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.shipyardBlueprint = null;
      this.state.setScreen("main-menu");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    // Pointer: a tap may hit a palette tile, a socket, a placed part, or a button.
    const input = this.input.poll();
    const click = input.pointerDownPulse ?? null;
    const pointer = input.pointer ?? null;
    if (click && this.menuDebounceMs === 0) {
      this.handleShipyardClick(click.x, click.y);
    }
    // Keep the ghost alive for rendering — updateShipyard itself is purely
    // input-driven; ghost follows the live pointer in the render payload.
    void pointer;
  }

  /**
   * Routes a shipyard pointer-click to whichever interactable it landed on.
   * Order: buttons → palette → sockets → placed parts → empty (deselect).
   */
  private handleShipyardClick(gx: number, gy: number): void {
    const bp = this.shipyardBlueprint;
    if (!bp) return;
    const layout = SHIPYARD_LAYOUT;

    // 1) Buttons — always interactable.
    if (rectHit(layout.newBtn, gx, gy)) {
      const fresh = makeStarterBlueprint();
      // Fresh id so SAVE creates a new slot instead of overwriting the
      // template in the library.
      fresh.id = freshBlueprintId();
      fresh.name = `Design ${this.blueprints.list().length + 1}`;
      this.shipyardBlueprint = fresh;
      this.shipyardHeldPartId = null;
      this.shipyardSelectedPlacedId = null;
      this.shipyardNextPlacedIdx = fresh.parts.length;
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    if (rectHit(layout.saveBtn, gx, gy)) {
      const existing = this.blueprints.get(bp.id);
      if (!existing && this.blueprints.list().length >= MAX_SAVED_BLUEPRINTS) {
        this.setShipyardStatus(`LIBRARY FULL (${MAX_SAVED_BLUEPRINTS} max)`);
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
        return;
      }
      this.blueprints.upsert(cloneBlueprint(bp));
      try {
        this.blueprints.save();
      } catch {
        // best-effort
      }
      this.overworld.equipBlueprintForced(bp.id);
      try {
        this.overworld.save();
      } catch {
        // best-effort
      }
      this.setShipyardStatus(existing ? "UPDATED & EQUIPPED" : "SAVED & EQUIPPED");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    if (rectHit(layout.backBtn, gx, gy)) {
      this.shipyardBlueprint = null;
      this.state.setScreen("main-menu");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    if (rectHit(layout.trashBtn, gx, gy)) {
      if (this.shipyardSelectedPlacedId) {
        this.removePlacedPartAndDescendants(this.shipyardSelectedPlacedId);
        this.shipyardSelectedPlacedId = null;
      } else if (this.blueprints.get(bp.id)) {
        // Nothing selected on the canvas → delete the currently-loaded
        // saved design from the library.
        this.blueprints.delete(bp.id);
        try {
          this.blueprints.save();
        } catch {
          // best-effort
        }
        // If this was the equipped one, fall back to the next saved one
        // (or starter).
        const equipped = this.overworld.getState().inventory.equippedBlueprintId;
        if (equipped === bp.id) {
          const next = this.blueprints.list()[0];
          this.overworld.equipBlueprintForced(next ? next.id : null);
          try {
            this.overworld.save();
          } catch {
            // best-effort
          }
        }
        this.setShipyardStatus("DELETED");
      }
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    // 1b) Saved-ships panel — click a slot to load that blueprint.
    for (let i = 0; i < SHIPYARD_LAYOUT.savedSlotCount; i++) {
      const r = savedSlotRect(i);
      if (!rectHit(r, gx, gy)) continue;
      const entry = this.blueprints.list()[i];
      if (!entry) return; // empty slot — no-op
      this.shipyardBlueprint = cloneBlueprint(entry);
      this.shipyardHeldPartId = null;
      this.shipyardSelectedPlacedId = null;
      this.shipyardNextPlacedIdx = entry.parts.length;
      this.overworld.equipBlueprintForced(entry.id);
      try {
        this.overworld.save();
      } catch {
        // best-effort
      }
      this.setShipyardStatus(`LOADED "${entry.name.toUpperCase()}"`);
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    // 2) Palette — pick up a part.
    const palette = this.buildShipyardPalette();
    for (const tile of palette) {
      if (rectHit(tile.rect, gx, gy)) {
        if (tile.disabled) return;
        // Toggle: tapping the held part again puts it down.
        this.shipyardHeldPartId = this.shipyardHeldPartId === tile.partId ? null : tile.partId;
        this.shipyardSelectedPlacedId = null;
        return;
      }
    }

    // 3) Ship-canvas interactions. Map pointer to ship-world coords.
    if (rectHit(layout.canvasRect, gx, gy)) {
      const held = this.shipyardHeldPartId;
      const heldDef = held ? getPart(held) : undefined;

      if (heldDef && heldDef.category === "core") {
        // Swap the root core while keeping children attached (their sockets
        // still reference ids which do not change on the new core — cores
        // share a single "s-hull" socket today).
        const rootIdx = bp.parts.findIndex((p) => p.parentId === null);
        if (rootIdx >= 0) {
          const newRoot: PlacedPart = {
            ...bp.parts[rootIdx]!,
            partId: held!,
          };
          const nextParts = [...bp.parts];
          nextParts[rootIdx] = newRoot;
          this.shipyardBlueprint = { ...bp, parts: nextParts };
          this.shipyardHeldPartId = null;
        }
        return;
      }

      if (heldDef) {
        // Find the nearest socket in screen space that accepts this part.
        const target = this.nearestAcceptingSocket(gx, gy, held!);
        if (target) {
          const placedId = `p${this.shipyardNextPlacedIdx++}`;
          const placed: PlacedPart = {
            id: placedId,
            partId: held!,
            parentId: target.parentPlacedId,
            parentSocketId: target.socketId,
            colourId: null,
          };
          this.shipyardBlueprint = { ...bp, parts: [...bp.parts, placed] };
          this.shipyardHeldPartId = null;
        }
        return;
      }

      // No held part — tap on a placed part to select it.
      const picked = this.pickPlacedPartAt(gx, gy);
      this.shipyardSelectedPlacedId = picked ? picked.placed.id : null;
      return;
    }

    // Empty click outside every region — drop held part.
    this.shipyardHeldPartId = null;
  }

  /**
   * Iterates every socket on every placed part, finds the one closest (in
   * screen pixels) to (gx, gy) that passes `canSnap` for the held part and is
   * within a small capture radius.
   */
  private nearestAcceptingSocket(
    gx: number,
    gy: number,
    childPartId: string,
  ): { parentPlacedId: string; socketId: string } | null {
    const bp = this.shipyardBlueprint;
    if (!bp) return null;
    const layout = layoutBlueprint(bp);
    const L = SHIPYARD_LAYOUT;
    let best: { parentPlacedId: string; socketId: string; d2: number } | null = null;
    const captureR = 48;
    const captureR2 = captureR * captureR;
    for (const pl of layout.placements) {
      for (const sk of pl.def.sockets) {
        if (!canSnap(bp, pl.placed.id, sk.id, childPartId)) continue;
        const sx = L.shipOriginX + (pl.worldX + sk.x) * L.shipScale;
        const sy = L.shipOriginY + (pl.worldY + sk.y) * L.shipScale;
        const dx = sx - gx;
        const dy = sy - gy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= captureR2 && (!best || d2 < best.d2)) {
          best = { parentPlacedId: pl.placed.id, socketId: sk.id, d2 };
        }
      }
    }
    return best ? { parentPlacedId: best.parentPlacedId, socketId: best.socketId } : null;
  }

  /** Hit-test a placed part in screen space by its AABB. Topmost wins. */
  private pickPlacedPartAt(gx: number, gy: number): Placement | null {
    const bp = this.shipyardBlueprint;
    if (!bp) return null;
    const layout = layoutBlueprint(bp);
    const L = SHIPYARD_LAYOUT;
    // Iterate in reverse so most-recently-placed parts (likely on top) win.
    for (let i = layout.placements.length - 1; i >= 0; i--) {
      const pl = layout.placements[i]!;
      const sw = pl.def.shape.width * L.shipScale;
      const sh = pl.def.shape.height * L.shipScale;
      const cx = L.shipOriginX + pl.worldX * L.shipScale;
      const cy = L.shipOriginY + pl.worldY * L.shipScale;
      if (
        gx >= cx - sw / 2 &&
        gx <= cx + sw / 2 &&
        gy >= cy - sh / 2 &&
        gy <= cy + sh / 2
      ) {
        return pl;
      }
    }
    return null;
  }

  private setShipyardStatus(msg: string): void {
    this.shipyardStatusMsg = msg;
    this.shipyardStatusMs = 2000;
  }

  private removePlacedPartAndDescendants(placedId: string): void {
    const bp = this.shipyardBlueprint;
    if (!bp) return;
    // Cannot remove the root core.
    const target = bp.parts.find((p) => p.id === placedId);
    if (!target || target.parentId === null) return;
    const doomed = new Set<string>([placedId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of bp.parts) {
        if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) {
          doomed.add(p.id);
          changed = true;
        }
      }
    }
    this.shipyardBlueprint = { ...bp, parts: bp.parts.filter((p) => !doomed.has(p.id)) };
  }

  /**
   * Builds the palette tile list the renderer draws on the left of the
   * shipyard. Every unlocked part gets a tile; disabled state reflects the
   * remaining power budget for non-core parts.
   */
  private buildShipyardPalette(): ShipyardPaletteTile[] {
    const bp = this.shipyardBlueprint;
    if (!bp) return [];
    const unlocked = new Set<string>(this.overworld.getState().inventory.unlockedParts);
    for (const id of DEFAULT_UNLOCKED_PARTS) unlocked.add(id);
    // Keep a stable, registry-insertion order so the palette doesn't reshuffle.
    const ids = Object.keys(PARTS_REGISTRY).filter((id) => unlocked.has(id));

    const rootDef = (() => {
      const root = bp.parts.find((p) => p.parentId === null);
      return root ? PARTS_REGISTRY[root.partId] : undefined;
    })();
    const capacity = rootDef?.powerCapacity ?? 0;
    let used = 0;
    for (const p of bp.parts) {
      if (p.parentId === null) continue;
      const d = PARTS_REGISTRY[p.partId];
      if (!d) continue;
      used += d.powerCost;
    }
    const remaining = Math.max(0, capacity - used);

    const L = SHIPYARD_LAYOUT;
    const tiles: ShipyardPaletteTile[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const def = PARTS_REGISTRY[id]!;
      const col = i % L.paletteCols;
      const row = Math.floor(i / L.paletteCols);
      const rect = {
        x: L.paletteX + col * (L.paletteTileW + L.paletteGap),
        y: L.paletteY + row * (L.paletteTileH + L.paletteGap),
        w: L.paletteTileW,
        h: L.paletteTileH,
      };
      const isCore = def.category === "core";
      const fitsPower = isCore || def.powerCost <= remaining;
      tiles.push({
        partId: id,
        rect,
        powerCost: def.powerCost,
        powerCapacity: def.powerCapacity ?? 0,
        name: def.name,
        visualKind: def.visualKind,
        colour: def.colour,
        shape: { width: def.shape.width, height: def.shape.height },
        category: def.category,
        disabled: !fitsPower,
        isHeld: this.shipyardHeldPartId === id,
      });
    }
    return tiles;
  }

  // ── Screen: starmap (campaign overworld) ─────────────────────────────────

  /** Open the starmap, seeding the selection at the player's current node. */
  private openStarmap(): void {
    const nodeIds = this.getStarmapNodeIds();
    const currentId = this.overworld.getState().currentNodeId;
    const idx = nodeIds.indexOf(currentId);
    this.starmapSelection = idx >= 0 ? idx : 0;
    this.menuSelection = 0;
    this.menuDebounceMs = MENU_DEBOUNCE_MS;
    this.state.setScreen("starmap");
  }

  private updateStarmap(): void {
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.state.setScreen("main-menu");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    const nodeIds = this.getStarmapNodeIds();
    const input = this.input.poll();
    const upEdge = input.moveUp && !this.prevUpPressed;
    const downEdge = input.moveDown && !this.prevDownPressed;
    const len = nodeIds.length;
    if (len > 0) {
      if (upEdge) {
        this.starmapSelection = (this.starmapSelection - 1 + len) % len;
      } else if (downEdge) {
        this.starmapSelection = (this.starmapSelection + 1) % len;
      }
    }

    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0 && len > 0) {
      const nodeId = nodeIds[this.starmapSelection]!;
      // Move the campaign cursor to the selected node, then pick the first
      // available (un-cleared) mission there. If everything is cleared, do
      // nothing — the starmap remains open.
      this.overworld.moveTo(nodeId);
      const missions = this.overworld.getAvailableMissionsAtNode(nodeId);
      const mission = missions[0];
      if (mission) {
        this.startCampaignMission(mission.id);
      }
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    }
  }

  /** Node ids the player can currently see on the starmap, in sector order. */
  private getStarmapNodeIds(): NodeId[] {
    const sector = this.overworld.getSector();
    const unlocked = new Set(this.overworld.getState().unlockedNodeIds);
    return Object.keys(sector.nodes).filter((id) => unlocked.has(id)) as NodeId[];
  }

  /**
   * Launches the selected mission: resolves it through the overworld manager,
   * builds a LevelState via missionToLevelState, and drops into gameplay.
   */
  private startCampaignMission(missionId: MissionId): void {
    const result = this.overworld.startMission(missionId);
    if (!result.ok || !result.spec) return;
    this.activeMissionId = missionId;
    const levelState = missionToLevelState(result.spec);
    this.state.updateLevelState(levelState);
    this.startNewRun();
    // Re-apply the mission-specific level state; startNewRun() doesn't touch it
    // but resetRunStats + level.startLevel do — make sure the mission roster
    // and difficulty survive that reset.
    this.state.updateLevelState(levelState);
    this.level.startLevel(this.state.getGameState().levelState, this.enemies);
    const bossDef = this.enemies.resolveBossDefForLevel(levelState.levelNumber);
    this.renderer.showLevelBanner(
      result.spec.name.toUpperCase(),
      `BOSS: ${bossDef.displayName}`,
      1_400,
    );
  }

  /**
   * If the player has a blueprint equipped, fold its computed stats onto
   * the fresh-run PlayerState: larger hitbox, adjusted HP ceiling. Speed /
   * damage / fireRate aren't wired here yet — the builder ships with
   * conservative overrides so the arcade baseline still drives feel.
   */
  private applyEquippedBlueprint(): void {
    const equipped = this.overworld.getState().inventory.equippedBlueprintId;
    if (!equipped) return;
    const bp = this.blueprints.get(equipped);
    if (!bp) return;
    const stats = computeShipStats(bp);
    this.player.setHitbox(stats.hitbox.width, stats.hitbox.height);
    this.player.setMaxHealth(stats.hp);
    this.state.updatePlayerState(this.player.getState());
  }

  /**
   * Called from the level-clear path when a campaign mission is active:
   * records the completion, saves progress, and returns to the starmap.
   */
  private completeActiveMission(): void {
    const missionId = this.activeMissionId;
    if (!missionId) return;
    const outcome = this.overworld.completeMission(missionId);
    try {
      this.overworld.save();
    } catch {
      // Save is best-effort — don't crash gameplay if storage is unavailable.
    }
    this.activeMissionId = null;
    // Reset transient gameplay timers so the next mission starts clean.
    this.levelTransitionMs = 0;
    this.deathAnimationMs = 0;
    // Fold the mission's stats into all-time tallies so campaign play
    // still counts in the stats screen.
    this.state.finalizeRun("level-timeout");
    void outcome;
    this.openStarmap();
  }

  // ── Run lifecycle ────────────────────────────────────────────────────────

  private startNewRun(): void {
    this.state.resetRunStats();
    this.player.initialize(200, this.height / 2);
    this.powerUps.initialize();
    this.enemies.initialize();
    this.renderer.resetFx();
    this.renderer.resetGameOverFade();
    this.safeTimerMs = 0;
    this.deathAnimationMs = 0;
    this.finalDeath = false;
    this.respawnInvulnArmed = false;
    this.awaitingFireRelease = false;
    this.prevFirePressed = false;
    this.levelTransitionMs = 0;
    this.menuSelection = 0;

    const levelState = this.state.getGameState().levelState;
    this.level.startLevel(levelState, this.enemies);

    // Fold the equipped blueprint's hitbox + HP over the fresh PlayerState
    // so arcade PLAY and campaign missions both honour the shipyard pick.
    this.applyEquippedBlueprint();

    this.state.setScreen("gameplay");
    this.menuDebounceMs = MENU_DEBOUNCE_MS;
  }

  private startNextLevel(): void {
    const current = this.state.getGameState().levelState;
    const nextLevelNumber = current.levelNumber + 1;
    // Rebuild level state via a cheap trick: recreate the whole state object
    // by updating the fields the StateManager owns.
    const nextLevel = makeLevelState(nextLevelNumber);
    this.state.updateLevelState(nextLevel);
    this.state.updateRunStats({ levelReached: nextLevelNumber });

    this.player.resetForLevel();
    this.enemies.initialize();
    this.powerUps.initialize();
    this.renderer.resetFx();
    // Re-show a short arrival banner for the new level, naming the upcoming boss.
    const nextBoss = this.enemies.resolveBossDefForLevel(nextLevelNumber);
    this.renderer.showLevelBanner(
      `LEVEL ${nextLevelNumber}`,
      `BOSS: ${nextBoss.displayName}`,
      1_400,
    );
    // A new level starts fresh — clear any leftover death/respawn state.
    this.deathAnimationMs = 0;
    this.finalDeath = false;
    this.respawnInvulnArmed = false;
    this.awaitingFireRelease = false;
    this.levelTransitionMs = 0;

    this.level.startLevel(
      this.state.getGameState().levelState,
      this.enemies,
    );
  }

  private gameOver(): void {
    this.state.finalizeRun("no-lives");
    // Campaign mission failures drop the player back on the starmap so they
    // can retry without losing the sector's progress.
    if (this.activeMissionId) {
      this.activeMissionId = null;
      this.openStarmap();
      return;
    }
    this.state.setScreen("game-over");
    this.menuDebounceMs = MENU_DEBOUNCE_MS;
    this.renderer.beginGameOverFade();
  }

  /** Spawn a cluster of explosions at the ship's last position. */
  private triggerDeathExplosion(x: number, y: number, big: boolean): void {
    const mainSize = big ? 140 : 90;
    this.renderer.showExplosion(x, y, 0x00ffff, mainSize);
    this.renderer.showExplosion(x - 18, y + 12, 0xff8844, mainSize * 0.8);
    this.renderer.showExplosion(x + 16, y - 14, 0xffaa33, mainSize * 0.9);
    if (big) {
      this.renderer.showExplosion(x + 8, y + 22, 0xffffff, mainSize * 0.7);
      this.renderer.showExplosion(x - 22, y - 8, 0xff3366, mainSize * 0.75);
    }
  }

  // ── Screen: gameplay ─────────────────────────────────────────────────────

  private updateGameplay(deltaMs: number): void {
    const input = this.input.poll();
    const firePressed = input.fire && !this.prevFirePressed;
    this.prevFirePressed = input.fire;

    // ── ESC opens the pause menu ───────────────────────────────────────────
    // Never pause during death/level-transition so those animations can finish.
    if (
      this.wasPausePressed() &&
      this.deathAnimationMs === 0 &&
      this.levelTransitionMs === 0 &&
      this.menuDebounceMs === 0
    ) {
      this.menuSelection = 0;
      this.state.setScreen("pause");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    // ── Level transition path: freeze gameplay, let FX finish ──────────────
    if (this.levelTransitionMs > 0) {
      this.levelTransitionMs -= deltaMs;
      // Keep power-ups drifting so nothing snaps, but no collisions.
      this.powerUps.update(deltaMs);
      if (this.levelTransitionMs <= 0) {
        this.levelTransitionMs = 0;
        // Campaign missions return to the starmap after a clear instead of
        // advancing the arcade level counter.
        if (this.activeMissionId) {
          this.completeActiveMission();
        } else {
          this.startNextLevel();
        }
      }
      return;
    }

    // ── Death animation path: freeze player, let the world keep moving ─────
    if (this.deathAnimationMs > 0) {
      this.deathAnimationMs -= deltaMs;
      const frozen = this.player.getState();
      // Enemies / projectiles / power-ups keep moving for visual continuity,
      // but no collisions are processed while the ship is dead.
      this.enemies.setCurrentLevel(this.state.getGameState().levelState);
      this.enemies.update(deltaMs, frozen);
      this.powerUps.update(deltaMs);

      if (this.deathAnimationMs <= 0) {
        this.deathAnimationMs = 0;
        if (this.finalDeath) {
          this.gameOver();
          return;
        }
        this.player.respawn(200, this.height / 2, 3_000);
        this.respawnInvulnArmed = true;
        this.awaitingFireRelease = input.fire; // if fire is already held, wait for release
        this.state.updatePlayerState(this.player.getState());
      }
      return;
    }

    // ── Respawn-invulnerability early-cancel on fire press ─────────────────
    if (this.respawnInvulnArmed) {
      const ps = this.player.getState();
      if (ps.invulnerabilityTimer <= 0) {
        this.respawnInvulnArmed = false;
        this.awaitingFireRelease = false;
      } else if (this.awaitingFireRelease) {
        if (!input.fire) this.awaitingFireRelease = false;
      } else if (firePressed) {
        this.player.cancelInvulnerability();
        this.respawnInvulnArmed = false;
      }
    }

    // Subsystem updates
    this.player.update(deltaMs, input);
    const playerState = this.player.getState();
    // Keep StateManager's playerState mirror in sync so the renderer reads live values.
    this.state.updatePlayerState(playerState);
    this.enemies.setCurrentLevel(this.state.getGameState().levelState);
    this.enemies.update(deltaMs, playerState);
    this.powerUps.update(deltaMs);
    this.level.update(deltaMs, this.state.getGameState().levelState, this.enemies);

    // Time-alive / safe-timer tracking
    const run = this.state.getCurrentRunStats();
    const timeAliveMs = run.timeAliveMs + deltaMs;
    this.safeTimerMs += deltaMs;
    const longestSafe = Math.max(
      run.longestTimeWithoutDamageSec,
      this.safeTimerMs / 1_000,
    );

    // Collisions
    const events = this.collisions.update(
      playerState,
      this.player.getProjectiles(),
      this.enemies.getProjectiles(),
      this.enemies.getEnemies(),
      this.powerUps.getActivePowerUps(),
    );

    let scoreDelta = 0;
    let enemiesKilledDelta = 0;
    let consecutiveHits = run.consecutiveHits;
    let peakConsecutiveHits = run.peakConsecutiveHits;
    let totalDamageReceived = run.totalDamageReceived;
    let didDie = false;

    // Dedupe projectile hits: if one projectile hits multiple enemies in a
    // single frame, only the first one counts.
    const consumedProjectiles = new Set<string>();

    for (const ev of events) {
      if (ev.type === "enemy-hit-by-projectile" && ev.enemyId && ev.projectileId) {
        if (consumedProjectiles.has(ev.projectileId)) continue;
        consumedProjectiles.add(ev.projectileId);

        const result = this.enemies.onProjectileHit(ev.enemyId, ev.damage);
        this.player.killProjectile(ev.projectileId);

        if (result.defeated) {
          scoreDelta += result.bounty;
          if (result.enemyType !== "boss") {
            enemiesKilledDelta += 1;
            this.powerUps.onEnemyDefeated(result.position.x, result.position.y);
          }
          if (result.enemyType) {
            this.renderer.showEnemyDefeated(
              result.position.x,
              result.position.y,
              result.enemyType,
            );
          }
        }
        consecutiveHits += 1;
        if (consecutiveHits > peakConsecutiveHits) peakConsecutiveHits = consecutiveHits;
      } else if (ev.type === "player-hit-by-projectile" && ev.projectileId) {
        // Look up the projectile BEFORE killing so kind-specific impact FX
        // can read its position.
        const hit = this.enemies.getProjectiles().find((p) => p.id === ev.projectileId);
        this.enemies.killProjectile(ev.projectileId);
        const dmgResult = this.player.takeDamage(ev.damage);
        if (!dmgResult.blocked) {
          totalDamageReceived += ev.damage;
          consecutiveHits = 0;
          this.safeTimerMs = 0;
          this.renderer.showHitFlash();
          if (hit?.kind === "cannon") {
            this.renderer.showCannonImpact(hit.position.x, hit.position.y);
          }
        }
        if (dmgResult.died && !this.player.getState().isAlive) {
          didDie = true;
        }
      } else if (
        ev.type === "enemy-projectile-shot-down" &&
        ev.projectileId &&
        ev.enemyProjectileId
      ) {
        if (consumedProjectiles.has(ev.projectileId)) continue;
        consumedProjectiles.add(ev.projectileId);
        const r = this.enemies.damageEnemyProjectile(ev.enemyProjectileId, ev.damage);
        this.player.killProjectile(ev.projectileId);
        if (r.destroyed) {
          this.renderer.showExplosion(r.position.x, r.position.y, 0xffaa33, 38);
        }
      }
    }

    // ── Enemy homing-missile detonation (proximity OR lifetime expiry) ─────
    const missileDamage = this.detonateEnemyMissiles(deltaMs);
    if (missileDamage > 0) {
      totalDamageReceived += missileDamage;
      consecutiveHits = 0;
      this.safeTimerMs = 0;
      this.renderer.showHitFlash();
      if (!this.player.getState().isAlive) {
        didDie = true;
      }
    }

    // ── Proximity-bomb detonation ──────────────────────────────────────────
    this.detonateProximityBombs();

    // ── Player panic-bomb detonation (B-key / bomb credit) ─────────────────
    this.detonatePlayerPanicBombs();

    // ── Mega-laser continuous damage ──────────────────────────────────────
    if (playerState.megaLaserMs > 0) {
      const beamDeltas = this.applyMegaLaserDamage(playerState, deltaMs);
      scoreDelta += beamDeltas.scoreDelta;
      enemiesKilledDelta += beamDeltas.killed;
    }

    // Shoot-to-collect: any player projectile overlapping an active power-up
    // consumes the projectile and collects the power-up.
    const runStatsMutable = { ...run } as typeof run;
    const shotIds = new Set<string>();
    const activePowerUpsList = this.powerUps.getActivePowerUps();
    for (const proj of this.player.getProjectiles()) {
      if (!proj.isAlive) continue;
      for (const pu of activePowerUpsList) {
        if (pu.isCollected || shotIds.has(pu.id)) continue;
        if (this.collisions.checkOverlap(proj, pu)) {
          this.player.killProjectile(proj.id);
          shotIds.add(pu.id);
          break;
        }
      }
    }
    const shotCollections = this.powerUps.collectByIds(
      Array.from(shotIds),
      this.player,
      runStatsMutable,
    );
    for (const c of shotCollections) {
      this.renderer.showPowerUpCollected(c.feedback.x, c.feedback.y, c.type);
    }

    // Touch-collect: any power-up overlapping the player
    const touchCollections = this.powerUps.checkAndApply(
      playerState,
      this.player,
      runStatsMutable,
    );
    for (const c of touchCollections) {
      this.renderer.showPowerUpCollected(c.feedback.x, c.feedback.y, c.type);
    }

    if (shotCollections.length > 0 || this.powerUps.isStatsDirty()) {
      this.state.updateRunStats({
        shieldsCollected: runStatsMutable.shieldsCollected,
        extraLivesCollected: runStatsMutable.extraLivesCollected,
        gunUpgradeAchieved: runStatsMutable.gunUpgradeAchieved,
      });
      if (this.powerUps.isStatsDirty()) this.powerUps.clearStatsDirty();
    }

    // Re-sync player mirror after damage/power-up effects so the HUD is current.
    this.state.updatePlayerState(this.player.getState());

    // Commit stats
    this.state.updateRunStats({
      timeAliveMs,
      score: run.score + scoreDelta,
      enemiesKilled: run.enemiesKilled + enemiesKilledDelta,
      consecutiveHits,
      peakConsecutiveHits,
      totalDamageReceived,
      longestTimeWithoutDamageSec: longestSafe,
    });

    // Level state stats snapshot (for the renderer)
    this.state.updateLevelState({
      enemiesDefeated: this.state.getGameState().levelState.enemiesDefeated + enemiesKilledDelta,
      isBossPhase: this.level.isBossPhase(this.enemies),
      durationMs: this.state.getGameState().levelState.durationMs + deltaMs,
    });

    // Level complete → begin between-level transition. Boss explosion is
    // already in flight; hold for ~2s so the player sees it finish, then
    // hand off to startNextLevel() from the transition path.
    if (this.level.isLevelComplete(this.enemies)) {
      const nextLevelNumber = this.state.getGameState().levelState.levelNumber + 1;
      this.levelTransitionMs = 2_000;
      this.renderer.showLevelBanner(
        `LEVEL ${nextLevelNumber - 1} CLEAR`,
        `PREPARING LEVEL ${nextLevelNumber}`,
        2_000,
      );
      return;
    }

    // Death → start explosion animation. Respawn or game-over happens when
    // the animation finishes (handled at the top of the next updateGameplay).
    if (didDie) {
      const lastPos = this.player.getState().position;
      const livesRemaining = this.player.getState().lives;
      this.finalDeath = livesRemaining <= 0;
      this.deathAnimationMs = this.finalDeath ? 1_400 : 1_000;
      this.triggerDeathExplosion(lastPos.x, lastPos.y, this.finalDeath);
      return;
    }
  }

  // ── Enemy homing missile detonation ──────────────────────────────────────

  /**
   * Walks active enemy projectiles; any homing missile that is either close
   * enough to the player (within `proxTriggerRadius`) or has reached the end
   * of its lifetime detonates. The blast kills the missile and damages the
   * player if inside `proxBlastRadius`.
   *
   * Returns the raw damage dealt to the player (for run-stat bookkeeping).
   */
  private detonateEnemyMissiles(deltaMs: number): number {
    const playerState = this.player.getState();
    let damageDealt = 0;
    for (const p of this.enemies.getProjectiles()) {
      if (!p.isAlive || !p.isHoming) continue;
      const trigger = p.proxTriggerRadius ?? 0;
      const blast = p.proxBlastRadius ?? 0;
      if (trigger <= 0 && blast <= 0) continue;

      const dx = playerState.position.x - p.position.x;
      const dy = playerState.position.y - p.position.y;
      const distSq = dx * dx + dy * dy;
      const inTrigger = trigger > 0 && distSq <= trigger * trigger;
      const expiring = p.lifetime <= deltaMs;
      if (!inTrigger && !expiring) continue;

      if (blast > 0 && distSq <= blast * blast) {
        const result = this.player.takeDamage(p.damage);
        if (!result.blocked) damageDealt += p.damage;
      }
      this.enemies.killProjectile(p.id);
      this.renderer.showExplosion(p.position.x, p.position.y, 0xff6633, blast * 1.3);
    }
    return damageDealt;
  }

  // ── Proximity bombs ──────────────────────────────────────────────────────

  /**
   * Walks active player projectiles; any "prox-bomb" that has an enemy within
   * its proxTriggerRadius detonates (kills itself) and deals damage to every
   * enemy inside proxBlastRadius.
   */
  private detonateProximityBombs(): void {
    const enemies = this.enemies.getEnemies();
    for (const proj of this.player.getProjectiles()) {
      if (!proj.isAlive || proj.kind !== "prox-bomb") continue;
      const trigger = proj.proxTriggerRadius ?? 0;
      if (trigger <= 0) continue;
      let shouldDetonate = false;
      for (const e of enemies) {
        if (!e.isAlive) continue;
        const dx = e.position.x - proj.position.x;
        const dy = e.position.y - proj.position.y;
        if (dx * dx + dy * dy <= trigger * trigger) {
          shouldDetonate = true;
          break;
        }
      }
      if (!shouldDetonate) continue;

      const blast = proj.proxBlastRadius ?? trigger;
      // Damage every enemy in blast radius.
      for (const e of enemies) {
        if (!e.isAlive) continue;
        const dx = e.position.x - proj.position.x;
        const dy = e.position.y - proj.position.y;
        if (dx * dx + dy * dy <= blast * blast) {
          const result = this.enemies.onProjectileHit(e.id, proj.damage);
          if (result.defeated) {
            if (result.enemyType !== "boss") {
              this.powerUps.onEnemyDefeated(result.position.x, result.position.y);
            }
            if (result.enemyType) {
              this.renderer.showEnemyDefeated(
                result.position.x,
                result.position.y,
                result.enemyType,
              );
            }
          }
        }
      }
      // Kill the bomb and render a big shockwave.
      this.player.killProjectile(proj.id);
      this.renderer.showExplosion(proj.position.x, proj.position.y, 0xffdd55, blast * 1.3);
    }
  }

  // ── Player panic bomb ────────────────────────────────────────────────────

  /**
   * Drains any panic-bomb detonation requests the player queued this frame
   * (B-key press or post-respawn credit) and applies them: damages every
   * enemy inside `blastRadius` of the ship, sweeps incoming enemy projectiles
   * out of the blast so the player actually gets breathing room, and cues
   * the layered "1 large + 6 satellite" explosion FX.
   */
  private detonatePlayerPanicBombs(): void {
    const bombs = this.player.consumePendingPanicBombs();
    if (bombs.length === 0) return;
    const enemies = this.enemies.getEnemies();
    for (const b of bombs) {
      const r2 = b.blastRadius * b.blastRadius;
      for (const e of enemies) {
        if (!e.isAlive) continue;
        const dx = e.position.x - b.x;
        const dy = e.position.y - b.y;
        if (dx * dx + dy * dy > r2) continue;
        const result = this.enemies.onProjectileHit(e.id, b.damage);
        if (result.defeated) {
          if (result.enemyType !== "boss") {
            this.powerUps.onEnemyDefeated(result.position.x, result.position.y);
          }
          if (result.enemyType) {
            this.renderer.showEnemyDefeated(
              result.position.x,
              result.position.y,
              result.enemyType,
            );
          }
        }
      }
      // Sweep enemy projectiles inside the blast so the player clears space.
      for (const p of this.enemies.getProjectiles()) {
        if (!p.isAlive) continue;
        const dx = p.position.x - b.x;
        const dy = p.position.y - b.y;
        if (dx * dx + dy * dy > r2) continue;
        this.enemies.killProjectile(p.id);
        this.renderer.showExplosion(p.position.x, p.position.y, 0xffaa33, 26);
      }
      this.renderer.showPlayerBomb(b.x, b.y, b.blastRadius);
    }
  }

  // ── Mega-laser ───────────────────────────────────────────────────────────

  /**
   * Applies 50 dps damage to every enemy (and boss part) overlapping the
   * mega-laser beam. Returns aggregate score + kill delta so updateGameplay
   * can fold the numbers into the run stats.
   */
  private applyMegaLaserDamage(
    player: { position: { x: number; y: number }; width: number; height: number },
    deltaMs: number,
  ): { scoreDelta: number; killed: number } {
    const noseX = player.position.x + player.width / 2;
    const beamStart = noseX;
    const beamEnd = this.width + 120;
    const beamW = beamEnd - beamStart;
    const beamH = player.height * 1.8;
    const beamBox = {
      position: { x: (beamStart + beamEnd) / 2, y: player.position.y },
      width: beamW,
      height: beamH,
    };
    const dps = 50;
    const dmg = dps * (deltaMs / 1_000);

    let scoreDelta = 0;
    let killed = 0;
    // Spawn sparks at ~24/sec per hit enemy. Scales with frame time so it's
    // framerate-independent.
    const sparkChance = Math.min(1, (deltaMs / 1_000) * 24);
    for (const e of this.enemies.getEnemies()) {
      if (!e.isAlive) continue;
      if (!this.collisions.checkOverlap(beamBox, e)) continue;
      const r = this.enemies.onProjectileHit(e.id, dmg);
      if (Math.random() < sparkChance) {
        const sparkX = Math.max(beamStart, e.position.x - e.width / 2);
        const sparkY = Math.max(
          e.position.y - e.height / 2,
          Math.min(e.position.y + e.height / 2, player.position.y),
        );
        this.renderer.showLaserSpark(sparkX, sparkY);
      }
      if (r.defeated) {
        scoreDelta += r.bounty;
        if (r.enemyType !== "boss") {
          killed += 1;
          this.powerUps.onEnemyDefeated(r.position.x, r.position.y);
        }
        if (r.enemyType) {
          this.renderer.showEnemyDefeated(r.position.x, r.position.y, r.enemyType);
        }
      }
    }
    return { scoreDelta, killed };
  }

  // ── Dev cheats (wired only in dev builds — see src/dev/cheats.ts) ────────

  /**
   * Apply a parsed set of URL-param cheats. Safe to call once at startup:
   * `autostart` bypasses the menu and `startLevel` jumps to an arbitrary
   * level. All other fields override player stats directly so the HUD and
   * gameplay pick them up on the next frame.
   */
  applyDevCheats(cheats: DevCheats): void {
    // Must run BEFORE autostart/startLevel so the first boss spawned honours it.
    if (cheats.boss !== undefined) this.enemies.setBossOverride(cheats.boss);
    if (cheats.autostart) {
      this.startNewRun();
    }
    if (cheats.startLevel !== undefined && cheats.startLevel > 1) {
      this.jumpToLevel(cheats.startLevel);
    }
    if (cheats.god !== undefined) this.player.setGodMode(cheats.god);
    if (cheats.health !== undefined) this.player.setHealth(cheats.health);
    if (cheats.lives !== undefined) this.player.setLives(cheats.lives);
    if (cheats.weapon !== undefined) this.player.setWeaponType(cheats.weapon);
    if (cheats.weaponLevel !== undefined) this.player.upgradeWeapon(cheats.weaponLevel);
    if (cheats.shield !== undefined) this.player.setShieldActive(cheats.shield);
    if (cheats.speed !== undefined) this.player.setSpeedMultiplier(cheats.speed);
    if (cheats.megaLaserMs !== undefined) this.player.setMegaLaserMs(cheats.megaLaserMs);
    if (cheats.unlockParts) {
      this.overworld.unlockParts(Object.keys(PARTS_REGISTRY));
      this.overworld.save();
    }
    if (cheats.credits !== undefined) {
      this.overworld.setCredits(cheats.credits);
      this.overworld.save();
    }
    this.state.updatePlayerState(this.player.getState());
  }

  /** Rebuild the level state at `n` and kick off the level manager. */
  private jumpToLevel(n: number): void {
    const target = Math.max(1, Math.floor(n));
    this.state.updateLevelState(makeLevelState(target));
    this.state.updateRunStats({ levelReached: target });
    this.enemies.initialize();
    this.powerUps.initialize();
    this.level.startLevel(this.state.getGameState().levelState, this.enemies);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private renderFrame(deltaMs: number): void {
    const state = this.state.getGameState();
    const playerProjectiles: ReadonlyArray<Projectile> = this.player.getProjectiles();
    const enemyProjectiles: ReadonlyArray<Projectile> = this.enemies.getProjectiles();
    const enemies = this.enemies.getEnemies().filter((e) => {
      // Exclude the boss from the generic enemy draw pass; the renderer draws it separately.
      const boss = this.enemies.getBoss();
      return !(boss && e.id === boss.id);
    });
    const powerUps: ReadonlyArray<PowerUp> = this.powerUps.getActivePowerUps();

    this.renderer.renderFrame(state, deltaMs, {
      playerProjectiles,
      enemyProjectiles,
      enemies,
      boss: this.enemies.getBoss(),
      powerUps,
      menuSelection: this.menuSelection,
      lastRun: this.state.getLastRun(),
      bombCredits: this.player.getBombCredits(),
      starmap: state.screen === "starmap" ? this.buildStarmapExtras() : null,
      shipyard: state.screen === "shipyard" ? this.buildShipyardExtras() : null,
      playerBlueprint: this.buildPlayerBlueprintVisual(),
    });
  }

  /**
   * If a blueprint is equipped, produces the per-placement visual data the
   * renderer uses to draw the assembled ship silhouette instead of the
   * default arrowhead. Null otherwise.
   */
  private buildPlayerBlueprintVisual(): PlayerBlueprintVisual | null {
    const equipped = this.overworld.getState().inventory.equippedBlueprintId;
    if (!equipped) return null;
    const bp = this.blueprints.get(equipped);
    if (!bp) return null;
    const layout = layoutBlueprint(bp);
    if (layout.placements.length === 0) return null;
    return {
      placements: layout.placements.map((pl: Placement) => ({
        worldX: pl.worldX,
        worldY: pl.worldY,
        visualKind: pl.def.visualKind,
        colour: pl.def.colour,
        shape: { width: pl.def.shape.width, height: pl.def.shape.height },
      })),
    };
  }

  /** Collects the data the renderer needs for the shipyard builder. */
  private buildShipyardExtras(): ShipyardRenderData {
    const bp = this.shipyardBlueprint;
    if (!bp) {
      // Should not happen while screen == "shipyard", but fail soft.
      return makeEmptyShipyardRenderData();
    }
    const L = SHIPYARD_LAYOUT;
    const input = this.input.poll();
    const pointer = input.pointer ?? null;

    const palette = this.buildShipyardPalette();
    const layout = layoutBlueprint(bp);
    const stats = computeShipStats(bp);

    const heldId = this.shipyardHeldPartId;
    const heldDef = heldId ? getPart(heldId) : undefined;

    const placements = layout.placements.map((pl) => ({
      placedId: pl.placed.id,
      partId: pl.placed.partId,
      worldX: pl.worldX,
      worldY: pl.worldY,
      visualKind: pl.def.visualKind,
      colour: pl.def.colour,
      shape: { width: pl.def.shape.width, height: pl.def.shape.height },
      selected: this.shipyardSelectedPlacedId === pl.placed.id,
      category: pl.def.category as PartCategory,
    }));

    const sockets: Array<{
      parentPlacedId: string;
      socketId: string;
      screenX: number;
      screenY: number;
      highlighted: boolean;
    }> = [];
    for (const pl of layout.placements) {
      for (const sk of pl.def.sockets) {
        const occupied = bp.parts.some(
          (p) => p.parentId === pl.placed.id && p.parentSocketId === sk.id,
        );
        if (occupied) continue;
        const screenX = L.shipOriginX + (pl.worldX + sk.x) * L.shipScale;
        const screenY = L.shipOriginY + (pl.worldY + sk.y) * L.shipScale;
        let highlighted = false;
        if (heldId && heldDef && heldDef.category !== "core") {
          highlighted = canSnap(bp, pl.placed.id, sk.id, heldId);
        }
        sockets.push({
          parentPlacedId: pl.placed.id,
          socketId: sk.id,
          screenX,
          screenY,
          highlighted,
        });
      }
    }

    // Ghost preview — only when a part is held and pointer is in-canvas.
    let ghost: ShipyardRenderData["ghost"] = null;
    if (heldDef && pointer && rectHit(L.canvasRect, pointer.x, pointer.y)) {
      let valid = false;
      let gx = pointer.x;
      let gy = pointer.y;
      if (heldDef.category === "core") {
        valid = true;
      } else {
        const target = this.nearestAcceptingSocket(pointer.x, pointer.y, heldId!);
        if (target) {
          const pl = layout.placements.find((p) => p.placed.id === target.parentPlacedId);
          const sk = pl?.def.sockets.find((s) => s.id === target.socketId);
          if (pl && sk) {
            gx = L.shipOriginX + (pl.worldX + sk.x) * L.shipScale;
            gy = L.shipOriginY + (pl.worldY + sk.y) * L.shipScale;
            valid = true;
          }
        }
      }
      ghost = {
        screenX: gx,
        screenY: gy,
        visualKind: heldDef.visualKind,
        colour: heldDef.colour,
        shape: { width: heldDef.shape.width, height: heldDef.shape.height },
        valid,
      };
    }

    // Saved-ships slot view.
    const saved = this.blueprints.list();
    const equippedId = this.overworld.getState().inventory.equippedBlueprintId;
    const savedSlots = Array.from({ length: L.savedSlotCount }, (_, i) => {
      const entry = saved[i];
      const rect = savedSlotRect(i);
      if (!entry) {
        return {
          rect,
          index: i,
          name: "— EMPTY —",
          empty: true,
          equipped: false,
          current: false,
        };
      }
      return {
        rect,
        index: i,
        name: entry.name,
        empty: false,
        equipped: entry.id === equippedId,
        current: entry.id === bp.id,
      };
    });

    const trashAction: "none" | "part" | "blueprint" = this.shipyardSelectedPlacedId
      ? "part"
      : this.blueprints.get(bp.id)
        ? "blueprint"
        : "none";

    return {
      layout: {
        canvasRect: L.canvasRect,
        paletteRect: {
          x: L.paletteX,
          y: L.paletteY,
          w: L.paletteCols * (L.paletteTileW + L.paletteGap),
          h: 600,
        },
        statsRect: L.statsRect,
        savedPanelRect: L.savedPanelRect,
        newBtn: L.newBtn,
        saveBtn: L.saveBtn,
        backBtn: L.backBtn,
        trashBtn: L.trashBtn,
      },
      savedSlots,
      statusMsg: this.shipyardStatusMsg,
      trashAction,
      palette,
      ship: {
        originX: L.shipOriginX,
        originY: L.shipOriginY,
        scale: L.shipScale,
        placements,
        sockets,
      },
      ghost,
      stats: {
        hp: stats.hp,
        speed: stats.speed,
        damage: stats.damage,
        fireRate: stats.fireRate,
        hitboxW: stats.hitbox.width,
        hitboxH: stats.hitbox.height,
        powerUsed: stats.powerUsed,
        powerCapacity: stats.powerCapacity,
        cost: stats.cost,
      },
      blueprintName: bp.name,
      credits: this.overworld.getState().inventory.credits,
      hasSelection: this.shipyardSelectedPlacedId !== null,
      heldPartName: heldDef?.name ?? null,
    };
  }

  /** Collects the data the renderer needs to draw the starmap screen. */
  private buildStarmapExtras(): {
    sectorName: string;
    nodes: ReadonlyArray<{
      id: NodeId;
      name: string;
      kind: string;
      x: number;
      y: number;
      unlocked: boolean;
      completed: boolean;
      current: boolean;
      selected: boolean;
    }>;
    edges: ReadonlyArray<{ fromX: number; fromY: number; toX: number; toY: number; unlocked: boolean }>;
    credits: number;
    selectedMissionLabel: string | null;
  } {
    const sector = this.overworld.getSector();
    const state = this.overworld.getState();
    const visibleIds = this.getStarmapNodeIds();
    const selectedId = visibleIds[this.starmapSelection];
    const unlockedSet = new Set(state.unlockedNodeIds);
    const completedMissions = new Set(state.completedMissionIds);

    const nodes = Object.values(sector.nodes).map((n) => {
      const missionsHere = n.missionIds;
      const allCleared = missionsHere.length > 0 &&
        missionsHere.every((id) => completedMissions.has(id));
      return {
        id: n.id,
        name: n.name,
        kind: n.kind,
        x: n.position.x,
        y: n.position.y,
        unlocked: unlockedSet.has(n.id),
        completed: allCleared,
        current: state.currentNodeId === n.id,
        selected: selectedId === n.id,
      };
    });

    const edges: {
      fromX: number; fromY: number; toX: number; toY: number; unlocked: boolean;
    }[] = [];
    for (const from of Object.values(sector.nodes)) {
      for (const toId of from.unlocksNodeIds) {
        const to = sector.nodes[toId];
        if (!to) continue;
        edges.push({
          fromX: from.position.x,
          fromY: from.position.y,
          toX: to.position.x,
          toY: to.position.y,
          unlocked: unlockedSet.has(from.id) && unlockedSet.has(to.id),
        });
      }
    }

    let selectedMissionLabel: string | null = null;
    if (selectedId) {
      const missions = this.overworld.getAvailableMissionsAtNode(selectedId);
      const first = missions[0];
      if (first) {
        selectedMissionLabel = `${first.name.toUpperCase()}   ★${first.difficulty}   ${first.rewardCredits}¢`;
      } else if (unlockedSet.has(selectedId)) {
        selectedMissionLabel = "— CLEARED —";
      }
    }

    return {
      sectorName: sector.name,
      nodes,
      edges,
      credits: state.inventory.credits,
      selectedMissionLabel,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeLevelState(levelNumber: number) {
  // Widen the enemy pool as levels climb so the "cool" specialist types
  // that the Carrier boss summons also appear in regular waves. Weights
  // in LevelManager.pickEnemyType downweight specialists at low levels.
  const progression: Record<number, EnemyType[]> = {
    1: ["grunt"],
    2: ["grunt", "darter"],
    3: ["grunt", "darter", "spinner"],
    4: ["grunt", "spinner", "darter", "orbiter", "stalker"],
    5: ["grunt", "spinner", "stalker", "orbiter", "lancer"],
    6: ["grunt", "spinner", "stalker", "lancer", "pulsar", "orbiter"],
  };
  const unlocked: EnemyType[] = progression[levelNumber] ?? [
    "grunt",
    "spinner",
    "stalker",
    "darter",
    "orbiter",
    "lancer",
    "pulsar",
    "torpedoer",
    "cannoneer",
  ];

  return {
    levelNumber,
    difficulty: {
      enemyCountBase: 5 + (levelNumber - 1) * 3,
      enemyCountMultiplier: 1 + (levelNumber - 1) * 0.2,
      enemyFireRateMultiplier: 1 + (levelNumber - 1) * 0.1,
      enemyHealthMultiplier: 1 + (levelNumber - 1) * 0.15,
      enemySpeedMultiplier: 1 + (levelNumber - 1) * 0.1,
      newEnemyTypesUnlocked: unlocked,
    },
    enemies: [],
    isBossPhase: false,
    enemiesSpawned: 0,
    enemiesDefeated: 0,
    durationMs: 0,
    targetDurationMs: Math.min(60_000 * levelNumber, 600_000),
    isComplete: false,
  };
}

// ── Shipyard layout + render-data types ────────────────────────────────────

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_SAVED_BLUEPRINTS = 10;

/** Static layout for the shipyard screen. Co-located with hit-test logic. */
const SHIPYARD_LAYOUT = {
  paletteX: 24,
  paletteY: 100,
  paletteCols: 2,
  paletteTileW: 90,
  paletteTileH: 80,
  paletteGap: 10,
  canvasRect: { x: 240, y: 90, w: 700, h: 530 } as Rect,
  shipOriginX: 590,
  shipOriginY: 355,
  shipScale: 6,
  statsRect: { x: 960, y: 100, w: 300, h: 230 } as Rect,
  savedPanelRect: { x: 960, y: 340, w: 300, h: 290 } as Rect,
  savedSlotX: 968,
  savedSlotY0: 368,
  savedSlotW: 284,
  savedSlotH: 24,
  savedSlotCount: MAX_SAVED_BLUEPRINTS,
  newBtn: { x: 260, y: 640, w: 140, h: 52 } as Rect,
  saveBtn: { x: 420, y: 640, w: 140, h: 52 } as Rect,
  backBtn: { x: 580, y: 640, w: 140, h: 52 } as Rect,
  trashBtn: { x: 960, y: 640, w: 140, h: 52 } as Rect,
} as const;

function savedSlotRect(index: number): Rect {
  const L = SHIPYARD_LAYOUT;
  return {
    x: L.savedSlotX,
    y: L.savedSlotY0 + index * L.savedSlotH,
    w: L.savedSlotW,
    h: L.savedSlotH,
  };
}

function rectHit(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function cloneBlueprint(bp: Blueprint): Blueprint {
  return {
    id: bp.id,
    name: bp.name,
    parts: bp.parts.map((p) => ({ ...p })),
  };
}

/** Generates a blueprint id that won't collide with existing library entries. */
function freshBlueprintId(): string {
  return `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function makeEmptyShipyardRenderData(): ShipyardRenderData {
  const L = SHIPYARD_LAYOUT;
  return {
    layout: {
      canvasRect: L.canvasRect,
      paletteRect: {
        x: L.paletteX,
        y: L.paletteY,
        w: L.paletteCols * (L.paletteTileW + L.paletteGap),
        h: 600,
      },
      statsRect: L.statsRect,
      savedPanelRect: L.savedPanelRect,
      newBtn: L.newBtn,
      saveBtn: L.saveBtn,
      backBtn: L.backBtn,
      trashBtn: L.trashBtn,
    },
    savedSlots: [],
    statusMsg: null,
    trashAction: "none",
    palette: [],
    ship: {
      originX: L.shipOriginX,
      originY: L.shipOriginY,
      scale: L.shipScale,
      placements: [],
      sockets: [],
    },
    ghost: null,
    stats: {
      hp: 100,
      speed: 420,
      damage: 10,
      fireRate: 1,
      hitboxW: 0,
      hitboxH: 0,
      powerUsed: 0,
      powerCapacity: 0,
      cost: 0,
    },
    blueprintName: "",
    credits: 0,
    hasSelection: false,
    heldPartName: null,
  };
}

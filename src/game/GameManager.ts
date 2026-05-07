/**
 * GameManager – top-level orchestrator.
 *
 * Owns every subsystem and drives the per-frame update + render cycle based on
 * the current screen. Screen transitions (main-menu ↔ gameplay ↔ game-over) are
 * driven by input.
 */

import type { Application } from "pixi.js";
import type { DevCheats, EnemyType, InputState, PowerUp, Projectile, ScreenType, ShopRenderData } from "../types/index";
import { InputHandler } from "../input/InputHandler";
import { StateManager } from "../managers/StateManager";
import { PlayerManager } from "../managers/PlayerManager";
import { EnemyManager } from "../managers/EnemyManager";
import { LevelManager } from "../managers/LevelManager";
import { PowerUpManager } from "../managers/PowerUpManager";
import { OverworldManager } from "../managers/OverworldManager";
import { missionToLevelState } from "../managers/MissionManager";
import { BlueprintStore } from "../managers/BlueprintStore";
import { SolarSystemSessionManager } from "../managers/SolarSystemSessionManager";
import { ShipBuilderManager } from "../managers/ShipBuilderManager";
import { ShopManager } from "../managers/ShopManager";
import { SolarModuleRegistry } from "./data/SolarModuleRegistry";
import { NPCRegistry } from "./data/NPCRegistry";
import { SystemGateRegistry } from "./data/SystemGateRegistry";
import { GateTeleportSystem } from "./solarsystem/GateTeleportSystem";
import { MissionLogManager } from "../managers/MissionLogManager";
import { MissionRegistry } from "./data/MissionRegistry";
import type { MissionSpec } from "../types/missions";
import { CollisionSystem } from "../systems/CollisionSystem";
import { GameRenderer, type GalaxyMapData, type PlayerBlueprintVisual, type ShipyardRenderData, type ShipyardPaletteTile, type SolarSystemRenderData } from "../rendering/GameRenderer";
import type { SolarSystemState, SystemGate } from "../types/solarsystem";
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
import { soundManager } from "../audio/SoundManager";
import { getPirateBlueprint } from "./data/PirateBlueprintRegistry";
import type { SolarShipBlueprint, SavedBlueprintSummary } from "../types/solarShipBuilder";
import { GeometryEngine } from "./shipbuilder/GeometryEngine";

interface SolarEnemyBase {
  id: string;
  name: string;
  position: { x: number; y: number };
  health: number;
  maxHealth: number;
  alertLevel: "dormant" | "alerted" | "combat";
  alertRadiusKm: number;
  lastSpawnMs: number;
  spawnIntervalMs: number;
  maxShips: number;
}

interface SolarEnemyShip {
  id: string;
  baseId: string;
  typeIdx: number;
  sizeClass: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  heading: number;
  health: number;
  maxHealth: number;
  weapon0CooldownMs: number;
  weapon1CooldownMs: number;
}

interface SolarEnemyProjectile {
  id: string;
  weaponIdx: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  lifeMs: number;
  damage: number;
}

interface SolarFriendlyShip {
  id: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  heading: number;
  health: number;
  maxHealth: number;
  weaponCooldownMs: number;
}

interface SolarPlayerProjectile {
  id: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  damage: number;
  weaponKind: "cannon" | "laser" | "torpedo";
  lifetimeMs: number;
  maxLifetimeMs: number;
}

interface SolarExplosion {
  x: number;
  y: number;
  ageMs: number;
  maxAgeMs: number;
  scale: number;
}

const SOLAR_ENEMY_TYPES = [
  { name: "Scout",       color: 0xff5555, health:  60, speed: 14000 },
  { name: "Interceptor", color: 0xff8822, health:  80, speed: 16000 },
  { name: "Fighter",     color: 0xff2266, health: 100, speed: 11000 },
  { name: "Gunship",     color: 0xcc2222, health: 180, speed:  7000 },
  { name: "Destroyer",   color: 0x990033, health: 250, speed:  5500 },
  { name: "Predator",    color: 0xff9900, health:  90, speed: 15000 },
  { name: "Wraith",      color: 0xcc44ff, health:  70, speed: 18000 },
  { name: "Titan",       color: 0xff3300, health: 400, speed:  4000 },
  { name: "Spectre",     color: 0xff44aa, health:  80, speed: 17000 },
  { name: "Ravager",     color: 0xffaa00, health: 130, speed: 10000 },
] as const;

const SOLAR_WEAPONS = [
  { name: "X-Ray Laser",       damage: 12, range: 80,  cooldownMs: 1400, speed: 80000, color: 0x88ffff },
  { name: "Hyper Laser",       damage: 22, range: 100, cooldownMs: 2000, speed: 90000, color: 0xffff44 },
  { name: "Plasma Bolt",       damage: 18, range: 70,  cooldownMs: 2200, speed: 25000, color: 0xff8800 },
  { name: "Nuclear Missile",   damage: 55, range: 150, cooldownMs: 8000, speed: 12000, color: 0xff4400 },
  { name: "Antimatter Missile",damage: 75, range: 200, cooldownMs:10000, speed: 18000, color: 0xff00ff },
  { name: "Ion Cannon",        damage: 16, range: 85,  cooldownMs: 1800, speed: 70000, color: 0x4488ff },
  { name: "Photon Torpedo",    damage: 38, range: 120, cooldownMs: 5000, speed: 20000, color: 0xaaffff },
  { name: "Graviton Beam",     damage: 10, range: 60,  cooldownMs: 1500, speed: 60000, color: 0xaa44ff },
  { name: "Quantum Disruptor", damage: 30, range: 55,  cooldownMs: 2800, speed: 50000, color: 0x00ffaa },
  { name: "Neutron Burst",     damage: 45, range: 90,  cooldownMs: 5500, speed: 40000, color: 0xffff88 },
] as const;

// Which two weapons each enemy type carries (indices into SOLAR_WEAPONS).
const ENEMY_WEAPON_LOADOUT: ReadonlyArray<readonly [number, number]> = [
  [0, 2], // Scout:       X-Ray Laser + Plasma Bolt
  [1, 5], // Interceptor: Hyper Laser + Ion Cannon
  [2, 6], // Fighter:     Plasma Bolt + Photon Torpedo
  [3, 5], // Gunship:     Nuclear Missile + Ion Cannon
  [1, 3], // Destroyer:   Hyper Laser + Nuclear Missile
  [0, 4], // Predator:    X-Ray Laser + Antimatter Missile
  [8, 1], // Wraith:      Quantum Disruptor + Hyper Laser
  [9, 4], // Titan:       Neutron Burst + Antimatter Missile
  [7, 6], // Spectre:     Graviton Beam + Photon Torpedo
  [3, 8], // Ravager:     Nuclear Missile + Quantum Disruptor
];

/** Menu item ids used by updateMenu / updatePause. */
type MainMenuItem = "play" | "campaign" | "solar-system" | "shipyard" | "stats";
type PauseMenuItem = "continue" | "stats" | "quit";
const MAIN_MENU_ITEMS: readonly MainMenuItem[] = ["play", "campaign", "solar-system", "shipyard", "stats"];
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
  private readonly solarShipBuilderMgr = new ShipBuilderManager();
  private readonly shopManager = new ShopManager();
  private shopMenuSelection = 0;
  private shopStatusMsg: string | null = null;
  private shopStatusMs = 0;
  private solarSystem: SolarSystemSessionManager | null = null;
  private mapOpen = false;
  /** Cooldown after gate jump so the player doesn't immediately re-trigger the sister gate. */
  private gateCooldownMs = 0;
  /** Solar systems the player has entered at least once (used to colour the galaxy map). */
  private readonly visitedSystems: Set<string> = new Set();
  /** Lazy-built per-system data, keyed by `systemId` (matches SystemGate.systemId). */
  private readonly systemRegistry: Map<string, SolarSystemState> = new Map();
  /** Active solar-system id (matches SystemGate.systemId — e.g. "sol"). */
  private currentSystemId = "sol";
  /** Docked station menu state. */
  private dockedMenuSelection = 0;
  private dockedStatusMsg: string | null = null;
  private dockedStatusMs = 0;
  /** Solar-system enemy tracking. */
  private solarEnemyBases: SolarEnemyBase[] = [];
  private solarEnemyShips: SolarEnemyShip[] = [];
  private solarEnemyProjectiles: SolarEnemyProjectile[] = [];
  private solarEnemyNextId = 0;
  /** Click-to-lock targeting. */
  private solarLockedIds = new Set<string>();
  private solarFocusedId: string | null = null;
  /** Friendly escort ships. */
  private solarFriendlyShips: SolarFriendlyShip[] = [];
  /** Player projectiles (cannon / torpedo kinds). */
  private solarPlayerProjectiles: SolarPlayerProjectile[] = [];
  /** Per-weapon cooldowns (moduleDefId → remaining ms). */
  private solarWeaponCooldowns = new Map<string, number>();
  /** Auto-incrementing id counter for player projectiles and friendly ships. */
  private solarPlayerNextId = 0;
  /** Player health in solar system mode (separate from arcade health). */
  private solarPlayerHealth = 100;
  private solarPlayerMaxHealth = 100;
  private solarPlayerShield = 50;
  private solarPlayerMaxShield = 50;
  /** Flash overlay when player takes damage (counts down ms). */
  private solarDamageFlashMs = 0;
  /** Active explosions in solar-system space. */
  private solarExplosions: SolarExplosion[] = [];
  /** Death sequence timer (ms). >0 while dying; counts down to 0, then respawns. */
  private solarDeathTimerMs = 0;
  private solarPlayerDead = false;
  private static readonly SOLAR_DEATH_DURATION_MS = 6000; // 5s watch + 1s fade
  /** Fire edge tracking for solar-system shooting. */
  private prevSolarFirePressed = false;
  /** Laser flash FX (counts down from 200ms to 0). */
  private laserFlashMs = 0;

  // ── Anti-gravity state ───────────────────────────────────────────────────
  /** Continuous hold time with pure-forward thrust (no turn/strafe), ms. */
  private antiGravHoldMs = 0;
  private antiGravActive = false;
  /** Counts down 2000→0 after warp deactivates; gravity + speed cap restored gradually. */
  private warpDecayMs = 0;
  private static readonly WARP_DECAY_DURATION_MS = 2000;
  /** Counts down 3000→0 after warp fully decays; blocks docking during cooldown. */
  private warpDockCooldownMs = 0;
  private static readonly WARP_DOCK_COOLDOWN_MS = 3000;
  private static readonly ANTIGRAV_HOLD_THRESHOLD_MS = 2000;
  private laserFlashTarget: { x: number; y: number } | null = null;

  // ── Solar ship blueprints ─────────────────────────────────────────────────
  private readonly solarSavedBlueprints = new Map<string, SolarShipBlueprint>();
  private solarActiveBlueprintId: string | null = null;
  private solarBlueprintCounter = 0;

  // Blueprint shape caches — computed once per blueprint/sizeClass, reused every frame.
  private solarPlayerBlueprintCache: {
    blueprintId: string;
    modules: Array<{ vertices: Array<{ x: number; y: number }>; moduleType: string }>;
    coreRadius: number;
  } | null = null;
  private readonly pirateBlueprintModulesCache = new Map<number, {
    modules: Array<{ vertices: Array<{ x: number; y: number }>; moduleType: string }>;
    coreRadius: number;
  }>();
  /** Where the shipyard should return when ESC is pressed. */
  private shipyardReturnScreen: "main-menu" | "docked" = "main-menu";
  /** Selection in the solar-system pause overlay (0=Resume, 1=Quit). */
  private solarPauseSelection = 0;
  private readonly missionLog = new MissionLogManager();
  /** NPC currently being talked to (persists across npc-talk → missions → mission-detail) */
  private activeTalkNpcId: string | null = null;
  /** Mission id selected in mission-detail screen */
  private activeMissionDetailId: string | null = null;

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
    // Init AudioContext on first touch (mobile requires a user gesture).
    element.addEventListener("touchstart", () => soundManager.init(), { once: true, passive: true });
  }

  /**
   * Wire mouse pointer events on the given element so menu screens (shipyard,
   * starmap) can respond to clicks. Safe to call alongside enableTouchControls.
   */
  enablePointerControls(element: HTMLElement): void {
    this.input.attachPointer(element, this.width, this.height);
    // Init AudioContext on first click (desktop user gesture).
    element.addEventListener("pointerdown", () => soundManager.init(), { once: true });
  }

  /**
   * Notify the game that the canvas is displayed in portrait-rotated mode
   * (+90° CW CSS rotation). InputHandler remaps touch/mouse coordinates to
   * compensate. Call whenever orientation or game screen changes.
   */
  setPortraitMode(rotated: boolean): void {
    this.input.setPortraitMode(rotated);
  }

  /** Returns the current screen (used by main.ts for orientation management). */
  getCurrentScreen(): string {
    return this.state.getScreen();
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
    } else if (screen === "solar-system") {
      this.updateSolarSystem(clamped);
    } else if (screen === "solar-system-paused") {
      this.updateSolarSystemPaused();
    } else if (screen === "docked") {
      this.updateDockedMenu(clamped);
    } else if (screen === "solar-shipyard") {
      this.updateSolarShipBuilder(clamped);
    } else if (screen === "solar-shop") {
      this.updateSolarShop(clamped);
    } else if (screen === "solar-my-ships") {
      this.updateSolarMyShips();
    } else if (screen === "solar-npc-talk") {
      this.updateNpcTalk(clamped);
    } else if (screen === "solar-missions") {
      this.updateMissionList(clamped);
    } else if (screen === "solar-mission-detail") {
      this.updateMissionDetail(clamped);
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
    const swipeUp = input.swipeUpPulse;
    const swipeDown = input.swipeDownPulse;

    if (upEdge || swipeUp) {
      this.menuSelection = (this.menuSelection - 1 + itemCount) % itemCount;
      soundManager.menuNav();
    }
    if (downEdge || swipeDown) {
      this.menuSelection = (this.menuSelection + 1) % itemCount;
      soundManager.menuNav();
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

  /**
   * Detect which menu item was tapped, given the tap position and list layout.
   * Returns the item index, or null if no item was hit.
   */
  private tapMenuIdx(
    tap: { x: number; y: number },
    startY: number,
    rowSpacing: number,
    count: number,
  ): number | null {
    for (let i = 0; i < count; i++) {
      const cy = startY + i * rowSpacing;
      if (tap.y >= cy - rowSpacing / 2 && tap.y < cy + rowSpacing / 2) {
        return i;
      }
    }
    return null;
  }

  /** True when a point is inside a rectangle. */
  private inRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  /**
   * Merge real InputState with virtual solar-system control button state.
   * When the player holds the screen on a control zone, that action fires;
   * generic touch-fire is suppressed so the D-pad doesn't accidentally shoot.
   */
  private mergeSolarInput(raw: InputState): InputState {
    const pointer = raw.pointer;
    const held = raw.pointerHeld;
    if (!pointer || !held) return raw;
    const { x: px, y: py } = pointer;
    const inThrust = this.inRect(px, py, 120, 530, 100, 100);
    const inLeft   = this.inRect(px, py,  10, 590, 100, 100);
    const inRight  = this.inRect(px, py, 230, 590, 100, 100);
    const inFire   = this.inRect(px, py, 1150, 555, 120, 150);
    const inAny    = inThrust || inLeft || inRight || inFire;
    return {
      ...raw,
      thrustForward: raw.thrustForward || inThrust,
      turnLeft: raw.turnLeft || inLeft,
      turnRight: raw.turnRight || inRight,
      // Keyboard Space always fires; virtual zone fires when held; pure touch-fire suppressed
      fire: (raw.spaceHeld ?? false) || inFire,
      // Don't trigger dock/gate confirm when player taps a control zone
      menuConfirm: inAny ? false : raw.menuConfirm,
    };
  }

  // ── Screen: main menu ────────────────────────────────────────────────────

  private updateMenu(): void {
    const input = this.input.poll();

    // Direct tap on a menu button
    if (input.pointerDownPulse && this.menuDebounceMs === 0) {
      // Main menu items centred at y = height/2 + 40 + i*40
      const startY = this.height / 2 + 40;
      const rowSpacing = 40;
      const i = this.tapMenuIdx(input.pointerDownPulse, startY, rowSpacing, MAIN_MENU_ITEMS.length);
      if (i !== null) {
        this.menuSelection = i;
        this.executeMainMenuAction(i);
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
        return;
      }
    }

    this.stepMenuSelection(MAIN_MENU_ITEMS.length);
    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      this.executeMainMenuAction(this.menuSelection);
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    }
  }

  private executeMainMenuAction(idx: number): void {
    soundManager.menuConfirm();
    const pick = MAIN_MENU_ITEMS[idx]!;
    if (pick === "play") {
      this.startNewRun();
    } else if (pick === "campaign") {
      this.openStarmap();
    } else if (pick === "solar-system") {
      this.openSolarSystem();
    } else if (pick === "shipyard") {
      this.shipyardReturnScreen = "main-menu";
      this.openShipyard();
    } else {
      this.openStats("main-menu");
    }
  }

  // ── Screen: pause ────────────────────────────────────────────────────────

  private updatePause(): void {
    if (this.wasPausePressed() || this.wasMenuBackPressed()) {
      this.menuSelection = 0;
      this.state.setScreen("gameplay");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    const input = this.input.poll();
    if (input.pointerDownPulse && this.menuDebounceMs === 0) {
      // Pause menu items at y = height/2 + i*52
      const i = this.tapMenuIdx(input.pointerDownPulse, this.height / 2, 52, PAUSE_MENU_ITEMS.length);
      if (i !== null) {
        this.menuSelection = i;
        this.executePauseAction(i);
        return;
      }
    }

    this.stepMenuSelection(PAUSE_MENU_ITEMS.length);
    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      this.executePauseAction(this.menuSelection);
    }
  }

  private executePauseAction(idx: number): void {
    soundManager.menuConfirm();
    const pick = PAUSE_MENU_ITEMS[idx]!;
    if (pick === "continue") {
      this.menuSelection = 0;
      this.state.setScreen("gameplay");
    } else if (pick === "stats") {
      this.openStats("pause");
    } else if (pick === "quit") {
      this.state.finalizeRun("no-lives");
      this.menuSelection = 0;
      this.state.setScreen("main-menu");
    }
    this.menuDebounceMs = MENU_DEBOUNCE_MS;
  }

  // ── Screen: stats ────────────────────────────────────────────────────────

  private updateStats(): void {
    const input = this.input.poll();
    const tapped = input.pointerDownPulse !== null;
    if (
      (this.wasMenuBackPressed() || this.wasMenuConfirmPressed() || tapped) &&
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
    const input = this.input.poll();
    const tapped = input.pointerDownPulse !== null;
    if ((this.wasMenuConfirmPressed() || tapped) && this.menuDebounceMs === 0) {
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
    // shipyardReturnScreen defaults to "main-menu"; callers opening from docked
    // set it to "docked" before calling openShipyard().
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
      this.state.setScreen(this.shipyardReturnScreen);
      this.shipyardReturnScreen = "main-menu";
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
      this.state.setScreen(this.shipyardReturnScreen);
      this.shipyardReturnScreen = "main-menu";
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

  // ── Screen: solar system (open-world exploration) ─────────────────────────

  private openSolarSystem(): void {
    // Lazy-initialize solar system managers if not yet created
    if (!this.solarSystem) {
      this.initializeSolarSystemManagers();
    }

    if (!this.solarSystem) {
      console.error("Failed to initialize solar system managers");
      return;
    }

    this.menuSelection = 0;
    this.menuDebounceMs = 350;
    // If already docked (e.g. first launch or post-death respawn), go straight to dock screen.
    const isDocked = this.solarSystem.getSessionState().dockedLocationId !== null;
    this.state.setScreen(isDocked ? "docked" : "solar-system");
  }

  private initializeSolarSystemManagers(): void {
    // Build (or retrieve) the Sol system and use it as the starting point.
    const sol = this.getOrBuildSystemState("sol");
    this.systemRegistry.set("sol", sol);
    this.visitedSystems.add("sol");
    this.currentSystemId = "sol";

    // Minimal blueprint placeholder until real loadout integration lands.
    const dummyBlueprint = {
      id: "starter-blueprint",
      name: "Starter Ship",
      hullId: "light-frigate",
      installedUpgrades: {},
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };

    this.solarSystem = new SolarSystemSessionManager(sol, dummyBlueprint);
    this.missionLog.load();

    // Start the player docked at Earth Station.
    const sessionState = this.solarSystem.getSessionState();

    // Give the player 3 of each module as starter inventory.
    for (const mod of SolarModuleRegistry.getAllModules()) {
      if (mod.type !== "core") {
        sessionState.moduleInventory.set(mod.id, 3);
      }
    }
    sessionState.playerPosition = { x: 312, y: 0 }; // Earth Station world position
    sessionState.playerVelocity = { x: 0, y: 0 };
    sessionState.playerHeading = 0;
    sessionState.zoomLevel = 1.0;
    sessionState.dockedLocationId = "station-earth-orbit";
    sessionState.nearbyLocations = ["station-earth-orbit"];

    // Initialize the pirate base in Sol system.
    this.solarEnemyBases = [
      {
        id: "pirate-base-sol",
        name: "Pirate Stronghold",
        position: { x: 250, y: 120 },
        health: 500,
        maxHealth: 500,
        alertLevel: "dormant",
        alertRadiusKm: 180,
        lastSpawnMs: 0,
        spawnIntervalMs: 5000,
        maxShips: 6,
      },
    ];
    this.solarEnemyShips = [];
    this.solarEnemyProjectiles = [];
    this.solarEnemyNextId = 0;
    this.prevSolarFirePressed = false;
    this.laserFlashMs = 0;
    this.laserFlashTarget = null;
    this.solarPlayerHealth = this.solarPlayerMaxHealth;
    this.solarPlayerShield = this.solarPlayerMaxShield;
    this.solarDamageFlashMs = 0;
    this.solarExplosions = [];
    this.solarDeathTimerMs = 0;
    this.solarPlayerDead = false;
    this.solarLockedIds = new Set();
    this.solarFocusedId = null;
    this.solarFriendlyShips = [];
    this.solarPlayerProjectiles = [];
    this.solarWeaponCooldowns = new Map();
    this.solarPlayerNextId = 0;
  }

  /**
   * Returns the SolarSystemState for a given system id, building it lazily
   * the first time it is requested. Three systems are supported: `sol`,
   * `kepler-442`, `proxima-centauri` — matching the SystemGateRegistry.
   */
  private getOrBuildSystemState(systemId: string): SolarSystemState {
    const cached = this.systemRegistry.get(systemId);
    if (cached) return cached;

    let built: SolarSystemState;
    if (systemId === "sol") built = this.buildSolSystem();
    else if (systemId === "kepler-442") built = this.buildKeplerSystem();
    else if (systemId === "proxima-centauri") built = this.buildProximaSystem();
    else built = this.buildGenericSystem(systemId);

    this.systemRegistry.set(systemId, built);
    return built;
  }

  private buildSolSystem(): SolarSystemState {
    return {
      seed: { name: "Sol", timestamp: Date.now(), randomSeed: 12345 },
      celestialBodies: [
        {
          id: "star-sol", name: "Sol", type: "star",
          position: { x: 0, y: 0 }, radius: 25, mass: 1.989e30, gravityStrength: 14400,
          color: { r: 255, g: 200, b: 0 },
          orbital: this.staticOrbit(),
          isPrimaryGravitySource: true,
        },
        {
          id: "planet-earth", name: "Earth", type: "planet",
          position: { x: 300, y: 0 }, radius: 8, mass: 5.972e24, gravityStrength: 0,
          color: { r: 100, g: 150, b: 255 },
          orbital: this.staticOrbit("star-sol", 300),
          isPrimaryGravitySource: false,
        },
        {
          id: "planet-mars", name: "Mars", type: "planet",
          position: { x: 480, y: 80 }, radius: 6, mass: 6.417e23, gravityStrength: 0,
          color: { r: 200, g: 100, b: 80 },
          orbital: this.staticOrbit("star-sol", 486),
          isPrimaryGravitySource: false,
        },
      ],
      locations: [
        {
          id: "station-earth-orbit", name: "Earth Station", type: "station",
          bodyId: "planet-earth", position: { x: 12, y: 0 }, dockingRadius: 30,
          controllingFaction: "terran-federation",
          npcs: ["npc-commander-voss", "npc-trader-halley"], shops: [],
        },
        {
          id: "outpost-mars", name: "Curiosity Base", type: "outpost",
          bodyId: "planet-mars", position: { x: 8, y: 2 }, dockingRadius: 25,
          controllingFaction: "terran-federation",
          npcs: ["npc-trader-halley"], shops: [],
        },
      ],
      initialFactionAssignments: {},
      currentFactionControl: {},
      stateChangeLog: { entries: [] },
      lastUpdatedAt: Date.now(),
    };
  }

  private buildKeplerSystem(): SolarSystemState {
    return {
      seed: { name: "Kepler-442", timestamp: Date.now(), randomSeed: 24680 },
      celestialBodies: [
        {
          id: "star-kepler-442", name: "Kepler-442", type: "star",
          position: { x: 0, y: 0 }, radius: 22, mass: 1.4e30, gravityStrength: 12000,
          color: { r: 255, g: 180, b: 90 },
          orbital: this.staticOrbit(),
          isPrimaryGravitySource: true,
        },
        {
          id: "planet-kepler-442b", name: "Kepler-442b", type: "planet",
          position: { x: 340, y: -60 }, radius: 9, mass: 8.4e24, gravityStrength: 0,
          color: { r: 120, g: 200, b: 130 },
          orbital: this.staticOrbit("star-kepler-442", 346),
          isPrimaryGravitySource: false,
        },
      ],
      locations: [
        {
          id: "station-kepler-orbital", name: "Kepler Orbital", type: "station",
          bodyId: "planet-kepler-442b", position: { x: 14, y: 0 }, dockingRadius: 30,
          controllingFaction: "xeno-collective",
          npcs: ["npc-emissary-zyx", "npc-archivist-krell"], shops: [],
        },
      ],
      initialFactionAssignments: {},
      currentFactionControl: {},
      stateChangeLog: { entries: [] },
      lastUpdatedAt: Date.now(),
    };
  }

  private buildProximaSystem(): SolarSystemState {
    return {
      seed: { name: "Proxima Centauri", timestamp: Date.now(), randomSeed: 13579 },
      celestialBodies: [
        {
          id: "star-proxima", name: "Proxima Centauri", type: "star",
          position: { x: 0, y: 0 }, radius: 15, mass: 2.4e29, gravityStrength: 8000,
          color: { r: 255, g: 100, b: 80 },
          orbital: this.staticOrbit(),
          isPrimaryGravitySource: true,
        },
        {
          id: "planet-proxima-b", name: "Proxima b", type: "planet",
          position: { x: 200, y: 40 }, radius: 7, mass: 7.6e24, gravityStrength: 0,
          color: { r: 180, g: 90, b: 70 },
          orbital: this.staticOrbit("star-proxima", 204),
          isPrimaryGravitySource: false,
        },
      ],
      locations: [
        {
          id: "outpost-proxima-b", name: "Frontier Outpost", type: "outpost",
          bodyId: "planet-proxima-b", position: { x: 8, y: 0 }, dockingRadius: 25,
          controllingFaction: "nova-rebels",
          npcs: ["npc-insurgent-tyne", "npc-strategist-orion"], shops: [],
        },
      ],
      initialFactionAssignments: {},
      currentFactionControl: {},
      stateChangeLog: { entries: [] },
      lastUpdatedAt: Date.now(),
    };
  }

  private buildGenericSystem(systemId: string): SolarSystemState {
    return {
      seed: { name: systemId, timestamp: Date.now(), randomSeed: 1 },
      celestialBodies: [
        {
          id: `${systemId}-primary`, name: systemId, type: "star",
          position: { x: 0, y: 0 }, radius: 20, mass: 1e30, gravityStrength: 10000,
          color: { r: 200, g: 200, b: 200 },
          orbital: this.staticOrbit(),
          isPrimaryGravitySource: true,
        },
      ],
      locations: [],
      initialFactionAssignments: {},
      currentFactionControl: {},
      stateChangeLog: { entries: [] },
      lastUpdatedAt: Date.now(),
    };
  }

  private staticOrbit(parentId: string | null = null, semiMajorAxis = 0) {
    return {
      parentId,
      semiMajorAxis,
      eccentricity: 0,
      inclination: 0,
      longitudeAscendingNode: 0,
      argumentOfPeriapsis: 0,
      meanAnomalyAtEpoch: 0,
      orbitalPeriodMs: 0,
      currentAnomaly: 0,
    };
  }

  private updateSolarSystem(deltaMs: number): void {
    if (!this.solarSystem) {
      this.state.setScreen("main-menu");
      return;
    }

    // Tick explosions every frame regardless of game state
    for (const e of this.solarExplosions) e.ageMs += deltaMs;
    this.solarExplosions = this.solarExplosions.filter(e => e.ageMs < e.maxAgeMs);

    // Death sequence: freeze input, wait for animation, then respawn
    if (this.solarDeathTimerMs > 0) {
      this.solarDeathTimerMs -= deltaMs;
      if (this.solarDeathTimerMs <= 0) {
        this.solarDeathTimerMs = 0;
        this.solarPlayerDead = false;
        this.solarPlayerHealth = this.solarPlayerMaxHealth;
        this.solarPlayerShield = this.solarPlayerMaxShield;
        const ss = this.solarSystem.getSessionState();
        ss.playerPosition = { x: 312, y: 0 };
        ss.playerVelocity = { x: 0, y: 0 };
        ss.playerHeading = 0;
        ss.dockedLocationId = "station-earth-orbit";
        ss.nearbyLocations = ["station-earth-orbit"];
        this.state.setScreen("docked");
      }
      return;
    }

    // Advance economy clock and refresh shops when cycle completes
    const session = this.solarSystem.getSessionState();
    session.gameTimeMs += deltaMs;
    if (this.shopManager.tick(deltaMs)) {
      // Cycle advanced — ensure shops exist for all current system locations
      const system = this.solarSystem.getCurrentSystem();
      for (const loc of system.locations) {
        this.shopManager.ensureShop(loc.id, loc.controllingFaction ?? "terran-federation");
      }
    }

    // Pause toggle (ESC / P)
    if (this.wasPausePressed() && this.menuDebounceMs === 0) {
      soundManager.setThrusterActive(false);
      this.state.setScreen("solar-system-paused");
      this.menuDebounceMs = 350;
      return;
    }

    const rawInput = this.input.poll();
    // Merge virtual touch control zones into input (suppresses accidental dock/fire from D-pad taps)
    const input = this.mergeSolarInput(rawInput);

    // Map toggle (M)
    if (input.mapTogglePulse) {
      this.mapOpen = !this.mapOpen;
    }

    // While the galaxy map is open, don't drive ship physics — just allow
    // the player to read and close it again.
    if (!this.mapOpen) {
      this.updateAntiGravity(input, deltaMs);
      const skipGrav = this.antiGravActive || this.warpDecayMs > 0;
      const decayT = this.warpDecayMs / GameManager.WARP_DECAY_DURATION_MS; // 1→0
      const speedMult = this.antiGravActive ? 10 : (1 + decayT * 9); // 10x→1x during decay
      this.solarSystem.updateShipPhysics(input, deltaMs, skipGrav, speedMult);
      soundManager.setThrusterActive(this.solarSystem.getLastThrustActive() || this.antiGravActive);
      soundManager.tickThruster(deltaMs);
    }

    // Proximity updates: stations + gates
    this.solarSystem.updateNearbyLocations();

    this.gateCooldownMs = Math.max(0, this.gateCooldownMs - deltaMs);
    const playerPos = this.solarSystem.getSessionState().playerPosition;
    const gates = SystemGateRegistry.getGatesBySystem(this.currentSystemId);
    const nearbyGate = this.gateCooldownMs > 0
      ? null
      : GateTeleportSystem.checkGateProximity(playerPos, gates as SystemGate[]);

    // F key — dock at nearby station OR jump through a gate
    const warpBlocked = this.antiGravActive || this.warpDecayMs > 0 || this.warpDockCooldownMs > 0;
    if (input.dockPulse && this.menuDebounceMs === 0) {
      const nearbyStations = this.solarSystem.getNearbyLocations();
      const loc = nearbyStations[0];
      if (loc && !warpBlocked) {
        if (this.solarSystem.dock(loc.id)) {
          soundManager.docking();
          this.checkExploreMissions(loc.id);
          this.dockedMenuSelection = 0;
          this.menuSelection = 0;
          this.state.setScreen("docked");
          this.menuDebounceMs = 350;
          return;
        }
      } else if (nearbyGate) {
        this.attemptGateJump(nearbyGate);
        this.menuDebounceMs = 350;
        return;
      }
    }

    // Click-to-lock: tap on an enemy to lock/unlock it.
    if (input.pointerDownPulse && !this.mapOpen) {
      const { x: sx, y: sy } = input.pointerDownPulse;
      const zoom = this.solarSystem.getSessionState().zoomLevel;
      const kmToPx = Math.max(0.05, zoom);
      const pcx = this.width / 2;  // 640
      const pcy = this.height / 2; // 360
      const worldX = (sx - pcx) / kmToPx + playerPos.x;
      const worldY = (sy - pcy) / kmToPx + playerPos.y;
      const sensorRange = 200; // km
      let bestDist = 50; // km click-radius
      let clicked: string | null = null;
      for (const ship of this.solarEnemyShips) {
        const d = Math.hypot(ship.position.x - worldX, ship.position.y - worldY);
        const playerDist = Math.hypot(ship.position.x - playerPos.x, ship.position.y - playerPos.y);
        if (d < bestDist && playerDist < sensorRange) {
          bestDist = d; clicked = ship.id;
        }
      }
      if (clicked) {
        if (this.solarLockedIds.has(clicked)) {
          this.solarLockedIds.delete(clicked);
          if (this.solarFocusedId === clicked) this.solarFocusedId = null;
        } else {
          this.solarLockedIds.add(clicked);
          this.solarFocusedId = clicked;
        }
      }
    }

    // Validate existing locks: remove any that moved out of sensor range or were destroyed
    const sensorRangeKm = 200;
    for (const lockedId of [...this.solarLockedIds]) {
      const ship = this.solarEnemyShips.find(s => s.id === lockedId);
      if (!ship || Math.hypot(ship.position.x - playerPos.x, ship.position.y - playerPos.y) > sensorRangeKm) {
        this.solarLockedIds.delete(lockedId);
        if (this.solarFocusedId === lockedId) this.solarFocusedId = null;
      }
    }
    if (!this.solarFocusedId && this.solarLockedIds.size > 0) {
      for (const id of this.solarLockedIds) { this.solarFocusedId = id; break; }
    }

    // Fire weapon (Space — edge triggered, only when map is closed and no dock action this frame).
    const fireEdge = input.fire && !this.prevSolarFirePressed;
    this.prevSolarFirePressed = input.fire ?? false;

    // Auto-attack focused target (or fallback to cone scan on space press).
    if (this.solarFocusedId && !this.mapOpen) {
      const focused = this.solarEnemyShips.find(s => s.id === this.solarFocusedId);
      if (!focused) {
        this.solarLockedIds.delete(this.solarFocusedId);
        this.solarFocusedId = null;
      } else {
        this.fireWeaponsAtTarget(playerPos, focused.position);
      }
    } else if (fireEdge && !this.mapOpen && this.menuDebounceMs === 0) {
      this.fireSolarWeapon(playerPos, this.solarSystem.getSessionState().playerHeading);
    }

    this.laserFlashMs = Math.max(0, this.laserFlashMs - deltaMs);

    // Tick weapon cooldowns.
    for (const [defId, cd] of this.solarWeaponCooldowns) {
      const next = Math.max(0, cd - deltaMs);
      if (next === 0) this.solarWeaponCooldowns.delete(defId);
      else this.solarWeaponCooldowns.set(defId, next);
    }

    if (input.zoomDelta) {
      this.solarSystem.adjustZoom(input.zoomDelta);
    }

    // Update enemy bases and ships only in Sol system for now.
    if (this.currentSystemId === "sol") {
      this.updateSolarEnemies(deltaMs, playerPos);
      this.updatePlayerProjectiles(deltaMs);
      this.updateFriendlyShips(deltaMs, playerPos);
    }
  }

  private getActiveWeapons(): Array<{ defId: string; damage: number; rateHz: number; kind: "cannon" | "laser" | "torpedo" }> {
    const bp = this.solarActiveBlueprintId ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId) : null;
    if (!bp) {
      return [{ defId: "default-laser", damage: 34, rateHz: 1.5, kind: "laser" }];
    }
    return bp.modules
      .map(m => SolarModuleRegistry.getModule(m.moduleDefId))
      .filter((d): d is NonNullable<typeof d> => !!d && d.type === "weapon")
      .map(d => ({
        defId: d.id,
        damage: d.stats.damagePerShot ?? 20,
        rateHz: d.stats.fireRateHz ?? 1.0,
        kind: (d.id.includes("cannon") ? "cannon" : d.id.includes("torpedo") ? "torpedo" : "laser") as "cannon" | "laser" | "torpedo",
      }));
  }

  private fireWeaponsAtTarget(from: { x: number; y: number }, target: { x: number; y: number }): void {
    const weapons = this.getActiveWeapons();
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 600; // km/s

    for (const w of weapons) {
      const cooldown = this.solarWeaponCooldowns.get(w.defId) ?? 0;
      if (cooldown > 0) continue;
      const intervalMs = 1000 / w.rateHz;
      this.solarWeaponCooldowns.set(w.defId, intervalMs);

      if (w.kind === "laser") {
        soundManager.solarShoot();
        this.laserFlashTarget = { ...target };
        this.laserFlashMs = 200;
        // Instant hit
        const ship = this.solarEnemyShips.find(s =>
          Math.hypot(s.position.x - target.x, s.position.y - target.y) < 20
        );
        if (ship) {
          this.damageEnemyShip(ship, w.damage);
        }
      } else {
        // Cannon / torpedo — create projectile
        const vx = (dx / dist) * speed;
        const vy = (dy / dist) * speed;
        const lifetime = w.kind === "torpedo" ? 8000 : 3000;
        this.solarPlayerProjectiles.push({
          id: `pp-${this.solarPlayerNextId++}`,
          position: { ...from },
          velocity: { x: vx, y: vy },
          damage: w.damage,
          weaponKind: w.kind,
          lifetimeMs: lifetime,
          maxLifetimeMs: lifetime,
        });
      }
    }
  }

  /** Apply damage to an enemy ship, removing it and checking missions if destroyed. */
  private damageEnemyShip(ship: SolarEnemyShip, damage: number): void {
    ship.health -= damage;
    if (ship.health <= 0) {
      this.solarExplosions.push({
        x: ship.position.x,
        y: ship.position.y,
        ageMs: 0,
        maxAgeMs: 900,
        scale: 1 + ship.sizeClass * 0.4,
      });
      this.solarLockedIds.delete(ship.id);
      if (this.solarFocusedId === ship.id) {
        this.solarFocusedId = null;
        // Auto-focus next remaining lock
        for (const id of this.solarLockedIds) { this.solarFocusedId = id; break; }
      }
      this.solarEnemyShips = this.solarEnemyShips.filter(s => s.id !== ship.id);
      this.checkKillMissions();
      const base = this.solarEnemyBases.find(b => b.id === ship.baseId);
      if (base) {
        const remaining = this.solarEnemyShips.filter(s => s.baseId === base.id);
        if (remaining.length === 0) {
          base.health = Math.max(0, base.health - 50);
        }
      }
    }
  }

  private fireSolarWeapon(playerPos: { x: number; y: number }, headingDeg: number): void {
    const headingRad = (headingDeg * Math.PI) / 180;
    const fwdX = Math.sin(headingRad);
    const fwdY = -Math.cos(headingRad);
    const maxRangeKm = 120;
    const halfConeDeg = 45;

    let bestDist = Infinity;
    let bestShip: SolarEnemyShip | null = null;

    for (const ship of this.solarEnemyShips) {
      const dx = ship.position.x - playerPos.x;
      const dy = ship.position.y - playerPos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRangeKm) continue;
      const dotNorm = (dx * fwdX + dy * fwdY) / dist;
      const angleDeg = (Math.acos(Math.max(-1, Math.min(1, dotNorm))) * 180) / Math.PI;
      if (angleDeg > halfConeDeg) continue;
      if (dist < bestDist) { bestDist = dist; bestShip = ship; }
    }

    if (bestShip) {
      this.fireWeaponsAtTarget(playerPos, bestShip.position);
    } else {
      soundManager.solarShoot(); // miss sound
      this.laserFlashTarget = {
        x: playerPos.x + fwdX * maxRangeKm,
        y: playerPos.y + fwdY * maxRangeKm,
      };
      this.laserFlashMs = 100;
    }
  }

  private updatePlayerProjectiles(deltaMs: number): void {
    const dtS = deltaMs / 1000;
    const survived: SolarPlayerProjectile[] = [];
    for (const proj of this.solarPlayerProjectiles) {
      proj.position.x += proj.velocity.x * dtS;
      proj.position.y += proj.velocity.y * dtS;
      proj.lifetimeMs -= deltaMs;
      if (proj.lifetimeMs <= 0) continue;
      let hit = false;
      for (const ship of this.solarEnemyShips) {
        if (Math.hypot(ship.position.x - proj.position.x, ship.position.y - proj.position.y) < 10) {
          this.damageEnemyShip(ship, proj.damage);
          hit = true;
          break;
        }
      }
      if (!hit) survived.push(proj);
    }
    this.solarPlayerProjectiles = survived;
  }

  private updateFriendlyShips(deltaMs: number, playerPos: { x: number; y: number }): void {
    const FORMATION_OFFSETS = [
      { x: -60, y: 40 }, { x: 60, y: 40 }, { x: 0, y: 70 },
    ];
    const dtS = deltaMs / 1000;
    const MAX_SPEED = 5000; // m/s

    for (let i = 0; i < this.solarFriendlyShips.length; i++) {
      const ship = this.solarFriendlyShips[i]!;
      const formOff = FORMATION_OFFSETS[i % 3]!;
      const targetPos = { x: playerPos.x + formOff.x, y: playerPos.y + formOff.y };
      const dx = targetPos.x - ship.position.x;
      const dy = targetPos.y - ship.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const speed = Math.min(MAX_SPEED, dist * 2000);
        ship.velocity.x = (dx / dist) * speed;
        ship.velocity.y = (dy / dist) * speed;
        ship.heading = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      } else {
        ship.velocity = { x: 0, y: 0 };
      }
      ship.position.x += ship.velocity.x * dtS / 1000;
      ship.position.y += ship.velocity.y * dtS / 1000;

      // Auto-attack nearest enemy within 200km
      ship.weaponCooldownMs = Math.max(0, ship.weaponCooldownMs - deltaMs);
      if (ship.weaponCooldownMs <= 0 && this.solarEnemyShips.length > 0) {
        let nearestDist = 200;
        let nearest: SolarEnemyShip | null = null;
        for (const enemy of this.solarEnemyShips) {
          const d = Math.hypot(enemy.position.x - ship.position.x, enemy.position.y - ship.position.y);
          if (d < nearestDist) { nearestDist = d; nearest = enemy; }
        }
        if (nearest) {
          this.damageEnemyShip(nearest, 20);
          ship.weaponCooldownMs = 2000;
          this.laserFlashTarget = { ...nearest.position };
          this.laserFlashMs = 150;
        }
      }
    }
  }

  private updateSolarEnemies(deltaMs: number, playerPos: { x: number; y: number }): void {
    const nowMs = Date.now();
    const dtS = deltaMs / 1000;

    // ── Bases: alert escalation + spawning ────────────────────────────────
    for (const base of this.solarEnemyBases) {
      if (base.health <= 0) continue;

      const distToBase = Math.hypot(playerPos.x - base.position.x, playerPos.y - base.position.y);
      if (base.alertLevel === "dormant" && distToBase <= base.alertRadiusKm) {
        base.alertLevel = "combat"; // skip "alerted" for snappier gameplay
      }
      if (base.alertLevel !== "combat") continue;

      const activeForBase = this.solarEnemyShips.filter((s) => s.baseId === base.id).length;
      const timeSinceSpawn = nowMs - base.lastSpawnMs;
      if (activeForBase < base.maxShips && timeSinceSpawn >= base.spawnIntervalMs) {
        const angle = Math.random() * Math.PI * 2;
        const typeIdx = this.solarEnemyNextId % SOLAR_ENEMY_TYPES.length;
        const typeDef = SOLAR_ENEMY_TYPES[typeIdx]!;
        const loadout = ENEMY_WEAPON_LOADOUT[typeIdx]!;
        // Scale ship using pirate blueprint stats when available
        const sizeClass = (typeIdx % 9) + 1;
        const pirateBp = getPirateBlueprint(sizeClass);
        const coreDef = pirateBp
          ? SolarModuleRegistry.getModule(pirateBp.modules[0]!.moduleDefId)
          : null;
        const health = coreDef?.stats.hp ?? typeDef.health;
        const newShip: SolarEnemyShip = {
          id: `enemy-${++this.solarEnemyNextId}`,
          baseId: base.id,
          typeIdx,
          sizeClass,
          position: {
            x: base.position.x + Math.cos(angle) * 20,
            y: base.position.y + Math.sin(angle) * 20,
          },
          velocity: { x: 0, y: 0 },
          heading: 0,
          health,
          maxHealth: health,
          weapon0CooldownMs: Math.random() * SOLAR_WEAPONS[loadout[0]]!.cooldownMs,
          weapon1CooldownMs: Math.random() * SOLAR_WEAPONS[loadout[1]]!.cooldownMs,
        };
        this.solarEnemyShips.push(newShip);
        base.lastSpawnMs = nowMs;
      }
    }

    // ── Ships: movement + firing ──────────────────────────────────────────
    for (const ship of this.solarEnemyShips) {
      const typeDef = SOLAR_ENEMY_TYPES[ship.typeIdx]!;
      const loadout = ENEMY_WEAPON_LOADOUT[ship.typeIdx]!;

      const dx = playerPos.x - ship.position.x;
      const dy = playerPos.y - ship.position.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;

      const accelMs2 = typeDef.speed * 0.4;
      ship.velocity.x += dirX * accelMs2 * dtS;
      ship.velocity.y += dirY * accelMs2 * dtS;

      const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
      if (speed > typeDef.speed) {
        ship.velocity.x = (ship.velocity.x / speed) * typeDef.speed;
        ship.velocity.y = (ship.velocity.y / speed) * typeDef.speed;
      }

      ship.position.x += (ship.velocity.x * dtS) / 1000;
      ship.position.y += (ship.velocity.y * dtS) / 1000;
      ship.heading = (Math.atan2(dirX, -dirY) * 180) / Math.PI;

      // Weapon 0 fire
      ship.weapon0CooldownMs = Math.max(0, ship.weapon0CooldownMs - deltaMs);
      if (ship.weapon0CooldownMs === 0) {
        const wDef = SOLAR_WEAPONS[loadout[0]]!;
        if (dist <= wDef.range) {
          this.fireEnemyWeapon(ship, loadout[0], playerPos, dist);
          ship.weapon0CooldownMs = wDef.cooldownMs;
        }
      }

      // Weapon 1 fire
      ship.weapon1CooldownMs = Math.max(0, ship.weapon1CooldownMs - deltaMs);
      if (ship.weapon1CooldownMs === 0) {
        const wDef = SOLAR_WEAPONS[loadout[1]]!;
        if (dist <= wDef.range) {
          this.fireEnemyWeapon(ship, loadout[1], playerPos, dist);
          ship.weapon1CooldownMs = wDef.cooldownMs;
        }
      }
    }

    // ── Projectiles: movement + player collision ──────────────────────────
    const hitRadius = 5; // km — proximity hit
    this.solarDamageFlashMs = Math.max(0, this.solarDamageFlashMs - deltaMs);

    this.solarEnemyProjectiles = this.solarEnemyProjectiles.filter((p) => {
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) return false;

      p.position.x += (p.velocity.x * dtS) / 1000;
      p.position.y += (p.velocity.y * dtS) / 1000;

      const dpx = p.position.x - playerPos.x;
      const dpy = p.position.y - playerPos.y;
      if (dpx * dpx + dpy * dpy <= hitRadius * hitRadius) {
        // Hit player — shield absorbs first
        let dmg = p.damage;
        if (this.solarPlayerShield > 0) {
          const absorbed = Math.min(this.solarPlayerShield, dmg);
          this.solarPlayerShield -= absorbed;
          dmg -= absorbed;
        }
        this.solarPlayerHealth = Math.max(0, this.solarPlayerHealth - dmg);
        soundManager.solarHit();
        this.solarDamageFlashMs = 300;
        if (this.solarPlayerHealth <= 0 && this.solarDeathTimerMs === 0) {
          // Start death sequence: ship vanishes, 5 s explosion watch + 1 s fade
          this.solarDeathTimerMs = GameManager.SOLAR_DEATH_DURATION_MS;
          this.solarPlayerDead = true;
          const pPos = this.solarSystem?.getSessionState().playerPosition ?? { x: 0, y: 0 };
          this.solarExplosions.push({ x: pPos.x, y: pPos.y, ageMs: 0, maxAgeMs: 5000, scale: 6 });
          this.solarExplosions.push({ x: pPos.x - 5, y: pPos.y + 3, ageMs: 150, maxAgeMs: 4500, scale: 3 });
          this.solarExplosions.push({ x: pPos.x + 6, y: pPos.y - 4, ageMs: 300, maxAgeMs: 4800, scale: 2.5 });
          this.solarLockedIds = new Set();
          this.solarFocusedId = null;
          soundManager.setThrusterActive(false);
          soundManager.playerDeath();
        }
        return false;
      }
      return true;
    });
  }

  private fireEnemyWeapon(
    ship: SolarEnemyShip,
    weaponIdx: number,
    playerPos: { x: number; y: number },
    dist: number,
  ): void {
    const wDef = SOLAR_WEAPONS[weaponIdx]!;
    const dx = playerPos.x - ship.position.x;
    const dy = playerPos.y - ship.position.y;
    const dn = dist || 1;
    // Slight inaccuracy for gameplay feel (±5° spread)
    const spread = (Math.random() - 0.5) * 0.175;
    const cosS = Math.cos(spread);
    const sinS = Math.sin(spread);
    const dirX = (dx / dn) * cosS - (dy / dn) * sinS;
    const dirY = (dx / dn) * sinS + (dy / dn) * cosS;

    this.solarEnemyProjectiles.push({
      id: `proj-${++this.solarEnemyNextId}`,
      weaponIdx,
      position: { x: ship.position.x, y: ship.position.y },
      velocity: { x: dirX * wDef.speed, y: dirY * wDef.speed },
      lifeMs: (wDef.range / wDef.speed) * 1_000_000, // life = range / speed (km/(m/s) * 1000 * 1000)
      damage: wDef.damage,
    });
  }

  private attemptGateJump(sourceGate: SystemGate): void {
    if (!this.solarSystem) return;
    const sister = SystemGateRegistry.getSisterGate(sourceGate.id);
    if (!sister) return;

    const destSystemId = sister.systemId;
    const destSystem = this.getOrBuildSystemState(destSystemId);
    const result = GateTeleportSystem.teleport(
      this.solarSystem.getSessionState(),
      sourceGate,
      sister,
      destSystem,
    );
    if (result.success) {
      soundManager.gateJump();
      this.currentSystemId = destSystemId;
      this.visitedSystems.add(destSystemId);
      // Prevent immediate re-trigger inside sister gate's radius.
      this.gateCooldownMs = 1500;
    }
  }

  private updateAntiGravity(input: InputState, deltaMs: number): void {
    const inp = input as any;
    const thrustFwd = inp.thrustForward === true;
    const turning = inp.turnLeft === true || inp.turnRight === true;
    const strafing = inp.strafeLeft === true || inp.strafeRight === true;
    const pureFwd = thrustFwd && !turning && !strafing;

    // Count down decay timer
    if (this.warpDecayMs > 0) {
      const prev = this.warpDecayMs;
      this.warpDecayMs = Math.max(0, this.warpDecayMs - deltaMs);
      if (prev > 0 && this.warpDecayMs === 0) {
        // Warp fully dissipated — start 3-second dock cooldown
        this.warpDockCooldownMs = GameManager.WARP_DOCK_COOLDOWN_MS;
      }
    }
    if (this.warpDockCooldownMs > 0) {
      this.warpDockCooldownMs = Math.max(0, this.warpDockCooldownMs - deltaMs);
    }

    if (!this.antiGravActive) {
      this.antiGravHoldMs = pureFwd ? this.antiGravHoldMs + deltaMs : 0;
      if (this.antiGravHoldMs >= GameManager.ANTIGRAV_HOLD_THRESHOLD_MS) {
        this.antiGravActive = true;
        this.warpDecayMs = 0;
      }
      return;
    }

    // Deactivate when player releases forward or adds turn/strafe → start decay
    if (!thrustFwd || turning || strafing) {
      this.antiGravActive = false;
      this.antiGravHoldMs = 0;
      this.warpDecayMs = GameManager.WARP_DECAY_DURATION_MS;
    }
  }

  private updateSolarSystemPaused(): void {
    if (this.wasPausePressed() && this.menuDebounceMs === 0) {
      this.solarPauseSelection = 0;
      this.state.setScreen("solar-system");
      this.menuDebounceMs = 350;
      return;
    }

    const input = this.input.poll();
    // Up/Down navigate between RESUME and QUIT TO MENU
    const upEdge = input.moveUp && !this.prevUpPressed;
    const downEdge = input.moveDown && !this.prevDownPressed;
    if (upEdge || input.swipeUpPulse) this.solarPauseSelection = 0;
    if (downEdge || input.swipeDownPulse) this.solarPauseSelection = 1;

    // Tap on RESUME button (center y ≈ height/2 - 35) or QUIT button (center y ≈ height/2 + 35)
    if (input.pointerDownPulse && this.menuDebounceMs === 0) {
      const tap = input.pointerDownPulse;
      const halfH = this.height / 2;
      if (tap.y >= halfH - 75 && tap.y < halfH + 10) {
        this.solarPauseSelection = 0;
        this.executeSolarPauseAction(0);
        return;
      }
      if (tap.y >= halfH + 10 && tap.y < halfH + 90) {
        this.solarPauseSelection = 1;
        this.executeSolarPauseAction(1);
        return;
      }
    }

    if ((this.wasMenuConfirmPressed() || this.wasMenuBackPressed()) && this.menuDebounceMs === 0) {
      this.executeSolarPauseAction(this.solarPauseSelection);
    }
  }

  private executeSolarPauseAction(idx: number): void {
    soundManager.menuConfirm();
    soundManager.setThrusterActive(false);
    if (idx === 0) {
      this.solarPauseSelection = 0;
      this.state.setScreen("solar-system");
    } else {
      this.solarPauseSelection = 0;
      this.state.setScreen("main-menu");
    }
    this.menuDebounceMs = 350;
  }

  private getDockedMenuItems(): readonly string[] {
    const dockedLocId = this.solarSystem?.getSessionState().dockedLocationId ?? null;
    const activeNpc = this.getDockedNpc();
    const hasShipyard =
      dockedLocId === "station-earth-orbit" || dockedLocId === "outpost-mars";
    const npcItems = activeNpc ? ["Talk to NPC"] : [];
    const escortItem = this.solarFriendlyShips.length < 3 ? ["Launch Escort"] : [];
    if (hasShipyard) {
      return [...npcItems, "Repair Bay", ...escortItem, "Shop", "Shipyard", "My Ships", "Galaxy Map", "Undock"];
    }
    return [...npcItems, "Repair Bay", ...escortItem, "Shop", "My Ships", "Galaxy Map", "Undock"];
  }

  private getDockedNpc() {
    const session = this.solarSystem?.getSessionState();
    const locId = session?.dockedLocationId ?? null;
    if (!locId) return undefined;
    const system = this.solarSystem!.getCurrentSystem();
    const loc = system.locations.find((l) => l.id === locId);
    return loc?.npcs[0] ? NPCRegistry.getNPC(loc.npcs[0]) : undefined;
  }

  private updateDockedMenu(deltaMs: number): void {
    if (!this.solarSystem) {
      this.state.setScreen("main-menu");
      return;
    }
    this.dockedStatusMs = Math.max(0, this.dockedStatusMs - deltaMs);
    if (this.dockedStatusMs === 0) this.dockedStatusMsg = null;

    const menuItems = this.getDockedMenuItems();

    // M key toggles galaxy map overlay while staying docked.
    const input0 = this.input.poll();
    if (input0.mapTogglePulse) {
      this.mapOpen = !this.mapOpen;
      this.menuDebounceMs = 150;
    }

    // ESC closes the map if open; otherwise undocks.
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      if (this.mapOpen) {
        this.mapOpen = false;
        this.menuDebounceMs = 350;
        return;
      }
      this.solarSystem.undock();
      this.state.setScreen("solar-system");
      this.menuDebounceMs = 350;
      return;
    }

    // Up/Down navigate menu.
    this.stepMenuSelection(menuItems.length);
    this.dockedMenuSelection = this.menuSelection;

    // Tap on a menu item directly.
    const input = this.input.poll();
    if (input.pointerDownPulse && this.menuDebounceMs === 0) {
      // Panel itemTopY = panelY + 80, panelY = height/2 - 180
      const itemTopY = this.height / 2 - 100; // 360/2 - 180 + 80 = 260
      const i = this.tapMenuIdx(input.pointerDownPulse, itemTopY, 44, menuItems.length);
      if (i !== null) {
        this.dockedMenuSelection = i;
        this.menuSelection = i;
        this.executeDockedMenuAction(menuItems[i]!);
        return;
      }
    }

    // Enter selects.
    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      this.executeDockedMenuAction(menuItems[this.dockedMenuSelection] ?? "Undock");
    }
  }

  private executeDockedMenuAction(item: string): void {
    soundManager.menuConfirm();
    if (!this.solarSystem) return;
    if (item === "Undock") {
      soundManager.undocking();
      this.applyActiveSolarBlueprint();
      this.solarSystem.undock();
      this.state.setScreen("solar-system");
      this.menuDebounceMs = 350;
      return;
    }
    if (item === "Galaxy Map") {
      this.mapOpen = true;
      this.menuDebounceMs = 350;
      return;
    }
    if (item === "Shipyard") {
      const active = this.solarActiveBlueprintId
        ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId)
        : undefined;
      if (active) {
        this.solarShipBuilderMgr.open(active.modules[0]!.moduleDefId, active.coreSideCount, active);
      } else {
        this.solarShipBuilderMgr.open("core-c1-balanced", 6);
      }
      this.state.setScreen("solar-shipyard");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    if (item === "My Ships") {
      this.state.setScreen("solar-my-ships");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    if (item === "Talk to NPC") {
      const npc = this.getDockedNpc();
      if (npc) {
        this.activeTalkNpcId = npc.id;
        this.menuSelection = 0;
        this.state.setScreen("solar-npc-talk");
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
      }
      return;
    }
    if (item === "Launch Escort") {
      if (this.solarFriendlyShips.length < 3) {
        const id = `friendly-${this.solarPlayerNextId++}`;
        const session = this.solarSystem!.getSessionState();
        this.solarFriendlyShips.push({
          id,
          health: 80,
          maxHealth: 80,
          position: { ...session.playerPosition },
          velocity: { x: 0, y: 0 },
          heading: session.playerHeading,
          weaponCooldownMs: 1000,
        });
        this.dockedStatusMsg = `Escort launched (${this.solarFriendlyShips.length}/3)`;
        this.dockedStatusMs = 1500;
      }
      this.menuDebounceMs = 350;
      return;
    }
    if (item === "Repair Bay") {
      this.solarPlayerHealth = this.solarPlayerMaxHealth;
      this.solarPlayerShield = this.solarPlayerMaxShield;
      this.dockedStatusMsg = "Hull repaired — shields restored.";
      this.dockedStatusMs = 1500;
    } else if (item === "Shop") {
      const session = this.solarSystem?.getSessionState();
      const dockedLocId = session?.dockedLocationId ?? null;
      if (dockedLocId) {
        const system = this.solarSystem!.getCurrentSystem();
        const loc = system.locations.find((l) => l.id === dockedLocId);
        this.shopManager.ensureShop(dockedLocId, loc?.controllingFaction ?? "terran-federation");
        this.shopMenuSelection = 0;
        this.shopStatusMsg = null;
        this.state.setScreen("solar-shop");
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
        return;
      }
      this.dockedStatusMsg = "No shop here.";
      this.dockedStatusMs = 1200;
    }
    this.menuDebounceMs = 350;
  }

  // ── NPC talk / mission screens ───────────────────────────────────────────

  /** Returns the missions offered by `npcId`, annotated with log status. */
  private getNpcMissions(npcId: string): Array<{ spec: MissionSpec; status: "available" | "active" | "completed" }> {
    const npc = NPCRegistry.getNPC(npcId);
    if (!npc) return [];
    const completed = this.missionLog.getCompletedMissionIds();
    const active = new Set(this.missionLog.getMissionLog().filter(e => e.status === "active").map(e => e.missionId));
    return npc.missionIds.flatMap((id) => {
      const spec = this.getMissionSpec(id);
      if (!spec) return [];
      let status: "available" | "active" | "completed" = "available";
      if (completed.has(id)) status = "completed";
      else if (active.has(id)) status = "active";
      return [{ spec, status }];
    });
  }

  private getMissionSpec(id: string): MissionSpec | undefined {
    return MissionRegistry.getMission(id);
  }

  /** Increment kill progress on active kill missions; complete if target reached. */
  private checkKillMissions(): void {
    for (const entry of this.missionLog.getMissionLog()) {
      if (entry.status !== "active") continue;
      const spec = this.getMissionSpec(entry.missionId);
      if (!spec || spec.type !== "kill") continue;
      const current = (entry.progressData?.killCount as number | undefined) ?? 0;
      const next = current + 1;
      entry.progressData = { ...entry.progressData, killCount: next };
      if (next >= (spec.killCount ?? 1)) {
        try {
          const rewards = this.missionLog.completeMission(entry.missionId);
          const session = this.solarSystem?.getSessionState();
          if (session) session.solarCredits += rewards.credits;
          this.dockedStatusMsg = `Kill mission complete! +${rewards.credits.toLocaleString()} credits`;
          this.dockedStatusMs = 3000;
        } catch { /* guard */ }
      }
    }
  }

  /** Auto-complete explore missions when the player docks at the destination. */
  private checkExploreMissions(locationId: string): void {
    for (const entry of this.missionLog.getMissionLog()) {
      if (entry.status !== "active") continue;
      const spec = this.getMissionSpec(entry.missionId);
      if (!spec || spec.type !== "explore") continue;
      if (spec.destinationLocationId === locationId) {
        try {
          const rewards = this.missionLog.completeMission(entry.missionId);
          const session = this.solarSystem?.getSessionState();
          if (session) session.solarCredits += rewards.credits;
          this.dockedStatusMsg = `Mission complete! +${rewards.credits.toLocaleString()} credits`;
          this.dockedStatusMs = 3000;
        } catch { /* already completed */ }
      }
    }
  }

  private updateNpcTalk(_deltaMs: number): void {
    const npc = this.activeTalkNpcId ? NPCRegistry.getNPC(this.activeTalkNpcId) : undefined;
    if (!npc) { this.state.setScreen("docked"); return; }

    const items = ["Missions", "Leave"];
    this.stepMenuSelection(items.length);

    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.activeTalkNpcId = null;
      this.state.setScreen("docked");
      this.menuSelection = 0;
      this.menuDebounceMs = 350;
      return;
    }

    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      const item = items[this.menuSelection];
      soundManager.menuConfirm();
      if (item === "Missions") {
        this.menuSelection = 0;
        this.state.setScreen("solar-missions");
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
      } else {
        this.activeTalkNpcId = null;
        this.state.setScreen("docked");
        this.menuSelection = 0;
        this.menuDebounceMs = 350;
      }
    }
  }

  private updateMissionList(_deltaMs: number): void {
    const npcId = this.activeTalkNpcId;
    if (!npcId) { this.state.setScreen("docked"); return; }

    const missions = this.getNpcMissions(npcId);
    const itemCount = missions.length + 1; // +1 for Back

    this.stepMenuSelection(itemCount);

    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.menuSelection = 0;
      this.state.setScreen("solar-npc-talk");
      this.menuDebounceMs = 350;
      return;
    }

    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      soundManager.menuConfirm();
      if (this.menuSelection === missions.length) {
        // Back
        this.menuSelection = 0;
        this.state.setScreen("solar-npc-talk");
        this.menuDebounceMs = 350;
        return;
      }
      const entry = missions[this.menuSelection];
      if (entry && entry.status === "available") {
        this.activeMissionDetailId = entry.spec.id;
        this.menuSelection = 0;
        this.state.setScreen("solar-mission-detail");
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
      }
    }
  }

  private updateMissionDetail(_deltaMs: number): void {
    const missionId = this.activeMissionDetailId;
    const npcId = this.activeTalkNpcId;
    if (!missionId || !npcId) { this.state.setScreen("solar-missions"); return; }
    const spec = this.getMissionSpec(missionId);
    if (!spec) { this.state.setScreen("solar-missions"); return; }

    const items = ["Accept Mission", "Back"];
    this.stepMenuSelection(items.length);

    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.activeMissionDetailId = null;
      this.menuSelection = 0;
      this.state.setScreen("solar-missions");
      this.menuDebounceMs = 350;
      return;
    }

    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      soundManager.menuConfirm();
      if (this.menuSelection === 0) {
        // Accept
        try {
          this.missionLog.acceptMission(spec, npcId);
          this.activeMissionDetailId = null;
          this.menuSelection = 0;
          this.state.setScreen("solar-missions");
          this.menuDebounceMs = MENU_DEBOUNCE_MS;
        } catch {
          // Already accepted or unknown — just go back
          this.activeMissionDetailId = null;
          this.menuSelection = 0;
          this.state.setScreen("solar-missions");
          this.menuDebounceMs = 350;
        }
      } else {
        this.activeMissionDetailId = null;
        this.menuSelection = 0;
        this.state.setScreen("solar-missions");
        this.menuDebounceMs = 350;
      }
    }
  }

  // ── Solar ship builder ───────────────────────────────────────────────────

  // Ship-builder right-panel geometry constants (must match GameRenderer)
  private static readonly SB_SPLIT = 800;
  private static readonly SB_TILE_H = 36;
  private static readonly SB_TILE_START_Y = 120;
  private static readonly SB_BTN_W = 38;
  private static readonly SB_BTN_H = 22;
  private static readonly SB_BTN_GAP = 3;
  // Core-sides toggle strip above the palette (matches renderer header)
  private static readonly SB_CORE_SIDES_Y = 98;
  private static readonly SB_CORE_SIDES_H = 20;

  private updateSolarShipBuilder(deltaMs: number): void {
    this.solarShipBuilderMgr.tick(deltaMs);
    const input = this.input.poll();
    if (input.pointer) {
      this.solarShipBuilderMgr.onPointerMove(input.pointer.x, input.pointer.y);
    }
    // ESC → back to docked
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.solarShipBuilderMgr.close();
      this.state.setScreen("docked");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    const click = input.pointerDownPulse ?? null;
    const session = this.solarSystem?.getSessionState();
    const locId = session?.dockedLocationId ?? null;

    // ── SAVE button (right panel header, y:4–40, right 80px) ─────────────
    if (click && click.x >= 1280 - 84 && click.x <= 1276 && click.y >= 4 && click.y <= 40) {
      const bp = this.solarShipBuilderMgr.getBlueprint();
      if (bp) this.saveSolarBlueprint(bp);
      return;
    }

    // Right-click on left panel → deselect or remove
    const rClick = input.pointerRightClickPulse ?? null;
    if (rClick && rClick.x < GameManager.SB_SPLIT) {
      const delta = this.solarShipBuilderMgr.onRightClick(rClick.x, rClick.y);
      if (delta) this.adjustModuleInventory(delta.moduleDefId, delta.delta);
    }

    if (click && this.menuDebounceMs === 0) {
      // ── Core-sides UI strip (right panel, above palette) ─────────────────
      if (
        click.x >= GameManager.SB_SPLIT &&
        click.y >= GameManager.SB_CORE_SIDES_Y &&
        click.y < GameManager.SB_CORE_SIDES_Y + GameManager.SB_CORE_SIDES_H
      ) {
        const midX = GameManager.SB_SPLIT + (1280 - GameManager.SB_SPLIT) / 2;
        const currentSides = this.solarShipBuilderMgr.getCoreSideCount();
        if (click.x < midX) {
          this.solarShipBuilderMgr.changeCoreSides(currentSides - 1);
        } else {
          this.solarShipBuilderMgr.changeCoreSides(currentSides + 1);
        }
        return;
      }

      // ── Inline palette buttons (right panel) ────────────────────────────
      if (click.x >= GameManager.SB_SPLIT) {
        const tileIdx = Math.floor(
          (click.y - GameManager.SB_TILE_START_Y) / GameManager.SB_TILE_H,
        );
        if (tileIdx >= 0) {
          const rd = this.solarShipBuilderMgr.getRenderData(
            session?.moduleInventory ?? new Map(),
            session?.solarCredits ?? 0,
          );
          const item = rd?.palette[tileIdx];
          if (item) {
            // Button layout (right-aligned): [TRASH] [SELL] [BUY]
            const tileRight = 1280 - 4;
            const btnAreaRight = tileRight;
            const trashX = btnAreaRight - GameManager.SB_BTN_W;
            const sellX = trashX - GameManager.SB_BTN_GAP - GameManager.SB_BTN_W;
            const buyX = sellX - GameManager.SB_BTN_GAP - GameManager.SB_BTN_W;
            const btnTop = GameManager.SB_TILE_START_Y + tileIdx * GameManager.SB_TILE_H + (GameManager.SB_TILE_H - GameManager.SB_BTN_H) / 2;
            const inBtn = (bx: number) =>
              click.x >= bx && click.x < bx + GameManager.SB_BTN_W &&
              click.y >= btnTop && click.y < btnTop + GameManager.SB_BTN_H;

            if (inBtn(trashX) && item.quantity > 0) {
              this.adjustModuleInventory(item.defId, -1);
              return;
            }
            if (inBtn(sellX) && item.quantity > 0 && locId && session) {
              const sellResult = this.shopManager.sellModule(locId, item.defId, session.solarCredits);
              if (sellResult.ok) {
                session.solarCredits = sellResult.newCredits;
                this.adjustModuleInventory(item.defId, -1);
              }
              return;
            }
            if (inBtn(buyX) && item.shopStock > 0 && locId && session) {
              const buyResult = this.shopManager.buyModule(locId, item.defId, session.solarCredits);
              if (buyResult.ok) {
                session.solarCredits = buyResult.newCredits;
                this.adjustModuleInventory(item.defId, +1);
              }
              return;
            }
          }
        }
        // Fallthrough: normal palette click (select item)
        const inv = session?.moduleInventory ?? new Map<string, number>();
        this.solarShipBuilderMgr.onPointerDown(click.x, click.y, inv);
        return;
      }

      // ── Left panel: place selected module at snap ──────────────────────
      const inv = session?.moduleInventory ?? new Map<string, number>();
      const delta = this.solarShipBuilderMgr.onPointerDown(click.x, click.y, inv);
      if (delta) this.adjustModuleInventory(delta.moduleDefId, delta.delta);
    }
  }

  // ── Solar ship blueprints ─────────────────────────────────────────────────

  private computeBlueprintModules(bp: SolarShipBlueprint): {
    modules: Array<{ vertices: Array<{ x: number; y: number }>; moduleType: string }>;
    coreRadius: number;
  } {
    const defs = SolarModuleRegistry.getModuleMap();
    const geometries = GeometryEngine.deriveAllGeometries(bp.modules, defs, bp.coreSideCount);
    const coreDef = defs.get(bp.modules[0]?.moduleDefId ?? "");
    const coreRadius = coreDef
      ? GeometryEngine.circumradius(bp.coreSideCount, coreDef.shape.sideLengthPx)
      : 20;
    const modules = bp.modules.flatMap((m) => {
      const geom = geometries.get(m.placedId);
      const def = defs.get(m.moduleDefId);
      if (!geom || !def) return [];
      return [{ vertices: geom.vertices.map(v => ({ x: v.x, y: v.y })), moduleType: def.type as string }];
    });
    return { modules, coreRadius };
  }

  private getPirateBlueprintModules(sizeClass: number) {
    if (!this.pirateBlueprintModulesCache.has(sizeClass)) {
      const bp = getPirateBlueprint(sizeClass);
      if (bp) this.pirateBlueprintModulesCache.set(sizeClass, this.computeBlueprintModules(bp));
    }
    return this.pirateBlueprintModulesCache.get(sizeClass);
  }

  private saveSolarBlueprint(bp: SolarShipBlueprint): void {
    const id = bp.id || `ship-${++this.solarBlueprintCounter}`;
    const saved: SolarShipBlueprint = { ...bp, id };
    this.solarSavedBlueprints.set(id, saved);
    if (!this.solarActiveBlueprintId) this.solarActiveBlueprintId = id;
    // Invalidate player blueprint cache so updated geometry is picked up next frame.
    this.solarPlayerBlueprintCache = null;
    this.solarShipBuilderMgr.setStatus(`SAVED: ${bp.name.toUpperCase()}`);
  }

  private setActiveSolarBlueprint(id: string): void {
    if (this.solarSavedBlueprints.has(id)) this.solarActiveBlueprintId = id;
  }

  private applyActiveSolarBlueprint(): void {
    if (!this.solarActiveBlueprintId) return;
    const bp = this.solarSavedBlueprints.get(this.solarActiveBlueprintId);
    if (!bp) return;
    // Apply stats from the core module
    const core = bp.modules[0];
    if (!core) return;
    const coreDef = SolarModuleRegistry.getModule(core.moduleDefId);
    if (!coreDef || coreDef.type !== "core") return;
    const hp = coreDef.stats.hp ?? 100;
    const shield = coreDef.stats.shieldCapacity ?? 50;
    this.solarPlayerMaxHealth = hp;
    this.solarPlayerHealth = Math.min(this.solarPlayerHealth, hp);
    this.solarPlayerMaxShield = shield;
    this.solarPlayerShield = Math.min(this.solarPlayerShield, shield);
  }

  private getSavedBlueprintSummaries(): SavedBlueprintSummary[] {
    return Array.from(this.solarSavedBlueprints.values()).map((bp) => ({
      id: bp.id,
      name: bp.name,
      sizeClass: bp.sizeClass,
      coreSideCount: bp.coreSideCount,
      partCount: bp.modules.length,
      isActive: bp.id === this.solarActiveBlueprintId,
    }));
  }

  // ── My Ships screen ───────────────────────────────────────────────────────

  private myShipsSelection = 0;

  private updateSolarMyShips(): void {
    const ships = this.getSavedBlueprintSummaries();
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.state.setScreen("docked");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    const input = this.input.poll();
    const upEdge = (input as any).moveUp && !this.prevUpPressed;
    const downEdge = (input as any).moveDown && !this.prevDownPressed;
    if (upEdge && this.menuDebounceMs === 0) {
      this.myShipsSelection = (this.myShipsSelection - 1 + Math.max(1, ships.length)) % Math.max(1, ships.length);
      this.menuDebounceMs = 150;
    }
    if (downEdge && this.menuDebounceMs === 0) {
      this.myShipsSelection = (this.myShipsSelection + 1) % Math.max(1, ships.length);
      this.menuDebounceMs = 150;
    }
    this.myShipsSelection = Math.min(this.myShipsSelection, Math.max(0, ships.length - 1));

    // Click detection: 3 buttons per row — SET ACTIVE / LOAD TO BUILDER / DELETE
    const click = input.pointerDownPulse ?? null;
    if (click && this.menuDebounceMs === 0) {
      const ROW_H = 52;
      const LIST_Y = 80;
      const rowIdx = Math.floor((click.y - LIST_Y) / ROW_H);
      const ship = ships[rowIdx];
      if (ship) {
        this.myShipsSelection = rowIdx;
        const BTN_W = 110;
        const BTN_GAP = 8;
        const rightEdge = 1280 - 16;
        const deleteX = rightEdge - BTN_W;
        const loadX = deleteX - BTN_GAP - BTN_W;
        const activeX = loadX - BTN_GAP - BTN_W;
        const btnY = LIST_Y + rowIdx * ROW_H + (ROW_H - 26) / 2;
        if (click.x >= deleteX && click.y >= btnY && click.y <= btnY + 26) {
          this.solarSavedBlueprints.delete(ship.id);
          if (this.solarActiveBlueprintId === ship.id) {
            this.solarActiveBlueprintId = this.solarSavedBlueprints.keys().next().value ?? null;
          }
          this.menuDebounceMs = 200;
        } else if (click.x >= loadX && click.x < deleteX - BTN_GAP && click.y >= btnY && click.y <= btnY + 26) {
          const bp = this.solarSavedBlueprints.get(ship.id);
          if (bp) {
            this.solarShipBuilderMgr.open(bp.modules[0]!.moduleDefId, bp.coreSideCount, bp);
            this.state.setScreen("solar-shipyard");
          }
          this.menuDebounceMs = MENU_DEBOUNCE_MS;
        } else if (click.x >= activeX && click.x < loadX - BTN_GAP && click.y >= btnY && click.y <= btnY + 26) {
          this.setActiveSolarBlueprint(ship.id);
          this.menuDebounceMs = 200;
        }
      }
    }
  }

  // ── Solar shop ───────────────────────────────────────────────────────────

  private updateSolarShop(deltaMs: number): void {
    if (this.shopStatusMs > 0) {
      this.shopStatusMs = Math.max(0, this.shopStatusMs - deltaMs);
      if (this.shopStatusMs === 0) this.shopStatusMsg = null;
    }
    const input = this.input.poll();
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.state.setScreen("docked");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    const session = this.solarSystem?.getSessionState();
    const locId = session?.dockedLocationId ?? null;
    if (!locId) { this.state.setScreen("docked"); return; }
    const shop = this.shopManager.getShop(locId);
    if (!shop) return;
    const entries = shop.entries;
    if (entries.length === 0) return;

    // Navigation
    const upEdge = input.moveUp && !this.prevUpPressed;
    const downEdge = input.moveDown && !this.prevDownPressed;
    if (upEdge && this.menuDebounceMs === 0) {
      this.shopMenuSelection = (this.shopMenuSelection - 1 + entries.length) % entries.length;
      this.menuDebounceMs = 150;
    }
    if (downEdge && this.menuDebounceMs === 0) {
      this.shopMenuSelection = (this.shopMenuSelection + 1) % entries.length;
      this.menuDebounceMs = 150;
    }

    // Left-click: select row by pointer y
    const click = input.pointerDownPulse ?? null;
    if (click && this.menuDebounceMs === 0) {
      const SHOP_ROW_H = 52;
      const SHOP_ROWS_START_Y = 108; // matches renderer: COL_H_Y(80) + 28
      const idx = Math.floor((click.y - SHOP_ROWS_START_Y) / SHOP_ROW_H);
      if (idx >= 0 && idx < entries.length) {
        this.shopMenuSelection = idx;
        this.menuDebounceMs = 100;
      }
    }

    // Buy (Enter key)
    const confirm = this.wasMenuConfirmPressed() && this.menuDebounceMs === 0;
    if (confirm) {
      const entry = entries[this.shopMenuSelection];
      if (entry && session) {
        const result = this.shopManager.buyModule(locId, entry.moduleDefId, session.solarCredits);
        if (result.ok) {
          session.solarCredits = result.newCredits;
          this.adjustModuleInventory(entry.moduleDefId, +1);
          this.shopStatusMsg = `BOUGHT — ${result.price}¢`;
          this.shopStatusMs = 1200;
          soundManager.menuConfirm();
        } else {
          this.shopStatusMsg = result.reason.toUpperCase().replace(/-/g, " ");
          this.shopStatusMs = 1200;
        }
        this.menuDebounceMs = 200;
      }
    }

    // Sell: right-click or S key — sells the currently selected item
    const rClick = input.pointerRightClickPulse ?? null;
    if ((rClick) && this.menuDebounceMs === 0 && session) {
      const entry = entries[this.shopMenuSelection];
      if (entry) {
        const owned = session.moduleInventory.get(entry.moduleDefId) ?? 0;
        if (owned > 0) {
          const result = this.shopManager.sellModule(locId, entry.moduleDefId, session.solarCredits);
          if (result.ok) {
            session.solarCredits = result.newCredits;
            this.adjustModuleInventory(entry.moduleDefId, -1);
            this.shopStatusMsg = `SOLD — +${result.sellPrice}¢`;
            this.shopStatusMs = 1200;
          }
        } else {
          this.shopStatusMsg = "NOTHING TO SELL";
          this.shopStatusMs = 1000;
        }
        this.menuDebounceMs = 200;
      }
    }
  }

  private buildShopRenderData(): ShopRenderData | null {
    const session = this.solarSystem?.getSessionState();
    const locId = session?.dockedLocationId ?? null;
    if (!locId || !session) return null;
    const shop = this.shopManager.getShop(locId);
    if (!shop) return null;
    const system = this.solarSystem!.getCurrentSystem();
    const loc = system.locations.find((l) => l.id === locId);
    const defs = SolarModuleRegistry.getModuleMap();
    return {
      locationName: loc?.name ?? locId,
      economyType: shop.economyType,
      entries: shop.entries.map((e, i) => ({
        moduleDefId: e.moduleDefId,
        name: defs.get(e.moduleDefId)?.name ?? e.moduleDefId,
        moduleType: defs.get(e.moduleDefId)?.type ?? "structure",
        demand: e.demand,
        price: e.price,
        stock: e.stock,
        owned: session.moduleInventory.get(e.moduleDefId) ?? 0,
        isSelected: i === this.shopMenuSelection,
      })),
      selectedIndex: this.shopMenuSelection,
      playerCredits: session.solarCredits,
      statusMsg: this.shopStatusMsg,
    };
  }

  private adjustModuleInventory(moduleDefId: string, delta: number): void {
    const session = this.solarSystem?.getSessionState();
    if (!session) return;
    const current = session.moduleInventory.get(moduleDefId) ?? 0;
    const next = current + delta;
    if (next <= 0) {
      session.moduleInventory.delete(moduleDefId);
    } else {
      session.moduleInventory.set(moduleDefId, next);
    }
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
    const prevProjCount = this.player.getProjectiles().filter(p => p.isAlive).length;
    this.player.update(deltaMs, input);
    const newProjCount = this.player.getProjectiles().filter(p => p.isAlive).length;
    if (newProjCount > prevProjCount) soundManager.arcadeShoot();
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
            soundManager.enemyDefeatedSmall();
            this.powerUps.onEnemyDefeated(result.position.x, result.position.y);
          } else {
            soundManager.enemyDefeatedBoss();
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
          soundManager.playerHit();
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
      soundManager.playerHit();
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
      soundManager.powerUp();
      this.renderer.showPowerUpCollected(c.feedback.x, c.feedback.y, c.type);
    }

    // Touch-collect: any power-up overlapping the player
    const touchCollections = this.powerUps.checkAndApply(
      playerState,
      this.player,
      runStatsMutable,
    );
    for (const c of touchCollections) {
      soundManager.powerUp();
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
      soundManager.levelClear();
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
      soundManager.playerDeath();
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
    soundManager.panicBomb();
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
      solarSystem:
        (state.screen === "solar-system" || state.screen === "solar-system-paused" ||
         state.screen === "docked" || state.screen === "solar-npc-talk" ||
         state.screen === "solar-missions" || state.screen === "solar-mission-detail")
          ? this.buildSolarSystemExtras()
          : null,
      solarShipBuilder: state.screen === "solar-shipyard"
        ? this.solarShipBuilderMgr.getRenderData(
            this.solarSystem?.getSessionState().moduleInventory ?? new Map(),
            this.solarSystem?.getSessionState().solarCredits ?? 0,
            this.getShipyardShopEntries(),
            this.getSavedBlueprintSummaries(),
          )
        : null,
      solarShop: state.screen === "solar-shop" ? this.buildShopRenderData() : null,
      solarMyShips: state.screen === "solar-my-ships" ? this.getSavedBlueprintSummaries() : null,
      playerBlueprint: this.buildPlayerBlueprintVisual(),
    });
  }

  private getShipyardShopEntries(): Array<{ moduleDefId: string; stock: number; price: number }> {
    const locId = this.solarSystem?.getSessionState().dockedLocationId ?? null;
    if (!locId) return [];
    const shop = this.shopManager.getShop(locId);
    if (!shop) return [];
    return shop.entries.map((e) => ({ moduleDefId: e.moduleDefId, stock: e.stock, price: e.price }));
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

  /** Collects the data the renderer needs for the solar system view. */
  private buildSolarSystemExtras(): SolarSystemRenderData | null {
    if (!this.solarSystem) return null;

    const sessionState = this.solarSystem.getSessionState();
    const system = this.solarSystem.getCurrentSystem();

    // Resolve absolute world positions for stations (Location.position is an
    // offset from the parent body — the renderer needs the absolute coords).
    const bodiesById = new Map(system.celestialBodies.map((b) => [b.id, b]));
    const locations = system.locations.map((loc) => {
      const parent = bodiesById.get(loc.bodyId);
      return {
        id: loc.id,
        name: loc.name,
        worldPosition: {
          x: (parent?.position.x ?? 0) + loc.position.x,
          y: (parent?.position.y ?? 0) + loc.position.y,
        },
        dockingRadius: loc.dockingRadius,
      };
    });

    // Gates currently in this system.
    const gateDefs = SystemGateRegistry.getGatesBySystem(this.currentSystemId);
    const gates = gateDefs.map((g) => ({
      id: g.id,
      name: g.name,
      position: g.position,
      triggerRadius: g.triggerRadius,
      destinationSystemName: this.systemDisplayName(g.destinationSystemId),
    }));

    // Find which gate (if any) the player is approaching this frame.
    let nearbyGateId: string | null = null;
    if (this.gateCooldownMs <= 0) {
      const inRange = GateTeleportSystem.checkGateProximity(
        sessionState.playerPosition,
        gateDefs as SystemGate[],
      );
      nearbyGateId = inRange?.id ?? null;
    }

    // Galaxy map (reuses gate registry to derive nodes + edges).
    const galaxyMap: GalaxyMapData = this.buildGalaxyMapData();

    // Docked context (only meaningful when screen === "docked").
    const dockedLocId = sessionState.dockedLocationId;
    const dockedLoc = dockedLocId
      ? system.locations.find((l) => l.id === dockedLocId)
      : null;
    const menuItems = this.getDockedMenuItems();
    // Get the first NPC at this location using the location's own npcs array.
    // Avoids a LocationRegistry lookup since game locations use different IDs.
    const firstNpcId = dockedLoc?.npcs[0];
    const activeNpc = firstNpcId ? NPCRegistry.getNPC(firstNpcId) : undefined;
    const dockedSection = dockedLoc
      ? {
          locationName: this.dockedStatusMsg ?? dockedLoc.name,
          menuItems,
          menuSelection: this.dockedMenuSelection,
          activeNpc,
        }
      : undefined;

    // Laser flash FX — include weapon-tip screen offset for the origin
    let laserOriginDx = 0;
    let laserOriginDy = 0;
    if (this.solarPlayerBlueprintCache && this.laserFlashMs > 0) {
      const { modules, coreRadius } = this.solarPlayerBlueprintCache;
      const bpScale = 16 / coreRadius;
      const heading = sessionState.playerHeading;
      const h = (heading * Math.PI) / 180;
      const cosH = Math.cos(h);
      const sinH = Math.sin(h);
      for (const mod of modules) {
        if (mod.moduleType !== "weapon") continue;
        const vcx = mod.vertices.reduce((s, v) => s + v.x, 0) / (mod.vertices.length || 1);
        const vcy = mod.vertices.reduce((s, v) => s + v.y, 0) / (mod.vertices.length || 1);
        let tipX = vcx, tipY = vcy, maxD2 = 0;
        for (const v of mod.vertices) {
          const d2 = Math.hypot(v.x - vcx, v.y - vcy);
          if (d2 > maxD2) { maxD2 = d2; tipX = v.x; tipY = v.y; }
        }
        laserOriginDx = (tipX * cosH - tipY * sinH) * bpScale;
        laserOriginDy = (tipX * sinH + tipY * cosH) * bpScale;
        break;
      }
    }
    const laserFlash = this.laserFlashMs > 0 && this.laserFlashTarget
      ? {
          targetX: this.laserFlashTarget.x,
          targetY: this.laserFlashTarget.y,
          alpha: this.laserFlashMs / 200,
          originDx: laserOriginDx,
          originDy: laserOriginDy,
        }
      : undefined;

    // Player blueprint visual (cached by blueprintId)
    let playerBlueprintModules: Array<{ vertices: Array<{ x: number; y: number }>; moduleType: string }> | undefined;
    let playerBlueprintCoreRadius: number | undefined;
    if (this.solarActiveBlueprintId) {
      const activeBp = this.solarSavedBlueprints.get(this.solarActiveBlueprintId);
      if (activeBp) {
        if (this.solarPlayerBlueprintCache?.blueprintId !== this.solarActiveBlueprintId) {
          this.solarPlayerBlueprintCache = {
            blueprintId: this.solarActiveBlueprintId,
            ...this.computeBlueprintModules(activeBp),
          };
        }
        playerBlueprintModules = this.solarPlayerBlueprintCache.modules;
        playerBlueprintCoreRadius = this.solarPlayerBlueprintCache.coreRadius;
      }
    }

    // Enemy ships and stations for this system
    const enemyShips = this.currentSystemId === "sol"
      ? this.solarEnemyShips.map((s) => {
          const pirate = this.getPirateBlueprintModules(s.sizeClass);
          return {
            id: s.id,
            typeIdx: s.typeIdx,
            color: SOLAR_ENEMY_TYPES[s.typeIdx]?.color ?? 0xff3333,
            position: s.position,
            heading: s.heading,
            health: s.health,
            maxHealth: s.maxHealth,
            sizeClass: s.sizeClass,
            ...(pirate ? { blueprintModules: pirate.modules, blueprintCoreRadius: pirate.coreRadius } : {}),
          };
        })
      : [];
    const enemyProjectiles = this.currentSystemId === "sol"
      ? this.solarEnemyProjectiles.map((p) => ({
          id: p.id,
          position: p.position,
          color: SOLAR_WEAPONS[p.weaponIdx]?.color ?? 0xff4444,
        }))
      : [];
    const enemyStations = this.currentSystemId === "sol"
      ? this.solarEnemyBases.map((b) => ({
          id: b.id,
          name: b.name,
          position: b.position,
          health: b.health,
          maxHealth: b.maxHealth,
          alertLevel: b.alertLevel,
        }))
      : [];

    return {
      playerPosition: sessionState.playerPosition,
      playerVelocity: sessionState.playerVelocity,
      playerHeading: sessionState.playerHeading,
      thrustActive: this.solarSystem.getLastThrustActive(),
      currentSystemName: system.seed.name,
      celestialBodies: system.celestialBodies.map((body) => ({
        id: body.id,
        name: body.name,
        type: body.type,
        position: body.position,
        radius: body.radius,
        color: body.color,
      })),
      locations,
      gates,
      nearbyLocations: sessionState.nearbyLocations,
      nearbyGateId,
      zoomLevel: sessionState.zoomLevel,
      mapOpen: this.mapOpen,
      galaxyMap,
      enemyShips,
      enemyProjectiles,
      enemyStations,
      playerHealth: this.solarPlayerHealth,
      playerMaxHealth: this.solarPlayerMaxHealth,
      playerShield: this.solarPlayerShield,
      playerMaxShield: this.solarPlayerMaxShield,
      damageFlash: this.solarDamageFlashMs > 0 ? this.solarDamageFlashMs / 300 : 0,
      warpIntensity: this.antiGravActive ? 1 : this.warpDecayMs / GameManager.WARP_DECAY_DURATION_MS,
      pauseMenuSelection: this.solarPauseSelection,
      ...(playerBlueprintModules && playerBlueprintCoreRadius !== undefined
        ? {
            playerBlueprintModules,
            playerBlueprintCoreRadius,
            playerSizeClass: this.solarActiveBlueprintId
              ? (this.solarSavedBlueprints.get(this.solarActiveBlueprintId)?.sizeClass ?? 1)
              : 1,
          }
        : {}),
      ...(laserFlash ? { laserFlash } : {}),
      ...(dockedSection ? { docked: dockedSection } : {}),
      ...(this.buildNpcTalkSection()),
      ...(this.buildMissionListSection()),
      ...(this.buildMissionDetailSection()),
      virtualControls: this.buildVirtualControlsState(),
      lockedTargets: Array.from(this.solarLockedIds)
        .map(id => this.solarEnemyShips.find(s => s.id === id))
        .filter((s): s is SolarEnemyShip => !!s)
        .map(s => ({ id: s.id, position: s.position })),
      ...(this.solarFocusedId ? { focusedTargetId: this.solarFocusedId } : {}),
      friendlyShips: this.solarFriendlyShips.map(s => ({
        id: s.id,
        position: s.position,
        heading: s.heading,
        health: s.health,
        maxHealth: s.maxHealth,
      })),
      playerProjectiles: this.solarPlayerProjectiles.map(p => {
        const spd = Math.hypot(p.velocity.x, p.velocity.y) || 1;
        return {
          id: p.id,
          position: p.position,
          weaponKind: p.weaponKind,
          lifetimeFrac: p.lifetimeMs / p.maxLifetimeMs,
          dirX: p.velocity.x / spd,
          dirY: p.velocity.y / spd,
        };
      }),
      solarExplosions: this.solarExplosions.map(e => ({
        x: e.x,
        y: e.y,
        ageFrac: e.ageMs / e.maxAgeMs,
        scale: e.scale,
      })),
      deathFade: this.solarDeathTimerMs > 0 && this.solarDeathTimerMs < 1000
        ? 1 - this.solarDeathTimerMs / 1000
        : 0,
      solarPlayerDead: this.solarPlayerDead,
    };
  }

  private buildNpcTalkSection(): { npcTalk?: { npc: import("./data/NPCRegistry").NPCDefinition; menuItems: readonly string[]; menuSelection: number } } {
    const npcId = this.activeTalkNpcId;
    if (!npcId) return {};
    const npc = NPCRegistry.getNPC(npcId);
    if (!npc) return {};
    return { npcTalk: { npc, menuItems: ["Missions", "Leave"], menuSelection: this.menuSelection } };
  }

  private buildMissionListSection(): { missionList?: { npc: import("./data/NPCRegistry").NPCDefinition; missions: Array<{ spec: import("../types/missions").MissionSpec; status: "available" | "active" | "completed" }>; menuSelection: number } } {
    const npcId = this.activeTalkNpcId;
    if (!npcId) return {};
    const npc = NPCRegistry.getNPC(npcId);
    if (!npc) return {};
    const missions = this.getNpcMissions(npcId);
    return { missionList: { npc, missions, menuSelection: this.menuSelection } };
  }

  private buildMissionDetailSection(): { missionDetail?: { spec: import("../types/missions").MissionSpec; menuSelection: number } } {
    const missionId = this.activeMissionDetailId;
    if (!missionId) return {};
    const spec = this.getMissionSpec(missionId);
    if (!spec) return {};
    return { missionDetail: { spec, menuSelection: this.menuSelection } };
  }

  private buildVirtualControlsState(): { thrustActive: boolean; leftActive: boolean; rightActive: boolean; fireActive: boolean } {
    const raw = this.input.poll();
    const pointer = raw.pointer;
    const held = raw.pointerHeld;
    if (!pointer || !held) {
      return { thrustActive: false, leftActive: false, rightActive: false, fireActive: false };
    }
    const { x: px, y: py } = pointer;
    return {
      thrustActive: this.inRect(px, py, 120, 530, 100, 100),
      leftActive:   this.inRect(px, py,  10, 590, 100, 100),
      rightActive:  this.inRect(px, py, 230, 590, 100, 100),
      fireActive:   this.inRect(px, py, 1150, 555, 120, 150),
    };
  }

  private systemDisplayName(systemId: string): string {
    if (systemId === "sol") return "Sol";
    if (systemId === "kepler-442") return "Kepler-442";
    if (systemId === "proxima-centauri") return "Proxima Centauri";
    return systemId;
  }

  private buildGalaxyMapData(): GalaxyMapData {
    // Layout: place each known system at a fixed position so the map is stable.
    const positions: Record<string, { x: number; y: number }> = {
      "sol": { x: 0, y: 0 },
      "kepler-442": { x: 1200, y: -300 },
      "proxima-centauri": { x: -400, y: 900 },
    };
    const knownIds = ["sol", "kepler-442", "proxima-centauri"];
    const systems = knownIds.map((id) => ({
      id,
      name: this.systemDisplayName(id),
      x: positions[id]?.x ?? 0,
      y: positions[id]?.y ?? 0,
      visited: this.visitedSystems.has(id),
    }));

    // De-duplicate gate edges (each pair has two SystemGate entries).
    const seenEdges = new Set<string>();
    const edges: Array<{ fromSystemId: string; toSystemId: string }> = [];
    for (const g of SystemGateRegistry.getAllGates()) {
      const a = g.systemId;
      const b = g.destinationSystemId;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({ fromSystemId: a, toSystemId: b });
    }

    return {
      currentSystemId: this.currentSystemId,
      systems,
      edges,
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

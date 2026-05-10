/**
 * GameRenderer – Pixi.js rendering for all game screens.
 *
 * Redraws the Graphics objects each frame from the current game state. For the
 * sprite counts in this game (tens of entities), that's well within budget and
 * avoids managing a sprite pool on top of the existing object pools.
 */

import { Application, Container, Filter, Graphics, Rectangle, Text, TextStyle, defaultFilterVert } from "pixi.js";
import type {
  BossState,
  Enemy,
  GameState,
  PlayerState,
  PowerUp,
  PowerUpType,
  Projectile,
  RunStats,
  SolarShipBuilderRenderData,
  ShopRenderData,
} from "../types/index";
import type { SavedBlueprintSummary } from "../types/solarShipBuilder";
import { DEMAND_LABEL } from "../types/economy";
import type { NPCDefinition } from "../managers/LocationManager";
import type { MissionSpec } from "../types/missions";
import {
  drawCircle,
  drawHexagon,
  drawOctagon,
  drawPentagon,
  drawRect,
  drawRotatedRect,
  drawTriangle,
} from "./ShapePrimitives";
import { drawBossBody } from "./BossArt";
import { createNPCRobot } from "./NPCRobotRenderer";
import { soundManager } from "../audio/SoundManager";
import { NPCRobotAnimator } from "./NPCRobotAnimator";
import { getFactionColors, type FactionColors } from "../game/data/FactionColors";
import { getGradeColors } from "../game/data/GradeColors";

interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
}

interface Explosion {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  color: number;
  radius: number;
}

interface RingPulse {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  color: number;
  maxRadius: number;
}

interface Spark {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  color: number;
  size: number;
  rot: number;
}

interface FloatingText {
  text: Text;
  age: number;
  maxAge: number;
  vy: number;
}

interface ShipyardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShipyardPaletteTile {
  readonly partId: string;
  readonly rect: ShipyardRect;
  readonly name: string;
  readonly powerCost: number;
  readonly powerCapacity: number;
  readonly visualKind: string;
  readonly colour: number;
  readonly shape: { readonly width: number; readonly height: number };
  readonly category: string;
  readonly disabled: boolean;
  readonly isHeld: boolean;
}

export interface ShipyardSavedSlot {
  readonly rect: ShipyardRect;
  readonly index: number;
  readonly name: string;
  readonly empty: boolean;
  readonly equipped: boolean;
  readonly current: boolean;
}

export interface ShipyardRenderData {
  readonly layout: {
    readonly canvasRect: ShipyardRect;
    readonly paletteRect: ShipyardRect;
    readonly statsRect: ShipyardRect;
    readonly savedPanelRect: ShipyardRect;
    readonly newBtn: ShipyardRect;
    readonly saveBtn: ShipyardRect;
    readonly backBtn: ShipyardRect;
    readonly trashBtn: ShipyardRect;
  };
  readonly savedSlots: ReadonlyArray<ShipyardSavedSlot>;
  readonly statusMsg: string | null;
  readonly trashAction: "none" | "part" | "blueprint";
  readonly palette: ReadonlyArray<ShipyardPaletteTile>;
  readonly ship: {
    readonly originX: number;
    readonly originY: number;
    readonly scale: number;
    readonly placements: ReadonlyArray<{
      readonly placedId: string;
      readonly partId: string;
      readonly worldX: number;
      readonly worldY: number;
      readonly visualKind: string;
      readonly colour: number;
      readonly shape: { readonly width: number; readonly height: number };
      readonly selected: boolean;
      readonly category: string;
    }>;
    readonly sockets: ReadonlyArray<{
      readonly parentPlacedId: string;
      readonly socketId: string;
      readonly screenX: number;
      readonly screenY: number;
      readonly highlighted: boolean;
    }>;
  };
  readonly ghost: null | {
    readonly screenX: number;
    readonly screenY: number;
    readonly visualKind: string;
    readonly colour: number;
    readonly shape: { readonly width: number; readonly height: number };
    readonly valid: boolean;
  };
  readonly stats: {
    readonly hp: number;
    readonly speed: number;
    readonly damage: number;
    readonly fireRate: number;
    readonly hitboxW: number;
    readonly hitboxH: number;
    readonly powerUsed: number;
    readonly powerCapacity: number;
    readonly cost: number;
  };
  readonly blueprintName: string;
  readonly credits: number;
  readonly hasSelection: boolean;
  readonly heldPartName: string | null;
}

export interface PlayerBlueprintVisual {
  readonly placements: ReadonlyArray<{
    readonly worldX: number;
    readonly worldY: number;
    readonly visualKind: string;
    readonly colour: number;
    readonly shape: { readonly width: number; readonly height: number };
  }>;
}

export interface StarmapRenderData {
  readonly sectorName: string;
  readonly nodes: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly x: number;
    readonly y: number;
    readonly unlocked: boolean;
    readonly completed: boolean;
    readonly current: boolean;
    readonly selected: boolean;
  }>;
  readonly edges: ReadonlyArray<{
    readonly fromX: number;
    readonly fromY: number;
    readonly toX: number;
    readonly toY: number;
    readonly unlocked: boolean;
  }>;
  readonly credits: number;
  readonly selectedMissionLabel: string | null;
}

interface InventoryDisplayItem {
  readonly defId: string;
  readonly name: string;
  readonly type: string;
  readonly quantity: number;
  readonly shopCost: number;
  /** True for section-divider rows (not selectable). */
  readonly isHeader?: boolean;
}

export interface SolarSystemRenderData {
  readonly playerPosition: { x: number; y: number };
  readonly playerVelocity: { x: number; y: number };
  readonly playerHeading: number;
  readonly thrustActive: boolean;
  /** Per-axis thrust flags for directional engine exhaust visuals. */
  readonly thrustForward?: boolean;
  readonly thrustReverse?: boolean;
  readonly thrustStrafeLeft?: boolean;
  readonly thrustStrafeRight?: boolean;
  readonly thrustTurnLeft?: boolean;
  readonly thrustTurnRight?: boolean;
  readonly currentSystemName: string;
  readonly celestialBodies: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly type?: "star" | "planet" | "moon" | "asteroid" | "station";
    readonly position: { x: number; y: number };
    readonly radius: number;
    readonly color: { r: number; g: number; b: number };
  }>;
  readonly locations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    /**
     * Absolute world position (km). Callers must add the parent body offset
     * before passing in — `Location.position` alone is the local offset.
     */
    readonly worldPosition: { x: number; y: number };
    readonly dockingRadius: number;
  }>;
  readonly gates: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly position: { x: number; y: number };
    readonly triggerRadius: number;
    readonly destinationSystemName: string;
  }>;
  readonly nearbyLocations: string[];
  readonly nearbyGateId: string | null;
  readonly zoomLevel: number;
  readonly mapOpen?: boolean;
  readonly galaxyMap?: GalaxyMapData;
  readonly enemyShips: ReadonlyArray<{
    readonly id: string;
    readonly typeIdx: number;
    readonly typeName: string;
    readonly sizeClass: number;
    readonly color: number;
    readonly position: { x: number; y: number };
    readonly heading: number;
    readonly health: number;
    readonly maxHealth: number;
    readonly faction?: string;
    readonly blueprintModules?: ReadonlyArray<{
      readonly vertices: ReadonlyArray<{ readonly x: number; readonly y: number }>;
      readonly worldX: number;
      readonly worldY: number;
      readonly moduleType: string;
      readonly partKind: string;
      readonly grade: number;
      readonly placedId?: string;
    }>;
    readonly blueprintCoreRadius?: number;
    /** placedId → hp/maxHp fraction (0–1). Absent = full HP. */
    readonly moduleHpFractions?: ReadonlyMap<string, number>;
    /** Set of destroyed module placedIds to skip during rendering. */
    readonly destroyedModuleIds?: ReadonlySet<string>;
  }>;
  readonly playerBlueprintModules?: ReadonlyArray<{
    readonly vertices: ReadonlyArray<{ readonly x: number; readonly y: number }>;
    readonly worldX: number;
    readonly worldY: number;
    readonly moduleType: string;
    readonly partKind: string;
    readonly grade: number;
    readonly placedId?: string;
  }>;
  readonly playerModuleHpFractions?: ReadonlyMap<string, number>;
  readonly playerDestroyedModuleIds?: ReadonlySet<string>;
  readonly playerBlueprintCoreRadius?: number;
  readonly playerSizeClass?: number;
  readonly enemyProjectiles: ReadonlyArray<{
    readonly id: string;
    readonly position: { x: number; y: number };
    readonly color: number;
    readonly dirX?: number;
    readonly dirY?: number;
    readonly isHoming?: boolean;
    readonly trailPoints?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
    readonly trailColor?: number;
  }>;
  readonly playerHealth: number;
  readonly playerMaxHealth: number;
  readonly playerShield: number;
  readonly playerMaxShield: number;
  readonly projectedShield: { readonly radiusKm: number; readonly hp: number; readonly maxHp: number } | null;
  /** Friendly station projected shields to render as large bubbles at their world positions. */
  readonly stationShields?: ReadonlyArray<{
    readonly worldX: number;
    readonly worldY: number;
    readonly radiusKm: number;
    readonly hp: number;
    readonly maxHp: number;
  }>;
  readonly damageFlash: number;
  readonly enemyStations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly position: { x: number; y: number };
    readonly health: number;
    readonly maxHealth: number;
    readonly alertLevel: "dormant" | "alerted" | "combat";
    readonly faction?: string;
    readonly sizeClass?: number;
    readonly heading?: number;
    readonly blueprintModules?: ReadonlyArray<{
      readonly vertices: ReadonlyArray<{ readonly x: number; readonly y: number }>;
      readonly worldX: number;
      readonly worldY: number;
      readonly moduleType: string;
      readonly partKind: string;
      readonly grade: number;
      readonly placedId?: string;
    }>;
    readonly blueprintCoreRadius?: number;
  }>;
  /** Id of the currently click-selected enemy ship (thin white ring). */
  readonly selectedShipId?: string;
  /**
   * Ghost markers for enemy ships that were previously scanned but are now
   * outside scanner range.  Position is stale (the ship has moved since last
   * contact).  Rendered as hollow diamond icons.
   */
  readonly lastKnownEnemyPositions?: ReadonlyArray<{
    readonly id: string;
    readonly position: { x: number; y: number };
    readonly color: number;
  }>;
  readonly laserFlash?: {
    readonly targetX: number;
    readonly targetY: number;
    readonly alpha: number;
    /** One entry per weapon module; each is a screen-pixel offset from view centre. */
    readonly origins: ReadonlyArray<{ readonly dx: number; readonly dy: number }>;
  };
  /** 0 = no warp, 1 = full warp, 0–1 during deceleration. */
  readonly warpIntensity?: number;
  /** 0–1 while holding forward to charge the warp drive; resets to 0 once warp activates. */
  readonly warpChargeFraction?: number;
  /** Solar-system pause menu selection (0=Resume, 1=Quit). */
  readonly pauseMenuSelection?: number;
  /** Populated when screen === "docked"; drives drawDockedMenu. */
  readonly docked?: {
    readonly locationName: string;
    readonly menuItems: ReadonlyArray<string>;
    readonly menuSelection: number;
    readonly menuScrollOffset: number;
    readonly activeNpc: NPCDefinition | undefined;
  };
  /** Populated when screen === "solar-npc-talk". */
  readonly npcTalk?: {
    readonly npc: NPCDefinition;
    readonly menuItems: ReadonlyArray<string>;
    readonly menuSelection: number;
  };
  /** Populated when screen === "solar-missions". */
  readonly missionList?: {
    readonly npc: NPCDefinition;
    readonly missions: ReadonlyArray<{
      readonly spec: MissionSpec;
      readonly status: "available" | "active" | "completed";
    }>;
    readonly menuSelection: number;
  };
  /** Populated when screen === "solar-mission-detail". */
  readonly missionDetail?: {
    readonly spec: MissionSpec;
    readonly menuSelection: number;
  };
  /** Virtual on-screen controls for touch play in solar system. */
  readonly virtualControls?: {
    readonly thrustActive: boolean;
    readonly leftActive: boolean;
    readonly rightActive: boolean;
    readonly fireActive: boolean;
  };
  /** Click-to-lock target ids and positions. */
  readonly lockedTargets?: ReadonlyArray<{ readonly id: string; readonly position: { x: number; y: number } }>;
  /** Focused (primary attack) target id. */
  readonly focusedTargetId?: string;
  /** True when all player engine modules are destroyed (no thrust possible). */
  readonly playerStranded?: boolean;
  /** True when a rescue ship has been dispatched and is en route or towing. */
  readonly rescuePending?: boolean;
  /** Friendly escort / rescue ships. */
  readonly friendlyShips?: ReadonlyArray<{
    readonly id: string;
    readonly position: { x: number; y: number };
    readonly heading: number;
    readonly health: number;
    readonly maxHealth: number;
    /** True for rescue ships (distinct visual). */
    readonly isRescue?: boolean;
    /** True when the rescue ship has reached the player and is actively towing. */
    readonly rescueTowing?: boolean;
  }>;
  /** Player projectiles (cannon / torpedo). */
  readonly playerProjectiles?: ReadonlyArray<{
    readonly id: string;
    readonly position: { x: number; y: number };
    readonly weaponKind: "cannon" | "laser" | "torpedo";
    readonly lifetimeFrac: number; // 0-1 used for alpha
    readonly dirX: number;  // normalised velocity direction
    readonly dirY: number;
    readonly missileLevel?: number;
    readonly trailPoints?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  }>;
  /** Active explosions in world space. */
  readonly solarExplosions?: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly ageFrac: number; // 0–1
    readonly scale: number;   // relative size multiplier
  }>;
  /** 0–1 death-fade overlay alpha (0 = alive, >0 = fading to black after death). */
  readonly deathFade?: number;
  /** True when the player ship is dead (hide the ship sprite). */
  readonly solarPlayerDead?: boolean;
  /** Zoom slider state for the left-edge zoom bar. */
  readonly zoomBar?: {
    readonly fraction: number; // 0 = min zoom, 1 = max zoom (log scale)
    readonly label: string;    // e.g. "1.5x"
  };
  /** Per-faction palette overrides — e.g. the active pirate faction variant chosen at game start. */
  readonly factionPalettes?: Readonly<Partial<Record<string, FactionColors>>>;
  /** Roll-ability afterimage streaks in world space. */
  readonly rollFx?: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly dx: number; // normalized roll direction x
    readonly dy: number; // normalized roll direction y
    readonly ageFrac: number; // 0–1
  }>;
  /** 0–1 roll cooldown fraction (0 = ready, 1 = just used). For HUD indicator. */
  readonly rollCooldownFrac?: number;
  /** Salvageable items floating in world space. */
  readonly worldItems?: ReadonlyArray<{
    readonly id: string;
    readonly position: { x: number; y: number };
    readonly ageFrac: number; // 0–1 used for alpha pulse
    readonly moduleDefId: string;
  }>;
  /** Cargo capacity (total slots available). */
  readonly cargoCapacity?: number;
  /** Cargo used (total items in inventory). */
  readonly cargoUsed?: number;
  /** Crew roster — only populated when screen === "solar-crew". */
  readonly solarCrew?: {
    readonly crew: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly personalityType: string;
      readonly adoptionLean: number;
      readonly isAlive: boolean;
      readonly defectId: string | null;
      readonly traitIds: readonly string[];
      readonly skills: Readonly<Record<string, number>>; // family → level
    }>;
    readonly selection: number;
    readonly scrollOffset: number;
  };
  /** Inventory screen data — only populated when screen === "solar-inventory". */
  readonly weaponStaggerActive?: boolean;
  readonly inventoryScreen?: {
    readonly stationItems: ReadonlyArray<InventoryDisplayItem>;
    readonly shipItems: ReadonlyArray<InventoryDisplayItem>;
    readonly activePanel: "station" | "ship";
    readonly stationSel: number;
    readonly shipSel: number;
    readonly stationScroll: number;
    readonly shipScroll: number;
    readonly contextMenu: null | { readonly options: ReadonlyArray<string>; readonly selection: number };
    readonly isDocked: boolean;
    readonly locationName: string;
    readonly playerCredits: number;
    readonly shipCargoUsed: number;
    readonly shipCargoCapacity: number;
  };
}

export interface GalaxyMapData {
  readonly currentSystemId: string;
  readonly systems: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly visited: boolean;
  }>;
  readonly edges: ReadonlyArray<{
    readonly fromSystemId: string;
    readonly toSystemId: string;
  }>;
}

// Missile trail + core colors indexed by sizeClass - 1 (c1=0 … c9=8).
// Drawn on the additive-blend missileFxGfx layer, so these are the amounts
// of light added — keep saturation high, avoid near-white to prevent over-blow.
const MISSILE_TRAIL_COLORS = [
  0x33dd77, // c1 — green
  0x33bbee, // c2 — cyan
  0x3366dd, // c3 — blue
  0x7733ee, // c4 — violet
  0xdd3399, // c5 — pink
  0xee7733, // c6 — orange
  0xee3333, // c7 — red
  0xcc1111, // c8 — deep red
  0xeeddcc, // c9 — near-white
] as const;
const MISSILE_CORE_COLORS = [
  0x88ffbb, 0x88ddff, 0x6699ff, 0xaa66ff, 0xff66bb,
  0xffaa66, 0xff6666, 0xff4444, 0xffffff,
] as const;

const COLOR = {
  bg: 0x0a0a14,
  player: 0x00ffff,
  playerAccent: 0x66ffff,
  playerProjectile: 0x00ffff,
  enemyGrunt: 0xff3355,
  enemySpinner: 0xff9933,
  enemyStalker: 0x9933ff,
  enemyProjectile: 0xffaa33,
  boss: 0xff0066,
  bossAccent: 0xffaacc,
  shield: 0x33ccff,
  hudAmber: 0xffcc33,
  hudCyan: 0x33ffff,
  hudRed: 0xff4455,
  hudWhite: 0xffffff,
  powerUpWeapon: 0xffcc33,   // gold — weapon-upgrade
  powerUpShield: 0x99ccff,   // pale blue — shield
  powerUpLife: 0xff3377,     // crimson/pink — extra-life
  powerUpHealth: 0xbbffdd,   // mint — health-recovery
  powerUpSpeed: 0xaa66ff,    // violet — speed-boost
  powerUpSpread: 0xff9933,   // orange — weapon-spread
  powerUpBomb: 0xcc2244,     // dark red — weapon-bomb
  powerUpMegaLaser: 0xff4466, // pink-red — matches the beam halo in drawMegaLaser
} as const;

/**
 * Per-type visual defs for power-ups. Drives both drop rendering (drawPowerUp)
 * and the collection FX (showPowerUpCollected) so pickups read the same way
 * everywhere they appear.
 *
 * `pulseHz` — cycles per second of the glow's sine pulse.
 * `pulseShape` — `"sine"` default breathe, `"double"` heartbeat (two quick
 *   pulses then rest), `"flicker"` faster wobble, `"strobe"` square wave.
 */
type PowerUpPulseShape = "sine" | "double" | "flicker" | "strobe";
interface PowerUpVisualDef {
  readonly color: number;
  readonly pulseHz: number;
  readonly pulseShape: PowerUpPulseShape;
}
const POWER_UP_VISUAL: Readonly<Record<PowerUpType, PowerUpVisualDef>> = {
  "extra-life":      { color: COLOR.powerUpLife,      pulseHz: 1.6, pulseShape: "double" },
  "health-recovery": { color: COLOR.powerUpHealth,    pulseHz: 0.8, pulseShape: "sine" },
  "shield":          { color: COLOR.powerUpShield,    pulseHz: 0.6, pulseShape: "sine" },
  "weapon-upgrade":  { color: COLOR.powerUpWeapon,    pulseHz: 2.4, pulseShape: "flicker" },
  "weapon-spread":   { color: COLOR.powerUpSpread,    pulseHz: 2.2, pulseShape: "flicker" },
  "weapon-bomb":     { color: COLOR.powerUpBomb,      pulseHz: 1.2, pulseShape: "sine" },
  "mega-laser":      { color: COLOR.powerUpMegaLaser, pulseHz: 5.0, pulseShape: "strobe" },
  "speed-boost":     { color: COLOR.powerUpSpeed,     pulseHz: 3.0, pulseShape: "flicker" },
};

/** Returns a [0, 1] pulse intensity for the given shape at time `tSec`. */
function pulseIntensity(shape: PowerUpPulseShape, hz: number, tSec: number): number {
  const phase = (tSec * hz) % 1;
  switch (shape) {
    case "sine":
      return 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
    case "double": {
      // Heartbeat: two quick bumps (0.0 and 0.2 of the cycle), then rest.
      const bump = (p: number): number => {
        const d = Math.min(Math.abs(phase - p), Math.abs(phase - p - 1));
        return Math.max(0, 1 - d * 8);
      };
      return Math.max(bump(0.0), bump(0.2));
    }
    case "flicker": {
      // Sine layered with a higher-frequency wobble — never quite settles.
      const base = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const wob = 0.25 * Math.sin(phase * Math.PI * 6);
      return Math.min(1, Math.max(0, base + wob));
    }
    case "strobe":
      return phase < 0.5 ? 1 : 0.25;
  }
}

export class GameRenderer {
  readonly app: Application;
  readonly width: number;
  readonly height: number;

  private readonly bgLayer: Container;
  private readonly gameLayer: Container;
  private readonly fxLayer: Container;
  private readonly hudLayer: Container;
  private readonly menuLayer: Container;

  private readonly starGfx: Graphics;
  private readonly entityGfx: Graphics;
  private readonly fxGfx: Graphics;
  private readonly hudBgGfx: Graphics;

  private readonly stars: Star[] = [];
  private readonly explosions: Explosion[] = [];
  private readonly ringPulses: RingPulse[] = [];
  private readonly sparks: Spark[] = [];
  private readonly floatingTexts: FloatingText[] = [];
  private hitFlashTimer = 0;
  private gameOverFadeMs = 0;
  private readonly GAME_OVER_FADE_DURATION_MS = 800;

  // Level banner (between-level transition)
  private readonly bannerTitleText: Text;
  private readonly bannerSubText: Text;
  private bannerAgeMs = 0;
  private bannerMaxAgeMs = 0;

  // HUD text elements
  private readonly scoreText: Text;
  private readonly levelText: Text;
  private readonly livesText: Text;
  private readonly shieldText: Text;
  private readonly hitsText: Text;
  private readonly weaponText: Text;
  private readonly healthText: Text;
  private readonly bombsText: Text;

  // Menu text elements
  private readonly titleText: Text;
  private readonly subtitleText: Text;
  private readonly promptText: Text;

  // Generic menu-list items — reused across main-menu and pause screens.
  // Max items = 3 (pause menu). Unused slots hidden per-frame.
  private readonly menuItemTexts: Text[];

  // Pause overlay: translucent backdrop + "PAUSED" title.
  private readonly pauseOverlay: Graphics;
  private readonly pauseTitle: Text;

  // Stats screen: title + three column bodies (CURRENT / LAST / ALL-TIME).
  private readonly statsTitle: Text;
  private readonly statsColCurrent: Text;
  private readonly statsColLast: Text;
  private readonly statsColAllTime: Text;
  private readonly statsColCurrentHeader: Text;
  private readonly statsColLastHeader: Text;
  private readonly statsColAllTimeHeader: Text;
  private readonly statsPrompt: Text;

  // Game-over text elements
  private readonly gameOverTitle: Text;
  private readonly gameOverStats: Text;
  private readonly gameOverPrompt: Text;

  // Boss name label (shown next to the boss health bar during a boss fight)
  private readonly bossNameText: Text;

  // Starmap (campaign) overlay elements.
  private readonly starmapGfx: Graphics;
  private readonly starmapTitle: Text;
  private readonly starmapSelectedName: Text;
  private readonly starmapMissionLabel: Text;
  private readonly starmapCreditsText: Text;
  private readonly starmapPrompt: Text;
  private readonly starmapNodeLabels: Text[] = [];

  // Solar system overlay elements.
  private warpBubbleTimeMs = 0;
  private warpFilter: Filter | null = null;
  private readonly solarSystemGfx: Graphics;
  /** Additive-blend overlay for missile trails and warhead glows. Cleared each solar frame. */
  private readonly missileFxGfx: Graphics;
  // Solar-system label pools — bodies, stations, gates, enemy ships/bases.
  private readonly solarBodyLabels: Text[] = [];
  private readonly solarLocationLabels: Text[] = [];
  private readonly solarGateLabels: Text[] = [];
  private readonly solarEnemyLabels: Text[] = [];
  private readonly solarEnemyStationLabels: Text[] = [];
  // Zoom bar label (single text node).
  private readonly zoomBarLabel: Text[] = [];
  // Galaxy-map text pool — system names.
  private readonly galaxySystemLabels: Text[] = [];
  // Solar-system status / system-name banner.
  private readonly solarSystemNameText: Text;
  private readonly solarApproachText: Text;
  private readonly solarSpeedBarLabel: Text;
  private readonly solarPauseSoundText: Text;
  private readonly solarRescueText: Text;
  // Docked screen elements.
  private readonly dockedTitle: Text;
  private readonly dockedHint: Text;
  private readonly dockedMenuLabels: Text[] = [];
  private currentDockRobot: Container | null = null;
  private currentDockNpcId: string | null = null;
  private readonly robotAnimator = new NPCRobotAnimator();
  private readonly dockCounterGfx = new Graphics();

  // Solar ship-builder overlay elements.
  private readonly solarBuilderGfx: Graphics;
  private readonly solarBuilderTitleText: Text;
  private readonly solarBuilderHintText: Text;
  private readonly solarBuilderStatusText: Text;
  private readonly solarBuilderZoomText: Text;
  private readonly solarBuilderRepairText: Text;
  private readonly solarBuilderBudgetLabels: Text[] = [];
  private readonly solarBuilderPaletteLabels: Text[] = [];

  // Solar shop overlay elements.
  private readonly solarShopGfx: Graphics;
  private readonly solarShopTitleText: Text;
  private readonly solarShopHintText: Text;
  private readonly solarShopCreditsText: Text;
  private readonly solarShopStatusText: Text;
  private readonly solarShopSearchText: Text;
  private readonly solarShopRowLabels: Text[] = []; // column header row
  private readonly solarShopNameLabels: Text[] = [];
  private readonly solarShopTypeLabels: Text[] = [];
  private readonly solarShopDemandLabels: Text[] = [];
  private readonly solarShopPriceLabels: Text[] = [];
  private readonly solarShopStockLabels: Text[] = [];
  private readonly solarShopOwnedLabels: Text[] = [];

  // Shipyard overlay elements.
  private readonly shipyardGfx: Graphics;
  private readonly shipyardTitle: Text;
  private readonly shipyardStatsText: Text;
  private readonly shipyardSummaryText: Text;
  private readonly shipyardPrompt: Text;
  private readonly shipyardPaletteLabels: Text[] = [];
  private readonly shipyardButtonLabels: Text[] = [];
  private readonly shipyardSavedLabels: Text[] = [];
  private readonly shipyardSavedHeader: Text;
  private readonly shipyardStatusText: Text;

  // Inventory screen overlay.
  private readonly solarInventoryGfx: Graphics = new Graphics();
  private readonly inventoryLabels: Text[] = [];

  private readonly isTouchDevice: boolean =
    typeof window !== "undefined" &&
    (("ontouchstart" in window) || navigator.maxTouchPoints > 0);

  constructor(app: Application, width: number, height: number) {
    this.app = app;
    this.width = width;
    this.height = height;

    this.bgLayer = new Container();
    this.gameLayer = new Container();
    this.fxLayer = new Container();
    this.hudLayer = new Container();
    this.menuLayer = new Container();

    app.stage.addChild(this.bgLayer, this.gameLayer, this.fxLayer, this.hudLayer, this.menuLayer);

    this.starGfx = new Graphics();
    this.bgLayer.addChild(this.starGfx);

    this.entityGfx = new Graphics();
    this.gameLayer.addChild(this.entityGfx);

    this.fxGfx = new Graphics();
    this.fxLayer.addChild(this.fxGfx);

    this.hudBgGfx = new Graphics();
    this.hudLayer.addChild(this.hudBgGfx);

    // HUD text
    const hudStyle = (color: number, size = 20): TextStyle =>
      new TextStyle({
        fontFamily: "monospace",
        fontSize: size,
        fill: color,
        fontWeight: "bold",
      });

    this.scoreText = new Text({ text: "SCORE 0", style: hudStyle(COLOR.hudAmber, 22) });
    this.scoreText.x = 20;
    this.scoreText.y = 16;
    this.hudLayer.addChild(this.scoreText);

    this.levelText = new Text({ text: "LEVEL 1", style: hudStyle(COLOR.hudCyan, 22) });
    this.levelText.anchor.set(0.5, 0);
    this.levelText.x = width / 2;
    this.levelText.y = 16;
    this.hudLayer.addChild(this.levelText);

    this.livesText = new Text({ text: "LIVES 3", style: hudStyle(COLOR.hudRed, 22) });
    this.livesText.x = 20;
    this.livesText.y = 46;
    this.hudLayer.addChild(this.livesText);

    this.healthText = new Text({ text: "HP 100", style: hudStyle(COLOR.hudWhite, 18) });
    this.healthText.x = 20;
    this.healthText.y = 76;
    this.hudLayer.addChild(this.healthText);

    this.shieldText = new Text({ text: "", style: hudStyle(COLOR.shield, 18) });
    this.shieldText.x = 20;
    this.shieldText.y = 100;
    this.hudLayer.addChild(this.shieldText);

    this.hitsText = new Text({ text: "HITS 0", style: hudStyle(COLOR.hudAmber, 18) });
    this.hitsText.anchor.set(1, 0);
    this.hitsText.x = width - 20;
    this.hitsText.y = 16;
    this.hudLayer.addChild(this.hitsText);

    this.weaponText = new Text({ text: "GUN I", style: hudStyle(COLOR.hudCyan, 18) });
    this.weaponText.anchor.set(1, 0);
    this.weaponText.x = width - 20;
    this.weaponText.y = 44;
    this.hudLayer.addChild(this.weaponText);

    this.bombsText = new Text({ text: "", style: hudStyle(COLOR.hudAmber, 18) });
    this.bombsText.anchor.set(1, 0);
    this.bombsText.x = width - 20;
    this.bombsText.y = 68;
    this.hudLayer.addChild(this.bombsText);

    // Menu text
    // Pause overlay — dark scrim drawn under every menuLayer element so the
    // scrim dims the frozen gameplay but never dims the pause menu itself.
    // Cleared when not in pause, so order doesn't affect other screens.
    this.pauseOverlay = new Graphics();
    this.menuLayer.addChild(this.pauseOverlay);

    this.titleText = new Text({
      text: "R-WIPE",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 96,
        fill: COLOR.hudCyan,
        fontWeight: "bold",
        dropShadow: { color: 0x003366, blur: 16, distance: 4, angle: Math.PI / 2, alpha: 1 },
      }),
    });
    this.titleText.anchor.set(0.5, 0.5);
    this.titleText.x = width / 2;
    this.titleText.y = height / 2 - 80;
    this.menuLayer.addChild(this.titleText);

    this.subtitleText = new Text({
      text: "A SPACESHIP SHOOTER",
      style: hudStyle(COLOR.hudAmber, 22),
    });
    this.subtitleText.anchor.set(0.5, 0.5);
    this.subtitleText.x = width / 2;
    this.subtitleText.y = height / 2;
    this.menuLayer.addChild(this.subtitleText);

    this.promptText = new Text({
      text: "↑↓ SELECT   ENTER CONFIRM   TAP TO PLAY",
      style: hudStyle(COLOR.hudWhite, 16),
    });
    this.promptText.anchor.set(0.5, 0.5);
    this.promptText.x = width / 2;
    this.promptText.y = height - 40;
    this.menuLayer.addChild(this.promptText);

    // Menu list items — centred column, spaced ~44px apart.
    this.menuItemTexts = [];
    for (let i = 0; i < 5; i++) {
      const t = new Text({
        text: "",
        style: hudStyle(COLOR.hudWhite, 28),
      });
      t.anchor.set(0.5, 0.5);
      t.x = width / 2;
      t.y = height / 2 + 80 + i * 46;
      this.menuLayer.addChild(t);
      this.menuItemTexts.push(t);
    }

    this.pauseTitle = new Text({
      text: "PAUSED",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 64,
        fill: COLOR.hudCyan,
        fontWeight: "bold",
        dropShadow: { color: 0x003366, blur: 12, distance: 3, angle: Math.PI / 2, alpha: 1 },
      }),
    });
    this.pauseTitle.anchor.set(0.5, 0.5);
    this.pauseTitle.x = width / 2;
    this.pauseTitle.y = height / 2 - 80;
    this.menuLayer.addChild(this.pauseTitle);

    // Stats screen — 3-column layout.
    this.statsTitle = new Text({
      text: "STATISTICS",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 48,
        fill: COLOR.hudAmber,
        fontWeight: "bold",
      }),
    });
    this.statsTitle.anchor.set(0.5, 0);
    this.statsTitle.x = width / 2;
    this.statsTitle.y = 40;
    this.menuLayer.addChild(this.statsTitle);

    const colY = 120;
    const colWidth = Math.floor(width / 3);
    const mkStatHeader = (text: string, col: number): Text => {
      const t = new Text({
        text,
        style: hudStyle(COLOR.hudCyan, 18),
      });
      t.anchor.set(0.5, 0);
      t.x = colWidth * col + colWidth / 2;
      t.y = colY;
      this.menuLayer.addChild(t);
      return t;
    };
    const mkStatBody = (col: number): Text => {
      const t = new Text({
        text: "",
        style: new TextStyle({
          fontFamily: "monospace",
          fontSize: 16,
          fill: COLOR.hudWhite,
          align: "left",
          lineHeight: 22,
        }),
      });
      // Anchor-x = 0.5 centers the block under the column header, while
      // align: "left" keeps every row flush-left within that block so the
      // padded label/value pairs render as a neat two-column table.
      t.anchor.set(0.5, 0);
      t.x = colWidth * col + colWidth / 2;
      t.y = colY + 36;
      this.menuLayer.addChild(t);
      return t;
    };

    this.statsColCurrentHeader = mkStatHeader("CURRENT RUN", 0);
    this.statsColLastHeader = mkStatHeader("LAST RUN", 1);
    this.statsColAllTimeHeader = mkStatHeader("ALL-TIME", 2);
    this.statsColCurrent = mkStatBody(0);
    this.statsColLast = mkStatBody(1);
    this.statsColAllTime = mkStatBody(2);

    this.statsPrompt = new Text({
      text: "PRESS  ESC  OR  ENTER  TO  GO  BACK",
      style: hudStyle(COLOR.hudWhite, 16),
    });
    this.statsPrompt.anchor.set(0.5, 1);
    this.statsPrompt.x = width / 2;
    this.statsPrompt.y = height - 40;
    this.menuLayer.addChild(this.statsPrompt);

    // Game over text — packed into the top of the canvas so it stays
    // readable even when the viewport is ~658px of usable height.
    this.gameOverTitle = new Text({
      text: "GAME OVER",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 56,
        fill: COLOR.hudRed,
        fontWeight: "bold",
      }),
    });
    this.gameOverTitle.anchor.set(0.5, 0);
    this.gameOverTitle.x = width / 2;
    this.gameOverTitle.y = 60;
    this.gameOverTitle.visible = false;
    this.menuLayer.addChild(this.gameOverTitle);

    this.gameOverStats = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 18,
        fill: COLOR.hudWhite,
        align: "center",
        lineHeight: 26,
      }),
    });
    this.gameOverStats.anchor.set(0.5, 0);
    this.gameOverStats.x = width / 2;
    this.gameOverStats.y = 160;
    this.gameOverStats.visible = false;
    this.menuLayer.addChild(this.gameOverStats);

    this.gameOverPrompt = new Text({
      text: "PRESS  ENTER  TO  RESTART",
      style: hudStyle(COLOR.hudAmber, 22),
    });
    this.gameOverPrompt.anchor.set(0.5, 1);
    this.gameOverPrompt.x = width / 2;
    this.gameOverPrompt.y = height - 40;
    this.gameOverPrompt.visible = false;
    this.menuLayer.addChild(this.gameOverPrompt);

    // Boss name label — drawn vertically next to the boss HP bar.
    this.bossNameText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 16,
        fill: COLOR.hudWhite,
        fontWeight: "bold",
        letterSpacing: 3,
      }),
    });
    this.bossNameText.anchor.set(0, 0);
    this.bossNameText.x = 40;
    this.bossNameText.y = this.height / 2 - 180;
    this.bossNameText.visible = false;
    this.hudLayer.addChild(this.bossNameText);

    // Level banner — hidden by default; shown during level transitions.
    this.bannerTitleText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 72,
        fill: COLOR.hudCyan,
        fontWeight: "bold",
        dropShadow: { color: 0x003366, blur: 12, distance: 3, angle: Math.PI / 2, alpha: 1 },
      }),
    });
    this.bannerTitleText.anchor.set(0.5, 0.5);
    this.bannerTitleText.x = width / 2;
    this.bannerTitleText.y = height / 2 - 30;
    this.bannerTitleText.visible = false;
    this.fxLayer.addChild(this.bannerTitleText);

    this.bannerSubText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 26,
        fill: COLOR.hudAmber,
        fontWeight: "bold",
      }),
    });
    this.bannerSubText.anchor.set(0.5, 0.5);
    this.bannerSubText.x = width / 2;
    this.bannerSubText.y = height / 2 + 30;
    this.bannerSubText.visible = false;
    this.fxLayer.addChild(this.bannerSubText);

    // Starmap overlay — drawn into its own Graphics layer that lives under
    // the text labels. Nodes + edges are rebuilt every frame from extras.
    this.starmapGfx = new Graphics();
    this.menuLayer.addChild(this.starmapGfx);

    // Solar system overlay — drawn into its own Graphics layer
    this.solarSystemGfx = new Graphics();
    this.menuLayer.addChild(this.solarSystemGfx);

    this.solarSystemGfx.filterArea = new Rectangle(0, 0, width, height);

    // Additive-blend overlay for missile trails/glows — sits above solarSystemGfx
    this.missileFxGfx = new Graphics();
    this.missileFxGfx.blendMode = "add";
    this.menuLayer.addChild(this.missileFxGfx);

    // Solar ship-builder overlay
    this.solarBuilderGfx = new Graphics();
    this.menuLayer.addChild(this.solarBuilderGfx);

    this.solarBuilderTitleText = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 18, fill: 0xaaccff, fontWeight: "bold" }),
    });
    this.solarBuilderTitleText.anchor.set(0.5, 0.5);
    this.solarBuilderTitleText.visible = false;
    this.menuLayer.addChild(this.solarBuilderTitleText);

    this.solarBuilderHintText = new Text({
      text: "[Click] Place  •  [RClick] Remove  •  [ESC] Exit",
      style: hudStyle(COLOR.hudWhite, 13),
    });
    this.solarBuilderHintText.anchor.set(0.5, 1);
    this.solarBuilderHintText.x = 400;
    this.solarBuilderHintText.y = height - 8;
    this.solarBuilderHintText.visible = false;
    this.menuLayer.addChild(this.solarBuilderHintText);

    this.solarBuilderStatusText = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: 0x00ffaa }),
    });
    this.solarBuilderStatusText.anchor.set(0.5, 0.5);
    this.solarBuilderStatusText.visible = false;
    this.menuLayer.addChild(this.solarBuilderStatusText);

    this.solarBuilderZoomText = new Text({
      text: "1.00x",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x5599cc }),
    });
    this.solarBuilderZoomText.visible = false;
    this.menuLayer.addChild(this.solarBuilderZoomText);

    this.solarBuilderRepairText = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0x00ee55, fontWeight: "bold" }),
    });
    this.solarBuilderRepairText.anchor.set(0.5, 0.5);
    this.solarBuilderRepairText.visible = false;
    this.menuLayer.addChild(this.solarBuilderRepairText);

    // Solar shop overlay
    this.solarShopGfx = new Graphics();
    this.menuLayer.addChild(this.solarShopGfx);

    this.solarShopTitleText = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 22, fill: COLOR.hudCyan, fontWeight: "bold" }),
    });
    this.solarShopTitleText.anchor.set(0.5, 0.5);
    this.solarShopTitleText.visible = false;
    this.menuLayer.addChild(this.solarShopTitleText);

    this.solarShopCreditsText = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: COLOR.hudAmber }),
    });
    this.solarShopCreditsText.anchor.set(1, 0.5);
    this.solarShopCreditsText.visible = false;
    this.menuLayer.addChild(this.solarShopCreditsText);

    this.solarShopHintText = new Text({
      text: "[↑↓] Select  •  [Enter] Buy  •  [R-Click] Sell  •  type to filter  •  [ESC] Back",
      style: hudStyle(COLOR.hudWhite, 13),
    });
    this.solarShopHintText.anchor.set(0.5, 1);
    this.solarShopHintText.x = width / 2;
    this.solarShopHintText.y = height - 8;
    this.solarShopHintText.visible = false;
    this.menuLayer.addChild(this.solarShopHintText);

    this.solarShopStatusText = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: 0x00ffaa }),
    });
    this.solarShopStatusText.anchor.set(0.5, 0.5);
    this.solarShopStatusText.visible = false;
    this.menuLayer.addChild(this.solarShopStatusText);

    this.solarShopSearchText = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffffff }),
    });
    this.solarShopSearchText.anchor.set(0, 0.5);
    this.solarShopSearchText.visible = false;
    this.menuLayer.addChild(this.solarShopSearchText);

    // System-name banner (top-centre while flying in solar mode)
    this.solarSystemNameText = new Text({
      text: "",
      style: hudStyle(COLOR.hudCyan, 22),
    });
    this.solarSystemNameText.anchor.set(0.5, 0);
    this.solarSystemNameText.x = width / 2;
    this.solarSystemNameText.y = 16;
    this.solarSystemNameText.visible = false;
    this.menuLayer.addChild(this.solarSystemNameText);

    // Approach prompt (e.g., "[E] DOCK", "[E] JUMP")
    this.solarApproachText = new Text({
      text: "",
      style: hudStyle(COLOR.hudAmber, 22),
    });
    this.solarApproachText.anchor.set(0.5, 1);
    this.solarApproachText.x = width / 2;
    this.solarApproachText.y = height - 32;
    this.solarApproachText.visible = false;
    this.menuLayer.addChild(this.solarApproachText);

    this.solarSpeedBarLabel = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 10,
        fill: 0x88aacc,
        letterSpacing: 1,
      }),
    });
    this.solarSpeedBarLabel.anchor.set(0.5, 1);
    this.solarSpeedBarLabel.x = width / 2;
    this.solarSpeedBarLabel.y = height - 14;
    this.solarSpeedBarLabel.visible = false;
    this.menuLayer.addChild(this.solarSpeedBarLabel);

    this.solarPauseSoundText = new Text({
      text: "",
      style: hudStyle(COLOR.hudWhite, 22),
    });
    this.solarPauseSoundText.anchor.set(0.5, 0.5);
    this.solarPauseSoundText.visible = false;
    this.menuLayer.addChild(this.solarPauseSoundText);

    this.solarRescueText = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffdd44, fontWeight: "bold" }),
    });
    this.solarRescueText.anchor.set(0.5, 0.5);
    this.solarRescueText.visible = false;
    this.menuLayer.addChild(this.solarRescueText);

    // Inventory screen overlay graphics.
    this.menuLayer.addChild(this.solarInventoryGfx);

    // Docked screen — title + hint. Menu items live in a pool.
    this.dockedTitle = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 32,
        fill: COLOR.hudCyan,
        fontWeight: "bold",
      }),
    });
    this.dockedTitle.anchor.set(0.5, 0);
    this.dockedTitle.x = width / 2;
    this.dockedTitle.visible = false;
    this.menuLayer.addChild(this.dockedTitle);

    this.dockedHint = new Text({
      text: "",
      style: hudStyle(COLOR.hudWhite, 14),
    });
    this.dockedHint.anchor.set(0.5, 1);
    this.dockedHint.x = width / 2;
    this.dockedHint.visible = false;
    this.menuLayer.addChild(this.dockedHint);
    this.dockCounterGfx.visible = false;
    this.menuLayer.addChild(this.dockCounterGfx);

    this.starmapTitle = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 40,
        fill: COLOR.hudCyan,
        fontWeight: "bold",
      }),
    });
    this.starmapTitle.anchor.set(0.5, 0);
    this.starmapTitle.x = width / 2;
    this.starmapTitle.y = 24;
    this.starmapTitle.visible = false;
    this.menuLayer.addChild(this.starmapTitle);

    this.starmapSelectedName = new Text({
      text: "",
      style: hudStyle(COLOR.hudAmber, 22),
    });
    this.starmapSelectedName.anchor.set(0.5, 1);
    this.starmapSelectedName.x = width / 2;
    this.starmapSelectedName.y = height - 76;
    this.starmapSelectedName.visible = false;
    this.menuLayer.addChild(this.starmapSelectedName);

    this.starmapMissionLabel = new Text({
      text: "",
      style: hudStyle(COLOR.hudWhite, 18),
    });
    this.starmapMissionLabel.anchor.set(0.5, 1);
    this.starmapMissionLabel.x = width / 2;
    this.starmapMissionLabel.y = height - 50;
    this.starmapMissionLabel.visible = false;
    this.menuLayer.addChild(this.starmapMissionLabel);

    this.starmapCreditsText = new Text({
      text: "",
      style: hudStyle(COLOR.hudAmber, 18),
    });
    this.starmapCreditsText.anchor.set(1, 0);
    this.starmapCreditsText.x = width - 24;
    this.starmapCreditsText.y = 24;
    this.starmapCreditsText.visible = false;
    this.menuLayer.addChild(this.starmapCreditsText);

    this.starmapPrompt = new Text({
      text: "↑↓ SELECT   ENTER  LAUNCH   ESC  BACK",
      style: hudStyle(COLOR.hudWhite, 14),
    });
    this.starmapPrompt.anchor.set(0.5, 1);
    this.starmapPrompt.x = width / 2;
    this.starmapPrompt.y = height - 20;
    this.starmapPrompt.visible = false;
    this.menuLayer.addChild(this.starmapPrompt);

    // Shipyard overlay
    this.shipyardGfx = new Graphics();
    this.menuLayer.addChild(this.shipyardGfx);

    this.shipyardTitle = new Text({
      text: "AWAY CRAFT BUILDER",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 28,
        fill: COLOR.hudAmber,
        fontWeight: "bold",
      }),
    });
    this.shipyardTitle.anchor.set(0.5, 0);
    this.shipyardTitle.x = width / 2;
    this.shipyardTitle.y = 18;
    this.shipyardTitle.visible = false;
    this.menuLayer.addChild(this.shipyardTitle);

    this.shipyardStatsText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 16,
        fill: COLOR.hudWhite,
        align: "left",
        lineHeight: 22,
      }),
    });
    this.shipyardStatsText.anchor.set(0, 0);
    this.shipyardStatsText.x = 976;
    this.shipyardStatsText.y = 118;
    this.shipyardStatsText.visible = false;
    this.menuLayer.addChild(this.shipyardStatsText);

    this.shipyardSummaryText = new Text({
      text: "",
      style: hudStyle(COLOR.hudCyan, 16),
    });
    this.shipyardSummaryText.anchor.set(0.5, 0);
    this.shipyardSummaryText.x = width / 2;
    this.shipyardSummaryText.y = 56;
    this.shipyardSummaryText.visible = false;
    this.menuLayer.addChild(this.shipyardSummaryText);

    this.shipyardPrompt = new Text({
      text: "TAP A PART  •  TAP THE SHIP TO SNAP  •  TAP A PART TO SELECT",
      style: hudStyle(COLOR.hudWhite, 14),
    });
    this.shipyardPrompt.anchor.set(0.5, 1);
    this.shipyardPrompt.x = width / 2;
    this.shipyardPrompt.y = height - 8;
    this.shipyardPrompt.visible = false;
    this.menuLayer.addChild(this.shipyardPrompt);

    this.shipyardSavedHeader = new Text({
      text: "SAVED SHIPS",
      style: hudStyle(COLOR.hudAmber, 14),
    });
    this.shipyardSavedHeader.anchor.set(0.5, 0);
    this.shipyardSavedHeader.visible = false;
    this.menuLayer.addChild(this.shipyardSavedHeader);

    this.shipyardStatusText = new Text({
      text: "",
      style: hudStyle(COLOR.hudAmber, 16),
    });
    this.shipyardStatusText.anchor.set(0.5, 0);
    this.shipyardStatusText.x = width / 2;
    this.shipyardStatusText.y = 80;
    this.shipyardStatusText.visible = false;
    this.menuLayer.addChild(this.shipyardStatusText);

    this.initStarfield();
  }

  // ── Starfield ───────────────────────────────────────────────────────────

  private initStarfield(): void {
    this.stars.length = 0;
    for (let i = 0; i < 140; i++) {
      const z = Math.random();
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        speed: 30 + z * 180,
        size: 1 + Math.round(z * 2),
        alpha: 0.3 + z * 0.7,
      });
    }
  }

  private drawStarfield(deltaMs: number): void {
    const dt = deltaMs / 1_000;
    this.starGfx.clear();
    for (const s of this.stars) {
      s.x -= s.speed * dt;
      if (s.x < -2) {
        s.x = this.width + 2;
        s.y = Math.random() * this.height;
      }
      this.starGfx
        .rect(s.x, s.y, s.size, s.size)
        .fill({ color: 0xffffff, alpha: s.alpha });
    }
  }

  // ── Public frame API ─────────────────────────────────────────────────────

  renderFrame(
    state: Readonly<GameState>,
    deltaMs: number,
    extras: {
      playerProjectiles: ReadonlyArray<Projectile>;
      enemyProjectiles: ReadonlyArray<Projectile>;
      enemies: ReadonlyArray<Enemy>;
      boss: Readonly<BossState> | null;
      powerUps: ReadonlyArray<PowerUp>;
      menuSelection: number;
      lastRun: Readonly<RunStats> | null;
      bombCredits: number;
      starmap: StarmapRenderData | null;
      shipyard: ShipyardRenderData | null;
      solarSystem: SolarSystemRenderData | null;
      solarShipBuilder: SolarShipBuilderRenderData | null;
      solarShop: ShopRenderData | null;
      solarMyShips: ReadonlyArray<SavedBlueprintSummary> | null;
      playerBlueprint: PlayerBlueprintVisual | null;
    },
  ): void {
    this.warpBubbleTimeMs += deltaMs;
    this.drawStarfield(deltaMs);
    this.fxGfx.clear();
    this.entityGfx.clear();
    this.hudBgGfx.clear();
    this.pauseOverlay.clear();

    const screen = state.screen;
    const isGameplay = screen === "gameplay";
    const isPause = screen === "pause";
    const isStats = screen === "stats";
    const isMenu = screen === "main-menu";
    const isGameOver = screen === "game-over";
    const isStarmap = screen === "starmap";
    const isShipyard = screen === "shipyard";
    const isSolarSystem = screen === "solar-system" || screen === "solar-system-paused";
    const isDocked = screen === "docked";
    const isSolarShipBuilder = screen === "solar-shipyard";
    const isSolarShop = screen === "solar-shop";
    const isSolarMyShips = screen === "solar-my-ships";
    const isSolarCrew = screen === "solar-crew";
    const isInventory = screen === "solar-inventory";
    const isNpcTalk = screen === "solar-npc-talk";
    const isMissionList = screen === "solar-missions";
    const isMissionDetail = screen === "solar-mission-detail";
    const isAnyDockedScreen = isDocked || isNpcTalk || isMissionList || isMissionDetail;
    // Gameplay entities stay visible behind the pause overlay.
    const drawsEntities = isGameplay || isPause;

    const isSolarPaused = screen === "solar-system-paused";
    this.menuLayer.visible = isMenu || isGameOver || isPause || isStats || isStarmap || isShipyard || isSolarSystem || isAnyDockedScreen || isSolarShipBuilder || isSolarShop || isSolarMyShips || isSolarCrew || isInventory;
    this.titleText.visible = isMenu;
    this.subtitleText.visible = isMenu;
    this.promptText.visible = isMenu || isPause || isSolarPaused;
    this.gameOverTitle.visible = isGameOver;
    this.gameOverStats.visible = isGameOver;
    this.gameOverPrompt.visible = isGameOver;
    this.pauseTitle.visible = isPause || isSolarPaused;
    // Solar system view labels
    this.solarSystemNameText.visible = isSolarSystem;
    // solarApproachText / solarSpeedBarLabel / solarRescueText visibility set inside drawSolarSystem each frame.
    if (!isSolarSystem) {
      this.solarApproachText.visible = false;
      this.solarSpeedBarLabel.visible = false;
      this.solarRescueText.visible = false;
    }
    for (const t of this.solarBodyLabels) t.visible = isSolarSystem;
    for (const t of this.solarLocationLabels) t.visible = isSolarSystem;
    for (const t of this.solarGateLabels) t.visible = isSolarSystem;
    for (const t of this.solarEnemyLabels) t.visible = isSolarSystem;
    for (const t of this.solarEnemyStationLabels) t.visible = isSolarSystem;
    for (const t of this.zoomBarLabel) t.visible = isSolarSystem;
    // Galaxy-map labels visible only when galaxy map drawn (set in drawGalaxyMap).
    if (!isSolarSystem) for (const t of this.galaxySystemLabels) t.visible = false;
    // Docked screen labels
    this.solarPauseSoundText.visible = isSolarPaused;
    this.dockedTitle.visible = isAnyDockedScreen;
    this.dockedHint.visible = isAnyDockedScreen;
    for (const t of this.dockedMenuLabels) t.visible = isAnyDockedScreen;
    // Robot + counter: remove from menuLayer the moment we leave docked state
    // so they never bleed through any other overlay (shipyard, starmap, etc.)
    if (!isAnyDockedScreen && this.currentDockRobot) {
      this.menuLayer.removeChild(this.currentDockRobot);
      this.currentDockRobot = null;
      this.currentDockNpcId = null;
      this.dockCounterGfx.clear();
      this.dockCounterGfx.visible = false;
    }
    // Stats overlay elements
    this.statsTitle.visible = isStats;
    this.statsColCurrentHeader.visible = isStats;
    this.statsColLastHeader.visible = isStats;
    this.statsColAllTimeHeader.visible = isStats;
    this.statsColCurrent.visible = isStats;
    this.statsColLast.visible = isStats;
    this.statsColAllTime.visible = isStats;
    this.statsPrompt.visible = isStats;
    // Starmap overlay toggles
    this.starmapTitle.visible = isStarmap;
    this.starmapSelectedName.visible = isStarmap;
    this.starmapMissionLabel.visible = isStarmap;
    this.starmapCreditsText.visible = isStarmap;
    this.starmapPrompt.visible = isStarmap;
    for (const t of this.starmapNodeLabels) t.visible = isStarmap;
    if (!isStarmap) this.starmapGfx.clear();
    // Solar system overlay toggles
    if (!isSolarSystem && !isAnyDockedScreen) {
      this.solarSystemGfx.clear();
      this.missileFxGfx.clear();
    }
    // Shipyard overlay toggles
    this.shipyardTitle.visible = isShipyard;
    this.shipyardStatsText.visible = isShipyard;
    this.shipyardSummaryText.visible = isShipyard;
    this.shipyardPrompt.visible = isShipyard;
    this.shipyardSavedHeader.visible = isShipyard;
    // shipyardStatusText visibility is driven by data.statusMsg each frame.
    if (!isShipyard) this.shipyardStatusText.visible = false;
    for (const t of this.shipyardPaletteLabels) t.visible = isShipyard;
    for (const t of this.shipyardButtonLabels) t.visible = isShipyard;
    for (const t of this.shipyardSavedLabels) t.visible = isShipyard;
    if (!isShipyard) this.shipyardGfx.clear();
    if (!isSolarShipBuilder) this.solarBuilderGfx.clear();
    // Solar ship-builder overlay toggles
    this.solarBuilderTitleText.visible = isSolarShipBuilder;
    this.solarBuilderHintText.visible = isSolarShipBuilder;
    this.solarBuilderZoomText.visible = isSolarShipBuilder;
    if (!isSolarShipBuilder) {
      this.solarBuilderStatusText.visible = false;
      this.solarBuilderRepairText.visible = false;
      for (const t of this.solarBuilderBudgetLabels) t.visible = false;
      for (const t of this.solarBuilderPaletteLabels) t.visible = false;
    }
    // Solar shop overlay toggles
    if (!isSolarShop) this.solarShopGfx.clear();
    this.solarShopTitleText.visible = isSolarShop;
    this.solarShopHintText.visible = isSolarShop;
    this.solarShopCreditsText.visible = isSolarShop;
    this.solarShopSearchText.visible = isSolarShop;
    if (!isSolarShop) {
      this.solarShopStatusText.visible = false;
      for (const t of this.solarShopRowLabels) t.visible = false;
      for (const t of this.solarShopNameLabels) t.visible = false;
      for (const t of this.solarShopTypeLabels) t.visible = false;
      for (const t of this.solarShopDemandLabels) t.visible = false;
      for (const t of this.solarShopPriceLabels) t.visible = false;
      for (const t of this.solarShopStockLabels) t.visible = false;
      for (const t of this.solarShopOwnedLabels) t.visible = false;
    }
    // Inventory screen overlay toggles.
    if (!isInventory) {
      this.solarInventoryGfx.clear();
      for (const t of this.inventoryLabels) t.visible = false;
    }
    // Menu list items: used by main-menu (3) and pause (3); hidden on stats / starmap.
    const showList = isMenu || isPause;
    for (const t of this.menuItemTexts) t.visible = showList;

    this.hudLayer.visible = drawsEntities;
    // gameLayer stays visible so the menu ship + bg render. entityGfx is cleared each frame.

    if (isMenu) {
      this.drawMenuShip();
      this.updateMainMenu(extras.menuSelection);
      this.promptText.alpha = 0.6 + 0.4 * Math.sin(performance.now() * 0.004);
      return;
    }

    if (isStats) {
      this.updateStatsScreen(state, extras.lastRun);
      this.statsPrompt.alpha = 0.6 + 0.4 * Math.sin(performance.now() * 0.004);
      return;
    }

    if (isStarmap && extras.starmap) {
      this.drawStarmap(extras.starmap);
      return;
    }

    if (isShipyard && extras.shipyard) {
      this.drawShipyard(extras.shipyard);
      return;
    }

    if (isSolarSystem && extras.solarSystem) {
      this.drawSolarSystem(extras.solarSystem);
      // Draw pause overlay if paused
      if (screen === "solar-system-paused") {
        this.drawPauseOverlay(extras.solarSystem?.pauseMenuSelection ?? 0);
      }
      return;
    }

    if (isDocked) {
      this.drawDockedMenu(extras.solarSystem);
      if (this.currentDockRobot) this.robotAnimator.update(this.currentDockRobot, deltaMs, performance.now());
      return;
    }

    if (isNpcTalk && extras.solarSystem?.npcTalk) {
      this.drawNpcTalkScreen(extras.solarSystem.npcTalk, extras.solarSystem.docked?.locationName);
      if (this.currentDockRobot) this.robotAnimator.update(this.currentDockRobot, deltaMs, performance.now());
      return;
    }

    if (isMissionList && extras.solarSystem?.missionList) {
      this.drawMissionListScreen(extras.solarSystem.missionList, extras.solarSystem.docked?.locationName);
      if (this.currentDockRobot) this.robotAnimator.update(this.currentDockRobot, deltaMs, performance.now());
      return;
    }

    if (isMissionDetail && extras.solarSystem?.missionDetail) {
      this.drawMissionDetailScreen(extras.solarSystem.missionDetail, extras.solarSystem.npcTalk?.npc ?? extras.solarSystem.missionList?.npc);
      if (this.currentDockRobot) this.robotAnimator.update(this.currentDockRobot, deltaMs, performance.now());
      return;
    }

    if (isSolarShipBuilder && extras.solarShipBuilder) {
      this.drawSolarShipBuilder(extras.solarShipBuilder);
      return;
    }

    if (isSolarShop && extras.solarShop) {
      this.drawSolarShop(extras.solarShop);
      return;
    }

    if (isInventory && extras.solarSystem?.inventoryScreen) {
      this.drawInventoryScreen(extras.solarSystem.inventoryScreen);
      return;
    }

    if (isSolarMyShips) {
      this.drawSolarMyShips(extras.solarMyShips ?? []);
      return;
    }

    if (isSolarCrew && extras.solarSystem?.solarCrew) {
      this.drawSolarCrew(extras.solarSystem.solarCrew);
      return;
    }

    if (isGameOver) {
      this.gameOverFadeMs = Math.min(
        this.GAME_OVER_FADE_DURATION_MS,
        this.gameOverFadeMs + deltaMs,
      );
      const a = this.gameOverFadeMs / this.GAME_OVER_FADE_DURATION_MS;
      this.gameOverTitle.alpha = a;
      this.gameOverStats.alpha = a;
      this.gameOverPrompt.alpha = 0.6 * a + 0.4 * a * Math.sin(performance.now() * 0.004);
      this.updateGameOverText(state);
      // Keep lingering explosions drawing over the fade.
      this.updateExplosions(deltaMs);
      return;
    }

    if (!drawsEntities) return;

    // Background boss health bar + name label
    if (extras.boss && extras.boss.isAlive) {
      this.drawBossHealth(extras.boss);
      const name = extras.boss.displayName ?? "BOSS";
      this.bossNameText.text = name;
      this.bossNameText.style.fill = extras.boss.colorPrimary ?? COLOR.boss;
      this.bossNameText.visible = true;
    } else {
      this.bossNameText.visible = false;
    }

    // Entities
    for (const pu of extras.powerUps) this.drawPowerUp(pu);
    for (const e of extras.enemies) this.drawEnemy(e);
    if (extras.boss && extras.boss.isAlive) this.drawBoss(extras.boss);
    for (const p of extras.playerProjectiles) this.drawProjectile(p, true);
    for (const p of extras.enemyProjectiles) this.drawProjectile(p, false);

    if (state.playerState.isAlive) this.drawPlayer(state.playerState, extras.playerBlueprint);
    if (state.playerState.isAlive && state.playerState.megaLaserMs > 0) {
      this.drawMegaLaser(state.playerState);
    }

    // Pause scrim drawn on top of the frozen gameplay layer.
    if (isPause) {
      this.pauseOverlay
        .rect(0, 0, this.width, this.height)
        .fill({ color: 0x000014, alpha: 0.65 });
      this.updatePauseMenu(extras.menuSelection);
      this.promptText.alpha = 0.6 + 0.4 * Math.sin(performance.now() * 0.004);
    }

    // FX
    this.updateExplosions(deltaMs);
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - deltaMs);
      const alpha = (this.hitFlashTimer / 200) * 0.4;
      this.fxGfx.rect(0, 0, this.width, this.height).fill({ color: 0xff2244, alpha });
    }

    this.updateHud(state, extras.bombCredits);
  }

  // ── FX API ───────────────────────────────────────────────────────────────

  showExplosion(x: number, y: number, color = 0xffaa33, radius = 40): void {
    this.explosions.push({ x, y, age: 0, maxAge: 450, color, radius });
  }

  /** Cluster of offset puffs for enemy / boss defeat. */
  showEnemyDefeated(x: number, y: number, enemyType: Enemy["type"] | "boss"): void {
    if (enemyType === "boss") {
      this.showExplosion(x, y, 0xff3366, 140);
      this.showExplosion(x - 30, y + 20, 0xffaa33, 110);
      this.showExplosion(x + 26, y - 18, 0xffffff, 100);
      this.showExplosion(x - 10, y - 30, 0xff66aa, 120);
      this.showExplosion(x + 18, y + 26, 0xffdd33, 95);
      return;
    }
    const baseCol =
      enemyType === "grunt" ? 0xff5566
        : enemyType === "spinner" ? 0xffaa44
          : 0xcc66ff;
    this.showExplosion(x, y, baseCol, 50);
    this.showExplosion(x - 10, y + 8, 0xffaa33, 36);
    this.showExplosion(x + 10, y - 6, 0xffffff, 30);
  }

  /** Collection FX: expanding ring + floating label. */
  showPowerUpCollected(x: number, y: number, type: PowerUpType): void {
    const color: number = POWER_UP_VISUAL[type].color;
    let label = "";
    switch (type) {
      case "weapon-upgrade":
        label = "GUN+";
        break;
      case "shield":
        label = "SHIELD";
        break;
      case "extra-life":
        label = "+LIFE";
        break;
      case "health-recovery":
        label = "+HP";
        break;
      case "speed-boost":
        label = "SPEED!";
        break;
      case "weapon-spread":
        label = "SPREAD";
        break;
      case "weapon-bomb":
        label = "BOMB";
        break;
      case "mega-laser":
        label = "MEGA LASER!!";
        break;
    }
    this.ringPulses.push({ x, y, age: 0, maxAge: 500, color, maxRadius: 52 });

    const txt = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 20,
        fill: color,
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    txt.anchor.set(0.5, 0.5);
    txt.x = x;
    txt.y = y;
    this.fxLayer.addChild(txt);
    this.floatingTexts.push({ text: txt, age: 0, maxAge: 900, vy: -60 });
  }

  /** Shows a full-screen level banner for `durationMs`. */
  showLevelBanner(title: string, subtitle: string, durationMs = 1800): void {
    this.bannerTitleText.text = title;
    this.bannerSubText.text = subtitle;
    this.bannerTitleText.visible = true;
    this.bannerSubText.visible = true;
    this.bannerAgeMs = 0;
    this.bannerMaxAgeMs = durationMs;
  }

  showHitFlash(): void {
    this.hitFlashTimer = 200;
  }

  /**
   * Panic-bomb FX centred on the ship: one massive layered core burst +
   * six satellite bursts arranged in a hex ring + an expanding shockwave.
   * Meant to make the player feel like they just cleared the airspace.
   */
  showPlayerBomb(x: number, y: number, radius: number): void {
    // Layered core: hot white → amber → red-orange, overlapped so the
    // blend looks like a single rolling fireball instead of a disc.
    this.showExplosion(x, y, 0xffffff, radius * 0.95);
    this.showExplosion(x, y, 0xffdd55, radius * 0.75);
    this.showExplosion(x, y, 0xff6633, radius * 1.1);
    // Six satellite bursts in a hex ring around the ship.
    const satRadius = radius * 0.55;
    const satSize = radius * 0.45;
    const satColors = [0xffdd55, 0xff8844, 0xffffff, 0xffaa33, 0xff66aa, 0xffeeaa];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 12;
      const sx = x + Math.cos(a) * satRadius;
      const sy = y + Math.sin(a) * satRadius;
      this.showExplosion(sx, sy, satColors[k] ?? 0xffaa33, satSize);
    }
    // Expanding shockwave.
    this.ringPulses.push({
      x,
      y,
      age: 0,
      maxAge: 650,
      color: 0xffdd55,
      maxRadius: radius * 1.35,
    });
  }

  /**
   * Cannon round impact FX — two overlapping shockwave rings (white outer,
   * red inner) + a starburst of red spokes. Different silhouette from
   * the generic bullet hit flash so the player can tell the heavy round
   * apart from regular fire.
   */
  showCannonImpact(x: number, y: number): void {
    this.ringPulses.push({
      x,
      y,
      age: 0,
      maxAge: 520,
      color: 0xffffff,
      maxRadius: 70,
    });
    this.ringPulses.push({
      x,
      y,
      age: 0,
      maxAge: 640,
      color: 0xff3344,
      maxRadius: 95,
    });
    // Six red spokes via the spark FX, longer + hotter than a laser spark.
    this.sparks.push({
      x,
      y,
      age: 0,
      maxAge: 260,
      color: 0xff4466,
      size: 28,
      rot: 0,
    });
    this.sparks.push({
      x,
      y,
      age: 0,
      maxAge: 260,
      color: 0xffffff,
      size: 22,
      rot: Math.PI / 4,
    });
  }

  /**
   * Short-lived radiating spark for mega-laser impacts on enemy hulls.
   * Hot white core + four spokes that grow + fade over ~170ms.
   */
  showLaserSpark(x: number, y: number, color = 0xffffaa): void {
    this.sparks.push({
      x,
      y,
      age: 0,
      maxAge: 170,
      color,
      size: 14 + Math.random() * 6,
      rot: Math.random() * Math.PI,
    });
  }

  resetFx(): void {
    this.explosions.length = 0;
    this.ringPulses.length = 0;
    this.sparks.length = 0;
    for (const f of this.floatingTexts) f.text.destroy();
    this.floatingTexts.length = 0;
    this.hitFlashTimer = 0;
    this.bannerAgeMs = 0;
    this.bannerMaxAgeMs = 0;
    this.bannerTitleText.visible = false;
    this.bannerSubText.visible = false;
  }

  /** Called by GameManager when the screen transitions to "game-over". */
  beginGameOverFade(): void {
    this.gameOverFadeMs = 0;
  }

  resetGameOverFade(): void {
    this.gameOverFadeMs = 0;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private drawMenuShip(): void {
    // Large ship silhouette under the title
    const cx = this.width / 2;
    const cy = this.height / 2 + 260;
    this.entityGfx
      .poly([
        cx + 120, cy,
        cx - 80, cy - 40,
        cx - 40, cy,
        cx - 80, cy + 40,
      ])
      .fill({ color: COLOR.player, alpha: 0.85 })
      .stroke({ color: COLOR.playerAccent, width: 2 });
    this.entityGfx
      .rect(cx - 30, cy - 8, 40, 16)
      .fill({ color: COLOR.playerAccent, alpha: 0.6 });
  }

  private drawPlayer(
    p: Readonly<PlayerState>,
    blueprint: PlayerBlueprintVisual | null,
  ): void {
    const { x, y } = p.position;
    const w = p.width;
    const h = p.height;
    const flicker = p.invulnerabilityTimer > 0 && Math.floor(p.invulnerabilityTimer / 80) % 2 === 0;
    if (flicker) return;

    if (blueprint && blueprint.placements.length > 0) {
      // Assembled silhouette from the equipped blueprint. Placements carry
      // world offsets from the root core; drawPartVisual handles the per-kind
      // look. Rendered at 1:1 since shape/socket offsets are already in pixels.
      for (const pl of blueprint.placements) {
        this.drawPartVisual(
          this.entityGfx,
          pl.visualKind,
          x + pl.worldX,
          y + pl.worldY,
          pl.shape.width,
          pl.shape.height,
          pl.colour,
          1,
        );
      }
    } else {
      // Default arrowhead used when no blueprint is equipped (arcade default).
      this.entityGfx
        .poly([
          x + w / 2, y,
          x - w / 2, y - h / 2,
          x - w / 4, y,
          x - w / 2, y + h / 2,
        ])
        .fill({ color: COLOR.player });
      this.entityGfx
        .rect(x - w / 4, y - 3, w / 2, 6)
        .fill({ color: COLOR.playerAccent });
    }

    // Engine glow — bigger + brighter while a speed boost is active.
    const boosting = p.speedBoostMs > 0;
    const engineLen = boosting ? 18 + 6 * Math.sin(performance.now() * 0.03) : 6;
    const engineH = boosting ? 14 : 8;
    this.entityGfx
      .rect(x - w / 2 - engineLen, y - engineH / 2, engineLen, engineH)
      .fill({ color: COLOR.hudAmber, alpha: 0.85 });
    if (boosting) {
      // Outer flame tail
      this.entityGfx
        .poly([
          x - w / 2 - engineLen, y - engineH / 2,
          x - w / 2 - engineLen - 10, y,
          x - w / 2 - engineLen, y + engineH / 2,
        ])
        .fill({ color: 0xffdd88, alpha: 0.7 });
    }

    // ── Gun(s) on the nose — art depends on weapon type + upgrade level. ──
    this.drawPlayerGun(p);

    // Shield ring
    if (p.shield.active) {
      this.entityGfx
        .circle(x, y, Math.max(w, h) * 0.9)
        .stroke({ color: COLOR.shield, width: 2, alpha: 0.85 });
    }
  }

  /** Renders the weapon mounted on the player ship's nose. */
  private drawPlayerGun(p: Readonly<PlayerState>): void {
    const { x, y } = p.position;
    const w = p.width;
    const noseX = x + w / 2;
    const level = p.weapon.upgradeLevel;
    // Muzzle-flash when the last shot is very recent.
    const sinceShot = Math.max(0, performance.now() - p.weapon.lastFireTimeMs);
    const flashing = sinceShot < 80;

    switch (p.weapon.weaponType) {
      case "bullet": {
        // Barrel gets longer + stacks a second barrel at higher levels.
        const barrelLen = 10 + level * 2;
        this.entityGfx
          .rect(noseX - 2, y - 2, barrelLen, 4)
          .fill({ color: 0x99ddff });
        if (level >= 2) {
          this.entityGfx
            .rect(noseX - 2, y - 9, barrelLen - 2, 3)
            .fill({ color: 0x99ddff });
          this.entityGfx
            .rect(noseX - 2, y + 6, barrelLen - 2, 3)
            .fill({ color: 0x99ddff });
        }
        if (level >= 4) {
          // heatsink block
          this.entityGfx
            .rect(noseX - 4, y - 6, 4, 12)
            .fill({ color: 0x66aabb });
        }
        if (flashing) {
          this.entityGfx
            .circle(noseX + barrelLen, y, 4)
            .fill({ color: 0xffffff, alpha: 0.9 });
        }
        break;
      }
      case "spread": {
        // Fan of 3 (5 at L3+) small barrels
        const count = level >= 3 ? 5 : 3;
        const len = 10 + level;
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 4;
          const a = off * 0.04;
          drawRotatedRect(this.entityGfx,
            noseX + Math.cos(a) * len * 0.5,
            y + off + Math.sin(a) * len * 0.5,
            len, 2.5, a,
            { color: 0xffcc55 });
        }
        if (flashing) {
          this.entityGfx
            .circle(noseX + len, y, 5)
            .fill({ color: 0xffee99, alpha: 0.9 });
        }
        break;
      }
      case "bomb": {
        // Stubby chunky launcher
        const len = 12 + level * 2;
        this.entityGfx
          .rect(noseX - 2, y - 6, len, 12)
          .fill({ color: 0xff88aa })
          .stroke({ color: 0xffffff, width: 1 });
        this.entityGfx
          .circle(noseX + len, y, 4)
          .fill({ color: 0xff6699 });
        if (flashing) {
          this.entityGfx
            .circle(noseX + len, y, 8)
            .fill({ color: 0xffffff, alpha: 0.8 });
        }
        break;
      }
    }
  }

  /**
   * Renders the mega-laser beam: a full-width beam from the nose with a
   * bright core, bloom halo, and a spray of heat/sparks at the emitter.
   */
  private drawMegaLaser(p: Readonly<PlayerState>): void {
    const { x, y } = p.position;
    const w = p.width;
    const noseX = x + w / 2;
    const beamEnd = this.width + 120;
    const beamLen = beamEnd - noseX;
    const beamH = p.height * 1.8;

    // End-of-life fade (last 400ms).
    const fadeInMs = 180;
    const fadeOutMs = 400;
    const mlm = p.megaLaserMs;
    let alpha = 1;
    if (mlm < fadeOutMs) alpha = mlm / fadeOutMs;
    // Initial ramp-up (for the first fadeInMs we don't know total, estimate
    // from current mlm — good enough for visual flair).
    void fadeInMs;

    const t = performance.now() * 0.018;
    const flicker = 0.85 + 0.15 * Math.sin(t * 2.3);

    // Outer halo (wide, soft).
    this.fxGfx
      .rect(noseX, y - beamH, beamLen, beamH * 2)
      .fill({ color: 0xff4466, alpha: 0.18 * alpha * flicker });
    // Mid glow.
    this.fxGfx
      .rect(noseX, y - beamH * 0.7, beamLen, beamH * 1.4)
      .fill({ color: 0xff88aa, alpha: 0.28 * alpha * flicker });
    // Core beam.
    this.fxGfx
      .rect(noseX, y - beamH / 2, beamLen, beamH)
      .fill({ color: 0xffccdd, alpha: 0.75 * alpha * flicker });
    // Inner bright-white stripe.
    this.fxGfx
      .rect(noseX, y - beamH * 0.22, beamLen, beamH * 0.44)
      .fill({ color: 0xffffff, alpha: 0.9 * alpha });

    // Scan-line banding so it feels energetic.
    const bands = 6;
    const bandH = beamH / bands;
    for (let i = 0; i < bands; i++) {
      const dy = (i - (bands - 1) / 2) * bandH;
      const jitter = Math.sin(t * 1.7 + i * 0.9) * 0.3 + 0.4;
      this.fxGfx
        .rect(noseX, y + dy - 0.5, beamLen, 1.2)
        .fill({ color: 0xffffff, alpha: 0.25 * jitter * alpha });
    }

    // ── Heat shimmer + sparks at the emitter ──────────────────────────────
    const emitterR = beamH * 0.75;
    // Heat ring (pulsing).
    this.fxGfx
      .circle(noseX, y, emitterR * (0.9 + 0.1 * Math.sin(t * 3)))
      .fill({ color: 0xffaa33, alpha: 0.45 * alpha });
    this.fxGfx
      .circle(noseX, y, emitterR * 0.6)
      .fill({ color: 0xffffff, alpha: 0.9 * alpha });

    // Sparks: 8 radial streaks at random-ish angles.
    const sparkCount = 10;
    for (let i = 0; i < sparkCount; i++) {
      const ang = t * 0.8 + i * ((Math.PI * 2) / sparkCount);
      const len = 10 + Math.abs(Math.sin(t * 4 + i)) * 18;
      const sx = noseX + Math.cos(ang) * (emitterR * 0.8);
      const sy = y + Math.sin(ang) * (emitterR * 0.8);
      const ex = sx + Math.cos(ang) * len;
      const ey = sy + Math.sin(ang) * len;
      this.fxGfx
        .moveTo(sx, sy)
        .lineTo(ex, ey)
        .stroke({ color: 0xffee66, width: 2, alpha: 0.85 * alpha });
    }
    // Tiny dot sparks.
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + t * 1.4;
      const r = emitterR * (0.7 + Math.random() * 0.5);
      this.fxGfx
        .circle(noseX + Math.cos(ang) * r, y + Math.sin(ang) * r, 1.5)
        .fill({ color: 0xffffff, alpha: 0.9 * alpha });
    }
  }

  private drawEnemy(e: Readonly<Enemy>): void {
    const { x, y } = e.position;
    const w = e.width;
    const h = e.height;

    switch (e.type) {
      case "grunt":
        // Triangle pointing left
        this.entityGfx
          .poly([
            x - w / 2, y,
            x + w / 2, y - h / 2,
            x + w / 4, y,
            x + w / 2, y + h / 2,
          ])
          .fill({ color: COLOR.enemyGrunt });
        this.entityGfx
          .rect(x + w / 6, y - 3, w / 4, 6)
          .fill({ color: 0xffcccc });
        break;
      case "spinner": {
        // Rotating diamond
        const t = performance.now() * 0.004;
        const cs = Math.cos(t);
        const sn = Math.sin(t);
        const half = w / 2;
        const pts = [
          [0, -half],
          [half, 0],
          [0, half],
          [-half, 0],
        ].map(([px, py]) => [x + (px! * cs - py! * sn), y + (px! * sn + py! * cs)]);
        this.entityGfx
          .poly(pts.flat())
          .fill({ color: COLOR.enemySpinner })
          .stroke({ color: 0xffffaa, width: 2 });
        break;
      }
      case "stalker":
        // Jagged silhouette
        this.entityGfx
          .poly([
            x - w / 2, y,
            x - w / 4, y - h / 2,
            x + w / 4, y - h / 3,
            x + w / 2, y,
            x + w / 4, y + h / 3,
            x - w / 4, y + h / 2,
          ])
          .fill({ color: COLOR.enemyStalker })
          .stroke({ color: 0xddaaff, width: 2 });
        break;
      case "darter": {
        // Sleek arrowhead with dual fins
        const col = 0x00ddcc;
        drawTriangle(this.entityGfx, x, y, w * 0.55, Math.PI,
          { color: col }, { color: 0xaaffff, width: 2 });
        drawTriangle(this.entityGfx, x + w * 0.15, y - h * 0.35, w * 0.25, Math.PI * 0.85,
          { color: col, alpha: 0.85 });
        drawTriangle(this.entityGfx, x + w * 0.15, y + h * 0.35, w * 0.25, -Math.PI * 0.85,
          { color: col, alpha: 0.85 });
        drawCircle(this.entityGfx, x - w * 0.2, y, 4,
          { color: 0xffffff });
        break;
      }
      case "orbiter": {
        // Spinning hexagonal gyro
        const t = performance.now() * 0.003;
        drawHexagon(this.entityGfx, x, y, w * 0.5, t,
          { color: 0xff66aa }, { color: 0xffccdd, width: 2 });
        drawHexagon(this.entityGfx, x, y, w * 0.28, -t * 1.4,
          { color: 0x330022 }, { color: 0xffaacc, width: 1 });
        drawCircle(this.entityGfx, x, y, 4, { color: 0xffffff });
        break;
      }
      case "lancer": {
        // Long laser emitter — rectangular body + front pentagon
        const col = 0xff3366;
        drawRect(this.entityGfx, x, y, w * 0.9, h * 0.5,
          { color: 0x220011 }, { color: col, width: 2 });
        drawPentagon(this.entityGfx, x - w * 0.35, y, w * 0.3, -Math.PI / 2,
          { color: col }, { color: 0xffaacc, width: 2 });
        drawRect(this.entityGfx, x - w * 0.55, y, 6, 4, { color: 0xffffff });
        break;
      }
      case "torpedoer": {
        // Chunky launcher with two tubes
        const col = 0x33aa55;
        drawOctagon(this.entityGfx, x, y, w * 0.55, 0,
          { color: col }, { color: 0x88ffaa, width: 2 });
        drawRect(this.entityGfx, x - w * 0.35, y - h * 0.2, w * 0.25, 6,
          { color: 0x222222 }, { color: 0x88ffaa, width: 1 });
        drawRect(this.entityGfx, x - w * 0.35, y + h * 0.2, w * 0.25, 6,
          { color: 0x222222 }, { color: 0x88ffaa, width: 1 });
        drawCircle(this.entityGfx, x + w * 0.1, y, 5, { color: 0xffff88 });
        break;
      }
      case "cannoneer": {
        // Heavy armored cube with front barrel
        const col = 0xcc6622;
        drawRect(this.entityGfx, x, y, w * 0.8, h * 0.8,
          { color: col }, { color: 0xffcc88, width: 3 });
        drawRect(this.entityGfx, x - w * 0.35, y, w * 0.3, h * 0.35,
          { color: 0x332211 }, { color: 0xffcc88, width: 2 });
        drawCircle(this.entityGfx, x + w * 0.1, y, 6,
          { color: 0xffaa44 }, { color: 0xffffff, width: 1 });
        break;
      }
      case "pulsar": {
        // Pulsing octagon with inner rotating triangle
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.006);
        const t = performance.now() * 0.002;
        drawOctagon(this.entityGfx, x, y, w * 0.5 * pulse, t,
          { color: 0x8844ff, alpha: 0.35 });
        drawOctagon(this.entityGfx, x, y, w * 0.45, 0,
          { color: 0x6633cc }, { color: 0xccaaff, width: 2 });
        drawTriangle(this.entityGfx, x, y, w * 0.3, t * 2,
          { color: 0xccaaff });
        break;
      }
    }

    // Health bar for enemies below full HP
    if (e.health < e.maxHealth) {
      const barW = w;
      const pct = e.health / e.maxHealth;
      this.entityGfx
        .rect(x - barW / 2, y - h / 2 - 8, barW, 3)
        .fill({ color: 0x333333 });
      this.entityGfx
        .rect(x - barW / 2, y - h / 2 - 8, barW * pct, 3)
        .fill({ color: 0xff4455 });
    }
  }

  private drawBoss(b: Readonly<BossState>): void {
    const time = performance.now() * 0.001;

    // 1. Body art (layered composition from BossArt.ts).
    if (b.artId) {
      drawBossBody(this.entityGfx, b, time);
    } else {
      // Legacy fallback: simple shape if no artId wired up.
      const { x, y } = b.position;
      const w = b.width;
      const h = b.height;
      const phase = b.currentPhase;
      const primary = b.colorPrimary ?? COLOR.boss;
      const accent = b.colorAccent ?? COLOR.bossAccent;
      const col = phase === 0 ? primary : mixColor(primary, 0xffffff, 0.25);
      this.entityGfx
        .poly([
          x - w / 2, y,
          x - w / 4, y - h / 2,
          x + w / 2, y - h / 3,
          x + w / 2, y + h / 3,
          x - w / 4, y + h / 2,
        ])
        .fill({ color: col })
        .stroke({ color: accent, width: 3 });
    }

    // 1b. Charge-up tell. If the current phase defines a chargeMs window and
    // the boss is actively charging, render a big growing + flashing aura at
    // the weapon muzzle (left side of the boss, since bosses face the player).
    // The aura grows 40% → 130% of its max radius across the charge window,
    // warms yellow → red as it nears firing, and strobes in brightness so the
    // player can't miss the tell even in chaotic moments.
    const phase = b.movementPhases?.[b.currentPhase];
    const chargeMs = phase?.chargeMs;
    if (b.isCharging && chargeMs && chargeMs > 0) {
      const t = Math.min(1, (b.chargeProgressMs ?? 0) / chargeMs);
      const muzzleX = b.position.x - b.width / 2;
      const muzzleY = b.position.y;
      const strobe = 0.55 + 0.45 * Math.sin(time * 26);
      const isMegaMissile = phase?.attackPattern?.weaponKind === "mega-missile";

      if (isMegaMissile) {
        // Slowly assemble the missile at the muzzle: body extends outward,
        // warhead tip slides into place, exhaust halo brightens as it nears
        // firing. Uses t to drive length, brightness, and the warhead glow.
        const missileFullLen = 110 + b.width * 0.25;
        const thick = 22;
        const currentLen = missileFullLen * (0.25 + 0.9 * t);
        const bodyAlpha = 0.5 + 0.5 * t;
        const bodyCol = 0xaa2244;
        const warmCol = t < 0.5
          ? 0xffcc44
          : mixColor(0xffcc44, 0xff3333, (t - 0.5) * 2);

        // Tail exhaust halo builds
        this.fxGfx
          .circle(muzzleX + currentLen * 0.4, muzzleY, thick * (0.4 + t * 0.9))
          .fill({ color: 0xffaa33, alpha: 0.25 + 0.4 * t * strobe });

        // Body rectangle — anchor pivot at muzzleX (tip aims left at -π)
        const bodyCenterX = muzzleX - currentLen * 0.5;
        drawRotatedRect(
          this.fxGfx,
          bodyCenterX,
          muzzleY,
          currentLen,
          thick,
          Math.PI,
          { color: bodyCol, alpha: bodyAlpha },
          { color: 0xffffff, width: 2, alpha: bodyAlpha },
        );
        // Warhead triangle tip — fades in / glows strobe
        const noseX = muzzleX - currentLen;
        drawTriangle(
          this.fxGfx,
          noseX,
          muzzleY,
          thick * 1.1,
          Math.PI,
          { color: warmCol, alpha: 0.6 + 0.4 * strobe },
          { color: 0xffffff, width: 2, alpha: bodyAlpha },
        );
        // Inner warhead pulse
        this.fxGfx
          .circle(noseX + thick * 0.2, muzzleY, thick * 0.45 * (0.6 + 0.6 * t * strobe))
          .fill({ color: 0xffffff, alpha: 0.3 + 0.6 * t * strobe });
        // Loading rail bars that fade as missile approaches full length
        const railAlpha = 0.7 * (1 - t) + 0.2;
        for (let k = -1; k <= 1; k += 2) {
          this.fxGfx
            .moveTo(muzzleX, muzzleY + k * (thick * 0.9))
            .lineTo(muzzleX - missileFullLen * 1.05, muzzleY + k * (thick * 0.9))
            .stroke({ color: warmCol, width: 2, alpha: railAlpha * strobe });
        }
      } else {
        // Generic charge aura: growing ring + starburst spikes + strobing core.
        const maxR = 60 + b.width * 0.35;
        const outerR = maxR * (0.4 + t * 0.9);
        const warmCol = t < 0.5
          ? 0xffee66
          : mixColor(0xffee66, 0xff3333, (t - 0.5) * 2);
        this.fxGfx
          .circle(muzzleX, muzzleY, outerR)
          .stroke({
            color: warmCol,
            width: 3 + t * 2,
            alpha: 0.4 + 0.5 * strobe,
          });
        this.fxGfx
          .circle(muzzleX, muzzleY, outerR * 0.45 * (0.85 + strobe * 0.2))
          .fill({ color: 0xffffff, alpha: 0.25 + 0.55 * strobe });
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + time * 1.5;
          const len = outerR * 1.1;
          this.fxGfx
            .moveTo(muzzleX, muzzleY)
            .lineTo(muzzleX + Math.cos(a) * len, muzzleY + Math.sin(a) * len)
            .stroke({ color: warmCol, width: 2, alpha: 0.25 + 0.4 * strobe });
        }
      }
    }

    // 2. Parts (turrets / armor / core). Each carries its own HP + visual cue.
    if (b.parts && b.parts.length > 0) {
      for (const part of b.parts) {
        if (!part.isAlive) continue;
        this.drawBossPart(part);
      }
      // Small HP pips above each surviving part (visual cue for "alive").
      for (const part of b.parts) {
        if (!part.isAlive) continue;
        const pct = part.health / part.maxHealth;
        if (pct >= 1) continue;
        const barW = Math.max(part.width, 24);
        this.entityGfx
          .rect(part.position.x - barW / 2, part.position.y - part.height / 2 - 7, barW, 2)
          .fill({ color: 0x222233, alpha: 0.8 });
        this.entityGfx
          .rect(part.position.x - barW / 2, part.position.y - part.height / 2 - 7, barW * pct, 2)
          .fill({ color: 0xff4455 });
      }
    }
  }

  private drawBossPart(part: Readonly<import("../types/index").BossPart>): void {
    const { x, y } = part.position;
    const time = performance.now() * 0.001;

    switch (part.kind) {
      case "core": {
        // Weak point — pulsing bright core ring, always stands out.
        const pulse = 0.6 + 0.4 * Math.sin(time * 6);
        this.entityGfx
          .circle(x, y, Math.max(part.width, part.height) * 0.55 + pulse * 4)
          .stroke({ color: 0xffffff, width: 3, alpha: 0.7 * pulse });
        this.entityGfx
          .circle(x, y, Math.max(part.width, part.height) * 0.45)
          .fill({ color: part.accent });
        this.entityGfx
          .circle(x, y, Math.max(part.width, part.height) * 0.3)
          .fill({ color: part.color })
          .stroke({ color: 0xffffff, width: 2 });
        // "WEAK POINT" pip
        this.entityGfx
          .circle(x, y, 4)
          .fill({ color: 0xffffff });
        break;
      }
      case "turret": {
        // Hex turret with barrel
        drawHexagon(this.entityGfx, x, y, part.width * 0.55, 0,
          { color: part.color }, { color: part.accent, width: 2 });
        drawRect(this.entityGfx, x - part.width * 0.4, y, part.width * 0.45, 4,
          { color: part.accent });
        drawCircle(this.entityGfx, x, y, 4, { color: 0xffdd88 });
        break;
      }
      case "armor": {
        // Plated rectangle — shieldsCore parts get a subtle golden shimmer
        const shieldAlpha = part.shieldsCore
          ? 0.25 + 0.1 * Math.sin(time * 3)
          : 0;
        if (shieldAlpha > 0) {
          drawRect(this.entityGfx, x, y, part.width + 6, part.height + 6,
            { color: 0xffdd33, alpha: shieldAlpha });
        }
        drawRect(this.entityGfx, x, y, part.width, part.height,
          { color: part.color }, { color: part.accent, width: 2 });
        // Rivet detail
        for (let i = -1; i <= 1; i += 2) {
          drawCircle(this.entityGfx, x + (part.width * 0.4 * i), y - part.height * 0.3, 2,
            { color: part.accent });
          drawCircle(this.entityGfx, x + (part.width * 0.4 * i), y + part.height * 0.3, 2,
            { color: part.accent });
        }
        break;
      }
    }
  }

  private drawBossHealth(b: Readonly<BossState>): void {
    const barX = 20;
    const barY = this.height / 2 - 180;
    const barW = 12;
    const barH = 360;
    const pct = Math.max(0, b.health / b.maxHealth);
    const barColor = b.colorPrimary ?? (b.currentPhase === 0 ? COLOR.boss : 0xffaa33);

    this.hudBgGfx.rect(barX, barY, barW, barH).fill({ color: 0x222233, alpha: 0.8 });
    this.hudBgGfx
      .rect(barX, barY + barH * (1 - pct), barW, barH * pct)
      .fill({ color: barColor });
  }

  private drawProjectile(p: Readonly<Projectile>, fromPlayer: boolean): void {
    const { x, y } = p.position;
    const kind = p.kind ?? "bullet";
    const angle = Math.atan2(p.velocity.y, p.velocity.x);
    const defaultCol = fromPlayer ? COLOR.playerProjectile : COLOR.enemyProjectile;

    switch (kind) {
      case "laser": {
        const col = fromPlayer ? 0x88ffff : 0xff4466;
        drawRotatedRect(this.entityGfx, x, y, p.width, p.height, angle,
          { color: col, alpha: 0.35 });
        drawRotatedRect(this.entityGfx, x, y, p.width, Math.max(2, p.height * 0.5), angle,
          { color: 0xffffff, alpha: 0.95 });
        break;
      }
      case "torpedo": {
        const col = fromPlayer ? 0x66ff88 : 0xffaa55;
        const r = Math.max(p.width, p.height) * 0.5;
        const tailAngle = angle + Math.PI;
        const tx = x + Math.cos(tailAngle) * r * 1.6;
        const ty = y + Math.sin(tailAngle) * r * 1.6;
        this.entityGfx
          .circle(tx, ty, r * 0.55)
          .fill({ color: 0xffdd88, alpha: 0.5 });
        drawRotatedRect(this.entityGfx, x, y, r * 2.4, r * 0.9, angle,
          { color: 0x333344 }, { color: col, width: 2 });
        drawTriangle(this.entityGfx, x, y, r * 1.1, angle,
          { color: col });
        break;
      }
      case "cannon": {
        const col = fromPlayer ? 0xffcc33 : 0xff5533;
        const r = Math.max(p.width, p.height) * 0.5;
        this.entityGfx
          .circle(x, y, r * 1.6)
          .fill({ color: col, alpha: 0.2 });
        this.entityGfx
          .circle(x, y, r)
          .fill({ color: col })
          .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
        this.entityGfx
          .circle(x, y, r * 0.45)
          .fill({ color: 0xfff0cc, alpha: 0.95 });
        break;
      }
      case "pulse-bolt": {
        const col = fromPlayer ? 0xaa88ff : 0xff66cc;
        const pulse = 0.6 + 0.4 * Math.sin(((p.ageMs ?? 0) / 60));
        const r = Math.max(p.width, p.height) * 0.5;
        this.entityGfx
          .circle(x, y, r * (1.4 + pulse * 0.6))
          .fill({ color: col, alpha: 0.25 });
        this.entityGfx
          .circle(x, y, r)
          .fill({ color: col })
          .stroke({ color: 0xffffff, width: 1, alpha: 0.8 });
        break;
      }
      case "charge-beam": {
        // Long tapered beam trailing the tip
        const col = 0xff4488;
        const len = p.width * 1.6;
        drawRotatedRect(this.entityGfx, x, y, len, p.height * 1.2, angle,
          { color: col, alpha: 0.4 });
        drawRotatedRect(this.entityGfx, x, y, len, p.height * 0.5, angle,
          { color: 0xffffff, alpha: 0.95 });
        // Leading glow dot
        this.entityGfx
          .circle(x + Math.cos(angle) * len * 0.5, y + Math.sin(angle) * len * 0.5, 6)
          .fill({ color: 0xffffff, alpha: 0.85 });
        break;
      }
      case "mega-missile": {
        // Heavy missile: long body, glowing warhead tip, exhaust flame trail.
        const bodyCol = 0xaa2244;
        const warheadCol = 0xffee66;
        const t = performance.now() * 0.004;
        const flicker = 0.7 + 0.3 * Math.sin(t * 8);
        const len = Math.max(p.width, 80);
        const thick = Math.max(p.height, 22);
        // Exhaust halo trailing the tail
        const tailX = x - Math.cos(angle) * len * 0.5;
        const tailY = y - Math.sin(angle) * len * 0.5;
        this.entityGfx
          .circle(tailX, tailY, thick * 1.1 * flicker)
          .fill({ color: 0xffaa33, alpha: 0.35 });
        this.entityGfx
          .circle(tailX, tailY, thick * 0.65 * flicker)
          .fill({ color: 0xffffdd, alpha: 0.7 });
        // Body
        drawRotatedRect(this.entityGfx, x, y, len * 0.85, thick, angle,
          { color: bodyCol }, { color: 0xffffff, width: 2 });
        // Warhead nose (bright triangle pointing in velocity direction)
        const noseX = x + Math.cos(angle) * len * 0.42;
        const noseY = y + Math.sin(angle) * len * 0.42;
        drawTriangle(this.entityGfx, noseX, noseY, thick * 1.1, angle,
          { color: warheadCol }, { color: 0xffffff, width: 2 });
        // Warhead inner glow
        this.entityGfx
          .circle(noseX - Math.cos(angle) * thick * 0.2, noseY - Math.sin(angle) * thick * 0.2, thick * 0.45 * flicker)
          .fill({ color: 0xffffff, alpha: 0.85 });
        // Fins — two small rectangles perpendicular near tail
        const finOffX = Math.cos(angle + Math.PI / 2) * thick * 0.9;
        const finOffY = Math.sin(angle + Math.PI / 2) * thick * 0.9;
        const finBaseX = x - Math.cos(angle) * len * 0.3;
        const finBaseY = y - Math.sin(angle) * len * 0.3;
        drawRotatedRect(this.entityGfx, finBaseX + finOffX, finBaseY + finOffY,
          thick * 0.6, thick * 0.3, angle,
          { color: bodyCol }, { color: 0xffffff, width: 1 });
        drawRotatedRect(this.entityGfx, finBaseX - finOffX, finBaseY - finOffY,
          thick * 0.6, thick * 0.3, angle,
          { color: bodyCol }, { color: 0xffffff, width: 1 });
        break;
      }
      case "prox-bomb": {
        // Pulsing canister with trigger halo
        const pulse = 0.6 + 0.4 * Math.sin(((p.ageMs ?? 0) / 80));
        const r = Math.max(p.width, p.height) * 0.55;
        this.entityGfx
          .circle(x, y, (p.proxTriggerRadius ?? 80) * 0.15 * pulse)
          .stroke({ color: 0xff6699, width: 2, alpha: 0.4 * pulse });
        drawOctagon(this.entityGfx, x, y, r, (p.ageMs ?? 0) * 0.008,
          { color: 0xff6699 }, { color: 0xffffff, width: 2 });
        this.entityGfx
          .circle(x, y, r * 0.4)
          .fill({ color: 0xffffff, alpha: 0.9 * pulse });
        break;
      }
      default: {
        const col = defaultCol;
        this.entityGfx
          .rect(x - p.width / 2, y - p.height / 2, p.width, p.height)
          .fill({ color: col });
        this.entityGfx
          .rect(x - p.width / 2 - 2, y - p.height / 2 - 1, p.width + 4, p.height + 2)
          .fill({ color: col, alpha: 0.25 });
      }
    }
  }

  private drawPowerUp(pu: Readonly<PowerUp>): void {
    const { x, y } = pu.position;
    const def = POWER_UP_VISUAL[pu.type];
    const tSec = performance.now() / 1000;
    const intensity = pulseIntensity(def.pulseShape, def.pulseHz, tSec);

    this.drawPulseGlow(x, y, def.color, intensity);

    switch (pu.type) {
      case "extra-life":
        this.drawHeartPowerUp(x, y, def.color);
        break;
      case "health-recovery":
        this.drawCrossPowerUp(x, y, def.color);
        break;
      case "shield":
        this.drawPentagonPowerUp(x, y, def.color, tSec);
        break;
      case "weapon-upgrade":
        this.drawChevronPowerUp(x, y, def.color);
        break;
      case "weapon-spread":
        this.drawTridentPowerUp(x, y, def.color);
        break;
      case "weapon-bomb":
        this.drawCrosshairPowerUp(x, y, def.color);
        break;
      case "mega-laser":
        this.drawDiamondPowerUp(x, y, def.color, intensity);
        break;
      case "speed-boost":
        this.drawDoubleChevronPowerUp(x, y, def.color);
        break;
    }
  }

  /** Shared pulsing halo behind every power-up icon. */
  private drawPulseGlow(x: number, y: number, color: number, intensity: number): void {
    const rOuter = 18 + intensity * 6;
    const rInner = 12 + intensity * 3;
    this.entityGfx.circle(x, y, rOuter).fill({ color, alpha: 0.08 + intensity * 0.12 });
    this.entityGfx.circle(x, y, rInner).fill({ color, alpha: 0.18 + intensity * 0.18 });
  }

  private drawHeartPowerUp(x: number, y: number, color: number): void {
    // Heart = two circles + a downward-pointing triangle. Position tuned so
    // the two lobes read clearly at 24x24.
    this.entityGfx.circle(x - 4, y - 3, 5).fill({ color });
    this.entityGfx.circle(x + 4, y - 3, 5).fill({ color });
    this.entityGfx
      .poly([x - 8, y - 1, x + 8, y - 1, x, y + 9])
      .fill({ color });
    // Highlight spark on the upper-left lobe for depth.
    this.entityGfx.circle(x - 5, y - 4, 1.5).fill({ color: 0xffffff, alpha: 0.85 });
  }

  private drawCrossPowerUp(x: number, y: number, color: number): void {
    // Medical cross — two rectangles forming a plus sign.
    const arm = 3;
    const len = 10;
    this.entityGfx.rect(x - arm, y - len, arm * 2, len * 2).fill({ color });
    this.entityGfx.rect(x - len, y - arm, len * 2, arm * 2).fill({ color });
    // Thin stroke in white for contrast on dark bg.
    this.entityGfx
      .rect(x - arm, y - len, arm * 2, len * 2)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
    this.entityGfx
      .rect(x - len, y - arm, len * 2, arm * 2)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
  }

  private drawPentagonPowerUp(x: number, y: number, color: number, tSec: number): void {
    // Slowly rotating pentagon with an inner ring — shield identity.
    const rot = tSec * 0.6;
    const r = 10;
    const pts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = rot + i * ((Math.PI * 2) / 5) - Math.PI / 2;
      pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    this.entityGfx.poly(pts).fill({ color, alpha: 0.85 });
    this.entityGfx.poly(pts).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    this.entityGfx.circle(x, y, 4).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
  }

  private drawChevronPowerUp(x: number, y: number, color: number): void {
    // Up-chevron (weapon upgrade = tier up). Two stacked triangles.
    this.entityGfx
      .poly([x - 9, y + 2, x, y - 7, x + 9, y + 2, x + 5, y + 2, x, y - 2, x - 5, y + 2])
      .fill({ color });
    this.entityGfx
      .poly([x - 9, y + 8, x, y - 1, x + 9, y + 8, x + 5, y + 8, x, y + 4, x - 5, y + 8])
      .fill({ color, alpha: 0.85 });
  }

  private drawTridentPowerUp(x: number, y: number, color: number): void {
    // Three-prong fan — spread shot identity.
    for (let i = -1; i <= 1; i++) {
      const tipX = x + i * 6;
      this.entityGfx
        .poly([tipX - 2, y + 8, tipX + 2, y + 8, tipX, y - 9])
        .fill({ color });
    }
    this.entityGfx.rect(x - 7, y + 6, 14, 3).fill({ color });
  }

  private drawCrosshairPowerUp(x: number, y: number, color: number): void {
    // Circle + crosshair reticle — bomb identity.
    this.entityGfx.circle(x, y, 9).stroke({ color, width: 2 });
    this.entityGfx.circle(x, y, 5).fill({ color, alpha: 0.7 });
    this.entityGfx.rect(x - 10, y - 0.5, 7, 1.5).fill({ color });
    this.entityGfx.rect(x + 3, y - 0.5, 7, 1.5).fill({ color });
    this.entityGfx.rect(x - 0.5, y - 10, 1.5, 7).fill({ color });
    this.entityGfx.rect(x - 0.5, y + 3, 1.5, 7).fill({ color });
  }

  private drawDiamondPowerUp(x: number, y: number, color: number, intensity: number): void {
    // Rotated square (diamond) with a beam stripe — mega-laser identity.
    const r = 10;
    this.entityGfx
      .poly([x, y - r, x + r, y, x, y + r, x - r, y])
      .fill({ color, alpha: 0.3 + intensity * 0.5 });
    this.entityGfx
      .poly([x, y - r, x + r, y, x, y + r, x - r, y])
      .stroke({ color: 0xffffff, width: 1.5 });
    // Horizontal beam stripe through the centre.
    this.entityGfx.rect(x - r, y - 1, r * 2, 2).fill({ color: 0xffffff, alpha: 0.9 });
  }

  private drawDoubleChevronPowerUp(x: number, y: number, color: number): void {
    // Double chevron "≫" — speed identity.
    for (let i = 0; i < 2; i++) {
      const ox = -5 + i * 6;
      this.entityGfx
        .poly([x + ox - 4, y - 7, x + ox + 4, y, x + ox - 4, y + 7, x + ox - 1, y, x + ox - 4, y - 3])
        .fill({ color });
    }
  }

  private updateExplosions(deltaMs: number): void {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i]!;
      e.age += deltaMs;
      if (e.age >= e.maxAge) {
        this.explosions.splice(i, 1);
        continue;
      }
      const t = e.age / e.maxAge;
      const r = e.radius * (0.3 + t * 1.1);
      this.fxGfx
        .circle(e.x, e.y, r)
        .stroke({ color: e.color, width: 3, alpha: 1 - t });
      this.fxGfx
        .circle(e.x, e.y, r * 0.5)
        .fill({ color: e.color, alpha: (1 - t) * 0.5 });
    }

    // Laser-impact sparks: radiating spokes + hot core.
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.age += deltaMs;
      if (s.age >= s.maxAge) {
        this.sparks.splice(i, 1);
        continue;
      }
      const t = s.age / s.maxAge;
      const alpha = 1 - t;
      const len = s.size * (0.4 + t * 1.1);
      // Four radiating spokes (× two perpendicular pairs rotated by s.rot).
      for (let k = 0; k < 4; k++) {
        const a = s.rot + k * (Math.PI / 2);
        const ex = s.x + Math.cos(a) * len;
        const ey = s.y + Math.sin(a) * len;
        this.fxGfx
          .moveTo(s.x, s.y)
          .lineTo(ex, ey)
          .stroke({ color: s.color, width: 2, alpha });
      }
      this.fxGfx
        .circle(s.x, s.y, s.size * 0.35 * (1 - t * 0.5))
        .fill({ color: 0xffffff, alpha: alpha * 0.9 });
    }

    // Ring pulses
    for (let i = this.ringPulses.length - 1; i >= 0; i--) {
      const rp = this.ringPulses[i]!;
      rp.age += deltaMs;
      if (rp.age >= rp.maxAge) {
        this.ringPulses.splice(i, 1);
        continue;
      }
      const t = rp.age / rp.maxAge;
      const r = rp.maxRadius * t;
      this.fxGfx
        .circle(rp.x, rp.y, r)
        .stroke({ color: rp.color, width: 4, alpha: 1 - t });
      this.fxGfx
        .circle(rp.x, rp.y, r * 0.6)
        .stroke({ color: 0xffffff, width: 2, alpha: (1 - t) * 0.7 });
    }

    // Floating texts
    const dt = deltaMs / 1_000;
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i]!;
      f.age += deltaMs;
      if (f.age >= f.maxAge) {
        f.text.destroy();
        this.floatingTexts.splice(i, 1);
        continue;
      }
      const t = f.age / f.maxAge;
      f.text.y += f.vy * dt;
      f.text.alpha = 1 - t;
      f.text.scale.set(1 + t * 0.3);
    }

    // Banner
    if (this.bannerMaxAgeMs > 0) {
      this.bannerAgeMs += deltaMs;
      if (this.bannerAgeMs >= this.bannerMaxAgeMs) {
        this.bannerTitleText.visible = false;
        this.bannerSubText.visible = false;
        this.bannerMaxAgeMs = 0;
      } else {
        const t = this.bannerAgeMs / this.bannerMaxAgeMs;
        // Fade in quick, hold, fade out.
        let a = 1;
        if (t < 0.15) a = t / 0.15;
        else if (t > 0.8) a = 1 - (t - 0.8) / 0.2;
        this.bannerTitleText.alpha = a;
        this.bannerSubText.alpha = a;
        const pulse = 1 + 0.08 * Math.sin(performance.now() * 0.01);
        this.bannerTitleText.scale.set(pulse);
      }
    }
  }

  private updateHud(state: Readonly<GameState>, bombCredits: number): void {
    const run = state.currentRunStats;
    const player = state.playerState;
    this.scoreText.text = `SCORE ${run.score}`;
    this.levelText.text = `LEVEL ${state.levelState.levelNumber}`;
    this.livesText.text = `LIVES ${player.lives}`;
    this.healthText.text = `HP ${player.health}`;
    this.shieldText.text = player.shield.active ? "SHIELD ON" : "";
    this.hitsText.text = `HITS ${run.consecutiveHits}`;
    const gun = "I".repeat(Math.max(1, Math.min(5, player.weapon.upgradeLevel)));
    this.weaponText.text = `GUN ${gun}`;
    this.bombsText.text = bombCredits > 0 ? `BOMBS ${bombCredits}` : "";
  }

  /**
   * Draws the campaign starmap: node dots + connecting paths + labels.
   *
   * Edges go first so dots draw on top. Locked nodes are rendered dimmed,
   * the current node has an outer halo, and the selected node gets a
   * thicker amber ring.
   */
  private drawStarmap(data: StarmapRenderData): void {
    const g = this.starmapGfx;
    g.clear();

    // Edges
    for (const e of data.edges) {
      const color = e.unlocked ? 0x446688 : 0x223344;
      const alpha = e.unlocked ? 0.75 : 0.35;
      g.moveTo(e.fromX, e.fromY).lineTo(e.toX, e.toY).stroke({ color, width: 2, alpha });
    }

    // Nodes — one circle per node, with halo / rings layered as needed.
    for (const n of data.nodes) {
      const baseColor = n.completed
        ? 0x44cc66
        : n.unlocked
          ? 0x33ccff
          : 0x556677;
      const alpha = n.unlocked ? 1 : 0.45;

      if (n.current) {
        g.circle(n.x, n.y, 22).fill({ color: 0x336699, alpha: 0.35 });
      }
      if (n.selected) {
        g.circle(n.x, n.y, 18).stroke({ color: COLOR.hudAmber, width: 3, alpha: 1 });
      }
      g.circle(n.x, n.y, 10).fill({ color: baseColor, alpha });
      g.circle(n.x, n.y, 10).stroke({ color: 0xffffff, width: 1, alpha: alpha * 0.7 });
    }

    // Node labels — reuse a pool of Text objects sized to the node list.
    while (this.starmapNodeLabels.length < data.nodes.length) {
      const t = new Text({
        text: "",
        style: new TextStyle({
          fontFamily: "monospace",
          fontSize: 14,
          fill: COLOR.hudWhite,
          fontWeight: "bold",
        }),
      });
      t.anchor.set(0.5, 0);
      this.menuLayer.addChild(t);
      this.starmapNodeLabels.push(t);
    }
    for (let i = 0; i < this.starmapNodeLabels.length; i++) {
      const t = this.starmapNodeLabels[i]!;
      const n = data.nodes[i];
      if (!n) {
        t.visible = false;
        continue;
      }
      t.visible = true;
      t.text = n.unlocked ? n.name : "???";
      t.style.fill = n.selected ? COLOR.hudAmber : n.completed ? 0x99ffaa : COLOR.hudWhite;
      t.alpha = n.unlocked ? 1 : 0.5;
      t.x = n.x;
      t.y = n.y + 18;
    }

    this.starmapTitle.text = data.sectorName.toUpperCase();
    this.starmapCreditsText.text = `CREDITS ${data.credits}`;

    const selected = data.nodes.find((n) => n.selected);
    if (selected) {
      this.starmapSelectedName.text = selected.unlocked
        ? `${selected.name.toUpperCase()}  —  ${selected.kind.replace(/-/g, " ").toUpperCase()}`
        : "UNDISCOVERED";
      this.starmapMissionLabel.text = data.selectedMissionLabel ?? "";
    } else {
      this.starmapSelectedName.text = "";
      this.starmapMissionLabel.text = "";
    }
  }

  /**
   * Draws the visual shipyard builder: parts palette on the left, ship canvas
   * in the centre (with placements, open sockets, and an optional drag-ghost),
   * a stats sheet on the right, and action buttons along the bottom.
   */

  private ensureWarpFilter(): Filter | null {
    if (this.warpFilter) return this.warpFilter;
    try {
      this.warpFilter = Filter.from({
        gl: {
          vertex: defaultFilterVert,
          fragment: `
            in vec2 vTextureCoord;
            out vec4 finalColor;
            uniform sampler2D uTexture;
            uniform float uTime;
            uniform float uIntensity;
            void main() {
              vec2 uv = vTextureCoord;
              vec2 delta = uv - vec2(0.5, 0.5);
              float dist = length(delta);
              float maxR = 0.28;
              if (uIntensity > 0.0 && dist < maxR) {
                float t2 = dist / maxR;
                float falloff = (1.0 - t2) * (1.0 - t2);
                float twistAngle = falloff * uIntensity * 1.1 * sin(uTime * 3.5);
                float cosT = cos(twistAngle);
                float sinT = sin(twistAngle);
                vec2 twisted = vec2(cosT * delta.x - sinT * delta.y, sinT * delta.x + cosT * delta.y);
                float ripple = falloff * uIntensity * 0.018 * sin(dist * 38.0 - uTime * 7.0);
                vec2 norm = dist > 0.0001 ? delta / dist : vec2(0.0);
                uv = vec2(0.5) + twisted + norm * ripple;
              }
              finalColor = texture(uTexture, uv);
            }
          `,
        },
        resources: {
          warpUniforms: {
            uTime:      { value: 0, type: "f32" },
            uIntensity: { value: 0, type: "f32" },
          },
        },
      });
      this.warpFilter.enabled = false;
      this.solarSystemGfx.filters = [this.warpFilter];
    } catch {
      this.warpFilter = null;
    }
    return this.warpFilter;
  }

  private drawSolarSystem(data: SolarSystemRenderData): void {
    const g = this.solarSystemGfx;
    g.clear();
    const mg = this.missileFxGfx; // additive-blend layer for missile glow
    mg.clear();

    // Background
    this.drawNebulaBackground(g);

    // World → screen: camera follows the player. 1 km = `kmToPx` pixels.
    const kmToPx = Math.max(0.05, data.zoomLevel);
    const camX = data.playerPosition.x;
    const camY = data.playerPosition.y;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const w2s = (wx: number, wy: number) => ({
      x: cx + (wx - camX) * kmToPx,
      y: cy + (wy - camY) * kmToPx,
    });
    const offscreen = (sx: number, sy: number, pad = 80): boolean =>
      sx < -pad || sx > this.width + pad || sy < -pad || sy > this.height + pad;
    // Ship/station screen-space scale factor: px per km model unit
    const enemyScale = Math.max(0.3, 0.6 * kmToPx);

    // ── Celestial bodies ───────────────────────────────────────────────────
    this.ensureTextPool(this.solarBodyLabels, data.celestialBodies.length, 13);
    for (let i = 0; i < data.celestialBodies.length; i++) {
      const body = data.celestialBodies[i]!;
      const label = this.solarBodyLabels[i]!;
      const color = (body.color.r << 16) | (body.color.g << 8) | body.color.b;
      const radiusPx = Math.max(6, Math.min(80, body.radius * 0.1 * kmToPx));
      const p = w2s(body.position.x, body.position.y);

      if (offscreen(p.x, p.y, radiusPx + 40)) {
        label.visible = false;
        continue;
      }

      // Glow ring
      g.circle(p.x, p.y, radiusPx + 4)
        .stroke({ color, width: 2, alpha: 0.25 });
      // Body
      g.circle(p.x, p.y, radiusPx)
        .fill({ color, alpha: 0.95 });
      // Highlight
      g.circle(p.x - radiusPx * 0.3, p.y - radiusPx * 0.3, radiusPx * 0.35)
        .fill({ color: 0xffffff, alpha: 0.35 });

      // Name label below body
      label.text = body.name;
      label.x = p.x;
      label.y = p.y + radiusPx + 6;
      label.anchor.set(0.5, 0);
      label.style.fill = color;
      label.visible = true;
    }
    // Hide unused body labels
    for (let i = data.celestialBodies.length; i < this.solarBodyLabels.length; i++) {
      this.solarBodyLabels[i]!.visible = false;
    }

    // ── Stations / outposts (docking targets) ─────────────────────────────
    this.ensureTextPool(this.solarLocationLabels, data.locations.length, 12);
    for (let i = 0; i < data.locations.length; i++) {
      const loc = data.locations[i]!;
      const label = this.solarLocationLabels[i]!;
      const p = w2s(loc.worldPosition.x, loc.worldPosition.y);

      if (offscreen(p.x, p.y)) {
        label.visible = false;
        continue;
      }

      const nearby = data.nearbyLocations.includes(loc.id);
      const color = nearby ? 0x66ff66 : 0xcccccc;
      const dockPx = loc.dockingRadius * kmToPx;

      // Dock-radius ring (faint when far, brighter when nearby)
      g.circle(p.x, p.y, Math.max(12, dockPx))
        .stroke({ color, width: 1, alpha: nearby ? 0.6 : 0.2 });

      // Diamond marker
      g.moveTo(p.x, p.y - 9)
        .lineTo(p.x + 9, p.y)
        .lineTo(p.x, p.y + 9)
        .lineTo(p.x - 9, p.y)
        .lineTo(p.x, p.y - 9)
        .stroke({ color, width: 2, alpha: 0.95 });

      label.text = loc.name;
      label.x = p.x;
      label.y = p.y - 14;
      label.anchor.set(0.5, 1);
      label.style.fill = color;
      label.visible = true;
    }
    for (let i = data.locations.length; i < this.solarLocationLabels.length; i++) {
      this.solarLocationLabels[i]!.visible = false;
    }

    // ── Gates ─────────────────────────────────────────────────────────────
    this.ensureTextPool(this.solarGateLabels, data.gates.length, 12);
    for (let i = 0; i < data.gates.length; i++) {
      const gate = data.gates[i]!;
      const label = this.solarGateLabels[i]!;
      const p = w2s(gate.position.x, gate.position.y);

      // Gates are usually far off-screen; render a directional indicator at edge.
      if (offscreen(p.x, p.y, 0)) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const margin = 32;
        const t = Math.min(
          (cx - margin) / Math.abs(dx || 1),
          (cy - margin) / Math.abs(dy || 1),
        );
        const ex = cx + (dx / len) * Math.min(len, Math.max(cx, cy) - margin);
        const ey = cy + (dy / len) * Math.min(len, Math.max(cx, cy) - margin);
        // Use t to nudge along the longer axis so the marker hits the screen edge
        void t;
        const color = data.nearbyGateId === gate.id ? 0xffff66 : 0x99ccff;
        // Triangle pointer pointing along (dx, dy)
        const ang = Math.atan2(dy, dx);
        const s = 10;
        g.moveTo(ex + Math.cos(ang) * s, ey + Math.sin(ang) * s)
          .lineTo(
            ex + Math.cos(ang + 2.4) * s,
            ey + Math.sin(ang + 2.4) * s,
          )
          .lineTo(
            ex + Math.cos(ang - 2.4) * s,
            ey + Math.sin(ang - 2.4) * s,
          )
          .lineTo(ex + Math.cos(ang) * s, ey + Math.sin(ang) * s)
          .fill({ color, alpha: 0.9 });

        label.text = `→ ${gate.destinationSystemName}`;
        label.x = ex - Math.cos(ang) * 28;
        label.y = ey - Math.sin(ang) * 28;
        label.anchor.set(0.5, 0.5);
        label.style.fill = color;
        label.visible = true;
        continue;
      }

      const color = data.nearbyGateId === gate.id ? 0xffff66 : 0x99ccff;
      const ringPx = Math.max(20, gate.triggerRadius * kmToPx);
      // Outer ring + cross — recognisable gate shape
      g.circle(p.x, p.y, ringPx)
        .stroke({ color, width: 2, alpha: 0.85 });
      g.circle(p.x, p.y, ringPx * 0.6)
        .stroke({ color, width: 1, alpha: 0.5 });
      g.moveTo(p.x - ringPx, p.y).lineTo(p.x + ringPx, p.y).stroke({ color, width: 1, alpha: 0.6 });
      g.moveTo(p.x, p.y - ringPx).lineTo(p.x, p.y + ringPx).stroke({ color, width: 1, alpha: 0.6 });

      label.text = `${gate.name}\n→ ${gate.destinationSystemName}`;
      label.x = p.x;
      label.y = p.y + ringPx + 6;
      label.anchor.set(0.5, 0);
      label.style.fill = color;
      label.visible = true;
    }
    for (let i = data.gates.length; i < this.solarGateLabels.length; i++) {
      this.solarGateLabels[i]!.visible = false;
    }

    // ── Enemy stations ────────────────────────────────────────────────────
    this.ensureTextPool(this.solarEnemyStationLabels, data.enemyStations.length, 11);
    for (let i = 0; i < data.enemyStations.length; i++) {
      const base = data.enemyStations[i]!;
      const label = this.solarEnemyStationLabels[i]!;
      const p = w2s(base.position.x, base.position.y);

      // Stations render as large blueprint ships (3× ship scale for the same sizeClass)
      const stationSzClass = base.sizeClass ?? 4;
      const stationScreenR = Math.max(16, (4 + stationSzClass * 2) * enemyScale * 3);

      // Cull based on the full hull extent (modules can protrude ~3× beyond the core).
      if (offscreen(p.x, p.y, stationScreenR * 3 + 40)) {
        // Off-screen indicator
        const dx2 = p.x - cx;
        const dy2 = p.y - cy;
        const ang2 = Math.atan2(dy2, dx2);
        const margin = 40;
        const edgeX = cx + Math.cos(ang2) * (Math.min(cx, cy) - margin);
        const edgeY = cy + Math.sin(ang2) * (Math.min(cx, cy) - margin);
        g.moveTo(edgeX + Math.cos(ang2) * 10, edgeY + Math.sin(ang2) * 10)
          .lineTo(edgeX + Math.cos(ang2 + 2.4) * 10, edgeY + Math.sin(ang2 + 2.4) * 10)
          .lineTo(edgeX + Math.cos(ang2 - 2.4) * 10, edgeY + Math.sin(ang2 - 2.4) * 10)
          .lineTo(edgeX + Math.cos(ang2) * 10, edgeY + Math.sin(ang2) * 10)
          .fill({ color: 0xff4444, alpha: 0.8 });
        label.visible = false;
        continue;
      }

      const alertColor = base.alertLevel === "combat"
        ? 0xff2222
        : base.alertLevel === "alerted"
          ? 0xff8800
          : 0xaa4444;

      if (base.blueprintModules && base.blueprintModules.length > 0 && base.blueprintCoreRadius) {
        const bpScale = stationScreenR / base.blueprintCoreRadius;
        this.drawBlueprintShip(g, p.x, p.y, base.heading ?? 0, base.blueprintModules, bpScale, data.factionPalettes?.[base.faction ?? ""] ?? getFactionColors(base.faction), undefined, undefined);
        // Alert ring around the station hull
        g.circle(p.x, p.y, stationScreenR * 1.15).stroke({ color: alertColor, width: 1.5, alpha: 0.55 });
      } else {
        // Fallback hexagon
        const r = stationScreenR * 0.5;
        g.poly(
          Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2;
            return [p.x + Math.cos(a) * r, p.y + Math.sin(a) * r] as [number, number];
          }).flat(),
        ).fill({ color: alertColor, alpha: 0.9 });
        g.circle(p.x, p.y, r + 3).stroke({ color: alertColor, width: 1, alpha: 0.5 });
      }

      // Health bar
      if (base.maxHealth > 0) {
        const barW = Math.max(40, stationScreenR * 1.8);
        const ratio = base.health / base.maxHealth;
        const barY = p.y + stationScreenR * 1.2 + 4;
        g.rect(p.x - barW / 2, barY, barW, 4).fill({ color: 0x333333, alpha: 0.7 });
        g.rect(p.x - barW / 2, barY, barW * ratio, 4).fill({ color: alertColor, alpha: 0.9 });
      }
      label.text = `${base.name}\n${base.alertLevel.toUpperCase()}`;
      label.x = p.x;
      label.y = p.y - stationScreenR * 1.2 - 6;
      label.anchor.set(0.5, 1);
      label.style.fill = alertColor;
      label.visible = true;
    }
    for (let i = data.enemyStations.length; i < this.solarEnemyStationLabels.length; i++) {
      this.solarEnemyStationLabels[i]!.visible = false;
    }

    // ── Enemy ships ───────────────────────────────────────────────────────
    // Ship km radius = (4 + sizeClass*2) * 0.6 km — no upper cap so ships
    // scale proportionally with zoom just like planets.
    this.ensureTextPool(this.solarEnemyLabels, data.enemyShips.length, 10);
    for (let i = 0; i < data.enemyShips.length; i++) {
      const ship = data.enemyShips[i]!;
      const label = this.solarEnemyLabels[i]!;
      const p = w2s(ship.position.x, ship.position.y);

      // Screen radius of the ship hull — needed for the culling pad.
      const screenR = Math.max(4, (4 + ship.sizeClass * 2) * enemyScale);

      // Cull based on the full hull extent (modules can protrude ~3× beyond the core).
      if (offscreen(p.x, p.y, screenR * 3 + 40)) {
        label.visible = false;
        continue;
      }
      if (ship.blueprintModules && ship.blueprintModules.length > 0 && ship.blueprintCoreRadius) {
        const bpScale = screenR / ship.blueprintCoreRadius;
        this.drawBlueprintShip(g, p.x, p.y, ship.heading, ship.blueprintModules, bpScale, data.factionPalettes?.[ship.faction ?? ""] ?? getFactionColors(ship.faction), ship.destroyedModuleIds, ship.moduleHpFractions);
      } else {
        this.drawDeltaWing(g, p.x, p.y, ship.heading, ship.color, screenR / 16);
      }
      // Selection ring (thin white circle around click-selected ship)
      const isSelected = data.selectedShipId === ship.id;
      if (isSelected) {
        g.circle(p.x, p.y, screenR * 1.6).stroke({ color: 0xffffff, width: 1.2, alpha: 0.85 });
      }
      // Health bar sits just below the rendered hull
      const barW = Math.max(14, screenR * 1.6);
      const ratio = ship.health / ship.maxHealth;
      const barY = p.y + screenR + 3;
      g.rect(p.x - barW / 2, barY, barW, 3).fill({ color: 0x333333, alpha: 0.7 });
      g.rect(p.x - barW / 2, barY, barW * ratio, 3).fill({ color: ship.color, alpha: 0.9 });
      if (isSelected) {
        label.text = `${ship.typeName}  C${ship.sizeClass}`;
        label.style.fontSize = 10;
        label.style.fill = 0xffffff;
        label.x = p.x;
        label.y = barY + 6;
        label.anchor.set(0.5, 0);
        label.visible = true;
      } else {
        label.visible = false;
      }
    }
    for (let i = data.enemyShips.length; i < this.solarEnemyLabels.length; i++) {
      this.solarEnemyLabels[i]!.visible = false;
    }

    // ── Last-known-position ghost markers ─────────────────────────────────
    if (data.lastKnownEnemyPositions) {
      for (const ghost of data.lastKnownEnemyPositions) {
        const p = w2s(ghost.position.x, ghost.position.y);
        if (offscreen(p.x, p.y, 20)) continue;
        const s = 7 * Math.max(0.5, Math.min(1.5, kmToPx));
        const clampedS = Math.max(5, Math.min(10, s));
        // Hollow diamond outline
        g.poly([
          { x: p.x,             y: p.y - clampedS },
          { x: p.x + clampedS,  y: p.y            },
          { x: p.x,             y: p.y + clampedS },
          { x: p.x - clampedS,  y: p.y            },
        ]).stroke({ color: ghost.color, width: 1.5, alpha: 0.5 });
        // Centre dot
        g.circle(p.x, p.y, 1.8).fill({ color: ghost.color, alpha: 0.5 });
        // Cross hair inside diamond — marks "last seen here"
        g.moveTo(p.x - clampedS * 0.35, p.y)
          .lineTo(p.x + clampedS * 0.35, p.y)
          .stroke({ color: ghost.color, width: 1, alpha: 0.35 });
        g.moveTo(p.x, p.y - clampedS * 0.35)
          .lineTo(p.x, p.y + clampedS * 0.35)
          .stroke({ color: ghost.color, width: 1, alpha: 0.35 });
      }
    }

    // ── Enemy projectiles ─────────────────────────────────────────────────
    for (const proj of data.enemyProjectiles) {
      const p = w2s(proj.position.x, proj.position.y);
      if (offscreen(p.x, p.y, 14)) continue;

      if (proj.isHoming) {
        const tc = proj.trailColor ?? 0xff6633;
        const edx = proj.dirX ?? 0;
        const edy = proj.dirY ?? 0;

        // ── Normal layer: opaque missile body ──────────────────────────
        const bodyLen = 10;
        if (Math.abs(edx) > 0.01 || Math.abs(edy) > 0.01) {
          g.moveTo(p.x - edx * bodyLen, p.y - edy * bodyLen)
           .lineTo(p.x, p.y)
           .stroke({ color: tc, width: 2.5, alpha: 0.95 });
          const perpX = -edy; const perpY = edx;
          const fx = p.x - edx * bodyLen * 0.55; const fy = p.y - edy * bodyLen * 0.55;
          g.moveTo(fx + perpX * 3, fy + perpY * 3).lineTo(fx - perpX * 3, fy - perpY * 3)
           .stroke({ color: tc, width: 1.5, alpha: 0.85 });
        }
        g.circle(p.x, p.y, 2).fill({ color: 0xffffff, alpha: 0.95 });

        // ── Additive layer: trail + warhead bloom ──────────────────────
        if (proj.trailPoints && proj.trailPoints.length > 1) {
          for (let ti = 1; ti < proj.trailPoints.length; ti++) {
            const tp0 = w2s(proj.trailPoints[ti - 1]!.x, proj.trailPoints[ti - 1]!.y);
            const tp1 = w2s(proj.trailPoints[ti]!.x, proj.trailPoints[ti]!.y);
            const f = ti / proj.trailPoints.length;
            mg.moveTo(tp0.x, tp0.y).lineTo(tp1.x, tp1.y)
              .stroke({ color: tc, width: Math.max(0.5, f * 3), alpha: f * 0.5 });
          }
        } else if (Math.abs(edx) > 0.01 || Math.abs(edy) > 0.01) {
          mg.moveTo(p.x - edx * 14, p.y - edy * 14)
            .lineTo(p.x, p.y)
            .stroke({ color: tc, width: 2, alpha: 0.4 });
        }
        mg.circle(p.x, p.y, 10).fill({ color: tc, alpha: 0.15 });
        mg.circle(p.x, p.y, 5).fill({ color: tc, alpha: 0.45 });
      } else {
        // Non-homing: body in normal layer, subtle glow additive
        g.circle(p.x, p.y, 2.5).fill({ color: 0xffffff, alpha: 0.9 });
        g.circle(p.x, p.y, 4).fill({ color: proj.color, alpha: 0.5 });
        mg.circle(p.x, p.y, 7).fill({ color: proj.color, alpha: 0.25 });
      }
    }

    // ── Lock lines + crosshairs ───────────────────────────────────────────
    if (data.lockedTargets && data.lockedTargets.length > 0) {
      for (const lock of data.lockedTargets) {
        const tp = w2s(lock.position.x, lock.position.y);
        const isFocused = lock.id === data.focusedTargetId;
        const lineColor = isFocused ? 0xff4444 : 0x888888;
        const crossColor = isFocused ? 0xff2222 : 0x666666;
        // Grey/red line from player to target
        g.moveTo(cx, cy).lineTo(tp.x, tp.y).stroke({ color: lineColor, width: 1, alpha: 0.5 });
        // Crosshair at target
        const cr = 12;
        g.moveTo(tp.x - cr, tp.y).lineTo(tp.x + cr, tp.y).stroke({ color: crossColor, width: 1.5, alpha: 0.9 });
        g.moveTo(tp.x, tp.y - cr).lineTo(tp.x, tp.y + cr).stroke({ color: crossColor, width: 1.5, alpha: 0.9 });
        g.circle(tp.x, tp.y, cr).stroke({ color: crossColor, width: 1.5, alpha: 0.6 });
        if (isFocused) {
          g.circle(tp.x, tp.y, cr * 1.6).stroke({ color: 0xff6666, width: 1, alpha: 0.4 });
        }
      }
    }

    // ── Friendly ships ────────────────────────────────────────────────────
    if (data.friendlyShips) {
      for (const ship of data.friendlyShips) {
        const fp = w2s(ship.position.x, ship.position.y);
        if (offscreen(fp.x, fp.y)) continue;
        const fScreenR = Math.max(4, 6 * enemyScale); // class-1 sized by default
        this.drawDeltaWing(g, fp.x, fp.y, ship.heading, 0x44ff88, fScreenR / 16);
        const ratio = ship.health / ship.maxHealth;
        const fBarW = Math.max(14, fScreenR * 1.6);
        g.rect(fp.x - fBarW / 2, fp.y + fScreenR + 3, fBarW, 3).fill({ color: 0x333333, alpha: 0.7 });
        g.rect(fp.x - fBarW / 2, fp.y + fScreenR + 3, fBarW * ratio, 3).fill({ color: 0x44ff88, alpha: 0.9 });
      }
    }

    // ── Player projectiles ────────────────────────────────────────────────
    if (data.playerProjectiles) {
      for (const proj of data.playerProjectiles) {
        const p = w2s(proj.position.x, proj.position.y);
        if (offscreen(p.x, p.y, 20)) continue;
        const alpha = Math.min(1, proj.lifetimeFrac * 2);
        const dx = proj.dirX;
        const dy = proj.dirY;
        if (proj.weaponKind === "cannon") {
          // Body in normal layer
          g.circle(p.x, p.y, 3).fill({ color: 0xffdd00, alpha });
          g.moveTo(p.x - dx * 10, p.y - dy * 10)
           .lineTo(p.x, p.y)
           .stroke({ color: 0xff8800, width: 2, alpha });
          // Glow on additive layer
          mg.circle(p.x, p.y, 7).fill({ color: 0xff4400, alpha: alpha * 0.5 });
          mg.circle(p.x, p.y, 4).fill({ color: 0xff8800, alpha: alpha * 0.7 });
        } else if (proj.weaponKind === "torpedo") {
          const lvl = Math.max(1, Math.min(9, proj.missileLevel ?? 1));
          const trailColor = MISSILE_TRAIL_COLORS[lvl - 1] ?? 0x33dd77;
          const coreColor  = MISSILE_CORE_COLORS[lvl - 1]  ?? 0x88ffbb;

          const bodyLen = 12 + lvl * 1.5;
          const tailX = p.x - dx * bodyLen;
          const tailY = p.y - dy * bodyLen;
          const perpX = -dy;
          const perpY = dx;

          // ── Normal layer: opaque missile body + fins ──────────────────
          g.moveTo(tailX, tailY).lineTo(p.x, p.y)
           .stroke({ color: coreColor, width: 2 + lvl * 0.22, alpha });
          const finX = p.x - dx * (bodyLen * 0.6);
          const finY = p.y - dy * (bodyLen * 0.6);
          const finSpread = 2.5 + lvl * 0.35;
          g.moveTo(finX + perpX * finSpread, finY + perpY * finSpread)
           .lineTo(finX - perpX * finSpread, finY - perpY * finSpread)
           .stroke({ color: coreColor, width: 1.5, alpha: alpha * 0.9 });
          // Hard warhead tip
          g.circle(p.x, p.y, 1.5 + lvl * 0.2).fill({ color: 0xffffff, alpha });

          // ── Additive layer: trail sparkle + warhead glow ──────────────
          if (proj.trailPoints && proj.trailPoints.length > 1) {
            for (let ti = 1; ti < proj.trailPoints.length; ti++) {
              const tp0 = w2s(proj.trailPoints[ti - 1]!.x, proj.trailPoints[ti - 1]!.y);
              const tp1 = w2s(proj.trailPoints[ti]!.x, proj.trailPoints[ti]!.y);
              const trailFrac = ti / proj.trailPoints.length;
              mg.moveTo(tp0.x, tp0.y)
                .lineTo(tp1.x, tp1.y)
                .stroke({ color: trailColor, width: Math.max(0.5, trailFrac * 3), alpha: trailFrac * alpha * 0.55 });
            }
          } else {
            mg.moveTo(p.x - dx * 18, p.y - dy * 18)
              .lineTo(p.x, p.y)
              .stroke({ color: trailColor, width: 2, alpha: alpha * 0.45 });
          }
          // Warhead bloom (additive — gets brighter with overlapping missiles)
          const glowR = 3 + lvl * 0.5;
          mg.circle(p.x, p.y, glowR * 2.5).fill({ color: trailColor, alpha: alpha * 0.18 });
          mg.circle(p.x, p.y, glowR).fill({ color: coreColor, alpha: alpha * 0.7 });
        }
      }
    }

    // ── Engine glow (idle) + thrust exhaust ──────────────────────────────
    const playerTargetR = Math.max(3, (4 + (data.playerSizeClass ?? 2) * 2) * enemyScale);
    const gs = playerTargetR / 16;
    if (!data.solarPlayerDead) {
      const headRad = (data.playerHeading * Math.PI) / 180;
      const cosH = Math.cos(headRad);
      const sinH = Math.sin(headRad);

      const engineKinds = ["thruster", "ion-engine", "warp-nacelle", "gravity-drive"];
      const engineMods = data.playerBlueprintModules?.filter(m => engineKinds.includes(m.partKind)) ?? [];
      const bpScale = data.playerBlueprintCoreRadius ? playerTargetR / data.playerBlueprintCoreRadius : gs;

      // Exhaust target vector in ship space (+Y = aft, -Y = fore, +X = stbd, -X = port).
      let etX = 0, etY = 0;
      if (data.thrustForward)     etY += 1;
      if (data.thrustReverse)     etY -= 1;
      if (data.thrustStrafeRight) etX -= 1;
      if (data.thrustStrafeLeft)  etX += 1;
      if (data.thrustTurnRight)   etX -= 0.5;
      if (data.thrustTurnLeft)    etX += 0.5;
      const etLen = Math.hypot(etX, etY);
      const hasDirectional = etLen > 0.1;
      const etNx = hasDirectional ? etX / etLen : 0;
      const etNy = hasDirectional ? etY / etLen : 0;
      // Exhaust target in world space
      const etWX = etNx * cosH - etNy * sinH;
      const etWY = etNx * sinH + etNy * cosH;

      const linearActive = data.thrustActive;
      const turnActive   = (data.thrustTurnLeft ?? false) || (data.thrustTurnRight ?? false);

      if (engineMods.length > 0) {
        // Pre-scan: check whether any engine aligns with the directional thrust vector.
        // If none do (e.g. only rear engines when strafing), all engines show at fallback
        // intensity so RCS / attitude thrusters are implied.
        let anyAligned = false;
        if (linearActive && hasDirectional) {
          for (const eng of engineMods) {
            const d = Math.hypot(eng.worldX, eng.worldY);
            const ox = d > 0.5 ? eng.worldX / d : 0;
            const oy = d > 0.5 ? eng.worldY / d : 1;
            if (ox * etNx + oy * etNy > 0.2) { anyAligned = true; break; }
          }
        } else if (linearActive) {
          anyAligned = true;
        }

        // Per-partKind exhaust visual parameters: [idleOuter, idleMid, idleTip, fireCore, firePlume1, firePlume2]
        const EV: Record<string, readonly [number, number, number, number, number, number]> = {
          "thruster":      [0xff4400, 0xff6600, 0xffaa44, 0x66aaff, 0x4488ff, 0x2266ff],
          "ion-engine":    [0x002288, 0x0044cc, 0x44aaff, 0x00ffcc, 0x00ccaa, 0x008888],
          "warp-nacelle":  [0x440088, 0x6600cc, 0xcc88ff, 0xff88ff, 0xcc44ff, 0x8800ff],
          "gravity-drive": [0x004466, 0x0088cc, 0xaaeeff, 0xffffff, 0xaaddff, 0x44aaff],
        };

        for (const eng of engineMods) {
          const ex = cx + (eng.worldX * cosH - eng.worldY * sinH) * bpScale;
          const ey = cy + (eng.worldX * sinH + eng.worldY * cosH) * bpScale;
          const dist = Math.hypot(eng.worldX, eng.worldY);
          const oux = dist > 0.5 ? eng.worldX / dist : 0;
          const ouy = dist > 0.5 ? eng.worldY / dist : 1;
          // Engine radial-outward direction in world space
          const outX = oux * cosH - ouy * sinH;
          const outY = oux * sinH + ouy * cosH;

          // Decide if this engine fires and at what intensity
          let firing = false;
          let intensity = 1.0;
          if (linearActive) {
            if (hasDirectional && anyAligned) {
              firing = oux * etNx + ouy * etNy > 0.2;
            } else if (!anyAligned) {
              firing = true; intensity = 0.55; // fallback: no aligned engine — RCS implied
            } else {
              firing = true;
            }
          }
          if (!firing && turnActive) {
            firing = true; intensity = 0.4; // RCS for rotation
          }

          // Gimbal: blend exhaust trail 35% toward actual thrust direction
          let gimX = outX, gimY = outY;
          if (firing && hasDirectional) {
            const f = 0.35;
            const bx = outX * (1 - f) + etWX * f;
            const by = outY * (1 - f) + etWY * f;
            const bl = Math.hypot(bx, by);
            if (bl > 0.01) { gimX = bx / bl; gimY = by / bl; }
          }

          const ev = EV[eng.partKind] ?? EV["thruster"]!;
          g.circle(ex, ey, 9 * gs).fill({ color: ev[0], alpha: 0.12 });
          g.circle(ex, ey, 5 * gs).fill({ color: ev[1], alpha: 0.28 });
          g.circle(ex, ey, 3 * gs).fill({ color: ev[2], alpha: 0.55 });
          g.circle(ex, ey, 1.5 * gs).fill({ color: 0xffffff, alpha: 0.8 });
          if (firing) {
            g.circle(ex, ey, 5 * gs).fill({ color: ev[3], alpha: 0.9 * intensity });
            g.circle(ex + gimX * 8 * gs, ey + gimY * 8 * gs, 4 * gs).fill({ color: ev[4], alpha: 0.6 * intensity });
            g.circle(ex + gimX * 14 * gs, ey + gimY * 14 * gs, 2 * gs).fill({ color: ev[5], alpha: 0.3 * intensity });
            // Gravity drive: extra ring distortion effect
            if (eng.partKind === "gravity-drive") {
              g.circle(ex, ey, 12 * gs).stroke({ color: ev[4], width: 0.8, alpha: 0.4 * intensity });
            }
          }
        }
      } else {
        // Fallback: no engine modules — single thruster glow at stern
        const backX = cx - sinH * gs * 18;
        const backY = cy + cosH * gs * 18;
        g.circle(backX, backY, 9 * gs).fill({ color: 0xff4400, alpha: 0.12 });
        g.circle(backX, backY, 5 * gs).fill({ color: 0xff6600, alpha: 0.28 });
        g.circle(backX, backY, 3 * gs).fill({ color: 0xffaa44, alpha: 0.55 });
        g.circle(backX, backY, 1.5 * gs).fill({ color: 0xffffff, alpha: 0.8 });
        const fallbackActive = linearActive || turnActive;
        const fallbackIntensity = turnActive && !linearActive ? 0.4 : 1.0;
        // Gimbaled direction for fallback: backward with slight offset toward thrust
        let fbGimX = -sinH, fbGimY = cosH; // backward direction
        if (fallbackActive && hasDirectional) {
          const f = 0.35;
          const bx = fbGimX * (1 - f) + etWX * f;
          const by = fbGimY * (1 - f) + etWY * f;
          const bl = Math.hypot(bx, by);
          if (bl > 0.01) { fbGimX = bx / bl; fbGimY = by / bl; }
        }
        if (fallbackActive) {
          g.circle(backX, backY, 5 * gs).fill({ color: 0x66aaff, alpha: 0.9 * fallbackIntensity });
          g.circle(backX + fbGimX * 8 * gs, backY + fbGimY * 8 * gs, 4 * gs).fill({ color: 0x4488ff, alpha: 0.6 * fallbackIntensity });
          g.circle(backX + fbGimX * 14 * gs, backY + fbGimY * 14 * gs, 2 * gs).fill({ color: 0x2266ff, alpha: 0.3 * fallbackIntensity });
        }
      }
    }

    // ── Velocity vector ───────────────────────────────────────────────────
    const speed = Math.hypot(data.playerVelocity.x, data.playerVelocity.y);
    if (speed > 500) {
      const velScale = Math.min(60, speed / 800) * kmToPx;
      const velDirX = data.playerVelocity.x / speed;
      const velDirY = data.playerVelocity.y / speed;
      const tipX = cx + velDirX * velScale;
      const tipY = cy + velDirY * velScale;
      g.moveTo(cx, cy).lineTo(tipX, tipY).stroke({ color: 0x00ffaa, width: 1, alpha: 0.5 });
      // Arrowhead
      const perpX = -velDirY;
      const perpY = velDirX;
      g.moveTo(tipX, tipY)
        .lineTo(tipX - velDirX * 5 + perpX * 4, tipY - velDirY * 5 + perpY * 4)
        .lineTo(tipX - velDirX * 5 - perpX * 4, tipY - velDirY * 5 - perpY * 4)
        .lineTo(tipX, tipY)
        .fill({ color: 0x00ffaa, alpha: 0.5 });
    }

    // ── Laser flash FX ────────────────────────────────────────────────────
    if (data.laserFlash) {
      const tp = w2s(data.laserFlash.targetX, data.laserFlash.targetY);
      const alpha = data.laserFlash.alpha;
      const origins = data.laserFlash.origins.length > 0
        ? data.laserFlash.origins
        : [{ dx: 0, dy: 0 }];
      // Impact flash at target (once, not per weapon)
      g.circle(tp.x, tp.y, 9 * alpha).fill({ color: 0xffffff, alpha: alpha * 0.9 });
      g.circle(tp.x, tp.y, 16 * alpha).fill({ color: 0x44ffff, alpha: alpha * 0.5 });
      g.circle(tp.x, tp.y, 24 * alpha).fill({ color: 0x0088cc, alpha: alpha * 0.25 });
      for (const ori of origins) {
        const ox = cx + ori.dx;
        const oy = cy + ori.dy;
        // Outer glow
        g.moveTo(ox, oy).lineTo(tp.x, tp.y).stroke({ color: 0x44ffff, width: 6, alpha: alpha * 0.18 });
        // Mid halo
        g.moveTo(ox, oy).lineTo(tp.x, tp.y).stroke({ color: 0x88ffff, width: 3, alpha: alpha * 0.45 });
        // Core beam
        g.moveTo(ox, oy).lineTo(tp.x, tp.y).stroke({ color: 0xffffff, width: 1.2, alpha });
        // Muzzle flash at origin
        g.circle(ox, oy, 5 * alpha).fill({ color: 0x88ffff, alpha: alpha * 0.7 });
      }
    }

    // ── Warp bubble + distortion shader ──────────────────────────────────
    const warpIntensity = data.warpIntensity ?? 0;
    if (warpIntensity > 0) {
      const intensity = warpIntensity;
      const t = this.warpBubbleTimeMs / 1000;

      // Update the GLSL distortion filter (lazy-created — no-ops if WebGL unavailable)
      const wf = this.ensureWarpFilter();
      if (wf) {
        wf.enabled = true;
        const wu = (wf.resources as Record<string, { uniforms: Record<string, number> }>)["warpUniforms"]!.uniforms;
        wu["uTime"] = t;
        wu["uIntensity"] = intensity;
      }

      // Speed-streak lines radiating backward from the ship
      const headRad = (data.playerHeading * Math.PI) / 180;
      const fwdX = Math.sin(headRad);
      const fwdY = -Math.cos(headRad);
      const STREAK_COUNT = 18;
      for (let i = 0; i < STREAK_COUNT; i++) {
        const angle = (i / STREAK_COUNT) * Math.PI * 2 + t * 0.4;
        const spread = 14 + Math.sin(t * 2.3 + i) * 5;
        const sx = cx + Math.cos(angle) * spread;
        const sy = cy + Math.sin(angle) * spread;
        const streakLen = (55 + Math.sin(t * 3.1 + i * 0.8) * 28) * intensity;
        g.moveTo(sx, sy)
         .lineTo(sx - fwdX * streakLen, sy - fwdY * streakLen)
         .stroke({ color: 0x66ddff, width: 0.9, alpha: 0.38 * intensity });
      }

      // Concentric wobbling rings
      const BASE_R = 30;
      const RINGS = 3;
      for (let r = 0; r < RINGS; r++) {
        const phase = t * 3.5 + r * (Math.PI * 2 / RINGS);
        const wobbleR = BASE_R + r * 8 + Math.sin(phase) * 4;
        const SEGS = 48;
        const alpha = (0.55 - r * 0.14) * intensity;
        const color = r === 0 ? 0x44ddff : r === 1 ? 0x2299cc : 0x116688;
        for (let i = 0; i < SEGS; i++) {
          const a0 = (i / SEGS) * Math.PI * 2;
          const a1 = ((i + 1) / SEGS) * Math.PI * 2;
          const seg0R = wobbleR + Math.sin(a0 * 4 + t * 5 + r) * 3;
          const seg1R = wobbleR + Math.sin(a1 * 4 + t * 5 + r) * 3;
          g.moveTo(cx + Math.cos(a0) * seg0R, cy + Math.sin(a0) * seg0R)
           .lineTo(cx + Math.cos(a1) * seg1R, cy + Math.sin(a1) * seg1R)
           .stroke({ color, width: 1.5, alpha });
        }
      }
      g.circle(cx, cy, BASE_R + Math.sin(t * 4) * 3)
        .fill({ color: 0x0088cc, alpha: 0.08 * intensity });

      // Radial lens lines converging at centre
      const LENS_COUNT = 20;
      for (let i = 0; i < LENS_COUNT; i++) {
        const angle = (i / LENS_COUNT) * Math.PI * 2;
        const innerR = BASE_R + 6 + Math.sin(t * 4.5 + i) * 4;
        const outerR = innerR + (12 + Math.sin(t * 3.2 + i * 1.4) * 6) * intensity;
        g.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR)
         .lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR)
         .stroke({ color: 0x99eeff, width: 1, alpha: 0.22 * intensity });
      }
    } else if (this.warpFilter) {
      this.warpFilter.enabled = false;
    }

    // ── Friendly station shield bubbles (world space) ────────────────────
    if (data.stationShields) {
      for (const ss of data.stationShields) {
        if (ss.hp <= 0) continue;
        const sp = w2s(ss.worldX, ss.worldY);
        const shieldPx = ss.radiusKm * kmToPx;
        const hpFrac = ss.hp / ss.maxHp;
        const bubbleColor = hpFrac > 0.25 ? 0x22aaff : 0xff9900;
        const alpha = 0.05 + 0.06 * hpFrac;
        g.circle(sp.x, sp.y, shieldPx).fill({ color: bubbleColor, alpha });
        g.circle(sp.x, sp.y, shieldPx).stroke({ color: bubbleColor, width: 1.5, alpha: 0.25 + 0.35 * hpFrac });
        g.circle(sp.x, sp.y, shieldPx * 0.97).stroke({ color: 0xffffff, width: 0.5, alpha: 0.06 * hpFrac });
      }
    }

    // ── Player ship at view centre ────────────────────────────────────────
    // ── Projected shield bubble ───────────────────────────────────────────
    if (data.projectedShield && data.projectedShield.hp > 0) {
      const ps = data.projectedShield;
      const shieldPx = ps.radiusKm * kmToPx;
      const hpFrac = ps.hp / ps.maxHp;
      // Fade color: cyan at full → amber as it drops below 25%.
      const bubbleColor = hpFrac > 0.25 ? 0x22aaff : 0xff9900;
      const alpha = 0.07 + 0.08 * hpFrac;
      g.circle(cx, cy, shieldPx).fill({ color: bubbleColor, alpha });
      g.circle(cx, cy, shieldPx).stroke({ color: bubbleColor, width: 1.5, alpha: 0.35 + 0.45 * hpFrac });
      // Inner shimmer ring
      g.circle(cx, cy, shieldPx * 0.93).stroke({ color: 0xffffff, width: 0.5, alpha: 0.08 * hpFrac });
    }

    // Same logic as enemies: always use blueprint when available; fall back to
    // chevron only when there are no blueprint modules. LOD is handled purely
    // by bpScale — the polygon gets tiny when zoomed out, just like enemies.
    if (!data.solarPlayerDead) {
      if (data.playerBlueprintModules && data.playerBlueprintModules.length > 0 && data.playerBlueprintCoreRadius) {
        const bpScale = playerTargetR / data.playerBlueprintCoreRadius;
        this.drawBlueprintShip(g, cx, cy, data.playerHeading, data.playerBlueprintModules, bpScale, getFactionColors("player"), data.playerDestroyedModuleIds, data.playerModuleHpFractions);
      } else {
        this.drawDeltaWing(g, cx, cy, data.playerHeading, 0x00ffff, playerTargetR / 16);
      }
    }

    // ── Solar explosions ──────────────────────────────────────────────────
    if (data.solarExplosions) {
      for (const exp of data.solarExplosions) {
        const ep = w2s(exp.x, exp.y);
        const t = exp.ageFrac;
        const baseR = 22 * exp.scale;
        // Flash core (very fast, first 20%)
        if (t < 0.2) {
          const flashAlpha = (0.2 - t) * 5;
          g.circle(ep.x, ep.y, baseR * 0.6).fill({ color: 0xffffff, alpha: flashAlpha * 0.9 });
        }
        // Fast inner ring (bright)
        const r1 = baseR * (0.15 + t * 0.9);
        g.circle(ep.x, ep.y, r1).stroke({ color: 0xffffff, width: 2.5, alpha: Math.max(0, 1 - t * 2.2) });
        // Mid orange ring
        const r2 = baseR * (0.08 + t * 1.05);
        g.circle(ep.x, ep.y, r2).stroke({ color: 0xff7700, width: 3, alpha: Math.max(0, 1 - t * 1.4) });
        // Outer slow ring
        const r3 = baseR * t;
        g.circle(ep.x, ep.y, r3).stroke({ color: 0xff2200, width: 2, alpha: Math.max(0, 1 - t * 1.7) });
        // Inner fill glow fading out
        if (t < 0.4) {
          g.circle(ep.x, ep.y, r1 * 0.45).fill({ color: 0xffaa22, alpha: Math.max(0, (0.4 - t) * 2.5 * 0.6) });
        }
        // Debris sparks (8 radial points)
        const NUM_SPARKS = 8;
        for (let si = 0; si < NUM_SPARKS; si++) {
          const angle = (si / NUM_SPARKS) * Math.PI * 2 + t * 0.5;
          const sparkR = baseR * t * 0.75;
          const sx = ep.x + Math.cos(angle) * sparkR;
          const sy = ep.y + Math.sin(angle) * sparkR;
          const sparkAlpha = Math.max(0, 1 - t * 1.8);
          g.circle(sx, sy, Math.max(0.5, 2.5 * (1 - t))).fill({ color: 0xffcc44, alpha: sparkAlpha });
        }
      }
    }

    // ── World items (salvage drops) ───────────────────────────────────────
    if (data.worldItems && data.worldItems.length > 0) {
      for (const wi of data.worldItems) {
        const wp = w2s(wi.position.x, wi.position.y);
        // Pulse: brighten briefly near the start, then fade out in the last 20%
        const pulse = wi.ageFrac < 0.1
          ? 0.6 + wi.ageFrac * 4         // quick fade-in
          : wi.ageFrac > 0.8
            ? 1 - (wi.ageFrac - 0.8) * 5 // fade out at end
            : 1;
        const alpha = Math.max(0, pulse);
        const size = Math.max(1.5, 5 * kmToPx);
        // Diamond shape
        g.moveTo(wp.x, wp.y - size)
          .lineTo(wp.x + size, wp.y)
          .lineTo(wp.x, wp.y + size)
          .lineTo(wp.x - size, wp.y)
          .closePath()
          .fill({ color: 0x88ffaa, alpha: alpha * 0.5 })
          .stroke({ color: 0xaaffcc, width: 1, alpha: alpha * 0.85 });
      }
    }

    // ── Roll afterimage streaks ───────────────────────────────────────────
    if (data.rollFx && data.rollFx.length > 0) {
      for (const rfx of data.rollFx) {
        const rp = w2s(rfx.x, rfx.y);
        const t = rfx.ageFrac;
        const alpha = Math.max(0, 1 - t * t * 2);
        const radius = Math.max(0.5, (5 - t * 3) * kmToPx * 3);
        g.circle(rp.x, rp.y, radius).fill({ color: 0x88ddff, alpha: alpha * 0.7 });
        // Short directional tail
        const tailLen = (1 - t) * 8 * kmToPx;
        g.moveTo(rp.x, rp.y)
          .lineTo(rp.x - rfx.dx * tailLen, rp.y - rfx.dy * tailLen)
          .stroke({ color: 0xaaeeff, width: Math.max(0.5, radius * 0.6), alpha: alpha * 0.5 });
      }
    }

    // ── Damage flash overlay ──────────────────────────────────────────────
    if (data.damageFlash > 0) {
      g.rect(0, 0, this.width, this.height)
        .fill({ color: 0xff0000, alpha: data.damageFlash * 0.25 });
    }

    // ── Death fade to black ───────────────────────────────────────────────
    if ((data.deathFade ?? 0) > 0) {
      g.rect(0, 0, this.width, this.height)
        .fill({ color: 0x000000, alpha: data.deathFade! });
    }

    // ── HUD: player health + shield bars (bottom-left) ────────────────────
    {
      const hudX = 16;
      const hudY = this.height - 56;
      const barW = 160;
      const barH = 12;

      // Shield bar (blue)
      const shieldRatio = data.playerMaxShield > 0 ? data.playerShield / data.playerMaxShield : 0;
      g.rect(hudX, hudY, barW, barH).fill({ color: 0x111133, alpha: 0.75 });
      g.rect(hudX, hudY, barW * shieldRatio, barH).fill({ color: 0x3399ff, alpha: 0.9 });
      g.rect(hudX, hudY, barW, barH).stroke({ color: 0x3399ff, width: 1, alpha: 0.5 });

      // Health bar (green / red)
      const healthRatio = data.playerMaxHealth > 0 ? data.playerHealth / data.playerMaxHealth : 0;
      const healthColor = healthRatio > 0.25 ? 0x44ff66 : 0xff3333;
      g.rect(hudX, hudY + barH + 4, barW, barH).fill({ color: 0x113311, alpha: 0.75 });
      g.rect(hudX, hudY + barH + 4, barW * healthRatio, barH).fill({ color: healthColor, alpha: 0.9 });
      g.rect(hudX, hudY + barH + 4, barW, barH).stroke({ color: healthColor, width: 1, alpha: 0.5 });

      // Roll cooldown pip (small square, right of health bar)
      const rollCd = data.rollCooldownFrac ?? 0;
      const pipX = hudX + barW + 8;
      const pipY = hudY + 4;
      const pipSize = barH + 8;
      g.rect(pipX, pipY, pipSize, pipSize).fill({ color: 0x111122, alpha: 0.75 });
      if (rollCd < 1) {
        const fillH = pipSize * (1 - rollCd);
        g.rect(pipX, pipY + pipSize - fillH, pipSize, fillH).fill({ color: rollCd < 0.01 ? 0x88ddff : 0x334466, alpha: 0.9 });
      }
      g.rect(pipX, pipY, pipSize, pipSize).stroke({ color: 0x4499cc, width: 1, alpha: 0.6 });

      // Projected shield bar (cyan, below health bar)
      if (data.projectedShield) {
        const ps = data.projectedShield;
        const psRatio = ps.maxHp > 0 ? ps.hp / ps.maxHp : 0;
        const psColor = psRatio > 0.25 ? 0x22aaff : 0xff9900;
        const psY = hudY + (barH + 4) * 2;
        g.rect(hudX, psY, barW, barH).fill({ color: 0x001133, alpha: 0.75 });
        g.rect(hudX, psY, barW * psRatio, barH).fill({ color: psColor, alpha: 0.85 });
        g.rect(hudX, psY, barW, barH).stroke({ color: psColor, width: 1, alpha: 0.4 });
      }
      // Station shield bars (teal, compact, one per friendly station with a projector).
      if (data.stationShields && data.stationShields.length > 0) {
        const ssBarW = barW * 0.7;
        data.stationShields.forEach((ss, i) => {
          const ssRatio = ss.maxHp > 0 ? ss.hp / ss.maxHp : 0;
          const ssColor = ssRatio > 0.25 ? 0x00ccaa : 0xff9900;
          const rowOffset = data.projectedShield ? 3 : 2;
          const ssY = hudY + (barH + 4) * (rowOffset + i);
          g.rect(hudX, ssY, ssBarW, barH).fill({ color: 0x001a16, alpha: 0.75 });
          g.rect(hudX, ssY, ssBarW * ssRatio, barH).fill({ color: ssColor, alpha: 0.8 });
          g.rect(hudX, ssY, ssBarW, barH).stroke({ color: ssColor, width: 1, alpha: 0.35 });
        });
      }

      // Cargo bar (yellow, right of roll pip)
      const cap = data.cargoCapacity ?? 0;
      const used = data.cargoUsed ?? 0;
      if (cap > 0) {
        const cargoX = pipX + pipSize + 8;
        const cargoRatio = Math.min(1, used / cap);
        const cargoColor = cargoRatio >= 1 ? 0xff6633 : 0xffcc44;
        g.rect(cargoX, hudY, barW * 0.6, barH).fill({ color: 0x222200, alpha: 0.75 });
        g.rect(cargoX, hudY, barW * 0.6 * cargoRatio, barH).fill({ color: cargoColor, alpha: 0.9 });
        g.rect(cargoX, hudY, barW * 0.6, barH).stroke({ color: cargoColor, width: 1, alpha: 0.5 });
      }
    }

    // ── HUD: system name banner + approach prompt ─────────────────────────
    this.solarSystemNameText.text = data.currentSystemName.toUpperCase();

    if (data.nearbyLocations.length > 0) {
      const id = data.nearbyLocations[0]!;
      const loc = data.locations.find((l) => l.id === id);
      this.solarApproachText.text = `[ENTER] DOCK — ${loc?.name ?? "STATION"}`;
      this.solarApproachText.style.fill = 0x66ff66;
      this.solarApproachText.visible = true;
    } else if (data.nearbyGateId) {
      const gate = data.gates.find((g2) => g2.id === data.nearbyGateId);
      this.solarApproachText.text = `[ENTER] JUMP — ${gate?.destinationSystemName ?? "GATE"}`;
      this.solarApproachText.style.fill = 0xffff66;
      this.solarApproachText.visible = true;
    } else {
      this.solarApproachText.visible = false;
    }

    // ── HUD: rescue button / status ──────────────────────────────────────
    {
      const RX = 490, RY = 648, RW = 300, RH = 36;
      const cx = RX + RW / 2, cy = RY + RH / 2;
      if (data.playerStranded && !data.rescuePending) {
        // Pulse the button border
        const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 300);
        g.roundRect(RX, RY, RW, RH, 6)
          .fill({ color: 0x220000, alpha: 0.82 })
          .stroke({ color: 0xff4400, width: 2, alpha: pulse });
        this.solarRescueText.text = "⚠  ENGINES OFFLINE  —  CALL RESCUE";
        this.solarRescueText.style.fill = 0xff6622;
        this.solarRescueText.x = cx;
        this.solarRescueText.y = cy;
        this.solarRescueText.visible = true;
      } else if (data.rescuePending) {
        const towing = data.friendlyShips?.some(s => s.isRescue && s.rescueTowing) ?? false;
        g.roundRect(RX, RY, RW, RH, 6)
          .fill({ color: 0x001a22, alpha: 0.82 })
          .stroke({ color: 0x00ccff, width: 1.5, alpha: 0.7 });
        this.solarRescueText.text = towing ? "BEING TOWED TO STATION" : "RESCUE EN ROUTE";
        this.solarRescueText.style.fill = 0x44ddff;
        this.solarRescueText.x = cx;
        this.solarRescueText.y = cy;
        this.solarRescueText.visible = true;
      } else {
        this.solarRescueText.visible = false;
      }
    }

    // Galaxy map overlay (M)
    if (data.mapOpen && data.galaxyMap) {
      this.drawGalaxyMap(g, data.galaxyMap);
    } else {
      // Hide all galaxy-map labels when map is closed
      for (const t of this.galaxySystemLabels) t.visible = false;
    }

    // ── Zoom bar (left edge, always visible unless map open) ─────────────
    if (!data.mapOpen && data.zoomBar) {
      this.drawZoomBar(g, data.zoomBar);
    } else {
      for (const t of this.zoomBarLabel) t.visible = false;
    }

    // ── Speed / warp bar (bottom centre, always visible unless map/docked) ──
    if (!data.mapOpen && !data.docked) {
      this.drawSpeedWarpBar(g, data);
    }

    // ── Stagger indicator (top-right corner when active) ──────────────────
    if (data.weaponStaggerActive) {
      const W = this.width;
      g.roundRect(W - 102, 6, 96, 20, 4).fill({ color: 0x0a1e10, alpha: 0.9 }).stroke({ color: 0x44ff88, width: 1 });
      this.ensureTextPool(this.zoomBarLabel, 2, 11);
      const staggerLbl = this.zoomBarLabel[1]!;
      staggerLbl.text = "STAGGER ON";
      staggerLbl.x = W - 54;
      staggerLbl.y = 16;
      staggerLbl.anchor.set(0.5, 0.5);
      staggerLbl.style.fill = 0x66ffaa;
      staggerLbl.style.fontSize = 10;
      staggerLbl.visible = true;
    } else {
      const lbl = this.zoomBarLabel[1];
      if (lbl) lbl.visible = false;
    }

    // ── Virtual touch controls (touch devices only) ───────────────────────
    if (!data.mapOpen && this.isTouchDevice) {
      this.drawSolarVirtualControls(g, data.virtualControls);
    }
  }

  private drawSpeedWarpBar(g: Graphics, data: SolarSystemRenderData): void {
    const cx = this.width / 2;
    const barH = 10;
    const barW = 340;
    const barY = this.height - barH - 6;
    const barX = cx - barW / 2;
    const radius = 5;

    const NORMAL_MAX_SPEED_MS = 10000;
    const speed = Math.hypot(data.playerVelocity.x, data.playerVelocity.y);
    const warpIntensity = data.warpIntensity ?? 0;
    const warpCharge = data.warpChargeFraction ?? 0;

    let fraction: number;
    let fillColor: number;
    let labelColor: number;
    let labelText: string;

    if (warpIntensity > 0) {
      fraction = warpIntensity;
      fillColor = 0x00eeff;
      labelColor = 0x00eeff;
      labelText = warpIntensity >= 0.98 ? "WARP DRIVE" : "WARP DISENGAGING";
    } else if (warpCharge > 0) {
      fraction = warpCharge;
      fillColor = 0xff9900;
      labelColor = 0xff9900;
      labelText = "CHARGING WARP";
    } else {
      fraction = Math.min(1, speed / NORMAL_MAX_SPEED_MS);
      // green at low speed → yellow → orange-red at high
      const t = fraction;
      const r = Math.round(Math.min(0xff, t * 2 * 0xff));
      const gr = Math.round(Math.min(0xcc, (1 - Math.max(0, t - 0.5) * 2) * 0xcc));
      fillColor = (r << 16) | (gr << 8) | 0x11;
      labelColor = 0x88aacc;
      const km_s = speed / 1000;
      labelText = km_s < 10 ? `${km_s.toFixed(1)} km/s` : `${Math.round(km_s)} km/s`;
    }

    // Track
    g.roundRect(barX, barY, barW, barH, radius)
      .fill({ color: 0x000e1a, alpha: 0.80 })
      .stroke({ color: 0x224455, width: 1, alpha: 0.7 });

    // Fill
    if (fraction > 0.005) {
      const fillW = Math.max(radius * 2, barW * fraction);
      g.roundRect(barX, barY, fillW, barH, radius)
        .fill({ color: fillColor, alpha: warpIntensity > 0 ? 0.92 : 0.78 });
    }

    // Subtle animated shimmer when warp is fully active
    if (warpIntensity >= 0.98) {
      const shimmer = 0.06 + 0.05 * Math.sin(Date.now() / 150);
      g.roundRect(barX, barY, barW, barH, radius)
        .fill({ color: 0xffffff, alpha: shimmer });
    }

    // Label above the bar
    this.solarSpeedBarLabel.text = labelText;
    this.solarSpeedBarLabel.style.fill = labelColor;
    this.solarSpeedBarLabel.x = cx;
    this.solarSpeedBarLabel.y = barY - 2;
    this.solarSpeedBarLabel.visible = true;
  }

  private drawZoomBar(g: Graphics, bar: { fraction: number; label: string }): void {
    const x = 12, top = 110, bottom = 540, w = 28;
    const h = bottom - top;
    const handleY = bottom - bar.fraction * h;

    // Track background
    g.roundRect(x, top, w, h, 6).fill({ color: 0x001830, alpha: 0.75 });
    g.roundRect(x, top, w, h, 6).stroke({ color: 0x224455, width: 1, alpha: 0.8 });

    // Filled portion (below handle)
    const fillH = bottom - handleY;
    if (fillH > 0) {
      g.roundRect(x + 2, handleY, w - 4, fillH, 4).fill({ color: 0x006688, alpha: 0.7 });
    }

    // Notch marks at 25% intervals
    for (let tick = 1; tick < 4; tick++) {
      const ty = bottom - (tick / 4) * h;
      g.moveTo(x + 4, ty).lineTo(x + w - 4, ty).stroke({ color: 0x334455, width: 0.8, alpha: 0.6 });
    }

    // Draggable handle
    const hcx = x + w / 2;
    g.circle(hcx, handleY, 9).fill({ color: 0x00ccff, alpha: 0.85 });
    g.circle(hcx, handleY, 9).stroke({ color: 0x00ffff, width: 1.5, alpha: 0.9 });
    g.circle(hcx, handleY, 4).fill({ color: 0xffffff, alpha: 0.6 });

    // Plus / minus labels
    g.moveTo(hcx - 4, top - 14).lineTo(hcx + 4, top - 14).stroke({ color: 0x00ccff, width: 1.5, alpha: 0.8 });
    g.moveTo(hcx, top - 18).lineTo(hcx, top - 10).stroke({ color: 0x00ccff, width: 1.5, alpha: 0.8 });
    g.moveTo(hcx - 4, bottom + 10).lineTo(hcx + 4, bottom + 10).stroke({ color: 0x00ccff, width: 1.5, alpha: 0.8 });

    // Zoom level label below the bar (anchor is 0.5,0.5 — position is center)
    this.ensureTextPool(this.zoomBarLabel, 1, 12);
    const lbl = this.zoomBarLabel[0];
    if (lbl) {
      lbl.visible = true;
      lbl.text = bar.label;
      lbl.style.fill = 0x00ccff;
      lbl.style.fontSize = 12;
      lbl.x = x + w / 2;
      lbl.y = bottom + 24;
    }
  }

  private drawSolarVirtualControls(
    g: Graphics,
    vc?: { thrustActive: boolean; leftActive: boolean; rightActive: boolean; fireActive: boolean },
  ): void {
    const alpha = 0.55;
    const activeAlpha = 0.9;
    const btnBorder = 0x336688;
    const activeBorder = 0x00ffff;

    const drawBtn = (
      x: number, y: number, w: number, h: number,
      label: string, active: boolean,
    ): void => {
      g.roundRect(x, y, w, h, 10)
        .fill({ color: active ? 0x003355 : 0x000e1a, alpha: active ? activeAlpha : alpha })
        .stroke({ color: active ? activeBorder : btnBorder, width: active ? 2 : 1 });
      // Label drawn via solarSystemGfx — we'll use a small rect + text trick:
      // Since we can't add Text nodes dynamically here, draw an inner indicator shape
      if (label === "▲") {
        g.moveTo(x + w / 2, y + h * 0.22)
          .lineTo(x + w * 0.72, y + h * 0.72)
          .lineTo(x + w * 0.28, y + h * 0.72)
          .lineTo(x + w / 2, y + h * 0.22)
          .fill({ color: active ? 0x00ffff : 0x4499aa, alpha: active ? 1 : 0.7 });
      } else if (label === "◄") {
        g.moveTo(x + w * 0.72, y + h * 0.28)
          .lineTo(x + w * 0.28, y + h / 2)
          .lineTo(x + w * 0.72, y + h * 0.72)
          .lineTo(x + w * 0.72, y + h * 0.28)
          .fill({ color: active ? 0x00ffff : 0x4499aa, alpha: active ? 1 : 0.7 });
      } else if (label === "►") {
        g.moveTo(x + w * 0.28, y + h * 0.28)
          .lineTo(x + w * 0.72, y + h / 2)
          .lineTo(x + w * 0.28, y + h * 0.72)
          .lineTo(x + w * 0.28, y + h * 0.28)
          .fill({ color: active ? 0x00ffff : 0x4499aa, alpha: active ? 1 : 0.7 });
      } else {
        // "FIRE" — crosshair
        const cx2 = x + w / 2, cy2 = y + h / 2, r = Math.min(w, h) * 0.28;
        g.circle(cx2, cy2, r).stroke({ color: active ? 0xff4400 : 0x884422, width: active ? 3 : 2 });
        g.moveTo(cx2 - r * 1.4, cy2).lineTo(cx2 + r * 1.4, cy2)
          .stroke({ color: active ? 0xff4400 : 0x884422, width: active ? 2 : 1 });
        g.moveTo(cx2, cy2 - r * 1.4).lineTo(cx2, cy2 + r * 1.4)
          .stroke({ color: active ? 0xff4400 : 0x884422, width: active ? 2 : 1 });
      }
    };

    // D-pad (bottom-left)
    drawBtn(10,  590, 100, 100, "◄", vc?.leftActive ?? false);   // Turn left
    drawBtn(120, 530, 100, 100, "▲", vc?.thrustActive ?? false); // Thrust
    drawBtn(230, 590, 100, 100, "►", vc?.rightActive ?? false);  // Turn right

    // Fire (bottom-right)
    drawBtn(1150, 555, 120, 150, "●", vc?.fireActive ?? false);
  }

  private drawNebulaBackground(g: Graphics): void {
    // Draw gradient nebula background
    g.rect(0, 0, this.width, this.height).fill({ color: 0x0a0020, alpha: 1 }); // Dark blue-purple base

    // Draw nebula clouds with varying colors
    const nebulaClouds = [
      { x: this.width * 0.2, y: this.height * 0.3, color: 0x6600cc, size: 400 }, // Purple
      { x: this.width * 0.7, y: this.height * 0.2, color: 0xff0066, size: 350 }, // Pink/Magenta
      { x: this.width * 0.4, y: this.height * 0.7, color: 0x0066ff, size: 380 }, // Blue
      { x: this.width * 0.8, y: this.height * 0.6, color: 0xff6600, size: 320 }, // Orange
    ];

    for (const cloud of nebulaClouds) {
      g.circle(cloud.x, cloud.y, cloud.size).fill({ color: cloud.color, alpha: 0.08 });
    }

    // Add some distant stars scattered across background
    const starCount = 50;
    for (let i = 0; i < starCount; i++) {
      const x = (i * 73) % this.width; // Pseudo-random but deterministic
      const y = ((i * 127) % this.height);
      const size = 0.5 + ((i % 3) * 0.5);
      g.circle(x, y, size).fill({ color: 0xffffff, alpha: 0.6 });
    }
  }

  private drawDeltaWing(
    g: Graphics,
    centerX: number,
    centerY: number,
    headingDegrees: number,
    hullColor = 0x00ffff,
    scale = 1,
  ): void {
    // Convert heading to radians for drawing
    const headingRad = (headingDegrees * Math.PI) / 180;

    // Ship dimensions
    const len = 16 * scale; // nose-to-tail
    const width = 10 * scale; // wing-to-wing

    // Calculate ship orientation vectors
    const forwardX = Math.sin(headingRad);
    const forwardY = -Math.cos(headingRad);
    const rightX = Math.cos(headingRad);
    const rightY = Math.sin(headingRad);

    // Calculate ship points (delta-wing fighter shape)
    const nose = {
      x: centerX + forwardX * len,
      y: centerY + forwardY * len,
    };

    const wingLeft = {
      x: centerX - rightX * width - forwardX * (len * 0.5),
      y: centerY - rightY * width - forwardY * (len * 0.5),
    };

    const wingRight = {
      x: centerX + rightX * width - forwardX * (len * 0.5),
      y: centerY + rightY * width - forwardY * (len * 0.5),
    };

    const tail = {
      x: centerX - forwardX * (len * 0.3),
      y: centerY - forwardY * (len * 0.3),
    };

    // Draw main hull
    g.moveTo(nose.x, nose.y);
    g.lineTo(wingLeft.x, wingLeft.y);
    g.lineTo(tail.x, tail.y);
    g.lineTo(wingRight.x, wingRight.y);
    g.lineTo(nose.x, nose.y);
    g.fill({ color: hullColor, alpha: 0.9 });
    g.stroke({ color: hullColor === 0x00ffff ? 0x00ff99 : hullColor, width: 2 * scale, alpha: 1 });

    // Draw cockpit (brighter accent)
    const cockpitX = centerX + forwardX * (len * 0.4);
    const cockpitY = centerY + forwardY * (len * 0.4);
    g.circle(cockpitX, cockpitY, 3).fill({ color: 0xffff00, alpha: 1 });

    // Draw engine glow at tail
    const engineX = centerX - forwardX * (len * 0.25);
    const engineY = centerY - forwardY * (len * 0.25);
    g.circle(engineX, engineY, 2).fill({ color: 0xff6600, alpha: 0.8 });
  }

  /** Colors used in the ship-builder RIGHT-PANEL palette list only (not in-game ships). */
  static readonly MODULE_TYPE_COLORS: Record<string, number> = {
    core: 0x00ccff,
    weapon: 0xff3300,
    external: 0x4499ff,
    internal: 0x44ff88,
    structure: 0x888888,
    converter: 0xaa44ff,
  };

  /**
   * Render a blueprint-based polygon ship with detailed functional visuals per module type.
   * `modules` are in blueprint-pixel space centered at (0,0); heading is applied as a 2-D
   * rotation, then scaled by `bpScale` and translated to (cx,cy).
   */
  private drawBlueprintShip(
    g: Graphics,
    cx: number,
    cy: number,
    headingDeg: number,
    modules: ReadonlyArray<{
      vertices: ReadonlyArray<{ x: number; y: number }>;
      worldX: number;
      worldY: number;
      moduleType: string;
      partKind: string;
      grade: number;
      placedId?: string;
    }>,
    bpScale: number,
    palette?: FactionColors,
    destroyedIds?: ReadonlySet<string>,
    hpFractions?: ReadonlyMap<string, number>,
  ): void {
    const p = palette ?? getFactionColors();
    const h = (headingDeg * Math.PI) / 180;
    const cosH = Math.cos(h);
    const sinH = Math.sin(h);
    const rot = (v: { x: number; y: number }) => ({
      x: cx + (v.x * cosH - v.y * sinH) * bpScale,
      y: cy + (v.x * sinH + v.y * cosH) * bpScale,
    });

    // Darken a 24-bit RGB color by factor f (0=black, 1=unchanged).
    const dk = (c: number, f: number): number => {
      const r = Math.min(255, Math.round(((c >> 16) & 0xff) * f));
      const gv = Math.min(255, Math.round(((c >> 8) & 0xff) * f));
      const b = Math.min(255, Math.round((c & 0xff) * f));
      return (r << 16) | (gv << 8) | b;
    };
    // All module types derive from the faction hull color — each tier is slightly darker.
    const hullByType: Record<string, number> = {
      core:      p.hull.fill,
      weapon:    dk(p.hull.fill, 0.78),
      external:  dk(p.hull.fill, 0.72),
      internal:  dk(p.hull.fill, 0.66),
      structure: dk(p.hull.fill, 0.60),
      converter: dk(p.hull.fill, 0.55),
      factory:   dk(p.hull.fill, 0.62),
    };

    for (const mod of modules) {
      if (mod.vertices.length < 3) continue;
      // Skip destroyed modules entirely
      if (mod.placedId && destroyedIds?.has(mod.placedId)) continue;

      const pts = mod.vertices.map(rot);
      const N = pts.length;

      // Module centroid in screen space
      const mx = pts.reduce((s, p) => s + p.x, 0) / N;
      const my = pts.reduce((s, p) => s + p.y, 0) / N;

      // Average circumradius
      const R = pts.reduce((s, p) => s + Math.hypot(p.x - mx, p.y - my), 0) / N;

      // Damage state: HP fraction drives tint overlay
      const hpFrac = mod.placedId ? (hpFractions?.get(mod.placedId) ?? 1) : 1;

      // Outward direction: from ship center (cx,cy) to module centroid
      const ddx = mx - cx, ddy = my - cy, ddist = Math.hypot(ddx, ddy);
      const outX = ddist > 0.5 ? ddx / ddist : sinH;
      const outY = ddist > 0.5 ? ddy / ddist : -cosH;
      const perpX = -outY, perpY = outX;

      // Grade palette for physical material + effect colors
      const gp = getGradeColors(mod.grade);

      // ── Base hull polygon ──────────────────────────────────────────────
      const hullColor = hullByType[mod.moduleType] ?? 0x0d1218;
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < N; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
      g.closePath().fill({ color: hullColor, alpha: 0.95 });
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < N; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
      g.closePath().stroke({ color: p.hull.edge, width: 0.7, alpha: 0.85 });

      // Damage tint overlay: orange below 40%, deep red below 15%
      if (hpFrac < 0.4) {
        const tintColor = hpFrac < 0.15 ? 0xff2200 : 0xff6600;
        const tintAlpha = hpFrac < 0.15 ? 0.55 : 0.30 + (0.4 - hpFrac) * 0.5;
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < N; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
        g.closePath().fill({ color: tintColor, alpha: tintAlpha });
      }

      // ── Per-kind detail ────────────────────────────────────────────────

      if (mod.partKind === "core") {
        // Concentric reactor rings with spokes — grade colors for inner glow
        g.circle(mx, my, R * 0.62).stroke({ color: p.reactor.ring, width: 0.8, alpha: 0.7 });
        g.circle(mx, my, R * 0.40).fill({ color: gp.surface, alpha: 0.8 });
        g.circle(mx, my, R * 0.40).stroke({ color: p.reactor.ring, width: 0.6, alpha: 0.6 });
        g.circle(mx, my, R * 0.22).fill({ color: gp.highlight, alpha: 0.4 });
        g.circle(mx, my, R * 0.08).fill({ color: gp.effect, alpha: 0.95 });
        g.circle(mx, my, R * 0.03).fill({ color: 0xffffff, alpha: 1 });
        for (const pt of pts) {
          const smx = (mx + pt.x) * 0.5, smy = (my + pt.y) * 0.5;
          g.moveTo(mx, my).lineTo(smx, smy).stroke({ color: p.engine.glow, width: 0.5, alpha: 0.55 });
          g.circle(smx, smy, R * 0.04).fill({ color: p.reactor.ring, alpha: 0.6 });
        }
        for (const pt of pts) g.circle(pt.x, pt.y, R * 0.04).fill({ color: p.lights, alpha: 0.8 });

      } else if (mod.partKind === "cannon") {
        // Trapezoidal barrel, grade material, grade muzzle
        const bBase = R * 0.15, bTip = R * 1.15, hw = R * 0.20;
        const bx0 = mx + outX * bBase, by0 = my + outY * bBase;
        const bxtip = mx + outX * bTip, bytip = my + outY * bTip;
        g.moveTo(bx0 + perpX * hw,       by0 + perpY * hw)
         .lineTo(bxtip + perpX * hw * 0.5, bytip + perpY * hw * 0.5)
         .lineTo(bxtip - perpX * hw * 0.5, bytip - perpY * hw * 0.5)
         .lineTo(bx0 - perpX * hw,        by0 - perpY * hw)
         .closePath().fill({ color: gp.surface, alpha: 0.95 });
        g.moveTo(bx0 + perpX * hw, by0 + perpY * hw)
         .lineTo(bxtip + perpX * hw * 0.5, bytip + perpY * hw * 0.5)
         .stroke({ color: gp.highlight, width: 0.7, alpha: 0.8 });
        for (let ri = 0; ri < 3; ri++) {
          const t = 0.3 + ri * 0.28;
          const rx = mx + outX * R * (0.15 + t), ry = my + outY * R * (0.15 + t);
          const rw = hw * (1.1 - ri * 0.1);
          g.moveTo(rx + perpX * rw, ry + perpY * rw).lineTo(rx - perpX * rw, ry - perpY * rw)
           .stroke({ color: gp.highlight, width: 0.8, alpha: 0.75 });
        }
        g.circle(bxtip, bytip, R * 0.22).fill({ color: gp.glow, alpha: 0.20 });
        g.circle(bxtip, bytip, R * 0.12).fill({ color: gp.effect, alpha: 0.60 });
        g.circle(bxtip, bytip, R * 0.055).fill({ color: gp.effect, alpha: 0.95 });
        g.circle(bxtip, bytip, R * 0.022).fill({ color: 0xffffff, alpha: 1 });
        g.circle(mx - outX * R * 0.18, my - outY * R * 0.18, R * 0.25)
         .fill({ color: gp.surface, alpha: 0.9 }).stroke({ color: p.hull.edge, width: 0.5, alpha: 0.7 });

      } else if (mod.partKind === "laser") {
        // Long slim emitter spine — no rings, focusing crystal at tip
        const spineTip = R * 1.25, spineBase = R * 0.15, hw = R * 0.08;
        const sx0 = mx + outX * spineBase, sy0 = my + outY * spineBase;
        const sxtip = mx + outX * spineTip, sytip = my + outY * spineTip;
        // Emitter spine
        g.moveTo(sx0 + perpX * hw, sy0 + perpY * hw)
         .lineTo(sxtip + perpX * hw * 0.3, sytip + perpY * hw * 0.3)
         .lineTo(sxtip - perpX * hw * 0.3, sytip - perpY * hw * 0.3)
         .lineTo(sx0 - perpX * hw, sy0 - perpY * hw)
         .closePath().fill({ color: gp.surface, alpha: 0.95 });
        g.moveTo(sx0 + perpX * hw, sy0 + perpY * hw)
         .lineTo(sxtip + perpX * hw * 0.3, sytip + perpY * hw * 0.3)
         .stroke({ color: gp.highlight, width: 0.7, alpha: 0.9 });
        // Focusing crystal lens
        g.circle(sxtip, sytip, R * 0.16).fill({ color: gp.effect, alpha: 0.35 });
        g.circle(sxtip, sytip, R * 0.10).fill({ color: gp.effect, alpha: 0.80 });
        g.circle(sxtip, sytip, R * 0.04).fill({ color: 0xffffff, alpha: 1.0 });
        // Lens beam forward
        g.moveTo(sxtip, sytip)
         .lineTo(sxtip + outX * R * 0.5, sytip + outY * R * 0.5)
         .stroke({ color: gp.effect, width: 0.8, alpha: 0.5 });
        // Optic housing block at base
        g.circle(mx - outX * R * 0.1, my - outY * R * 0.1, R * 0.22)
         .fill({ color: gp.surface, alpha: 0.85 }).stroke({ color: gp.highlight, width: 0.5, alpha: 0.6 });
        // Faction-colored trim light
        g.circle(mx, my, R * 0.06).fill({ color: p.lights, alpha: 0.7 });

      } else if (mod.partKind === "torpedo") {
        // Rectangular launcher tube array — 3 openings
        const tubeW = R * 0.55, tubeH = R * 0.80;
        const tx = mx + outX * R * 0.2, ty = my + outY * R * 0.2;
        g.rect(tx - perpX * tubeW - outX * tubeH * 0.5, ty - perpY * tubeW - outY * tubeH * 0.5,
               perpX * tubeW * 2 + outX * tubeH, perpY === 0 ? tubeH : perpX * tubeW * 2 + outY * tubeH);
        // Draw tube array as 3 circular openings
        for (let ti = -1; ti <= 1; ti++) {
          const tx2 = mx + outX * R * 0.55 + perpX * ti * R * 0.28;
          const ty2 = my + outY * R * 0.55 + perpY * ti * R * 0.28;
          g.circle(tx2, ty2, R * 0.14).fill({ color: 0x050505, alpha: 0.95 });
          g.circle(tx2, ty2, R * 0.14).stroke({ color: gp.surface, width: 0.8, alpha: 0.9 });
          g.circle(tx2, ty2, R * 0.07).fill({ color: gp.effect, alpha: 0.55 });
        }
        // Housing body fill
        g.moveTo(mx + outX * R * 0.1 - perpX * R * 0.45, my + outY * R * 0.1 - perpY * R * 0.45)
         .lineTo(mx + outX * R * 0.8 - perpX * R * 0.45, my + outY * R * 0.8 - perpY * R * 0.45)
         .lineTo(mx + outX * R * 0.8 + perpX * R * 0.45, my + outY * R * 0.8 + perpY * R * 0.45)
         .lineTo(mx + outX * R * 0.1 + perpX * R * 0.45, my + outY * R * 0.1 + perpY * R * 0.45)
         .closePath().stroke({ color: gp.surface, width: 1.0, alpha: 0.7 });
        g.circle(mx, my, R * 0.06).fill({ color: p.lights, alpha: 0.7 });

      } else if (mod.partKind === "plasma") {
        // Plasma containment globe wrapped in coils
        const globeX = mx + outX * R * 0.55, globeY = my + outY * R * 0.55;
        // Containment strut
        g.moveTo(mx - outX * R * 0.1, my - outY * R * 0.1)
         .lineTo(globeX, globeY).stroke({ color: gp.surface, width: 1.0, alpha: 0.8 });
        // Coil rings around globe
        for (let ci = 0; ci < 3; ci++) {
          const ca = Math.atan2(outY, outX) + (ci - 1) * 0.55;
          g.moveTo(globeX - Math.cos(ca) * R * 0.40, globeY - Math.sin(ca) * R * 0.40)
           .lineTo(globeX + Math.cos(ca) * R * 0.40, globeY + Math.sin(ca) * R * 0.40)
           .stroke({ color: gp.highlight, width: 1.2, alpha: 0.75 });
        }
        g.circle(globeX, globeY, R * 0.34).fill({ color: gp.glow, alpha: 0.25 });
        g.circle(globeX, globeY, R * 0.22).fill({ color: gp.effect, alpha: 0.55 });
        g.circle(globeX, globeY, R * 0.10).fill({ color: 0xffffff, alpha: 0.9 });
        g.circle(mx, my, R * 0.06).fill({ color: p.lights, alpha: 0.7 });

      } else if (mod.partKind === "radar") {
        // Parabolic dish on mounting strut
        const dishX = mx + outX * R * 0.50, dishY = my + outY * R * 0.50;
        g.moveTo(mx - outX * R * 0.1, my - outY * R * 0.1)
         .lineTo(dishX, dishY).stroke({ color: gp.surface, width: 0.9, alpha: 0.75 });
        // Dish arc
        const dishAng = Math.atan2(outY, outX);
        const da = 0.9;
        g.moveTo(dishX + Math.cos(dishAng - da) * R * 0.42, dishY + Math.sin(dishAng - da) * R * 0.42)
         .arc(dishX, dishY, R * 0.42, dishAng - da, dishAng + da)
         .stroke({ color: gp.highlight, width: 1.2, alpha: 0.85 });
        // Dish fill line across
        g.moveTo(dishX + Math.cos(dishAng - da) * R * 0.42, dishY + Math.sin(dishAng - da) * R * 0.42)
         .lineTo(dishX + Math.cos(dishAng + da) * R * 0.42, dishY + Math.sin(dishAng + da) * R * 0.42)
         .stroke({ color: gp.surface, width: 0.7, alpha: 0.6 });
        // Radar sweep arcs (faction beam color)
        for (let ai = 1; ai <= 2; ai++) {
          const sr = R * (0.55 + ai * 0.2);
          g.moveTo(dishX + Math.cos(dishAng - 0.35) * sr, dishY + Math.sin(dishAng - 0.35) * sr)
           .arc(dishX, dishY, sr, dishAng - 0.35, dishAng + 0.35)
           .stroke({ color: p.sensors.beam, width: 0.5, alpha: 0.45 - ai * 0.1 });
        }
        // Dish center feed
        g.circle(dishX, dishY, R * 0.06).fill({ color: p.sensors.lens, alpha: 0.9 });

      } else if (mod.partKind === "lidar") {
        // Fan of 5 thin pointed sensor rods
        const baseAng = Math.atan2(outY, outX);
        for (let li = -2; li <= 2; li++) {
          const la = baseAng + li * 0.22;
          const tipDist = R * (1.0 - Math.abs(li) * 0.08);
          const lx = mx + Math.cos(la) * tipDist, ly = my + Math.sin(la) * tipDist;
          g.moveTo(mx + outX * R * 0.12, my + outY * R * 0.12)
           .lineTo(lx, ly).stroke({ color: gp.surface, width: 0.9, alpha: 0.8 });
          g.circle(lx, ly, R * 0.06).fill({ color: gp.effect, alpha: li === 0 ? 0.9 : 0.6 });
        }
        // Central housing
        g.circle(mx + outX * R * 0.12, my + outY * R * 0.12, R * 0.15)
         .fill({ color: gp.surface, alpha: 0.85 }).stroke({ color: p.hull.edge, width: 0.5, alpha: 0.7 });

      } else if (mod.partKind === "scrambler") {
        // X-crossed dipole antenna + interference rings
        const ant = R * 0.75;
        for (let ai = 0; ai < 2; ai++) {
          const aa = Math.atan2(outY, outX) + ai * 1.5708;
          g.moveTo(mx - Math.cos(aa) * ant, my - Math.sin(aa) * ant)
           .lineTo(mx + Math.cos(aa) * ant, my + Math.sin(aa) * ant)
           .stroke({ color: gp.surface, width: 1.1, alpha: 0.85 });
          // End knobs
          g.circle(mx + Math.cos(aa) * ant, my + Math.sin(aa) * ant, R * 0.07)
           .fill({ color: gp.highlight, alpha: 0.9 });
          g.circle(mx - Math.cos(aa) * ant, my - Math.sin(aa) * ant, R * 0.07)
           .fill({ color: gp.highlight, alpha: 0.9 });
        }
        // Interference rings
        for (let ri = 1; ri <= 2; ri++) {
          g.circle(mx, my, R * ri * 0.38).stroke({ color: gp.effect, width: 0.6, alpha: 0.4 - ri * 0.1 });
        }
        g.circle(mx, my, R * 0.10).fill({ color: gp.effect, alpha: 0.8 });

      } else if (mod.partKind === "webber") {
        // Warp disruptor: curling tentacle beams
        const wbAng = Math.atan2(outY, outX);
        for (let wi = 0; wi < 5; wi++) {
          const wa = wbAng + (wi - 2) * 0.42;
          const wLen = R * (0.85 + (wi % 2) * 0.15);
          const ctrlX = mx + Math.cos(wa + 0.5) * R * 0.6;
          const ctrlY = my + Math.sin(wa + 0.5) * R * 0.6;
          const endX = mx + Math.cos(wa) * wLen, endY = my + Math.sin(wa) * wLen;
          g.moveTo(mx + outX * R * 0.1, my + outY * R * 0.1)
           .quadraticCurveTo(ctrlX, ctrlY, endX, endY)
           .stroke({ color: gp.effect, width: 0.8, alpha: 0.65 });
          g.circle(endX, endY, R * 0.07).fill({ color: gp.effect, alpha: 0.8 });
        }
        g.circle(mx + outX * R * 0.1, my + outY * R * 0.1, R * 0.18)
         .fill({ color: gp.surface, alpha: 0.85 }).stroke({ color: gp.highlight, width: 0.6, alpha: 0.7 });

      } else if (mod.partKind === "thruster") {
        // Bell-nozzle cone, grade material, grade exhaust
        const nozzleX = mx - outX * R * 0.15, nozzleY = my - outY * R * 0.15;
        const bell = R * 0.45;
        // Nozzle bell
        g.moveTo(nozzleX + perpX * bell * 0.5, nozzleY + perpY * bell * 0.5)
         .lineTo(nozzleX + perpX * bell, nozzleY + perpY * bell - outY * R * 0.5)
         .lineTo(nozzleX - perpX * bell, nozzleY - perpY * bell - outY * R * 0.5)
         .lineTo(nozzleX - perpX * bell * 0.5, nozzleY - perpY * bell * 0.5)
         .closePath().fill({ color: gp.surface, alpha: 0.90 });
        // Nozzle rim
        g.moveTo(nozzleX + perpX * bell, nozzleY + perpY * bell - outY * R * 0.5)
         .lineTo(nozzleX - perpX * bell, nozzleY - perpY * bell - outY * R * 0.5)
         .stroke({ color: gp.highlight, width: 1.0, alpha: 0.9 });
        // Exhaust jet (outward from back)
        g.circle(nozzleX - outX * R * 0.35, nozzleY - outY * R * 0.35, R * 0.28)
         .fill({ color: gp.effect, alpha: 0.35 });
        g.circle(nozzleX - outX * R * 0.35, nozzleY - outY * R * 0.35, R * 0.14)
         .fill({ color: gp.effect, alpha: 0.70 });
        g.circle(nozzleX - outX * R * 0.35, nozzleY - outY * R * 0.35, R * 0.055)
         .fill({ color: 0xffffff, alpha: 0.9 });
        // Outer glow from faction
        g.circle(nozzleX, nozzleY, R * 0.48).stroke({ color: p.engine.glow, width: 0.5, alpha: 0.55 });

      } else if (mod.partKind === "ion-engine") {
        // Grid accelerator + narrow ion plume
        // Acceleration grids (3 bars)
        for (let gi = 0; gi < 3; gi++) {
          const gOff = (gi - 1) * R * 0.30;
          const gBack = R * (-0.1 - gi * 0.22);
          const gx = mx + outX * gBack + perpX * gOff;
          const gy = my + outY * gBack + perpY * gOff;
          g.moveTo(gx + perpX * R * 0.42, gy + perpY * R * 0.42)
           .lineTo(gx - perpX * R * 0.42, gy - perpY * R * 0.42)
           .stroke({ color: gp.surface, width: 1.0, alpha: 0.85 });
          // Grid gaps
          for (let ggi = -1; ggi <= 1; ggi++) {
            g.circle(gx + perpX * ggi * R * 0.2, gy + perpY * ggi * R * 0.2, R * 0.04)
             .fill({ color: gp.effect, alpha: 0.6 });
          }
        }
        // Narrow ion plume
        const plumeBack = R * 0.9;
        g.moveTo(mx - outX * R * 0.1 + perpX * R * 0.12, my - outY * R * 0.1 + perpY * R * 0.12)
         .lineTo(mx - outX * plumeBack, my - outY * plumeBack)
         .lineTo(mx - outX * R * 0.1 - perpX * R * 0.12, my - outY * R * 0.1 - perpY * R * 0.12)
         .stroke({ color: gp.effect, width: 0.8, alpha: 0.45 });
        g.circle(mx - outX * plumeBack, my - outY * plumeBack, R * 0.12)
         .fill({ color: gp.effect, alpha: 0.55 });
        g.circle(mx - outX * plumeBack * 0.5, my - outY * plumeBack * 0.5, R * 0.06)
         .fill({ color: 0xffffff, alpha: 0.7 });

      } else if (mod.partKind === "warp-nacelle") {
        // Dimensional field ring coils around central spine
        const spineLen = R * 0.8;
        // Central spine
        g.moveTo(mx - outX * spineLen * 0.4, my - outY * spineLen * 0.4)
         .lineTo(mx + outX * spineLen * 0.4, my + outY * spineLen * 0.4)
         .stroke({ color: gp.surface, width: 1.2, alpha: 0.9 });
        // Two ring coils
        for (let ri = 0; ri < 2; ri++) {
          const rOff = (ri - 0.5) * R * 0.35;
          const rx = mx + perpX * rOff, ry = my + perpY * rOff;
          g.circle(rx, ry, R * 0.32).stroke({ color: gp.highlight, width: 1.0, alpha: 0.80 });
          g.circle(rx, ry, R * 0.18).fill({ color: gp.effect, alpha: 0.30 });
          g.circle(rx, ry, R * 0.09).fill({ color: gp.effect, alpha: 0.65 });
        }
        // Warp field glow between coils
        g.circle(mx, my, R * 0.14).fill({ color: gp.glow, alpha: 0.55 });
        g.circle(mx, my, R * 0.06).fill({ color: 0xffffff, alpha: 0.8 });

      } else if (mod.partKind === "gravity-drive") {
        // Concentric rings collapsing to singularity
        for (let ri = 3; ri >= 1; ri--) {
          const rr = R * ri * 0.20;
          g.circle(mx, my, rr).stroke({ color: gp.highlight, width: 0.8, alpha: 0.4 + ri * 0.15 });
        }
        g.circle(mx, my, R * 0.22).fill({ color: gp.glow, alpha: 0.40 });
        g.circle(mx, my, R * 0.12).fill({ color: gp.effect, alpha: 0.70 });
        g.circle(mx, my, R * 0.05).fill({ color: 0xffffff, alpha: 1.0 });
        // Gravity distortion spokes
        for (let si = 0; si < 4; si++) {
          const sa = (si / 4) * Math.PI * 2;
          g.moveTo(mx + Math.cos(sa) * R * 0.22, my + Math.sin(sa) * R * 0.22)
           .lineTo(mx + Math.cos(sa) * R * 0.65, my + Math.sin(sa) * R * 0.65)
           .stroke({ color: gp.effect, width: 0.6, alpha: 0.45 });
        }
        // Outer structure ring
        g.circle(mx, my, R * 0.70).stroke({ color: gp.surface, width: 1.0, alpha: 0.65 });

      } else if (mod.partKind === "shield") {
        // Hemispherical dome projector — faction lens base, grade dome energy
        const projX = mx + outX * R * 0.35, projY = my + outY * R * 0.35;
        // Projector node
        g.circle(projX, projY, R * 0.26).fill({ color: gp.surface, alpha: 0.9 });
        g.circle(projX, projY, R * 0.14).fill({ color: p.sensors.lens, alpha: 0.85 });
        g.circle(projX, projY, R * 0.06).fill({ color: 0xffffff, alpha: 1.0 });
        // Dome arc
        const dAng = Math.atan2(outY, outX);
        g.moveTo(projX + Math.cos(dAng - 1.1) * R * 0.65, projY + Math.sin(dAng - 1.1) * R * 0.65)
         .arc(projX, projY, R * 0.65, dAng - 1.1, dAng + 1.1)
         .stroke({ color: gp.effect, width: 1.2, alpha: 0.60 });
        // Energy filament lines
        for (let fi = -1; fi <= 1; fi++) {
          const fa = dAng + fi * 0.55;
          g.moveTo(projX, projY)
           .lineTo(projX + Math.cos(fa) * R * 0.60, projY + Math.sin(fa) * R * 0.60)
           .stroke({ color: gp.effect, width: 0.5, alpha: 0.35 });
        }

      } else if (mod.partKind === "armor") {
        // Overlapping angled plates + bolt detail — grade surface
        const plates = [
          { ox: outX * R * 0.15, oy: outY * R * 0.15, w: R * 0.5, h: R * 0.3 },
          { ox: -outX * R * 0.1 + perpX * R * 0.22, oy: -outY * R * 0.1 + perpY * R * 0.22, w: R * 0.4, h: R * 0.25 },
          { ox: -outX * R * 0.1 - perpX * R * 0.22, oy: -outY * R * 0.1 - perpY * R * 0.22, w: R * 0.4, h: R * 0.25 },
        ];
        for (const pl of plates) {
          const px = mx + pl.ox, py = my + pl.oy;
          g.moveTo(px - outX * pl.w + perpX * pl.h, py - outY * pl.w + perpY * pl.h)
           .lineTo(px + outX * pl.w + perpX * pl.h, py + outY * pl.w + perpY * pl.h)
           .lineTo(px + outX * pl.w - perpX * pl.h, py + outY * pl.w - perpY * pl.h)
           .lineTo(px - outX * pl.w - perpX * pl.h, py - outY * pl.w - perpY * pl.h)
           .closePath().fill({ color: gp.surface, alpha: 0.85 })
           .stroke({ color: gp.highlight, width: 0.6, alpha: 0.75 });
          // Rivets
          for (let ri = -1; ri <= 1; ri += 2) {
            g.circle(px + perpX * pl.h * 0.7 * ri, py + perpY * pl.h * 0.7 * ri, R * 0.05)
             .fill({ color: gp.highlight, alpha: 0.9 });
          }
        }

      } else if (mod.partKind === "cloak") {
        // Phase emitter — shimmer wave rings at low alpha
        const cloakX = mx + outX * R * 0.3, cloakY = my + outY * R * 0.3;
        g.circle(cloakX, cloakY, R * 0.28).fill({ color: gp.surface, alpha: 0.7 });
        g.circle(cloakX, cloakY, R * 0.14).fill({ color: gp.effect, alpha: 0.5 });
        g.circle(cloakX, cloakY, R * 0.06).fill({ color: 0xffffff, alpha: 0.65 });
        for (let si = 1; si <= 3; si++) {
          g.circle(cloakX, cloakY, R * si * 0.28)
           .stroke({ color: gp.effect, width: 0.6, alpha: 0.30 - si * 0.06 });
        }
        // Phase shimmer dots (irregular pattern)
        const shimAngles = [0.3, 1.1, 2.0, 3.3, 4.5, 5.2];
        for (const sa of shimAngles) {
          const sdist = R * (0.42 + (sa % 0.5) * 0.3);
          g.circle(mx + Math.cos(sa) * sdist, my + Math.sin(sa) * sdist, R * 0.04)
           .fill({ color: gp.effect, alpha: 0.30 });
        }

      } else if (mod.partKind === "warp-stabilizer") {
        // 3 cross-rods with field indicator globes at tips
        const stbAng = Math.atan2(outY, outX);
        for (let wi = 0; wi < 3; wi++) {
          const wa = stbAng + (wi / 3) * Math.PI * 2;
          const rodLen = R * 0.68;
          const tipX = mx + Math.cos(wa) * rodLen, tipY = my + Math.sin(wa) * rodLen;
          g.moveTo(mx, my).lineTo(tipX, tipY)
           .stroke({ color: gp.surface, width: 1.1, alpha: 0.85 });
          g.circle(tipX, tipY, R * 0.14).fill({ color: gp.effect, alpha: 0.70 });
          g.circle(tipX, tipY, R * 0.06).fill({ color: 0xffffff, alpha: 0.9 });
        }
        // Central hub
        g.circle(mx, my, R * 0.18).fill({ color: gp.surface, alpha: 0.9 })
         .stroke({ color: gp.highlight, width: 0.7, alpha: 0.8 });

      } else if (mod.partKind === "reactor") {
        // Pulsing power rings — faction ring, grade core
        g.circle(mx, my, R * 0.50).fill({ color: gp.surface, alpha: 0.80 });
        g.circle(mx, my, R * 0.50).stroke({ color: p.engine.glow, width: 0.7, alpha: 0.7 });
        g.circle(mx, my, R * 0.30).fill({ color: gp.highlight, alpha: 0.35 });
        g.circle(mx, my, R * 0.14).fill({ color: gp.effect, alpha: 0.90 });
        g.circle(mx, my, R * 0.055).fill({ color: 0xffffff, alpha: 0.9 });
        for (let i = 0; i < N; i++) {
          const s = pts[i]!, e = pts[(i + 1) % N]!;
          const smx = (s.x + e.x) / 2, smy = (s.y + e.y) / 2;
          g.moveTo(mx, my).lineTo(smx, smy).stroke({ color: p.engine.glow, width: 0.5, alpha: 0.5 });
          g.circle(smx, smy, R * 0.05).fill({ color: gp.effect, alpha: 0.55 });
        }

      } else if (mod.partKind === "crew-quarters") {
        // Cylindrical hab module with porthole windows
        g.circle(mx, my, R * 0.52).fill({ color: gp.surface, alpha: 0.75 });
        g.circle(mx, my, R * 0.52).stroke({ color: p.hull.edge, width: 0.7, alpha: 0.7 });
        // Porthole windows (faction light color)
        for (let wi = 0; wi < 3; wi++) {
          const wa = (wi / 3) * Math.PI * 2;
          const wx = mx + Math.cos(wa) * R * 0.32, wy = my + Math.sin(wa) * R * 0.32;
          g.circle(wx, wy, R * 0.10).fill({ color: 0x080c14, alpha: 0.9 });
          g.circle(wx, wy, R * 0.10).stroke({ color: p.lights, width: 0.6, alpha: 0.8 });
          g.circle(wx, wy, R * 0.04).fill({ color: p.lights, alpha: 0.7 });
        }
        // Structural ring
        g.circle(mx, my, R * 0.18).fill({ color: gp.highlight, alpha: 0.3 });

      } else if (mod.partKind === "frame") {
        // Girder cross-bracing — grade surface for braces
        for (let i = 0; i < N; i++) {
          for (let j = i + 2; j < N - (i === 0 ? 1 : 0); j++) {
            g.moveTo(pts[i]!.x, pts[i]!.y)
             .lineTo(pts[j]!.x, pts[j]!.y)
             .stroke({ color: gp.surface, width: 0.55, alpha: 0.65 });
          }
        }
        for (const pt of pts) {
          const bx = mx + (pt.x - mx) * 0.75, by = my + (pt.y - my) * 0.75;
          g.circle(bx, by, R * 0.07).fill({ color: gp.highlight, alpha: 0.80 });
        }
        g.circle(mx, my, R * 0.12).fill({ color: gp.surface, alpha: 0.85 })
         .stroke({ color: gp.highlight, width: 0.5, alpha: 0.7 });

      } else if (mod.partKind === "converter-unit") {
        // Energy flow channel with directional arrow
        const flowLen = R * 0.6;
        g.moveTo(mx - outX * flowLen, my - outY * flowLen)
         .lineTo(mx + outX * flowLen, my + outY * flowLen)
         .stroke({ color: 0x882299, width: 1.1, alpha: 0.75 });
        const aX = mx + outX * flowLen * 0.85, aY = my + outY * flowLen * 0.85;
        g.moveTo(aX, aY)
         .lineTo(aX - outX * R * 0.22 + perpX * R * 0.14, aY - outY * R * 0.22 + perpY * R * 0.14)
         .lineTo(aX - outX * R * 0.22 - perpX * R * 0.14, aY - outY * R * 0.22 - perpY * R * 0.14)
         .closePath().fill({ color: gp.effect, alpha: 0.85 });
        g.circle(mx - outX * flowLen, my - outY * flowLen, R * 0.14).fill({ color: 0x6600cc, alpha: 0.7 });
        g.circle(mx + outX * flowLen, my + outY * flowLen, R * 0.14).fill({ color: gp.effect, alpha: 0.7 });

      } else if (mod.partKind === "factory-bay") {
        // Industrial fabrication bay — scaffold grid + crane arm
        for (let gi = -1; gi <= 1; gi++) {
          const gx = mx + perpX * R * gi * 0.4, gy = my + perpY * R * gi * 0.4;
          g.moveTo(gx - outX * R * 0.6, gy - outY * R * 0.6)
           .lineTo(gx + outX * R * 0.6, gy + outY * R * 0.6)
           .stroke({ color: 0x556655, width: 0.6, alpha: 0.7 });
        }
        for (let gi = -1; gi <= 1; gi++) {
          const gx = mx + outX * R * gi * 0.4, gy = my + outY * R * gi * 0.4;
          g.moveTo(gx - perpX * R * 0.6, gy - perpY * R * 0.6)
           .lineTo(gx + perpX * R * 0.6, gy + perpY * R * 0.6)
           .stroke({ color: 0x556655, width: 0.6, alpha: 0.7 });
        }
        const craneX = mx + outX * R * 0.7, craneY = my + outY * R * 0.7;
        g.moveTo(mx, my).lineTo(craneX, craneY).stroke({ color: 0xaabb99, width: 1.2, alpha: 0.85 });
        g.moveTo(craneX - perpX * R * 0.22, craneY - perpY * R * 0.22)
         .lineTo(craneX + perpX * R * 0.22, craneY + perpY * R * 0.22)
         .stroke({ color: 0x99bb88, width: 1.0, alpha: 0.8 });
        g.circle(craneX, craneY, R * 0.12).fill({ color: 0xffaa22, alpha: 0.85 });
        g.circle(craneX, craneY, R * 0.06).fill({ color: 0xffffff, alpha: 0.95 });
        g.circle(mx, my, R * 0.22).fill({ color: 0x334433, alpha: 0.9 })
         .stroke({ color: 0x88bb66, width: 0.6, alpha: 0.7 });
        g.circle(mx, my, R * 0.10).fill({ color: gp.effect, alpha: 0.6 });
      }
    }
  }

  private drawGalaxyMap(g: Graphics, map: GalaxyMapData): void {
    // Semi-transparent backdrop
    g.rect(0, 0, this.width, this.height).fill({ color: 0x000018, alpha: 0.85 });

    // Title
    const titleY = 40;
    g.rect(this.width / 2 - 200, titleY - 8, 400, 36)
      .fill({ color: 0x001a4d, alpha: 0.6 })
      .stroke({ color: 0x00ffff, width: 1, alpha: 0.6 });

    // Compute centred bounding box of map.systems → screen coords
    if (map.systems.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of map.systems) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
    const padX = 120;
    const padY = 120;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min(
      (this.width - 2 * padX) / spanX,
      (this.height - 2 * padY) / spanY,
    );
    const offsetX = padX + ((this.width - 2 * padX) - spanX * scale) / 2;
    const offsetY = padY + ((this.height - 2 * padY) - spanY * scale) / 2;
    const project = (x: number, y: number) => ({
      x: offsetX + (x - minX) * scale,
      y: offsetY + (y - minY) * scale,
    });

    // Edges (gate connections)
    for (const e of map.edges) {
      const a = map.systems.find((s) => s.id === e.fromSystemId);
      const b = map.systems.find((s) => s.id === e.toSystemId);
      if (!a || !b) continue;
      const ap = project(a.x, a.y);
      const bp = project(b.x, b.y);
      const visited = a.visited && b.visited;
      g.moveTo(ap.x, ap.y)
        .lineTo(bp.x, bp.y)
        .stroke({ color: visited ? 0x66ccff : 0x4a6680, width: 2, alpha: 0.85 });
    }

    // System nodes + labels
    this.ensureTextPool(this.galaxySystemLabels, map.systems.length, 14);
    for (let i = 0; i < map.systems.length; i++) {
      const s = map.systems[i]!;
      const label = this.galaxySystemLabels[i]!;
      const p = project(s.x, s.y);
      const isCurrent = s.id === map.currentSystemId;
      const color = isCurrent ? 0x00ffff : s.visited ? 0xffcc66 : 0x9999aa;
      const r = isCurrent ? 12 : 8;
      g.circle(p.x, p.y, r + 3).stroke({ color, width: 2, alpha: isCurrent ? 1 : 0.7 });
      g.circle(p.x, p.y, r).fill({ color, alpha: isCurrent ? 1 : 0.85 });
      if (isCurrent) {
        // Pulse halo
        g.circle(p.x, p.y, r + 8).stroke({ color, width: 1, alpha: 0.5 });
      }
      label.text = s.name;
      label.x = p.x;
      label.y = p.y + r + 6;
      label.anchor.set(0.5, 0);
      label.style.fill = color;
      label.visible = true;
    }
    for (let i = map.systems.length; i < this.galaxySystemLabels.length; i++) {
      this.galaxySystemLabels[i]!.visible = false;
    }
  }

  private drawPauseOverlay(solarPauseSelection = 0): void {
    const g = this.solarSystemGfx;

    // Semi-transparent dark overlay
    g.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: 0.5 });

    // Pause panel — three buttons: Resume, Quit, Sound
    const panelWidth = 360;
    const panelHeight = 300;
    const panelX = this.width / 2 - panelWidth / 2;
    const panelY = this.height / 2 - panelHeight / 2;

    g.rect(panelX, panelY, panelWidth, panelHeight).fill({ color: 0x001a4d, alpha: 0.95 });
    g.rect(panelX, panelY, panelWidth, panelHeight).stroke({ color: 0x00ffff, width: 2, alpha: 1 });

    this.pauseTitle.text = "PAUSED";
    this.pauseTitle.x = this.width / 2;
    this.pauseTitle.y = panelY + 26;

    const btnW = 280;
    const btnH = 52;
    const btnX = this.width / 2 - btnW / 2;
    const btn0Y = panelY + 72;
    const btn1Y = panelY + 140;
    const btn2Y = panelY + 208;
    const sel0 = solarPauseSelection === 0;
    const sel1 = solarPauseSelection === 1;
    const sel2 = solarPauseSelection === 2;

    g.roundRect(btnX, btn0Y, btnW, btnH, 8)
      .fill({ color: sel0 ? 0x003366 : 0x001a33, alpha: 0.9 })
      .stroke({ color: sel0 ? COLOR.hudAmber : 0x334455, width: sel0 ? 2 : 1 });
    g.roundRect(btnX, btn1Y, btnW, btnH, 8)
      .fill({ color: sel1 ? 0x330011 : 0x1a0011, alpha: 0.9 })
      .stroke({ color: sel1 ? COLOR.hudAmber : 0x334455, width: sel1 ? 2 : 1 });
    g.roundRect(btnX, btn2Y, btnW, btnH, 8)
      .fill({ color: sel2 ? 0x003333 : 0x001a1a, alpha: 0.9 })
      .stroke({ color: sel2 ? COLOR.hudAmber : 0x334455, width: sel2 ? 2 : 1 });

    this.promptText.text = sel0 ? "▶  RESUME  ◀" : "   RESUME";
    this.promptText.style.fill = sel0 ? COLOR.hudAmber : COLOR.hudWhite;
    this.promptText.x = this.width / 2;
    this.promptText.y = btn0Y + btnH / 2;
    this.promptText.anchor.set(0.5, 0.5);

    this.dockedHint.text = sel1 ? "▶  QUIT TO MENU  ◀" : "   QUIT TO MENU";
    this.dockedHint.style.fill = sel1 ? COLOR.hudAmber : 0xddaaaa;
    this.dockedHint.x = this.width / 2;
    this.dockedHint.y = btn1Y + btnH / 2;
    this.dockedHint.anchor.set(0.5, 0.5);
    this.dockedHint.visible = true;

    const soundLabel = soundManager.isMuted() ? "SOUND: OFF" : "SOUND: ON";
    this.solarPauseSoundText.text = sel2 ? `▶  ${soundLabel}  ◀` : soundLabel;
    this.solarPauseSoundText.style.fill = sel2 ? COLOR.hudAmber : 0xaaccaa;
    this.solarPauseSoundText.x = this.width / 2;
    this.solarPauseSoundText.y = btn2Y + btnH / 2;
    this.solarPauseSoundText.visible = true;
  }

  private drawDockRoomInterior(
    g: Graphics,
    robotX: number,
    accentColor: number,
  ): void {
    const W = this.width / 2;
    const H = this.height;

    // One-point perspective box — back wall bounds define the room depth.
    const BL = 140, BR = 500, BT = 90, BB = 470;

    // ── Back wall ─────────────────────────────────────────────────────────
    g.rect(BL, BT, BR - BL, BB - BT).fill({ color: 0x192434 });
    // Horizontal panel seams
    for (let wy = BT + 65; wy < BB; wy += 65) {
      g.moveTo(BL, wy).lineTo(BR, wy).stroke({ color: 0x223244, width: 1, alpha: 0.5 });
    }
    // Vertical panel seams
    for (let wx = BL + 90; wx < BR; wx += 90) {
      g.moveTo(wx, BT).lineTo(wx, BB).stroke({ color: 0x223244, width: 1, alpha: 0.35 });
    }
    // Accent strip across top of back wall
    g.rect(BL, BT, BR - BL, 3).fill({ color: accentColor, alpha: 0.55 });
    // Small tech panel (right side of back wall)
    g.rect(BR - 78, BT + 38, 56, 76)
      .fill({ color: 0x0e1928 })
      .stroke({ color: accentColor, width: 1, alpha: 0.5 });
    for (let pi = 0; pi < 3; pi++) {
      g.circle(BR - 50, BT + 58 + pi * 22, 4).fill({ color: accentColor, alpha: 0.75 });
    }

    // ── Left wall ─────────────────────────────────────────────────────────
    g.poly([0, 0, 0, H, BL, BB, BL, BT]).fill({ color: 0x0f1b29 });
    g.moveTo(BL, BT).lineTo(0, 0).stroke({ color: accentColor, width: 1, alpha: 0.2 });
    g.moveTo(BL, BB).lineTo(0, H).stroke({ color: accentColor, width: 1, alpha: 0.2 });

    // ── Right wall ────────────────────────────────────────────────────────
    g.poly([W, 0, W, H, BR, BB, BR, BT]).fill({ color: 0x0c1722 });
    g.moveTo(BR, BT).lineTo(W, 0).stroke({ color: accentColor, width: 1, alpha: 0.15 });
    g.moveTo(BR, BB).lineTo(W, H).stroke({ color: accentColor, width: 1, alpha: 0.15 });

    // ── Ceiling ───────────────────────────────────────────────────────────
    g.poly([0, 0, W, 0, BR, BT, BL, BT]).fill({ color: 0x101d2e });
    // Overhead light strip
    const ls = W * 0.35;
    g.rect((W - ls) / 2, 0, ls, 6).fill({ color: accentColor, alpha: 0.22 });
    g.rect((W - ls * 0.4) / 2, 0, ls * 0.4, 2).fill({ color: 0xffffff, alpha: 0.08 });

    // ── Floor ─────────────────────────────────────────────────────────────
    g.poly([0, H, W, H, BR, BB, BL, BB]).fill({ color: 0x06090f });
    // Perspective grid on floor
    for (let fy = BB + 48; fy < H; fy += 48) {
      const t  = (fy - BB) / (H - BB);
      const lx = BL  + (0 - BL) * t;
      const rx = BR  + (W - BR) * t;
      g.moveTo(lx, fy).lineTo(rx, fy).stroke({ color: 0x18273c, width: 1, alpha: 0.55 });
    }
    // Converging lines toward back-wall base
    g.moveTo(W * 0.25, H).lineTo(BL, BB).stroke({ color: 0x18273c, width: 1, alpha: 0.4 });
    g.moveTo(W * 0.50, H).lineTo(W * 0.50, BB).stroke({ color: 0x18273c, width: 1, alpha: 0.4 });
    g.moveTo(W * 0.75, H).lineTo(BR, BB).stroke({ color: 0x18273c, width: 1, alpha: 0.4 });

    // ── Shadow ellipse (behind robot, in front of floor) ──────────────────
    g.ellipse(robotX, BB + 6, 54, 14).fill({ color: 0x000000, alpha: 0.5 });
  }

  private drawDockCounter(
    g: Graphics,
    accentColor: number,
    isShop: boolean,
  ): void {
    g.clear();
    if (!isShop) { g.visible = false; return; }
    g.visible = true;

    // Counter appears in front of the robot.  Its "back" edge (CT) is above
    // the robot's feet in screen space, so the counter top surface occludes
    // the lower legs.  Front edge (CF) and front face drop toward the viewer.
    const CL = 150, CR = 490;   // back-edge left/right
    const CT = 448;             // back edge y (higher on screen = farther)
    const CF = 516;             // front-top edge y (closer to viewer)
    const CFL = 62, CFR = 578;  // front edge left/right (wider, perspective)
    const CBOT = 694;           // front face bottom y

    // Counter top surface (perspective trapezoid)
    g.poly([CL, CT, CR, CT, CFR, CF, CFL, CF]).fill({ color: 0x1c2e48 });
    // Top surface highlight strip along front edge
    g.moveTo(CFL, CF).lineTo(CFR, CF).stroke({ color: accentColor, width: 2, alpha: 0.55 });
    // Top surface back edge (subtle)
    g.moveTo(CL, CT).lineTo(CR, CT).stroke({ color: accentColor, width: 1, alpha: 0.25 });
    // Top surface sheen (lighter near-edge strip)
    g.poly([CL, CT, CR, CT, CR - 18, CT + 18, CL + 18, CT + 18])
      .fill({ color: 0x263d58, alpha: 0.35 });

    // Counter front face
    g.poly([CFL, CF, CFR, CF, CFR + 18, CBOT, CFL - 18, CBOT])
      .fill({ color: 0x0c1a2e });
    // Vertical panel dividers on front face
    const fc = CFL + (CFR - CFL) / 3;
    const fc2 = CFL + (CFR - CFL) * 2 / 3;
    g.moveTo(fc, CF).lineTo(fc - 4, CBOT).stroke({ color: 0x162438, width: 1, alpha: 0.5 });
    g.moveTo(fc2, CF).lineTo(fc2 + 4, CBOT).stroke({ color: 0x162438, width: 1, alpha: 0.5 });

    // Items on counter top: small screen (left) + cargo canisters (center/right)
    // Mini display screen
    g.roundRect(CL + 14, CT - 22, 52, 32, 3)
      .fill({ color: 0x08121e })
      .stroke({ color: accentColor, width: 1, alpha: 0.65 });
    g.roundRect(CL + 16, CT - 20, 48, 28, 2).fill({ color: accentColor, alpha: 0.1 });
    // Cargo canister 1
    const mx = (CL + CR) / 2 - 20;
    g.rect(mx, CT - 16, 18, 16).fill({ color: 0x243a52 }).stroke({ color: 0x3a5572, width: 1 });
    g.rect(mx, CT - 18, 18, 4).fill({ color: 0x3a5572 });
    // Cargo canister 2
    g.rect(mx + 26, CT - 12, 16, 12).fill({ color: 0x1e4a38 }).stroke({ color: 0x2e6a50, width: 1 });
    g.rect(mx + 26, CT - 14, 16, 4).fill({ color: 0x2e6a50 });
  }

  private drawDockedMenu(data: SolarSystemRenderData | null): void {
    const g = this.solarSystemGfx;
    g.clear();

    this.drawNebulaBackground(g);

    const docked    = data?.docked;
    const activeNpc = data?.docked?.activeNpc;
    const title     = docked?.locationName ?? "DOCKED";
    const items     = docked?.menuItems ?? ["Undock"];
    const sel       = docked?.menuSelection ?? 0;

    // Derive accent colour from NPC faction (fallback cyan)
    const accentColor = activeNpc
      ? ({ "terran-federation": 0x4499ff, "xeno-collective": 0x44ee88,
           "void-merchants": 0xcc77ff, "scavenger-clans": 0xff9933,
           "nova-rebels": 0xff4455 } as Record<string, number>)[activeNpc.factionId] ?? 0x00ccff
      : 0x00ccff;

    const isShop =
      activeNpc?.role === "trader" || activeNpc?.role === "broker";

    // ── Left panel: room interior ────────────────────────────────────────
    const robotX = this.width / 4;      // 320
    const robotY = this.height * 0.46;  // 331 — centered in room

    this.drawDockRoomInterior(g, robotX, accentColor);

    // ── Right panel ───────────────────────────────────────────────────────
    g.rect(this.width / 2, 0, this.width / 2, this.height)
      .fill({ color: 0x000010, alpha: 0.92 });
    g.moveTo(this.width / 2, 0)
      .lineTo(this.width / 2, this.height)
      .stroke({ color: accentColor, width: 2, alpha: 0.5 });

    // ── Robot ─────────────────────────────────────────────────────────────
    if (activeNpc) {
      if (this.currentDockNpcId !== activeNpc.id) {
        if (this.currentDockRobot) this.menuLayer.removeChild(this.currentDockRobot);
        this.currentDockRobot = createNPCRobot(activeNpc, 300);
        this.currentDockNpcId = activeNpc.id;
        this.menuLayer.addChild(this.currentDockRobot);
        // Ensure counter renders above robot
        this.menuLayer.addChild(this.dockCounterGfx);
      }
      this.currentDockRobot!.position.set(robotX, robotY);
      this.currentDockRobot!.visible = true;
    } else if (this.currentDockRobot) {
      this.currentDockRobot.visible = false;
    }

    // ── Counter overlay (drawn on top of robot) ───────────────────────────
    this.drawDockCounter(this.dockCounterGfx, accentColor, isShop);

    // ── Right side menu ───────────────────────────────────────────────────
    const menuStartX = this.width / 2 + 80;
    const menuWidth  = this.width / 2 - 100;

    this.dockedTitle.text = `◈  ${title.toUpperCase()}  ◈`;
    this.dockedTitle.x = this.width * 0.75;
    this.dockedTitle.y = 30;
    this.dockedTitle.style.fontSize = 28;
    this.dockedTitle.anchor.set(0.5, 0);
    this.dockedTitle.visible = true;

    const itemStartY  = 200;
    const itemSpacing = 80;
    const DOCK_MAX_VISIBLE = 6;
    const scrollOffset = docked?.menuScrollOffset ?? 0;
    const visibleCount = Math.min(items.length - scrollOffset, DOCK_MAX_VISIBLE);

    // Scroll indicator
    if (items.length > DOCK_MAX_VISIBLE) {
      const barX = this.width - 28;
      const barH = DOCK_MAX_VISIBLE * itemSpacing;
      g.rect(barX, itemStartY, 6, barH).fill({ color: 0x112233, alpha: 0.8 });
      const thumbH = Math.max(20, barH * DOCK_MAX_VISIBLE / items.length);
      const thumbY = itemStartY + (barH - thumbH) * scrollOffset / (items.length - DOCK_MAX_VISIBLE);
      g.rect(barX, thumbY, 6, thumbH).fill({ color: 0x3366aa, alpha: 1 });
    }

    this.ensureTextPool(this.dockedMenuLabels, visibleCount, 24);
    const btnW  = menuWidth - 40;
    const btnH  = 56;
    for (let vi = 0; vi < visibleCount; vi++) {
      const absIdx = scrollOffset + vi;
      const t     = this.dockedMenuLabels[vi]!;
      const isSel = absIdx === sel;
      const btnY  = itemStartY + vi * itemSpacing;
      g.roundRect(menuStartX - 10, btnY - 10, btnW + 20, btnH + 20, 8)
        .fill({ color: isSel ? 0x003366 : 0x001122, alpha: 0.85 })
        .stroke({ color: isSel ? 0xffcc33 : 0x334455, width: isSel ? 3 : 1 });
      t.text = isSel ? `▶  ${items[absIdx]}` : `   ${items[absIdx]}`;
      t.x = menuStartX + 10;
      t.y = btnY;
      t.anchor.set(0, 0);
      t.style.fill = isSel ? 0xffcc33 : 0xddeeff;
      t.style.fontSize = 24;
      t.visible = true;
    }
    for (let i = visibleCount; i < this.dockedMenuLabels.length; i++) {
      this.dockedMenuLabels[i]!.visible = false;
    }

    this.dockedHint.text = "[↑↓] Navigate  •  [Enter] Select  •  [ESC] Undock";
    this.dockedHint.x = this.width * 0.75;
    this.dockedHint.y = this.height - 40;
    this.dockedHint.anchor.set(0.5, 0);
    this.dockedHint.style.fontSize = 16;
    this.dockedHint.visible = true;

    // Galaxy map overlay — drawn on top of the docked UI without undocking.
    if (data?.mapOpen && data.galaxyMap) {
      this.drawGalaxyMap(g, data.galaxyMap);
    }
  }

  private drawNpcTalkScreen(
    data: NonNullable<SolarSystemRenderData["npcTalk"]>,
    locationName?: string,
  ): void {
    const g = this.solarSystemGfx;
    g.clear();
    this.drawNebulaBackground(g);

    const npc = data.npc;
    const accentColor = ({ "terran-federation": 0x4499ff, "xeno-collective": 0x44ee88,
      "void-merchants": 0xcc77ff, "scavenger-clans": 0xff9933,
      "nova-rebels": 0xff4455 } as Record<string, number>)[npc.factionId] ?? 0x00ccff;

    const robotX = this.width / 4;
    const robotY = this.height * 0.46;
    this.drawDockRoomInterior(g, robotX, accentColor);

    // Right panel
    g.rect(this.width / 2, 0, this.width / 2, this.height)
      .fill({ color: 0x000010, alpha: 0.92 });
    g.moveTo(this.width / 2, 0).lineTo(this.width / 2, this.height)
      .stroke({ color: accentColor, width: 2, alpha: 0.5 });

    // Robot
    if (this.currentDockNpcId !== npc.id) {
      if (this.currentDockRobot) this.menuLayer.removeChild(this.currentDockRobot);
      this.currentDockRobot = createNPCRobot(npc, 300);
      this.currentDockNpcId = npc.id;
      this.menuLayer.addChild(this.currentDockRobot);
      this.menuLayer.addChild(this.dockCounterGfx);
    }
    this.currentDockRobot!.position.set(robotX, robotY);
    this.currentDockRobot!.visible = true;
    this.drawDockCounter(this.dockCounterGfx, accentColor, false);

    // Title
    this.dockedTitle.text = `◈  ${(locationName ?? "STATION").toUpperCase()}  ◈`;
    this.dockedTitle.x = this.width * 0.75;
    this.dockedTitle.y = 30;
    this.dockedTitle.style.fontSize = 28;
    this.dockedTitle.anchor.set(0.5, 0);
    this.dockedTitle.visible = true;

    // NPC name + greeting
    const menuStartX = this.width / 2 + 80;
    const menuWidth  = this.width / 2 - 100;
    g.roundRect(menuStartX - 10, 80, menuWidth, 90, 6)
      .fill({ color: 0x001122, alpha: 0.8 }).stroke({ color: accentColor, width: 1, alpha: 0.4 });
    this.ensureTextPool(this.dockedMenuLabels, 4 + data.menuItems.length, 20);
    const nameLabel = this.dockedMenuLabels[0]!;
    nameLabel.text = npc.name.toUpperCase();
    nameLabel.x = menuStartX + 10; nameLabel.y = 88;
    nameLabel.style.fontSize = 22; nameLabel.style.fill = accentColor;
    nameLabel.anchor.set(0, 0); nameLabel.visible = true;

    // Greeting text (word-wrapped roughly)
    const greetLabel = this.dockedMenuLabels[1]!;
    greetLabel.text = npc.dialogueGreeting;
    greetLabel.x = menuStartX + 10; greetLabel.y = 116;
    greetLabel.style.fontSize = 15; greetLabel.style.fill = 0xaaccdd;
    greetLabel.anchor.set(0, 0); greetLabel.visible = true;
    (greetLabel.style as import("pixi.js").TextStyle).wordWrap = true;
    (greetLabel.style as import("pixi.js").TextStyle).wordWrapWidth = menuWidth - 20;

    // Menu items
    const itemStartY = 220;
    const itemSpacing = 80;
    for (let i = 0; i < data.menuItems.length; i++) {
      const t = this.dockedMenuLabels[2 + i]!;
      const isSel = i === data.menuSelection;
      const btnY = itemStartY + i * itemSpacing;
      g.roundRect(menuStartX - 10, btnY - 10, menuWidth, 56, 8)
        .fill({ color: isSel ? 0x003366 : 0x001122, alpha: 0.85 })
        .stroke({ color: isSel ? 0xffcc33 : 0x334455, width: isSel ? 3 : 1 });
      t.text = isSel ? `▶  ${data.menuItems[i]}` : `   ${data.menuItems[i]}`;
      t.x = menuStartX + 10; t.y = btnY;
      t.anchor.set(0, 0); t.style.fontSize = 24;
      t.style.fill = isSel ? 0xffcc33 : 0xddeeff;
      t.visible = true;
    }
    for (let i = data.menuItems.length; i < this.dockedMenuLabels.length - 2; i++) {
      this.dockedMenuLabels[2 + i]!.visible = false;
    }

    this.dockedHint.text = "[↑↓] Navigate  •  [Enter] Select  •  [ESC] Back";
    this.dockedHint.x = this.width * 0.75; this.dockedHint.y = this.height - 40;
    this.dockedHint.anchor.set(0.5, 0); this.dockedHint.style.fontSize = 16;
    this.dockedHint.visible = true;
  }

  private drawMissionListScreen(
    data: NonNullable<SolarSystemRenderData["missionList"]>,
    _locationName?: string,
  ): void {
    const g = this.solarSystemGfx;
    g.clear();
    this.drawNebulaBackground(g);

    const npc = data.npc;
    const accentColor = ({ "terran-federation": 0x4499ff, "xeno-collective": 0x44ee88,
      "void-merchants": 0xcc77ff, "scavenger-clans": 0xff9933,
      "nova-rebels": 0xff4455 } as Record<string, number>)[npc.factionId] ?? 0x00ccff;

    const robotX = this.width / 4;
    const robotY = this.height * 0.46;
    this.drawDockRoomInterior(g, robotX, accentColor);

    g.rect(this.width / 2, 0, this.width / 2, this.height)
      .fill({ color: 0x000010, alpha: 0.92 });
    g.moveTo(this.width / 2, 0).lineTo(this.width / 2, this.height)
      .stroke({ color: accentColor, width: 2, alpha: 0.5 });

    if (this.currentDockNpcId !== npc.id) {
      if (this.currentDockRobot) this.menuLayer.removeChild(this.currentDockRobot);
      this.currentDockRobot = createNPCRobot(npc, 300);
      this.currentDockNpcId = npc.id;
      this.menuLayer.addChild(this.currentDockRobot);
      this.menuLayer.addChild(this.dockCounterGfx);
    }
    this.currentDockRobot!.position.set(robotX, robotY);
    this.currentDockRobot!.visible = true;
    this.drawDockCounter(this.dockCounterGfx, accentColor, false);

    this.dockedTitle.text = `◈  MISSIONS  ◈`;
    this.dockedTitle.x = this.width * 0.75; this.dockedTitle.y = 30;
    this.dockedTitle.style.fontSize = 28; this.dockedTitle.anchor.set(0.5, 0);
    this.dockedTitle.visible = true;

    const menuStartX = this.width / 2 + 40;
    const menuWidth  = this.width / 2 - 60;
    const allItems = [...data.missions.map((m) => m.spec.title), "Back"];
    const itemCount = allItems.length;
    const ROW_H = 54;
    const itemStartY = 80;

    this.ensureTextPool(this.dockedMenuLabels, itemCount, 20);
    for (let i = 0; i < itemCount; i++) {
      const t = this.dockedMenuLabels[i]!;
      const isSel = i === data.menuSelection;
      const btnY = itemStartY + i * ROW_H;
      let rowColor = isSel ? 0x003366 : 0x001122;
      let textColor = isSel ? 0xffcc33 : 0xddeeff;
      let statusTag = "";
      if (i < data.missions.length) {
        const m = data.missions[i]!;
        if (m.status === "active") { statusTag = "  [IN PROGRESS]"; textColor = 0xffaa44; }
        if (m.status === "completed") { statusTag = "  [DONE]"; textColor = 0x44ff88; rowColor = 0x001100; }
      }
      g.roundRect(menuStartX - 10, btnY - 6, menuWidth, ROW_H - 4, 6)
        .fill({ color: rowColor, alpha: 0.85 })
        .stroke({ color: isSel ? 0xffcc33 : 0x334455, width: isSel ? 2 : 1 });
      t.text = isSel ? `▶  ${allItems[i]}${statusTag}` : `   ${allItems[i]}${statusTag}`;
      t.x = menuStartX + 10; t.y = btnY;
      t.anchor.set(0, 0); t.style.fontSize = 20; t.style.fill = textColor;
      t.visible = true;
    }
    for (let i = itemCount; i < this.dockedMenuLabels.length; i++) {
      this.dockedMenuLabels[i]!.visible = false;
    }

    this.dockedHint.text = "[↑↓] Navigate  •  [Enter] View Mission  •  [ESC] Back";
    this.dockedHint.x = this.width * 0.75; this.dockedHint.y = this.height - 40;
    this.dockedHint.anchor.set(0.5, 0); this.dockedHint.style.fontSize = 16;
    this.dockedHint.visible = true;
  }

  private drawMissionDetailScreen(
    data: NonNullable<SolarSystemRenderData["missionDetail"]>,
    npc?: NPCDefinition | undefined,
  ): void {
    const g = this.solarSystemGfx;
    g.clear();
    this.drawNebulaBackground(g);

    const accentColor = npc
      ? (({ "terran-federation": 0x4499ff, "xeno-collective": 0x44ee88,
          "void-merchants": 0xcc77ff, "scavenger-clans": 0xff9933,
          "nova-rebels": 0xff4455 } as Record<string, number>)[npc.factionId] ?? 0x00ccff)
      : 0x00ccff;

    const robotX = this.width / 4;
    const robotY = this.height * 0.46;
    this.drawDockRoomInterior(g, robotX, accentColor);

    g.rect(this.width / 2, 0, this.width / 2, this.height)
      .fill({ color: 0x000010, alpha: 0.92 });
    g.moveTo(this.width / 2, 0).lineTo(this.width / 2, this.height)
      .stroke({ color: accentColor, width: 2, alpha: 0.5 });

    if (npc && this.currentDockNpcId !== npc.id) {
      if (this.currentDockRobot) this.menuLayer.removeChild(this.currentDockRobot);
      this.currentDockRobot = createNPCRobot(npc, 300);
      this.currentDockNpcId = npc.id;
      this.menuLayer.addChild(this.currentDockRobot);
      this.menuLayer.addChild(this.dockCounterGfx);
    }
    if (this.currentDockRobot) {
      this.currentDockRobot.position.set(robotX, robotY);
      this.currentDockRobot.visible = true;
      this.drawDockCounter(this.dockCounterGfx, accentColor, false);
    }

    const spec = data.spec;
    const menuStartX = this.width / 2 + 40;
    const menuWidth  = this.width / 2 - 60;

    this.dockedTitle.text = `◈  MISSION BRIEF  ◈`;
    this.dockedTitle.x = this.width * 0.75; this.dockedTitle.y = 30;
    this.dockedTitle.style.fontSize = 26; this.dockedTitle.anchor.set(0.5, 0);
    this.dockedTitle.visible = true;

    // Mission info block
    g.roundRect(menuStartX - 10, 70, menuWidth, 320, 8)
      .fill({ color: 0x001122, alpha: 0.85 }).stroke({ color: accentColor, width: 1, alpha: 0.4 });

    const numLabels = 8;
    this.ensureTextPool(this.dockedMenuLabels, numLabels, 18);
    const labels = this.dockedMenuLabels;

    const setLabel = (idx: number, txt: string, y: number, sz: number, color: number) => {
      const t = labels[idx]!;
      t.text = txt; t.x = menuStartX + 10; t.y = y;
      t.anchor.set(0, 0); t.style.fontSize = sz; t.style.fill = color;
      (t.style as import("pixi.js").TextStyle).wordWrap = true;
      (t.style as import("pixi.js").TextStyle).wordWrapWidth = menuWidth - 20;
      t.visible = true;
    };

    setLabel(0, spec.title, 78, 22, accentColor);
    const typeLabel = spec.type === "courier" ? "COURIER" : spec.type === "trade" ? "TRADE" :
      spec.type === "explore" ? "EXPLORE" : spec.type === "kill" ? "KILL" : "AWAY MISSION";
    const diffLabel = spec.difficulty === "easy" ? "EASY" : spec.difficulty === "normal" ? "NORMAL" : "HARD";
    setLabel(1, `${typeLabel}  ·  ${diffLabel}`, 108, 14, 0x7799bb);
    setLabel(2, spec.description, 132, 15, 0xaaccdd);
    setLabel(3, "", 0, 1, 0); labels[3]!.visible = false; // spacer

    let detailY = 240;
    if (spec.type === "courier" && spec.destinationLocationId) {
      setLabel(3, `Deliver to: ${spec.destinationLocationId}`, detailY, 15, 0xddcc88); detailY += 22;
    } else if (spec.type === "kill" && spec.killCount) {
      setLabel(3, `Destroy: ${spec.killCount} ships`, detailY, 15, 0xff8888); detailY += 22;
    } else if (spec.type === "trade" && spec.requiredItemType) {
      setLabel(3, `Bring: ${spec.requiredItemCount}x ${spec.requiredItemType}`, detailY, 15, 0xddcc88); detailY += 22;
    }

    setLabel(4, `Reward: ${spec.rewardCredits.toLocaleString()} credits`, detailY, 16, 0x44ff88); detailY += 22;
    if (spec.rewardReputation > 0) {
      setLabel(5, `+${spec.rewardReputation} faction reputation`, detailY, 14, 0x66ccff);
    } else { labels[5]!.visible = false; }

    // Accept / Back buttons
    const btnItems = ["Accept Mission", "Back"];
    const btnStartY = 420;
    const btnSpacing = 70;
    for (let i = 0; i < btnItems.length; i++) {
      const t = labels[6 + i]!;
      const isSel = i === data.menuSelection;
      const btnY = btnStartY + i * btnSpacing;
      g.roundRect(menuStartX - 10, btnY - 10, menuWidth, 52, 8)
        .fill({ color: isSel ? 0x003366 : 0x001122, alpha: 0.85 })
        .stroke({ color: isSel ? 0xffcc33 : 0x334455, width: isSel ? 3 : 1 });
      t.text = isSel ? `▶  ${btnItems[i]}` : `   ${btnItems[i]}`;
      t.x = menuStartX + 10; t.y = btnY;
      t.anchor.set(0, 0); t.style.fontSize = 22; t.style.fill = isSel ? 0xffcc33 : 0xddeeff;
      (t.style as import("pixi.js").TextStyle).wordWrap = false;
      t.visible = true;
    }
    for (let i = numLabels; i < this.dockedMenuLabels.length; i++) {
      this.dockedMenuLabels[i]!.visible = false;
    }

    this.dockedHint.text = "[↑↓] Navigate  •  [Enter] Confirm  •  [ESC] Back";
    this.dockedHint.x = this.width * 0.75; this.dockedHint.y = this.height - 40;
    this.dockedHint.anchor.set(0.5, 0); this.dockedHint.style.fontSize = 16;
    this.dockedHint.visible = true;
  }

  /**
   * Draw one ship-builder module with detailed functional visuals.
   * Shared by both placed modules and the ghost preview.
   * `sv` = screen-space vertices, `alphaMult` scales all alpha values,
   * `isGhost` suppresses the outer snap-state stroke (caller adds it for ghost).
   */
  private drawBuilderModuleDetail(
    g: Graphics,
    sv: Array<{ x: number; y: number }>,
    moduleType: string,
    partKind: string,
    grade: number,
    shipScrX: number,
    shipScrY: number,
    alphaMult: number,
    isGhost: boolean,
  ): void {
    const N = sv.length;
    if (N < 3) return;
    const a = (base: number) => Math.min(1, base * alphaMult);
    const gp = getGradeColors(grade);

    const smx = sv.reduce((s, p) => s + p.x, 0) / N;
    const smy = sv.reduce((s, p) => s + p.y, 0) / N;
    const sR  = sv.reduce((s, p) => s + Math.hypot(p.x - smx, p.y - smy), 0) / N;

    const odx = smx - shipScrX, ody = smy - shipScrY, odist = Math.hypot(odx, ody);
    const sOutX = odist > 1 ? odx / odist : 1;
    const sOutY = odist > 1 ? ody / odist : 0;
    const sPerpX = -sOutY, sPerpY = sOutX;

    const hullByType: Record<string, number> = {
      core: 0x0b1825, weapon: 0x170e08, external: 0x060f1a,
      internal: 0x0c1005, structure: 0x0d1218, converter: 0x0d0818, factory: 0x0c1005,
    };

    const hc = hullByType[moduleType] ?? 0x0d1218;
    g.moveTo(sv[0]!.x, sv[0]!.y);
    for (let i = 1; i < N; i++) g.lineTo(sv[i]!.x, sv[i]!.y);
    g.closePath().fill({ color: hc, alpha: a(0.92) });
    if (!isGhost) {
      g.moveTo(sv[0]!.x, sv[0]!.y);
      for (let i = 1; i < N; i++) g.lineTo(sv[i]!.x, sv[i]!.y);
      g.closePath().stroke({ color: 0x3a5570, width: 1.2, alpha: a(0.9) });
    }

    if (partKind === "core") {
      g.circle(smx, smy, sR * 0.62).stroke({ color: 0x1155cc, width: 1.2, alpha: a(0.75) });
      g.circle(smx, smy, sR * 0.40).fill({ color: gp.surface, alpha: a(0.8) });
      g.circle(smx, smy, sR * 0.40).stroke({ color: 0x2266ee, width: 1.0, alpha: a(0.65) });
      g.circle(smx, smy, sR * 0.22).fill({ color: gp.highlight, alpha: a(0.35) });
      g.circle(smx, smy, sR * 0.08).fill({ color: gp.effect, alpha: a(1) });
      g.circle(smx, smy, sR * 0.03).fill({ color: 0xffffff, alpha: a(1) });
      for (const p of sv) {
        const mx2 = (smx + p.x) * 0.5, my2 = (smy + p.y) * 0.5;
        g.moveTo(smx, smy).lineTo(mx2, my2).stroke({ color: 0x224488, width: 0.8, alpha: a(0.6) });
        g.circle(mx2, my2, sR * 0.04).fill({ color: 0x3377cc, alpha: a(0.65) });
      }

    } else if (partKind === "cannon") {
      const bBase = sR * 0.15, bTip = sR * 1.15, hw = sR * 0.22;
      const bx0 = smx + sOutX * bBase, by0 = smy + sOutY * bBase;
      const bxtip = smx + sOutX * bTip, bytip = smy + sOutY * bTip;
      g.moveTo(bx0 + sPerpX * hw,       by0 + sPerpY * hw)
       .lineTo(bxtip + sPerpX * hw * 0.5, bytip + sPerpY * hw * 0.5)
       .lineTo(bxtip - sPerpX * hw * 0.5, bytip - sPerpY * hw * 0.5)
       .lineTo(bx0 - sPerpX * hw,        by0 - sPerpY * hw)
       .closePath().fill({ color: gp.surface, alpha: a(0.95) });
      g.moveTo(bx0 + sPerpX * hw, by0 + sPerpY * hw)
       .lineTo(bxtip + sPerpX * hw * 0.5, bytip + sPerpY * hw * 0.5)
       .stroke({ color: gp.highlight, width: 1.0, alpha: a(0.8) });
      for (let ri = 0; ri < 3; ri++) {
        const t = 0.3 + ri * 0.28;
        const rx = smx + sOutX * sR * (0.15 + t), ry = smy + sOutY * sR * (0.15 + t);
        const rw = hw * (1.1 - ri * 0.1);
        g.moveTo(rx + sPerpX * rw, ry + sPerpY * rw).lineTo(rx - sPerpX * rw, ry - sPerpY * rw)
         .stroke({ color: gp.highlight, width: 1.2, alpha: a(0.80) });
      }
      g.circle(bxtip, bytip, sR * 0.22).fill({ color: gp.glow, alpha: a(0.22) });
      g.circle(bxtip, bytip, sR * 0.12).fill({ color: gp.effect, alpha: a(0.65) });
      g.circle(bxtip, bytip, sR * 0.055).fill({ color: gp.effect, alpha: a(0.92) });
      g.circle(bxtip, bytip, sR * 0.022).fill({ color: 0xffffff, alpha: a(1) });
      g.circle(smx - sOutX * sR * 0.18, smy - sOutY * sR * 0.18, sR * 0.25)
       .fill({ color: gp.surface, alpha: a(0.9) }).stroke({ color: 0x445566, width: 0.8, alpha: a(0.7) });

    } else if (partKind === "laser") {
      const hw = sR * 0.09, spineTip = sR * 1.25, spineBase = sR * 0.15;
      const sx0 = smx + sOutX * spineBase, sy0 = smy + sOutY * spineBase;
      const sxtip = smx + sOutX * spineTip, sytip = smy + sOutY * spineTip;
      g.moveTo(sx0 + sPerpX * hw, sy0 + sPerpY * hw)
       .lineTo(sxtip + sPerpX * hw * 0.3, sytip + sPerpY * hw * 0.3)
       .lineTo(sxtip - sPerpX * hw * 0.3, sytip - sPerpY * hw * 0.3)
       .lineTo(sx0 - sPerpX * hw, sy0 - sPerpY * hw)
       .closePath().fill({ color: gp.surface, alpha: a(0.95) });
      g.moveTo(sx0 + sPerpX * hw, sy0 + sPerpY * hw)
       .lineTo(sxtip + sPerpX * hw * 0.3, sytip + sPerpY * hw * 0.3)
       .stroke({ color: gp.highlight, width: 0.8, alpha: a(0.9) });
      g.circle(sxtip, sytip, sR * 0.16).fill({ color: gp.effect, alpha: a(0.38) });
      g.circle(sxtip, sytip, sR * 0.10).fill({ color: gp.effect, alpha: a(0.82) });
      g.circle(sxtip, sytip, sR * 0.04).fill({ color: 0xffffff, alpha: a(1) });
      g.moveTo(sxtip, sytip).lineTo(sxtip + sOutX * sR * 0.5, sytip + sOutY * sR * 0.5)
       .stroke({ color: gp.effect, width: 0.8, alpha: a(0.5) });
      g.circle(smx - sOutX * sR * 0.1, smy - sOutY * sR * 0.1, sR * 0.22)
       .fill({ color: gp.surface, alpha: a(0.82) }).stroke({ color: gp.highlight, width: 0.5, alpha: a(0.6) });

    } else if (partKind === "torpedo") {
      for (let ti = -1; ti <= 1; ti++) {
        const tx2 = smx + sOutX * sR * 0.55 + sPerpX * ti * sR * 0.28;
        const ty2 = smy + sOutY * sR * 0.55 + sPerpY * ti * sR * 0.28;
        g.circle(tx2, ty2, sR * 0.14).fill({ color: 0x050505, alpha: a(0.95) });
        g.circle(tx2, ty2, sR * 0.14).stroke({ color: gp.surface, width: 0.9, alpha: a(0.9) });
        g.circle(tx2, ty2, sR * 0.07).fill({ color: gp.effect, alpha: a(0.55) });
      }
      g.moveTo(smx + sOutX * sR * 0.1 - sPerpX * sR * 0.45, smy + sOutY * sR * 0.1 - sPerpY * sR * 0.45)
       .lineTo(smx + sOutX * sR * 0.8 - sPerpX * sR * 0.45, smy + sOutY * sR * 0.8 - sPerpY * sR * 0.45)
       .lineTo(smx + sOutX * sR * 0.8 + sPerpX * sR * 0.45, smy + sOutY * sR * 0.8 + sPerpY * sR * 0.45)
       .lineTo(smx + sOutX * sR * 0.1 + sPerpX * sR * 0.45, smy + sOutY * sR * 0.1 + sPerpY * sR * 0.45)
       .closePath().stroke({ color: gp.surface, width: 1.0, alpha: a(0.7) });

    } else if (partKind === "plasma") {
      const globeX = smx + sOutX * sR * 0.55, globeY = smy + sOutY * sR * 0.55;
      g.moveTo(smx - sOutX * sR * 0.1, smy - sOutY * sR * 0.1).lineTo(globeX, globeY)
       .stroke({ color: gp.surface, width: 1.0, alpha: a(0.8) });
      for (let ci = 0; ci < 3; ci++) {
        const ca = Math.atan2(sOutY, sOutX) + (ci - 1) * 0.55;
        g.moveTo(globeX - Math.cos(ca) * sR * 0.40, globeY - Math.sin(ca) * sR * 0.40)
         .lineTo(globeX + Math.cos(ca) * sR * 0.40, globeY + Math.sin(ca) * sR * 0.40)
         .stroke({ color: gp.highlight, width: 1.2, alpha: a(0.75) });
      }
      g.circle(globeX, globeY, sR * 0.34).fill({ color: gp.glow, alpha: a(0.25) });
      g.circle(globeX, globeY, sR * 0.22).fill({ color: gp.effect, alpha: a(0.55) });
      g.circle(globeX, globeY, sR * 0.10).fill({ color: 0xffffff, alpha: a(0.9) });

    } else if (partKind === "radar") {
      const dishX = smx + sOutX * sR * 0.50, dishY = smy + sOutY * sR * 0.50;
      g.moveTo(smx - sOutX * sR * 0.1, smy - sOutY * sR * 0.1).lineTo(dishX, dishY)
       .stroke({ color: gp.surface, width: 1.0, alpha: a(0.75) });
      const dishAng = Math.atan2(sOutY, sOutX), da = 0.9;
      g.moveTo(dishX + Math.cos(dishAng - da) * sR * 0.42, dishY + Math.sin(dishAng - da) * sR * 0.42)
       .arc(dishX, dishY, sR * 0.42, dishAng - da, dishAng + da)
       .stroke({ color: gp.highlight, width: 1.3, alpha: a(0.88) });
      g.moveTo(dishX + Math.cos(dishAng - da) * sR * 0.42, dishY + Math.sin(dishAng - da) * sR * 0.42)
       .lineTo(dishX + Math.cos(dishAng + da) * sR * 0.42, dishY + Math.sin(dishAng + da) * sR * 0.42)
       .stroke({ color: gp.surface, width: 0.7, alpha: a(0.6) });
      for (let ai = 1; ai <= 2; ai++) {
        const sr2 = sR * (0.55 + ai * 0.2);
        g.moveTo(dishX + Math.cos(dishAng - 0.35) * sr2, dishY + Math.sin(dishAng - 0.35) * sr2)
         .arc(dishX, dishY, sr2, dishAng - 0.35, dishAng + 0.35)
         .stroke({ color: 0x0099ff, width: 0.6, alpha: a(0.45 - ai * 0.1) });
      }
      g.circle(dishX, dishY, sR * 0.06).fill({ color: 0x00bbff, alpha: a(0.9) });

    } else if (partKind === "lidar") {
      const baseAng = Math.atan2(sOutY, sOutX);
      for (let li = -2; li <= 2; li++) {
        const la = baseAng + li * 0.22;
        const tipDist = sR * (1.0 - Math.abs(li) * 0.08);
        const lx = smx + Math.cos(la) * tipDist, ly = smy + Math.sin(la) * tipDist;
        g.moveTo(smx + sOutX * sR * 0.12, smy + sOutY * sR * 0.12).lineTo(lx, ly)
         .stroke({ color: gp.surface, width: 0.9, alpha: a(0.8) });
        g.circle(lx, ly, sR * 0.06).fill({ color: gp.effect, alpha: a(li === 0 ? 0.9 : 0.6) });
      }
      g.circle(smx + sOutX * sR * 0.12, smy + sOutY * sR * 0.12, sR * 0.15)
       .fill({ color: gp.surface, alpha: a(0.85) }).stroke({ color: 0x3a5570, width: 0.5, alpha: a(0.7) });

    } else if (partKind === "scrambler") {
      const ant = sR * 0.75;
      for (let ai = 0; ai < 2; ai++) {
        const aa = Math.atan2(sOutY, sOutX) + ai * 1.5708;
        g.moveTo(smx - Math.cos(aa) * ant, smy - Math.sin(aa) * ant)
         .lineTo(smx + Math.cos(aa) * ant, smy + Math.sin(aa) * ant)
         .stroke({ color: gp.surface, width: 1.2, alpha: a(0.85) });
        g.circle(smx + Math.cos(aa) * ant, smy + Math.sin(aa) * ant, sR * 0.08)
         .fill({ color: gp.highlight, alpha: a(0.9) });
        g.circle(smx - Math.cos(aa) * ant, smy - Math.sin(aa) * ant, sR * 0.08)
         .fill({ color: gp.highlight, alpha: a(0.9) });
      }
      for (let ri = 1; ri <= 2; ri++)
        g.circle(smx, smy, sR * ri * 0.38).stroke({ color: gp.effect, width: 0.7, alpha: a(0.4 - ri * 0.1) });
      g.circle(smx, smy, sR * 0.10).fill({ color: gp.effect, alpha: a(0.8) });

    } else if (partKind === "webber") {
      const wbAng = Math.atan2(sOutY, sOutX);
      for (let wi = 0; wi < 5; wi++) {
        const wa = wbAng + (wi - 2) * 0.42;
        const wLen = sR * (0.85 + (wi % 2) * 0.15);
        const ctrlX = smx + Math.cos(wa + 0.5) * sR * 0.6;
        const ctrlY = smy + Math.sin(wa + 0.5) * sR * 0.6;
        g.moveTo(smx + sOutX * sR * 0.1, smy + sOutY * sR * 0.1)
         .quadraticCurveTo(ctrlX, ctrlY, smx + Math.cos(wa) * wLen, smy + Math.sin(wa) * wLen)
         .stroke({ color: gp.effect, width: 0.9, alpha: a(0.65) });
        g.circle(smx + Math.cos(wa) * wLen, smy + Math.sin(wa) * wLen, sR * 0.07)
         .fill({ color: gp.effect, alpha: a(0.8) });
      }
      g.circle(smx + sOutX * sR * 0.1, smy + sOutY * sR * 0.1, sR * 0.18)
       .fill({ color: gp.surface, alpha: a(0.85) }).stroke({ color: gp.highlight, width: 0.6, alpha: a(0.7) });

    } else if (partKind === "thruster") {
      const nozzleX = smx - sOutX * sR * 0.15, nozzleY = smy - sOutY * sR * 0.15, bell = sR * 0.45;
      g.moveTo(nozzleX + sPerpX * bell * 0.5, nozzleY + sPerpY * bell * 0.5)
       .lineTo(nozzleX + sPerpX * bell - sOutX * sR * 0.45, nozzleY + sPerpY * bell - sOutY * sR * 0.45)
       .lineTo(nozzleX - sPerpX * bell - sOutX * sR * 0.45, nozzleY - sPerpY * bell - sOutY * sR * 0.45)
       .lineTo(nozzleX - sPerpX * bell * 0.5, nozzleY - sPerpY * bell * 0.5)
       .closePath().fill({ color: gp.surface, alpha: a(0.90) });
      g.moveTo(nozzleX + sPerpX * bell - sOutX * sR * 0.45, nozzleY + sPerpY * bell - sOutY * sR * 0.45)
       .lineTo(nozzleX - sPerpX * bell - sOutX * sR * 0.45, nozzleY - sPerpY * bell - sOutY * sR * 0.45)
       .stroke({ color: gp.highlight, width: 1.0, alpha: a(0.9) });
      const exX = nozzleX - sOutX * sR * 0.55, exY = nozzleY - sOutY * sR * 0.55;
      g.circle(exX, exY, sR * 0.28).fill({ color: gp.effect, alpha: a(0.35) });
      g.circle(exX, exY, sR * 0.14).fill({ color: gp.effect, alpha: a(0.70) });
      g.circle(exX, exY, sR * 0.055).fill({ color: 0xffffff, alpha: a(0.9) });

    } else if (partKind === "ion-engine") {
      for (let gi = 0; gi < 3; gi++) {
        const gBack = sR * (-0.1 - gi * 0.22);
        const gx = smx + sOutX * gBack, gy = smy + sOutY * gBack;
        g.moveTo(gx + sPerpX * sR * 0.42, gy + sPerpY * sR * 0.42)
         .lineTo(gx - sPerpX * sR * 0.42, gy - sPerpY * sR * 0.42)
         .stroke({ color: gp.surface, width: 1.1, alpha: a(0.85) });
        for (let ggi = -1; ggi <= 1; ggi++)
          g.circle(gx + sPerpX * ggi * sR * 0.2, gy + sPerpY * ggi * sR * 0.2, sR * 0.04)
           .fill({ color: gp.effect, alpha: a(0.6) });
      }
      const pBack = sR * 0.9;
      g.moveTo(smx - sOutX * sR * 0.1 + sPerpX * sR * 0.12, smy - sOutY * sR * 0.1 + sPerpY * sR * 0.12)
       .lineTo(smx - sOutX * pBack, smy - sOutY * pBack)
       .lineTo(smx - sOutX * sR * 0.1 - sPerpX * sR * 0.12, smy - sOutY * sR * 0.1 - sPerpY * sR * 0.12)
       .stroke({ color: gp.effect, width: 0.9, alpha: a(0.45) });
      g.circle(smx - sOutX * pBack, smy - sOutY * pBack, sR * 0.12).fill({ color: gp.effect, alpha: a(0.55) });

    } else if (partKind === "warp-nacelle") {
      g.moveTo(smx - sOutX * sR * 0.32, smy - sOutY * sR * 0.32)
       .lineTo(smx + sOutX * sR * 0.32, smy + sOutY * sR * 0.32)
       .stroke({ color: gp.surface, width: 1.3, alpha: a(0.9) });
      for (let ri = 0; ri < 2; ri++) {
        const rOff = (ri - 0.5) * sR * 0.35;
        const rx = smx + sPerpX * rOff, ry = smy + sPerpY * rOff;
        g.circle(rx, ry, sR * 0.32).stroke({ color: gp.highlight, width: 1.1, alpha: a(0.80) });
        g.circle(rx, ry, sR * 0.18).fill({ color: gp.effect, alpha: a(0.30) });
        g.circle(rx, ry, sR * 0.09).fill({ color: gp.effect, alpha: a(0.65) });
      }
      g.circle(smx, smy, sR * 0.14).fill({ color: gp.glow, alpha: a(0.55) });
      g.circle(smx, smy, sR * 0.06).fill({ color: 0xffffff, alpha: a(0.8) });

    } else if (partKind === "gravity-drive") {
      for (let ri = 3; ri >= 1; ri--)
        g.circle(smx, smy, sR * ri * 0.20).stroke({ color: gp.highlight, width: 0.9, alpha: a(0.35 + ri * 0.15) });
      g.circle(smx, smy, sR * 0.22).fill({ color: gp.glow, alpha: a(0.40) });
      g.circle(smx, smy, sR * 0.12).fill({ color: gp.effect, alpha: a(0.75) });
      g.circle(smx, smy, sR * 0.05).fill({ color: 0xffffff, alpha: a(1) });
      for (let si = 0; si < 4; si++) {
        const sa = (si / 4) * Math.PI * 2;
        g.moveTo(smx + Math.cos(sa) * sR * 0.22, smy + Math.sin(sa) * sR * 0.22)
         .lineTo(smx + Math.cos(sa) * sR * 0.65, smy + Math.sin(sa) * sR * 0.65)
         .stroke({ color: gp.effect, width: 0.7, alpha: a(0.45) });
      }
      g.circle(smx, smy, sR * 0.70).stroke({ color: gp.surface, width: 1.1, alpha: a(0.65) });

    } else if (partKind === "shield") {
      const projX = smx + sOutX * sR * 0.35, projY = smy + sOutY * sR * 0.35;
      g.circle(projX, projY, sR * 0.26).fill({ color: gp.surface, alpha: a(0.9) });
      g.circle(projX, projY, sR * 0.14).fill({ color: 0x00bbff, alpha: a(0.85) });
      g.circle(projX, projY, sR * 0.06).fill({ color: 0xffffff, alpha: a(1) });
      const dAng = Math.atan2(sOutY, sOutX);
      g.moveTo(projX + Math.cos(dAng - 1.1) * sR * 0.65, projY + Math.sin(dAng - 1.1) * sR * 0.65)
       .arc(projX, projY, sR * 0.65, dAng - 1.1, dAng + 1.1)
       .stroke({ color: gp.effect, width: 1.3, alpha: a(0.60) });
      for (let fi = -1; fi <= 1; fi++) {
        const fa = dAng + fi * 0.55;
        g.moveTo(projX, projY)
         .lineTo(projX + Math.cos(fa) * sR * 0.60, projY + Math.sin(fa) * sR * 0.60)
         .stroke({ color: gp.effect, width: 0.5, alpha: a(0.35) });
      }

    } else if (partKind === "armor") {
      const plates = [
        { ox: sOutX * sR * 0.15, oy: sOutY * sR * 0.15, w: sR * 0.5, h: sR * 0.3 },
        { ox: -sOutX * sR * 0.1 + sPerpX * sR * 0.22, oy: -sOutY * sR * 0.1 + sPerpY * sR * 0.22, w: sR * 0.4, h: sR * 0.25 },
        { ox: -sOutX * sR * 0.1 - sPerpX * sR * 0.22, oy: -sOutY * sR * 0.1 - sPerpY * sR * 0.22, w: sR * 0.4, h: sR * 0.25 },
      ];
      for (const pl of plates) {
        const px = smx + pl.ox, py = smy + pl.oy;
        g.moveTo(px - sOutX * pl.w + sPerpX * pl.h, py - sOutY * pl.w + sPerpY * pl.h)
         .lineTo(px + sOutX * pl.w + sPerpX * pl.h, py + sOutY * pl.w + sPerpY * pl.h)
         .lineTo(px + sOutX * pl.w - sPerpX * pl.h, py + sOutY * pl.w - sPerpY * pl.h)
         .lineTo(px - sOutX * pl.w - sPerpX * pl.h, py - sOutY * pl.w - sPerpY * pl.h)
         .closePath().fill({ color: gp.surface, alpha: a(0.85) })
         .stroke({ color: gp.highlight, width: 0.7, alpha: a(0.75) });
        for (let ri = -1; ri <= 1; ri += 2)
          g.circle(px + sPerpX * pl.h * 0.7 * ri, py + sPerpY * pl.h * 0.7 * ri, sR * 0.05)
           .fill({ color: gp.highlight, alpha: a(0.9) });
      }

    } else if (partKind === "cloak") {
      const cloakX = smx + sOutX * sR * 0.3, cloakY = smy + sOutY * sR * 0.3;
      g.circle(cloakX, cloakY, sR * 0.28).fill({ color: gp.surface, alpha: a(0.7) });
      g.circle(cloakX, cloakY, sR * 0.14).fill({ color: gp.effect, alpha: a(0.5) });
      g.circle(cloakX, cloakY, sR * 0.06).fill({ color: 0xffffff, alpha: a(0.65) });
      for (let si = 1; si <= 3; si++)
        g.circle(cloakX, cloakY, sR * si * 0.28).stroke({ color: gp.effect, width: 0.7, alpha: a(0.30 - si * 0.06) });
      for (const sa of [0.3, 1.1, 2.0, 3.3, 4.5, 5.2])
        g.circle(smx + Math.cos(sa) * sR * (0.42 + (sa % 0.5) * 0.3), smy + Math.sin(sa) * sR * (0.42 + (sa % 0.5) * 0.3), sR * 0.04)
         .fill({ color: gp.effect, alpha: a(0.3) });

    } else if (partKind === "warp-stabilizer") {
      const stbAng = Math.atan2(sOutY, sOutX);
      for (let wi = 0; wi < 3; wi++) {
        const wa = stbAng + (wi / 3) * Math.PI * 2;
        const rodLen = sR * 0.68;
        const tipX = smx + Math.cos(wa) * rodLen, tipY = smy + Math.sin(wa) * rodLen;
        g.moveTo(smx, smy).lineTo(tipX, tipY).stroke({ color: gp.surface, width: 1.2, alpha: a(0.85) });
        g.circle(tipX, tipY, sR * 0.14).fill({ color: gp.effect, alpha: a(0.70) });
        g.circle(tipX, tipY, sR * 0.06).fill({ color: 0xffffff, alpha: a(0.9) });
      }
      g.circle(smx, smy, sR * 0.18).fill({ color: gp.surface, alpha: a(0.9) })
       .stroke({ color: gp.highlight, width: 0.7, alpha: a(0.8) });

    } else if (partKind === "reactor") {
      g.circle(smx, smy, sR * 0.50).fill({ color: gp.surface, alpha: a(0.85) });
      g.circle(smx, smy, sR * 0.50).stroke({ color: 0x996600, width: 1.0, alpha: a(0.72) });
      g.circle(smx, smy, sR * 0.28).fill({ color: gp.highlight, alpha: a(0.3) });
      g.circle(smx, smy, sR * 0.14).fill({ color: gp.effect, alpha: a(0.92) });
      g.circle(smx, smy, sR * 0.055).fill({ color: 0xffffff, alpha: a(0.9) });
      for (let i = 0; i < N; i++) {
        const s2 = sv[i]!, e2 = sv[(i + 1) % N]!;
        const smx2 = (s2.x + e2.x) / 2, smy2 = (s2.y + e2.y) / 2;
        g.moveTo(smx, smy).lineTo(smx2, smy2).stroke({ color: 0x886600, width: 0.8, alpha: a(0.55) });
        g.circle(smx2, smy2, sR * 0.05).fill({ color: gp.effect, alpha: a(0.65) });
      }

    } else if (partKind === "crew-quarters") {
      g.circle(smx, smy, sR * 0.52).fill({ color: gp.surface, alpha: a(0.75) });
      g.circle(smx, smy, sR * 0.52).stroke({ color: 0x3a5570, width: 0.8, alpha: a(0.7) });
      for (let wi = 0; wi < 3; wi++) {
        const wa = (wi / 3) * Math.PI * 2;
        const wx = smx + Math.cos(wa) * sR * 0.32, wy = smy + Math.sin(wa) * sR * 0.32;
        g.circle(wx, wy, sR * 0.10).fill({ color: 0x080c14, alpha: a(0.9) });
        g.circle(wx, wy, sR * 0.10).stroke({ color: 0x4499cc, width: 0.7, alpha: a(0.8) });
        g.circle(wx, wy, sR * 0.04).fill({ color: 0x4499cc, alpha: a(0.7) });
      }
      g.circle(smx, smy, sR * 0.18).fill({ color: gp.highlight, alpha: a(0.3) });

    } else if (partKind === "frame") {
      for (let i = 0; i < N; i++) {
        for (let j = i + 2; j < N - (i === 0 ? 1 : 0); j++) {
          g.moveTo(sv[i]!.x, sv[i]!.y).lineTo(sv[j]!.x, sv[j]!.y)
           .stroke({ color: gp.surface, width: 0.9, alpha: a(0.65) });
        }
      }
      for (const p of sv) {
        const bx2 = smx + (p.x - smx) * 0.75, by2 = smy + (p.y - smy) * 0.75;
        g.circle(bx2, by2, sR * 0.07).fill({ color: gp.highlight, alpha: a(0.80) });
      }
      g.circle(smx, smy, sR * 0.12).fill({ color: gp.surface, alpha: a(0.85) })
       .stroke({ color: gp.highlight, width: 0.8, alpha: a(0.75) });

    } else if (partKind === "converter-unit") {
      const flowLen = sR * 0.6;
      g.moveTo(smx - sOutX * flowLen, smy - sOutY * flowLen)
       .lineTo(smx + sOutX * flowLen, smy + sOutY * flowLen)
       .stroke({ color: 0x882299, width: 1.8, alpha: a(0.78) });
      const aX = smx + sOutX * flowLen * 0.85, aY = smy + sOutY * flowLen * 0.85;
      g.moveTo(aX, aY)
       .lineTo(aX - sOutX * sR * 0.22 + sPerpX * sR * 0.15, aY - sOutY * sR * 0.22 + sPerpY * sR * 0.15)
       .lineTo(aX - sOutX * sR * 0.22 - sPerpX * sR * 0.15, aY - sOutY * sR * 0.22 - sPerpY * sR * 0.15)
       .closePath().fill({ color: gp.effect, alpha: a(0.88) });
      g.circle(smx - sOutX * flowLen, smy - sOutY * flowLen, sR * 0.14).fill({ color: 0x6600cc, alpha: a(0.72) });
      g.circle(smx + sOutX * flowLen, smy + sOutY * flowLen, sR * 0.14).fill({ color: gp.effect, alpha: a(0.72) });

    } else { // factory-bay
      for (let gi = -1; gi <= 1; gi++) {
        const gx = smx + sPerpX * sR * gi * 0.4, gy = smy + sPerpY * sR * gi * 0.4;
        g.moveTo(gx - sOutX * sR * 0.6, gy - sOutY * sR * 0.6)
         .lineTo(gx + sOutX * sR * 0.6, gy + sOutY * sR * 0.6)
         .stroke({ color: 0x556655, width: 0.6, alpha: a(0.7) });
      }
      for (let gi = -1; gi <= 1; gi++) {
        const gx = smx + sOutX * sR * gi * 0.4, gy = smy + sOutY * sR * gi * 0.4;
        g.moveTo(gx - sPerpX * sR * 0.6, gy - sPerpY * sR * 0.6)
         .lineTo(gx + sPerpX * sR * 0.6, gy + sPerpY * sR * 0.6)
         .stroke({ color: 0x556655, width: 0.6, alpha: a(0.7) });
      }
      const craneX2 = smx + sOutX * sR * 0.7, craneY2 = smy + sOutY * sR * 0.7;
      g.moveTo(smx, smy).lineTo(craneX2, craneY2).stroke({ color: 0xaabb99, width: 1.3, alpha: a(0.85) });
      g.moveTo(craneX2 - sPerpX * sR * 0.22, craneY2 - sPerpY * sR * 0.22)
       .lineTo(craneX2 + sPerpX * sR * 0.22, craneY2 + sPerpY * sR * 0.22)
       .stroke({ color: 0x99bb88, width: 1.0, alpha: a(0.8) });
      g.circle(craneX2, craneY2, sR * 0.12).fill({ color: 0xffaa22, alpha: a(0.85) });
      g.circle(craneX2, craneY2, sR * 0.06).fill({ color: 0xffffff, alpha: a(0.95) });
      g.circle(smx, smy, sR * 0.22).fill({ color: 0x334433, alpha: a(0.9) })
       .stroke({ color: 0x88bb66, width: 0.6, alpha: a(0.7) });
      g.circle(smx, smy, sR * 0.10).fill({ color: gp.effect, alpha: a(0.6) });
    }
  }

  private drawSolarShipBuilder(data: SolarShipBuilderRenderData): void {
    const g = this.solarBuilderGfx;
    g.clear();

    const W = this.width;
    const H = this.height;
    const SPLIT = 800;
    const CX = 400;
    const CY = 360;

    // ── Panel backgrounds ───────────────────────────────────────────────────
    g.rect(0, 0, SPLIT, H).fill({ color: 0x080e18, alpha: 0.97 });
    g.rect(SPLIT, 0, W - SPLIT, H).fill({ color: 0x0e1a2e, alpha: 0.97 });
    g.rect(SPLIT, 0, 2, H).fill({ color: 0x2a466b, alpha: 1 });

    // ── Module color lookup ─────────────────────────────────────────────────
    const moduleColor = (type: string): number => {
      switch (type) {
        case "core": return 0x4488ff;
        case "weapon": return 0xff4444;
        case "external": return 0x44cc88;
        case "internal": return 0xffaa44;
        case "structure": return 0x8899aa;
        default: return 0xaa55ee; // converter
      }
    };

    // ── Zoom bar (left edge of canvas, mirrors solar system zoom bar) ──────
    {
      const zb = { x: 8, top: 120, bottom: 560, w: 18 };
      const zbH = zb.bottom - zb.top;
      const zoomFrac = Math.log(data.zoom / 0.2) / Math.log(5.0 / 0.2);
      const knobY = zb.bottom - zbH * Math.max(0, Math.min(1, zoomFrac));
      g.rect(zb.x + zb.w / 2 - 1, zb.top, 2, zbH).fill({ color: 0x223344, alpha: 0.8 });
      g.rect(zb.x, knobY - 6, zb.w, 12).fill({ color: 0x2a6699, alpha: 0.9 })
        .stroke({ color: 0x88ccff, width: 1, alpha: 0.7 });
      const zLabel = data.zoom >= 2 ? `${data.zoom.toFixed(1)}x` : `${data.zoom.toFixed(2)}x`;
      this.solarBuilderZoomText.text = zLabel;
      this.solarBuilderZoomText.x = zb.x + zb.w + 2;
      this.solarBuilderZoomText.y = zb.top - 14;
    }

    // World → screen transform
    const w2sx = (wx: number) => wx * data.zoom + CX + data.panX;
    const w2sy = (wy: number) => wy * data.zoom + CY + data.panY;

    // ── Placed modules ──────────────────────────────────────────────────────
    // Ship center in screen space (world origin = (0,0) = core center)
    const shipScrX = w2sx(0), shipScrY = w2sy(0);
    for (const mod of data.modules) {
      const verts = mod.vertices;
      if (verts.length < 3) continue;
      const sv = verts.map(v => ({ x: w2sx(v.x), y: w2sy(v.y) }));
      if (mod.isDestroyed) {
        // Draw destroyed module: dark red hollow shell with X overlay
        g.moveTo(sv[0]!.x, sv[0]!.y);
        for (let i = 1; i < sv.length; i++) g.lineTo(sv[i]!.x, sv[i]!.y);
        g.closePath()
          .fill({ color: 0x220000, alpha: 0.7 })
          .stroke({ color: 0xff2200, width: 2, alpha: 0.9 });
        // X cross indicator over the destroyed module
        const cx = sv.reduce((s, v) => s + v.x, 0) / sv.length;
        const cy = sv.reduce((s, v) => s + v.y, 0) / sv.length;
        const xr = 6 * data.zoom;
        g.moveTo(cx - xr, cy - xr).lineTo(cx + xr, cy + xr)
          .stroke({ color: 0xff2200, width: 1.5, alpha: 0.85 });
        g.moveTo(cx + xr, cy - xr).lineTo(cx - xr, cy + xr)
          .stroke({ color: 0xff2200, width: 1.5, alpha: 0.85 });
      } else {
        this.drawBuilderModuleDetail(g, sv, mod.moduleType, mod.partKind, mod.grade, shipScrX, shipScrY, 1.0, false);
      }
    }

    // ── REPAIR ALL button (only when there are broken modules) ──────────────
    if (data.destroyedCount > 0) {
      const RX = 16, RY = 630, RW = 250, RH = 32;
      const canAfford = data.repairAllCost !== null;
      const btnColor = canAfford ? 0x003311 : 0x220011;
      const borderColor = canAfford ? 0x00ee55 : 0x882200;
      const pulse = Math.sin(Date.now() / 300) * 0.15 + 0.85;
      g.rect(RX, RY, RW, RH)
        .fill({ color: btnColor, alpha: 0.92 })
        .stroke({ color: borderColor, width: 2, alpha: pulse });
      const costStr = data.repairAllCost === null
        ? "PARTS UNAVAILABLE"
        : data.repairAllCost === 0
          ? "REPAIR ALL  (free)"
          : `REPAIR ALL  ${data.repairAllCost.toLocaleString()} ¢`;
      this.solarBuilderRepairText.text = costStr;
      this.solarBuilderRepairText.x = RX + RW / 2;
      this.solarBuilderRepairText.y = RY + RH / 2;
      this.solarBuilderRepairText.visible = true;
    } else {
      this.solarBuilderRepairText.visible = false;
    }

    // ── Snap point markers ──────────────────────────────────────────────────
    for (const sp of data.snapPoints) {
      const sx = w2sx(sp.worldX);
      const sy = w2sy(sp.worldY);
      const color = sp.isActive ? 0x00ffaa : 0x336688;
      const alpha = sp.isActive ? 0.85 : 0.45;
      g.circle(sx, sy, 5).fill({ color, alpha });
      g.circle(sx, sy, 7).stroke({ color, width: 1, alpha: alpha * 0.6 });
    }

    // ── Ghost module — same detailed visuals, partially transparent ──────────
    if (data.ghost) {
      const { vertices: gv, moduleType, partKind: ghostKind, grade: ghostGrade, isSnapped } = data.ghost;
      if (gv.length >= 3) {
        const gsv = gv.map(v => ({ x: w2sx(v.x), y: w2sy(v.y) }));
        this.drawBuilderModuleDetail(g, gsv, moduleType, ghostKind, ghostGrade, shipScrX, shipScrY,
          isSnapped ? 0.55 : 0.30, true);
        // Snap-state outline on top
        g.moveTo(gsv[0]!.x, gsv[0]!.y);
        for (let i = 1; i < gsv.length; i++) g.lineTo(gsv[i]!.x, gsv[i]!.y);
        g.closePath().stroke({ color: isSnapped ? 0x00ffaa : 0xffffff, width: 2,
          alpha: isSnapped ? 0.75 : 0.45 });
      }
    }

    // ── Right panel ─────────────────────────────────────────────────────────
    const rx = SPLIT + 12;

    // Ship name header + SAVE + NEW buttons
    g.rect(SPLIT + 4, 4, W - SPLIT - 8, 36).fill({ color: 0x112233, alpha: 0.8 });
    g.rect(SPLIT + 4, 4, W - SPLIT - 8, 36).stroke({ color: 0x2a466b, width: 1 });
    // SAVE button (saves without activating)
    g.rect(W - 84, 8, 36, 28).fill({ color: 0x005522, alpha: 0.9 });
    g.rect(W - 84, 8, 36, 28).stroke({ color: 0x00cc66, width: 1 });
    // USE button (saves and sets as active ship — gold accent)
    g.rect(W - 84 + 38, 8, 38, 28).fill({ color: 0x332200, alpha: 0.9 });
    g.rect(W - 84 + 38, 8, 38, 28).stroke({ color: 0xffaa00, width: 1 });
    // NEW button (just left of SAVE/USE group)
    g.rect(W - 84 - 4 - 58, 8, 58, 28).fill({ color: 0x002244, alpha: 0.9 });
    g.rect(W - 84 - 4 - 58, 8, 58, 28).stroke({ color: 0x2266aa, width: 1 });
    // Rename hint: ship name zone shows subtle underline to indicate clickability
    if (!data.renameMode) {
      g.rect(SPLIT + 20, 36, W - 84 - 4 - 58 - SPLIT - 24, 1).fill({ color: 0x334455, alpha: 0.6 });
    }

    // Budget bars
    const bx = rx;
    let by = 52;
    const bw = W - SPLIT - 24;
    const budgetRows: Array<{ label: string; used: number; total: number; color: number }> = [
      { label: "WPN", used: data.budget.weaponUsed, total: data.budget.weaponTotal, color: 0xff4444 },
      { label: "EXT", used: data.budget.externalUsed, total: data.budget.externalTotal, color: 0x44cc88 },
      { label: "INT", used: data.budget.internalUsed, total: data.budget.internalTotal, color: 0xffaa44 },
      { label: "CVT", used: data.budget.converterUsed, total: data.budget.converterTotal, color: 0xaa55ee },
    ];
    for (const row of budgetRows) {
      g.rect(bx, by, bw, 11).fill({ color: 0x0a1824, alpha: 0.8 });
      const fillW = row.total > 0 ? (row.used / row.total) * bw : 0;
      g.rect(bx, by, fillW, 11).fill({ color: row.color, alpha: 0.75 });
      g.rect(bx, by, bw, 11).stroke({ color: 0x2a466b, width: 1 });
      by += 14;
    }
    // Parts counter row
    {
      const fillW = (data.budget.partsUsed / data.budget.partsMax) * bw;
      g.rect(bx, by, bw, 11).fill({ color: 0x0a1824, alpha: 0.8 });
      g.rect(bx, by, fillW, 11).fill({ color: 0x888899, alpha: 0.6 });
      g.rect(bx, by, bw, 11).stroke({ color: 0x2a466b, width: 1 });
      by += 14;
    }

    // ── Core-sides toggle strip ──────────────────────────────────────────────
    const CORE_SIDES_Y = 98;
    const panelW = W - SPLIT - 8;
    g.rect(SPLIT + 4, CORE_SIDES_Y, panelW, 20).fill({ color: 0x0a1824, alpha: 0.9 });
    g.rect(SPLIT + 4, CORE_SIDES_Y, panelW, 20).stroke({ color: 0x2a466b, width: 1 });
    // Left arrow chevron
    g.moveTo(SPLIT + 14, CORE_SIDES_Y + 10).lineTo(SPLIT + 20, CORE_SIDES_Y + 5).lineTo(SPLIT + 20, CORE_SIDES_Y + 15).closePath()
      .fill({ color: 0x88aacc, alpha: 0.9 });
    // Right arrow chevron
    g.moveTo(SPLIT + 4 + panelW - 10, CORE_SIDES_Y + 10).lineTo(SPLIT + 4 + panelW - 16, CORE_SIDES_Y + 5).lineTo(SPLIT + 4 + panelW - 16, CORE_SIDES_Y + 15).closePath()
      .fill({ color: 0x88aacc, alpha: 0.9 });

    // Palette header
    const TILE_START_Y = 120;
    g.rect(SPLIT + 4, TILE_START_Y - 2, W - SPLIT - 8, 2).fill({ color: 0x2a466b, alpha: 0.8 });

    // Palette tiles with inline buttons
    const TILE_H = 36;
    const TILE_W = W - SPLIT - 8;
    const BTN_W = 38;
    const BTN_H = 22;
    const BTN_GAP = 3;
    // Button x positions (right-aligned): [BUY] [SELL] [TRASH]
    const trashX = SPLIT + 4 + TILE_W - BTN_W;
    const sellX = trashX - BTN_GAP - BTN_W;
    const buyX = sellX - BTN_GAP - BTN_W;

    for (let i = 0; i < data.palette.length; i++) {
      const item = data.palette[i]!;
      const ty = TILE_START_Y + i * TILE_H;
      if (ty + TILE_H > H) break;

      // Alternating row backgrounds
      const isEven = i % 2 === 0;
      const baseBg = isEven ? 0x0e1a2e : 0x0b1626;
      const tileBg = item.isSelected ? 0x1a3a5c : baseBg;
      g.rect(SPLIT + 4, ty, TILE_W, TILE_H - 1)
        .fill({ color: tileBg, alpha: item.isSelected ? 0.97 : 0.85 });

      // Selected border (2px, bright)
      if (item.isSelected) {
        g.rect(SPLIT + 4, ty, TILE_W, TILE_H - 1)
          .stroke({ color: 0x44ccff, width: 2, alpha: 1.0 });
      }

      // Color swatch
      const swatchColor = moduleColor(item.moduleType);
      g.rect(SPLIT + 8, ty + 8, 10, 20).fill({ color: swatchColor, alpha: 0.85 });

      // Inline buttons
      const btnTop = ty + (TILE_H - BTN_H) / 2;

      // BUY button (green when in stock, dim when not)
      const canBuy = item.shopStock > 0;
      g.rect(buyX, btnTop, BTN_W, BTN_H).fill({ color: canBuy ? 0x006633 : 0x1a2a1a, alpha: canBuy ? 0.9 : 0.5 });
      g.rect(buyX, btnTop, BTN_W, BTN_H).stroke({ color: canBuy ? 0x00cc66 : 0x334433, width: 1 });

      // SELL button (orange when owned, dim when not)
      const canSell = item.quantity > 0;
      g.rect(sellX, btnTop, BTN_W, BTN_H).fill({ color: canSell ? 0x664400 : 0x1a1a0a, alpha: canSell ? 0.9 : 0.5 });
      g.rect(sellX, btnTop, BTN_W, BTN_H).stroke({ color: canSell ? 0xffaa00 : 0x443322, width: 1 });

      // TRASH button (red when owned, dim when not)
      g.rect(trashX, btnTop, BTN_W, BTN_H).fill({ color: canSell ? 0x660000 : 0x1a0a0a, alpha: canSell ? 0.9 : 0.5 });
      g.rect(trashX, btnTop, BTN_W, BTN_H).stroke({ color: canSell ? 0xff3322 : 0x442222, width: 1 });
    }

    // ── Status message (overlaid center-bottom of left panel) ───────────────
    if (data.statusMsg) {
      const msgW = 240;
      const msgH = 32;
      const mx = (SPLIT - msgW) / 2;
      const my = H - 52;
      g.rect(mx, my, msgW, msgH).fill({ color: 0x003322, alpha: 0.85 });
      g.rect(mx, my, msgW, msgH).stroke({ color: 0x00ffaa, width: 1.5 });
      this.solarBuilderStatusText.text = data.statusMsg;
      this.solarBuilderStatusText.x = SPLIT / 2;
      this.solarBuilderStatusText.y = my + msgH / 2;
      this.solarBuilderStatusText.visible = true;
    } else {
      this.solarBuilderStatusText.visible = false;
    }

    // ── Title (ship name) ────────────────────────────────────────────────────
    if (data.renameMode) {
      // Show rename buffer with blinking cursor
      const cursor = Math.floor(Date.now() / 500) % 2 === 0 ? "_" : " ";
      this.solarBuilderTitleText.text = (data.renameBuf + cursor).toUpperCase();
      this.solarBuilderTitleText.style.fill = 0xffdd88;
    } else {
      this.solarBuilderTitleText.text = data.shipName.toUpperCase();
      this.solarBuilderTitleText.style.fill = 0xaaddff;
    }
    // Center title in name zone (left of NEW button at W-84-4-58=1134)
    this.solarBuilderTitleText.x = (SPLIT + 20 + (W - 84 - 4 - 58)) / 2;
    this.solarBuilderTitleText.y = 22;
    this.solarBuilderTitleText.visible = true;

    // ── Budget labels ─────────────────────────────────────────────────────────
    const budgetLabelDefs = [
      `WPN  ${data.budget.weaponUsed}/${data.budget.weaponTotal}`,
      `EXT  ${data.budget.externalUsed}/${data.budget.externalTotal}`,
      `INT  ${data.budget.internalUsed}/${data.budget.internalTotal}`,
      `CVT  ${data.budget.converterUsed}/${data.budget.converterTotal}`,
      `PARTS  ${data.budget.partsUsed}/${data.budget.partsMax}`,
    ];
    this.ensureTextPool(this.solarBuilderBudgetLabels, budgetLabelDefs.length, 11);
    for (let i = 0; i < budgetLabelDefs.length; i++) {
      const t = this.solarBuilderBudgetLabels[i]!;
      t.text = budgetLabelDefs[i]!;
      t.x = SPLIT + 8;
      t.y = 52 + i * 14;
      t.anchor.set(0, 0.5);
      t.visible = true;
    }

    // ── SAVE + USE + NEW button labels ────────────────────────────────────────
    this.ensureTextPool(this.solarBuilderBudgetLabels, budgetLabelDefs.length + 4, 11);
    {
      const tSave = this.solarBuilderBudgetLabels[budgetLabelDefs.length + 1]!;
      tSave.text = "SAVE";
      tSave.x = W - 84 + 18;
      tSave.y = 22;
      tSave.anchor.set(0.5, 0.5);
      tSave.style.fill = 0x00ff88;
      tSave.style.fontSize = 11;
      tSave.visible = true;
    }
    {
      const tUse = this.solarBuilderBudgetLabels[budgetLabelDefs.length + 3]!;
      tUse.text = "USE";
      tUse.x = W - 84 + 38 + 19;
      tUse.y = 22;
      tUse.anchor.set(0.5, 0.5);
      tUse.style.fill = 0xffaa00;
      tUse.style.fontSize = 11;
      tUse.visible = true;
    }
    {
      const tNew = this.solarBuilderBudgetLabels[budgetLabelDefs.length + 2]!;
      tNew.text = "NEW";
      tNew.x = W - 84 - 4 - 58 + 29;
      tNew.y = 22;
      tNew.anchor.set(0.5, 0.5);
      tNew.style.fill = 0x66aaff;
      tNew.style.fontSize = 12;
      tNew.visible = true;
    }

    // ── Core-sides label (centre of toggle strip) ─────────────────────────────
    {
      const t = this.solarBuilderBudgetLabels[budgetLabelDefs.length]!;
      t.text = `CORE  ${data.coreSideCount}S`;
      t.x = SPLIT + (W - SPLIT) / 2;
      t.y = CORE_SIDES_Y + 10;
      t.anchor.set(0.5, 0.5);
      t.style.fill = 0xaaccff;
      t.style.fontSize = 11;
      t.visible = true;
    }

    // ── Palette item labels + button labels ───────────────────────────────────
    // Each palette row needs: name label + BUY / SELL / TRASH labels → 4 texts per row
    const TEXTS_PER_ROW = 4;
    this.ensureTextPool(this.solarBuilderPaletteLabels, data.palette.length * TEXTS_PER_ROW, 11);
    for (let i = 0; i < data.palette.length; i++) {
      const item = data.palette[i]!;
      const ty = TILE_START_Y + i * TILE_H;
      const visible = ty + TILE_H <= H;
      const btnTop = ty + (TILE_H - BTN_H) / 2;

      // Name + qty label
      const tName = this.solarBuilderPaletteLabels[i * TEXTS_PER_ROW]!;
      if (!visible) { tName.visible = false; }
      else {
        tName.text = `${item.name.toUpperCase()} ×${item.quantity}`;
        tName.x = SPLIT + 22;
        tName.y = ty + TILE_H / 2;
        tName.anchor.set(0, 0.5);
        tName.style.fill = item.isSelected ? 0xffffff : 0x99bbdd;
        tName.style.fontSize = 11;
        tName.visible = true;
      }

      // BUY label
      const tBuy = this.solarBuilderPaletteLabels[i * TEXTS_PER_ROW + 1]!;
      if (!visible) { tBuy.visible = false; }
      else {
        tBuy.text = item.shopStock > 0 ? `B${item.shopStock}` : "BUY";
        tBuy.x = buyX + BTN_W / 2;
        tBuy.y = btnTop + BTN_H / 2;
        tBuy.anchor.set(0.5, 0.5);
        tBuy.style.fill = item.shopStock > 0 ? 0x00ff88 : 0x334433;
        tBuy.style.fontSize = 10;
        tBuy.visible = true;
      }

      // SELL label
      const tSell = this.solarBuilderPaletteLabels[i * TEXTS_PER_ROW + 2]!;
      if (!visible) { tSell.visible = false; }
      else {
        tSell.text = "SELL";
        tSell.x = sellX + BTN_W / 2;
        tSell.y = btnTop + BTN_H / 2;
        tSell.anchor.set(0.5, 0.5);
        tSell.style.fill = item.quantity > 0 ? 0xffaa44 : 0x443322;
        tSell.style.fontSize = 10;
        tSell.visible = true;
      }

      // TRASH label
      const tTrash = this.solarBuilderPaletteLabels[i * TEXTS_PER_ROW + 3]!;
      if (!visible) { tTrash.visible = false; }
      else {
        tTrash.text = "DEL";
        tTrash.x = trashX + BTN_W / 2;
        tTrash.y = btnTop + BTN_H / 2;
        tTrash.anchor.set(0.5, 0.5);
        tTrash.style.fill = item.quantity > 0 ? 0xff4433 : 0x442222;
        tTrash.style.fontSize = 10;
        tTrash.visible = true;
      }
    }
    for (let i = data.palette.length * TEXTS_PER_ROW; i < this.solarBuilderPaletteLabels.length; i++) {
      this.solarBuilderPaletteLabels[i]!.visible = false;
    }

    // ── Core picker overlay ───────────────────────────────────────────────────
    if (data.corePicker) {
      this.drawBuilderCorePicker(g, data);
    }

    // ── Rename mode overlay ───────────────────────────────────────────────────
    if (data.renameMode) {
      // Highlight the name zone with a border
      g.rect(SPLIT + 20, 5, W - 84 - 4 - 58 - SPLIT - 24, 32).stroke({ color: 0xffdd88, width: 1.5, alpha: 0.8 });
    }
  }

  private drawBuilderCorePicker(
    g: import("pixi.js").Graphics,
    data: SolarShipBuilderRenderData,
  ): void {
    const picker = data.corePicker!;
    const H = this.height;
    const SPLIT = 800;

    // Dim left panel
    g.rect(0, 0, SPLIT, H).fill({ color: 0x000000, alpha: 0.75 });

    // Title bar
    g.rect(0, 0, SPLIT, 60).fill({ color: 0x0a1a30, alpha: 0.97 });
    g.rect(0, 58, SPLIT, 2).fill({ color: 0x2a466b, alpha: 1 });

    const ROW_H = 60;
    const LIST_Y = 160; // pushed down to make room for search bar
    const MAX_VISIBLE = Math.floor((H - LIST_Y - 60) / ROW_H);
    const scrollOffset = data.corePickerScrollOffset;
    const visibleCount = Math.min(picker.length - scrollOffset, MAX_VISIBLE);

    // Header background + search bar area
    g.rect(0, 62, SPLIT, 96).fill({ color: 0x081420, alpha: 0.95 });
    g.rect(0, 156, SPLIT, 2).fill({ color: 0x1a3350, alpha: 0.8 });

    // Search box
    const hasSearch = data.corePickerSearch.length > 0;
    const showAll = data.corePickerShowAll;
    g.roundRect(16, 72, 400, 24, 3)
      .fill({ color: hasSearch ? 0x081830 : 0x050e1a, alpha: 1 })
      .stroke({ color: hasSearch ? 0x3399ff : 0x1e3a60, width: hasSearch ? 2 : 1 });
    // "show all" toggle pill
    g.roundRect(424, 72, 120, 24, 3)
      .fill({ color: showAll ? 0x0d3060 : 0x050e1a, alpha: 1 })
      .stroke({ color: showAll ? 0x3399ff : 0x1e3a60, width: 1 });

    for (let vi = 0; vi < visibleCount; vi++) {
      const item = picker[scrollOffset + vi]!;
      const ty = LIST_Y + vi * ROW_H;
      const hasStock = item.quantity > 0;
      const rowBg = hasStock ? (vi % 2 === 0 ? 0x0e2040 : 0x081428) : 0x080c14;
      g.rect(0, ty, SPLIT - 12, ROW_H - 1).fill({ color: rowBg, alpha: 0.95 });
      if (hasStock) {
        g.rect(0, ty, 3, ROW_H - 1).fill({ color: 0x2266aa, alpha: 0.9 });
      }
      g.rect(0, ty + ROW_H - 1, SPLIT - 12, 1).fill({ color: 0x1a2a40, alpha: 0.7 });
    }

    // Scroll bar
    if (picker.length > MAX_VISIBLE) {
      const barX = SPLIT - 10;
      const barH = MAX_VISIBLE * ROW_H;
      g.rect(barX, LIST_Y, 6, barH).fill({ color: 0x0d1e38, alpha: 1 });
      const thumbH = Math.max(20, barH * MAX_VISIBLE / picker.length);
      const thumbY = LIST_Y + (barH - thumbH) * scrollOffset / (picker.length - MAX_VISIBLE);
      g.rect(barX, thumbY, 6, thumbH).fill({ color: 0x2a5090, alpha: 1 });
    }

    // Hint at bottom
    g.rect(0, H - 40, SPLIT, 40).fill({ color: 0x050e1a, alpha: 0.95 });
    g.rect(0, H - 40, SPLIT, 1).fill({ color: 0x1a2a40, alpha: 0.7 });

    // Text labels — reuse palette label pool (0=title, 1=search, 2=showAll, 3=colHdr, 4=hint, 5+=rows)
    const LABEL_OFFSET = 5;
    const needed = visibleCount + LABEL_OFFSET;
    this.ensureTextPool(this.solarBuilderPaletteLabels, needed, 12);

    // Title
    const tTitle = this.solarBuilderPaletteLabels[0]!;
    tTitle.text = `SELECT A CORE  (${picker.length} shown)`;
    tTitle.x = SPLIT / 2; tTitle.y = 30;
    tTitle.anchor.set(0.5, 0.5);
    tTitle.style.fill = 0xaaddff;
    tTitle.style.fontSize = 16;
    tTitle.visible = true;

    // Search text
    const tSearch = this.solarBuilderPaletteLabels[1]!;
    tSearch.text = hasSearch ? data.corePickerSearch + "█" : "type to filter…";
    tSearch.x = 24; tSearch.y = 84;
    tSearch.anchor.set(0, 0.5);
    tSearch.style.fill = hasSearch ? 0xffffff : 0x446688;
    tSearch.style.fontSize = 12;
    tSearch.visible = true;

    // Show-all toggle
    const tShowAll = this.solarBuilderPaletteLabels[2]!;
    tShowAll.text = showAll ? "SHOW ALL" : "OWNED ONLY";
    tShowAll.x = 484; tShowAll.y = 84;
    tShowAll.anchor.set(0.5, 0.5);
    tShowAll.style.fill = showAll ? 0x88ccff : 0x446688;
    tShowAll.style.fontSize = 11;
    tShowAll.visible = true;

    // Column header
    const tHdr = this.solarBuilderPaletteLabels[3]!;
    tHdr.text = "CL  NAME                         H    M    L    QTY";
    tHdr.x = 20; tHdr.y = 148;
    tHdr.anchor.set(0, 0.5);
    tHdr.style.fill = 0x446688;
    tHdr.style.fontSize = 10;
    tHdr.visible = true;

    // Hint
    const tHint = this.solarBuilderPaletteLabels[4]!;
    tHint.text = "[↑↓] Scroll  •  [Tab] Toggle owned/all  •  Click to select  •  [ESC] Cancel";
    tHint.x = SPLIT / 2; tHint.y = H - 20;
    tHint.anchor.set(0.5, 0.5);
    tHint.style.fill = 0x446688;
    tHint.style.fontSize = 11;
    tHint.visible = true;

    for (let vi = 0; vi < visibleCount; vi++) {
      const item = picker[scrollOffset + vi]!;
      const ty = LIST_Y + vi * ROW_H;
      const hasStock = item.quantity > 0;
      const tRow = this.solarBuilderPaletteLabels[LABEL_OFFSET + vi]!;
      const slots = `${String(item.weaponPoints).padStart(2, " ")}H  ${String(item.externalPoints).padStart(2, " ")}M  ${String(item.internalPoints).padStart(2, " ")}L`;
      const clLabel = `C${item.sizeClass}`.padEnd(4, " ");
      tRow.text = `${clLabel}${item.name.toUpperCase().padEnd(28, " ")}${slots}    ×${item.quantity}`;
      tRow.x = 20; tRow.y = ty + ROW_H / 2;
      tRow.anchor.set(0, 0.5);
      tRow.style.fill = hasStock ? 0xaaccee : 0x3a5570;
      tRow.style.fontSize = 12;
      tRow.visible = true;
    }
    for (let i = LABEL_OFFSET + visibleCount; i < this.solarBuilderPaletteLabels.length; i++) {
      this.solarBuilderPaletteLabels[i]!.visible = false;
    }
  }

  private drawInventoryScreen(data: NonNullable<SolarSystemRenderData["inventoryScreen"]>): void {
    const g = this.solarInventoryGfx;
    g.clear();
    const W = this.width;
    const H = this.height;

    // Background
    g.rect(0, 0, W, H).fill({ color: 0x060c16, alpha: 0.98 });

    const isDocked = data.isDocked;
    const PANEL_GAP = 12;
    const PANEL_Y = 68;
    const PANEL_H = H - PANEL_Y - 44;
    const LEFT_X = 20;
    const RIGHT_X = isDocked ? W / 2 + PANEL_GAP / 2 : LEFT_X;
    const PANEL_W = isDocked ? W / 2 - LEFT_X - PANEL_GAP / 2 : W - 40;

    const ROW_H = 28;
    const HEADER_H = 28;
    const ITEMS_Y = PANEL_Y + HEADER_H + 4;
    const VISIBLE_ROWS = Math.floor((PANEL_H - HEADER_H - 4) / ROW_H);

    // --- Draw a panel (station or ship) ---
    const drawPanel = (
      items: ReadonlyArray<InventoryDisplayItem>,
      panelX: number,
      panelW: number,
      sel: number,
      isActive: boolean,
      title: string,
      subtitle: string,
    ): void => {
      const borderColor = isActive ? 0x44aaff : 0x223355;
      g.rect(panelX, PANEL_Y, panelW, PANEL_H).fill({ color: 0x080f1c, alpha: 0.9 }).stroke({ color: borderColor, width: isActive ? 2 : 1 });
      // Header bar
      g.rect(panelX, PANEL_Y, panelW, HEADER_H).fill({ color: isActive ? 0x0d2040 : 0x090e1c, alpha: 1 });

      // Draw visible rows
      for (let i = 0; i < VISIBLE_ROWS; i++) {
        if (i >= items.length) break;
        const rowY = ITEMS_Y + i * ROW_H;
        const item = items[i]!;
        if (item.isHeader) {
          g.rect(panelX + 2, rowY + 4, panelW - 4, ROW_H - 8).fill({ color: 0x0c1e36, alpha: 0.8 });
        } else {
          const isSelected = isActive && i === sel;
          if (isSelected) g.rect(panelX + 2, rowY, panelW - 4, ROW_H - 2).fill({ color: 0x1a3a66, alpha: 0.9 });
          else if (i % 2 === 0) g.rect(panelX + 2, rowY, panelW - 4, ROW_H - 2).fill({ color: 0x0a1224, alpha: 0.6 });
        }
      }
      // Unused params referenced to satisfy TS
      void title; void subtitle;
    };

    if (isDocked) {
      // Station panel (left)
      drawPanel(data.stationItems, LEFT_X, PANEL_W, data.stationSel, data.activePanel === "station", data.locationName, "");
      // Ship panel (right)
      drawPanel(data.shipItems, RIGHT_X, PANEL_W, data.shipSel, data.activePanel === "ship", "SHIP HOLD", "");
    } else {
      drawPanel(data.shipItems, RIGHT_X, PANEL_W, data.shipSel, true, "SHIP HOLD", "");
    }

    // Context menu overlay
    if (data.contextMenu) {
      const panel = data.activePanel;
      const selIdx = panel === "ship" ? data.shipSel : data.stationSel;
      const panelX = (!isDocked || panel === "ship") ? RIGHT_X : LEFT_X;
      const rowY = ITEMS_Y + selIdx * ROW_H;
      const CTX_W = 220;
      const CTX_ITEM_H = 28;
      const CTX_H = data.contextMenu.options.length * CTX_ITEM_H + 8;
      const ctxX = Math.min(panelX + 20, panelX + PANEL_W - CTX_W - 4);
      const ctxY = Math.min(rowY + ROW_H, H - CTX_H - 8);
      // Solid backdrop to fully occlude item labels behind the menu
      g.rect(ctxX - 2, ctxY - 2, CTX_W + 4, CTX_H + 4).fill({ color: 0x040810, alpha: 1 });
      g.roundRect(ctxX, ctxY, CTX_W, CTX_H, 6)
        .fill({ color: 0x0a1830, alpha: 1 })
        .stroke({ color: 0x2255aa, width: 2 });
      for (let i = 0; i < data.contextMenu.options.length; i++) {
        if (i === data.contextMenu.selection) {
          g.rect(ctxX + 3, ctxY + 4 + i * CTX_ITEM_H, CTX_W - 6, CTX_ITEM_H - 2).fill({ color: 0x1a3a80, alpha: 0.9 });
        }
      }
    }

    // --- Text labels ---
    const itemsVisible = !data.contextMenu; // hide item labels when ctx menu open (they'd bleed through)
    const stationVisible = isDocked ? Math.min(data.stationItems.length, VISIBLE_ROWS) : 0;
    const shipVisible = Math.min(data.shipItems.length, VISIBLE_ROWS);
    const TOTAL_LABELS_NEEDED = 2 + // panel header titles
      (itemsVisible ? stationVisible + shipVisible : 0) +
      (data.contextMenu?.options.length ?? 0) +
      3; // credits + hint + title
    this.ensureTextPool(this.inventoryLabels, TOTAL_LABELS_NEEDED + 8, 12);
    let li = 0;

    const setLabel = (t: Text, text: string, x: number, y: number, fill: number, fontSize: number, anchorX = 0, anchorY = 0.5): void => {
      t.text = text;
      t.x = x; t.y = y;
      t.anchor.set(anchorX, anchorY);
      t.style.fill = fill;
      t.style.fontSize = fontSize;
      t.visible = true;
    };

    if (isDocked) {
      // Station panel title
      const tSta = this.inventoryLabels[li++]!;
      setLabel(tSta, `STATION HANGAR  —  ${data.locationName.toUpperCase()}`, LEFT_X + 8, PANEL_Y + HEADER_H / 2, data.activePanel === "station" ? 0x88ccff : 0x4488aa, 11);

      if (itemsVisible) {
        for (let i = 0; i < stationVisible; i++) {
          const item = data.stationItems[i]!;
          const rowY = ITEMS_Y + i * ROW_H + ROW_H / 2;
          const t = this.inventoryLabels[li++]!;
          if (item.isHeader) {
            setLabel(t, item.name, LEFT_X + 10, rowY, 0x4477aa, 10);
          } else {
            const isSel = data.activePanel === "station" && i === data.stationSel;
            setLabel(t, `${item.name}  ×${item.quantity}`, LEFT_X + 16, rowY, isSel ? 0xffffff : 0x99bbcc, 11);
          }
        }
      }
    }

    // Ship panel title
    const tShip = this.inventoryLabels[li++]!;
    setLabel(tShip, `SHIP HOLD  (${data.shipCargoUsed}/${data.shipCargoCapacity})`, RIGHT_X + 8, PANEL_Y + HEADER_H / 2, data.activePanel === "ship" ? 0x88ccff : 0x4488aa, 11);

    if (itemsVisible) {
      for (let i = 0; i < shipVisible; i++) {
        const item = data.shipItems[i]!;
        const rowY = ITEMS_Y + i * ROW_H + ROW_H / 2;
        const t = this.inventoryLabels[li++]!;
        if (item.isHeader) {
          setLabel(t, item.name, RIGHT_X + 10, rowY, 0x4477aa, 10);
        } else {
          const isSel = data.activePanel === "ship" && i === data.shipSel;
          setLabel(t, `${item.name}  ×${item.quantity}`, RIGHT_X + 16, rowY, isSel ? 0xffffff : 0x99bbcc, 11);
        }
      }
    }

    // Context menu option labels
    if (data.contextMenu) {
      const panel = data.activePanel;
      const selIdx = panel === "ship" ? data.shipSel : data.stationSel;
      const panelX = (!isDocked || panel === "ship") ? RIGHT_X : LEFT_X;
      const rowY = ITEMS_Y + selIdx * ROW_H;
      const CTX_W = 220;
      const CTX_ITEM_H = 28;
      const ctxX = Math.min(panelX + 20, panelX + PANEL_W - CTX_W - 4);
      const ctxY = Math.min(rowY + ROW_H, H - data.contextMenu.options.length * CTX_ITEM_H - 16);
      for (let i = 0; i < data.contextMenu.options.length; i++) {
        const opt = data.contextMenu.options[i]!;
        const t = this.inventoryLabels[li++]!;
        const isSel = i === data.contextMenu.selection;
        setLabel(t, opt, ctxX + CTX_W / 2, ctxY + 4 + i * CTX_ITEM_H + CTX_ITEM_H / 2, isSel ? 0xffffff : 0x88aacc, 12, 0.5);
      }
    }

    // Credits
    setLabel(this.inventoryLabels[li++]!, `CREDITS: ${data.playerCredits.toLocaleString()} ¢`, W - 20, 18, 0x88ddaa, 12, 1);

    // Hint bar
    const hintStr = isDocked
      ? "[↑↓] Nav  [Tab] Panel  [S] Transfer  [X] Sell  [F] Buy  [M] Move All  [ESC] Back"
      : "[↑↓] Nav  [Enter] Action  [ESC] Back";
    setLabel(this.inventoryLabels[li++]!, hintStr, W / 2, H - 20, 0x446688, 10, 0.5);

    // Title bar
    setLabel(this.inventoryLabels[li++]!, "INVENTORY", W / 2, 18, 0xaaccee, 18, 0.5);

    // Hide unused labels
    for (let i = li; i < this.inventoryLabels.length; i++) {
      this.inventoryLabels[i]!.visible = false;
    }
  }

  private readonly crewLabels: Text[] = [];

  private drawSolarCrew(data: NonNullable<SolarSystemRenderData["solarCrew"]>): void {
    const g = this.solarSystemGfx;
    g.clear();
    const W = this.width;
    const H = this.height;

    g.rect(0, 0, W, H).fill({ color: 0x080e18, alpha: 0.97 });

    this.solarBuilderTitleText.text = "CREW ROSTER";
    this.solarBuilderTitleText.x = W / 2;
    this.solarBuilderTitleText.y = 30;
    this.solarBuilderTitleText.visible = true;
    g.rect(0, 56, W, 2).fill({ color: 0x2a466b, alpha: 0.9 });

    const CARD_H = 84;
    const CARD_PAD = 4;
    const LIST_Y = 70;
    const VISIBLE_CARDS = Math.floor((H - LIST_Y - 30) / (CARD_H + CARD_PAD));
    const { crew, selection, scrollOffset } = data;

    // labels needed: hint + per-card (name, personality, lean, traits, 6 skill labels)
    const LABELS_PER_CARD = 10;
    this.ensureTextPool(this.crewLabels, 1 + VISIBLE_CARDS * LABELS_PER_CARD, 14);
    let li = 0;

    const set = (t: Text, txt: string, x: number, y: number, col: number, size: number, ax = 0) => {
      t.text = txt; t.x = x; t.y = y;
      t.style.fill = col; t.style.fontSize = size;
      t.anchor.set(ax, 0.5); t.visible = true;
    };

    // Hint
    set(this.crewLabels[li++]!, "↑↓ navigate   ESC back", 16, H - 16, 0x446688, 11);

    const SKILL_FAMILIES = ["combat", "survival", "engineering", "hacking", "command", "stealth"];
    const SKILL_ABBREV   = ["CMB", "SRV", "ENG", "HAC", "CMD", "STL"];
    const SKILL_COLORS   = [0xff6655, 0x55cc88, 0x55aaff, 0xcc88ff, 0xffcc44, 0x44ddcc];

    for (let vi = 0; vi < VISIBLE_CARDS; vi++) {
      const idx = scrollOffset + vi;
      if (idx >= crew.length) break;
      const entry = crew[idx]!;
      const ty = LIST_Y + vi * (CARD_H + CARD_PAD);
      const isSelected = idx === selection;

      // Card background
      const cardCol = entry.isAlive ? (isSelected ? 0x0e2240 : 0x0a1624) : 0x140a0a;
      g.rect(8, ty, W - 16, CARD_H).fill({ color: cardCol, alpha: 0.95 });
      if (isSelected) {
        g.rect(8, ty, W - 16, CARD_H).stroke({ color: 0x44aaff, width: 1.5, alpha: 0.9 });
      }
      if (!entry.isAlive) {
        g.rect(8, ty, 3, CARD_H).fill({ color: 0x882222, alpha: 1 });
      } else {
        // Adoption lean stripe: left = tradition (amber), right = progressive (cyan)
        const leanFrac = (entry.adoptionLean + 100) / 200; // 0-1
        const stripeCol = leanFrac > 0.5
          ? Math.round(0x00aacc * (leanFrac - 0.5) * 2 + 0xccaa00 * (1 - (leanFrac - 0.5) * 2))
          : 0xccaa00;
        g.rect(8, ty, 3, CARD_H).fill({ color: stripeCol, alpha: 0.9 });
      }

      // Name + personality
      const statusSuffix = !entry.isAlive ? "  [DEAD]" : (entry.defectId ? "  [RECOVERED]" : "");
      const nameCol = entry.isAlive ? 0xddeeff : 0x664444;
      set(this.crewLabels[li++]!, entry.name + statusSuffix, 20, ty + 13, nameCol, 14);

      const personalityCol = 0x5588aa;
      const leanLabel = entry.adoptionLean >= 30 ? "Progressive"
        : entry.adoptionLean <= -30 ? "Traditionalist" : "Neutral";
      set(this.crewLabels[li++]!, `${entry.personalityType.toUpperCase()}  ·  ${leanLabel}`, W - 16, ty + 13, personalityCol, 11, 1);

      // Traits row
      const traitStr = entry.traitIds.slice(0, 4).join("  ·  ");
      set(this.crewLabels[li++]!, traitStr || "No traits", 20, ty + 30, 0x7799bb, 10);

      // Skill bars — 6 skills in two rows of 3
      for (let si = 0; si < 6; si++) {
        const col = si < 3 ? si : si - 3;
        const row = si < 3 ? 0 : 1;
        const sx = 20 + col * 130;
        const sy = ty + 50 + row * 18;
        const level = entry.skills[SKILL_FAMILIES[si]!] ?? 0;
        const barW = 60;

        // Bar background
        g.rect(sx + 32, sy - 5, barW, 8).fill({ color: 0x1a2a3a, alpha: 0.9 });
        // Bar fill
        if (level > 0) {
          g.rect(sx + 32, sy - 5, Math.round(barW * level / 10), 8).fill({ color: SKILL_COLORS[si]!, alpha: 0.85 });
        }

        // Label
        const lbl = this.crewLabels[li++]!;
        lbl.text = `${SKILL_ABBREV[si]} ${level}`;
        lbl.x = sx; lbl.y = sy;
        lbl.style.fill = SKILL_COLORS[si]!; lbl.style.fontSize = 10;
        lbl.anchor.set(0, 0.5); lbl.visible = true;
      }
    }

    // Hide unused labels
    while (li < this.crewLabels.length) {
      this.crewLabels[li++]!.visible = false;
    }
  }

  private drawSolarMyShips(ships: ReadonlyArray<SavedBlueprintSummary>): void {
    const g = this.solarSystemGfx;
    g.clear();
    const W = this.width;
    const H = this.height;

    g.rect(0, 0, W, H).fill({ color: 0x080e18, alpha: 0.97 });

    // Title
    this.solarBuilderTitleText.text = "MY SHIPS";
    this.solarBuilderTitleText.x = W / 2;
    this.solarBuilderTitleText.y = 30;
    this.solarBuilderTitleText.visible = true;
    g.rect(0, 56, W, 2).fill({ color: 0x2a466b, alpha: 0.9 });

    if (ships.length === 0) {
      this.ensureTextPool(this.solarBuilderBudgetLabels, 1, 14);
      const t = this.solarBuilderBudgetLabels[0]!;
      t.text = "No ships saved — build one in the Shipyard!";
      t.x = W / 2; t.y = H / 2;
      t.anchor.set(0.5, 0.5);
      t.style.fill = 0x6688aa;
      t.style.fontSize = 14;
      t.visible = true;
      return;
    }

    const ROW_H = 52;
    const LIST_Y = 80;
    const BTN_W = 110;
    const BTN_GAP = 8;
    const rightEdge = W - 16;
    const deleteX = rightEdge - BTN_W;
    const loadX = deleteX - BTN_GAP - BTN_W;
    const activeX = loadX - BTN_GAP - BTN_W;

    // We need (1 name label + 3 button labels) * ships + hint at top
    const LABELS_PER_ROW = 4;
    this.ensureTextPool(this.solarBuilderBudgetLabels, ships.length * LABELS_PER_ROW + 1, 12);

    // Hint label (index 0)
    const hint = this.solarBuilderBudgetLabels[0]!;
    hint.text = "↑↓ navigate  |  ESC back";
    hint.x = 16; hint.y = H - 20;
    hint.anchor.set(0, 0.5);
    hint.style.fill = 0x446688;
    hint.style.fontSize = 11;
    hint.visible = true;

    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i]!;
      const ty = LIST_Y + i * ROW_H;
      if (ty + ROW_H > H - 40) break;

      const rowBg = ship.isActive ? 0x112233 : (i % 2 === 0 ? 0x0a1624 : 0x080e18);
      g.rect(0, ty, W, ROW_H - 1).fill({ color: rowBg, alpha: 0.9 });
      if (ship.isActive) {
        g.rect(0, ty, W, ROW_H - 1).stroke({ color: 0x44ccff, width: 2, alpha: 0.8 });
      }

      const btnY = ty + (ROW_H - 26) / 2;

      // SET ACTIVE button
      const isActive = ship.isActive;
      g.rect(activeX, btnY, BTN_W, 26).fill({ color: isActive ? 0x003355 : 0x002233, alpha: 0.9 });
      g.rect(activeX, btnY, BTN_W, 26).stroke({ color: isActive ? 0x44ccff : 0x225577, width: 1 });

      // LOAD button
      g.rect(loadX, btnY, BTN_W, 26).fill({ color: 0x112233, alpha: 0.9 });
      g.rect(loadX, btnY, BTN_W, 26).stroke({ color: 0x3366aa, width: 1 });

      // DELETE button
      g.rect(deleteX, btnY, BTN_W, 26).fill({ color: 0x220000, alpha: 0.9 });
      g.rect(deleteX, btnY, BTN_W, 26).stroke({ color: 0x882222, width: 1 });

      // Condition bar (drawn before text labels for z-ordering)
      const condition = ship.condition ?? 1;
      const BAR_X = 16, BAR_Y = ty + ROW_H - 12, BAR_W = activeX - 32, BAR_H = 6;
      g.rect(BAR_X, BAR_Y, BAR_W, BAR_H).fill({ color: 0x0a1020, alpha: 0.8 });
      const barColor = condition > 0.6 ? 0x22cc55 : condition > 0.3 ? 0xddaa22 : 0xcc3322;
      g.rect(BAR_X, BAR_Y, Math.round(BAR_W * condition), BAR_H).fill({ color: barColor, alpha: 0.9 });

      const base = i * LABELS_PER_ROW + 1;

      // Name label
      const tName = this.solarBuilderBudgetLabels[base]!;
      const dmgSuffix = (ship.destroyedCount ?? 0) > 0 ? `  ⚠ ${ship.destroyedCount} DESTROYED` : "";
      tName.text = `${ship.isActive ? "★ " : ""}${ship.name.toUpperCase()}  C${ship.sizeClass}  ${ship.partCount} PARTS${dmgSuffix}`;
      tName.x = 16; tName.y = ty + ROW_H / 2 - 4;
      tName.anchor.set(0, 0.5);
      tName.style.fill = (ship.destroyedCount ?? 0) > 0 ? 0xffaa44 : (ship.isActive ? 0xaaddff : 0x99bbcc);
      tName.style.fontSize = 12;
      tName.visible = true;

      // SET ACTIVE label
      const tActive = this.solarBuilderBudgetLabels[base + 1]!;
      tActive.text = isActive ? "ACTIVE" : "SET ACTIVE";
      tActive.x = activeX + BTN_W / 2; tActive.y = btnY + 13;
      tActive.anchor.set(0.5, 0.5);
      tActive.style.fill = isActive ? 0x44ccff : 0x4488aa;
      tActive.style.fontSize = 10;
      tActive.visible = true;

      // LOAD label
      const tLoad = this.solarBuilderBudgetLabels[base + 2]!;
      tLoad.text = "LOAD TO BUILDER";
      tLoad.x = loadX + BTN_W / 2; tLoad.y = btnY + 13;
      tLoad.anchor.set(0.5, 0.5);
      tLoad.style.fill = 0x6699cc;
      tLoad.style.fontSize = 10;
      tLoad.visible = true;

      // DELETE label
      const tDel = this.solarBuilderBudgetLabels[base + 3]!;
      tDel.text = "DELETE";
      tDel.x = deleteX + BTN_W / 2; tDel.y = btnY + 13;
      tDel.anchor.set(0.5, 0.5);
      tDel.style.fill = 0xcc4444;
      tDel.style.fontSize = 10;
      tDel.visible = true;
    }
    for (let i = ships.length * LABELS_PER_ROW + 1; i < this.solarBuilderBudgetLabels.length; i++) {
      this.solarBuilderBudgetLabels[i]!.visible = false;
    }
  }

  private drawSolarShop(data: ShopRenderData): void {
    const g = this.solarShopGfx;
    g.clear();

    const W = this.width;
    const H = this.height;
    const HEADER_H = 64;
    const ROW_H = 52;
    const LIST_X = 40;
    const LIST_W = W - 80;
    const COL_H_Y = HEADER_H + 16;       // column header row y
    const ROWS_START_Y = COL_H_Y + 28;   // first data row y

    // Background
    g.rect(0, 0, W, H).fill({ color: 0x05080f, alpha: 1 });
    g.rect(0, 0, W, HEADER_H).fill({ color: 0x0a1428, alpha: 1 });
    g.moveTo(0, HEADER_H).lineTo(W, HEADER_H).stroke({ color: 0x2a5090, width: 1 });
    // Column header bar
    g.rect(LIST_X, COL_H_Y, LIST_W, 28).fill({ color: 0x0d1e38, alpha: 1 });
    g.rect(LIST_X, COL_H_Y + 28, LIST_W, 1).fill({ color: 0x1e3a60, alpha: 1 });

    // Title (shifted up to leave room for search on bottom row of header)
    this.solarShopTitleText.text = `◈  ${data.locationName.toUpperCase()}  —  ${data.economyType.toUpperCase()} ECONOMY`;
    this.solarShopTitleText.x = W / 2;
    this.solarShopTitleText.y = 20;
    this.solarShopTitleText.visible = true;

    // Credits
    this.solarShopCreditsText.text = `CREDITS: ${data.playerCredits.toLocaleString()} ¢`;
    this.solarShopCreditsText.x = W - 24;
    this.solarShopCreditsText.y = 20;
    this.solarShopCreditsText.visible = true;

    // Search box (bottom of header bar)
    const SEARCH_Y = 47;
    const SEARCH_X = LIST_X;
    const SEARCH_W = Math.min(400, LIST_W * 0.45);
    const hasSearch = data.searchText.length > 0;
    g.roundRect(SEARCH_X, SEARCH_Y - 11, SEARCH_W, 22, 3)
      .fill({ color: hasSearch ? 0x081830 : 0x050e1a, alpha: 1 })
      .stroke({ color: hasSearch ? 0x3399ff : 0x1e3a60, width: hasSearch ? 2 : 1 });
    const countSuffix = hasSearch
      ? `  (${data.entries.length} result${data.entries.length !== 1 ? "s" : ""})`
      : "";
    const searchDisplay = hasSearch
      ? data.searchText + "█" + countSuffix
      : "type to filter…";
    this.solarShopSearchText.text = searchDisplay;
    this.solarShopSearchText.x = SEARCH_X + 8;
    this.solarShopSearchText.y = SEARCH_Y;
    this.solarShopSearchText.style.fill = hasSearch ? 0xffffff : 0x446688;
    this.solarShopSearchText.visible = true;

    // Status message
    if (data.statusMsg) {
      this.solarShopStatusText.text = data.statusMsg;
      this.solarShopStatusText.x = W / 2;
      this.solarShopStatusText.y = H - 36;
      this.solarShopStatusText.visible = true;
    } else {
      this.solarShopStatusText.visible = false;
    }

    // Column x positions
    const COL_NAME_X  = LIST_X + 8;
    const COL_TYPE_X  = LIST_X + LIST_W * 0.38;
    const COL_DMD_X   = LIST_X + LIST_W * 0.52;
    const COL_PRICE_X = LIST_X + LIST_W * 0.70;
    const COL_STOCK_X = LIST_X + LIST_W * 0.82;
    const COL_OWNED_X = LIST_X + LIST_W * 0.92;

    // Column header labels (6 texts, reuse solarShopRowLabels pool)
    const HEADERS = ["MODULE", "TYPE", "DEMAND", "PRICE ¢", "STOCK", "OWNED"] as const;
    const HDR_XS   = [COL_NAME_X, COL_TYPE_X, COL_DMD_X, COL_PRICE_X, COL_STOCK_X, COL_OWNED_X] as const;
    this.ensureTextPool(this.solarShopRowLabels, HEADERS.length, 11);
    for (let i = 0; i < HEADERS.length; i++) {
      const t = this.solarShopRowLabels[i]!;
      t.text = HEADERS[i]!;
      t.x = HDR_XS[i]!;
      t.y = COL_H_Y + 14;
      t.anchor.set(0, 0.5);
      t.style.fill = 0x5588aa;
      t.style.fontSize = 11;
      t.visible = true;
    }
    for (let i = HEADERS.length; i < this.solarShopRowLabels.length; i++) {
      this.solarShopRowLabels[i]!.visible = false;
    }

    // Row data — separate pools per column
    const maxVisible = Math.min(data.entries.length, Math.floor((H - ROWS_START_Y - 48) / ROW_H));
    const scrollOffset = data.scrollOffset;
    const totalEntries = data.entries.length;

    // Scroll indicator bar (right edge, only when list overflows)
    if (totalEntries > maxVisible) {
      const barX = W - 12;
      const barH = H - ROWS_START_Y - 48;
      g.rect(barX, ROWS_START_Y, 6, barH).fill({ color: 0x0d1e38, alpha: 1 });
      const thumbH = Math.max(20, barH * maxVisible / totalEntries);
      const thumbY = ROWS_START_Y + (barH - thumbH) * scrollOffset / (totalEntries - maxVisible);
      g.rect(barX, thumbY, 6, thumbH).fill({ color: 0x2a5090, alpha: 1 });
    }

    this.ensureTextPool(this.solarShopNameLabels,   maxVisible, 13);
    this.ensureTextPool(this.solarShopTypeLabels,   maxVisible, 12);
    this.ensureTextPool(this.solarShopDemandLabels, maxVisible, 12);
    this.ensureTextPool(this.solarShopPriceLabels,  maxVisible, 13);
    this.ensureTextPool(this.solarShopStockLabels,  maxVisible, 13);
    this.ensureTextPool(this.solarShopOwnedLabels,  maxVisible, 13);

    const demandColor = (d: string): number => {
      if (d === "oversupply") return 0x44dd44;
      if (d === "surplus")    return 0x88cc66;
      if (d === "scarce")     return 0xff9944;
      if (d === "shortage")   return 0xff4444;
      return 0xaabbcc; // normal
    };

    for (let i = 0; i < maxVisible; i++) {
      const entry = data.entries[scrollOffset + i];
      if (!entry) {
        this.solarShopNameLabels[i]!.visible   = false;
        this.solarShopTypeLabels[i]!.visible   = false;
        this.solarShopDemandLabels[i]!.visible = false;
        this.solarShopPriceLabels[i]!.visible  = false;
        this.solarShopStockLabels[i]!.visible  = false;
        this.solarShopOwnedLabels[i]!.visible  = false;
        continue;
      }

      const ry = ROWS_START_Y + i * ROW_H;
      const isSelected = entry.isSelected;
      const isOutOfStock = entry.stock <= 0;
      const rowFill = isSelected ? 0x0d2240 : (i % 2 === 0 ? 0x080d18 : 0x060b14);
      g.rect(LIST_X, ry, LIST_W, ROW_H).fill({ color: rowFill, alpha: 1 });
      if (isSelected) {
        g.rect(LIST_X, ry, 3, ROW_H).fill({ color: 0x00ccff, alpha: 1 });
        g.rect(LIST_X, ry, LIST_W, ROW_H).stroke({ color: 0x2255aa, width: 1 });
      }

      const baseAlpha = isOutOfStock ? 0.45 : 1.0;
      const textFill  = isSelected ? 0xffffff : 0x99bbcc;
      const midY = ry + ROW_H / 2;

      const n = this.solarShopNameLabels[i]!;
      n.text = entry.name.toUpperCase();
      n.x = COL_NAME_X; n.y = midY;
      n.anchor.set(0, 0.5);
      n.style.fill = textFill; n.style.fontSize = 13;
      n.alpha = baseAlpha; n.visible = true;

      const ty = this.solarShopTypeLabels[i]!;
      ty.text = entry.moduleType.toUpperCase();
      ty.x = COL_TYPE_X; ty.y = midY;
      ty.anchor.set(0, 0.5);
      ty.style.fill = 0x6699bb; ty.style.fontSize = 12;
      ty.alpha = baseAlpha; ty.visible = true;

      const dc = demandColor(entry.demand);
      const dl = this.solarShopDemandLabels[i]!;
      dl.text = DEMAND_LABEL[entry.demand];
      dl.x = COL_DMD_X; dl.y = midY;
      dl.anchor.set(0, 0.5);
      dl.style.fill = isSelected ? dc : dc;
      dl.style.fontSize = 12;
      dl.alpha = baseAlpha; dl.visible = true;
      // demand pip
      g.circle(COL_DMD_X - 10, midY, 4).fill({ color: dc, alpha: baseAlpha });

      const pr = this.solarShopPriceLabels[i]!;
      pr.text = entry.price.toLocaleString();
      pr.x = COL_PRICE_X; pr.y = midY;
      pr.anchor.set(0, 0.5);
      pr.style.fill = isSelected ? 0xffcc44 : 0xcc9922; pr.style.fontSize = 13;
      pr.alpha = baseAlpha; pr.visible = true;

      const sk = this.solarShopStockLabels[i]!;
      sk.text = isOutOfStock ? "—" : String(entry.stock);
      sk.x = COL_STOCK_X; sk.y = midY;
      sk.anchor.set(0, 0.5);
      sk.style.fill = isOutOfStock ? 0x664444 : 0xaabbcc; sk.style.fontSize = 13;
      sk.alpha = 1.0; sk.visible = true;

      const ow = this.solarShopOwnedLabels[i]!;
      ow.text = entry.owned > 0 ? String(entry.owned) : "—";
      ow.x = COL_OWNED_X; ow.y = midY;
      ow.anchor.set(0, 0.5);
      ow.style.fill = entry.owned > 0 ? 0x44dd88 : 0x445566; ow.style.fontSize = 13;
      ow.alpha = 1.0; ow.visible = true;
    }

    // Hide unused pool entries
    for (let i = maxVisible; i < this.solarShopNameLabels.length;   i++) this.solarShopNameLabels[i]!.visible   = false;
    for (let i = maxVisible; i < this.solarShopTypeLabels.length;   i++) this.solarShopTypeLabels[i]!.visible   = false;
    for (let i = maxVisible; i < this.solarShopDemandLabels.length; i++) this.solarShopDemandLabels[i]!.visible = false;
    for (let i = maxVisible; i < this.solarShopPriceLabels.length;  i++) this.solarShopPriceLabels[i]!.visible  = false;
    for (let i = maxVisible; i < this.solarShopStockLabels.length;  i++) this.solarShopStockLabels[i]!.visible  = false;
    for (let i = maxVisible; i < this.solarShopOwnedLabels.length;  i++) this.solarShopOwnedLabels[i]!.visible  = false;
  }

  private drawShipyard(data: ShipyardRenderData): void {
    const g = this.shipyardGfx;
    g.clear();

    // ── Panel backgrounds ─────────────────────────────────────────────────
    const { layout } = data;
    this.drawPanelRect(g, layout.paletteRect, 0x0e1a2e, 0x2a466b);
    this.drawPanelRect(g, layout.canvasRect, 0x0a1020, 0x2a466b);
    this.drawPanelRect(g, layout.statsRect, 0x0e1a2e, 0x2a466b);
    this.drawPanelRect(g, layout.savedPanelRect, 0x0e1a2e, 0x2a466b);

    // ── Saved-ships header + slots ────────────────────────────────────────
    this.shipyardSavedHeader.x = layout.savedPanelRect.x + layout.savedPanelRect.w / 2;
    this.shipyardSavedHeader.y = layout.savedPanelRect.y + 6;
    const savedCount = data.savedSlots.filter((s) => !s.empty).length;
    this.shipyardSavedHeader.text = `SAVED SHIPS  ${savedCount}/${data.savedSlots.length}`;

    this.ensureTextPool(this.shipyardSavedLabels, data.savedSlots.length, 13);
    for (let i = 0; i < this.shipyardSavedLabels.length; i++) {
      const label = this.shipyardSavedLabels[i]!;
      const slot = data.savedSlots[i];
      if (!slot) {
        label.visible = false;
        continue;
      }
      label.visible = true;
      const r = slot.rect;
      const borderColor = slot.current
        ? COLOR.hudAmber
        : slot.equipped
          ? COLOR.hudCyan
          : 0x3a5a80;
      const fillColor = slot.current ? 0x1a2a14 : slot.equipped ? 0x0a1a2a : 0x050a14;
      g.rect(r.x, r.y, r.w, r.h)
        .fill({ color: fillColor, alpha: 0.9 })
        .stroke({ color: borderColor, width: slot.current ? 2 : 1 });
      const suffix = slot.equipped ? "  [EQUIPPED]" : "";
      label.text = slot.empty
        ? "— EMPTY —"
        : `${slot.name.toUpperCase()}${suffix}`;
      label.style.fill = slot.empty
        ? 0x4a5a70
        : slot.current
          ? COLOR.hudAmber
          : slot.equipped
            ? COLOR.hudCyan
            : COLOR.hudWhite;
      label.anchor.set(0, 0.5);
      label.x = r.x + 8;
      label.y = r.y + r.h / 2;
    }

    // ── Status message (SAVED / LIBRARY FULL / etc.) ─────────────────────
    if (data.statusMsg) {
      this.shipyardStatusText.text = data.statusMsg;
      this.shipyardStatusText.visible = true;
    } else {
      this.shipyardStatusText.visible = false;
    }

    // ── Palette tiles ─────────────────────────────────────────────────────
    this.ensureTextPool(this.shipyardPaletteLabels, data.palette.length, 12);
    for (let i = 0; i < this.shipyardPaletteLabels.length; i++) {
      const label = this.shipyardPaletteLabels[i]!;
      const tile = data.palette[i];
      if (!tile) {
        label.visible = false;
        continue;
      }
      label.visible = true;

      const { rect } = tile;
      const border = tile.isHeld
        ? COLOR.hudAmber
        : tile.disabled
          ? 0x444a5a
          : 0x5a7aa0;
      const fill = tile.isHeld ? 0x2a2a10 : 0x050a14;
      g.rect(rect.x, rect.y, rect.w, rect.h)
        .fill({ color: fill, alpha: tile.disabled ? 0.5 : 1 })
        .stroke({ color: border, width: tile.isHeld ? 2 : 1 });

      // Part silhouette preview — centred in the upper two-thirds of the tile.
      const previewMax = Math.min(rect.w - 14, rect.h - 28);
      const maxShape = Math.max(tile.shape.width, tile.shape.height);
      const scale = previewMax / maxShape;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2 - 8;
      this.drawPartVisual(
        g,
        tile.visualKind,
        cx,
        cy,
        tile.shape.width * scale,
        tile.shape.height * scale,
        tile.colour,
        tile.disabled ? 0.4 : 1,
      );

      const powerText = tile.powerCapacity > 0
        ? `CAP ${tile.powerCapacity}`
        : `PWR ${tile.powerCost}`;
      label.text = `${tile.name.toUpperCase()}\n${powerText}`;
      label.style.fill = tile.disabled ? 0x778899 : COLOR.hudWhite;
      label.x = rect.x + rect.w / 2;
      label.y = rect.y + rect.h - 22;
    }

    // ── Ship canvas: placements ───────────────────────────────────────────
    const { ship } = data;
    for (const pl of ship.placements) {
      const cx = ship.originX + pl.worldX * ship.scale;
      const cy = ship.originY + pl.worldY * ship.scale;
      const w = pl.shape.width * ship.scale;
      const h = pl.shape.height * ship.scale;
      this.drawPartVisual(g, pl.visualKind, cx, cy, w, h, pl.colour, 1);
      if (pl.selected) {
        g.rect(cx - w / 2 - 3, cy - h / 2 - 3, w + 6, h + 6)
          .stroke({ color: COLOR.hudAmber, width: 2, alpha: 0.9 });
      }
    }

    // ── Open sockets ──────────────────────────────────────────────────────
    for (const sk of ship.sockets) {
      const color = sk.highlighted ? COLOR.hudAmber : COLOR.hudCyan;
      const r = sk.highlighted ? 7 : 5;
      g.circle(sk.screenX, sk.screenY, r)
        .fill({ color, alpha: 0.2 })
        .stroke({ color, width: 2, alpha: 0.9 });
    }

    // ── Ghost preview ─────────────────────────────────────────────────────
    if (data.ghost) {
      const gh = data.ghost;
      const w = gh.shape.width * ship.scale;
      const h = gh.shape.height * ship.scale;
      const tint = gh.valid ? gh.colour : COLOR.hudRed;
      this.drawPartVisual(g, gh.visualKind, gh.screenX, gh.screenY, w, h, tint, 0.5);
      g.rect(gh.screenX - w / 2, gh.screenY - h / 2, w, h)
        .stroke({ color: tint, width: 2, alpha: 0.8 });
    }

    // ── Buttons ───────────────────────────────────────────────────────────
    const trashLabel = data.trashAction === "part"
      ? "TRASH PART"
      : data.trashAction === "blueprint"
        ? "DELETE SHIP"
        : "TRASH";
    const buttons = [
      { rect: layout.newBtn, label: "NEW" },
      { rect: layout.saveBtn, label: "SAVE" },
      { rect: layout.backBtn, label: "BACK" },
      {
        rect: layout.trashBtn,
        label: trashLabel,
        disabled: data.trashAction === "none",
      },
    ];
    this.ensureTextPool(this.shipyardButtonLabels, buttons.length, 18);
    for (let i = 0; i < this.shipyardButtonLabels.length; i++) {
      const label = this.shipyardButtonLabels[i]!;
      const btn = buttons[i];
      if (!btn) {
        label.visible = false;
        continue;
      }
      label.visible = true;
      const disabled = btn.disabled === true;
      g.rect(btn.rect.x, btn.rect.y, btn.rect.w, btn.rect.h)
        .fill({ color: 0x10243c, alpha: disabled ? 0.4 : 1 })
        .stroke({ color: disabled ? 0x445566 : COLOR.hudCyan, width: 2 });
      label.text = btn.label;
      label.style.fill = disabled ? 0x778899 : COLOR.hudWhite;
      label.x = btn.rect.x + btn.rect.w / 2;
      label.y = btn.rect.y + btn.rect.h / 2;
    }

    // ── Stats panel ───────────────────────────────────────────────────────
    const s = data.stats;
    this.shipyardStatsText.text = [
      `HP          ${s.hp}`,
      `SPEED       ${s.speed}`,
      `DAMAGE      ${s.damage}`,
      `FIRE RATE   ${s.fireRate.toFixed(2)}`,
      `HITBOX      ${s.hitboxW}×${s.hitboxH}`,
      ``,
      `POWER       ${s.powerUsed}/${s.powerCapacity}`,
      `COST        ${s.cost}¢`,
    ].join("\n");

    const heldSuffix = data.heldPartName
      ? `   •   HOLDING ${data.heldPartName.toUpperCase()}`
      : "";
    this.shipyardSummaryText.text =
      `${data.blueprintName.toUpperCase()}   •   CREDITS ${data.credits}${heldSuffix}`;
  }

  /** Fills a rect with flat dark fill + thin stroke for UI panels. */
  private drawPanelRect(
    g: Graphics,
    rect: { x: number; y: number; w: number; h: number },
    fill: number,
    stroke: number,
  ): void {
    g.rect(rect.x, rect.y, rect.w, rect.h)
      .fill({ color: fill, alpha: 0.85 })
      .stroke({ color: stroke, width: 1 });
  }

  /** Ensures a Text pool has at least `count` entries and applies base style. */
  private ensureTextPool(pool: Text[], count: number, fontSize: number): void {
    while (pool.length < count) {
      const t = new Text({
        text: "",
        style: new TextStyle({
          fontFamily: "monospace",
          fontSize,
          fill: COLOR.hudWhite,
          fontWeight: "bold",
          align: "center",
        }),
      });
      t.anchor.set(0.5, 0.5);
      this.menuLayer.addChild(t);
      pool.push(t);
    }
  }

  /**
   * Draws a stylised silhouette for a part kind inside the AABB (cx, cy, w, h).
   * Every `visualKind` from the parts registry is handled; unknown kinds fall
   * back to a plain rect so new parts can be added without renderer changes.
   */
  private drawPartVisual(
    g: Graphics,
    kind: string,
    cx: number,
    cy: number,
    w: number,
    h: number,
    colour: number,
    alpha: number,
  ): void {
    const fill   = { color: colour, alpha };
    const dark   = { color: 0x000000, alpha: alpha * 0.35 };
    const bright = { color: 0xffffff, alpha: alpha * 0.55 };
    const dim    = { color: 0xffffff, alpha: alpha * 0.25 };
    switch (kind) {
      case "core-hex": {
        // Hex power-core with energy rings and centre crystal
        const r = Math.min(w, h) / 2;
        drawHexagon(g, cx, cy, r, 0, fill, { color: 0xffffff, width: 1.5, alpha });
        drawHexagon(g, cx, cy, r * 0.65, 0, dark, { color: 0xffffff, width: 0.8, alpha: alpha * 0.4 });
        drawCircle(g, cx, cy, r * 0.28, { color: 0xffffff, alpha });
        // Corner bolts
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          drawCircle(g, cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, r * 0.09, bright);
        }
        break;
      }
      case "hull-delta": {
        // Armoured delta hull with panel lines and rivets
        const hw = w / 2; const hh = h / 2;
        g.poly([cx + hw, cy, cx - hw, cy - hh, cx - hw * 0.6, cy, cx - hw, cy + hh]).fill(fill);
        g.poly([cx + hw, cy, cx - hw, cy - hh, cx - hw * 0.6, cy, cx - hw, cy + hh])
          .stroke({ color: 0xffffff, width: 0.8, alpha: alpha * 0.4 });
        // Spine line
        g.moveTo(cx + hw * 0.7, cy).lineTo(cx - hw * 0.5, cy).stroke({ color: 0xffffff, width: 1, alpha: alpha * 0.5 });
        // Panel highlight
        g.poly([cx - hw * 0.1, cy - hh * 0.1, cx - hw * 0.7, cy - hh * 0.7, cx - hw * 0.7, cy])
          .fill({ color: 0xffffff, alpha: alpha * 0.12 });
        // Rivets
        for (let i = 0; i < 3; i++) {
          drawCircle(g, cx - hw * 0.3 + i * hw * 0.28, cy, h * 0.07, bright);
        }
        break;
      }
      case "hull-block": {
        // Armoured block with bevelled edges and grill
        drawRect(g, cx, cy, w, h, fill);
        g.rect(cx - w / 2, cy - h / 2, w, h).stroke({ color: 0xffffff, width: 1, alpha: alpha * 0.4 });
        // Bevelled inner panel
        const bev = w * 0.08;
        g.poly([
          cx - w / 2 + bev, cy - h / 2,
          cx + w / 2 - bev, cy - h / 2,
          cx + w / 2, cy - h / 2 + bev,
          cx + w / 2, cy + h / 2 - bev,
          cx + w / 2 - bev, cy + h / 2,
          cx - w / 2 + bev, cy + h / 2,
          cx - w / 2, cy + h / 2 - bev,
          cx - w / 2, cy - h / 2 + bev,
        ]).fill({ color: 0x000000, alpha: alpha * 0.2 });
        // Horizontal grill lines
        for (let i = 1; i < 4; i++) {
          const ly = cy - h / 2 + (h / 4) * i;
          g.moveTo(cx - w * 0.35, ly).lineTo(cx + w * 0.35, ly)
           .stroke({ color: 0xffffff, width: 0.7, alpha: alpha * 0.3 });
        }
        break;
      }
      case "wing-fin-top": {
        const hw = w / 2; const hh = h / 2;
        g.poly([cx - hw, cy + hh, cx + hw, cy + hh, cx + hw * 0.6, cy - hh, cx - hw * 0.4, cy - hh * 0.4])
          .fill(fill)
          .stroke({ color: 0xffffff, width: 0.8, alpha: alpha * 0.4 });
        // Surface tension lines (aerofoil ribs)
        for (let i = 1; i <= 3; i++) {
          const t2 = i / 4;
          g.moveTo(cx - hw + (cx + hw - (cx - hw)) * t2, cy + hh)
           .lineTo(cx - hw * 0.4 + (cx + hw * 0.6 - (cx - hw * 0.4)) * t2, cy - hh * 0.4)
           .stroke({ color: 0xffffff, width: 0.6, alpha: alpha * 0.2 });
        }
        break;
      }
      case "wing-fin-bot": {
        const hw = w / 2; const hh = h / 2;
        g.poly([cx - hw, cy - hh, cx + hw, cy - hh, cx + hw * 0.6, cy + hh, cx - hw * 0.4, cy + hh * 0.4])
          .fill(fill)
          .stroke({ color: 0xffffff, width: 0.8, alpha: alpha * 0.4 });
        for (let i = 1; i <= 3; i++) {
          const t2 = i / 4;
          g.moveTo(cx - hw + (cx + hw - (cx - hw)) * t2, cy - hh)
           .lineTo(cx - hw * 0.4 + (cx + hw * 0.6 - (cx - hw * 0.4)) * t2, cy + hh * 0.4)
           .stroke({ color: 0xffffff, width: 0.6, alpha: alpha * 0.2 });
        }
        break;
      }
      case "wing-long": {
        // Swept wing with leading-edge highlight and spar lines
        drawRect(g, cx, cy, w, h, fill);
        g.rect(cx - w / 2, cy - h / 2, w, h).stroke({ color: 0xffffff, width: 0.8, alpha: alpha * 0.35 });
        // Leading edge highlight
        g.rect(cx - w / 2, cy - h / 2, w * 0.1, h).fill({ color: 0xffffff, alpha: alpha * 0.2 });
        // Spar lines
        for (let i = 1; i < 4; i++) {
          const lx = cx - w / 2 + (w / 4) * i;
          g.moveTo(lx, cy - h * 0.4).lineTo(lx, cy + h * 0.4)
           .stroke({ color: 0xffffff, width: 0.6, alpha: alpha * 0.25 });
        }
        break;
      }
      case "engine-nozzle": {
        // Rocket nozzle: cylindrical housing + expanding bell + flame
        const nw = w * 0.75; const nh = h;
        // Housing cylinder
        drawRect(g, cx + nw * 0.1, cy, nw, nh * 0.6, fill);
        g.rect(cx + nw * 0.1 - nw / 2, cy - nh * 0.3, nw, nh * 0.6)
          .stroke({ color: 0xffffff, width: 0.8, alpha: alpha * 0.35 });
        // Nozzle bell (expanding shape)
        const bellX = cx - nw * 0.2;
        g.poly([bellX, cy - nh * 0.22, bellX, cy + nh * 0.22, bellX - w * 0.38, cy + nh * 0.42, bellX - w * 0.38, cy - nh * 0.42])
          .fill({ color: colour, alpha: alpha * 0.85 })
          .stroke({ color: 0xffffff, width: 0.8, alpha: alpha * 0.3 });
        // Flame glow
        g.circle(bellX - w * 0.42, cy, nh * 0.28).fill({ color: 0xff9e3d, alpha: alpha * 0.8 });
        g.circle(bellX - w * 0.52, cy, nh * 0.16).fill({ color: 0xffffaa, alpha: alpha * 0.7 });
        // Intake ring at back of housing
        g.rect(cx + nw * 0.6 - 2, cy - nh * 0.3, 4, nh * 0.6).fill(dim);
        break;
      }
      case "engine-plasma": {
        // Plasma drive: streamlined housing + plasma coil + bright core
        const pw = w * 0.65;
        drawRect(g, cx + pw * 0.15, cy, pw, h, fill);
        g.rect(cx + pw * 0.15 - pw / 2, cy - h / 2, pw, h)
          .stroke({ color: 0xffffff, width: 0.8, alpha: alpha * 0.35 });
        // Plasma coil (spiral rings)
        for (let i = 0; i < 3; i++) {
          const lx = cx - pw * 0.3 + i * pw * 0.1;
          g.circle(lx, cy, h * 0.22).stroke({ color: 0xff66ff, width: 1, alpha: alpha * 0.5 });
        }
        // Plasma exhaust nozzle with vibrant core
        const exhaX = cx - pw * 0.45;
        drawTriangle(g, exhaX, cy, h * 0.72, Math.PI, { color: 0xff44cc, alpha });
        g.circle(exhaX - w * 0.02, cy, h * 0.18).fill({ color: 0xffffff, alpha: alpha * 0.85 });
        g.circle(exhaX - w * 0.02, cy, h * 0.32).fill({ color: 0xff99ff, alpha: alpha * 0.4 });
        break;
      }
      case "cannon-barrel": {
        // Heavy cannon: wide breech + long barrel + muzzle brake
        const bw = w * 0.55; const bh = h * 0.7;
        // Breech block
        drawRect(g, cx + bw * 0.05, cy, bw, h, fill);
        g.rect(cx + bw * 0.05 - bw / 2, cy - h / 2, bw, h)
          .stroke({ color: 0xffffff, width: 0.8, alpha: alpha * 0.35 });
        // Barrel
        g.rect(cx + bw * 0.05 + bw * 0.3, cy - bh / 2, bw * 0.7, bh).fill(fill);
        g.rect(cx + bw * 0.05 + bw * 0.3, cy - bh / 2, bw * 0.7, bh)
          .stroke({ color: 0xffffff, width: 0.6, alpha: alpha * 0.3 });
        // Muzzle brake (two slots at the tip)
        const muzzleX = cx + bw * 0.55 + bw;
        g.rect(muzzleX - 2, cy - bh * 0.45, 5, bh * 0.38).fill(dark);
        g.rect(muzzleX - 2, cy + bh * 0.05, 5, bh * 0.38).fill(dark);
        // Barrel highlight
        g.rect(cx + bw * 0.35 + bw * 0.3, cy - bh / 2, bw * 0.12, bh)
          .fill({ color: 0xffffff, alpha: alpha * 0.18 });
        // Cooling vents on breech
        for (let i = 0; i < 3; i++) {
          const vy = cy - h * 0.25 + i * h * 0.22;
          g.rect(cx - bw * 0.35, vy, bw * 0.22, h * 0.08).fill(dark);
        }
        break;
      }
      case "shield-ring": {
        // Force-field projector: ring + emitter core + energy arcs
        const r = Math.min(w, h) / 2;
        // Outer energy ring with glow
        drawCircle(g, cx, cy, r, { color: colour, alpha: alpha * 0.22 }, { color: colour, width: 2.5, alpha });
        drawCircle(g, cx, cy, r * 0.82, { color: 0x000000, alpha: alpha * 0.15 }, { color: 0xffffff, width: 0.6, alpha: alpha * 0.3 });
        // Central emitter
        drawCircle(g, cx, cy, r * 0.36, fill);
        g.circle(cx, cy, r * 0.2).fill({ color: 0xffffff, alpha: alpha * 0.7 });
        // Four energy arc nodes on the ring
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const nx = cx + Math.cos(a) * r * 0.85;
          const ny = cy + Math.sin(a) * r * 0.85;
          drawCircle(g, nx, ny, r * 0.1, { color: 0xffffff, alpha: alpha * 0.7 });
          g.moveTo(cx, cy).lineTo(nx, ny)
           .stroke({ color: 0xffffff, width: 0.5, alpha: alpha * 0.2 });
        }
        break;
      }
      default:
        drawRect(g, cx, cy, w, h, fill);
    }
  }

  /** Populates the 4-item main-menu list and highlights the selected one. */
  private updateMainMenu(selectedIdx: number): void {
    const items = ["PLAY", "CAMPAIGN", "SOLAR SYSTEM", "AWAY CRAFT", "STATS"];
    this.renderMenuList(items, selectedIdx, this.height / 2 + 40, 40);
  }

  /** Populates the 3-item pause-menu list and highlights the selected one. */
  private updatePauseMenu(selectedIdx: number): void {
    const soundLabel = soundManager.isMuted() ? "SOUND: OFF" : "SOUND: ON";
    const items = ["CONTINUE", "STATS", "QUIT TO MENU", soundLabel];
    this.renderMenuList(items, selectedIdx, this.height / 2, 52);
  }

  private renderMenuList(
    items: string[],
    selectedIdx: number,
    startY: number,
    rowSpacing: number,
  ): void {
    // Draw button backgrounds for touch targeting before text (text is in menuLayer,
    // so draw buttons on pauseOverlay graphics which sits behind menuItemTexts).
    const g = this.pauseOverlay;
    const btnW = 440;
    const btnH = Math.max(36, rowSpacing - 6);
    for (let i = 0; i < items.length; i++) {
      const cy = startY + i * rowSpacing;
      const bx = this.width / 2 - btnW / 2;
      const by = cy - btnH / 2;
      const selected = i === selectedIdx;
      g.roundRect(bx, by, btnW, btnH, 8)
        .fill({ color: selected ? 0x003366 : 0x001a33, alpha: 0.85 })
        .stroke({ color: selected ? COLOR.hudAmber : 0x334455, width: selected ? 2 : 1, alpha: 0.9 });
    }

    for (let i = 0; i < this.menuItemTexts.length; i++) {
      const t = this.menuItemTexts[i]!;
      if (i >= items.length) {
        t.text = "";
        t.visible = false;
        continue;
      }
      t.visible = true;
      const label = items[i]!;
      const selected = i === selectedIdx;
      t.text = selected ? `▶  ${label}  ◀` : label;
      t.style.fill = selected ? COLOR.hudAmber : COLOR.hudWhite;
      t.y = startY + i * rowSpacing;
    }
  }

  /** Populates the stats screen columns from current/last/all-time stats. */
  private updateStatsScreen(
    state: Readonly<GameState>,
    lastRun: Readonly<RunStats> | null,
  ): void {
    this.statsColCurrent.text = formatRunStats(state.currentRunStats);
    this.statsColLast.text = lastRun
      ? formatRunStats(lastRun)
      : "— NO RUNS YET —";
    this.statsColAllTime.text = formatAllTimeStats(state.allTimeStats);
  }

  private updateGameOverText(state: Readonly<GameState>): void {
    const run = state.currentRunStats;
    const all = state.allTimeStats;
    const secs = Math.round(run.timeAliveMs / 1_000);
    this.gameOverStats.text = [
      `SCORE  ${run.score}`,
      `LEVEL REACHED  ${run.levelReached}`,
      `TIME ALIVE  ${secs}s`,
      `ENEMIES KILLED  ${run.enemiesKilled}`,
      `BEST GUN  LV ${run.gunUpgradeAchieved}`,
      `PEAK HITS  ${run.peakConsecutiveHits}`,
      "",
      `TOP SCORE  ${all.topScore}`,
      `FURTHEST LEVEL  ${all.furthestLevel}`,
    ].join("\n");
  }
}

// Two-column table layout: labels pad to LABEL_W, values pad-start to VAL_W
// so every row has the same monospace width and renders as a tidy grid.
const LABEL_W = 14;
const VAL_W = 7;

function row(label: string, value: string | number): string {
  return label.padEnd(LABEL_W) + String(value).padStart(VAL_W);
}

function formatRunStats(r: Readonly<RunStats>): string {
  const secs = Math.round(r.timeAliveMs / 1_000);
  return [
    row("SCORE", r.score),
    row("LEVEL", r.levelReached),
    row("TIME ALIVE", `${secs}s`),
    row("ENEMIES", r.enemiesKilled),
    row("BEST GUN", `LV ${r.gunUpgradeAchieved}`),
    row("PEAK HITS", r.peakConsecutiveHits),
    row("SAFE TIME", `${Math.round(r.longestTimeWithoutDamageSec)}s`),
    row("DAMAGE TAKEN", r.totalDamageReceived),
    row("SHIELDS", r.shieldsCollected),
    row("LIVES GAINED", r.extraLivesCollected),
  ].join("\n");
}

function formatAllTimeStats(a: {
  topScore: number;
  furthestLevel: number;
  bestGunUpgrade: number;
  totalEnemiesKilled: number;
  totalGamesPlayed: number;
  longestTimeAlive: number;
  longestTimeSafeSec: number;
  averageScore: number;
  averageLevelReached: number;
}): string {
  const secs = Math.round(a.longestTimeAlive / 1_000);
  return [
    row("TOP SCORE", a.topScore),
    row("FURTHEST LVL", a.furthestLevel),
    row("BEST GUN", `LV ${a.bestGunUpgrade}`),
    row("TOTAL KILLS", a.totalEnemiesKilled),
    row("GAMES PLAYED", a.totalGamesPlayed),
    row("LONGEST LIFE", `${secs}s`),
    row("LONGEST SAFE", `${Math.round(a.longestTimeSafeSec)}s`),
    row("AVG SCORE", Math.round(a.averageScore)),
    row("AVG LEVEL", a.averageLevelReached.toFixed(1)),
  ].join("\n");
}

/** Blend hex color `a` toward `b` by factor `t` (0..1). Used for phase-2 tint. */
function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

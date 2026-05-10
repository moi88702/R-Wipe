/**
 * GameManager – top-level orchestrator.
 *
 * Owns every subsystem and drives the per-frame update + render cycle based on
 * the current screen. Screen transitions (main-menu ↔ gameplay ↔ game-over) are
 * driven by input.
 */

import type { Application } from "pixi.js";
import type { DevCheats, EnemyType, InputState, PowerUp, Projectile, ScreenType, ShopEntry, ShopRenderData } from "../types/index";
import { InputHandler } from "../input/InputHandler";
import { StateManager } from "../managers/StateManager";
import { PlayerManager } from "../managers/PlayerManager";
import { EnemyManager } from "../managers/EnemyManager";
import { LevelManager } from "../managers/LevelManager";
import { PowerUpManager } from "../managers/PowerUpManager";
import { OverworldManager } from "../managers/OverworldManager";
import { missionToLevelState } from "../managers/MissionManager";
import { BlueprintStore } from "../managers/BlueprintStore";
import { SolarBlueprintStore } from "../managers/SolarBlueprintStore";
import { SolarSystemSessionManager } from "../managers/SolarSystemSessionManager";
import { ShipBuilderManager } from "../managers/ShipBuilderManager";
import { ShopManager } from "../managers/ShopManager";
import { SolarModuleRegistry, classToTier, TIER_BASE_MASS_KG, HULL_BASE_MASS_KG, KIND_MASS_FACTOR } from "./data/SolarModuleRegistry";
import { NPCRegistry } from "./data/NPCRegistry";
import { SystemGateRegistry } from "./data/SystemGateRegistry";
import { GateTeleportSystem } from "./solarsystem/GateTeleportSystem";
import { MissionLogManager } from "../managers/MissionLogManager";
import { MissionRegistry } from "./data/MissionRegistry";
import type { MissionSpec } from "../types/missions";
import { CollisionSystem } from "../systems/CollisionSystem";
import { ModuleHpSystem } from "../systems/ModuleHpSystem";
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
import {
  getPirateBlueprint, PIRATE_BLUEPRINTS,
  getEarthBlueprint, EARTH_BLUEPRINTS,
  getMarsBlueprint, MARS_BLUEPRINTS,
  makePlayerStarterBlueprint,
} from "./data/blueprints/FactionBlueprintRegistry";
import { SolarStationRegistry, type StationFaction } from "./data/SolarStationRegistry";
import { SolarInventoryHandler } from "./handlers/SolarInventoryHandler";
import { SolarShopHandler } from "./handlers/SolarShopHandler";
import { SolarMyShipsHandler } from "./handlers/SolarMyShipsHandler";
import { NpcTalkMissionHandler } from "./handlers/NpcTalkMissionHandler";
import { SolarCrewHandler } from "./handlers/SolarCrewHandler";
import type { CrewService } from "../rpg/CrewService";
import { DEFAULT_PILOT_ID } from "../rpg/schema";
import type { CrewBot, BotSkillFamily } from "../rpg/bot-schema";
import type { BotTraitRecord } from "../rpg/bot-schema";
import type { SolarShipBlueprint, SavedBlueprintSummary, ShipTier } from "../types/solarShipBuilder";
import type { ShipControlConfig } from "./solarsystem/ShipControlManager";
import { DEFAULT_SHIP_CONTROL_CONFIG } from "../managers/SolarSystemSessionManager";
import { GeometryEngine } from "./shipbuilder/GeometryEngine";
import { PIRATE_FACTION_TEMPLATES } from "./data/FactionColors";
import type { FactionColors } from "./data/FactionColors";

interface SolarEnemyBase {
  id: string;
  name: string;
  faction: StationFaction;
  position: { x: number; y: number };
  health: number;
  maxHealth: number;
  alertLevel: "dormant" | "alerted" | "combat";
  alertRadiusKm: number;
  lastSpawnMs: number;
  spawnIntervalMs: number;
  maxShips: number;
  spawnRoster: ReadonlyArray<{ name: string; typeIdx: number; sizeClass: number }>;
  spawnRadiusKm: number;
  defenseRadiusKm: number;
  turretRangeKm: number;
  turretDamage: number;
  turretCooldownMs: number;
  turretWeaponIdx: number;
  lastTurretFireMs: number;
  /** Current barrel direction in degrees (0–360). Rotates toward target each frame. */
  turretAimAngleDeg: number;
  sizeClass: number;
  blueprintId: string;
}

interface SolarEnemyShip {
  id: string;
  baseId: string;
  faction: StationFaction;
  name: string;
  typeIdx: number;
  sizeClass: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  heading: number;
  /** Desired heading set by AI; actual heading smoothly interpolates toward this. */
  targetHeading: number;
  health: number;
  maxHealth: number;
  weapon0CooldownMs: number;
  weapon1CooldownMs: number;
  /** Maximum detection range (km). Player/enemies beyond this are invisible to this ship. */
  scannerRangeKm: number;
  /** Set when this ship was hit from outside its scanner range; it will fly here to investigate. */
  lastKnownThreatPos: { x: number; y: number } | null;
  /** 0–1: fraction of max health below which this ship will retreat (0 = never retreats, 1 = always fights). */
  bravery: number;
  /** True once health drops below the bravery threshold; ship flees rather than fights. */
  retreating: boolean;
  /** Which side of the player this ship is flanking from (-1 = left, 1 = right). Assigned on spawn. */
  flankSide: -1 | 1;
  /** Per-module HP state. Empty array = module system not yet initialised for this ship. */
  moduleHp: import("../systems/ModuleHpSystem").ModuleHpEntry[];
  /** Cached effective stats recomputed after each module loss. */
  effectiveStats: import("../systems/ModuleHpSystem").ShipEffectiveStats | null;
  /** True when all engine modules are destroyed; ship can no longer apply thrust. */
  isStranded: boolean;
}

interface SolarEnemyProjectile {
  id: string;
  weaponIdx: number;
  sourceFaction: StationFaction;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  lifeMs: number;
  damage: number;
  isHoming?: boolean;
  /** Entity to home toward: "player" or a solarEnemyShip id. */
  homingTargetId?: string;
  homingTargetPos?: { x: number; y: number };
  homingAccel?: number;
  homingMaxSpeed?: number;
  homingTurnRateRadS?: number;
  trailPoints?: Array<{ x: number; y: number }>;
  trailNextSampleMs?: number;
  weaponTrailColor?: number;
}

interface SolarFriendlyShip {
  id: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  heading: number;
  health: number;
  maxHealth: number;
  weaponCooldownMs: number;
  bravery: number;
  retreating: boolean;
  role: "escort" | "rescue";
  /** Station world position to tow the player toward (rescue only). */
  rescueStationPos?: { x: number; y: number };
  /** Location ID to auto-dock at when towing completes (rescue only). */
  rescueLocationId?: string;
  /** True once the rescue ship has reached the player and is actively towing. */
  rescueTowing: boolean;
}

interface SolarPlayerProjectile {
  id: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  damage: number;
  weaponKind: "cannon" | "laser" | "torpedo";
  /** Size class of the weapon that fired this — used for accuracy roll vs target class. */
  weaponSizeClass: number;
  lifetimeMs: number;
  maxLifetimeMs: number;
  missileTargetId?: string;
  missileAccel?: number;
  missileMaxSpeed?: number;
  missileTurnRateRadS?: number;
  missileLevel?: number;
  trailPoints?: Array<{ x: number; y: number }>;
  trailNextSampleMs?: number;
}

interface SolarExplosion {
  x: number;
  y: number;
  ageMs: number;
  maxAgeMs: number;
  scale: number;
}

/** A salvageable module dropped in world space by a destroyed ship. */
interface WorldItem {
  id: string;
  moduleDefId: string;
  position: { x: number; y: number };
  ageMs: number;
}

interface InventoryDisplayItem {
  defId: string;
  name: string;
  type: import("../types/solarShipBuilder").SolarModuleType | string;
  quantity: number;
  shopCost: number;
  isHeader?: boolean;
}

interface InventoryScreenData {
  readonly stationItems: ReadonlyArray<InventoryDisplayItem>;
  readonly shipItems: ReadonlyArray<InventoryDisplayItem>;
  readonly activePanel: "station" | "ship";
  readonly stationSel: number;
  readonly shipSel: number;
  readonly stationScroll: number;
  readonly shipScroll: number;
  readonly contextMenu: null | { options: ReadonlyArray<string>; selection: number };
  readonly isDocked: boolean;
  readonly locationName: string;
  readonly playerCredits: number;
  readonly shipCargoUsed: number;
  readonly shipCargoCapacity: number;
}

const CARGO_BASE_SLOTS = 8;
const CARGO_PICKUP_RADIUS_KM = 6;
const WORLD_ITEM_MAX_AGE_MS = 600_000; // 10 minutes
/** Module ids that can drop from enemy ships. */
const WORLD_ITEM_DROP_POOL = [
  "weapon-cannon-c1", "weapon-laser-c1", "weapon-torpedo-c1",
  "ext-shield-c1", "int-engine-c1", "int-power-c1", "int-cargo-c1",
] as const;

/** Tunable constants for solar-system combat — edit here to balance, not inline. */
const SOLAR_COMBAT_CONFIG = {
  PROJECTILE_SPEED_KM_S: 600,
  PLAYER_SENSOR_RANGE_KM: 540,
  /** Weapon-lock range is capped below the sensor range so you can see farther than you can lock. */
  PLAYER_LOCK_RANGE_KM: 200,
  LASER_HIT_RADIUS_KM: 20,
  PROJECTILE_HIT_RADIUS_KM: 10,
  AUTO_FIRE_RANGE_KM: 120,
  AUTO_FIRE_HALF_CONE_DEG: 45,
  CLICK_DETECT_RADIUS_PX: 30,
} as const;

const SOLAR_ENEMY_TYPES = [
  // name          color      health  speed  scannerRangeKm  optimalRangeKm  bravery
  { name: "Scout",       color: 0xff5555, health:  60, speed: 14000, scannerRangeKm: 250, optimalRangeKm:  60, bravery: 0.45 },
  { name: "Interceptor", color: 0xff8822, health:  80, speed: 16000, scannerRangeKm: 220, optimalRangeKm:  75, bravery: 0.55 },
  { name: "Fighter",     color: 0xff2266, health: 100, speed: 11000, scannerRangeKm: 180, optimalRangeKm:  85, bravery: 0.65 },
  { name: "Gunship",     color: 0xcc2222, health: 180, speed:  7000, scannerRangeKm: 150, optimalRangeKm: 100, bravery: 0.75 },
  { name: "Destroyer",   color: 0x990033, health: 250, speed:  5500, scannerRangeKm: 170, optimalRangeKm: 110, bravery: 0.85 },
  { name: "Predator",    color: 0xff9900, health:  90, speed: 15000, scannerRangeKm: 210, optimalRangeKm: 140, bravery: 0.50 },
  { name: "Wraith",      color: 0xcc44ff, health:  70, speed: 18000, scannerRangeKm: 300, optimalRangeKm:  50, bravery: 0.60 },
  { name: "Titan",       color: 0xff3300, health: 400, speed:  4000, scannerRangeKm: 130, optimalRangeKm: 120, bravery: 0.92 },
  { name: "Spectre",     color: 0xff44aa, health:  80, speed: 17000, scannerRangeKm: 260, optimalRangeKm:  80, bravery: 0.55 },
  { name: "Ravager",     color: 0xffaa00, health: 130, speed: 10000, scannerRangeKm: 160, optimalRangeKm:  90, bravery: 0.70 },
] as const;

// Per-level missile stats. Index 0 = class-1 (Mini Torpedo), index 8 = class-9.
// Larger missiles are faster at top speed but less maneuverable (lower accel, lower turn rate).
// Speeds in km/s (same unit as PROJECTILE_SPEED_KM_S). Turn rates in rad/s.
// Turn-rate values match design doc §8 converted from °/s → rad/s.
const MISSILE_LEVEL_STATS = [
  { accel: 800, maxSpeed:   650, turnRateRadS: 1.571 }, // c1  — nimble, barely faster than bullets
  { accel: 640, maxSpeed:   780, turnRateRadS: 1.309 }, // c2
  { accel: 510, maxSpeed:   950, turnRateRadS: 1.082 }, // c3
  { accel: 400, maxSpeed: 1_150, turnRateRadS: 0.873 }, // c4
  { accel: 310, maxSpeed: 1_400, turnRateRadS: 0.698 }, // c5
  { accel: 240, maxSpeed: 1_700, turnRateRadS: 0.559 }, // c6
  { accel: 180, maxSpeed: 2_050, turnRateRadS: 0.436 }, // c7
  { accel: 135, maxSpeed: 2_450, turnRateRadS: 0.349 }, // c8
  { accel: 100, maxSpeed: 2_900, turnRateRadS: 0.279 }, // c9  — fast, barely turns
] as const;

/** Speed fraction lost per radian turned per second (missile turn drag). */
const MISSILE_TURN_DRAG = 0.30;

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

const FACTION_COLORS: Record<StationFaction, number> = {
  pirate: 0xff3333,
  earth: 0x4488ff,
  mars: 0xff8844,
};

/** Menu item ids used by updateMenu / updatePause. */
type MainMenuItem = "play" | "campaign" | "solar-system" | "shipyard" | "stats";
type PauseMenuItem = "continue" | "stats" | "quit" | "mute";
const MAIN_MENU_ITEMS: readonly MainMenuItem[] = ["play", "campaign", "solar-system", "shipyard", "stats"];
const PAUSE_MENU_ITEMS: readonly PauseMenuItem[] = ["continue", "stats", "quit", "mute"];

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
  private readonly solarBlueprintStore = new SolarBlueprintStore();
  private readonly solarShipBuilderMgr = new ShipBuilderManager();
  private readonly shopManager = new ShopManager();
  private readonly shopHandler = new SolarShopHandler();
  private dockedMenuScrollOffset = 0;
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
  /** When true the session was started by the E2E test harness — skip all save/load. */
  private e2eMode = false;
  /** Solar-system enemy tracking. */
  private solarEnemyBases: SolarEnemyBase[] = [];
  private solarEnemyShips: SolarEnemyShip[] = [];
  private solarEnemyProjectiles: SolarEnemyProjectile[] = [];
  private solarEnemyNextId = 0;
  /**
   * Last known world position for every enemy ship the player has spotted.
   * Updated each frame while the ship is within scanner range; persists after
   * the ship leaves range so the player sees a ghost marker.
   */
  private readonly solarLastKnownShipPositions = new Map<string, { x: number; y: number; color: number }>();
  /**
   * Enemy station ids the player has scanned at least once.  Stations never
   * move so a discovered position is permanently accurate.
   */
  private readonly solarDiscoveredStationIds = new Set<string>();
  /** Click-to-lock targeting. */
  private solarLockedIds = new Set<string>();
  private solarFocusedId: string | null = null;
  /** Friendly escort ships. */
  private solarFriendlyShips: SolarFriendlyShip[] = [];
  /** True when a rescue ship has been dispatched and hasn't completed the tow yet. */
  private solarRescuePending = false;
  /** Player projectiles (cannon / torpedo kinds). */
  private solarPlayerProjectiles: SolarPlayerProjectile[] = [];
  /** Per-weapon cooldowns (moduleDefId → remaining ms). */
  private solarWeaponCooldowns = new Map<string, number>();
  /** When true, weapons fire in sequence 300 ms apart instead of simultaneously. */
  private solarWeaponStagger = false;
  /** Auto-incrementing id counter for player projectiles and friendly ships. */
  private solarPlayerNextId = 0;
  /** Player health in solar system mode (separate from arcade health). */
  private solarPlayerHealth = 100;
  private solarPlayerMaxHealth = 100;
  private solarPlayerShield = 50;
  private solarPlayerMaxShield = 50;
  /** Shield recharge rate (HP/s). Recomputed when blueprint changes. */
  private solarPlayerShieldRechargeRate = 0;
  /** Timestamp (session ms) of last damage taken — recharge delayed after hits. */
  private solarPlayerLastDamageTimeMs = -Infinity;
  private static readonly SOLAR_SHIELD_REGEN_DELAY_MS = 5000;
  /** Projected shield bubble — active when radius > 0 and maxHp > 0. */
  private solarProjShieldHp = 0;
  private solarProjShieldMaxHp = 0;
  private solarProjShieldRadius = 0; // km
  private solarProjShieldRechargeRate = 0; // HP/s
  private solarProjShieldLastDamageMs = -Infinity;
  private static readonly PROJ_SHIELD_REGEN_DELAY_MS = 8_000;
  /** Friendly station projected shields — keyed by locationId. */
  private solarStationShields = new Map<string, {
    locationId: string; worldX: number; worldY: number;
    hp: number; maxHp: number; radius: number;
    rechargeRate: number; lastDamageMs: number;
  }>();
  /** Effective scanner range (km) for the player's active blueprint. Recomputed when blueprint changes. */
  private solarPlayerScannerRangeKm = 540;
  /** Last-frame directional thrust inputs — used for engine FX direction. */
  private solarLastThrustForward = false;
  private solarLastThrustReverse = false;
  private solarLastStrafeLeft = false;
  private solarLastStrafeRight = false;
  private solarLastTurnLeft = false;
  private solarLastTurnRight = false;
  /** Flash overlay when player takes damage (counts down ms). */
  private solarDamageFlashMs = 0;
  /** Active explosions in solar-system space. */
  private solarExplosions: SolarExplosion[] = [];
  /** Roll ability cooldown (ms remaining). */
  private solarRollCooldownMs = 0;
  /** Navigation skill level 0–10 (from RPG pilot skills — 0 until wired up). */
  private solarNavigationSkill = 0;
  /** Afterimage streak particles from a roll. */
  private solarRollFx: Array<{ x: number; y: number; dx: number; dy: number; ageMs: number; maxAgeMs: number }> = [];
  private static readonly ROLL_BASE_IMPULSE_MS = 2500;   // m/s lateral burst
  private static readonly ROLL_SKILL_SCALE = 200;         // extra m/s per nav skill point
  private static readonly ROLL_BASE_COOLDOWN_MS = 3000;  // ms base cooldown
  private static readonly ROLL_COOLDOWN_PER_SKILL = 150; // cooldown reduction per skill point
  /** World-space salvageable items dropped by destroyed ships. */
  private solarWorldItems: WorldItem[] = [];
  private solarWorldItemNextId = 0;
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

  // Blueprint shape caches — computed once per blueprint id, reused every frame.
  private solarPlayerBlueprintCache: {
    blueprintId: string;
    modules: Array<{
      vertices: Array<{ x: number; y: number }>;
      worldX: number; worldY: number;
      moduleType: string; partKind: string; grade: number;
      placedId: string;
      moduleDefId: string;
      boundsR: number;
    }>;
    coreRadius: number;
  } | null = null;
  /** Per-module HP for the player's currently active ship. */
  private playerModuleHp: import("../systems/ModuleHpSystem").ModuleHpEntry[] = [];
  /** Effective stats derived from player's surviving modules. */
  private playerEffectiveStats: import("../systems/ModuleHpSystem").ShipEffectiveStats | null = null;
  /** Blueprint id for which playerModuleHp was last initialised. */
  private playerModuleHpBlueprintId: string | null = null;
  /** Single geometry cache for all faction ship/station blueprints (key = blueprint id). */
  private readonly blueprintGeometryCache = new Map<string, {
    modules: Array<{
      vertices: Array<{ x: number; y: number }>;
      worldX: number; worldY: number;
      moduleType: string; partKind: string; grade: number;
      /** placedId from the blueprint — used for per-module HP lookup. */
      placedId: string;
      moduleDefId: string;
      /** Bounding-circle radius in blueprint-pixel units (local ship space). */
      boundsR: number;
    }>;
    coreRadius: number;
  }>();
  /** Factions that have attacked Mars ships — triggers Mars retaliation. */
  private marsProvokedFactions: Set<StationFaction | "player"> = new Set();
  /** True while the player is dragging the zoom slider. */
  private zoomBarDragging = false;
  /** True while dragging the ship-builder zoom bar. */
  private sbZoomBarDragging = false;
  private static readonly SB_ZOOM_BAR = { x: 8, top: 120, bottom: 560, w: 18 } as const;
  /** Ship id that is visually selected (white circle, no weapon lock). */
  private solarSelectedId: string | null = null;
  /** Index into PIRATE_FACTION_TEMPLATES — chosen randomly when the solar session starts. */
  private activePirateFactionIdx = 0;

  /** Screen-space bounds of the zoom bar track (fixed, 1280×720 canvas). */
  private static readonly ZOOM_BAR = { x: 12, top: 110, bottom: 540, w: 28 } as const;
  /** Where the shipyard should return when ESC is pressed. */
  private shipyardReturnScreen: "main-menu" | "docked" = "main-menu";
  /** Selection in the solar-system pause overlay (0=Resume, 1=Quit). */
  private solarPauseSelection = 0;
  private readonly missionLog = new MissionLogManager();
  private readonly npcHandler = new NpcTalkMissionHandler();
  private readonly invHandler = new SolarInventoryHandler();
  private readonly crewHandler = new SolarCrewHandler();

  // RPG layer — async-initialised via initRPG() called from main.ts
  private crewSvc: CrewService | null = null;
  private crewCache: Array<{
    bot: CrewBot;
    traitIds: string[];
    skills: Record<BotSkillFamily, number>;
  }> = [];

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
    try {
      this.solarBlueprintStore.load();
    } catch {
      this.solarBlueprintStore.clearSaved();
    }
    // Seed a sensible starter blueprint the first time campaign is opened
    // so the shipyard always has at least one option to equip.
    this.seedStarterBlueprintIfMissing();
  }

  /**
   * Async RPG initialisation — call once from main.ts after constructing.
   * Connects IndexedDB, creates a new pilot + crew on first run.
   */
  async initRPG(): Promise<void> {
    try {
      const { createGameDatabase } = await import("../rpg/CrewService");
      const g = await createGameDatabase();
      this.crewSvc = g.crew;

      let pilot = await g.rpg.getPilot();
      if (!pilot) {
        await g.rpg.createPilot("Mind", "earth");
      }
      const existing = await g.crew.getLivingCrew(DEFAULT_PILOT_ID);
      if (existing.length === 0) {
        await g.crew.drawStartingCrew(DEFAULT_PILOT_ID);
      }
      await this.refreshCrewCache();
    } catch (err) {
      console.warn("RPG database unavailable:", err);
    }
  }

  private async refreshCrewCache(): Promise<void> {
    if (!this.crewSvc) return;
    const bots = await this.crewSvc.getAllCrew(DEFAULT_PILOT_ID);
    const cache: typeof this.crewCache = [];
    for (const bot of bots) {
      const [traitRecs, skillRecs] = await Promise.all([
        this.crewSvc.getBotTraits(bot.id),
        this.crewSvc.getBotSkills(bot.id),
      ]);
      const skills = {} as Record<BotSkillFamily, number>;
      for (const s of skillRecs) skills[s.family] = s.level;
      cache.push({ bot, traitIds: traitRecs.map((t: BotTraitRecord) => t.traitId), skills });
    }
    this.crewCache = cache;
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
    } else if (screen === "solar-inventory") {
      this.updateSolarInventory(clamped);
    } else if (screen === "solar-crew") {
      this.updateSolarCrew();
    }

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
    const upEdge = this.input.wasPressed("ArrowUp") || input.swipeUpPulse;
    const downEdge = this.input.wasPressed("ArrowDown") || input.swipeDownPulse;

    if (upEdge) {
      this.menuSelection = (this.menuSelection - 1 + itemCount) % itemCount;
      soundManager.menuNav();
    }
    if (downEdge) {
      this.menuSelection = (this.menuSelection + 1) % itemCount;
      soundManager.menuNav();
    }
  }

  /** True when menuConfirm is newly pressed (edge-triggered). */
  private wasMenuConfirmPressed(): boolean {
    return this.input.menuConfirmEdge();
  }

  /** True when menuBack is newly pressed (edge-triggered). */
  private wasMenuBackPressed(): boolean {
    return this.input.wasPressed("Escape");
  }

  /** True when pause toggle (ESC/P) is newly pressed (edge-triggered). */
  private wasPausePressed(): boolean {
    return this.input.pauseEdge();
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
    } else if (pick === "mute") {
      soundManager.init();
      soundManager.toggleMute();
      return; // don't close menu; stay on pause so user sees state change
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
    const upEdge = this.input.wasPressed("ArrowUp");
    const downEdge = this.input.wasPressed("ArrowDown");
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
    // Pick a random pirate faction for this session.
    this.activePirateFactionIdx = Math.floor(Math.random() * PIRATE_FACTION_TEMPLATES.length);
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

    // Start the player docked at Earth Station.
    const sessionState = this.solarSystem.getSessionState();

    if (!this.e2eMode) {
      // Normal play: restore persisted state.
      this.missionLog.load();

      // Restore persisted inventory and credits, or seed a starter kit on first play.
      if (this.solarBlueprintStore.hasInventory()) {
        for (const [defId, qty] of Object.entries(this.solarBlueprintStore.getInventory())) {
          if (qty > 0) sessionState.moduleInventory.set(defId, qty);
        }
        const savedCredits = this.solarBlueprintStore.getCredits();
        if (savedCredits !== null) sessionState.solarCredits = savedCredits;
        // Restore station hangars
        for (const [locId, rec] of Object.entries(this.solarBlueprintStore.getStationHangars())) {
          const bag = new Map<string, number>();
          for (const [k, v] of Object.entries(rec)) if (v > 0) bag.set(k, v);
          if (bag.size > 0) sessionState.stationHangars.set(locId, bag);
        }
      } else {
        // First-time starter kit — a handful of basic parts to get going.
        const starterKit: Array<[string, number]> = [
          ["core-c1-balanced", 1],
          ["weapon-cannon-c1", 1],
          ["weapon-laser-c1", 1],
          ["ext-shield-c1", 2],
          ["int-engine-c1", 2],
          ["int-power-c1", 1],
          ["struct-frame-c1", 2],
        ];
        for (const [id, qty] of starterKit) {
          sessionState.moduleInventory.set(id, qty);
        }
        this.persistSolarInventory(sessionState.moduleInventory);
      }

      // Load persisted solar blueprints into the in-memory map (first entry only).
      if (this.solarSavedBlueprints.size === 0) {
        for (const bp of this.solarBlueprintStore.list()) {
          this.solarSavedBlueprints.set(bp.id, bp);
        }
        const savedActiveId = this.solarBlueprintStore.getActiveId();
        if (savedActiveId && this.solarSavedBlueprints.has(savedActiveId)) {
          this.solarActiveBlueprintId = savedActiveId;
        } else if (this.solarSavedBlueprints.size > 0) {
          this.solarActiveBlueprintId = this.solarSavedBlueprints.keys().next().value ?? null;
        }
      }
    } else {
      // E2E test mode: skip all persistence. Seed a minimal starter kit so the
      // ship builder is not completely empty, but don't write it back.
      const starterKit: Array<[string, number]> = [
        ["core-c1-balanced", 1], ["weapon-cannon-c1", 1], ["weapon-laser-c1", 1],
        ["ext-shield-c1", 2], ["int-engine-c1", 2], ["int-power-c1", 1],
        ["struct-frame-c1", 2],
      ];
      for (const [id, qty] of starterKit) sessionState.moduleInventory.set(id, qty);
    }

    // Seed the player's starting ship if nothing was loaded.
    if (!this.solarActiveBlueprintId) {
      const starter = makePlayerStarterBlueprint();
      this.solarSavedBlueprints.set(starter.id, starter);
      this.solarActiveBlueprintId = starter.id;
    }
    this.solarPlayerScannerRangeKm = this.computePlayerScannerRange();

    sessionState.playerPosition = { x: 980, y: 30 }; // Earth Station world position (Earth 900,0 + offset 80,30)
    sessionState.playerVelocity = { x: 0, y: 0 };
    sessionState.playerHeading = 0;
    sessionState.zoomLevel = 1.0;
    // Normal play starts docked; e2e overrides these after init via applyE2eScene.
    sessionState.dockedLocationId = this.e2eMode ? null : "station-earth-orbit";
    sessionState.nearbyLocations = this.e2eMode ? [] : ["station-earth-orbit"];

    // Initialize combat stations from the data registry.
    this.marsProvokedFactions = new Set();
    this.solarLastKnownShipPositions.clear();
    this.solarDiscoveredStationIds.clear();
    this.solarEnemyBases = SolarStationRegistry.getStationsBySystem("sol").map(def => ({
      id: def.id,
      name: def.name,
      faction: def.faction,
      position: { ...def.position },
      health: def.health,
      maxHealth: def.health,
      alertLevel: def.startInCombat ? ("combat" as const) : ("dormant" as const),
      alertRadiusKm: def.alertRadiusKm,
      lastSpawnMs: 0,
      spawnIntervalMs: def.spawn.intervalMs,
      maxShips: def.spawn.maxShips,
      spawnRoster: def.spawn.roster,
      spawnRadiusKm: def.spawn.radiusKm,
      defenseRadiusKm: def.defenseRadiusKm,
      turretRangeKm: def.turret.rangeKm,
      turretDamage: def.turret.damage,
      turretCooldownMs: def.turret.cooldownMs,
      turretWeaponIdx: def.turret.weaponIdx,
      lastTurretFireMs: 0,
      turretAimAngleDeg: 0,
      sizeClass: def.sizeClass,
      blueprintId: def.blueprintId,
    }));
    this.solarEnemyShips = [];
    this.solarEnemyProjectiles = [];
    this.solarEnemyNextId = 0;
    this.solarWorldItems = [];
    this.solarWorldItemNextId = 0;
    this.prevSolarFirePressed = false;
    this.laserFlashMs = 0;
    this.laserFlashTarget = null;
    this.solarPlayerHealth = this.solarPlayerMaxHealth;
    this.solarPlayerShield = this.solarPlayerMaxShield;
    this.solarDamageFlashMs = 0;
    this.solarExplosions = [];
    this.solarRollFx = [];
    this.solarRollCooldownMs = 0;
    this.solarDeathTimerMs = 0;
    this.solarPlayerDead = false;
    this.solarLockedIds = new Set();
    this.solarFocusedId = null;
    this.solarFriendlyShips = [];
    this.solarRescuePending = false;
    this.solarPlayerProjectiles = [];
    this.solarWeaponCooldowns = new Map();
    this.solarPlayerNextId = 0;

    // Build friendly-station projected shields from static blueprints.
    // Use the combat-station world position (SolarEnemyBase) — not the dockable
    // location offset — so the bubble is centered on the actual rendered ship.
    this.solarStationShields.clear();
    const stationBlueprintEntries = [
      { locationId: "station-earth-orbit",  blueprintId: "earth-c6-orbital-platform", blueprints: EARTH_BLUEPRINTS as ReadonlyArray<SolarShipBlueprint> },
      { locationId: "station-moon-garrison",blueprintId: "earth-c4-moon-garrison",    blueprints: EARTH_BLUEPRINTS as ReadonlyArray<SolarShipBlueprint> },
      { locationId: "outpost-mars",          blueprintId: "mars-c4-citadel",           blueprints: MARS_BLUEPRINTS as ReadonlyArray<SolarShipBlueprint> },
    ];
    for (const { locationId, blueprintId, blueprints } of stationBlueprintEntries) {
      const bp = blueprints.find(b => b.id === blueprintId);
      if (!bp) continue;
      const stats = GameManager.shieldStatsFromBlueprint(bp);
      if (stats.radius <= 0 || stats.maxHp <= 0) continue;
      // The enemy base holds the actual world position of the rendered station ship.
      const base = this.solarEnemyBases.find(b => b.blueprintId === blueprintId);
      if (!base) continue;
      this.solarStationShields.set(locationId, {
        locationId, worldX: base.position.x, worldY: base.position.y,
        hp: stats.maxHp, maxHp: stats.maxHp,
        radius: stats.radius, rechargeRate: stats.rechargeRate,
        lastDamageMs: -Infinity,
      });
    }
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
          position: { x: 900, y: 0 }, radius: 8, mass: 5.972e24, gravityStrength: 0,
          color: { r: 100, g: 150, b: 255 },
          orbital: this.staticOrbit("star-sol", 900),
          isPrimaryGravitySource: false,
        },
        {
          id: "planet-mars", name: "Mars", type: "planet",
          position: { x: 1440, y: 240 }, radius: 6, mass: 6.417e23, gravityStrength: 0,
          color: { r: 200, g: 100, b: 80 },
          orbital: this.staticOrbit("star-sol", 1458),
          isPrimaryGravitySource: false,
        },
        {
          id: "moon-earth", name: "Moon", type: "moon",
          position: { x: 900, y: 300 }, radius: 3, mass: 7.342e22, gravityStrength: 0,
          color: { r: 180, g: 180, b: 170 },
          orbital: this.staticOrbit("planet-earth", 300),
          isPrimaryGravitySource: false,
        },
      ],
      locations: [
        {
          id: "station-earth-orbit", name: "Earth Station", type: "station",
          bodyId: "planet-earth", position: { x: 80, y: 30 }, dockingRadius: 40,
          controllingFaction: "terran-federation",
          npcs: ["npc-commander-voss", "npc-trader-halley"], shops: [],
        },
        {
          id: "station-moon-garrison", name: "Lunar Garrison", type: "station",
          bodyId: "moon-earth", position: { x: 60, y: 40 }, dockingRadius: 35,
          controllingFaction: "terran-federation",
          npcs: ["npc-commander-voss"], shops: [],
        },
        {
          id: "outpost-mars", name: "Curiosity Base", type: "outpost",
          bodyId: "planet-mars", position: { x: 55, y: 25 }, dockingRadius: 35,
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
          position: { x: 1000, y: -180 }, radius: 9, mass: 8.4e24, gravityStrength: 0,
          color: { r: 120, g: 200, b: 130 },
          orbital: this.staticOrbit("star-kepler-442", 1016),
          isPrimaryGravitySource: false,
        },
      ],
      locations: [
        {
          id: "station-kepler-orbital", name: "Kepler Orbital", type: "station",
          bodyId: "planet-kepler-442b", position: { x: 80, y: 30 }, dockingRadius: 40,
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
          position: { x: 600, y: 120 }, radius: 7, mass: 7.6e24, gravityStrength: 0,
          color: { r: 180, g: 90, b: 70 },
          orbital: this.staticOrbit("star-proxima", 612),
          isPrimaryGravitySource: false,
        },
      ],
      locations: [
        {
          id: "outpost-proxima-b", name: "Frontier Outpost", type: "outpost",
          bodyId: "planet-proxima-b", position: { x: 65, y: 20 }, dockingRadius: 35,
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
        // Switch back to Sol if the player died in another system.
        if (this.currentSystemId !== "sol") {
          const solSystem = this.getOrBuildSystemState("sol");
          this.solarSystem.switchSystem(solSystem);
          this.currentSystemId = "sol";
        }
        const ss = this.solarSystem.getSessionState();
        ss.playerVelocity = { x: 0, y: 0 };
        ss.playerHeading = 0;
        const spawnLocId = "station-earth-orbit";
        const spawnLoc = ss.currentSystem.locations.find(l => l.id === spawnLocId);
        ss.playerPosition = spawnLoc
          ? this.solarSystem.getLocationWorldPosition(spawnLoc)
          : { x: 980, y: 30 }; // fallback matches Sol system Earth Station world pos
        ss.dockedLocationId = spawnLocId;
        ss.nearbyLocations = [spawnLocId];
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

    // Inventory (I) — opens ship hold screen in flight
    if (this.input.wasPressed("KeyI") && !this.mapOpen && this.menuDebounceMs === 0) {
      this.invHandler.fromScreen = "solar-system";
      this.invHandler.panel = "ship";
      this.invHandler.shipSel = 0;
      this.invHandler.stationSel = 0;
      this.invHandler.shipScroll = 0;
      this.invHandler.stationScroll = 0;
      this.invHandler.ctxOpen = false;
      this.invHandler.ctxSel = 0;
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      this.state.setScreen("solar-inventory");
      return;

    // Weapon stagger toggle (G) — staggers each weapon 300 ms apart
    } else if (this.input.wasPressed("KeyG") && !this.mapOpen && this.menuDebounceMs === 0) {
      this.solarWeaponStagger = !this.solarWeaponStagger;
      if (this.solarWeaponStagger) this.initWeaponStagger();
    }

    // While the galaxy map is open, don't drive ship physics — just allow
    // the player to read and close it again.
    if (!this.mapOpen) {
      this.updateAntiGravity(input, deltaMs);
      const skipGrav = this.antiGravActive || this.warpDecayMs > 0;
      const decayT = this.warpDecayMs / GameManager.WARP_DECAY_DURATION_MS; // 1→0
      const speedMult = this.antiGravActive ? 10 : (1 + decayT * 9); // 10x→1x during decay
      // Block thrust input when all engine modules are destroyed (stranded)
      const physicsInput = this.isPlayerStranded()
        ? { ...input, thrustForward: false, thrustReverse: false, strafeLeft: false, strafeRight: false }
        : input;
      this.solarSystem.updateShipPhysics(physicsInput, deltaMs, skipGrav, speedMult);
      soundManager.setThrusterActive(this.solarSystem.getLastThrustActive() || this.antiGravActive);
      soundManager.tickThruster(deltaMs);
      // Record directional inputs for engine exhaust FX
      this.solarLastThrustForward = (input as any).thrustForward ?? false;
      this.solarLastThrustReverse = (input as any).thrustReverse ?? false;
      this.solarLastStrafeLeft    = (input as any).strafeLeft ?? false;
      this.solarLastStrafeRight   = (input as any).strafeRight ?? false;
      this.solarLastTurnLeft      = (input as any).turnLeft ?? false;
      this.solarLastTurnRight     = (input as any).turnRight ?? false;
    }

    // ── Roll ability ─────────────────────────────────────────────────────────
    if (this.solarRollCooldownMs > 0) {
      this.solarRollCooldownMs = Math.max(0, this.solarRollCooldownMs - deltaMs);
    }
    const wantRollRight = input.strafeRollRight === true;
    const wantRollLeft  = input.strafeRollLeft  === true;
    if ((wantRollRight || wantRollLeft) && this.solarRollCooldownMs === 0 && !this.solarPlayerDead) {
      const session = this.solarSystem!.getSessionState();
      const headingDeg = session.playerHeading;
      const h = (headingDeg * Math.PI) / 180;
      // strafeRightVector = (cos h, sin h)
      const sx = Math.cos(h);
      const sy = Math.sin(h);
      const dir = wantRollRight ? 1 : -1;
      const impulse = GameManager.ROLL_BASE_IMPULSE_MS + this.solarNavigationSkill * GameManager.ROLL_SKILL_SCALE;
      session.playerVelocity = {
        x: session.playerVelocity.x + dir * sx * impulse,
        y: session.playerVelocity.y + dir * sy * impulse,
      };
      this.solarRollCooldownMs = Math.max(500,
        GameManager.ROLL_BASE_COOLDOWN_MS - this.solarNavigationSkill * GameManager.ROLL_COOLDOWN_PER_SKILL,
      );
      // Spawn afterimage streak particles trailing behind the roll
      const pos = session.playerPosition;
      const NUM_STREAK = 6;
      for (let i = 0; i < NUM_STREAK; i++) {
        const frac = i / Math.max(1, NUM_STREAK - 1);
        this.solarRollFx.push({
          x: pos.x - dir * sx * frac * 10,
          y: pos.y - dir * sy * frac * 10,
          dx: dir * sx,
          dy: dir * sy,
          ageMs: 0,
          maxAgeMs: 200 + frac * 150,
        });
      }
    }
    // Age roll FX
    for (const rfx of this.solarRollFx) rfx.ageMs += deltaMs;
    this.solarRollFx = this.solarRollFx.filter(rfx => rfx.ageMs < rfx.maxAgeMs);

    // Shield recharge: delayed after last hit, rate from blueprint modules
    if (!this.solarPlayerDead && this.solarPlayerShield < this.solarPlayerMaxShield) {
      const sessionMs = this.solarSystem.getSessionState().gameTimeMs;
      const sinceHit = sessionMs - this.solarPlayerLastDamageTimeMs;
      if (sinceHit >= GameManager.SOLAR_SHIELD_REGEN_DELAY_MS) {
        this.solarPlayerShield = Math.min(
          this.solarPlayerMaxShield,
          this.solarPlayerShield + this.solarPlayerShieldRechargeRate * (deltaMs / 1000),
        );
      }
    }

    // Projected shield recharge (longer delay — it's a big investment).
    if (this.solarProjShieldMaxHp > 0 && this.solarProjShieldHp < this.solarProjShieldMaxHp) {
      const nowMs = this.solarSystem?.getSessionState().gameTimeMs ?? 0;
      const sinceProjHit = nowMs - this.solarProjShieldLastDamageMs;
      if (sinceProjHit >= GameManager.PROJ_SHIELD_REGEN_DELAY_MS) {
        this.solarProjShieldHp = Math.min(
          this.solarProjShieldMaxHp,
          this.solarProjShieldHp + this.solarProjShieldRechargeRate * (deltaMs / 1000),
        );
      }
    }
    // Friendly station shield recharge.
    {
      const nowMs = this.solarSystem?.getSessionState().gameTimeMs ?? 0;
      for (const ss of this.solarStationShields.values()) {
        if (ss.hp < ss.maxHp && (nowMs - ss.lastDamageMs) >= GameManager.PROJ_SHIELD_REGEN_DELAY_MS) {
          ss.hp = Math.min(ss.maxHp, ss.hp + ss.rechargeRate * (deltaMs / 1000));
        }
      }
    }

    // Player repair bot tick
    if (!this.solarPlayerDead && this.playerEffectiveStats && this.playerEffectiveStats.repairRatePerSec > 0
        && this.playerModuleHp.length > 0 && this.solarActiveBlueprintId) {
      const activeBp = this.solarSavedBlueprints.get(this.solarActiveBlueprintId);
      if (activeBp && this.playerEffectiveStats) {
        this.playerModuleHp = ModuleHpSystem.tickRepair(this.playerModuleHp, this.playerEffectiveStats, deltaMs);
        const coreId = activeBp.modules[0]?.placedId;
        const coreEntry = coreId ? this.playerModuleHp.find(e => e.placedId === coreId) : undefined;
        if (coreEntry) {
          this.solarPlayerHealth = Math.min(
            this.solarPlayerMaxHealth,
            (coreEntry.hp / Math.max(1, coreEntry.maxHp)) * this.solarPlayerMaxHealth,
          );
        }
      }
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
          this.persistSolarInventory(this.solarSystem.getSessionState().moduleInventory);
          this.dockedMenuSelection = 0;
          this.dockedMenuScrollOffset = 0;
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

    // ── CALL RESCUE button (screen-space, bottom center) ──────────────────
    if (input.pointerDownPulse && !this.mapOpen) {
      const { x: bx, y: by } = input.pointerDownPulse;
      if (bx >= GameManager.RESCUE_BTN_X && bx < GameManager.RESCUE_BTN_X + GameManager.RESCUE_BTN_W &&
          by >= GameManager.RESCUE_BTN_Y && by < GameManager.RESCUE_BTN_Y + GameManager.RESCUE_BTN_H) {
        if (this.isPlayerStranded() && !this.solarRescuePending) {
          this.callRescue();
          this.menuDebounceMs = 350;
          return;
        }
      }
    }

    // Click = select (white ring).  Meta/ctrl+click = weapon-lock the ship.
    const clickPulse = input.pointerDownPulse ?? input.pointerMetaDownPulse;
    const isMetaClick = !input.pointerDownPulse && !!input.pointerMetaDownPulse;
    if (clickPulse && !this.mapOpen) {
      const { x: sx, y: sy } = clickPulse;
      const zoom = this.solarSystem.getSessionState().zoomLevel;
      const kmToPx = Math.max(0.05, zoom);
      const pcx = this.width / 2;
      const pcy = this.height / 2;
      const worldX = (sx - pcx) / kmToPx + playerPos.x;
      const worldY = (sy - pcy) / kmToPx + playerPos.y;
      // Visual selection uses full sensor range; weapon lock is gated to lock range.
      const sensorRange = this.solarPlayerScannerRangeKm;
      const lockRange = SOLAR_COMBAT_CONFIG.PLAYER_LOCK_RANGE_KM;
      const clickRadiusKm = SOLAR_COMBAT_CONFIG.CLICK_DETECT_RADIUS_PX / kmToPx;
      let bestDist = clickRadiusKm;
      let clicked: string | null = null;
      let clickedInLockRange = false;
      for (const ship of this.solarEnemyShips) {
        const d = Math.hypot(ship.position.x - worldX, ship.position.y - worldY);
        const playerDist = Math.hypot(ship.position.x - playerPos.x, ship.position.y - playerPos.y);
        if (d < bestDist && playerDist < sensorRange) {
          bestDist = d; clicked = ship.id;
          clickedInLockRange = playerDist < lockRange;
        }
      }
      if (isMetaClick) {
        // Meta+click: weapon lock (only allowed within lock range)
        if (clicked && clickedInLockRange) {
          if (this.solarLockedIds.has(clicked)) {
            this.solarLockedIds.delete(clicked);
            if (this.solarFocusedId === clicked) this.solarFocusedId = null;
          } else {
            this.solarLockedIds.add(clicked);
            this.solarFocusedId = clicked;
          }
        }
      } else {
        // Plain click: visual selection only (no weapon targeting)
        this.solarSelectedId = clicked; // null if clicked empty space
      }
    }

    // Validate existing locks: remove any that moved out of lock range or were destroyed.
    // Lock range is intentionally lower than sensor/view range.
    const lockRangeKm = SOLAR_COMBAT_CONFIG.PLAYER_LOCK_RANGE_KM;
    for (const lockedId of [...this.solarLockedIds]) {
      const ship = this.solarEnemyShips.find(s => s.id === lockedId);
      if (!ship || Math.hypot(ship.position.x - playerPos.x, ship.position.y - playerPos.y) > lockRangeKm) {
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

    // Tick weapon cooldowns (keyed by placedId for per-instance tracking).
    for (const [key, cd] of this.solarWeaponCooldowns) {
      const next = Math.max(0, cd - deltaMs);
      if (next === 0) this.solarWeaponCooldowns.delete(key);
      else this.solarWeaponCooldowns.set(key, next);
    }

    if (input.zoomDelta) {
      this.solarSystem.adjustZoom(input.zoomDelta);
    }

    // Zoom bar drag (screen-space slider on the left edge)
    const zb = GameManager.ZOOM_BAR;
    if (input.pointerDownPulse && !this.mapOpen) {
      const { x: zbx, y: zby } = input.pointerDownPulse;
      if (zbx >= zb.x && zbx <= zb.x + zb.w && zby >= zb.top && zby <= zb.bottom) {
        this.zoomBarDragging = true;
      }
    }
    if (this.zoomBarDragging && input.pointerHeld && input.pointer) {
      const frac = 1 - Math.max(0, Math.min(1, (input.pointer.y - zb.top) / (zb.bottom - zb.top)));
      const newZoom = 0.5 * Math.pow(40, frac);
      this.solarSystem.setZoomLevel(newZoom);
    }
    if (!input.pointerHeld) this.zoomBarDragging = false;

    // Update enemy bases and ships only in Sol system for now.
    if (this.currentSystemId === "sol") {
      this.updateSolarEnemies(deltaMs, playerPos);
      this.updatePlayerProjectiles(deltaMs, playerPos);
      this.updateFriendlyShips(deltaMs, playerPos);
    }

    // Age out world items and pick up nearby ones.
    this.updateWorldItems(deltaMs, playerPos, session);
  }

  private updateWorldItems(deltaMs: number, playerPos: { x: number; y: number }, session: { moduleInventory: Map<string, number> }): void {
    for (const item of this.solarWorldItems) item.ageMs += deltaMs;
    this.solarWorldItems = this.solarWorldItems.filter(item => item.ageMs < WORLD_ITEM_MAX_AGE_MS);
    if (this.solarPlayerDead) return;
    const cap = this.computeCargoCapacity();
    for (let i = this.solarWorldItems.length - 1; i >= 0; i--) {
      if (this.computeCargoUsed(session.moduleInventory) >= cap) break;
      const item = this.solarWorldItems[i]!;
      const d = Math.hypot(item.position.x - playerPos.x, item.position.y - playerPos.y);
      if (d <= CARGO_PICKUP_RADIUS_KM) {
        const cur = session.moduleInventory.get(item.moduleDefId) ?? 0;
        session.moduleInventory.set(item.moduleDefId, cur + 1);
        this.solarWorldItems.splice(i, 1);
      }
    }
  }

  private getActiveWeapons(): Array<{ placedId: string; defId: string; damage: number; rateHz: number; kind: "cannon" | "laser" | "torpedo"; sizeClass: number }> {
    const bp = this.solarActiveBlueprintId ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId) : null;
    if (!bp) {
      return [{ placedId: "default-laser", defId: "default-laser", damage: 34, rateHz: 1.5, kind: "laser", sizeClass: 1 }];
    }
    return bp.modules
      .filter(m => {
        const d = SolarModuleRegistry.getModule(m.moduleDefId);
        return d?.type === "weapon";
      })
      .map(m => {
        const d = SolarModuleRegistry.getModule(m.moduleDefId)!;
        return {
          placedId: m.placedId,
          defId: d.id,
          damage: d.stats.damagePerShot ?? 20,
          rateHz: d.stats.fireRateHz ?? 1.0,
          kind: (d.id.includes("cannon") ? "cannon" : d.id.includes("torpedo") ? "torpedo" : "laser") as "cannon" | "laser" | "torpedo",
          sizeClass: d.sizeClass as number,
        };
      });
  }

  private initWeaponStagger(): void {
    const weapons = this.getActiveWeapons();
    const STAGGER_MS = 300;
    for (let i = 1; i < weapons.length; i++) {
      const w = weapons[i]!;
      const cur = this.solarWeaponCooldowns.get(w.placedId) ?? 0;
      this.solarWeaponCooldowns.set(w.placedId, Math.max(cur, i * STAGGER_MS));
    }
  }

  private fireWeaponsAtTarget(from: { x: number; y: number }, target: { x: number; y: number }): void {
    const weapons = this.getActiveWeapons();
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = SOLAR_COMBAT_CONFIG.PROJECTILE_SPEED_KM_S;

    // Compute weapon world-km positions from blueprint (zoom-independent using zoom=1 reference scale).
    const weaponPositions = this.computeWeaponWorldPositions(from);

    for (let wi = 0; wi < weapons.length; wi++) {
      const w = weapons[wi]!;
      // Per-weapon range check
      const weaponRangeKm = this.getWeaponRangeKm(w.defId);
      if (dist > weaponRangeKm) continue;

      const cooldown = this.solarWeaponCooldowns.get(w.placedId) ?? 0;
      if (cooldown > 0) continue;
      const intervalMs = 1000 / w.rateHz;
      this.solarWeaponCooldowns.set(w.placedId, intervalMs);

      // Cascade stagger: delay any subsequent ready weapons so they fire in sequence.
      if (this.solarWeaponStagger) {
        const STAGGER_MS = 300;
        let nextDelay = STAGGER_MS;
        for (let j = wi + 1; j < weapons.length; j++) {
          const wj = weapons[j]!;
          const cd = this.solarWeaponCooldowns.get(wj.placedId) ?? 0;
          if (cd === 0) {
            this.solarWeaponCooldowns.set(wj.placedId, nextDelay);
            nextDelay += STAGGER_MS;
          }
        }
      }

      // Spawn origin: use blueprint weapon position if available, else ship centre.
      const spawnPos = weaponPositions[wi] ?? { ...from };

      if (w.kind === "laser") {
        soundManager.solarShoot();
        this.laserFlashTarget = { ...target };
        this.laserFlashMs = 200;
        // Instant hit — accuracy roll: large weapons can miss small targets.
        const ship = this.solarEnemyShips.find(s =>
          Math.hypot(s.position.x - target.x, s.position.y - target.y) < SOLAR_COMBAT_CONFIG.LASER_HIT_RADIUS_KM
        );
        if (ship) {
          const miss = GameManager.calcMissChance(w.sizeClass, ship.sizeClass);
          if (miss === 0 || Math.random() >= miss) {
            this.damageEnemyShip(ship, w.damage);
          }
        }
      } else {
        // Cannon / torpedo — create projectile; lifetime derived from weapon range
        const vx = (dx / dist) * speed;
        const vy = (dy / dist) * speed;
        const lifetime = Math.round((weaponRangeKm / speed) * 1000);
        const proj: SolarPlayerProjectile = {
          id: `pp-${this.solarPlayerNextId++}`,
          position: { ...spawnPos },
          velocity: { x: vx, y: vy },
          damage: w.damage,
          weaponKind: w.kind,
          weaponSizeClass: w.sizeClass,
          lifetimeMs: lifetime,
          maxLifetimeMs: lifetime,
        };
        if (w.kind === "torpedo") {
          const lvl = Math.max(1, Math.min(9, w.sizeClass ?? 1));
          const mstats = MISSILE_LEVEL_STATS[lvl - 1]!;
          proj.missileAccel = mstats.accel;
          proj.missileMaxSpeed = mstats.maxSpeed;
          proj.missileTurnRateRadS = mstats.turnRateRadS;
          proj.missileLevel = lvl;
          proj.trailPoints = [];
          proj.trailNextSampleMs = 60;
          // Find target to home toward
          let homingTargetId: string | undefined;
          if (this.solarFocusedId) {
            const focused = this.solarEnemyShips.find(s => s.id === this.solarFocusedId);
            if (focused) homingTargetId = focused.id;
          }
          if (!homingTargetId) {
            let nearestDist = Infinity;
            for (const s of this.solarEnemyShips) {
              const d = Math.hypot(s.position.x - target.x, s.position.y - target.y);
              if (d < nearestDist) { nearestDist = d; homingTargetId = s.id; }
            }
          }
          if (homingTargetId) proj.missileTargetId = homingTargetId;
        }
        this.solarPlayerProjectiles.push(proj);
      }
    }
  }

  /**
   * Returns the world-km position for each active weapon module, in the same
   * order as getActiveWeapons(). Uses zoom=1 reference scale so the offset is
   * physically consistent regardless of current zoom level.
   */
  private computeWeaponWorldPositions(shipPos: { x: number; y: number }): Array<{ x: number; y: number }> {
    const cache = this.solarPlayerBlueprintCache;
    if (!cache) return [];
    const { modules, coreRadius } = cache;
    const szClass = this.solarActiveBlueprintId
      ? (this.solarSavedBlueprints.get(this.solarActiveBlueprintId)?.sizeClass ?? 2)
      : 2;
    // Reference scale at zoom=1: matches renderer formula at kmToPx=1
    const refTargetR = Math.max(3, (4 + szClass * 2) * 0.6);
    const bpScale = refTargetR / coreRadius;  // screen-px per blueprint-px at zoom=1
    // 1 km = 1 px at zoom=1, so km offset = blueprint_px * bpScale / 1
    const heading = this.solarSystem?.getSessionState().playerHeading ?? 0;
    const h = (heading * Math.PI) / 180;
    const cosH = Math.cos(h);
    const sinH = Math.sin(h);
    const weaponMods = modules.filter(m => m.moduleType === "weapon");
    return weaponMods.map(mod => ({
      x: shipPos.x + (mod.worldX * cosH - mod.worldY * sinH) * bpScale,
      y: shipPos.y + (mod.worldX * sinH + mod.worldY * cosH) * bpScale,
    }));
  }

  /** Returns weapon range in km from SOLAR_WEAPONS if the weapon def is a blueprint module weapon,
   *  otherwise falls back to AUTO_FIRE_RANGE_KM. */
  private getWeaponRangeKm(defId: string): number {
    // Blueprint weapon: check if any solar module has a rangeKm stat.
    const mod = SolarModuleRegistry.getModule(defId);
    if (mod?.stats.rangeKm !== undefined) return mod.stats.rangeKm;
    // Fallback for the hardcoded default laser
    return SOLAR_COMBAT_CONFIG.AUTO_FIRE_RANGE_KM;
  }

  /** Apply damage to an enemy ship, removing it and checking missions if destroyed. */
  private damageEnemyShip(
    ship: SolarEnemyShip,
    damage: number,
    attackerFaction?: StationFaction | "player",
    attackerPos?: { x: number; y: number },
  ): void {
    ship.health -= damage;
    // Sniping reaction: player hit this ship from beyond its scanner range →
    // record the shot origin so the ship investigates even without a visual.
    if (attackerFaction === "player" && attackerPos) {
      const d = Math.hypot(attackerPos.x - ship.position.x, attackerPos.y - ship.position.y);
      if (d > ship.scannerRangeKm) {
        ship.lastKnownThreatPos = { x: attackerPos.x, y: attackerPos.y };
      }
    }
    // Attacking a Mars ship provokes the entire Mars faction.
    if (ship.faction === "mars" && attackerFaction && attackerFaction !== "mars") {
      this.marsProvokedFactions.add(attackerFaction);
      // Mars station also enters combat when its ships are attacked.
      const marsBase = this.solarEnemyBases.find(b => b.faction === "mars");
      if (marsBase && marsBase.alertLevel === "dormant") marsBase.alertLevel = "combat";
    }
    if (ship.health <= 0) {
      this.solarExplosions.push({
        x: ship.position.x,
        y: ship.position.y,
        ageMs: 0,
        maxAgeMs: 900,
        scale: 1 + ship.sizeClass * 0.4,
      });
      // Drop loot proportional to ship size class.
      this.spawnDrops(ship.position, Math.max(1, Math.floor(ship.sizeClass / 2)));
      this.solarLockedIds.delete(ship.id);
      this.solarLastKnownShipPositions.delete(ship.id);
      if (this.solarFocusedId === ship.id) {
        this.solarFocusedId = null;
        // Auto-focus next remaining lock
        for (const id of this.solarLockedIds) { this.solarFocusedId = id; break; }
      }
      if (this.solarSelectedId === ship.id) this.solarSelectedId = null;
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

  /**
   * Route a projectile hit to a specific module on `ship`, applying the
   * module HP system (damage reduction, cascade, world-item drops, stat
   * recomputation) then delegating faction/death logic to `damageEnemyShip`.
   */
  private damageEnemyShipModule(
    ship: SolarEnemyShip,
    placedId: string,
    rawDamage: number,
    bp: SolarShipBlueprint,
    geomCache: { modules: Array<{ worldX: number; worldY: number; placedId: string; boundsR: number }>; coreRadius: number },
    attackerFaction?: StationFaction | "player",
    attackerPos?: { x: number; y: number },
  ): void {
    const defs = SolarModuleRegistry.getModuleMap();
    const effStats = ship.effectiveStats ?? {
      totalThrustMs2: 0, scannerRangeKm: ship.scannerRangeKm,
      lockRangeBoostKm: 0, additionalTargetSlots: 0,
      damageReduction: 0, repairRatePerSec: 0, repairPowerCost: 0,
      turnRateBoostFrac: 0,
    };

    const { entries, newlyDestroyed } = ModuleHpSystem.applyHit(
      ship.moduleHp, placedId, rawDamage, effStats,
    );
    ship.moduleHp = entries;

    if (newlyDestroyed.length > 0) {
      const allDestroyed = ModuleHpSystem.cascadeDestruction(bp, newlyDestroyed, entries);
      ship.moduleHp = ModuleHpSystem.applyDestruction(entries, allDestroyed, bp, defs);

      // Spawn world items at each destroyed module's world position
      const kmPerBp = (4 + ship.sizeClass * 2) * 0.6 / geomCache.coreRadius;
      const hRad = (ship.heading * Math.PI) / 180;
      const cosH = Math.cos(hRad);
      const sinH = Math.sin(hRad);
      for (const destroyedId of allDestroyed) {
        const bpMod = bp.modules.find(m => m.placedId === destroyedId);
        if (!bpMod) continue;
        const gm = geomCache.modules.find(g => g.placedId === destroyedId);
        const wx = gm
          ? ship.position.x + (gm.worldX * cosH - gm.worldY * sinH) * kmPerBp
          : ship.position.x;
        const wy = gm
          ? ship.position.y + (gm.worldX * sinH + gm.worldY * cosH) * kmPerBp
          : ship.position.y;
        this.solarWorldItems.push({
          id: `item-${++this.solarWorldItemNextId}`,
          moduleDefId: bpMod.moduleDefId,
          position: { x: wx + (Math.random() - 0.5) * 2, y: wy + (Math.random() - 0.5) * 2 },
          ageMs: 0,
        });
      }

      const baseScanRangeKm = SOLAR_ENEMY_TYPES[ship.typeIdx]?.scannerRangeKm ?? ship.scannerRangeKm;
      ship.effectiveStats = ModuleHpSystem.computeEffectiveStats(
        bp, ship.moduleHp, defs, baseScanRangeKm,
      );
      ship.isStranded = !ModuleHpSystem.hasEngine(bp, ship.moduleHp, defs);
      ship.scannerRangeKm = ship.effectiveStats.scannerRangeKm;
    }

    // Sync ship.health from core-module HP fraction so death detection works
    const coreId = bp.modules[0]?.placedId;
    if (coreId) {
      const coreEntry = ship.moduleHp.find(e => e.placedId === coreId);
      if (coreEntry) {
        ship.health = (coreEntry.hp / Math.max(1, coreEntry.maxHp)) * ship.maxHealth;
      }
    }

    // Reuse existing sniping-reaction, provocation, and death logic (damage=0, health already set)
    this.damageEnemyShip(ship, 0, attackerFaction, attackerPos);
  }

  private fireSolarWeapon(playerPos: { x: number; y: number }, headingDeg: number): void {
    const headingRad = (headingDeg * Math.PI) / 180;
    const fwdX = Math.sin(headingRad);
    const fwdY = -Math.cos(headingRad);
    const maxRangeKm = SOLAR_COMBAT_CONFIG.AUTO_FIRE_RANGE_KM;
    const halfConeDeg = SOLAR_COMBAT_CONFIG.AUTO_FIRE_HALF_CONE_DEG;

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
      // No target in cone — fire each weapon into empty space ahead.
      this.fireWeaponsAtTarget(playerPos, {
        x: playerPos.x + fwdX * maxRangeKm,
        y: playerPos.y + fwdY * maxRangeKm,
      });
    }
  }

  private updatePlayerProjectiles(deltaMs: number, playerPos: { x: number; y: number }): void {
    const dtS = deltaMs / 1000;
    const survived: SolarPlayerProjectile[] = [];
    for (const proj of this.solarPlayerProjectiles) {
      proj.position.x += proj.velocity.x * dtS;
      proj.position.y += proj.velocity.y * dtS;
      proj.lifetimeMs -= deltaMs;
      if (proj.lifetimeMs <= 0) continue;

      // Homing guidance
      if (proj.weaponKind === "torpedo" && proj.missileTargetId) {
        const tgt = this.solarEnemyShips.find(s => s.id === proj.missileTargetId);
        if (tgt) {
          const desiredAngle = Math.atan2(
            tgt.position.y - proj.position.y,
            tgt.position.x - proj.position.x,
          );
          const curAngle = Math.atan2(proj.velocity.y, proj.velocity.x);
          let diff = desiredAngle - curAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = (proj.missileTurnRateRadS ?? 1) * dtS;
          const actualTurn = Math.max(-maxTurn, Math.min(maxTurn, diff));
          const newAngle = curAngle + actualTurn;
          const curSpeed = Math.hypot(proj.velocity.x, proj.velocity.y);
          // Turn drag: speed penalty proportional to how hard the missile is turning.
          const turnFrac = Math.abs(actualTurn) / (maxTurn || 1);
          const dragPenalty = curSpeed * MISSILE_TURN_DRAG * turnFrac * dtS;
          const newSpeed = Math.min(
            proj.missileMaxSpeed ?? 650,
            Math.max(50, curSpeed + (proj.missileAccel ?? 800) * dtS - dragPenalty),
          );
          proj.velocity.x = Math.cos(newAngle) * newSpeed;
          proj.velocity.y = Math.sin(newAngle) * newSpeed;
        }
      }
      // Trail sampling (all torpedoes)
      if (proj.weaponKind === "torpedo" && proj.trailPoints !== undefined) {
        proj.trailNextSampleMs = (proj.trailNextSampleMs ?? 0) - deltaMs;
        if (proj.trailNextSampleMs <= 0) {
          proj.trailNextSampleMs = 60;
          proj.trailPoints.push({ x: proj.position.x, y: proj.position.y });
          if (proj.trailPoints.length > 12) proj.trailPoints.shift();
        }
      }

      let hit = false;
      for (const ship of this.solarEnemyShips) {
        const bpForHit = this.getFactionBlueprint(ship.faction, ship.sizeClass);
        const geomCache = bpForHit
          ? this.getFactionBlueprintModules(ship.faction, ship.sizeClass)
          : undefined;

        if (bpForHit && geomCache && ship.moduleHp.length > 0) {
          // Per-module bounding circle hit detection
          const kmPerBp = (4 + ship.sizeClass * 2) * 0.6 / geomCache.coreRadius;
          const hRad = (ship.heading * Math.PI) / 180;
          const cosH = Math.cos(hRad);
          const sinH = Math.sin(hRad);
          for (const mod of geomCache.modules) {
            if (ship.moduleHp.find(e => e.placedId === mod.placedId && e.isDestroyed)) continue;
            const wox = ship.position.x + (mod.worldX * cosH - mod.worldY * sinH) * kmPerBp;
            const woy = ship.position.y + (mod.worldX * sinH + mod.worldY * cosH) * kmPerBp;
            const mr = mod.boundsR * kmPerBp;
            const dmx = proj.position.x - wox;
            const dmy = proj.position.y - woy;
            if (dmx * dmx + dmy * dmy <= mr * mr) {
              // Accuracy roll: large weapons miss small targets more often.
              const miss = GameManager.calcMissChance(proj.weaponSizeClass, ship.sizeClass);
              if (miss > 0 && Math.random() < miss) { hit = true; break; }
              this.damageEnemyShipModule(ship, mod.placedId, proj.damage, bpForHit, geomCache, "player", playerPos);
              hit = true;
              break;
            }
          }
        } else {
          // Fallback sphere for ships without module HP
          if (Math.hypot(ship.position.x - proj.position.x, ship.position.y - proj.position.y) < SOLAR_COMBAT_CONFIG.PROJECTILE_HIT_RADIUS_KM) {
            const miss = GameManager.calcMissChance(proj.weaponSizeClass, ship.sizeClass);
            if (miss === 0 || Math.random() >= miss) {
              this.damageEnemyShip(ship, proj.damage, "player", playerPos);
            }
            hit = true;
          }
        }
        if (hit) break;
      }
      if (!hit) survived.push(proj);
    }
    this.solarPlayerProjectiles = survived;
  }

  private updateFriendlyShips(deltaMs: number, playerPos: { x: number; y: number }): void {
    const FORMATION_OFFSETS = [
      { x: -60, y: 40 }, { x: 60, y: 40 }, { x: 0, y: 70 },
    ];
    const RETREAT_OFFSETS = [
      { x: -80, y: 120 }, { x: 80, y: 120 }, { x: 0, y: 150 },
    ];
    const dtS = deltaMs / 1000;
    const MAX_SPEED = 5000; // m/s
    const session = this.solarSystem!.getSessionState();

    let escortIdx = 0;
    for (let i = this.solarFriendlyShips.length - 1; i >= 0; i--) {
      const ship = this.solarFriendlyShips[i]!;

      // ── Rescue ship AI ────────────────────────────────────────────────────
      if (ship.role === "rescue") {
        // Cancel rescue if engines came back online (repair bot / docked repair)
        if (!this.isPlayerStranded()) {
          this.solarFriendlyShips.splice(i, 1);
          this.solarRescuePending = false;
          continue;
        }

        const stPos = ship.rescueStationPos!;
        const locId = ship.rescueLocationId ?? "station-earth-orbit";

        if (!ship.rescueTowing) {
          // Phase 1 — fly toward player at high speed
          const dx = playerPos.x - ship.position.x;
          const dy = playerPos.y - ship.position.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= 8) {
            ship.rescueTowing = true;
          } else {
            const spd = Math.min(8000, dist * 3000);
            ship.velocity.x = (dx / dist) * spd;
            ship.velocity.y = (dy / dist) * spd;
            ship.heading = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
            ship.position.x += ship.velocity.x * dtS / 1000;
            ship.position.y += ship.velocity.y * dtS / 1000;
          }
        } else {
          // Phase 2 — tow player toward station
          const dx = stPos.x - ship.position.x;
          const dy = stPos.y - ship.position.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 2) {
            const spd = Math.min(2500, dist * 1500);
            ship.velocity.x = (dx / dist) * spd;
            ship.velocity.y = (dy / dist) * spd;
            ship.heading = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
            ship.position.x += ship.velocity.x * dtS / 1000;
            ship.position.y += ship.velocity.y * dtS / 1000;
          } else {
            ship.velocity = { x: 0, y: 0 };
          }
          // Drag the player with the rescue ship
          session.playerPosition = { ...ship.position };
          session.playerVelocity = { x: 0, y: 0 };

          // Auto-dock when close enough to the station
          const distToStation = Math.hypot(stPos.x - ship.position.x, stPos.y - ship.position.y);
          const loc = session.currentSystem.locations.find(l => l.id === locId);
          const dockRadius = loc?.dockingRadius ?? 40;
          if (distToStation < dockRadius) {
            session.playerPosition = { ...stPos };
            session.playerVelocity = { x: 0, y: 0 };
            session.dockedLocationId = locId;
            session.nearbyLocations = [locId];
            this.solarFriendlyShips.splice(i, 1);
            this.solarRescuePending = false;
            this.dockedMenuSelection = 0;
            this.dockedMenuScrollOffset = 0;
            this.menuDebounceMs = 350;
            this.state.setScreen("docked");
            return;
          }
        }
        continue; // rescue ships don't use escort formation or auto-fire
      }

      // ── Escort ship AI ────────────────────────────────────────────────────
      // Bravery: trigger retreat when health drops below threshold
      if (!ship.retreating && ship.health / ship.maxHealth < (1 - ship.bravery)) {
        ship.retreating = true;
      }

      const offsets = ship.retreating ? RETREAT_OFFSETS : FORMATION_OFFSETS;
      const formOff = offsets[escortIdx % 3]!;
      escortIdx++;
      const targetPos = { x: playerPos.x + formOff.x, y: playerPos.y + formOff.y };
      const dx = targetPos.x - ship.position.x;
      const dy = targetPos.y - ship.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const speed = Math.min(MAX_SPEED, dist * 2000);
        ship.velocity.x = (dx / dist) * speed;
        ship.velocity.y = (dy / dist) * speed;
        const friendlyTargetH = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
        let fhdiff = ((friendlyTargetH - ship.heading + 540) % 360) - 180;
        ship.heading = (ship.heading + Math.sign(fhdiff) * Math.min(Math.abs(fhdiff), 180 * dtS) + 360) % 360;
      } else {
        ship.velocity = { x: 0, y: 0 };
      }
      ship.position.x += ship.velocity.x * dtS / 1000;
      ship.position.y += ship.velocity.y * dtS / 1000;

      if (ship.retreating) continue; // don't fire while retreating

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

      // Dormant stations wake when the player gets close.
      const distToBase = Math.hypot(playerPos.x - base.position.x, playerPos.y - base.position.y);
      if (base.alertLevel === "dormant" && distToBase <= base.alertRadiusKm) {
        base.alertLevel = "combat";
      }
      if (base.alertLevel !== "combat") continue;

      // ── Spawn ────────────────────────────────────────────────────────────
      const activeForBase = this.solarEnemyShips.filter((s) => s.baseId === base.id).length;
      const timeSinceSpawn = nowMs - base.lastSpawnMs;
      if (activeForBase < base.maxShips && timeSinceSpawn >= base.spawnIntervalMs) {
        const angle = Math.random() * Math.PI * 2;
        const rosterIdx = activeForBase % base.spawnRoster.length;
        const entry = base.spawnRoster[rosterIdx]!;
        const typeIdx = entry.typeIdx;
        const sizeClass = entry.sizeClass;
        const typeDef = SOLAR_ENEMY_TYPES[typeIdx]!;
        const loadout = ENEMY_WEAPON_LOADOUT[typeIdx]!;
        // Derive HP from blueprint core if available, else fall back to type default.
        const bpForSpawn = this.getFactionBlueprintModules(base.faction, sizeClass);
        const coreMod = bpForSpawn
          ? null // no need to look up — use sizeClass-scaled formula below
          : null;
        void coreMod;
        const health = typeDef.health * (1 + sizeClass * 0.5);
        const spawnBp = this.getFactionBlueprint(base.faction, sizeClass);
        const defs = SolarModuleRegistry.getModuleMap();
        const initModHp = spawnBp
          ? ModuleHpSystem.initModuleHp(spawnBp, defs)
          : [];
        const initEffStats = spawnBp && initModHp.length > 0
          ? ModuleHpSystem.computeEffectiveStats(spawnBp, initModHp, defs, typeDef.scannerRangeKm)
          : null;
        const newShip: SolarEnemyShip = {
          id: `enemy-${++this.solarEnemyNextId}`,
          baseId: base.id,
          faction: base.faction,
          name: entry.name,
          typeIdx,
          sizeClass,
          position: {
            x: base.position.x + Math.cos(angle) * base.spawnRadiusKm,
            y: base.position.y + Math.sin(angle) * base.spawnRadiusKm,
          },
          velocity: { x: 0, y: 0 },
          heading: 0,
          targetHeading: 0,
          health,
          maxHealth: health,
          weapon0CooldownMs: Math.random() * SOLAR_WEAPONS[loadout[0]]!.cooldownMs,
          weapon1CooldownMs: Math.random() * SOLAR_WEAPONS[loadout[1]]!.cooldownMs,
          scannerRangeKm: initEffStats?.scannerRangeKm ?? typeDef.scannerRangeKm,
          lastKnownThreatPos: null,
          bravery: typeDef.bravery,
          retreating: false,
          flankSide: (Math.random() < 0.5 ? -1 : 1) as -1 | 1,
          moduleHp: initModHp,
          effectiveStats: initEffStats,
          isStranded: false,
        };
        this.solarEnemyShips.push(newShip);
        base.lastSpawnMs = nowMs;
      }

      // ── Station turrets: track target barrel then fire within cone ────────
      {
        let turretTarget: { x: number; y: number } | null = null;
        let turretDist = base.turretRangeKm;

        for (const ship of this.solarEnemyShips) {
          if (!this.areFactionEnemies(base.faction, ship.faction)) continue;
          const d = Math.hypot(ship.position.x - base.position.x, ship.position.y - base.position.y);
          if (d < turretDist) { turretDist = d; turretTarget = ship.position; }
        }
        if (base.faction === "pirate" || (base.faction === "mars" && this.marsProvokedFactions.has("player"))) {
          const pd = Math.hypot(playerPos.x - base.position.x, playerPos.y - base.position.y);
          if (pd < turretDist && !this.solarPlayerDead) { turretDist = pd; turretTarget = playerPos; }
        }

        if (turretTarget) {
          // Rotate barrel toward target.
          const targetAngle = (Math.atan2(turretTarget.y - base.position.y, turretTarget.x - base.position.x) * 180) / Math.PI;
          const turnRate = GameManager.TURRET_TURN_RATE_DEG_S[base.sizeClass] ?? 120;
          const cone = GameManager.TURRET_FIRE_CONE_DEG[base.sizeClass] ?? 6;
          const maxStep = turnRate * (deltaMs / 1000);
          let diff = ((targetAngle - base.turretAimAngleDeg + 540) % 360) - 180;
          if (Math.abs(diff) <= maxStep) {
            base.turretAimAngleDeg = targetAngle;
          } else {
            base.turretAimAngleDeg = (base.turretAimAngleDeg + Math.sign(diff) * maxStep + 360) % 360;
          }
          // Fire only when barrel is on target.
          const aimDiff = Math.abs(((targetAngle - base.turretAimAngleDeg + 540) % 360) - 180);
          if (aimDiff <= cone && nowMs - base.lastTurretFireMs >= base.turretCooldownMs) {
            this.fireTurretAt(base, turretTarget, nowMs);
          }
        }
      }
    }

    // ── Ships: movement + firing ──────────────────────────────────────────
    for (const ship of this.solarEnemyShips) {
      const typeDef = SOLAR_ENEMY_TYPES[ship.typeIdx]!;
      const loadout = ENEMY_WEAPON_LOADOUT[ship.typeIdx]!;

      const targetResult = this.getEnemyTargetPos(ship, playerPos);
      const targetPos = targetResult;
      const targetId = targetResult?.id;

      // ── Bravery check: trigger retreat when health drops below threshold ──
      const healthFrac = ship.health / ship.maxHealth;
      if (!ship.retreating && healthFrac < (1 - ship.bravery)) {
        ship.retreating = true;
      }

      let moveX: number;
      let moveY: number;
      let dist: number;

      if (targetPos) {
        const dx = targetPos.x - ship.position.x;
        const dy = targetPos.y - ship.position.y;
        dist = Math.hypot(dx, dy) || 1;
        const toTargetX = dx / dist;
        const toTargetY = dy / dist;

        if (ship.retreating) {
          // Flee: move away from the threat, back toward base
          const base = this.solarEnemyBases.find(b => b.id === ship.baseId);
          const bx = base?.position.x ?? ship.position.x;
          const by = base?.position.y ?? ship.position.y;
          const toBaseX = bx - ship.position.x;
          const toBaseY = by - ship.position.y;
          const baseDist = Math.hypot(toBaseX, toBaseY) || 1;
          // Blend: mostly away from threat, partly toward base
          const awayX = -toTargetX * 0.7 + (toBaseX / baseDist) * 0.3;
          const awayY = -toTargetY * 0.7 + (toBaseY / baseDist) * 0.3;
          const awayMag = Math.hypot(awayX, awayY) || 1;
          moveX = awayX / awayMag;
          moveY = awayY / awayMag;
        } else {
          const optimal = typeDef.optimalRangeKm;
          const tooClose = dist < optimal * 0.75;
          const tooFar   = dist > optimal * 1.35;

          if (tooFar) {
            // Approach
            moveX = toTargetX;
            moveY = toTargetY;
          } else if (tooClose) {
            // Back off
            moveX = -toTargetX;
            moveY = -toTargetY;
          } else {
            // At optimal range — orbit/flank perpendicularly
            const perpX = -toTargetY * ship.flankSide;
            const perpY =  toTargetX * ship.flankSide;
            // Small range-correction component keeps the ship from drifting
            const rangeDelta = (dist - optimal) / (optimal * 0.3); // normalised -1..1
            const corrBlend = Math.min(0.4, Math.abs(rangeDelta) * 0.4);
            const rawX = perpX * (1 - corrBlend) + toTargetX * corrBlend * Math.sign(rangeDelta);
            const rawY = perpY * (1 - corrBlend) + toTargetY * corrBlend * Math.sign(rangeDelta);
            const mag = Math.hypot(rawX, rawY) || 1;
            moveX = rawX / mag;
            moveY = rawY / mag;
          }
        }
      } else {
        // No target: patrol by orbiting base.
        const base = this.solarEnemyBases.find(b => b.id === ship.baseId);
        const bx = base?.position.x ?? ship.position.x;
        const by = base?.position.y ?? ship.position.y;
        const toBaseX = bx - ship.position.x;
        const toBaseY = by - ship.position.y;
        const baseDist = Math.hypot(toBaseX, toBaseY) || 1;
        const orbitR = 50;
        if (baseDist > orbitR + 10) {
          moveX = toBaseX / baseDist;
          moveY = toBaseY / baseDist;
        } else {
          const ang = Math.atan2(ship.position.y - by, ship.position.x - bx);
          moveX = -Math.sin(ang) * 0.5;
          moveY = Math.cos(ang) * 0.5;
        }
        dist = baseDist;
      }

      // Stranded ships cannot apply thrust (but still drift and rotate)
      const accelMs2 = ship.isStranded ? 0 : typeDef.speed * 0.4;
      if (!ship.isStranded) {
        ship.velocity.x += moveX * accelMs2 * dtS;
        ship.velocity.y += moveY * accelMs2 * dtS;
      }

      const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
      if (speed > typeDef.speed) {
        ship.velocity.x = (ship.velocity.x / speed) * typeDef.speed;
        ship.velocity.y = (ship.velocity.y / speed) * typeDef.speed;
      }

      ship.position.x += (ship.velocity.x * dtS) / 1000;
      ship.position.y += (ship.velocity.y * dtS) / 1000;
      ship.targetHeading = (Math.atan2(moveX, -moveY) * 180) / Math.PI;
      // Smooth heading interpolation: turn at most 180°/s toward targetHeading
      const turnRateDeg = 180;
      let hdiff = ((ship.targetHeading - ship.heading + 540) % 360) - 180;
      const maxTurn = turnRateDeg * dtS;
      ship.heading = (ship.heading + Math.sign(hdiff) * Math.min(Math.abs(hdiff), maxTurn) + 360) % 360;

      // Repair bot tick
      if (ship.moduleHp.length > 0 && ship.effectiveStats && ship.effectiveStats.repairRatePerSec > 0) {
        ship.moduleHp = ModuleHpSystem.tickRepair(ship.moduleHp, ship.effectiveStats, deltaMs);
        // Sync health from core HP after repair
        const repBp = this.getFactionBlueprint(ship.faction, ship.sizeClass);
        const coreMod = repBp?.modules[0];
        if (coreMod) {
          const ce = ship.moduleHp.find(e => e.placedId === coreMod.placedId);
          if (ce) ship.health = (ce.hp / Math.max(1, ce.maxHp)) * ship.maxHealth;
        }
      }

      if (!targetPos || ship.retreating) continue; // no weapons fire when patrolling or fleeing

      // Weapon 0 fire
      ship.weapon0CooldownMs = Math.max(0, ship.weapon0CooldownMs - deltaMs);
      if (ship.weapon0CooldownMs === 0) {
        const wDef = SOLAR_WEAPONS[loadout[0]]!;
        if (dist <= wDef.range) {
          this.fireEnemyWeapon(ship, loadout[0], targetPos, dist, targetId);
          ship.weapon0CooldownMs = wDef.cooldownMs;
        }
      }

      // Weapon 1 fire
      ship.weapon1CooldownMs = Math.max(0, ship.weapon1CooldownMs - deltaMs);
      if (ship.weapon1CooldownMs === 0) {
        const wDef = SOLAR_WEAPONS[loadout[1]]!;
        if (dist <= wDef.range) {
          this.fireEnemyWeapon(ship, loadout[1], targetPos, dist, targetId);
          ship.weapon1CooldownMs = wDef.cooldownMs;
        }
      }
    }

    // ── Projectiles: movement + collision ────────────────────────────────
    const hitRadius = 5; // km — proximity hit
    this.solarDamageFlashMs = Math.max(0, this.solarDamageFlashMs - deltaMs);

    this.solarEnemyProjectiles = this.solarEnemyProjectiles.filter((p) => {
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) return false;

      p.position.x += (p.velocity.x * dtS) / 1000;
      p.position.y += (p.velocity.y * dtS) / 1000;

      // Homing guidance for enemy missiles
      if (p.isHoming) {
        const homingId = p.homingTargetId ?? "player";
        let tgtX: number, tgtY: number;
        if (homingId === "player" || homingId === "investigate") {
          tgtX = playerPos.x; tgtY = playerPos.y;
        } else {
          const tgtShip = this.solarEnemyShips.find(s => s.id === homingId);
          if (!tgtShip) { p.lifeMs = 0; return true; } // target gone — let missile expire
          tgtX = tgtShip.position.x; tgtY = tgtShip.position.y;
        }
        const tx = tgtX - p.position.x;
        const ty = tgtY - p.position.y;
        const desiredAngle = Math.atan2(ty, tx);
        const curAngle = Math.atan2(p.velocity.y, p.velocity.x);
        let diff = desiredAngle - curAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = (p.homingTurnRateRadS ?? 1) * dtS;
        const newAngle = curAngle + Math.max(-maxTurn, Math.min(maxTurn, diff));
        const curSpeed = Math.hypot(p.velocity.x, p.velocity.y);
        const newSpeed = Math.min(p.homingMaxSpeed ?? 25_000, curSpeed + (p.homingAccel ?? 800) * dtS);
        p.velocity.x = Math.cos(newAngle) * newSpeed;
        p.velocity.y = Math.sin(newAngle) * newSpeed;
        if (p.trailPoints !== undefined) {
          p.trailNextSampleMs = (p.trailNextSampleMs ?? 0) - deltaMs;
          if (p.trailNextSampleMs <= 0) {
            p.trailNextSampleMs = 60;
            p.trailPoints.push({ x: p.position.x, y: p.position.y });
            if (p.trailPoints.length > 12) p.trailPoints.shift();
          }
        }
      }

      // Cross-faction ship damage: any projectile can hit ships of enemy factions.
      // This also triggers Mars provocation when pirate shots graze Mars ships.
      for (const targetShip of this.solarEnemyShips) {
        if (targetShip.faction === p.sourceFaction) continue;
        // Pirate shots hit anyone (can accidentally provoke Mars).
        // Earth shots only hit pirates (and Mars if provoked).
        // Mars shots only hit if provoked.
        const isPirateShot = p.sourceFaction === "pirate";
        const canHit = isPirateShot || this.areFactionEnemies(p.sourceFaction, targetShip.faction);
        if (!canHit) continue;
        const dx2 = targetShip.position.x - p.position.x;
        const dy2 = targetShip.position.y - p.position.y;
        if (dx2 * dx2 + dy2 * dy2 <= hitRadius * hitRadius) {
          this.damageEnemyShip(targetShip, p.damage, p.sourceFaction);
          return false;
        }
      }

      // Station shield bubbles intercept hostile projectiles inside them.
      if (this.solarStationShields.size > 0) {
        for (const ss of this.solarStationShields.values()) {
          if (ss.hp <= 0) continue;
          const sdx = p.position.x - ss.worldX;
          const sdy = p.position.y - ss.worldY;
          if (sdx * sdx + sdy * sdy <= ss.radius * ss.radius) {
            ss.hp = Math.max(0, ss.hp - p.damage);
            ss.lastDamageMs = this.solarSystem?.getSessionState().gameTimeMs ?? 0;
            return false; // consumed by station shield
          }
        }
      }

      // Player collision: pirates and provoked factions can hit the player.
      const hitsPlayer = p.sourceFaction === "pirate"
        || (p.sourceFaction === "mars" && this.marsProvokedFactions.has("player"));
      if (!hitsPlayer || this.solarPlayerDead) return true;

      const dpx = p.position.x - playerPos.x;
      const dpy = p.position.y - playerPos.y;
      const distSq = dpx * dpx + dpy * dpy;

      // Projected shield intercepts hostile shots that cross the bubble boundary.
      if (
        this.solarProjShieldRadius > 0 &&
        this.solarProjShieldHp > 0 &&
        distSq <= this.solarProjShieldRadius * this.solarProjShieldRadius
      ) {
        this.solarProjShieldHp = Math.max(0, this.solarProjShieldHp - p.damage);
        this.solarProjShieldLastDamageMs = this.solarSystem?.getSessionState().gameTimeMs ?? 0;
        return false; // projectile consumed by shield
      }

      // Per-module player hit detection when the player has blueprint modules
      const playerCache = this.solarPlayerBlueprintCache;
      let playerModuleHit: string | null = null;
      if (playerCache && this.playerModuleHp.length > 0) {
        const playerSzClass = this.solarActiveBlueprintId
          ? (this.solarSavedBlueprints.get(this.solarActiveBlueprintId)?.sizeClass ?? 2)
          : 2;
        const kmPerBp = (4 + playerSzClass * 2) * 0.6 / playerCache.coreRadius;
        const hRad = ((this.solarSystem?.getSessionState().playerHeading ?? 0) * Math.PI) / 180;
        const cosH = Math.cos(hRad);
        const sinH = Math.sin(hRad);
        for (const mod of playerCache.modules) {
          if (this.playerModuleHp.find(e => e.placedId === mod.placedId && e.isDestroyed)) continue;
          const wox = playerPos.x + (mod.worldX * cosH - mod.worldY * sinH) * kmPerBp;
          const woy = playerPos.y + (mod.worldX * sinH + mod.worldY * cosH) * kmPerBp;
          const mr = mod.boundsR * kmPerBp;
          const dmx = p.position.x - wox;
          const dmy = p.position.y - woy;
          if (dmx * dmx + dmy * dmy <= mr * mr) { playerModuleHit = mod.placedId; break; }
        }
      } else if (distSq <= hitRadius * hitRadius) {
        playerModuleHit = "__sphere__"; // legacy sphere hit
      }

      if (playerModuleHit !== null) {
        let dmg = p.damage;
        if (this.solarPlayerShield > 0) {
          const absorbed = Math.min(this.solarPlayerShield, dmg);
          this.solarPlayerShield -= absorbed;
          dmg -= absorbed;
        }
        // Apply to module HP system when available
        if (playerModuleHit !== "__sphere__" && this.solarActiveBlueprintId) {
          const activeBp = this.solarSavedBlueprints.get(this.solarActiveBlueprintId);
          if (activeBp && this.playerEffectiveStats) {
            const defs = SolarModuleRegistry.getModuleMap();
            const { entries, newlyDestroyed } = ModuleHpSystem.applyHit(
              this.playerModuleHp, playerModuleHit, dmg, this.playerEffectiveStats,
            );
            this.playerModuleHp = entries;
            if (newlyDestroyed.length > 0) {
              const allDestroyed = ModuleHpSystem.cascadeDestruction(activeBp, newlyDestroyed, entries);
              this.playerModuleHp = ModuleHpSystem.applyDestruction(entries, allDestroyed, activeBp, defs);
              this.playerEffectiveStats = ModuleHpSystem.computeEffectiveStats(
                activeBp, this.playerModuleHp, defs, this.solarPlayerScannerRangeKm,
              );
              this.updatePlayerShipConfig();
            }
            // Sync health from core HP
            const coreId = activeBp.modules[0]?.placedId;
            const coreEntry = coreId ? this.playerModuleHp.find(e => e.placedId === coreId) : undefined;
            if (coreEntry) {
              this.solarPlayerHealth = (coreEntry.hp / Math.max(1, coreEntry.maxHp)) * this.solarPlayerMaxHealth;
            }
          }
          this.persistShipHpState();
        } else {
          this.solarPlayerHealth = Math.max(0, this.solarPlayerHealth - dmg);
        }
        this.solarPlayerLastDamageTimeMs = this.solarSystem?.getSessionState().gameTimeMs ?? 0;
        soundManager.solarHit();
        this.solarDamageFlashMs = 300;
        if (this.solarPlayerHealth <= 0 && this.solarDeathTimerMs === 0) {
          this.solarDeathTimerMs = GameManager.SOLAR_DEATH_DURATION_MS;
          this.solarPlayerDead = true;
          const deadSession = this.solarSystem?.getSessionState();
          const pPos = deadSession?.playerPosition ?? { x: 0, y: 0 };
          this.solarExplosions.push({ x: pPos.x, y: pPos.y, ageMs: 0, maxAgeMs: 5000, scale: 6 });
          this.solarExplosions.push({ x: pPos.x - 5, y: pPos.y + 3, ageMs: 150, maxAgeMs: 4500, scale: 3 });
          this.solarExplosions.push({ x: pPos.x + 6, y: pPos.y - 4, ageMs: 300, maxAgeMs: 4800, scale: 2.5 });
          // Drop ~75% of cargo at death position; the rest is lost.
          if (deadSession) {
            const toDrop: Array<[string, number]> = [];
            for (const [defId, qty] of deadSession.moduleInventory.entries()) {
              const dropQty = Math.ceil(qty * 0.75);
              toDrop.push([defId, dropQty]);
            }
            for (const [defId, dropQty] of toDrop) {
              for (let i = 0; i < dropQty; i++) this.spawnDrops(pPos, 1);
              const kept = (deadSession.moduleInventory.get(defId) ?? 0) - dropQty;
              if (kept > 0) deadSession.moduleInventory.set(defId, kept);
              else deadSession.moduleInventory.delete(defId);
            }
            this.persistSolarInventory(deadSession.moduleInventory);
          }
          this.solarLockedIds = new Set();
          this.solarFocusedId = null;
          this.solarSelectedId = null;
          // Remove any active warp effect immediately on death
          this.antiGravActive = false;
          this.warpDecayMs = 0;
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
    targetPos: { x: number; y: number },
    dist: number,
    targetId?: string,
  ): void {
    const wDef = SOLAR_WEAPONS[weaponIdx]!;
    const dx = targetPos.x - ship.position.x;
    const dy = targetPos.y - ship.position.y;
    const dn = dist || 1;
    // Slight inaccuracy for gameplay feel (±5° spread)
    const spread = (Math.random() - 0.5) * 0.175;
    const cosS = Math.cos(spread);
    const sinS = Math.sin(spread);
    const dirX = (dx / dn) * cosS - (dy / dn) * sinS;
    const dirY = (dx / dn) * sinS + (dy / dn) * cosS;

    const HOMING_WEAPON_INDICES = new Set([3, 4, 6]);
    const ep: SolarEnemyProjectile = {
      id: `proj-${++this.solarEnemyNextId}`,
      weaponIdx,
      sourceFaction: ship.faction,
      position: { x: ship.position.x, y: ship.position.y },
      velocity: { x: dirX * wDef.speed, y: dirY * wDef.speed },
      lifeMs: (wDef.range / wDef.speed) * 1_000_000,
      damage: wDef.damage,
    };
    if (HOMING_WEAPON_INDICES.has(weaponIdx)) {
      ep.isHoming = true;
      ep.homingTargetId = targetId ?? "player";
      // Use ship's sizeClass as missile level so bigger enemies fire faster missiles.
      // MISSILE_LEVEL_STATS are in km/s; multiply by 1000 to match enemy velocity units (m/s).
      const lvl = Math.max(1, Math.min(9, ship.sizeClass));
      const mstats = MISSILE_LEVEL_STATS[lvl - 1]!;
      ep.homingAccel       = mstats.accel          * 0.8 * 1000;
      ep.homingMaxSpeed    = mstats.maxSpeed        * 0.75 * 1000;
      ep.homingTurnRateRadS = mstats.turnRateRadS   * 0.9;
      ep.trailPoints = [];
      ep.trailNextSampleMs = 60;
      ep.weaponTrailColor = weaponIdx === 3 ? 0xff6633 : weaponIdx === 4 ? 0xff44ff : 0x44ffcc;
    }
    this.solarEnemyProjectiles.push(ep);
  }

  private fireTurretAt(base: SolarEnemyBase, targetPos: { x: number; y: number }, nowMs: number): void {
    const wDef = SOLAR_WEAPONS[base.turretWeaponIdx]!;
    const dx = targetPos.x - base.position.x;
    const dy = targetPos.y - base.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.solarEnemyProjectiles.push({
      id: `turret-${++this.solarEnemyNextId}`,
      weaponIdx: base.turretWeaponIdx,
      sourceFaction: base.faction,
      position: { x: base.position.x, y: base.position.y },
      velocity: { x: (dx / dist) * wDef.speed, y: (dy / dist) * wDef.speed },
      lifeMs: (base.turretRangeKm / wDef.speed) * 1_000_000,
      damage: base.turretDamage,
    });
    base.lastTurretFireMs = nowMs;
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
    const thrustFwd = input.thrustForward === true;
    const turning = input.turnLeft === true || input.turnRight === true;
    const strafing = input.strafeLeft === true || input.strafeRight === true;
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
    // Up/Down navigate between RESUME / QUIT TO MENU / SOUND
    if (this.input.wasPressed("ArrowUp") || input.swipeUpPulse)
      this.solarPauseSelection = (this.solarPauseSelection - 1 + 3) % 3;
    if (this.input.wasPressed("ArrowDown") || input.swipeDownPulse)
      this.solarPauseSelection = (this.solarPauseSelection + 1) % 3;

    // Tap on one of three buttons (panel centred at height/2, buttons at +72/+140/+208 from panelY)
    if (input.pointerDownPulse && this.menuDebounceMs === 0) {
      const tap = input.pointerDownPulse;
      const halfH = this.height / 2;
      // panelHeight=300, panelY=halfH-150; btn tops at halfH-78, halfH-10, halfH+58 (btnH=52)
      const zone = (y: number): number | null => {
        if (y >= halfH - 78 && y < halfH - 26) return 0;
        if (y >= halfH - 10 && y < halfH + 42) return 1;
        if (y >= halfH + 58 && y < halfH + 110) return 2;
        return null;
      };
      const z = zone(tap.y);
      if (z !== null) {
        this.solarPauseSelection = z;
        this.executeSolarPauseAction(z);
        return;
      }
    }

    if ((this.wasMenuConfirmPressed() || this.wasMenuBackPressed()) && this.menuDebounceMs === 0) {
      this.executeSolarPauseAction(this.solarPauseSelection);
    }
  }

  private executeSolarPauseAction(idx: number): void {
    soundManager.menuConfirm();
    if (idx === 0) {
      soundManager.setThrusterActive(false);
      this.solarPauseSelection = 0;
      this.state.setScreen("solar-system");
    } else if (idx === 1) {
      soundManager.setThrusterActive(false);
      this.solarPauseSelection = 0;
      this.state.setScreen("main-menu");
    } else {
      soundManager.init();
      soundManager.toggleMute();
      return; // stay in pause so user can see the state change
    }
    this.menuDebounceMs = 350;
  }

  private getDockedMenuItems(): readonly string[] {
    const dockedLocId = this.solarSystem?.getSessionState().dockedLocationId ?? null;
    const activeNpc = this.getDockedNpc();
    const isEarthStation = dockedLocId === "station-earth-orbit";
    const hasShipyard = isEarthStation || dockedLocId === "outpost-mars";
    const npcItems = activeNpc ? ["Talk to NPC"] : [];
    const escortItem = this.solarFriendlyShips.length < 3 ? ["Launch Escort"] : [];
    const cheatItems = isEarthStation ? ["Add 100k Credits"] : [];
    if (hasShipyard) {
      return [...npcItems, "Inventory", "Crew", "Repair Bay", ...cheatItems, ...escortItem, "Shop", "Shipyard", "My Ships", "Galaxy Map", "Undock"];
    }
    return [...npcItems, "Inventory", "Crew", "Repair Bay", ...escortItem, "Shop", "My Ships", "Galaxy Map", "Undock"];
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

    // Keep scroll window tracking the selection (6 items visible at 80px each from y=200).
    const DOCK_MAX_VISIBLE = 6;
    if (this.dockedMenuSelection < this.dockedMenuScrollOffset) {
      this.dockedMenuScrollOffset = this.dockedMenuSelection;
    } else if (this.dockedMenuSelection >= this.dockedMenuScrollOffset + DOCK_MAX_VISIBLE) {
      this.dockedMenuScrollOffset = this.dockedMenuSelection - DOCK_MAX_VISIBLE + 1;
    }

    // Tap on a menu item directly — itemStartY=200, itemSpacing=80 (matches renderer).
    const input = this.input.poll();
    if (input.pointerDownPulse && this.menuDebounceMs === 0) {
      const ITEM_START_Y = 200;
      const ITEM_SPACING = 80;
      const click = input.pointerDownPulse;
      const visIdx = Math.floor((click.y - ITEM_START_Y) / ITEM_SPACING);
      if (visIdx >= 0 && visIdx < DOCK_MAX_VISIBLE) {
        const absIdx = this.dockedMenuScrollOffset + visIdx;
        if (absIdx >= 0 && absIdx < menuItems.length) {
          this.dockedMenuSelection = absIdx;
          this.menuSelection = absIdx;
          this.executeDockedMenuAction(menuItems[absIdx]!);
          return;
        }
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
    if (item === "Crew") {
      this.crewHandler.reset();
      this.state.setScreen("solar-crew");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    if (item === "Talk to NPC") {
      const npc = this.getDockedNpc();
      if (npc) {
        this.npcHandler.activeTalkNpcId = npc.id;
        this.menuSelection = 0;
        this.state.setScreen("solar-npc-talk");
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
      }
      return;
    }
    if (item === "Inventory") {
      this.invHandler.fromScreen = "docked";
      this.invHandler.panel = "ship";
      this.invHandler.shipSel = 0;
      this.invHandler.stationSel = 0;
      this.invHandler.shipScroll = 0;
      this.invHandler.stationScroll = 0;
      this.invHandler.ctxOpen = false;
      this.invHandler.ctxSel = 0;
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      this.state.setScreen("solar-inventory");
      return;
    }
    if (item === "Add 100k Credits") {
      const session = this.solarSystem?.getSessionState();
      if (session) {
        session.solarCredits += 100_000;
        this.dockedStatusMsg = "+100,000 ¢ ADDED";
        this.dockedStatusMs = 2000;
        this.persistSolarInventory(session.moduleInventory);
      }
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
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
          bravery: 0.6,
          retreating: false,
          role: "escort",
          rescueTowing: false,
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
      // Also repair all destroyed modules for free when docked at Repair Bay
      const destroyedCount = this.playerModuleHp.filter(e => e.isDestroyed).length;
      if (destroyedCount > 0) {
        this.playerModuleHp = this.playerModuleHp.map(e =>
          e.isDestroyed ? { ...e, hp: e.maxHp, isDestroyed: false } : e,
        );
        this.solarPlayerBlueprintCache = null;
        this.applyActiveSolarBlueprint();
        this.persistShipHpState();
      }
      this.dockedStatusMsg = destroyedCount > 0
        ? `Hull repaired — ${destroyedCount} module${destroyedCount > 1 ? "s" : ""} restored.`
        : "Hull repaired — shields restored.";
      this.dockedStatusMs = 1500;
    } else if (item === "Shop") {
      const session = this.solarSystem?.getSessionState();
      const dockedLocId = session?.dockedLocationId ?? null;
      if (dockedLocId) {
        const system = this.solarSystem!.getCurrentSystem();
        const loc = system.locations.find((l) => l.id === dockedLocId);
        this.shopManager.ensureShop(dockedLocId, loc?.controllingFaction ?? "terran-federation");
        this.shopHandler.menuSelection = 0;
        this.shopHandler.scrollOffset = 0;
        this.shopHandler.searchText = "";
        this.shopHandler.statusMsg = null;
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
    const npc = this.npcHandler.activeTalkNpcId ? NPCRegistry.getNPC(this.npcHandler.activeTalkNpcId) : undefined;
    if (!npc) { this.state.setScreen("docked"); return; }

    const items = ["Missions", "Leave"];
    this.stepMenuSelection(items.length);

    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.npcHandler.activeTalkNpcId = null;
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
        this.npcHandler.activeTalkNpcId = null;
        this.state.setScreen("docked");
        this.menuSelection = 0;
        this.menuDebounceMs = 350;
      }
    }
  }

  private updateMissionList(_deltaMs: number): void {
    const npcId = this.npcHandler.activeTalkNpcId;
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
        this.npcHandler.activeMissionDetailId = entry.spec.id;
        this.menuSelection = 0;
        this.state.setScreen("solar-mission-detail");
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
      }
    }
  }

  private updateMissionDetail(_deltaMs: number): void {
    const missionId = this.npcHandler.activeMissionDetailId;
    const npcId = this.npcHandler.activeTalkNpcId;
    if (!missionId || !npcId) { this.state.setScreen("solar-missions"); return; }
    const spec = this.getMissionSpec(missionId);
    if (!spec) { this.state.setScreen("solar-missions"); return; }

    const items = ["Accept Mission", "Back"];
    this.stepMenuSelection(items.length);

    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.npcHandler.activeMissionDetailId = null;
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
          this.npcHandler.activeMissionDetailId = null;
          this.menuSelection = 0;
          this.state.setScreen("solar-missions");
          this.menuDebounceMs = MENU_DEBOUNCE_MS;
        } catch {
          // Already accepted or unknown — just go back
          this.npcHandler.activeMissionDetailId = null;
          this.menuSelection = 0;
          this.state.setScreen("solar-missions");
          this.menuDebounceMs = 350;
        }
      } else {
        this.npcHandler.activeMissionDetailId = null;
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

  // Header button layout (right panel, x=800..1280)
  // SAVE:  x=1196..1232, y=8..36  (save without activating)
  // USE:   x=1234..1272, y=8..36  (save and set as active ship)
  // NEW:   x=1130..1190, y=8..36
  // RENAME zone: click ship name text area x=820..1126, y=4..40
  private static readonly SB_SAVE_X = 1196;
  private static readonly SB_SAVE_W = 36;
  private static readonly SB_USE_X = 1234;
  private static readonly SB_NEW_X = 1130;
  private static readonly SB_NEW_W = 58;
  // REPAIR ALL button: left panel, bottom area (x=16..266, y=630..662)
  private static readonly SB_REPAIR_X = 16;
  private static readonly SB_REPAIR_Y = 630;
  private static readonly SB_REPAIR_W = 250;
  private static readonly SB_REPAIR_H = 32;

  // CALL RESCUE / BEING TOWED button: bottom-center of solar system HUD
  private static readonly RESCUE_BTN_X = 490;
  private static readonly RESCUE_BTN_Y = 648;
  private static readonly RESCUE_BTN_W = 300;
  private static readonly RESCUE_BTN_H = 36;

  private updateSolarShipBuilder(deltaMs: number): void {
    this.solarShipBuilderMgr.tick(deltaMs);
    const input = this.input.poll();
    if (input.pointer) {
      this.solarShipBuilderMgr.onPointerMove(input.pointer.x, input.pointer.y);
    }

    // Scroll wheel zoom (only when cursor is on the canvas side)
    if (input.zoomDelta && (input.pointer?.x ?? 0) < ShipBuilderManager.LEFT_PANEL_W) {
      this.solarShipBuilderMgr.adjustZoom(
        input.zoomDelta * 0.4,
        input.pointer?.x,
        input.pointer?.y,
      );
    }

    // Zoom bar drag
    const zb = GameManager.SB_ZOOM_BAR;
    if (input.pointerDownPulse) {
      const { x, y } = input.pointerDownPulse;
      if (x >= zb.x && x <= zb.x + zb.w && y >= zb.top && y <= zb.bottom) {
        this.sbZoomBarDragging = true;
      }
    }
    if (this.sbZoomBarDragging && input.pointerHeld && input.pointer) {
      const frac = 1 - Math.max(0, Math.min(1, (input.pointer.y - zb.top) / (zb.bottom - zb.top)));
      const newZoom = 0.2 * Math.pow(5.0 / 0.2, frac);
      this.solarShipBuilderMgr.setZoomLevel(newZoom);
    }
    if (!input.pointerHeld) this.sbZoomBarDragging = false;

    const click = input.pointerDownPulse ?? null;
    const session = this.solarSystem?.getSessionState();
    const locId = session?.dockedLocationId ?? null;
    const inv = session?.moduleInventory ?? new Map<string, number>();

    // ── Rename mode: intercept all keyboard input ──────────────────────────
    if (this.solarShipBuilderMgr.isRenaming()) {
      const enterPressed = input.menuConfirm && this.menuDebounceMs === 0;
      const escPressed = this.wasMenuBackPressed() && this.menuDebounceMs === 0;
      this.solarShipBuilderMgr.handleRenameInput(
        input.typedText ?? "",
        input.backspacePulse ?? false,
        enterPressed,
        escPressed,
      );
      if (enterPressed || escPressed) this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    // ── Core picker: ESC clears search or dismisses ────────────────────────
    if (this.solarShipBuilderMgr.isCorePicking()) {
      // Text search
      const typed = input.typedText ?? "";
      if (typed) this.solarShipBuilderMgr.typeCorePickerSearch(typed);
      if (input.backspacePulse && this.solarShipBuilderMgr.getCorePickerSearch().length > 0) {
        this.solarShipBuilderMgr.backspaceCorePickerSearch();
      }
      if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
        if (this.solarShipBuilderMgr.getCorePickerSearch()) {
          this.solarShipBuilderMgr.backspaceCorePickerSearch();
          // clear whole search
          while (this.solarShipBuilderMgr.getCorePickerSearch().length > 0) {
            this.solarShipBuilderMgr.backspaceCorePickerSearch();
          }
        } else {
          this.solarShipBuilderMgr.closeCorePicker();
        }
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
        return;
      }
      const CORE_ROW_H = 60;
      const CORE_LIST_Y = 160; // below search bar
      const CORE_MAX_VISIBLE = Math.floor((this.height - CORE_LIST_Y - 60) / CORE_ROW_H);
      // Up/Down scroll
      if (this.input.wasPressed("ArrowUp") && this.menuDebounceMs === 0) {
        this.solarShipBuilderMgr.scrollCorePicker(-1, CORE_MAX_VISIBLE);
        this.menuDebounceMs = 120;
      }
      if (this.input.wasPressed("ArrowDown") && this.menuDebounceMs === 0) {
        this.solarShipBuilderMgr.scrollCorePicker(1, CORE_MAX_VISIBLE);
        this.menuDebounceMs = 120;
      }
      // Tab toggles show-all
      if (input.cycleTargetPulse && this.menuDebounceMs === 0) {
        this.solarShipBuilderMgr.toggleCorePickerShowAll();
        this.menuDebounceMs = 200;
      }
      // Click (left panel)
      if (click && click.x < GameManager.SB_SPLIT && this.menuDebounceMs === 0) {
        // "Show all / Owned only" toggle button (x=424–544, y=72–96)
        if (click.x >= 424 && click.x <= 544 && click.y >= 72 && click.y <= 96) {
          this.solarShipBuilderMgr.toggleCorePickerShowAll();
          this.menuDebounceMs = 200;
        } else {
          const rd = this.solarShipBuilderMgr.getRenderData(inv, session?.solarCredits ?? 0);
          const picker = rd?.corePicker;
          if (picker) {
            const visIdx = Math.floor((click.y - CORE_LIST_Y) / CORE_ROW_H);
            const absIdx = rd.corePickerScrollOffset + visIdx;
            if (visIdx >= 0 && visIdx < CORE_MAX_VISIBLE && absIdx < picker.length) {
              const item = picker[absIdx]!;
              const delta = this.solarShipBuilderMgr.selectCore(item.defId, inv);
              if (delta) this.adjustModuleInventory(delta.moduleDefId, delta.delta);
              this.menuDebounceMs = MENU_DEBOUNCE_MS;
            }
          }
        }
      }
      return;
    }

    // ── ESC → back to docked ───────────────────────────────────────────────
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.solarShipBuilderMgr.close();
      this.state.setScreen("docked");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    // ── Core rotation: Q = CCW 5°, E = CW 5° ────────────────────────────
    if (this.input.wasPressed("KeyQ") && this.menuDebounceMs === 0) {
      this.solarShipBuilderMgr.rotateCore(-Math.PI / 36);
      this.menuDebounceMs = 80;
    }
    if (this.input.wasPressed("KeyE") && this.menuDebounceMs === 0) {
      this.solarShipBuilderMgr.rotateCore(Math.PI / 36);
      this.menuDebounceMs = 80;
    }

    // ── REPAIR ALL button (left panel, bottom) ──────────────────────────
    if (click && this.playerModuleHp.some(e => e.isDestroyed) &&
        click.x >= GameManager.SB_REPAIR_X && click.x < GameManager.SB_REPAIR_X + GameManager.SB_REPAIR_W &&
        click.y >= GameManager.SB_REPAIR_Y && click.y < GameManager.SB_REPAIR_Y + GameManager.SB_REPAIR_H) {
      this.repairAllModules();
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    // ── SAVE button (save without activating) ────────────────────────────
    if (click && click.x >= GameManager.SB_SAVE_X && click.x < GameManager.SB_SAVE_X + GameManager.SB_SAVE_W && click.y >= 4 && click.y <= 40) {
      const bp = this.solarShipBuilderMgr.getBlueprint();
      if (bp) this.saveSolarBlueprint(bp);
      return;
    }
    // ── USE button (save and set as active ship) ──────────────────────────
    if (click && click.x >= GameManager.SB_USE_X && click.x <= 1276 && click.y >= 4 && click.y <= 40) {
      const bp = this.solarShipBuilderMgr.getBlueprint();
      if (bp) {
        this.saveSolarBlueprint(bp);
        this.solarActiveBlueprintId = bp.id || `ship-${this.solarBlueprintCounter}`;
        this.solarPlayerBlueprintCache = null;
        this.applyActiveSolarBlueprint();
        this.solarShipBuilderMgr.setStatus(`ACTIVE: ${bp.name.toUpperCase()}`);
      }
      return;
    }

    // ── NEW button ───────────────────────────────────────────────────────
    if (click && click.x >= GameManager.SB_NEW_X && click.x < GameManager.SB_NEW_X + GameManager.SB_NEW_W && click.y >= 8 && click.y <= 36) {
      this.solarShipBuilderMgr.openCorePicker(inv);
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    // ── RENAME: click the ship name area ─────────────────────────────────
    if (click && click.x >= GameManager.SB_SPLIT + 20 && click.x < GameManager.SB_NEW_X && click.y >= 4 && click.y <= 40) {
      this.solarShipBuilderMgr.enterRenameMode();
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    // Right-click on left panel → deselect or remove
    const rClick = input.pointerRightClickPulse ?? null;
    if (rClick && rClick.x < GameManager.SB_SPLIT) {
      for (const delta of this.solarShipBuilderMgr.onRightClick(rClick.x, rClick.y)) {
        this.adjustModuleInventory(delta.moduleDefId, delta.delta);
      }
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
            inv,
            session?.solarCredits ?? 0,
            this.getShipyardShopEntries(),
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
        this.solarShipBuilderMgr.onPointerDown(click.x, click.y, inv);
        return;
      }

      // ── Left panel: place selected module at snap ──────────────────────
      const delta = this.solarShipBuilderMgr.onPointerDown(click.x, click.y, inv);
      if (delta) this.adjustModuleInventory(delta.moduleDefId, delta.delta);
    }
  }

  // ── Solar ship blueprints ─────────────────────────────────────────────────

  private computeBlueprintModules(bp: SolarShipBlueprint): {
    modules: Array<{
      vertices: Array<{ x: number; y: number }>;
      worldX: number; worldY: number;
      moduleType: string; partKind: string; grade: number;
      placedId: string; moduleDefId: string; boundsR: number;
    }>;
    coreRadius: number;
  } {
    const defs = SolarModuleRegistry.getModuleMap();
    const geometries = GeometryEngine.deriveAllGeometries(bp.modules, defs, bp.coreSideCount, bp.coreRotationRad ?? 0);
    const coreDef = defs.get(bp.modules[0]?.moduleDefId ?? "");
    const coreRadius = coreDef
      ? GeometryEngine.circumradius(bp.coreSideCount, coreDef.shape.sideLengthPx)
      : 20;
    const modules = bp.modules.flatMap((m) => {
      const geom = geometries.get(m.placedId);
      const def = defs.get(m.moduleDefId);
      if (!geom || !def) return [];
      const vertices = def.shape.verts
        ? GeometryEngine.buildCustomVertices(
            def.shape.verts, def.shape.sideLengthPx, geom.worldX, geom.worldY,
            geom.rotationRad, m.ownSideIndex ?? undefined, def.shape.sides,
          ).map(v => ({ x: v.x, y: v.y }))
        : geom.vertices.map(v => ({ x: v.x, y: v.y }));
      // Bounding circle: max distance from centre to any vertex
      const cx = geom.worldX, cy = geom.worldY;
      const boundsR = vertices.reduce((r, v) => Math.max(r, Math.hypot(v.x - cx, v.y - cy)), 0) || 4;
      return [{
        vertices, worldX: geom.worldX, worldY: geom.worldY,
        moduleType: def.type as string, partKind: def.partKind as string, grade: def.sizeClass,
        placedId: m.placedId, moduleDefId: m.moduleDefId, boundsR,
      }];
    });
    return { modules, coreRadius };
  }

  private getBlueprintModulesById(blueprintId: string, getBp: () => import("../types/solarShipBuilder").SolarShipBlueprint | undefined) {
    if (!this.blueprintGeometryCache.has(blueprintId)) {
      const bp = getBp();
      if (bp) this.blueprintGeometryCache.set(blueprintId, this.computeBlueprintModules(bp));
    }
    return this.blueprintGeometryCache.get(blueprintId);
  }

  private getFactionBlueprint(faction: StationFaction, sizeClass: number): SolarShipBlueprint | undefined {
    if (faction === "earth") return getEarthBlueprint(sizeClass);
    if (faction === "mars") return getMarsBlueprint(sizeClass);
    return getPirateBlueprint(sizeClass);
  }

  private getFactionBlueprintModules(faction: StationFaction, sizeClass: number) {
    if (faction === "earth") {
      const bp = getEarthBlueprint(sizeClass);
      return bp ? this.getBlueprintModulesById(bp.id, () => bp) : undefined;
    }
    if (faction === "mars") {
      const bp = getMarsBlueprint(sizeClass);
      return bp ? this.getBlueprintModulesById(bp.id, () => bp) : undefined;
    }
    const bp = getPirateBlueprint(sizeClass);
    return bp ? this.getBlueprintModulesById(bp.id, () => bp) : undefined;
  }

  private getStationBlueprintModules(faction: StationFaction, blueprintId: string) {
    return this.getBlueprintModulesById(blueprintId, () => {
      const all = faction === "earth" ? EARTH_BLUEPRINTS
        : faction === "mars" ? MARS_BLUEPRINTS
        : PIRATE_BLUEPRINTS;
      return all.find(b => b.id === blueprintId);
    });
  }

  /** True when ships of faction `a` should attack ships of faction `b`. */
  private areFactionEnemies(a: StationFaction, b: StationFaction): boolean {
    if (a === b) return false;
    if (a === "pirate" && b === "earth") return true;
    if (a === "earth" && b === "pirate") return true;
    if (a === "mars") return this.marsProvokedFactions.has(b);
    if (b === "mars") return this.marsProvokedFactions.has(a);
    return false;
  }

  /**
   * Returns the best target position for `ship` this frame, or null if
   * the ship has no valid target (neutral / no enemies in system).
   * "player" is passed explicitly so it can be included/excluded by faction.
   */
  private getEnemyTargetPos(
    ship: SolarEnemyShip,
    playerPos: { x: number; y: number },
  ): { x: number; y: number; id: string } | null {
    const base = this.solarEnemyBases.find(b => b.id === ship.baseId);
    const defR = base?.defenseRadiusKm ?? 0;

    // Ships with a defense perimeter retreat when they drift outside it.
    if (defR > 0 && base) {
      const distFromBase = Math.hypot(ship.position.x - base.position.x, ship.position.y - base.position.y);
      if (distFromBase > defR) {
        return null; // patrol code will send them back to base
      }
    }

    let nearest: { x: number; y: number; id: string } | null = null;
    let nearestDist = Infinity;

    for (const other of this.solarEnemyShips) {
      if (other.id === ship.id) continue;
      if (!this.areFactionEnemies(ship.faction, other.faction)) continue;
      // Ships with a perimeter only engage enemies that have entered it.
      if (defR > 0 && base) {
        const enemyDistFromBase = Math.hypot(other.position.x - base.position.x, other.position.y - base.position.y);
        if (enemyDistFromBase > defR) continue;
      }
      const d = Math.hypot(other.position.x - ship.position.x, other.position.y - ship.position.y);
      if (d < nearestDist) { nearestDist = d; nearest = { ...other.position, id: other.id }; }
    }

    // Pirates / provoked Mars chase the player only if within scanner range.
    const playerDist = Math.hypot(playerPos.x - ship.position.x, playerPos.y - ship.position.y);
    const canSeePlayer = playerDist <= ship.scannerRangeKm;
    if (canSeePlayer) ship.lastKnownThreatPos = null; // clear investigate once player visible

    const pirate = ship.faction === "pirate";
    const marsHostileToPlayer = ship.faction === "mars" && this.marsProvokedFactions.has("player");
    if ((pirate || marsHostileToPlayer) && canSeePlayer) {
      if (playerDist < nearestDist) { nearestDist = playerDist; nearest = { ...playerPos, id: "player" }; }
    }

    // Sniping investigation: fly toward the last known threat position when the
    // attacker was out of scanner range.  Clear once the ship arrives (~30 km).
    if (nearest === null && ship.lastKnownThreatPos !== null) {
      const distToThreat = Math.hypot(
        ship.lastKnownThreatPos.x - ship.position.x,
        ship.lastKnownThreatPos.y - ship.position.y,
      );
      if (distToThreat < 30) {
        ship.lastKnownThreatPos = null;
      } else {
        nearest = { ...ship.lastKnownThreatPos, id: "investigate" };
      }
    }

    return nearest;
  }

  private saveSolarBlueprint(bp: SolarShipBlueprint): void {
    const id = bp.id || `ship-${++this.solarBlueprintCounter}`;
    const saved: SolarShipBlueprint = { ...bp, id };
    this.solarSavedBlueprints.set(id, saved);
    if (!this.solarActiveBlueprintId) this.solarActiveBlueprintId = id;
    if (!this.e2eMode) {
      // Persist to storage.
      this.solarBlueprintStore.upsert(saved);
      this.solarBlueprintStore.setActiveId(this.solarActiveBlueprintId);
      try { this.solarBlueprintStore.save(); } catch { /* best-effort */ }
    }
    // Invalidate player blueprint cache so updated geometry is picked up next frame.
    this.solarPlayerBlueprintCache = null;
    this.solarShipBuilderMgr.setStatus(`SAVED: ${bp.name.toUpperCase()}`);
  }

  private setActiveSolarBlueprint(id: string): void {
    if (this.solarSavedBlueprints.has(id)) {
      this.solarActiveBlueprintId = id;
      if (!this.e2eMode) {
        this.solarBlueprintStore.setActiveId(id);
        try { this.solarBlueprintStore.save(); } catch { /* best-effort */ }
      }
    }
  }

  /**
   * Compute the player's effective scanner range from their active blueprint.
   * Core provides the baseline; sensor modules (ext-sensor-*) add to it.
   */
  private computePlayerScannerRange(): number {
    const bp = this.solarActiveBlueprintId
      ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId)
      : null;
    if (!bp) return SOLAR_COMBAT_CONFIG.PLAYER_SENSOR_RANGE_KM;
    let range = 0;
    for (const placed of bp.modules) {
      const def = SolarModuleRegistry.getModule(placed.moduleDefId);
      if (!def) continue;
      const sr = def.stats.sensorRangeKm;
      if (sr) range += sr;
    }
    return range > 0 ? range : SOLAR_COMBAT_CONFIG.PLAYER_SENSOR_RANGE_KM;
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
    this.solarPlayerScannerRangeKm = this.computePlayerScannerRange();
    this.solarPlayerShieldRechargeRate = this.computePlayerShieldRechargeRate();
    this.applyProjectedShieldStats();
    this.updatePlayerShipConfig();
  }

  private computePlayerShieldRechargeRate(): number {
    const bp = this.solarActiveBlueprintId
      ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId)
      : null;
    if (!bp) return 0;
    let rate = 0;
    for (const placed of bp.modules) {
      const def = SolarModuleRegistry.getModule(placed.moduleDefId);
      if (!def) continue;
      const r = def.stats.shieldRechargeRatePerSec;
      if (r) rate += r;
    }
    return rate;
  }

  private applyProjectedShieldStats(): void {
    const bp = this.solarActiveBlueprintId
      ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId)
      : null;
    if (!bp) {
      this.solarProjShieldRadius = 0;
      this.solarProjShieldMaxHp = 0;
      this.solarProjShieldHp = 0;
      this.solarProjShieldRechargeRate = 0;
      return;
    }
    let radius = 0;
    let capacity = 0;
    let recharge = 0;
    for (const placed of bp.modules) {
      const def = SolarModuleRegistry.getModule(placed.moduleDefId);
      if (!def) continue;
      if (def.stats.projectedShieldRadius !== undefined) radius = def.stats.projectedShieldRadius;
      if (def.stats.projectedShieldCapacity !== undefined) capacity += def.stats.projectedShieldCapacity;
      if (def.stats.projectedShieldRechargeRate !== undefined) recharge += def.stats.projectedShieldRechargeRate;
    }
    // Amplifiers only count when a projector is present.
    if (radius === 0) { capacity = 0; recharge = 0; }
    this.solarProjShieldRadius = radius;
    this.solarProjShieldMaxHp = capacity;
    this.solarProjShieldRechargeRate = recharge;
    // Don't exceed new max; fully restore if the projector was just added.
    this.solarProjShieldHp = Math.min(this.solarProjShieldHp || capacity, capacity);
  }

  // ── Mass-based ship physics ──────────────────────────────────────────────────

  private static readonly TURN_RATE_BASE_BY_TIER: Record<ShipTier, number> = {
    1: Math.PI,            // 180°/s — nimble frigate
    2: Math.PI * 0.70,     // 126°/s — cruiser
    3: Math.PI * 0.50,     //  90°/s — battleship
    4: Math.PI * 0.35,     //  63°/s — capital
    5: Math.PI * 0.25,     //  45°/s — supercap
  };

  private static readonly MAX_SPEED_BY_TIER: Record<ShipTier, number> = {
    1: 10_000, 2: 15_000, 3: 20_000, 4: 25_000, 5: 30_000,
  };

  /**
   * Bridging constant: registry thrustMs2 values are raw unit thrust; multiply by
   * this factor so a T1 ship with a single C1 thruster (thrustMs2=2000) at nominal
   * hull mass produces ~15000 m/s² — matching the legacy DEFAULT_SHIP_CONTROL_CONFIG.
   */
  private static readonly THRUST_SCALE = 7.5;

  /**
   * missChance = clamp((weaponClass - targetClass) × 0.09, 0, 0.80)
   * Returns a value in [0, 0.80] — caller compares against Math.random().
   */
  private static calcMissChance(weaponClass: number, targetClass: number): number {
    return Math.min(0.80, Math.max(0, (weaponClass - targetClass) * 0.09));
  }

  /** Turret turn rate (°/s) by station size class. */
  private static readonly TURRET_TURN_RATE_DEG_S: Record<number, number> = {
    1: 180, 2: 180, 3: 120, 4: 120, 5: 80, 6: 80, 7: 50, 8: 50, 9: 30,
  };

  /** Half-width fire cone (°) by station size class. Turret fires only when within ±cone. */
  private static readonly TURRET_FIRE_CONE_DEG: Record<number, number> = {
    1: 8, 2: 8, 3: 6, 4: 6, 5: 5, 6: 5, 7: 4, 8: 4, 9: 3,
  };

  private buildPlayerShipConfig(): ShipControlConfig {
    const bp = this.solarActiveBlueprintId
      ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId)
      : null;
    if (!bp) return DEFAULT_SHIP_CONTROL_CONFIG;

    const defs = SolarModuleRegistry.getModuleMap();
    const tier = classToTier(bp.sizeClass);

    const hullMass = HULL_BASE_MASS_KG[tier];
    let totalMass = hullMass;
    for (const placed of bp.modules) {
      const def = defs.get(placed.moduleDefId);
      if (def) totalMass += TIER_BASE_MASS_KG[tier] * KIND_MASS_FACTOR[def.partKind];
    }

    const massFactor = hullMass / totalMass;
    const rawThrust = this.playerEffectiveStats?.totalThrustMs2 ?? 0;
    const thrusterPower = rawThrust > 0
      ? rawThrust * GameManager.THRUST_SCALE * massFactor
      : DEFAULT_SHIP_CONTROL_CONFIG.thrusterPower * massFactor;

    const turnBoost = this.playerEffectiveStats?.turnRateBoostFrac ?? 0;
    const turnRateRadPerS = GameManager.TURN_RATE_BASE_BY_TIER[tier]
      * Math.sqrt(massFactor)
      * (1 + turnBoost);

    return {
      hullMass: totalMass,
      thrusterPower: Math.max(100, thrusterPower),
      strafePower: Math.max(80, thrusterPower * 0.7),
      turnRateRadPerS: Math.max(0.1, turnRateRadPerS),
      turnAccelRadPerS2: turnRateRadPerS * 4,
      maxSpeedMs: GameManager.MAX_SPEED_BY_TIER[tier],
    };
  }

  private updatePlayerShipConfig(): void {
    this.solarSystem?.setShipConfig(this.buildPlayerShipConfig());
  }

  private static shieldStatsFromBlueprint(bp: SolarShipBlueprint): { radius: number; maxHp: number; rechargeRate: number } {
    let radius = 0; let maxHp = 0; let rechargeRate = 0;
    for (const placed of bp.modules) {
      const def = SolarModuleRegistry.getModule(placed.moduleDefId);
      if (!def) continue;
      if (def.stats.projectedShieldRadius !== undefined) radius = def.stats.projectedShieldRadius;
      if (def.stats.projectedShieldCapacity !== undefined) maxHp += def.stats.projectedShieldCapacity;
      if (def.stats.projectedShieldRechargeRate !== undefined) rechargeRate += def.stats.projectedShieldRechargeRate;
    }
    if (radius === 0) { maxHp = 0; rechargeRate = 0; }
    return { radius, maxHp, rechargeRate };
  }

  private computeCargoCapacity(): number {
    let slots = CARGO_BASE_SLOTS;
    const bp = this.solarActiveBlueprintId
      ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId)
      : null;
    if (bp) {
      for (const placed of bp.modules) {
        const def = SolarModuleRegistry.getModule(placed.moduleDefId);
        if (def?.stats.cargoSlots) slots += def.stats.cargoSlots;
      }
    }
    return slots;
  }

  private computeCargoUsed(inv: Map<string, number>): number {
    let total = 0;
    for (const qty of inv.values()) total += qty;
    return total;
  }

  /** Persist current session inventory, credits, and station hangars. */
  private persistSolarInventory(inv: Map<string, number>, credits?: number): void {
    if (this.e2eMode) return;
    const rec: Record<string, number> = {};
    for (const [k, v] of inv.entries()) {
      if (v > 0) rec[k] = v;
    }
    this.solarBlueprintStore.setInventory(rec);
    const creditsToSave = credits ?? this.solarSystem?.getSessionState().solarCredits;
    if (creditsToSave !== undefined) this.solarBlueprintStore.setCredits(creditsToSave);
    // Persist station hangars
    const session = this.solarSystem?.getSessionState();
    if (session) {
      const hangarsRec: Record<string, Record<string, number>> = {};
      for (const [locId, bag] of session.stationHangars.entries()) {
        const bagRec: Record<string, number> = {};
        for (const [k, v] of bag.entries()) if (v > 0) bagRec[k] = v;
        if (Object.keys(bagRec).length > 0) hangarsRec[locId] = bagRec;
      }
      this.solarBlueprintStore.setStationHangars(hangarsRec);
    }
    this.solarBlueprintStore.save();
  }

  /** Persist the active ship's current module HP state. */
  private persistShipHpState(): void {
    if (!this.solarActiveBlueprintId || this.e2eMode) return;
    this.solarBlueprintStore.setShipHpState(this.solarActiveBlueprintId, this.playerModuleHp);
    this.solarBlueprintStore.save();
  }

  /** Spawn a world-item drop at `pos` from the given drop pool. */
  private spawnDrops(pos: { x: number; y: number }, count: number): void {
    for (let i = 0; i < count; i++) {
      const poolIdx = Math.floor(Math.random() * WORLD_ITEM_DROP_POOL.length);
      const moduleDefId = WORLD_ITEM_DROP_POOL[poolIdx]!;
      const angle = Math.random() * Math.PI * 2;
      const spread = 3 + Math.random() * 5;
      this.solarWorldItems.push({
        id: `item-${++this.solarWorldItemNextId}`,
        moduleDefId,
        position: { x: pos.x + Math.cos(angle) * spread, y: pos.y + Math.sin(angle) * spread },
        ageMs: 0,
      });
    }
  }

  private getSavedBlueprintSummaries(): SavedBlueprintSummary[] {
    return Array.from(this.solarSavedBlueprints.values()).map((bp) => {
      const isActive = bp.id === this.solarActiveBlueprintId;
      const hpEntries = isActive
        ? this.playerModuleHp
        : (this.solarBlueprintStore.getShipHpState(bp.id) ?? null);
      let condition: number | undefined;
      let destroyedCount: number | undefined;
      if (hpEntries && hpEntries.length > 0) {
        const destroyed = hpEntries.filter(e => e.isDestroyed).length;
        destroyedCount = destroyed;
        const avgHp = hpEntries.reduce((s, e) => s + (e.isDestroyed ? 0 : e.hp / Math.max(1, e.maxHp)), 0) / hpEntries.length;
        condition = avgHp;
      }
      return {
        id: bp.id, name: bp.name, sizeClass: bp.sizeClass, coreSideCount: bp.coreSideCount,
        partCount: bp.modules.length, isActive,
        ...(condition !== undefined ? { condition } : {}),
        ...(destroyedCount !== undefined ? { destroyedCount } : {}),
      };
    });
  }

  private readonly myShipsHandler = new SolarMyShipsHandler();

  // ── My Ships screen ───────────────────────────────────────────────────────

  private updateSolarCrew(): void {
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.state.setScreen("docked");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    const count = this.crewCache.length;
    if (count === 0) return;
    if (this.input.wasPressed("ArrowUp") && this.menuDebounceMs === 0) {
      this.crewHandler.selection = (this.crewHandler.selection - 1 + count) % count;
      this.menuDebounceMs = 150;
    }
    if (this.input.wasPressed("ArrowDown") && this.menuDebounceMs === 0) {
      this.crewHandler.selection = (this.crewHandler.selection + 1) % count;
      this.menuDebounceMs = 150;
    }
    this.crewHandler.selection = Math.min(this.crewHandler.selection, Math.max(0, count - 1));
  }

  private buildCrewRenderData(): NonNullable<import("../rendering/GameRenderer").SolarSystemRenderData["solarCrew"]> | undefined {
    if (this.crewCache.length === 0) return undefined;
    return {
      crew: this.crewCache.map(entry => ({
        id: entry.bot.id,
        name: entry.bot.name,
        personalityType: entry.bot.personalityType,
        adoptionLean: entry.bot.adoptionLean,
        isAlive: entry.bot.isAlive,
        defectId: entry.bot.defectId,
        traitIds: entry.traitIds,
        skills: entry.skills as Record<string, number>,
      })),
      selection: this.crewHandler.selection,
      scrollOffset: this.crewHandler.scrollOffset,
    };
  }

  private updateSolarMyShips(): void {
    const ships = this.getSavedBlueprintSummaries();
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      this.state.setScreen("docked");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    if (this.input.wasPressed("ArrowUp") && this.menuDebounceMs === 0) {
      this.myShipsHandler.selection = (this.myShipsHandler.selection - 1 + Math.max(1, ships.length)) % Math.max(1, ships.length);
      this.menuDebounceMs = 150;
    }
    if (this.input.wasPressed("ArrowDown") && this.menuDebounceMs === 0) {
      this.myShipsHandler.selection = (this.myShipsHandler.selection + 1) % Math.max(1, ships.length);
      this.menuDebounceMs = 150;
    }
    this.myShipsHandler.selection = Math.min(this.myShipsHandler.selection, Math.max(0, ships.length - 1));

    // Click detection: 3 buttons per row — SET ACTIVE / LOAD TO BUILDER / DELETE
    const input = this.input.poll();
    const click = input.pointerDownPulse ?? null;
    if (click && this.menuDebounceMs === 0) {
      const ROW_H = 52;
      const LIST_Y = 80;
      const rowIdx = Math.floor((click.y - LIST_Y) / ROW_H);
      const ship = ships[rowIdx];
      if (ship) {
        this.myShipsHandler.selection = rowIdx;
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
          if (!this.e2eMode) {
            this.solarBlueprintStore.delete(ship.id);
            this.solarBlueprintStore.setActiveId(this.solarActiveBlueprintId);
            try { this.solarBlueprintStore.save(); } catch { /* best-effort */ }
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
    if (this.shopHandler.statusMs > 0) {
      this.shopHandler.statusMs = Math.max(0, this.shopHandler.statusMs - deltaMs);
      if (this.shopHandler.statusMs === 0) this.shopHandler.statusMsg = null;
    }
    const input = this.input.poll();

    // Text search: consume typed characters and backspace.
    const typed = input.typedText ?? "";
    if (typed) {
      this.shopHandler.searchText += typed;
      this.shopHandler.menuSelection = 0;
      this.shopHandler.scrollOffset = 0;
    }
    if (input.backspacePulse && this.shopHandler.searchText.length > 0) {
      this.shopHandler.searchText = this.shopHandler.searchText.slice(0, -1);
      this.shopHandler.menuSelection = 0;
      this.shopHandler.scrollOffset = 0;
    }

    // ESC: clear search first; if search already empty, go back to docked.
    if (this.wasMenuBackPressed() && this.menuDebounceMs === 0) {
      if (this.shopHandler.searchText) {
        this.shopHandler.searchText = "";
        this.shopHandler.menuSelection = 0;
        this.shopHandler.scrollOffset = 0;
        this.menuDebounceMs = 150;
        return;
      }
      this.state.setScreen("docked");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    const session = this.solarSystem?.getSessionState();
    const locId = session?.dockedLocationId ?? null;
    if (!locId) { this.state.setScreen("docked"); return; }
    const shop = this.shopManager.getShop(locId);
    if (!shop) return;
    const entries = this.filteredShopEntries(shop.entries);
    if (shop.entries.length === 0) return;

    // Clamp selection into filtered range.
    if (entries.length > 0 && this.shopHandler.menuSelection >= entries.length) {
      this.shopHandler.menuSelection = entries.length - 1;
    }

    // How many rows fit on screen (matches renderer: COL_H_Y=80, ROWS_START_Y=108).
    const SHOP_ROW_H = 52;
    const SHOP_ROWS_START_Y = 108;
    const SHOP_MAX_VISIBLE = Math.floor((this.height - SHOP_ROWS_START_Y - 48) / SHOP_ROW_H);

    // Navigation
    if (this.input.wasPressed("ArrowUp") && this.menuDebounceMs === 0 && entries.length > 0) {
      this.shopHandler.menuSelection = (this.shopHandler.menuSelection - 1 + entries.length) % entries.length;
      this.menuDebounceMs = 150;
    }
    if (this.input.wasPressed("ArrowDown") && this.menuDebounceMs === 0 && entries.length > 0) {
      this.shopHandler.menuSelection = (this.shopHandler.menuSelection + 1) % entries.length;
      this.menuDebounceMs = 150;
    }

    // Keep scroll window tracking the selection.
    if (this.shopHandler.menuSelection < this.shopHandler.scrollOffset) {
      this.shopHandler.scrollOffset = this.shopHandler.menuSelection;
    } else if (this.shopHandler.menuSelection >= this.shopHandler.scrollOffset + SHOP_MAX_VISIBLE) {
      this.shopHandler.scrollOffset = this.shopHandler.menuSelection - SHOP_MAX_VISIBLE + 1;
    }

    // Left-click: select row by pointer y, accounting for scroll offset.
    const click = input.pointerDownPulse ?? null;
    if (click && this.menuDebounceMs === 0) {
      const visIdx = Math.floor((click.y - SHOP_ROWS_START_Y) / SHOP_ROW_H);
      if (visIdx >= 0 && visIdx < SHOP_MAX_VISIBLE) {
        const absIdx = this.shopHandler.scrollOffset + visIdx;
        if (absIdx >= 0 && absIdx < entries.length) {
          this.shopHandler.menuSelection = absIdx;
          this.menuDebounceMs = 100;
        }
      }
    }

    // Buy (Enter key)
    const confirm = this.wasMenuConfirmPressed() && this.menuDebounceMs === 0;
    if (confirm) {
      const entry = entries[this.shopHandler.menuSelection];
      if (entry && session) {
        const result = this.shopManager.buyModule(locId, entry.moduleDefId, session.solarCredits);
        if (result.ok) {
          session.solarCredits = result.newCredits;
          this.adjustModuleInventory(entry.moduleDefId, +1); // also persists
          this.shopHandler.statusMsg = `BOUGHT — ${result.price}¢`;
          this.shopHandler.statusMs = 1200;
          soundManager.menuConfirm();
        } else {
          this.shopHandler.statusMsg = result.reason.toUpperCase().replace(/-/g, " ");
          this.shopHandler.statusMs = 1200;
        }
        this.menuDebounceMs = 200;
      }
    }

    // Sell: right-click — sells the currently selected item
    const rClick = input.pointerRightClickPulse ?? null;
    if ((rClick) && this.menuDebounceMs === 0 && session) {
      const entry = entries[this.shopHandler.menuSelection];
      if (entry) {
        const owned = session.moduleInventory.get(entry.moduleDefId) ?? 0;
        if (owned > 0) {
          const result = this.shopManager.sellModule(locId, entry.moduleDefId, session.solarCredits);
          if (result.ok) {
            session.solarCredits = result.newCredits;
            this.adjustModuleInventory(entry.moduleDefId, -1); // also persists
            this.shopHandler.statusMsg = `SOLD — +${result.sellPrice}¢`;
            this.shopHandler.statusMs = 1200;
          }
        } else {
          this.shopHandler.statusMsg = "NOTHING TO SELL";
          this.shopHandler.statusMs = 1000;
        }
        this.menuDebounceMs = 200;
      }
    }
  }

  private filteredShopEntries(entries: readonly ShopEntry[]): ShopEntry[] {
    if (!this.shopHandler.searchText) return entries as ShopEntry[];
    const term = this.shopHandler.searchText.toLowerCase();
    const defs = SolarModuleRegistry.getModuleMap();
    return (entries as ShopEntry[]).filter(e => {
      const name = defs.get(e.moduleDefId)?.name ?? e.moduleDefId;
      return name.toLowerCase().includes(term);
    });
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
    const filtered = this.filteredShopEntries(shop.entries);
    return {
      locationName: loc?.name ?? locId,
      economyType: shop.economyType,
      entries: filtered.map((e, i) => ({
        moduleDefId: e.moduleDefId,
        name: defs.get(e.moduleDefId)?.name ?? e.moduleDefId,
        moduleType: defs.get(e.moduleDefId)?.type ?? "structure",
        demand: e.demand,
        price: e.price,
        stock: e.stock,
        owned: session.moduleInventory.get(e.moduleDefId) ?? 0,
        isSelected: i === this.shopHandler.menuSelection,
      })),
      selectedIndex: this.shopHandler.menuSelection,
      scrollOffset: this.shopHandler.scrollOffset,
      searchText: this.shopHandler.searchText,
      playerCredits: session.solarCredits,
      statusMsg: this.shopHandler.statusMsg,
    };
  }

  // ── Inventory screen ─────────────────────────────────────────────────────

  private static readonly INV_TYPE_ORDER: import("../types/solarShipBuilder").SolarModuleType[] =
    ["weapon", "external", "internal", "structure", "converter", "factory", "ammo"];

  private static readonly INV_TYPE_LABELS: Partial<Record<string, string>> = {
    weapon: "WEAPONS", external: "EXTERNAL", internal: "INTERNAL",
    structure: "STRUCTURE", converter: "CONVERTER", factory: "FACTORY", ammo: "AMMO",
  };

  private getInventoryItems(bag: Map<string, number>): InventoryDisplayItem[] {
    const defs = SolarModuleRegistry.getModuleMap();
    const flat: InventoryDisplayItem[] = [];
    for (const [defId, qty] of bag.entries()) {
      if (qty <= 0) continue;
      const def = defs.get(defId);
      if (!def) continue;
      flat.push({ defId, name: def.name, type: def.type, quantity: qty, shopCost: def.shopCost });
    }
    const order = GameManager.INV_TYPE_ORDER;
    flat.sort((a, b) => {
      const ta = order.indexOf(a.type as import("../types/solarShipBuilder").SolarModuleType);
      const tb = order.indexOf(b.type as import("../types/solarShipBuilder").SolarModuleType);
      if (ta !== tb) return (ta < 0 ? 999 : ta) - (tb < 0 ? 999 : tb);
      return a.name.localeCompare(b.name);
    });
    // Insert section-header rows between type groups
    const result: InventoryDisplayItem[] = [];
    let lastType = "";
    for (const item of flat) {
      if (item.type !== lastType) {
        const label = GameManager.INV_TYPE_LABELS[item.type] ?? item.type.toUpperCase();
        result.push({ defId: `__hdr__${item.type}`, name: label, type: item.type, quantity: 0, shopCost: 0, isHeader: true });
        lastType = item.type;
      }
      result.push(item);
    }
    return result;
  }


  private getStationHangar(locationId: string): Map<string, number> {
    const session = this.solarSystem?.getSessionState();
    if (!session) return new Map();
    let bag = session.stationHangars.get(locationId);
    if (!bag) { bag = new Map(); session.stationHangars.set(locationId, bag); }
    return bag;
  }

  private buildInventoryContextOptions(): string[] {
    const session = this.solarSystem?.getSessionState();
    const isDocked = !!(session?.dockedLocationId);
    if (!isDocked) return ["Trash"];
    const panel = this.invHandler.panel;
    const items = panel === "ship"
      ? this.getInventoryItems(session?.moduleInventory ?? new Map())
      : this.getInventoryItems(this.getStationHangar(session?.dockedLocationId ?? ""));
    const idx = panel === "ship" ? this.invHandler.shipSel : this.invHandler.stationSel;
    const item = items[idx];
    if (!item) return ["Trash"];
    const opts: string[] = [];
    if (panel === "ship") {
      opts.push("Move to Station");
    } else {
      const cap = this.computeCargoCapacity();
      const used = this.computeCargoUsed(session?.moduleInventory ?? new Map());
      opts.push(used < cap ? "Move to Ship" : "Hold Full");
    }
    opts.push(`Sell (${item.shopCost.toLocaleString()} ¢)`);
    opts.push("Trash");
    return opts;
  }

  private updateSolarInventory(_deltaMs: number): void {
    const session = this.solarSystem?.getSessionState();
    const isDocked = !!(session?.dockedLocationId);
    const input = this.input;

    if (this.menuDebounceMs > 0) return;

    if (this.invHandler.ctxOpen) {
      const opts = this.buildInventoryContextOptions();
      if (input.wasPressed("ArrowUp")) {
        this.invHandler.ctxSel = (this.invHandler.ctxSel - 1 + opts.length) % opts.length;
        this.menuDebounceMs = 120;
      } else if (input.wasPressed("ArrowDown")) {
        this.invHandler.ctxSel = (this.invHandler.ctxSel + 1) % opts.length;
        this.menuDebounceMs = 120;
      } else if (this.wasMenuConfirmPressed()) {
        const chosen = opts[this.invHandler.ctxSel] ?? "";
        this.executeInventoryAction(chosen, session);
        this.invHandler.ctxOpen = false;
        this.menuDebounceMs = MENU_DEBOUNCE_MS;
      } else if (this.wasMenuBackPressed()) {
        this.invHandler.ctxOpen = false;
        this.menuDebounceMs = 200;
      }
      return;
    }

    const shipItems = this.getInventoryItems(session?.moduleInventory ?? new Map());
    const stationItems = isDocked
      ? this.getInventoryItems(this.getStationHangar(session?.dockedLocationId ?? ""))
      : [];
    const activeItems = this.invHandler.panel === "ship" ? shipItems : stationItems;

    // Helper: advance selection skipping header rows
    const skipHeaders = (items: InventoryDisplayItem[], from: number, dir: 1 | -1): number => {
      let i = from + dir;
      while (i >= 0 && i < items.length && items[i]?.isHeader) i += dir;
      if (i < 0 || i >= items.length) return from;
      return i;
    };
    // Clamp selection to a non-header item
    const clampSel = (items: InventoryDisplayItem[], sel: number): number => {
      if (items.length === 0) return 0;
      if (!items[sel]?.isHeader) return sel;
      // find first non-header
      const idx = items.findIndex(i => !i.isHeader);
      return idx < 0 ? 0 : idx;
    };
    if (this.invHandler.panel === "ship") {
      this.invHandler.shipSel = clampSel(shipItems, this.invHandler.shipSel);
    } else {
      this.invHandler.stationSel = clampSel(stationItems, this.invHandler.stationSel);
    }

    const getSel = () => this.invHandler.panel === "ship" ? this.invHandler.shipSel : this.invHandler.stationSel;
    const setSel = (v: number) => { if (this.invHandler.panel === "ship") this.invHandler.shipSel = v; else this.invHandler.stationSel = v; };

    if (input.wasPressed("ArrowUp")) {
      setSel(skipHeaders(activeItems, getSel(), -1));
      this.menuDebounceMs = 120;
    } else if (input.wasPressed("ArrowDown")) {
      setSel(skipHeaders(activeItems, getSel(), 1));
      this.menuDebounceMs = 120;
    } else if (isDocked && (input.wasPressed("ArrowLeft") || input.wasPressed("ArrowRight") || input.wasPressed("Tab"))) {
      this.invHandler.panel = this.invHandler.panel === "ship" ? "station" : "ship";
      this.menuDebounceMs = 150;
    } else if (this.wasMenuConfirmPressed()) {
      const sel = getSel();
      const item = activeItems[sel];
      if (item && !item.isHeader) {
        this.invHandler.ctxOpen = true;
        this.invHandler.ctxSel = 0;
        this.menuDebounceMs = 150;
      }
    } else if (input.wasPressed("KeyS") && isDocked) {
      // S = transfer selected item to the other side
      const action = this.invHandler.panel === "ship" ? "Move to Station" : "Move to Ship";
      this.executeInventoryAction(action, session);
      this.menuDebounceMs = 150;
    } else if (input.wasPressed("KeyX")) {
      // X = sell selected item
      const sel = getSel();
      const item = activeItems[sel];
      if (item && !item.isHeader) {
        this.executeInventoryAction(`Sell (${item.shopCost.toLocaleString()} ¢)`, session);
      }
      this.menuDebounceMs = 150;
    } else if (input.wasPressed("KeyF") && isDocked) {
      // F = buy one from station shop
      this.buyFromShopDirect(session);
      this.menuDebounceMs = 150;
    } else if (input.wasPressed("KeyM") && isDocked) {
      // M = move all equipment (non-ammo) to station
      this.moveAllEquipmentToStation(session);
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    } else if (this.wasMenuBackPressed()) {
      this.state.setScreen(this.invHandler.fromScreen);
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    }
  }

  private executeInventoryAction(action: string, session: import("../types/solarsystem").SolarSystemSessionState | undefined): void {
    if (!session) return;
    const panel = this.invHandler.panel;
    const locId = session.dockedLocationId ?? "";
    const shipBag = session.moduleInventory;
    const stationBag = locId ? this.getStationHangar(locId) : new Map<string, number>();
    const sourceBag = panel === "ship" ? shipBag : stationBag;
    const items = this.getInventoryItems(sourceBag);
    const sel = panel === "ship" ? this.invHandler.shipSel : this.invHandler.stationSel;
    const item = items[sel];
    if (!item || item.isHeader) return;

    if (action === "Move to Station" && locId) {
      const cur = sourceBag.get(item.defId) ?? 0;
      if (cur > 0) {
        if (cur <= 1) sourceBag.delete(item.defId); else sourceBag.set(item.defId, cur - 1);
        stationBag.set(item.defId, (stationBag.get(item.defId) ?? 0) + 1);
        if (panel === "ship") this.invHandler.shipSel = Math.min(this.invHandler.shipSel, Math.max(0, this.getInventoryItems(shipBag).length - 1));
      }
    } else if (action === "Move to Ship") {
      const cap = this.computeCargoCapacity();
      const used = this.computeCargoUsed(shipBag);
      if (used < cap) {
        const cur = sourceBag.get(item.defId) ?? 0;
        if (cur > 0) {
          if (cur <= 1) sourceBag.delete(item.defId); else sourceBag.set(item.defId, cur - 1);
          shipBag.set(item.defId, (shipBag.get(item.defId) ?? 0) + 1);
          if (panel === "station") this.invHandler.stationSel = Math.min(this.invHandler.stationSel, Math.max(0, this.getInventoryItems(stationBag).length - 1));
        }
      }
    } else if (action.startsWith("Sell")) {
      const cur = sourceBag.get(item.defId) ?? 0;
      if (cur > 0) {
        if (cur <= 1) sourceBag.delete(item.defId); else sourceBag.set(item.defId, cur - 1);
        session.solarCredits += item.shopCost;
        if (panel === "ship") this.invHandler.shipSel = Math.min(this.invHandler.shipSel, Math.max(0, this.getInventoryItems(shipBag).length - 1));
        else this.invHandler.stationSel = Math.min(this.invHandler.stationSel, Math.max(0, this.getInventoryItems(stationBag).length - 1));
      }
    } else if (action === "Trash") {
      const cur = sourceBag.get(item.defId) ?? 0;
      if (cur > 0) {
        if (cur <= 1) sourceBag.delete(item.defId); else sourceBag.set(item.defId, cur - 1);
        if (panel === "ship") this.invHandler.shipSel = Math.min(this.invHandler.shipSel, Math.max(0, this.getInventoryItems(shipBag).length - 1));
        else this.invHandler.stationSel = Math.min(this.invHandler.stationSel, Math.max(0, this.getInventoryItems(stationBag).length - 1));
      }
    }
    this.persistSolarInventory(shipBag, session.solarCredits);
  }

  private buyFromShopDirect(session: import("../types/solarsystem").SolarSystemSessionState | undefined): void {
    if (!session) return;
    const locId = session.dockedLocationId;
    if (!locId) return;
    const cap = this.computeCargoCapacity();
    const used = this.computeCargoUsed(session.moduleInventory);
    if (used >= cap) return;
    const items = this.invHandler.panel === "ship"
      ? this.getInventoryItems(session.moduleInventory)
      : this.getInventoryItems(this.getStationHangar(locId));
    const sel = this.invHandler.panel === "ship" ? this.invHandler.shipSel : this.invHandler.stationSel;
    const item = items[sel];
    if (!item || item.isHeader) return;
    const result = this.shopManager.buyModule(locId, item.defId, session.solarCredits);
    if (!result.ok) return;
    session.solarCredits = result.newCredits;
    session.moduleInventory.set(item.defId, (session.moduleInventory.get(item.defId) ?? 0) + 1);
    this.persistSolarInventory(session.moduleInventory, session.solarCredits);
  }

  private moveAllEquipmentToStation(session: import("../types/solarsystem").SolarSystemSessionState | undefined): void {
    if (!session) return;
    const locId = session.dockedLocationId;
    if (!locId) return;
    const shipBag = session.moduleInventory;
    const stationBag = this.getStationHangar(locId);
    for (const [defId, qty] of Array.from(shipBag.entries())) {
      if (qty <= 0) continue;
      const def = SolarModuleRegistry.getModule(defId);
      if (!def || def.type === "ammo") continue; // keep ammo on ship
      stationBag.set(defId, (stationBag.get(defId) ?? 0) + qty);
      shipBag.delete(defId);
    }
    this.invHandler.shipSel = 0;
    this.persistSolarInventory(shipBag, session.solarCredits);
  }

  private buildSolarInventorySection(): { inventoryScreen?: InventoryScreenData } {
    const session = this.solarSystem?.getSessionState();
    if (!session) return {};
    const locId = session.dockedLocationId;
    const isDocked = !!locId;
    const stationBag = locId ? this.getStationHangar(locId) : new Map<string, number>();
    const shipItems = this.getInventoryItems(session.moduleInventory);
    const stationItems = isDocked ? this.getInventoryItems(stationBag) : [];

    const ctxOpts = this.invHandler.ctxOpen ? this.buildInventoryContextOptions() : null;

    return {
      inventoryScreen: {
        stationItems,
        shipItems,
        activePanel: this.invHandler.panel,
        stationSel: this.invHandler.stationSel,
        shipSel: this.invHandler.shipSel,
        stationScroll: this.invHandler.stationScroll,
        shipScroll: this.invHandler.shipScroll,
        contextMenu: ctxOpts
          ? { options: ctxOpts, selection: this.invHandler.ctxSel }
          : null,
        isDocked,
        locationName: locId
          ? (session.currentSystem.locations.find(l => l.id === locId)?.name ?? locId)
          : "",
        playerCredits: session.solarCredits,
        shipCargoUsed: this.computeCargoUsed(session.moduleInventory),
        shipCargoCapacity: this.computeCargoCapacity(),
      },
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
    this.persistSolarInventory(session.moduleInventory);
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

  // ── E2E test scene (wired only in dev builds — see src/dev/e2eScene.ts) ──

  /**
   * Configure the game for an automated E2E test scenario.
   *
   * Sets `e2eMode` (disables all save/load), enters the solar system, and
   * populates it with the enemies and stations described in `spec`.
   * Must be called after construction but before the first `tick()`.
   */
  applyE2eScene(spec: import("../dev/e2eScene").E2eSceneSpec): void {
    if (!import.meta.env.DEV) return;
    this.e2eMode = true;
    this.openSolarSystem();

    const session = this.solarSystem?.getSessionState();
    if (!session) return;

    // Override position and ensure undocked.
    session.playerPosition = { x: spec.playerX, y: spec.playerY };
    session.playerVelocity = { x: 0, y: 0 };
    session.dockedLocationId = null;
    session.nearbyLocations = [];
    this.state.setScreen("solar-system");

    for (const es of spec.enemies) {
      this.e2eSpawnEnemyGroup(es, spec.playerX, spec.playerY);
    }
    for (const ss of spec.stations) {
      this.e2eSpawnE2eStation(ss);
    }
  }

  /** Spawn `spec.count` enemies in a ring centred at (cx, cy). */
  private e2eSpawnEnemyGroup(
    spec: import("../dev/e2eScene").EnemySpawnSpec,
    defaultCx: number,
    defaultCy: number,
  ): void {
    if (!import.meta.env.DEV) return;
    const cx = spec.cx ?? defaultCx;
    const cy = spec.cy ?? defaultCy;
    const ringR = Math.max(100, 200 + spec.count * 8);
    for (let i = 0; i < spec.count; i++) {
      const angle = (i / spec.count) * Math.PI * 2;
      this.e2eSpawnSingleEnemy(
        spec.typeIdx, spec.sizeClass,
        { x: cx + Math.cos(angle) * ringR, y: cy + Math.sin(angle) * ringR },
        "pirate",
      );
    }
  }

  /** Push a single enemy ship into the active solar session. */
  private e2eSpawnSingleEnemy(
    typeIdx: number,
    sizeClass: number,
    pos: { x: number; y: number },
    faction: import("../dev/e2eScene").E2eFaction,
  ): void {
    if (!import.meta.env.DEV) return;
    const idx = Math.max(0, Math.min(typeIdx, SOLAR_ENEMY_TYPES.length - 1));
    const typeDef = SOLAR_ENEMY_TYPES[idx]!;
    const loadout = ENEMY_WEAPON_LOADOUT[idx]!;
    const health = typeDef.health * (1 + sizeClass * 0.5);
    const spawnBp = this.getFactionBlueprint(faction, sizeClass);
    const defs = SolarModuleRegistry.getModuleMap();
    const initModHp = spawnBp ? ModuleHpSystem.initModuleHp(spawnBp, defs) : [];
    const initEffStats = spawnBp && initModHp.length > 0
      ? ModuleHpSystem.computeEffectiveStats(spawnBp, initModHp, defs, typeDef.scannerRangeKm)
      : null;
    this.solarEnemyShips.push({
      id: `e2e-enemy-${++this.solarEnemyNextId}`,
      baseId: "e2e-void",
      faction,
      name: typeDef.name,
      typeIdx: idx, sizeClass,
      position: { ...pos },
      velocity: { x: 0, y: 0 },
      heading: Math.random() * 360,
      targetHeading: 0,
      health, maxHealth: health,
      weapon0CooldownMs: Math.random() * (SOLAR_WEAPONS[loadout[0]]?.cooldownMs ?? 2000),
      weapon1CooldownMs: Math.random() * (SOLAR_WEAPONS[loadout[1]]?.cooldownMs ?? 2000),
      scannerRangeKm: initEffStats?.scannerRangeKm ?? typeDef.scannerRangeKm,
      lastKnownThreatPos: null,
      bravery: typeDef.bravery,
      retreating: false,
      flankSide: (Math.random() < 0.5 ? -1 : 1) as -1 | 1,
      moduleHp: initModHp,
      effectiveStats: initEffStats,
      isStranded: false,
    });
  }

  /**
   * Spawn a fully functional test station: visual, turrets, ship-spawn roster,
   * projected shield, and a dockable Location entry.
   */
  private e2eSpawnE2eStation(spec: import("../dev/e2eScene").StationE2eSpec): void {
    if (!import.meta.env.DEV) return;

    type StationTemplate = {
      blueprintId: string; sizeClass: number; health: number;
      turretRange: number; turretDamage: number; turretCooldown: number; turretWeaponIdx: number;
      alertRadius: number; spawnInterval: number; maxShips: number; spawnRadius: number;
      roster: ReadonlyArray<{ name: string; typeIdx: number; sizeClass: number }>;
    };
    const TEMPLATES: Record<import("../dev/e2eScene").E2eFaction, StationTemplate> = {
      pirate: {
        blueprintId: "pirate-c4-stronghold", sizeClass: 4, health: 5000,
        turretRange: 120, turretDamage: 60, turretCooldown: 1800, turretWeaponIdx: 5,
        alertRadius: 350, spawnInterval: 5000, maxShips: 8, spawnRadius: 75,
        roster: [
          { name: "E2E Scout",    typeIdx: 0, sizeClass: 1 },
          { name: "E2E Fighter",  typeIdx: 2, sizeClass: 1 },
          { name: "E2E Gunship",  typeIdx: 3, sizeClass: 2 },
        ],
      },
      earth: {
        blueprintId: "earth-c6-orbital-platform", sizeClass: 6, health: 15000,
        turretRange: 300, turretDamage: 140, turretCooldown: 800, turretWeaponIdx: 1,
        alertRadius: 400, spawnInterval: 4000, maxShips: 6, spawnRadius: 60,
        roster: [
          { name: "TF Sentinel", typeIdx: 0, sizeClass: 1 },
          { name: "TF Falcon",   typeIdx: 1, sizeClass: 1 },
          { name: "TF Vanguard", typeIdx: 4, sizeClass: 2 },
        ],
      },
      mars: {
        blueprintId: "mars-c4-citadel", sizeClass: 4, health: 8000,
        turretRange: 220, turretDamage: 100, turretCooldown: 1100, turretWeaponIdx: 5,
        alertRadius: 330, spawnInterval: 6000, maxShips: 6, spawnRadius: 50,
        roster: [
          { name: "Ares Scout",  typeIdx: 0, sizeClass: 1 },
          { name: "Mars Guard",  typeIdx: 3, sizeClass: 2 },
        ],
      },
    };

    const tmpl = TEMPLATES[spec.faction];
    const stationId = `e2e-station-${spec.faction}-${++this.solarEnemyNextId}`;
    const label = `E2E ${spec.faction.charAt(0).toUpperCase()}${spec.faction.slice(1)} Station`;

    // Register as a combat base so turrets and ship spawning work.
    const base: SolarEnemyBase = {
      id: stationId,
      name: label,
      faction: spec.faction,
      position: { x: spec.x, y: spec.y },
      health: tmpl.health, maxHealth: tmpl.health,
      alertLevel: (spec.startInCombat ?? true) ? "combat" : "dormant",
      alertRadiusKm: tmpl.alertRadius,
      lastSpawnMs: 0,
      spawnIntervalMs: tmpl.spawnInterval,
      maxShips: tmpl.maxShips,
      spawnRoster: tmpl.roster,
      spawnRadiusKm: tmpl.spawnRadius,
      defenseRadiusKm: 0,
      turretRangeKm: tmpl.turretRange,
      turretDamage: tmpl.turretDamage,
      turretCooldownMs: tmpl.turretCooldown,
      turretWeaponIdx: tmpl.turretWeaponIdx,
      lastTurretFireMs: 0,
      turretAimAngleDeg: 0,
      sizeClass: tmpl.sizeClass,
      blueprintId: tmpl.blueprintId,
    };
    this.solarEnemyBases.push(base);

    // Set up projected shield from the station blueprint.
    const allBps = spec.faction === "earth" ? EARTH_BLUEPRINTS
      : spec.faction === "mars" ? MARS_BLUEPRINTS : PIRATE_BLUEPRINTS;
    const bp = (allBps as ReadonlyArray<SolarShipBlueprint>).find(b => b.id === tmpl.blueprintId);
    if (bp) {
      const stats = GameManager.shieldStatsFromBlueprint(bp);
      if (stats.radius > 0 && stats.maxHp > 0) {
        this.solarStationShields.set(stationId, {
          locationId: stationId,
          worldX: spec.x, worldY: spec.y,
          hp: stats.maxHp, maxHp: stats.maxHp,
          radius: stats.radius, rechargeRate: stats.rechargeRate,
          lastDamageMs: -Infinity,
        });
      }
    }

    // Inject a dockable Location. Using a non-existent bodyId means the
    // resolver falls back to loc.position as the absolute world position.
    const system = this.systemRegistry.get(this.currentSystemId);
    if (system) {
      const dockLoc: import("../types/solarsystem").Location = {
        id: `${stationId}-dock`,
        name: label,
        type: "station",
        bodyId: "e2e-void",
        position: { x: spec.x, y: spec.y },
        dockingRadius: 60,
        controllingFaction: spec.faction === "earth" ? "terran-federation" : spec.faction,
        npcs: [],
        shops: [],
      };
      system.locations.push(dockLoc);
    }
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
      solarSystem: (() => {
        const isSolar = state.screen === "solar-system" || state.screen === "solar-system-paused" ||
          state.screen === "docked" || state.screen === "solar-npc-talk" ||
          state.screen === "solar-missions" || state.screen === "solar-mission-detail" ||
          state.screen === "solar-inventory" || state.screen === "solar-crew";
        if (!isSolar) return null;
        const base = this.buildSolarSystemExtras();
        if (!base || state.screen !== "solar-crew") return base;
        const crew = this.buildCrewRenderData();
        return crew !== undefined ? { ...base, solarCrew: crew } : base;
      })(),
      solarShipBuilder: state.screen === "solar-shipyard"
        ? this.solarShipBuilderMgr.getRenderData(
            this.solarSystem?.getSessionState().moduleInventory ?? new Map(),
            this.solarSystem?.getSessionState().solarCredits ?? 0,
            this.getShipyardShopEntries(),
            this.getSavedBlueprintSummaries(),
            this.getDestroyedPlacedIds(),
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

  private getDestroyedPlacedIds(): ReadonlySet<string> | undefined {
    if (this.playerModuleHp.length === 0) return undefined;
    const destroyed = this.playerModuleHp.filter(e => e.isDestroyed).map(e => e.placedId);
    return destroyed.length > 0 ? new Set(destroyed) : undefined;
  }

  /** Auto-repair all destroyed modules: free from inventory, then buy from shop. */
  private repairAllModules(): void {
    const session = this.solarSystem?.getSessionState();
    if (!session || !this.solarActiveBlueprintId) return;
    const bp = this.solarSavedBlueprints.get(this.solarActiveBlueprintId);
    if (!bp) return;

    const destroyed = this.playerModuleHp.filter(e => e.isDestroyed);
    if (destroyed.length === 0) return;

    const shopMap = new Map(this.getShipyardShopEntries().map(e => [e.moduleDefId, e]));
    const invSnapshot = new Map(session.moduleInventory);

    // First pass: verify all repairable and compute cost
    let totalCost = 0;
    for (const entry of destroyed) {
      const placed = bp.modules.find(m => m.placedId === entry.placedId);
      if (!placed) continue;
      const defId = placed.moduleDefId;
      const owned = invSnapshot.get(defId) ?? 0;
      if (owned > 0) {
        invSnapshot.set(defId, owned - 1);
      } else {
        const shopEntry = shopMap.get(defId);
        if (!shopEntry || shopEntry.stock <= 0) {
          this.solarShipBuilderMgr.setStatus("MISSING PARTS — CHECK SHOP");
          return;
        }
        totalCost += shopEntry.price;
      }
    }

    if (totalCost > session.solarCredits) {
      this.solarShipBuilderMgr.setStatus(`NEED ${totalCost.toLocaleString()} ¢`);
      return;
    }

    // Second pass: execute repair
    const invDeltas = new Map<string, number>();
    for (const entry of destroyed) {
      const placed = bp.modules.find(m => m.placedId === entry.placedId);
      if (!placed) continue;
      const defId = placed.moduleDefId;
      const currentOwned = (session.moduleInventory.get(defId) ?? 0) + (invDeltas.get(defId) ?? 0);
      if (currentOwned > 0) {
        invDeltas.set(defId, (invDeltas.get(defId) ?? 0) - 1);
      } else {
        session.solarCredits -= shopMap.get(defId)!.price;
      }
    }

    for (const [defId, delta] of invDeltas) {
      this.adjustModuleInventory(defId, delta);
    }

    // Reset HP for all destroyed entries back to full
    this.playerModuleHp = this.playerModuleHp.map(e =>
      e.isDestroyed ? { ...e, hp: e.maxHp, isDestroyed: false } : e,
    );

    // Recompute effective stats now that all modules are live
    this.solarPlayerBlueprintCache = null;
    this.applyActiveSolarBlueprint();
    this.persistSolarInventory(session.moduleInventory, session.solarCredits);
    this.persistShipHpState();
    this.solarShipBuilderMgr.setStatus("ALL MODULES REPAIRED");
  }

  /** True when all engine modules on the active blueprint are destroyed. */
  private isPlayerStranded(): boolean {
    if (this.playerModuleHp.length === 0) return false;
    const bp = this.solarActiveBlueprintId
      ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId)
      : null;
    if (!bp) return false;
    const defs = SolarModuleRegistry.getModuleMap();
    return !ModuleHpSystem.hasEngine(bp, this.playerModuleHp, defs);
  }

  /** Dispatch a rescue ship from the nearest friendly station. */
  private callRescue(): void {
    if (this.solarRescuePending || !this.solarSystem) return;
    const session = this.solarSystem.getSessionState();
    const playerPos = session.playerPosition;

    // Find nearest friendly (terran-federation) location in this system
    let nearestLocId: string | null = null;
    let nearestWorldPos: { x: number; y: number } | null = null;
    let nearestDist = Infinity;
    for (const loc of session.currentSystem.locations) {
      if (loc.controllingFaction !== "terran-federation") continue;
      const wp = this.solarSystem.getLocationWorldPosition(loc);
      const d = Math.hypot(wp.x - playerPos.x, wp.y - playerPos.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestLocId = loc.id;
        nearestWorldPos = wp;
      }
    }
    if (!nearestLocId || !nearestWorldPos) return;

    const rescueId = `rescue-${this.solarPlayerNextId++}`;
    this.solarFriendlyShips.push({
      id: rescueId,
      position: { ...nearestWorldPos },
      velocity: { x: 0, y: 0 },
      heading: 0,
      health: 200,
      maxHealth: 200,
      weaponCooldownMs: 0,
      bravery: 1.0,
      retreating: false,
      role: "rescue",
      rescueStationPos: nearestWorldPos,
      rescueLocationId: nearestLocId,
      rescueTowing: false,
    });
    this.solarRescuePending = true;
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
          menuScrollOffset: this.dockedMenuScrollOffset,
          activeNpc,
        }
      : undefined;

    // Laser flash FX — compute screen-space offsets for each weapon module origin.
    // Uses zoom-aware bpScale so origins track the rendered ship at current zoom.
    const laserFlashOrigins: Array<{ dx: number; dy: number }> = [];
    if (this.solarPlayerBlueprintCache && this.laserFlashMs > 0) {
      const { modules, coreRadius } = this.solarPlayerBlueprintCache;
      const laserKmToPx = Math.max(0.05, sessionState.zoomLevel);
      const laserEnemyScale = Math.max(0.3, 0.6 * laserKmToPx);
      const activeBpForLaser = this.solarActiveBlueprintId
        ? this.solarSavedBlueprints.get(this.solarActiveBlueprintId) : undefined;
      const laserSzClass = activeBpForLaser?.sizeClass ?? 2;
      const laserTargetR = Math.max(3, (4 + laserSzClass * 2) * laserEnemyScale);
      const bpScale = laserTargetR / coreRadius;
      const heading = sessionState.playerHeading;
      const h = (heading * Math.PI) / 180;
      const cosH = Math.cos(h);
      const sinH = Math.sin(h);
      for (const mod of modules) {
        if (mod.moduleType !== "weapon" || mod.partKind !== "laser") continue;
        // Use the outermost vertex of the laser polygon as the muzzle tip.
        const vcx = mod.vertices.reduce((s, v) => s + v.x, 0) / (mod.vertices.length || 1);
        const vcy = mod.vertices.reduce((s, v) => s + v.y, 0) / (mod.vertices.length || 1);
        let tipX = vcx, tipY = vcy, maxD2 = 0;
        for (const v of mod.vertices) {
          const d2 = Math.hypot(v.x - vcx, v.y - vcy);
          if (d2 > maxD2) { maxD2 = d2; tipX = v.x; tipY = v.y; }
        }
        laserFlashOrigins.push({
          dx: (tipX * cosH - tipY * sinH) * bpScale,
          dy: (tipX * sinH + tipY * cosH) * bpScale,
        });
      }
    }
    const laserFlash = this.laserFlashMs > 0 && this.laserFlashTarget
      ? {
          targetX: this.laserFlashTarget.x,
          targetY: this.laserFlashTarget.y,
          alpha: this.laserFlashMs / 200,
          origins: laserFlashOrigins,
        }
      : undefined;

    // Player blueprint visual (cached by blueprintId)
    let playerBlueprintModules: Array<{ vertices: Array<{ x: number; y: number }>; worldX: number; worldY: number; moduleType: string; partKind: string; grade: number; placedId: string; moduleDefId: string; boundsR: number }> | undefined;
    let playerBlueprintCoreRadius: number | undefined;
    if (this.solarActiveBlueprintId) {
      const activeBp = this.solarSavedBlueprints.get(this.solarActiveBlueprintId);
      if (activeBp) {
        if (this.solarPlayerBlueprintCache?.blueprintId !== this.solarActiveBlueprintId) {
          this.solarPlayerBlueprintCache = {
            blueprintId: this.solarActiveBlueprintId,
            ...this.computeBlueprintModules(activeBp),
          };
          // Re-init module HP when the player equips a different blueprint
          if (this.playerModuleHpBlueprintId !== this.solarActiveBlueprintId) {
            const defs = SolarModuleRegistry.getModuleMap();
            const saved = this.solarBlueprintStore.getShipHpState(this.solarActiveBlueprintId);
            this.playerModuleHp = (saved && saved.length === activeBp.modules.length)
              ? saved
              : ModuleHpSystem.initModuleHp(activeBp, defs);
            this.playerEffectiveStats = ModuleHpSystem.computeEffectiveStats(
              activeBp, this.playerModuleHp, defs, this.solarPlayerScannerRangeKm,
            );
            this.playerModuleHpBlueprintId = this.solarActiveBlueprintId;
            this.updatePlayerShipConfig();
          }
        }
        playerBlueprintModules = this.solarPlayerBlueprintCache.modules;
        playerBlueprintCoreRadius = this.solarPlayerBlueprintCache.coreRadius;
      }
    }

    // Enemy ships and stations for this system — culled to player scanner range.
    const playerPos = sessionState.playerPosition;
    const scannerRange = this.solarPlayerScannerRangeKm;

    // ── Per-frame tracker updates ─────────────────────────────────────────
    if (this.currentSystemId === "sol") {
      for (const s of this.solarEnemyShips) {
        const d = Math.hypot(s.position.x - playerPos.x, s.position.y - playerPos.y);
        if (d <= scannerRange) {
          this.solarLastKnownShipPositions.set(s.id, {
            x: s.position.x,
            y: s.position.y,
            color: FACTION_COLORS[s.faction] ?? (SOLAR_ENEMY_TYPES[s.typeIdx]?.color ?? 0xff3333),
          });
        }
      }
      for (const b of this.solarEnemyBases) {
        const d = Math.hypot(b.position.x - playerPos.x, b.position.y - playerPos.y);
        if (d <= scannerRange) this.solarDiscoveredStationIds.add(b.id);
      }
    }

    const enemyShips = this.currentSystemId === "sol"
      ? this.solarEnemyShips
          .filter((s) => Math.hypot(s.position.x - playerPos.x, s.position.y - playerPos.y) <= scannerRange)
          .map((s) => {
            const bp = this.getFactionBlueprintModules(s.faction, s.sizeClass);
            // Build per-module HP data for damage tinting and destroyed module culling
            let moduleHpFractions: ReadonlyMap<string, number> | undefined;
            let destroyedModuleIds: ReadonlySet<string> | undefined;
            if (s.moduleHp.length > 0) {
              const fracs = new Map<string, number>();
              const destroyed = new Set<string>();
              for (const e of s.moduleHp) {
                fracs.set(e.placedId, e.maxHp > 0 ? e.hp / e.maxHp : 0);
                if (e.isDestroyed) destroyed.add(e.placedId);
              }
              moduleHpFractions = fracs;
              if (destroyed.size > 0) destroyedModuleIds = destroyed;
            }
            return {
              id: s.id,
              typeIdx: s.typeIdx,
              typeName: SOLAR_ENEMY_TYPES[s.typeIdx]?.name ?? "Unknown",
              color: FACTION_COLORS[s.faction] ?? (SOLAR_ENEMY_TYPES[s.typeIdx]?.color ?? 0xff3333),
              position: s.position,
              heading: s.heading,
              health: s.health,
              maxHealth: s.maxHealth,
              sizeClass: s.sizeClass,
              faction: s.faction as string,
              ...(bp ? { blueprintModules: bp.modules, blueprintCoreRadius: bp.coreRadius } : {}),
              ...(moduleHpFractions ? { moduleHpFractions } : {}),
              ...(destroyedModuleIds ? { destroyedModuleIds } : {}),
            };
          })
      : [];

    // Ghost markers for ships that were spotted but are now out of scanner range.
    const visibleShipIds = new Set(enemyShips.map((s) => s.id));
    const lastKnownEnemyPositions = this.currentSystemId === "sol"
      ? Array.from(this.solarLastKnownShipPositions.entries())
          .filter(([id]) => !visibleShipIds.has(id))
          .map(([id, d]) => ({ id, position: { x: d.x, y: d.y }, color: d.color }))
      : [];

    const enemyProjectiles = this.currentSystemId === "sol"
      ? this.solarEnemyProjectiles.map((p) => {
          const spd = Math.hypot(p.velocity.x, p.velocity.y) || 1;
          return {
            id: p.id,
            position: p.position,
            color: SOLAR_WEAPONS[p.weaponIdx]?.color ?? 0xff4444,
            dirX: p.velocity.x / spd,
            dirY: p.velocity.y / spd,
            ...(p.isHoming ? { isHoming: true as const } : {}),
            ...(p.trailPoints ? { trailPoints: [...p.trailPoints] } : {}),
            ...(p.weaponTrailColor !== undefined ? { trailColor: p.weaponTrailColor } : {}),
          };
        })
      : [];

    // Stations: show if within range OR previously discovered.
    // Stations do not move — a discovered position is permanently accurate.
    const enemyStations = this.currentSystemId === "sol"
      ? this.solarEnemyBases
          .filter((b) =>
            Math.hypot(b.position.x - playerPos.x, b.position.y - playerPos.y) <= scannerRange ||
            this.solarDiscoveredStationIds.has(b.id),
          )
          .map((b) => {
            const bp = this.getStationBlueprintModules(b.faction, b.blueprintId);
            return {
              id: b.id,
              name: b.name,
              position: b.position,
              health: b.health,
              maxHealth: b.maxHealth,
              alertLevel: b.alertLevel,
              faction: b.faction as string,
              sizeClass: b.sizeClass,
              heading: 0,
              ...(bp ? { blueprintModules: bp.modules, blueprintCoreRadius: bp.coreRadius } : {}),
            };
          })
      : [];

    return {
      playerPosition: sessionState.playerPosition,
      playerVelocity: sessionState.playerVelocity,
      playerHeading: sessionState.playerHeading,
      thrustActive: this.solarSystem.getLastThrustActive(),
      thrustForward: this.solarLastThrustForward,
      thrustReverse: this.solarLastThrustReverse,
      thrustStrafeLeft: this.solarLastStrafeLeft,
      thrustStrafeRight: this.solarLastStrafeRight,
      thrustTurnLeft: this.solarLastTurnLeft,
      thrustTurnRight: this.solarLastTurnRight,
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
      lastKnownEnemyPositions,
      playerHealth: this.solarPlayerHealth,
      playerMaxHealth: this.solarPlayerMaxHealth,
      playerShield: this.solarPlayerShield,
      playerMaxShield: this.solarPlayerMaxShield,
      projectedShield: this.solarProjShieldMaxHp > 0
        ? { radiusKm: this.solarProjShieldRadius, hp: this.solarProjShieldHp, maxHp: this.solarProjShieldMaxHp }
        : null,
      ...(this.solarStationShields.size > 0 ? {
        stationShields: Array.from(this.solarStationShields.values())
          .filter(ss => ss.maxHp > 0)
          .map(ss => ({ worldX: ss.worldX, worldY: ss.worldY, radiusKm: ss.radius, hp: ss.hp, maxHp: ss.maxHp })),
      } : {}),
      damageFlash: this.solarDamageFlashMs > 0 ? this.solarDamageFlashMs / 300 : 0,
      warpIntensity: this.antiGravActive ? 1 : this.warpDecayMs / GameManager.WARP_DECAY_DURATION_MS,
      warpChargeFraction: this.antiGravActive ? 0 : this.antiGravHoldMs / GameManager.ANTIGRAV_HOLD_THRESHOLD_MS,
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
      ...(this.playerModuleHp.length > 0 ? (() => {
        const fracs = new Map<string, number>();
        const destroyed = new Set<string>();
        for (const e of this.playerModuleHp) {
          fracs.set(e.placedId, e.maxHp > 0 ? e.hp / e.maxHp : 0);
          if (e.isDestroyed) destroyed.add(e.placedId);
        }
        return {
          playerModuleHpFractions: fracs as ReadonlyMap<string, number>,
          ...(destroyed.size > 0 ? { playerDestroyedModuleIds: destroyed as ReadonlySet<string> } : {}),
        };
      })() : {}),
      ...(laserFlash ? { laserFlash } : {}),
      ...(dockedSection ? { docked: dockedSection } : {}),
      ...(this.buildNpcTalkSection()),
      ...(this.buildMissionListSection()),
      ...(this.buildMissionDetailSection()),
      ...(this.buildSolarInventorySection()),
      virtualControls: this.buildVirtualControlsState(),
      lockedTargets: Array.from(this.solarLockedIds)
        .map(id => this.solarEnemyShips.find(s => s.id === id))
        .filter((s): s is SolarEnemyShip => !!s)
        .map(s => ({ id: s.id, position: s.position })),
      ...(this.solarFocusedId ? { focusedTargetId: this.solarFocusedId } : {}),
      ...(this.solarSelectedId ? { selectedShipId: this.solarSelectedId } : {}),
      zoomBar: (() => {
        const z = sessionState.zoomLevel;
        const frac = Math.log(z / 0.5) / Math.log(40);
        const label = z >= 10 ? `${Math.round(z)}x` : z >= 1 ? `${z.toFixed(1)}x` : `${z.toFixed(2)}x`;
        return { fraction: Math.max(0, Math.min(1, frac)), label };
      })(),
      ...(this.isPlayerStranded() ? { playerStranded: true } : {}),
      ...(this.solarRescuePending ? { rescuePending: true } : {}),
      ...(this.solarWeaponStagger ? { weaponStaggerActive: true } : {}),
      friendlyShips: this.solarFriendlyShips.map(s => ({
        id: s.id,
        position: s.position,
        heading: s.heading,
        health: s.health,
        maxHealth: s.maxHealth,
        isRescue: s.role === "rescue",
        rescueTowing: s.rescueTowing,
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
          ...(p.missileLevel !== undefined ? { missileLevel: p.missileLevel } : {}),
          ...(p.trailPoints ? { trailPoints: [...p.trailPoints] } : {}),
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
      factionPalettes: (() => {
        const pirate = PIRATE_FACTION_TEMPLATES[this.activePirateFactionIdx];
        const palettes: Partial<Record<string, FactionColors>> = {};
        if (pirate) palettes["pirate"] = pirate.colors;
        return palettes;
      })(),
      rollFx: this.solarRollFx.map(rfx => ({
        x: rfx.x,
        y: rfx.y,
        dx: rfx.dx,
        dy: rfx.dy,
        ageFrac: rfx.ageMs / rfx.maxAgeMs,
      })),
      rollCooldownFrac: this.solarRollCooldownMs > 0
        ? this.solarRollCooldownMs / Math.max(500,
            GameManager.ROLL_BASE_COOLDOWN_MS - this.solarNavigationSkill * GameManager.ROLL_COOLDOWN_PER_SKILL)
        : 0,
      worldItems: this.solarWorldItems.map(wi => ({
        id: wi.id,
        position: wi.position,
        ageFrac: wi.ageMs / WORLD_ITEM_MAX_AGE_MS,
        moduleDefId: wi.moduleDefId,
      })),
      cargoCapacity: this.computeCargoCapacity(),
      cargoUsed: this.computeCargoUsed(sessionState.moduleInventory),
    };
  }

  private buildNpcTalkSection(): { npcTalk?: { npc: import("./data/NPCRegistry").NPCDefinition; menuItems: readonly string[]; menuSelection: number } } {
    const npcId = this.npcHandler.activeTalkNpcId;
    if (!npcId) return {};
    const npc = NPCRegistry.getNPC(npcId);
    if (!npc) return {};
    return { npcTalk: { npc, menuItems: ["Missions", "Leave"], menuSelection: this.menuSelection } };
  }

  private buildMissionListSection(): { missionList?: { npc: import("./data/NPCRegistry").NPCDefinition; missions: Array<{ spec: import("../types/missions").MissionSpec; status: "available" | "active" | "completed" }>; menuSelection: number } } {
    const npcId = this.npcHandler.activeTalkNpcId;
    if (!npcId) return {};
    const npc = NPCRegistry.getNPC(npcId);
    if (!npc) return {};
    const missions = this.getNpcMissions(npcId);
    return { missionList: { npc, missions, menuSelection: this.menuSelection } };
  }

  private buildMissionDetailSection(): { missionDetail?: { spec: import("../types/missions").MissionSpec; menuSelection: number } } {
    const missionId = this.npcHandler.activeMissionDetailId;
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

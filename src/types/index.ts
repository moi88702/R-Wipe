/**
 * Core TypeScript interfaces for R-Wipe Spaceship Game.
 * These types define the data models shared across all game systems.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Open World Solar System Exploration — type barrel re-exports
// ──────────────────────────────────────────────────────────────────────────────

export type {
  SystemSeed,
  OrbitalParams,
  CelestialBody,
  Location,
  StateChangeLogEntry,
  StateChangeLog,
  SolarSystemState,
  SolarSystemSessionState,
  SystemGate,
} from "./solarsystem";

export type {
  FactionDefinition,
  FactionStanding,
  FactionStandingsState,
  FactionTakeoverEvent,
} from "./factions";

export type {
  MissionSpec,
  MissionLogEntry,
  MissionLogState,
  Waypoint,
} from "./missions";

export type {
  CapitalShipUpgrade,
  CapitalShipHull,
  CapitalShipBlueprint,
  CapitalShipState,
  CombatSystemState,
} from "./capital-ship";

export type {
  ResourceDeposit,
  ResourceInventory,
  HarvestingSession,
} from "./resources";

export type { DockingCheckResult, LocationProximity } from "./docking";

export type {
  StationTurretConfig,
  StationSpawnConfig,
  EnemyStationDefinition,
  StationAlertLevel,
  EnemyStationState,
} from "./combat";

// ──────────────────────────────────────────────────────────────────────────────
// Input
// ──────────────────────────────────────────────────────────────────────────────

export interface InputState {
  moveUp: boolean;
  moveDown: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  fire: boolean;
  /** Drops a proximity bomb regardless of currently equipped weapon. */
  bomb: boolean;
  pause: boolean;
  menuConfirm: boolean;
  menuBack: boolean;
  /**
   * When set (mobile drag-to-move), the player moves toward this point in
   * game-space each frame instead of using WASD. Null when no finger is down.
   */
  touchTarget?: { x: number; y: number } | null;
  /** Current cursor / primary-touch position in game coords. */
  pointer?: { x: number; y: number } | null;
  /** One-frame pulse: a click/tap just landed this frame. */
  pointerDownPulse?: { x: number; y: number } | null;
  /** True whenever the primary pointer is pressed (mouse button or finger). */
  pointerHeld?: boolean;

  // ── Solar-system / free-flight additions ──────────────────────────────────
  /**
   * W key — apply thrust in the ship's facing direction (solar-system mode).
   * Absent in classic arcade mode; always false when the key is not held.
   */
  thrustForward?: boolean;
  /**
   * S key — apply thrust opposite the ship's facing direction (solar-system
   * mode). Absent in classic arcade mode; always false when not held.
   */
  thrustReverse?: boolean;
  /**
   * A key — rotate the ship counter-clockwise (solar-system mode).
   * Absent in classic arcade mode; always false when not held.
   */
  turnLeft?: boolean;
  /**
   * D key — rotate the ship clockwise (solar-system mode).
   * Absent in classic arcade mode; always false when not held.
   */
  turnRight?: boolean;

  // ── Solar-system combat ability keys ──────────────────────────────────────
  /**
   * V key pulse — activate the ability assigned to the V slot (solar-system
   * combat mode). One-frame pulse: cleared by InputHandler.endFrame().
   *
   * Always `false` when the key was not pressed this frame.
   * `InputHandler.poll()` is the canonical constructor of `InputState` and
   * always supplies this field.  The B key uses the existing `bomb` field for
   * consistency.
   */
  abilityV: boolean;
  /**
   * C key pulse — activate the ability assigned to the C slot.
   *
   * Always `false` when the key was not pressed this frame.
   * `InputHandler.poll()` always supplies this field.
   */
  abilityC: boolean;
  /**
   * X key pulse — activate the ability assigned to the X slot.
   *
   * Always `false` when the key was not pressed this frame.
   * `InputHandler.poll()` always supplies this field.
   */
  abilityX: boolean;
  /**
   * Z key pulse — activate the ability assigned to the Z slot.
   *
   * Always `false` when the key was not pressed this frame.
   * `InputHandler.poll()` always supplies this field.
   */
  abilityZ: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Player
// ──────────────────────────────────────────────────────────────────────────────

export interface ShieldState {
  active: boolean;
  displayValue: number; // 0–100, visual indicator
  absorptionCapacity: number; // 1 hit typically
}

/** Categorical player weapon — determines projectile behaviour and HUD/gun art. */
export type PlayerWeaponType = "bullet" | "spread" | "bomb";

export interface WeaponState {
  upgradeLevel: number; // 1–5
  fireRateMs: number; // ms between shots
  lastFireTimeMs: number;
  projectileDamage: number;
  projectileSpeed: number; // px/frame
  /** Which player weapon is currently equipped. */
  weaponType: PlayerWeaponType;
}

export interface PlayerState {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  health: number; // 0 = dead
  lives: number;
  shield: ShieldState;
  weapon: WeaponState;
  invulnerabilityTimer: number; // frames
  isAlive: boolean;
  width: number; // 50px
  height: number; // 32px
  /**
   * Speed multiplier from the speed-boost pickup. 1 = default, 1.6 = boosted.
   * Decays back to 1 over `speedBoostMs`.
   */
  speedMultiplier: number;
  speedBoostMs: number;
  /**
   * Remaining ms on the mega-laser beam (0 = inactive). When > 0 the ship
   * emits a full-screen-width beam and damages any overlapping enemies.
   */
  megaLaserMs: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Enemies
// ──────────────────────────────────────────────────────────────────────────────

export type EnemyType =
  | "grunt"
  | "spinner"
  | "stalker"
  | "darter"       // fast evasive enemy
  | "orbiter"      // circles around a point
  | "lancer"       // fires lasers
  | "torpedoer"    // fires homing torpedoes
  | "cannoneer"    // fires slow cannon shots
  | "pulsar";      // fires pulse bursts

/** Categorical weapon type used by projectile rendering + tuning. */
export type WeaponKind =
  | "bullet"
  | "laser"
  | "torpedo"
  | "cannon"
  | "pulse-bolt"
  | "charge-beam"
  | "mega-missile"
  | "prox-bomb";

export interface AttackPattern {
  type:
    | "straight"
    | "radial"
    | "homing"
    | "spread"
    | "laser"
    | "torpedo"
    | "cannon"
    | "pulse"
    | "multi-direction"
    | "aimed-burst";
  bulletsPerShot: number;
  spreadAngleDegrees: number;
  projectileSpeed: number;
  /** Optional: overrides damage per projectile (otherwise implementation default). */
  damage?: number;
  /** Optional visual / gameplay kind carried on the projectile. */
  weaponKind?: WeaponKind;
}

export interface PatrolPattern {
  type: "straight" | "sine-wave" | "circular";
  amplitude?: number;
  frequency?: number;
}

export interface BehaviorState {
  patrolPattern: PatrolPattern;
  detectionRange: number;
  aggressiveness: number; // 0–1
}

export interface Enemy {
  id: string;
  type: EnemyType;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  health: number;
  maxHealth: number;
  width: number;
  height: number;
  behavior: BehaviorState;
  fireRateMs: number;
  lastFireTimeMs: number;
  attackPattern: AttackPattern;
  bounty: number; // points awarded on defeat
  isAlive: boolean;
  /** Step counter used by multi-stage firing programs (grunt / spinner / etc.). */
  fireStep?: number;
  /** Used by "hop-back" enemies (spinner): negative velocity tweak per shot. */
  hopBackTimer?: number;
  /** Used by mobile enemies (darter / orbiter) to track behaviour state. */
  aiTimer?: number;
  aiPhase?: number;
  /** Optional anchor point (orbit centre, dart base, etc.). */
  anchor?: { x: number; y: number };
}

// ──────────────────────────────────────────────────────────────────────────────
// Projectiles
// ──────────────────────────────────────────────────────────────────────────────

export interface Projectile {
  id: string;
  owner: "player" | "enemy";
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  damage: number;
  lifetime: number; // ms before auto-removal
  width: number;
  height: number;
  isAlive: boolean;
  /** Visual / gameplay weapon category. Defaults to "bullet". */
  kind?: WeaponKind;
  /** When true, the projectile gradually turns toward the player while in flight. */
  isHoming?: boolean;
  /** Max turn rate (radians per second) for homing projectiles. */
  homingTurnRate?: number;
  /** Accumulated age (ms) for effects that depend on time since spawn (pulse etc.). */
  ageMs?: number;
  /**
   * Hit points — projectile can be shot down while > 0. Undefined = one-shot
   * (normal bullets). Set by spawnEx for torpedoes / prox-bombs.
   */
  health?: number;
  /**
   * Proximity-bomb trigger radius (pixels). When the bomb closes within this
   * distance of any enemy, it detonates and kills itself, dealing AoE damage.
   */
  proxTriggerRadius?: number;
  /** AoE damage radius when a prox-bomb detonates. */
  proxBlastRadius?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Power-Ups
// ──────────────────────────────────────────────────────────────────────────────

export type PowerUpType =
  | "weapon-upgrade"
  | "shield"
  | "extra-life"
  | "health-recovery"
  | "speed-boost"
  | "weapon-spread"
  | "weapon-bomb"
  | "mega-laser";

export interface PowerUp {
  id: string;
  type: PowerUpType;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  width: number;
  height: number;
  lifetime: number; // ms before despawn if not collected
  isCollected: boolean;
}

export interface PowerUpEffect {
  type: PowerUpType;
  apply(playerState: PlayerState): void;
  revert?: (playerState: PlayerState) => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Levels & Boss
// ──────────────────────────────────────────────────────────────────────────────

export interface DifficultyScaling {
  enemyCountBase: number;
  enemyCountMultiplier: number;
  enemyFireRateMultiplier: number;
  enemyHealthMultiplier: number;
  enemySpeedMultiplier: number;
  newEnemyTypesUnlocked: EnemyType[];
}

export interface BossPhase {
  phaseNumber: number;
  attackPattern: AttackPattern;
  fireRateMs: number;
  bulletSpeed: number;
  visualIntensity: "low" | "medium" | "high";
}

/**
 * A single destructible / targetable sub-section of a boss. Bosses are
 * composed of 1..N parts; each part has its own HP, hitbox, optional weapon,
 * and "kind":
 *  - "core":   the weak point. Killing it defeats the boss.
 *  - "turret": a gun emplacement. Shoots. Destroyable, but boss keeps fighting.
 *  - "armor":  durable plating. Must be destroyed to expose the core (some bosses).
 */
export interface BossPart {
  id: string;
  kind: "core" | "turret" | "armor";
  /** Offset from the boss centre (before rotation). */
  offset: { x: number; y: number };
  /** Current hitbox centre in world space. Recomputed each frame. */
  position: { x: number; y: number };
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  /** Optional weapon this part fires. Undefined → non-firing part. */
  attackPattern?: AttackPattern;
  fireRateMs?: number;
  lastFireTimeMs?: number;
  /** Primary fill colour used by the layered renderer. */
  color: number;
  /** Accent / stroke colour. */
  accent: number;
  /** If true, this part must be destroyed before the core takes damage. */
  shieldsCore?: boolean;
  /**
   * Snapshot of the original shieldsCore flag. Phases may toggle shieldsCore
   * off to expose the core as a weak point; this value is used to restore it
   * when the phase ends.
   */
  originalShieldsCore?: boolean;
}

/**
 * Boss movement pattern. Every phase picks one; the boss updateBoss routine
 * translates `kind` into concrete velocity / position-driving behaviour.
 *
 *  - "hover"     : classic bob-in-place on the right third (default fallback)
 *  - "square"    : traverses the four corners of a rectangle
 *  - "vertical"  : tight up/down sweep (no horizontal motion)
 *  - "wave"      : fast sine wave across a wider band
 *  - "dart-in"   : briefly rushes toward the player then retreats
 *  - "charge"    : freezes in place to telegraph a charge-beam (weak spot exposed)
 *  - "mixed"     : concatenates sub-patterns at random each phase
 */
export type BossMovementKind =
  | "hover"
  | "square"
  | "vertical"
  | "wave"
  | "dart-in"
  | "charge"
  | "mixed";

export interface BossMovementPhase {
  kind: BossMovementKind;
  /** How long (ms) this phase runs. Clamped to ≤ 10 000 by the registry. */
  durationMs: number;
  /**
   * Firing cadence during this phase. Uses the definition's current
   * AttackPattern unless overridden.
   */
  fireRateMs?: number;
  attackPattern?: AttackPattern;
  /**
   * Part id whose `shieldsCore` flag should be dropped while this phase is
   * active — lets movement phases expose the core as a weak point.
   */
  exposesPartId?: string;
  /**
   * Charge-up window (ms) at the start of the phase. While charging: no
   * firing, a visible charge aura grows, and `exposesPartId` (if set) is
   * unshielded. Triggering the shot is handled in updateBoss.
   */
  chargeMs?: number;
  /** When true the phase entry plays a brief invulnerability + shockwave FX. */
  announce?: boolean;
  /**
   * If present, the boss spawns enemies from the given mix during this phase.
   * Carrier-style behaviour.
   */
  spawnWave?: BossSpawnWave;
}

/** How a carrier-style boss releases enemy waves during a movement phase. */
export interface BossSpawnWave {
  /** Enemy types to draw from (weighted uniformly). */
  mix: EnemyType[];
  /** Enemies released per wave tick. */
  count: number;
  /**
   * If set, spawns a wave of `count` every `intervalMs`. If omitted, releases
   * a single wave at phase entry.
   */
  intervalMs?: number;
}

export interface BossState extends Enemy {
  phases: BossPhase[];
  currentPhase: number; // 0-indexed
  phaseHealthThresholds: number[]; // e.g. [100, 50, 0] for 2-phase boss
  transitionTimer: number; // ms, animation time
  isTransitioning: boolean;
  /** Display name used by HUD + banners. Sourced from the boss definition. */
  displayName?: string;
  /** Primary fill colour (hex). Read by the renderer; falls back to defaults. */
  colorPrimary?: number;
  /** Accent / stroke colour (hex). */
  colorAccent?: number;
  /** Multi-part composition. Populated by the registry; [] for simple bosses. */
  parts?: BossPart[];
  /** Defeat rule: "core" = dies when core dies, "all" = dies when every part dies. */
  defeatRule?: "core" | "all";
  /**
   * String-id of the art template the renderer should draw for this boss
   * (look-up table lives in BossArt.ts).
   */
  artId?: string;
  /** Boss rotation, used when rendering layered shapes. */
  rotation?: number;
  /** Movement phase plan. Cycled through during the fight. */
  movementPhases?: BossMovementPhase[];
  /** Index of the currently active movement phase. */
  movementPhaseIdx?: number;
  /** Elapsed ms in the current movement phase. */
  movementPhaseMs?: number;
  /** If true, movement phases pick randomly instead of sequentially. */
  randomMovement?: boolean;
  /** Whether this boss is mid-charge (see BossMovementPhase.chargeMs). */
  isCharging?: boolean;
  /** Elapsed charge-up time (ms). 0..chargeMs. */
  chargeProgressMs?: number;
  /** Anchor point the current phase aims its motion around. */
  movementAnchor?: { x: number; y: number };
  /** Transient sub-step index used by multi-corner patterns (square). */
  movementStep?: number;
  /** "Big" bosses drift slower. Set from BossDefinition; 1 = default, <1 = slower. */
  speedMultiplier?: number;
  /** Target position for the current phase tick. */
  targetPos?: { x: number; y: number };
}

export interface LevelState {
  levelNumber: number;
  difficulty: DifficultyScaling;
  enemies: Enemy[];
  boss?: BossState;
  isBossPhase: boolean;
  enemiesSpawned: number;
  enemiesDefeated: number;
  durationMs: number;
  targetDurationMs: number;
  isComplete: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Statistics
// ──────────────────────────────────────────────────────────────────────────────

export interface RunStats {
  sessionId: string;
  startTimeMs: number;
  endTimeMs?: number;
  levelReached: number;
  timeAliveMs: number;
  enemiesKilled: number;
  gunUpgradeAchieved: number;
  shieldsCollected: number;
  extraLivesCollected: number;
  consecutiveHits: number;
  peakConsecutiveHits: number;
  longestTimeWithoutDamageSec: number;
  totalDamageReceived: number;
  score: number;
  gameOverReason?: "no-lives" | "level-timeout";
}

export interface AllTimeStats {
  topScore: number;
  topScoreDate: string;
  furthestLevel: number;
  bestGunUpgrade: number;
  totalEnemiesKilled: number;
  totalGamesPlayed: number;
  longestTimeAlive: number;
  longestTimeSafeSec: number;
  totalSessionsCompleted: number;
  averageScore: number;
  averageLevelReached: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Game State
// ──────────────────────────────────────────────────────────────────────────────

export type ScreenType =
  | "main-menu"
  | "gameplay"
  | "level-clear"
  | "game-over"
  | "stats"
  | "pause"
  | "starmap"
  | "shipyard";

/**
 * Dev-only cheat payload parsed from URL query params. Every field is optional
 * and unrecognised params are ignored. The parse + apply code lives in
 * `src/dev/cheats.ts` and is tree-shaken out of production bundles by the
 * `import.meta.env.DEV` guard in `main.ts`.
 */
export interface DevCheats {
  /** Permanent damage immunity. */
  god?: boolean;
  /** Override starting lives. */
  lives?: number;
  /** Override starting HP. */
  health?: number;
  /** Force-equip a weapon type. */
  weapon?: PlayerWeaponType;
  /** Force-set the weapon upgrade level (1–5). */
  weaponLevel?: number;
  /** Start with the shield up. */
  shield?: boolean;
  /** Speed multiplier (e.g. 2 = twice as fast). */
  speed?: number;
  /** Mega-laser active window on spawn (ms). */
  megaLaserMs?: number;
  /** Start level number (1+). */
  startLevel?: number;
  /** When true, skip the main menu and drop straight into gameplay. */
  autostart?: boolean;
  /** Force a specific boss id regardless of level. */
  boss?: string;
  /** Unlock every part in the registry (campaign shipyard testing). */
  unlockParts?: boolean;
  /** Override campaign credits balance. */
  credits?: number;

  // ── Solar system cheats (open-world mode) ──────────────────────────────
  /** Set the player's credit balance to this value at session start. */
  cheat_credits?: number;
  /** Set the player's alloy inventory to this value at session start. */
  cheat_alloys?: number;
  /** Set the player's power crystal inventory to this value at session start. */
  cheat_crystals?: number;
  /**
   * Unlock all capital ship upgrade tiers from 1 up to and including this
   * value (max 11) for the current session.
   */
  cheat_tier?: number;
  /** Set all faction reputation standings to this value at session start. */
  cheat_reputation?: number;
  /** Start the solar system session docked at this location id. */
  cheat_location?: string;
  /** Override the solar system generation seed (overrides saved seed). */
  cheat_system_seed?: number;
}

export interface GameState {
  screen: ScreenType;
  currentRunStats: RunStats;
  allTimeStats: AllTimeStats;
  playerState: PlayerState;
  levelState: LevelState;
  isPaused: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Damage
// ──────────────────────────────────────────────────────────────────────────────

export interface DamageResult {
  blocked: boolean; // true if shield absorbed
  health: number;
  died: boolean;
}

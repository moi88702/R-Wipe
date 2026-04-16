/**
 * Core TypeScript interfaces for R-Wipe Spaceship Game.
 * These types define the data models shared across all game systems.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Input
// ──────────────────────────────────────────────────────────────────────────────

export interface InputState {
  moveUp: boolean;
  moveDown: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  fire: boolean;
  pause: boolean;
  menuConfirm: boolean;
  menuBack: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Player
// ──────────────────────────────────────────────────────────────────────────────

export interface ShieldState {
  active: boolean;
  displayValue: number; // 0–100, visual indicator
  absorptionCapacity: number; // 1 hit typically
}

export interface WeaponState {
  upgradeLevel: number; // 1–5
  fireRateMs: number; // ms between shots
  lastFireTimeMs: number;
  projectileDamage: number;
  projectileSpeed: number; // px/frame
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
}

// ──────────────────────────────────────────────────────────────────────────────
// Enemies
// ──────────────────────────────────────────────────────────────────────────────

export type EnemyType = "grunt" | "spinner" | "stalker";

export interface AttackPattern {
  type: "straight" | "radial" | "homing" | "spread";
  bulletsPerShot: number;
  spreadAngleDegrees: number;
  projectileSpeed: number;
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
}

// ──────────────────────────────────────────────────────────────────────────────
// Power-Ups
// ──────────────────────────────────────────────────────────────────────────────

export type PowerUpType = "weapon-upgrade" | "shield" | "extra-life" | "health-recovery";

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

export interface BossState extends Enemy {
  phases: BossPhase[];
  currentPhase: number; // 0-indexed
  phaseHealthThresholds: number[]; // e.g. [100, 50, 0] for 2-phase boss
  transitionTimer: number; // ms, animation time
  isTransitioning: boolean;
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
  | "pause";

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

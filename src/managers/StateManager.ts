/**
 * StateManager – single source of truth for all runtime game state.
 *
 * Provides read-only accessors so that consumers cannot mutate shared state
 * unexpectedly.  Mutations go through explicit setter/update methods.
 */

import type {
  AllTimeStats,
  EnemyType,
  GameState,
  LevelState,
  PlayerState,
  RunStats,
  ScreenType,
} from "../types/index";

// ── Factories ─────────────────────────────────────────────────────────────

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createDefaultRunStats(): RunStats {
  return {
    sessionId: makeSessionId(),
    startTimeMs: Date.now(),
    levelReached: 1,
    timeAliveMs: 0,
    enemiesKilled: 0,
    gunUpgradeAchieved: 1,
    shieldsCollected: 0,
    extraLivesCollected: 0,
    consecutiveHits: 0,
    peakConsecutiveHits: 0,
    longestTimeWithoutDamageSec: 0,
    totalDamageReceived: 0,
    score: 0,
  };
}

function createDefaultAllTimeStats(): AllTimeStats {
  return {
    topScore: 0,
    topScoreDate: "",
    furthestLevel: 0,
    bestGunUpgrade: 1,
    totalEnemiesKilled: 0,
    totalGamesPlayed: 0,
    longestTimeAlive: 0,
    longestTimeSafeSec: 0,
    totalSessionsCompleted: 0,
    averageScore: 0,
    averageLevelReached: 0,
  };
}

function createDefaultPlayerState(viewportHeight: number): PlayerState {
  return {
    position: { x: 200, y: viewportHeight / 2 },
    velocity: { x: 0, y: 0 },
    health: 100,
    lives: 3,
    shield: { active: false, displayValue: 0, absorptionCapacity: 1 },
    weapon: {
      upgradeLevel: 1,
      fireRateMs: 300,
      lastFireTimeMs: 0,
      projectileDamage: 10,
      projectileSpeed: 10,
    },
    invulnerabilityTimer: 0,
    isAlive: true,
    width: 50,
    height: 32,
  };
}

function createDefaultLevelState(levelNumber: number): LevelState {
  const unlockedTypes: EnemyType[] =
    levelNumber >= 7
      ? ["grunt", "spinner", "stalker"]
      : levelNumber >= 3
        ? ["grunt", "spinner"]
        : ["grunt"];

  // Level duration scales from ~60 s (level 1) to ~600 s (level 10+)
  const targetDurationMs = Math.min(
    60_000 * levelNumber,
    600_000,
  );

  return {
    levelNumber,
    difficulty: {
      enemyCountBase: 5 + (levelNumber - 1) * 3,
      enemyCountMultiplier: 1 + (levelNumber - 1) * 0.2,
      enemyFireRateMultiplier: 1 + (levelNumber - 1) * 0.1,
      enemyHealthMultiplier: 1 + (levelNumber - 1) * 0.15,
      enemySpeedMultiplier: 1 + (levelNumber - 1) * 0.1,
      newEnemyTypesUnlocked: unlockedTypes,
    },
    enemies: [],
    isBossPhase: false,
    enemiesSpawned: 0,
    enemiesDefeated: 0,
    durationMs: 0,
    targetDurationMs,
    isComplete: false,
  };
}

// ── StateManager ──────────────────────────────────────────────────────────

export class StateManager {
  private state: GameState;
  private readonly viewportHeight: number;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportHeight = viewportHeight;
    this.state = {
      screen: "main-menu",
      currentRunStats: createDefaultRunStats(),
      allTimeStats: createDefaultAllTimeStats(),
      playerState: createDefaultPlayerState(viewportHeight),
      levelState: createDefaultLevelState(1),
      isPaused: false,
      viewportWidth,
      viewportHeight,
    };
  }

  // ── Read-only accessors ────────────────────────────────────────────────

  getGameState(): Readonly<GameState> {
    return this.state;
  }

  getCurrentRunStats(): Readonly<RunStats> {
    return this.state.currentRunStats;
  }

  getAllTimeStats(): Readonly<AllTimeStats> {
    return this.state.allTimeStats;
  }

  getScreen(): ScreenType {
    return this.state.screen;
  }

  // ── Mutators ──────────────────────────────────────────────────────────

  setScreen(screen: ScreenType): void {
    this.state = { ...this.state, screen };
  }

  setIsPaused(paused: boolean): void {
    this.state = { ...this.state, isPaused: paused };
  }

  updateRunStats(partial: Partial<RunStats>): void {
    this.state = {
      ...this.state,
      currentRunStats: { ...this.state.currentRunStats, ...partial },
    };
  }

  updatePlayerState(partial: Partial<PlayerState>): void {
    this.state = {
      ...this.state,
      playerState: { ...this.state.playerState, ...partial },
    };
  }

  updateLevelState(partial: Partial<LevelState>): void {
    this.state = {
      ...this.state,
      levelState: { ...this.state.levelState, ...partial },
    };
  }

  /** Reset all in-run state and start fresh from level 1. */
  resetRunStats(): void {
    this.state = {
      ...this.state,
      currentRunStats: createDefaultRunStats(),
      playerState: createDefaultPlayerState(this.viewportHeight),
      levelState: createDefaultLevelState(1),
    };
  }

  /**
   * Stamp the end time on the current run and merge into all-time stats.
   * Call this when transitioning to the game-over screen.
   */
  finalizeRun(reason: "no-lives" | "level-timeout"): void {
    const runStats: RunStats = {
      ...this.state.currentRunStats,
      endTimeMs: Date.now(),
      gameOverReason: reason,
    };

    const prev = this.state.allTimeStats;
    const sessions = prev.totalSessionsCompleted;

    const updatedAllTime: AllTimeStats = {
      topScore: Math.max(prev.topScore, runStats.score),
      topScoreDate:
        runStats.score > prev.topScore
          ? new Date().toISOString()
          : prev.topScoreDate,
      furthestLevel: Math.max(prev.furthestLevel, runStats.levelReached),
      bestGunUpgrade: Math.max(prev.bestGunUpgrade, runStats.gunUpgradeAchieved),
      totalEnemiesKilled: prev.totalEnemiesKilled + runStats.enemiesKilled,
      totalGamesPlayed: prev.totalGamesPlayed + 1,
      longestTimeAlive: Math.max(prev.longestTimeAlive, runStats.timeAliveMs),
      longestTimeSafeSec: Math.max(
        prev.longestTimeSafeSec,
        runStats.longestTimeWithoutDamageSec,
      ),
      totalSessionsCompleted: sessions + 1,
      averageScore:
        (prev.averageScore * sessions + runStats.score) / (sessions + 1),
      averageLevelReached:
        (prev.averageLevelReached * sessions + runStats.levelReached) /
        (sessions + 1),
    };

    this.state = {
      ...this.state,
      currentRunStats: runStats,
      allTimeStats: updatedAllTime,
    };
  }
}

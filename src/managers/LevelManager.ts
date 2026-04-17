/**
 * LevelManager – drives wave spawning, boss triggering, and level completion.
 */

import type { EnemyType, LevelState } from "../types/index";
import type { EnemyManager } from "./EnemyManager";

/** Minimum cadence between regular enemy spawns (ms). */
const SPAWN_INTERVAL_MS = 1_400;

/** Max regular enemies alive simultaneously. */
const MAX_CONCURRENT = 5;

export class LevelManager {
  private spawnTimer = 0;
  private spawnedCount = 0;
  private totalToSpawn = 0;
  private levelStarted = false;
  private bossSpawned = false;
  private viewportHeight = 720;

  constructor(viewportHeight = 720) {
    this.viewportHeight = viewportHeight;
  }

  startLevel(level: LevelState, enemyManager: EnemyManager): void {
    this.spawnTimer = 600; // small grace before first spawn
    this.spawnedCount = 0;
    this.totalToSpawn = level.difficulty.enemyCountBase;
    this.levelStarted = true;
    this.bossSpawned = false;
    enemyManager.initialize();
  }

  update(
    deltaTimeMs: number,
    level: LevelState,
    enemyManager: EnemyManager,
  ): { enemiesSpawned: number } {
    if (!this.levelStarted) return { enemiesSpawned: 0 };

    let spawnedThisTick = 0;
    this.spawnTimer -= deltaTimeMs;

    const liveRegular = enemyManager.getRegularEnemyCount();

    if (
      this.spawnedCount < this.totalToSpawn &&
      this.spawnTimer <= 0 &&
      liveRegular < MAX_CONCURRENT
    ) {
      const type = pickEnemyType(level.difficulty.newEnemyTypesUnlocked, level.levelNumber);
      const y = 120 + Math.random() * (this.viewportHeight - 240);
      enemyManager.spawnEnemy(type, y, level);
      this.spawnedCount += 1;
      spawnedThisTick += 1;
      this.spawnTimer = SPAWN_INTERVAL_MS;
    }

    // When all regular enemies are spawned AND defeated, spawn boss
    if (
      !this.bossSpawned &&
      this.spawnedCount >= this.totalToSpawn &&
      enemyManager.hasNoRegularEnemies()
    ) {
      enemyManager.spawnBoss(level.levelNumber);
      this.bossSpawned = true;
    }

    return { enemiesSpawned: spawnedThisTick };
  }

  /** Level is complete once the boss has been spawned and defeated. */
  isLevelComplete(enemyManager: EnemyManager): boolean {
    return this.bossSpawned && enemyManager.isBossDefeated();
  }

  isBossPhase(enemyManager: EnemyManager): boolean {
    return this.bossSpawned && !enemyManager.isBossDefeated();
  }

  getSpawnedCount(): number {
    return this.spawnedCount;
  }

  getTotalToSpawn(): number {
    return this.totalToSpawn;
  }
}

/**
 * Base spawn weight for each enemy type. Grunt is the bread-and-butter enemy;
 * specialists (weapon-showcase, mobile) get lower weights so they feel like
 * "an elite in the mix" rather than the default. Weights are multiplied by a
 * level-based ramp so late-game runs skew more exotic.
 */
const ENEMY_BASE_WEIGHTS: Record<EnemyType, number> = {
  grunt: 10,
  spinner: 7,
  stalker: 5,
  darter: 3,
  orbiter: 3,
  lancer: 2,
  cannoneer: 2,
  torpedoer: 1.5,
  pulsar: 1.5,
};

/** Multiplier applied to specialist weights — grows with level. */
function specialistRamp(level: number): number {
  return Math.min(2.0, 0.5 + (level - 1) * 0.15);
}

function pickEnemyType(unlocked: ReadonlyArray<EnemyType>, levelNumber: number): EnemyType {
  if (unlocked.length === 0) return "grunt";
  const ramp = specialistRamp(levelNumber);
  let total = 0;
  const weights: number[] = unlocked.map((t) => {
    const base = ENEMY_BASE_WEIGHTS[t] ?? 1;
    // grunt + spinner are "regulars"; everything else scales up with level.
    const w = t === "grunt" || t === "spinner" ? base : base * ramp;
    total += w;
    return w;
  });
  let r = Math.random() * total;
  for (let i = 0; i < unlocked.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return unlocked[i]!;
  }
  return unlocked[unlocked.length - 1] ?? "grunt";
}

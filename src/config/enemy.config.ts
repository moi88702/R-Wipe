/**
 * Enemy type definitions and wave spawn configurations.
 * Pure data — no logic.
 */

import { EnemyType } from '../utils/constants';

// ============================================================================
// ENEMY SIZES (pixels)
// ============================================================================

export const ENEMY_SIZES: Record<EnemyType, { width: number; height: number }> = {
  [EnemyType.GRUNT]:       { width: 20, height: 20 },
  [EnemyType.INTERCEPTOR]: { width: 25, height: 15 },
  [EnemyType.HEAVY]:       { width: 35, height: 25 },
};

// ============================================================================
// ENEMY HEALTH
// ============================================================================

export const ENEMY_HEALTH: Record<EnemyType, number> = {
  [EnemyType.GRUNT]:       1,  // 1 hit to kill (10 damage projectile, 10 hp)
  [EnemyType.INTERCEPTOR]: 1,
  [EnemyType.HEAVY]:       2,  // 2 hits to kill
};

export const ENEMY_MAX_HEALTH: Record<EnemyType, number> = {
  [EnemyType.GRUNT]:       10,
  [EnemyType.INTERCEPTOR]: 10,
  [EnemyType.HEAVY]:       20,
};

// ============================================================================
// ENEMY POINT VALUES
// ============================================================================

export const ENEMY_POINT_VALUES: Record<EnemyType, number> = {
  [EnemyType.GRUNT]:       5,
  [EnemyType.INTERCEPTOR]: 10,
  [EnemyType.HEAVY]:       15,
};

// ============================================================================
// ENEMY MOVEMENT SPEEDS (pixels per second)
// ============================================================================

export const ENEMY_SPEEDS: Record<EnemyType, number> = {
  [EnemyType.GRUNT]:       80,
  [EnemyType.INTERCEPTOR]: 130,
  [EnemyType.HEAVY]:       50,
};

// ============================================================================
// ENEMY FIRE RATES (ms between shots)
// ============================================================================

export const ENEMY_FIRE_RATES_MS: Record<EnemyType, number> = {
  [EnemyType.GRUNT]:       2000,  // moderate
  [EnemyType.INTERCEPTOR]: 1500,  // burst: 2 projectiles, faster
  [EnemyType.HEAVY]:       3000,  // slow, heavy projectile
};

/** Interceptors fire a burst of 2 projectiles per fire event */
export const INTERCEPTOR_BURST_COUNT = 2;

// ============================================================================
// POWER-UP DROP
// ============================================================================

/** Probability (0–1) that a defeated enemy drops a power-up */
export const ENEMY_POWERUP_DROP_CHANCE = 0.25;

// ============================================================================
// WAVE CONFIGURATIONS
// (waveNumber is 1-indexed; delay is ms from wave start)
// ============================================================================

export interface EnemySpawnEntry {
  type: EnemyType;
  /** Milliseconds after wave start before this enemy spawns */
  delay: number;
}

export interface WaveDefinition {
  waveNumber: number;
  spawns: EnemySpawnEntry[];
}

export const WAVE_CONFIGS: WaveDefinition[] = [
  // ─── Wave 1: Grunts only ────────────────────────────────────────────────
  {
    waveNumber: 1,
    spawns: [
      { type: EnemyType.GRUNT, delay: 0 },
      { type: EnemyType.GRUNT, delay: 2000 },
      { type: EnemyType.GRUNT, delay: 4000 },
      { type: EnemyType.GRUNT, delay: 6000 },
    ],
  },
  // ─── Wave 2: Grunts only (larger group) ──────────────────────────────────
  {
    waveNumber: 2,
    spawns: [
      { type: EnemyType.GRUNT, delay: 0 },
      { type: EnemyType.GRUNT, delay: 2000 },
      { type: EnemyType.GRUNT, delay: 4000 },
      { type: EnemyType.GRUNT, delay: 6000 },
      { type: EnemyType.GRUNT, delay: 8000 },
    ],
  },
  // ─── Wave 3: Grunts + first Interceptors ─────────────────────────────────
  {
    waveNumber: 3,
    spawns: [
      { type: EnemyType.GRUNT,       delay: 0 },
      { type: EnemyType.GRUNT,       delay: 2000 },
      { type: EnemyType.INTERCEPTOR, delay: 4000 },
      { type: EnemyType.GRUNT,       delay: 6000 },
      { type: EnemyType.INTERCEPTOR, delay: 8000 },
    ],
  },
  // ─── Wave 4: Mixed Grunts + Interceptors ─────────────────────────────────
  {
    waveNumber: 4,
    spawns: [
      { type: EnemyType.GRUNT,       delay: 0 },
      { type: EnemyType.INTERCEPTOR, delay: 2000 },
      { type: EnemyType.GRUNT,       delay: 4000 },
      { type: EnemyType.INTERCEPTOR, delay: 6000 },
      { type: EnemyType.GRUNT,       delay: 8000 },
      { type: EnemyType.GRUNT,       delay: 10000 },
    ],
  },
  // ─── Wave 5: Interceptors + first Heavy ──────────────────────────────────
  {
    waveNumber: 5,
    spawns: [
      { type: EnemyType.INTERCEPTOR, delay: 0 },
      { type: EnemyType.INTERCEPTOR, delay: 2000 },
      { type: EnemyType.HEAVY,       delay: 4000 },
      { type: EnemyType.GRUNT,       delay: 6000 },
      { type: EnemyType.GRUNT,       delay: 8000 },
    ],
  },
  // ─── Wave 6: Mixed mid-difficulty ────────────────────────────────────────
  {
    waveNumber: 6,
    spawns: [
      { type: EnemyType.GRUNT,       delay: 0 },
      { type: EnemyType.INTERCEPTOR, delay: 2000 },
      { type: EnemyType.HEAVY,       delay: 4000 },
      { type: EnemyType.INTERCEPTOR, delay: 6000 },
      { type: EnemyType.HEAVY,       delay: 8000 },
      { type: EnemyType.GRUNT,       delay: 10000 },
    ],
  },
  // ─── Wave 7: Heavies + Interceptors, high pressure ───────────────────────
  {
    waveNumber: 7,
    spawns: [
      { type: EnemyType.HEAVY,       delay: 0 },
      { type: EnemyType.INTERCEPTOR, delay: 2000 },
      { type: EnemyType.INTERCEPTOR, delay: 4000 },
      { type: EnemyType.HEAVY,       delay: 6000 },
      { type: EnemyType.INTERCEPTOR, delay: 8000 },
    ],
  },
  // ─── Wave 8: Final wave before boss ──────────────────────────────────────
  {
    waveNumber: 8,
    spawns: [
      { type: EnemyType.HEAVY,       delay: 0 },
      { type: EnemyType.HEAVY,       delay: 2000 },
      { type: EnemyType.INTERCEPTOR, delay: 4000 },
      { type: EnemyType.INTERCEPTOR, delay: 6000 },
      { type: EnemyType.HEAVY,       delay: 8000 },
      { type: EnemyType.INTERCEPTOR, delay: 10000 },
    ],
  },
];

/**
 * Game-wide enums and magic number constants.
 * Pure data — no logic.
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum SceneType {
  MENU = 'MENU',
  LEVEL = 'LEVEL',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY',
}

export enum EnemyType {
  GRUNT = 'GRUNT',
  INTERCEPTOR = 'INTERCEPTOR',
  HEAVY = 'HEAVY',
}

export enum PowerUpType {
  RAPID_FIRE = 'RAPID_FIRE',
  SHIELD = 'SHIELD',
  SPREAD_SHOT = 'SPREAD_SHOT',
}

export enum BossPhase {
  SPREAD_FIRE = 'SPREAD_FIRE',
  HOMING = 'HOMING',
  DASH = 'DASH',
}

export enum CollisionType {
  PLAYER_ENEMY = 'PLAYER_ENEMY',
  PLAYER_PROJECTILE = 'PLAYER_PROJECTILE',
  PLAYER_POWERUP = 'PLAYER_POWERUP',
  ENEMY_PROJECTILE = 'ENEMY_PROJECTILE',
  BOSS_PROJECTILE = 'BOSS_PROJECTILE',
  PLAYER_BOSS = 'PLAYER_BOSS',
}

export enum ProjectileOwner {
  PLAYER = 'PLAYER',
  ENEMY = 'ENEMY',
  BOSS = 'BOSS',
}

export enum GameEventType {
  PLAYER_FIRED = 'PLAYER_FIRED',
  ENEMY_DEFEATED = 'ENEMY_DEFEATED',
  PLAYER_HIT = 'PLAYER_HIT',
  PLAYER_DIED = 'PLAYER_DIED',
  WAVE_COMPLETED = 'WAVE_COMPLETED',
  BOSS_SPAWNED = 'BOSS_SPAWNED',
  BOSS_DEFEATED = 'BOSS_DEFEATED',
  POWER_UP_COLLECTED = 'POWER_UP_COLLECTED',
  POWER_UP_EXPIRED = 'POWER_UP_EXPIRED',
  SCORE_CHANGED = 'SCORE_CHANGED',
  LIVES_CHANGED = 'LIVES_CHANGED',
}

/**
 * Tests for game.config.ts
 *
 * Verifies that the core constants required by the task specification
 * (1280×720 resolution, 60 FPS, black background) are correctly exported.
 */

import { describe, it, expect } from 'vitest';
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  TARGET_FPS,
  BACKGROUND_COLOR,
  SAFE_ZONE_MARGIN,
  PLAYER_MOVEMENT_MIN_Y,
  PLAYER_MOVEMENT_MAX_Y,
  PLAYER_MOVEMENT_MIN_X,
  PLAYER_MOVEMENT_MAX_X,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SPEED,
  PLAYER_STARTING_LIVES,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
  PLAYER_BASE_FIRE_RATE_MS,
  PLAYER_RESPAWN_DELAY_MS,
  PLAYER_RESPAWN_INVINCIBILITY_MS,
  PROJECTILE_WIDTH,
  PROJECTILE_HEIGHT,
  PLAYER_PROJECTILE_SPEED,
  ENEMY_PROJECTILE_SPEED,
  PLAYER_PROJECTILE_DAMAGE,
  ENEMY_PROJECTILE_DAMAGE,
  SPREAD_SHOT_ANGLE_DEGREES,
  TOTAL_WAVES,
  INTER_WAVE_DELAY_MS,
  ENEMY_SPAWN_INTERVAL_MS,
  HIGH_SCORE_STORAGE_KEY,
  HIGH_SCORE_DEFAULT,
} from './game.config';

describe('game.config — screen / viewport', () => {
  it('exports SCREEN_WIDTH of 1280', () => {
    expect(SCREEN_WIDTH).toBe(1280);
  });

  it('exports SCREEN_HEIGHT of 720', () => {
    expect(SCREEN_HEIGHT).toBe(720);
  });

  it('exports TARGET_FPS of 60', () => {
    expect(TARGET_FPS).toBe(60);
  });

  it('exports BACKGROUND_COLOR as black (0x000000)', () => {
    expect(BACKGROUND_COLOR).toBe(0x000000);
  });
});

describe('game.config — safe zone / movement bounds', () => {
  it('defines a positive SAFE_ZONE_MARGIN', () => {
    expect(SAFE_ZONE_MARGIN).toBeGreaterThan(0);
  });

  it('PLAYER_MOVEMENT_MIN_Y is within screen height', () => {
    expect(PLAYER_MOVEMENT_MIN_Y).toBeGreaterThan(0);
    expect(PLAYER_MOVEMENT_MIN_Y).toBeLessThan(SCREEN_HEIGHT);
  });

  it('PLAYER_MOVEMENT_MAX_Y is less than SCREEN_HEIGHT', () => {
    expect(PLAYER_MOVEMENT_MAX_Y).toBeLessThan(SCREEN_HEIGHT);
  });

  it('PLAYER_MOVEMENT_MIN_X equals SAFE_ZONE_MARGIN', () => {
    expect(PLAYER_MOVEMENT_MIN_X).toBe(SAFE_ZONE_MARGIN);
  });

  it('PLAYER_MOVEMENT_MAX_X equals SCREEN_WIDTH minus SAFE_ZONE_MARGIN', () => {
    expect(PLAYER_MOVEMENT_MAX_X).toBe(SCREEN_WIDTH - SAFE_ZONE_MARGIN);
  });
});

describe('game.config — player', () => {
  it('exports positive PLAYER_WIDTH and PLAYER_HEIGHT', () => {
    expect(PLAYER_WIDTH).toBeGreaterThan(0);
    expect(PLAYER_HEIGHT).toBeGreaterThan(0);
  });

  it('exports a positive PLAYER_SPEED', () => {
    expect(PLAYER_SPEED).toBeGreaterThan(0);
  });

  it('starts with 3 lives', () => {
    expect(PLAYER_STARTING_LIVES).toBe(3);
  });

  it('PLAYER_SPAWN_X is the horizontal center of the screen', () => {
    expect(PLAYER_SPAWN_X).toBe(SCREEN_WIDTH / 2);
  });

  it('PLAYER_SPAWN_Y is within the lower portion of the screen', () => {
    expect(PLAYER_SPAWN_Y).toBeGreaterThan(SCREEN_HEIGHT / 2);
    expect(PLAYER_SPAWN_Y).toBeLessThan(SCREEN_HEIGHT);
  });

  it('exports a positive PLAYER_BASE_FIRE_RATE_MS', () => {
    expect(PLAYER_BASE_FIRE_RATE_MS).toBeGreaterThan(0);
  });

  it('exports positive respawn timing values', () => {
    expect(PLAYER_RESPAWN_DELAY_MS).toBeGreaterThan(0);
    expect(PLAYER_RESPAWN_INVINCIBILITY_MS).toBeGreaterThan(0);
  });
});

describe('game.config — projectiles', () => {
  it('exports positive projectile dimensions', () => {
    expect(PROJECTILE_WIDTH).toBeGreaterThan(0);
    expect(PROJECTILE_HEIGHT).toBeGreaterThan(0);
  });

  it('player projectiles travel faster than enemy projectiles', () => {
    expect(PLAYER_PROJECTILE_SPEED).toBeGreaterThan(ENEMY_PROJECTILE_SPEED);
  });

  it('exports positive projectile damage values', () => {
    expect(PLAYER_PROJECTILE_DAMAGE).toBeGreaterThan(0);
    expect(ENEMY_PROJECTILE_DAMAGE).toBeGreaterThan(0);
  });

  it('exports a positive SPREAD_SHOT_ANGLE_DEGREES', () => {
    expect(SPREAD_SHOT_ANGLE_DEGREES).toBeGreaterThan(0);
  });
});

describe('game.config — waves', () => {
  it('has 8 total waves', () => {
    expect(TOTAL_WAVES).toBe(8);
  });

  it('exports positive wave timing values', () => {
    expect(INTER_WAVE_DELAY_MS).toBeGreaterThan(0);
    expect(ENEMY_SPAWN_INTERVAL_MS).toBeGreaterThan(0);
  });
});

describe('game.config — high score', () => {
  it('exports a non-empty HIGH_SCORE_STORAGE_KEY string', () => {
    expect(typeof HIGH_SCORE_STORAGE_KEY).toBe('string');
    expect(HIGH_SCORE_STORAGE_KEY.length).toBeGreaterThan(0);
  });

  it('exports HIGH_SCORE_DEFAULT of 0', () => {
    expect(HIGH_SCORE_DEFAULT).toBe(0);
  });
});

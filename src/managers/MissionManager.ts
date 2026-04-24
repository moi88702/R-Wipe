/**
 * MissionManager — thin adapter that turns a campaign MissionSpec into the
 * LevelState used by LevelManager. Keeps the campaign/arcade divide clean:
 * the existing LevelManager doesn't know about missions, and MissionSpec
 * doesn't know about difficulty curves.
 *
 * Pure logic; no Pixi or manager imports.
 */

import type { EnemyType, LevelState } from "../types/index";
import type { MissionSpec } from "../types/campaign";

const DEFAULT_PROGRESSION: Record<number, EnemyType[]> = {
  1: ["grunt"],
  2: ["grunt", "darter"],
  3: ["grunt", "darter", "spinner"],
  4: ["grunt", "spinner", "darter", "orbiter", "stalker"],
  5: ["grunt", "spinner", "stalker", "orbiter", "lancer"],
};

const FULL_ROSTER: EnemyType[] = [
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

/**
 * Build a LevelState from a MissionSpec. Difficulty scaling follows the same
 * curve as arcade mode's makeLevelState, but with a mission-difficulty bonus
 * multiplier so a 5-star mission lands harder than its bare `levelNumber`.
 */
export function missionToLevelState(spec: MissionSpec): LevelState {
  const roster = spec.enemyRoster ?? DEFAULT_PROGRESSION[spec.levelNumber] ?? FULL_ROSTER;
  const difficultyBonus = 1 + (spec.difficulty - 1) * 0.08;
  const n = spec.levelNumber;

  return {
    levelNumber: n,
    difficulty: {
      enemyCountBase: Math.round((5 + (n - 1) * 3) * difficultyBonus),
      enemyCountMultiplier: (1 + (n - 1) * 0.2) * difficultyBonus,
      enemyFireRateMultiplier: (1 + (n - 1) * 0.1) * difficultyBonus,
      enemyHealthMultiplier: (1 + (n - 1) * 0.15) * difficultyBonus,
      enemySpeedMultiplier: 1 + (n - 1) * 0.1,
      newEnemyTypesUnlocked: roster,
    },
    enemies: [],
    isBossPhase: false,
    enemiesSpawned: 0,
    enemiesDefeated: 0,
    durationMs: 0,
    targetDurationMs: Math.min(60_000 * n, 600_000),
    isComplete: false,
  };
}

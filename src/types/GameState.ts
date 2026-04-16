/**
 * GameState – focused re-export for the core game state types.
 *
 * The canonical definitions live in src/types/index.ts.  This module gives
 * consumers a single, purposeful import point for game-state-related types.
 */

export type {
  GameState,
  ScreenType,
  RunStats,
  AllTimeStats,
  PlayerState,
  LevelState,
} from "./index";

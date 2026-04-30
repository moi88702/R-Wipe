/**
 * Game system managers — entry point.
 *
 * This module will export all manager classes:
 *  - PlayerManager   — movement, shooting, power-up application
 *  - EnemyManager    — spawn, patrol, attack AI
 *  - LevelManager    — level progression, difficulty scaling, boss phases
 *  - PowerUpManager  — spawn, collision, effect application
 *  - StatsService    — run + all-time stat persistence via localStorage
 *  - DockingManager  — proximity detection, permission checks, dock/undock
 *                      state transitions, and UI trigger logic
 *
 * Implementations will be added as each system is built out.
 */

export { DockingManager } from "./DockingManager";
export type { PreDockSnapshot, DockResult, UndockResult } from "./DockingManager";

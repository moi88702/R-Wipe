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
 *  - LocationManager — NPC dialogue, shop inventory, and trade transactions
 *                      for the docked station experience
 *  - StationUI       — menu-driven docked-station UI state machine
 *                      (dock menu, NPC dialogue, shop, shipyard, undock)
 *
 * Implementations will be added as each system is built out.
 */

export { DockingManager } from "./DockingManager";
export type { PreDockSnapshot, DockResult, UndockResult } from "./DockingManager";

export { LocationManager } from "./LocationManager";
export type {
  NPCDefinition,
  ShopItem,
  NpcDialogueState,
  DialogueOption,
  DialoguePhase,
  PurchaseResult,
  SellResult,
  DialogueTransition,
} from "./LocationManager";

export { StationUI } from "./StationUI";
export type {
  DockScreen,
  DockMenuOption,
  DockSessionState,
} from "./StationUI";

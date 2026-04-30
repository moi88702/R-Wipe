export * from "./CombatManager";
export * from "./registries";
export * from "./types";
export { TargetLockManager } from "./TargetLockManager";
export type { EnemyInfo, LockAttemptResult } from "./TargetLockManager";
export { EnemyAISystem } from "./EnemyAISystem";
export type { EnemyAIState, EnemyAITickResult } from "./EnemyAISystem";

// Managers will be exported here as they're implemented:
// export { ShipControlManager } from './ShipControlManager';
// export { DockingManager } from './DockingManager';

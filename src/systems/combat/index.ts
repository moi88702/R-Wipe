export * from "./CombatManager";
export * from "./registries";
export * from "./types";
export { TargetLockManager } from "./TargetLockManager";
export type { EnemyInfo, LockAttemptResult } from "./TargetLockManager";
export { EnemyAISystem } from "./EnemyAISystem";
export type { EnemyAIState, EnemyAITickResult } from "./EnemyAISystem";

// Space Combat Control System — implemented managers:
export { CombatSystem, ABILITY_KEYS } from "../CombatSystem";
export type {
  AbilityKey,
  CombatInput,
  WeaponFireResult,
  AbilityActivationResult,
  CombatTickResult,
} from "../CombatSystem";

// Managers to be exported as implemented:
// export { ShipControlManager } from './ShipControlManager';
// export { DockingManager } from './DockingManager';

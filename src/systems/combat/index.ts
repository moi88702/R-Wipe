export * from "./CombatManager";
export * from "./registries";
export * from "./types";
export { TargetLockManager } from "./TargetLockManager";
export type { EnemyInfo, LockAttemptResult } from "./TargetLockManager";

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
// export { EnemyAISystem } from './EnemyAISystem';
// export { DockingManager } from './DockingManager';

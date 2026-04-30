export * from "./CombatManager";
export * from "./registries";
export * from "./types";

// Space Combat Control System — implemented managers:
export { CombatSystem } from "../CombatSystem";
export type {
  AbilityKey,
  CombatInput,
  WeaponFireResult,
  AbilityActivationResult,
  CombatTickResult,
} from "../CombatSystem";

// Managers to be exported as implemented:
// export { TargetLockManager } from './TargetLockManager';
// export { EnemyAISystem } from './EnemyAISystem';
// export { DockingManager } from './DockingManager';

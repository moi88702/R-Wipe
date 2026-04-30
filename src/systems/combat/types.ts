// Space Combat Control System — Core Type Definitions
// Establishes contracts between all combat managers

export enum ShipClass {
	FIGHTER = "fighter",
	CORVETTE = "corvette",
	DESTROYER = "destroyer",
	CAPITAL = "capital",
}

export enum WeaponType {
	LASER = "laser",
	MISSILE = "missile",
	PLASMA = "plasma",
	KINETIC = "kinetic",
}

export enum AbilityType {
	SHIELD_BOOST = "shield_boost",
	EVASIVE_MANEUVER = "evasive_maneuver",
	TARGETING_LOCK = "targeting_lock",
	EMERGENCY_WARP = "emergency_warp",
}

// ── Scanner & Targeting ───────────────────────────────────────────────────────

/**
 * Scanner equipment configuration.
 *
 * Determines what targets a ship can lock, how far the scanner reaches, and
 * which celestial body types it can see through (penetration). Both the player
 * and individual enemies carry their own ScannerEquipment.
 *
 * Penetration levels:
 *   0 — no penetration (every body type blocks line-of-sight)
 *   1 — penetrates asteroids and moons
 *   2 — penetrates planets (and anything level 1 can penetrate)
 *   3 — penetrates stars (and anything below)
 */
export interface ScannerEquipment {
	/** Unique equipment identifier, e.g. "scanner-basic". */
	id: string;
	/** Display name shown in the shipyard and HUD. */
	name: string;
	/** Maximum lock range (km). Targets beyond this cannot be locked. */
	range: number;
	/**
	 * Penetration capability (0–3).
	 * Determines which celestial body types the scanner can see through.
	 */
	penetrationLevel: number;
	/** Hard cap on simultaneously held target locks for this scanner. */
	maxSimultaneousLocks: number;
}

/**
 * Enemy aggression state machine.
 *
 * Controls whether an enemy actively pursues the player and participates in
 * quick-lock ("/") searches.
 *
 *   NEUTRAL  — ignores the player unless fired upon.
 *   VIGILANT — suspicious; will engage if the player moves within a threshold
 *              range or fires nearby.
 *   HOSTILE  — always attacks on sight; always eligible for "/" quick-lock.
 */
export enum Aggression {
	NEUTRAL = "neutral",
	VIGILANT = "vigilant",
	HOSTILE = "hostile",
}

export interface ShipStats {
	health: number;
	maxHealth: number;
	shield: number;
	maxShield: number;
	armor: number;
	speed: number;
	acceleration: number;
	turnRate: number;
	factionId: string;
}

export interface Weapon {
	id: string;
	type: WeaponType;
	name: string;
	damage: number;
	fireRate: number; // shots per second
	range: number;
	energyCost: number;
	spread?: number; // degrees
	projectileSpeed: number;
	ammo?: number;
	maxAmmo?: number;
}

export interface Ability {
	id: string;
	type: AbilityType;
	name: string;
	cooldownMs: number;
	energyCost: number;
	lastActivatedAt?: number;
}

export interface Ship {
	id: string;
	class: ShipClass;
	factionId: string;
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	rotation: number;
	stats: ShipStats;
	weapons: Weapon[];
	abilities: Ability[];
	energy: number;
	maxEnergy: number;
	isPlayerControlled: boolean;
	dockingStationId?: string;
	isDocked: boolean;
}

/**
 * A single active target lock held by a ship.
 *
 * Lock strength (0–1) reflects the quality of the lock: 1.0 is a clean lock
 * at close range with no obstruction; values below 1.0 indicate a degraded
 * lock (e.g. at the edge of scanner range).  CombatManager.fireWeapon uses
 * lockStrength to compute hit probability.
 */
export interface TargetLock {
	/** Unique identifier for this individual lock instance. */
	id: string;
	/** Id of the enemy / ship being tracked. */
	targetId: string;
	/** Display name of the locked target (for HUD rendering). */
	targetName: string;
	/** Simulation timestamp (ms) when the lock was first established. */
	lockedAtMs: number;
	/**
	 * Current distance from the locking ship to the target (km).
	 * Refreshed by TargetLockManager.validateAllLocks each frame so the HUD
	 * can display an up-to-date value without a separate distance query.
	 */
	distanceKm: number;
	/**
	 * True when this is the "active" lock whose target receives weapon fire
	 * and ability effects. Exactly one lock per TargetingState should be
	 * focused at a time; TargetLockManager enforces this invariant.
	 */
	isFocused: boolean;
	/** Lock quality 0–1. Passed to CombatManager.fireWeapon for hit-chance. */
	lockStrength: number;
}

/**
 * Multi-lock targeting state for a single ship (player or enemy).
 *
 * Holds all active locks up to the scanner's `maxSimultaneousLocks` limit.
 * TargetLockManager is the sole authority that mutates this object — callers
 * should treat it as read-only except through the manager's static API.
 */
export interface TargetingState {
	/** All currently active locks (ordered oldest → newest). */
	allLocks: TargetLock[];
	/**
	 * Id of the lock that is currently focused (i.e. `isFocused === true`).
	 * `undefined` when no locks are held.
	 *
	 * Typed as `string | undefined` (not just `string?`) so that
	 * TargetLockManager can explicitly clear the field to `undefined` without
	 * running into `exactOptionalPropertyTypes` restrictions.
	 */
	focusedLockId?: string | undefined;
	/** Timestamp of the last Tab-cycle operation (ms). */
	lastTabCycleMs: number;
	/** Timestamp of the last HUD-click refocus operation (ms). */
	lastClickLockMs: number;
}

export interface CombatEvent {
	type:
		| "hit"
		| "miss"
		| "shield_hit"
		| "armor_hit"
		| "kill"
		| "lock_acquired"
		| "lock_lost";
	timestamp: number;
	attackerId: string;
	targetId: string;
	damage?: number;
	weaponId?: string;
}

export interface ScannerReading {
	shipId: string;
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	heading: number;
	distance: number;
	isLocked: boolean;
	factionId: string;
	class: ShipClass;
	signatureStrength: number; // 0-1
}

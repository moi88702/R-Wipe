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

export interface TargetLock {
	targetId: string;
	lockedSince: number;
	lockStrength: number; // 0-1, affected by range and obstruction
	penetrationLevel: number; // 0-1, scanner penetration vs evasion
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

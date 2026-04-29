import { AbilityRegistry, WeaponRegistry } from "./registries";
import {
	type CombatEvent,
	ScannerReading,
	type Ship,
	TargetLock,
} from "./types";

/**
 * CombatManager
 * Central authority for combat resolution, damage calculation, and event tracking.
 * Receives targeting info from TargetLockManager and firing orders from ShipControlManager.
 */
export class CombatManager {
	private weaponRegistry: WeaponRegistry;
	private abilityRegistry: AbilityRegistry;
	private combatLog: CombatEvent[] = [];
	private activeShips: Map<string, Ship> = new Map();

	constructor() {
		this.weaponRegistry = new WeaponRegistry();
		this.abilityRegistry = new AbilityRegistry();
	}

	registerShip(ship: Ship): void {
		this.activeShips.set(ship.id, ship);
	}

	unregisterShip(shipId: string): void {
		this.activeShips.delete(shipId);
	}

	/**
	 * Fire weapon from attacker at target
	 * Returns hit/miss based on range, lock strength, and RNG
	 */
	fireWeapon(
		attackerId: string,
		targetId: string,
		weaponId: string,
		lockStrength: number,
	): CombatEvent {
		const attacker = this.activeShips.get(attackerId);
		const target = this.activeShips.get(targetId);

		if (!attacker || !target) {
			throw new Error(
				`Ship not found: attacker=${attackerId}, target=${targetId}`,
			);
		}

		const weapon = this.weaponRegistry.get(weaponId);
		if (!weapon) {
			throw new Error(`Weapon not found: ${weaponId}`);
		}

		const distance = this.calculateDistance(attacker.position, target.position);

		// Hit chance: lock strength + range penalty + target evasion
		const rangeFactor = Math.max(0, 1 - distance / weapon.range);
		const basehitChance = lockStrength * rangeFactor * 0.9; // 90% max
		const hitChance = basehitChance - target.stats.speed * 0.001;
		const hit = Math.random() < Math.max(0.1, hitChance); // 10% minimum hit chance

		if (hit) {
			return this.resolveDamage(attacker, target, weapon, "direct");
		} else {
			const event: CombatEvent = {
				type: "miss",
				timestamp: Date.now(),
				attackerId,
				targetId,
				weaponId,
			};
			this.combatLog.push(event);
			return event;
		}
	}

	/**
	 * Activate ability on ship
	 * Handles energy cost, cooldown, and effect resolution
	 */
	activateAbility(shipId: string, abilityId: string): boolean {
		const ship = this.activeShips.get(shipId);
		if (!ship) return false;

		const ability = this.abilityRegistry.get(abilityId);
		if (!ability) return false;

		const now = Date.now();
		const onCooldown =
			ability.lastActivatedAt &&
			now - ability.lastActivatedAt < ability.cooldownMs;

		if (onCooldown || ship.energy < ability.energyCost) {
			return false;
		}

		ship.energy -= ability.energyCost;
		ability.lastActivatedAt = now;

		// Effect resolution happens in caller (ShipControlManager, EnemyAISystem)
		return true;
	}

	private resolveDamage(
		attacker: Ship,
		target: Ship,
		weapon: any,
		hitType: "direct" | "glancing" | "penetrating",
	): CombatEvent {
		let baseDamage = weapon.damage;

		if (hitType === "glancing") baseDamage *= 0.6;
		if (hitType === "penetrating") baseDamage *= 1.3;

		const armorAbsorb = Math.min(baseDamage * 0.3, target.stats.armor);
		const shieldAbsorb = Math.min(
			baseDamage - armorAbsorb,
			target.stats.shield,
		);
		const healthDamage = baseDamage - armorAbsorb - shieldAbsorb;

		target.stats.shield -= shieldAbsorb;
		target.stats.armor -= armorAbsorb * 0.1; // degradation
		target.stats.health -= healthDamage;

		const eventType =
			target.stats.health <= 0
				? "kill"
				: shieldAbsorb > 0
					? "shield_hit"
					: "armor_hit";

		const event: CombatEvent = {
			type: eventType,
			timestamp: Date.now(),
			attackerId: attacker.id,
			targetId: target.id,
			damage: baseDamage,
			weaponId: weapon.id,
		};

		this.combatLog.push(event);
		return event;
	}

	private calculateDistance(
		p1: { x: number; y: number },
		p2: { x: number; y: number },
	): number {
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	getCombatLog(limit: number = 50): CombatEvent[] {
		return this.combatLog.slice(-limit);
	}

	clearCombatLog(): void {
		this.combatLog = [];
	}
}

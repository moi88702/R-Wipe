import { type Ability, AbilityType, type Weapon, WeaponType } from "./types";

export class WeaponRegistry {
	private weapons: Map<string, Weapon> = new Map();

	constructor() {
		this.registerDefaults();
	}

	private registerDefaults() {
		const defaultWeapons: Weapon[] = [
			{
				id: "laser-mk1",
				type: WeaponType.LASER,
				name: "Class I Laser Cannon",
				damage: 10,
				fireRate: 5,
				range: 500,
				energyCost: 5,
				projectileSpeed: 400,
			},
			{
				id: "missile-mk1",
				type: WeaponType.MISSILE,
				name: "Standard Missile",
				damage: 25,
				fireRate: 1,
				range: 800,
				energyCost: 15,
				projectileSpeed: 250,
				ammo: 20,
				maxAmmo: 20,
			},
			{
				id: "plasma-mk1",
				type: WeaponType.PLASMA,
				name: "Plasma Thrower",
				damage: 15,
				fireRate: 3,
				range: 300,
				energyCost: 8,
				projectileSpeed: 350,
				spread: 10,
			},
		];

		defaultWeapons.forEach((w) => this.register(w));
	}

	register(weapon: Weapon): void {
		this.weapons.set(weapon.id, weapon);
	}

	get(id: string): Weapon | undefined {
		return this.weapons.get(id);
	}

	getAll(): Weapon[] {
		return Array.from(this.weapons.values());
	}
}

export class AbilityRegistry {
	private abilities: Map<string, Ability> = new Map();

	constructor() {
		this.registerDefaults();
	}

	private registerDefaults() {
		const defaultAbilities: Ability[] = [
			{
				id: "shield-boost-mk1",
				type: AbilityType.SHIELD_BOOST,
				name: "Shield Amplifier",
				cooldownMs: 8000,
				energyCost: 20,
			},
			{
				id: "evasive-maneuver-mk1",
				type: AbilityType.EVASIVE_MANEUVER,
				name: "Evasive Maneuver",
				cooldownMs: 5000,
				energyCost: 15,
			},
			{
				id: "targeting-lock-mk1",
				type: AbilityType.TARGETING_LOCK,
				name: "Enhanced Targeting",
				cooldownMs: 3000,
				energyCost: 10,
			},
			{
				id: "emergency-warp-mk1",
				type: AbilityType.EMERGENCY_WARP,
				name: "Emergency Warp",
				cooldownMs: 30000,
				energyCost: 50,
			},
		];

		defaultAbilities.forEach((a) => this.register(a));
	}

	register(ability: Ability): void {
		this.abilities.set(ability.id, ability);
	}

	get(id: string): Ability | undefined {
		return this.abilities.get(id);
	}

	getAll(): Ability[] {
		return Array.from(this.abilities.values());
	}

	getByType(type: AbilityType): Ability[] {
		return Array.from(this.abilities.values()).filter((a) => a.type === type);
	}
}

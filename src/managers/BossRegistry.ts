/**
 * BossRegistry – single source of truth for every boss the game can spawn.
 *
 * To add a new boss: append a BossDefinition to BOSS_REGISTRY.
 * To reorder the rotation: move entries within BOSS_REGISTRY.
 * The level→boss mapping is derived from array index:
 *   level 1 → index 0, level 2 → index 1, … level (N+1) → index 0 (wrap).
 *
 * Difficulty is tuned by HP, fire rate, bullet count, bullet speed, and patrol.
 */

import type {
  AttackPattern,
  BossMovementPhase,
  BossPart,
  BossPhase,
  BossState,
} from "../types/index";

export interface BossDefinition {
  id: string;
  displayName: string;
  /** Key into BOSS_ART lookup in BossArt.ts. */
  artId: string;
  /** Base HP on level 1. */
  baseHealth: number;
  /** Extra HP per additional level. */
  healthPerLevel: number;
  width: number;
  height: number;
  bounty: number;
  /** Downward drift speed; sine patrol still overrides y-position directly. */
  velocityY: number;
  patrol: { amplitude: number; frequency: number };
  colorPrimary: number;
  colorAccent: number;
  phase1: PhaseSpec;
  phase2: PhaseSpec;
  /** 0..1 — phase 2 kicks in when health drops below baseHp * this value. */
  phaseTransitionHp: number;
  /** Parts factory — called per-level. Return [] for a simple single-body boss. */
  makeParts?: (levelNumber: number) => PartSpec[];
  /** "core" = die when core dies; "all" = die when every part dies. */
  defeatRule?: "core" | "all";
  /**
   * Movement-phase plan. Built lazily — the factory receives the list of
   * part ids so it can reference them for `exposesPartId`. When omitted the
   * boss falls back to a single infinite "hover" phase.
   */
  makeMovementPhases?: (partIds: string[]) => BossMovementPhase[];
  /** If true, the boss picks its next movement phase randomly (otherwise sequential). */
  randomMovement?: boolean;
  /** Global speed multiplier applied to all movement (1 = default, <1 = slower). */
  speedMultiplier?: number;
}

/** Subset of BossPart fields that a definition authors. ID is generated. */
export interface PartSpec {
  kind: "core" | "turret" | "armor";
  offset: { x: number; y: number };
  width: number;
  height: number;
  health: number;
  color: number;
  accent: number;
  attackPattern?: AttackPattern;
  fireRateMs?: number;
  shieldsCore?: boolean;
}

interface PhaseSpec {
  attackPattern: AttackPattern;
  fireRateMs: number;
  bulletSpeed: number;
  visualIntensity: "low" | "medium" | "high";
}

/**
 * Ordered from easiest (index 0) to hardest. The game cycles through this list
 * across levels, wrapping at the end.
 */
export const BOSS_REGISTRY: readonly BossDefinition[] = [
  // 1 — SENTINEL: classic intro boss. Aimed burst + homing in phase 2.
  {
    id: "sentinel",
    displayName: "SENTINEL",
    artId: "sentinel",
    baseHealth: 200,
    healthPerLevel: 60,
    width: 120,
    height: 110,
    bounty: 2_000,
    velocityY: 60,
    patrol: { amplitude: 180, frequency: 0.4 },
    colorPrimary: 0xff0066,
    colorAccent: 0xffaacc,
    phase1: {
      attackPattern: {
        type: "aimed-burst",
        bulletsPerShot: 3,
        spreadAngleDegrees: 10,
        projectileSpeed: 340,
        damage: 12,
        weaponKind: "bullet",
      },
      fireRateMs: 900,
      bulletSpeed: 340,
      visualIntensity: "medium",
    },
    phase2: {
      attackPattern: {
        type: "aimed-burst",
        bulletsPerShot: 5,
        spreadAngleDegrees: 25,
        projectileSpeed: 380,
        damage: 12,
        weaponKind: "bullet",
      },
      fireRateMs: 650,
      bulletSpeed: 380,
      visualIntensity: "high",
    },
    phaseTransitionHp: 0.5,
    // Predictable: hover → vertical sweep → square → wave.
    makeMovementPhases: () => [
      { kind: "hover", durationMs: 6_000, announce: true },
      { kind: "vertical", durationMs: 5_000 },
      { kind: "square", durationMs: 8_000 },
      { kind: "wave", durationMs: 7_000 },
    ],
    speedMultiplier: 1,
  },

  // 2 — SKIRMISHER: fast dart. Dual aimed lasers in phase 1, homing torpedoes in phase 2.
  {
    id: "skirmisher",
    displayName: "SKIRMISHER",
    artId: "skirmisher",
    baseHealth: 260,
    healthPerLevel: 70,
    width: 120,
    height: 96,
    bounty: 2_400,
    velocityY: 90,
    patrol: { amplitude: 200, frequency: 0.8 },
    colorPrimary: 0x33ccff,
    colorAccent: 0xaaeeff,
    phase1: {
      attackPattern: {
        type: "laser",
        bulletsPerShot: 1,
        spreadAngleDegrees: 0,
        projectileSpeed: 760,
        damage: 16,
        weaponKind: "laser",
      },
      fireRateMs: 1_200,
      bulletSpeed: 760,
      visualIntensity: "medium",
    },
    phase2: {
      attackPattern: {
        type: "homing",
        bulletsPerShot: 1,
        spreadAngleDegrees: 0,
        projectileSpeed: 240,
        damage: 18,
        weaponKind: "torpedo",
      },
      fireRateMs: 700,
      bulletSpeed: 240,
      visualIntensity: "high",
    },
    phaseTransitionHp: 0.5,
    makeParts: (level) => {
      const hp = 120 + (level - 1) * 30;
      return [
        // twin wing-tip laser turrets, die independently but boss survives via core
        {
          kind: "turret",
          offset: { x: 28, y: -40 },
          width: 24,
          height: 22,
          health: hp,
          color: 0x33ccff,
          accent: 0xaaeeff,
          attackPattern: {
            type: "laser",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 700,
            damage: 10,
            weaponKind: "laser",
          },
          fireRateMs: 1_400,
        },
        {
          kind: "turret",
          offset: { x: 28, y: 40 },
          width: 24,
          height: 22,
          health: hp,
          color: 0x33ccff,
          accent: 0xaaeeff,
          attackPattern: {
            type: "laser",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 700,
            damage: 10,
            weaponKind: "laser",
          },
          fireRateMs: 1_400,
        },
        // core — nose emitter. Killing it defeats the boss.
        {
          kind: "core",
          offset: { x: -20, y: 0 },
          width: 34,
          height: 32,
          health: 260 + (level - 1) * 60,
          color: 0xffffff,
          accent: 0x33ccff,
        },
      ];
    },
    defeatRule: "core",
    // Random + aggressive; dart-ins + wave + charge-beams.
    makeMovementPhases: (partIds) => {
      const coreId = partIds[2];
      return [
        { kind: "wave", durationMs: 5_000 },
        { kind: "dart-in", durationMs: 4_500 },
        {
          kind: "charge",
          durationMs: 3_500,
          chargeMs: 1_800,
          ...(coreId !== undefined ? { exposesPartId: coreId } : {}),
          attackPattern: {
            type: "laser",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 1_000,
            damage: 26,
            weaponKind: "charge-beam",
          },
          announce: true,
        },
        { kind: "vertical", durationMs: 4_500 },
      ];
    },
    randomMovement: true,
    speedMultiplier: 1.15,
  },

  // 3 — WARDEN: armored fortress. Must destroy armor plates before the core takes damage.
  {
    id: "warden",
    displayName: "WARDEN",
    artId: "warden",
    baseHealth: 360,
    healthPerLevel: 90,
    width: 150,
    height: 130,
    bounty: 2_800,
    velocityY: 40,
    patrol: { amplitude: 140, frequency: 0.4 },
    colorPrimary: 0xffaa33,
    colorAccent: 0xffdd88,
    phase1: {
      attackPattern: {
        type: "cannon",
        bulletsPerShot: 1,
        spreadAngleDegrees: 0,
        projectileSpeed: 200,
        damage: 22,
        weaponKind: "cannon",
      },
      fireRateMs: 1_400,
      bulletSpeed: 200,
      visualIntensity: "medium",
    },
    phase2: {
      attackPattern: {
        type: "spread",
        bulletsPerShot: 5,
        spreadAngleDegrees: 30,
        projectileSpeed: 340,
        damage: 14,
        weaponKind: "bullet",
      },
      fireRateMs: 750,
      bulletSpeed: 340,
      visualIntensity: "high",
    },
    phaseTransitionHp: 0.5,
    makeParts: (level) => {
      const armorHp = 180 + (level - 1) * 40;
      const turretHp = 120 + (level - 1) * 30;
      return [
        // two big armor plates that shield the core
        {
          kind: "armor",
          offset: { x: -30, y: -38 },
          width: 52,
          height: 28,
          health: armorHp,
          color: 0xffaa33,
          accent: 0xffdd88,
          shieldsCore: true,
        },
        {
          kind: "armor",
          offset: { x: -30, y: 38 },
          width: 52,
          height: 28,
          health: armorHp,
          color: 0xffaa33,
          accent: 0xffdd88,
          shieldsCore: true,
        },
        // flank turrets (fire cannon)
        {
          kind: "turret",
          offset: { x: 25, y: -36 },
          width: 28,
          height: 28,
          health: turretHp,
          color: 0x663300,
          accent: 0xffcc66,
          attackPattern: {
            type: "cannon",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 180,
            damage: 18,
            weaponKind: "cannon",
          },
          fireRateMs: 1_800,
        },
        {
          kind: "turret",
          offset: { x: 25, y: 36 },
          width: 28,
          height: 28,
          health: turretHp,
          color: 0x663300,
          accent: 0xffcc66,
          attackPattern: {
            type: "cannon",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 180,
            damage: 18,
            weaponKind: "cannon",
          },
          fireRateMs: 1_800,
        },
        // core — glowing eye in the middle
        {
          kind: "core",
          offset: { x: -10, y: 0 },
          width: 36,
          height: 36,
          health: 260 + (level - 1) * 60,
          color: 0xffffff,
          accent: 0xffaa33,
        },
      ];
    },
    defeatRule: "core",
    // Slow, methodical fortress. Predictable rotation of patterns; one charge
    // phase that exposes the core even while its armor is up.
    makeMovementPhases: (partIds) => {
      const coreId = partIds[4];
      return [
        { kind: "hover", durationMs: 5_500, announce: true },
        { kind: "vertical", durationMs: 6_000 },
        {
          kind: "charge",
          durationMs: 4_000,
          chargeMs: 2_200,
          ...(coreId !== undefined ? { exposesPartId: coreId } : {}),
          attackPattern: {
            type: "cannon",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 620,
            damage: 32,
            weaponKind: "charge-beam",
          },
        },
        { kind: "square", durationMs: 8_000 },
      ];
    },
    randomMovement: false,
    speedMultiplier: 0.8, // Warden is big → drifts slower
  },

  // 4 — WEAVER: erratic patrol + rapid pulse bolts and aimed torpedoes.
  {
    id: "weaver",
    displayName: "WEAVER",
    artId: "weaver",
    baseHealth: 340,
    healthPerLevel: 80,
    width: 120,
    height: 110,
    bounty: 3_000,
    velocityY: 110,
    patrol: { amplitude: 240, frequency: 0.9 },
    colorPrimary: 0x9933ff,
    colorAccent: 0xddaaff,
    phase1: {
      attackPattern: {
        type: "pulse",
        bulletsPerShot: 8,
        spreadAngleDegrees: 360,
        projectileSpeed: 280,
        damage: 12,
        weaponKind: "pulse-bolt",
      },
      fireRateMs: 1_100,
      bulletSpeed: 280,
      visualIntensity: "medium",
    },
    phase2: {
      attackPattern: {
        type: "homing",
        bulletsPerShot: 1,
        spreadAngleDegrees: 0,
        projectileSpeed: 220,
        damage: 20,
        weaponKind: "torpedo",
      },
      fireRateMs: 500,
      bulletSpeed: 220,
      visualIntensity: "high",
    },
    phaseTransitionHp: 0.5,
    // Weaver randomly cycles fast, erratic movement. No parts, no weak-spot exposure.
    makeMovementPhases: () => [
      { kind: "wave", durationMs: 6_000 },
      { kind: "dart-in", durationMs: 3_500 },
      { kind: "square", durationMs: 7_000 },
      { kind: "mixed", durationMs: 5_000 },
    ],
    randomMovement: true,
    speedMultiplier: 1.2,
  },

  // 5 — DREADNOUGHT: "kill them all" — every part must die, no weak point.
  {
    id: "dreadnought",
    displayName: "DREADNOUGHT",
    artId: "dreadnought",
    baseHealth: 500,
    healthPerLevel: 120,
    width: 180,
    height: 150,
    bounty: 3_800,
    velocityY: 35,
    patrol: { amplitude: 120, frequency: 0.35 },
    colorPrimary: 0xff3355,
    colorAccent: 0xffaaaa,
    phase1: {
      attackPattern: {
        type: "multi-direction",
        bulletsPerShot: 4,
        spreadAngleDegrees: 60,
        projectileSpeed: 320,
        damage: 14,
        weaponKind: "bullet",
      },
      fireRateMs: 950,
      bulletSpeed: 320,
      visualIntensity: "high",
    },
    phase2: {
      attackPattern: {
        type: "cannon",
        bulletsPerShot: 2,
        spreadAngleDegrees: 20,
        projectileSpeed: 240,
        damage: 22,
        weaponKind: "cannon",
      },
      fireRateMs: 700,
      bulletSpeed: 240,
      visualIntensity: "high",
    },
    phaseTransitionHp: 0.5,
    makeParts: (level) => {
      const turretHp = 140 + (level - 1) * 30;
      const hullHp = 220 + (level - 1) * 50;
      return [
        // three dorsal turrets firing in sequence
        {
          kind: "turret",
          offset: { x: 35, y: -45 },
          width: 28,
          height: 26,
          health: turretHp,
          color: 0xff3355,
          accent: 0xffaaaa,
          attackPattern: {
            type: "aimed-burst",
            bulletsPerShot: 2,
            spreadAngleDegrees: 8,
            projectileSpeed: 340,
            damage: 10,
            weaponKind: "bullet",
          },
          fireRateMs: 900,
        },
        {
          kind: "turret",
          offset: { x: 35, y: 0 },
          width: 28,
          height: 26,
          health: turretHp,
          color: 0xff3355,
          accent: 0xffaaaa,
          attackPattern: {
            type: "torpedo",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 240,
            damage: 18,
            weaponKind: "torpedo",
          },
          fireRateMs: 2_000,
        },
        {
          kind: "turret",
          offset: { x: 35, y: 45 },
          width: 28,
          height: 26,
          health: turretHp,
          color: 0xff3355,
          accent: 0xffaaaa,
          attackPattern: {
            type: "aimed-burst",
            bulletsPerShot: 2,
            spreadAngleDegrees: 8,
            projectileSpeed: 340,
            damage: 10,
            weaponKind: "bullet",
          },
          fireRateMs: 900,
        },
        // hull segments (no weapon, just HP to chew through). Boss dies when *all* die.
        {
          kind: "core",
          offset: { x: -20, y: 0 },
          width: 48,
          height: 70,
          health: hullHp,
          color: 0xff3355,
          accent: 0xffaaaa,
        },
      ];
    },
    defeatRule: "all",
    // Dreadnought is huge and slow; predictable pattern.
    makeMovementPhases: () => [
      { kind: "hover", durationMs: 7_000, announce: true },
      { kind: "vertical", durationMs: 6_500 },
      { kind: "square", durationMs: 9_000 },
      { kind: "wave", durationMs: 6_000 },
    ],
    randomMovement: false,
    speedMultiplier: 0.65,
  },

  // 6 — PHANTOM: relentless. Orbital pulse bursts and lasers from every arm.
  {
    id: "phantom",
    displayName: "PHANTOM",
    artId: "phantom",
    baseHealth: 420,
    healthPerLevel: 100,
    width: 140,
    height: 140,
    bounty: 4_200,
    velocityY: 140,
    patrol: { amplitude: 260, frequency: 1.1 },
    colorPrimary: 0x00ffaa,
    colorAccent: 0xccffee,
    phase1: {
      attackPattern: {
        type: "pulse",
        bulletsPerShot: 12,
        spreadAngleDegrees: 360,
        projectileSpeed: 320,
        damage: 12,
        weaponKind: "pulse-bolt",
      },
      fireRateMs: 800,
      bulletSpeed: 320,
      visualIntensity: "high",
    },
    phase2: {
      attackPattern: {
        type: "aimed-burst",
        bulletsPerShot: 7,
        spreadAngleDegrees: 35,
        projectileSpeed: 440,
        damage: 14,
        weaponKind: "bullet",
      },
      fireRateMs: 450,
      bulletSpeed: 440,
      visualIntensity: "high",
    },
    phaseTransitionHp: 0.5,
    makeParts: (level) => {
      const armHp = 100 + (level - 1) * 25;
      const arms: PartSpec[] = [];
      // Three rotating arms with laser turrets. Only the core is the weak
      // point, but armor parts shield it until they die.
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2;
        arms.push({
          kind: "armor",
          offset: { x: Math.cos(ang) * 48, y: Math.sin(ang) * 48 },
          width: 28,
          height: 28,
          health: armHp,
          color: 0x00ffaa,
          accent: 0xccffee,
          shieldsCore: true,
        });
        arms.push({
          kind: "turret",
          offset: { x: Math.cos(ang) * 70, y: Math.sin(ang) * 70 },
          width: 22,
          height: 22,
          health: armHp,
          color: 0x00ccaa,
          accent: 0xccffee,
          attackPattern: {
            type: "laser",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 640,
            damage: 10,
            weaponKind: "laser",
          },
          fireRateMs: 1_400,
        });
      }
      arms.push({
        kind: "core",
        offset: { x: 0, y: 0 },
        width: 32,
        height: 32,
        health: 300 + (level - 1) * 70,
        color: 0xffffff,
        accent: 0x00ffaa,
      });
      return arms;
    },
    defeatRule: "core",
    // Phantom is the finale: fast, random, and regularly exposes a random arm
    // during charge-up so the core can be struck through it.
    makeMovementPhases: (partIds) => {
      // Part layout is: [armor, turret, armor, turret, armor, turret, core]
      const armorIds = [partIds[0], partIds[2], partIds[4]].filter(
        (id): id is string => id !== undefined,
      );
      const pick = armorIds[Math.floor(Math.random() * Math.max(1, armorIds.length))];
      return [
        { kind: "wave", durationMs: 5_000 },
        { kind: "dart-in", durationMs: 4_000 },
        {
          kind: "charge",
          durationMs: 4_500,
          chargeMs: 2_000,
          ...(pick !== undefined ? { exposesPartId: pick } : {}),
          attackPattern: {
            type: "laser",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 1_100,
            damage: 30,
            weaponKind: "charge-beam",
          },
          announce: true,
        },
        { kind: "square", durationMs: 6_000 },
        { kind: "vertical", durationMs: 5_000 },
        { kind: "mixed", durationMs: 4_500 },
      ];
    },
    randomMovement: true,
    speedMultiplier: 1.25,
  },

  // 7 — CARRIER: slow mothership. Hangar bays launch waves of fighters and
  //              bombers; dorsal guns and a torpedo turret cover its flanks.
  //              Different movement phases spawn different enemy mixes.
  {
    id: "carrier",
    displayName: "CARRIER",
    artId: "carrier",
    baseHealth: 480,
    healthPerLevel: 110,
    width: 200,
    height: 150,
    bounty: 4_600,
    velocityY: 30,
    patrol: { amplitude: 120, frequency: 0.3 },
    colorPrimary: 0x5577aa,
    colorAccent: 0xbbccee,
    phase1: {
      attackPattern: {
        type: "aimed-burst",
        bulletsPerShot: 3,
        spreadAngleDegrees: 14,
        projectileSpeed: 320,
        damage: 12,
        weaponKind: "bullet",
      },
      fireRateMs: 1_200,
      bulletSpeed: 320,
      visualIntensity: "medium",
    },
    phase2: {
      attackPattern: {
        type: "spread",
        bulletsPerShot: 5,
        spreadAngleDegrees: 28,
        projectileSpeed: 360,
        damage: 14,
        weaponKind: "bullet",
      },
      fireRateMs: 900,
      bulletSpeed: 360,
      visualIntensity: "high",
    },
    phaseTransitionHp: 0.5,
    makeParts: (level) => {
      const turretHp = 140 + (level - 1) * 30;
      const torpedoHp = 160 + (level - 1) * 35;
      const hullHp = 260 + (level - 1) * 60;
      return [
        // Dorsal forward gun
        {
          kind: "turret",
          offset: { x: -30, y: -55 },
          width: 26,
          height: 22,
          health: turretHp,
          color: 0x5577aa,
          accent: 0xbbccee,
          attackPattern: {
            type: "aimed-burst",
            bulletsPerShot: 2,
            spreadAngleDegrees: 10,
            projectileSpeed: 340,
            damage: 10,
            weaponKind: "bullet",
          },
          fireRateMs: 1_100,
        },
        // Ventral forward gun
        {
          kind: "turret",
          offset: { x: -30, y: 55 },
          width: 26,
          height: 22,
          health: turretHp,
          color: 0x5577aa,
          accent: 0xbbccee,
          attackPattern: {
            type: "aimed-burst",
            bulletsPerShot: 2,
            spreadAngleDegrees: 10,
            projectileSpeed: 340,
            damage: 10,
            weaponKind: "bullet",
          },
          fireRateMs: 1_100,
        },
        // Mid-dorsal torpedo turret
        {
          kind: "turret",
          offset: { x: 10, y: -40 },
          width: 28,
          height: 24,
          health: torpedoHp,
          color: 0x334466,
          accent: 0xffcc66,
          attackPattern: {
            type: "torpedo",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 230,
            damage: 18,
            weaponKind: "torpedo",
          },
          fireRateMs: 2_400,
        },
        // Mid-ventral torpedo turret
        {
          kind: "turret",
          offset: { x: 10, y: 40 },
          width: 28,
          height: 24,
          health: torpedoHp,
          color: 0x334466,
          accent: 0xffcc66,
          attackPattern: {
            type: "torpedo",
            bulletsPerShot: 1,
            spreadAngleDegrees: 0,
            projectileSpeed: 230,
            damage: 18,
            weaponKind: "torpedo",
          },
          fireRateMs: 2_400,
        },
        // Command core — the bridge. Killing it ends the fight.
        {
          kind: "core",
          offset: { x: -20, y: -63 },
          width: 32,
          height: 24,
          health: hullHp,
          color: 0xffffff,
          accent: 0x5577aa,
        },
      ];
    },
    defeatRule: "core",
    // Slow, deliberate phases. Each bay-launch phase releases a different mix;
    // guns + torpedoes keep firing throughout.
    makeMovementPhases: (_partIds) => [
      {
        kind: "hover",
        durationMs: 7_000,
        announce: true,
        spawnWave: {
          mix: ["grunt", "grunt", "darter"],
          count: 3,
          intervalMs: 2_200,
        },
      },
      {
        kind: "vertical",
        durationMs: 8_000,
        spawnWave: {
          mix: ["spinner", "orbiter"],
          count: 2,
          intervalMs: 2_800,
        },
      },
      {
        kind: "wave",
        durationMs: 7_500,
        spawnWave: {
          mix: ["lancer", "darter", "pulsar"],
          count: 2,
          intervalMs: 2_400,
        },
      },
      {
        kind: "hover",
        durationMs: 6_500,
        spawnWave: {
          mix: ["torpedoer", "cannoneer"],
          count: 2,
          intervalMs: 3_000,
        },
      },
    ],
    randomMovement: false,
    speedMultiplier: 0.7,
  },
];

/** Resolves the boss definition that should spawn on the given level. */
export function getBossDefinitionForLevel(levelNumber: number): BossDefinition {
  const n = Math.max(1, levelNumber);
  const idx = (n - 1) % BOSS_REGISTRY.length;
  return BOSS_REGISTRY[idx]!;
}

/** Builds a BossState from the given definition for the given level. */
export function makeBossFromDefinition(
  def: BossDefinition,
  levelNumber: number,
  idFactory: (prefix: string) => string,
): BossState {
  const phase1: BossPhase = {
    phaseNumber: 1,
    attackPattern: def.phase1.attackPattern,
    fireRateMs: def.phase1.fireRateMs,
    bulletSpeed: def.phase1.bulletSpeed,
    visualIntensity: def.phase1.visualIntensity,
  };
  const phase2: BossPhase = {
    phaseNumber: 2,
    attackPattern: def.phase2.attackPattern,
    fireRateMs: def.phase2.fireRateMs,
    bulletSpeed: def.phase2.bulletSpeed,
    visualIntensity: def.phase2.visualIntensity,
  };

  // Build parts from the definition's factory; HP is derived from the sum.
  const parts: BossPart[] | undefined = def.makeParts
    ? def.makeParts(levelNumber).map<BossPart>((spec) => ({
        id: idFactory(`${def.id}-part`),
        kind: spec.kind,
        offset: { x: spec.offset.x, y: spec.offset.y },
        position: { x: 0, y: 0 },
        width: spec.width,
        height: spec.height,
        health: spec.health,
        maxHealth: spec.health,
        isAlive: true,
        color: spec.color,
        accent: spec.accent,
        ...(spec.attackPattern !== undefined ? { attackPattern: spec.attackPattern } : {}),
        ...(spec.fireRateMs !== undefined
          ? { fireRateMs: spec.fireRateMs, lastFireTimeMs: 0 }
          : {}),
        ...(spec.shieldsCore !== undefined
          ? { shieldsCore: spec.shieldsCore, originalShieldsCore: spec.shieldsCore }
          : { originalShieldsCore: false }),
      }))
    : undefined;

  const hp = parts
    ? parts.reduce((sum, p) => sum + p.health, 0)
    : def.baseHealth + Math.max(0, levelNumber - 1) * def.healthPerLevel;

  const boss: BossState = {
    id: idFactory("boss"),
    type: "stalker",
    position: { x: 1_150, y: 360 },
    velocity: { x: 0, y: def.velocityY },
    health: hp,
    maxHealth: hp,
    width: def.width,
    height: def.height,
    behavior: {
      patrolPattern: {
        type: "sine-wave",
        amplitude: def.patrol.amplitude,
        frequency: def.patrol.frequency,
      },
      detectionRange: 1_400,
      aggressiveness: 1.0,
    },
    fireRateMs: phase1.fireRateMs,
    lastFireTimeMs: 0,
    attackPattern: phase1.attackPattern,
    bounty: def.bounty,
    isAlive: true,
    phases: [phase1, phase2],
    currentPhase: 0,
    phaseHealthThresholds: [hp * def.phaseTransitionHp, 0],
    transitionTimer: 0,
    isTransitioning: false,
    displayName: def.displayName,
    colorPrimary: def.colorPrimary,
    colorAccent: def.colorAccent,
    artId: def.artId,
    rotation: 0,
  };
  if (parts) {
    boss.parts = parts;
    boss.defeatRule = def.defeatRule ?? "core";
  }

  // Attach movement-phase plan (if any). `advanceMovementPhase` will resolve
  // "mixed" kinds and set the first phase when the boss is spawned.
  if (def.makeMovementPhases) {
    const partIds = parts ? parts.map((p) => p.id) : [];
    boss.movementPhases = def.makeMovementPhases(partIds).map((p) => ({
      ...p,
      durationMs: Math.min(10_000, Math.max(1_500, p.durationMs)),
    }));
    boss.movementPhaseIdx = 0;
    boss.movementPhaseMs = 0;
    boss.randomMovement = def.randomMovement ?? false;
  }
  boss.speedMultiplier = def.speedMultiplier ?? 1;

  return boss;
}

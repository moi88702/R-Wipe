/**
 * EnemyManager – owns enemy entities, their AI, and enemy projectiles.
 *
 * No Pixi dependency – pure data manipulation, safe to run in Node tests.
 */

import type {
  AttackPattern,
  BossMovementPhase,
  BossPart,
  BossState,
  Enemy,
  EnemyType,
  LevelState,
  PlayerState,
  PatrolPattern,
  Projectile,
  WeaponKind,
} from "../types/index";
import { ProjectilePool } from "../entities/Projectile";
import {
  getBossDefinitionForLevel,
  makeBossFromDefinition,
} from "./BossRegistry";

export interface EnemyDefeatedEvent {
  enemyId: string;
  enemyType: EnemyType | "boss";
  position: { x: number; y: number };
  bounty: number;
}

export interface ProjectileHitResult {
  defeated: boolean;
  enemyType: EnemyType | "boss" | null;
  bounty: number;
  position: { x: number; y: number };
  /** If the hit was on a boss part, the part's kind. */
  bossPartKind?: "core" | "turret" | "armor";
  /** Did the individual part die on this hit? */
  partDefeated?: boolean;
}

let _nextEnemyId = 0;
function nextEnemyId(prefix: string): string {
  return `${prefix}-${++_nextEnemyId}`;
}

// ── Per-enemy base stats ───────────────────────────────────────────────────

interface EnemyBaseStats {
  health: number;
  bounty: number;
  fire: number;
  width: number;
  height: number;
  baseSpeed: number;
}

const ENEMY_BASE: Record<EnemyType, EnemyBaseStats> = {
  grunt: { health: 20, bounty: 100, fire: 900, width: 44, height: 32, baseSpeed: 80 },
  spinner: { health: 35, bounty: 200, fire: 1_400, width: 40, height: 40, baseSpeed: 55 },
  stalker: { health: 50, bounty: 300, fire: 2_000, width: 52, height: 36, baseSpeed: 45 },
  darter: { health: 28, bounty: 180, fire: 1_100, width: 38, height: 32, baseSpeed: 170 },
  orbiter: { health: 42, bounty: 260, fire: 1_600, width: 44, height: 44, baseSpeed: 60 },
  lancer: { health: 48, bounty: 320, fire: 2_400, width: 56, height: 30, baseSpeed: 50 },
  torpedoer: { health: 65, bounty: 380, fire: 2_800, width: 58, height: 42, baseSpeed: 40 },
  cannoneer: { health: 85, bounty: 450, fire: 3_200, width: 62, height: 52, baseSpeed: 30 },
  pulsar: { health: 55, bounty: 360, fire: 2_600, width: 48, height: 48, baseSpeed: 35 },
};

function makePatrolPattern(type: EnemyType): PatrolPattern {
  switch (type) {
    case "grunt":
      return { type: "straight" };
    case "spinner":
      return { type: "sine-wave", amplitude: 80, frequency: 1.5 };
    case "stalker":
      return { type: "sine-wave", amplitude: 40, frequency: 0.8 };
    case "darter":
      return { type: "sine-wave", amplitude: 200, frequency: 2.4 };
    case "orbiter":
      return { type: "circular", amplitude: 140, frequency: 0.6 };
    case "lancer":
      return { type: "straight" };
    case "torpedoer":
      return { type: "sine-wave", amplitude: 60, frequency: 0.5 };
    case "cannoneer":
      return { type: "straight" };
    case "pulsar":
      return { type: "sine-wave", amplitude: 30, frequency: 0.7 };
  }
}

function makeAttackPattern(type: EnemyType): AttackPattern {
  switch (type) {
    case "grunt":
      return { type: "straight", bulletsPerShot: 1, spreadAngleDegrees: 0, projectileSpeed: 340 };
    case "spinner":
      return { type: "radial", bulletsPerShot: 8, spreadAngleDegrees: 360, projectileSpeed: 300 };
    case "stalker":
      return { type: "homing", bulletsPerShot: 1, spreadAngleDegrees: 0, projectileSpeed: 320 };
    case "darter":
      return { type: "aimed-burst", bulletsPerShot: 3, spreadAngleDegrees: 16, projectileSpeed: 360 };
    case "orbiter":
      return { type: "radial", bulletsPerShot: 6, spreadAngleDegrees: 360, projectileSpeed: 260 };
    case "lancer":
      return {
        type: "laser", bulletsPerShot: 1, spreadAngleDegrees: 0, projectileSpeed: 820,
        damage: 18, weaponKind: "laser",
      };
    case "torpedoer":
      return {
        type: "torpedo", bulletsPerShot: 1, spreadAngleDegrees: 0, projectileSpeed: 220,
        damage: 18, weaponKind: "torpedo",
      };
    case "cannoneer":
      return {
        type: "cannon", bulletsPerShot: 1, spreadAngleDegrees: 0, projectileSpeed: 260,
        damage: 24, weaponKind: "cannon",
      };
    case "pulsar":
      return {
        type: "pulse", bulletsPerShot: 10, spreadAngleDegrees: 360, projectileSpeed: 240,
        damage: 10, weaponKind: "pulse-bolt",
      };
  }
}

function makeEnemy(
  type: EnemyType,
  x: number,
  y: number,
  fireRateMultiplier: number,
  healthMultiplier: number,
  speedMultiplier: number,
): Enemy {
  const base = ENEMY_BASE[type];

  const baseVelocityX = -base.baseSpeed * speedMultiplier;

  const enemy: Enemy = {
    id: nextEnemyId(type),
    type,
    position: { x, y },
    velocity: { x: baseVelocityX, y: 0 },
    health: Math.round(base.health * healthMultiplier),
    maxHealth: Math.round(base.health * healthMultiplier),
    width: base.width,
    height: base.height,
    behavior: {
      patrolPattern: makePatrolPattern(type),
      detectionRange: 900,
      aggressiveness: 0.8,
    },
    fireRateMs: base.fire / fireRateMultiplier,
    lastFireTimeMs: 0,
    attackPattern: makeAttackPattern(type),
    bounty: base.bounty,
    isAlive: true,
    fireStep: 0,
    hopBackTimer: 0,
    aiTimer: 0,
    aiPhase: 0,
  };
  if (type === "orbiter") enemy.anchor = { x, y };
  return enemy;
}

function makeBoss(levelNumber: number): BossState {
  const def = getBossDefinitionForLevel(levelNumber);
  return makeBossFromDefinition(def, levelNumber, nextEnemyId);
}

// ── EnemyManager ───────────────────────────────────────────────────────────

export class EnemyManager {
  private enemies: Enemy[] = [];
  private boss: BossState | null = null;
  /**
   * Minimal Enemy stubs created for boss parts so CollisionSystem can hit
   * parts. Same ids as the corresponding BossPart. Positions / isAlive are
   * synced each frame.
   */
  private bossPartStubs: Enemy[] = [];
  private readonly projectilePool: ProjectilePool;
  private elapsedMs = 0;
  private readonly defeatedQueue: EnemyDefeatedEvent[] = [];

  private viewportWidth = 1_280;
  private viewportHeight = 720;
  /**
   * Latest LevelState cached by GameManager so boss-driven wave spawns can
   * apply the same difficulty multipliers as LevelManager-driven spawns.
   */
  private currentLevel: LevelState | null = null;
  /** Interval timer for the active boss phase's spawnWave (if any). */
  private bossWaveTimerMs = 0;

  constructor(viewportWidth = 1_280, viewportHeight = 720) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.projectilePool = new ProjectilePool();
  }

  initialize(): void {
    this.enemies = [];
    this.boss = null;
    this.bossPartStubs = [];
    this.elapsedMs = 0;
    this.defeatedQueue.length = 0;
    this.bossWaveTimerMs = 0;
    this.projectilePool.clear();
  }

  setCurrentLevel(level: LevelState): void {
    this.currentLevel = level;
  }

  spawnEnemy(type: EnemyType, y: number, level: LevelState): void {
    const spawnX = this.viewportWidth + 60;
    const diff = level.difficulty;
    const enemy = makeEnemy(
      type,
      spawnX,
      y,
      diff.enemyFireRateMultiplier,
      diff.enemyHealthMultiplier,
      diff.enemySpeedMultiplier,
    );
    this.enemies.push(enemy);
  }

  spawnBoss(levelNumber: number): void {
    this.boss = makeBoss(levelNumber);
    // If the boss defines parts, create minimal Enemy stubs for collision.
    this.bossPartStubs = [];
    if (this.boss.parts && this.boss.parts.length > 0) {
      for (const part of this.boss.parts) {
        this.bossPartStubs.push(makePartStub(part));
      }
      // Seed part world positions.
      this.syncBossPartStubs();
    }

    // Initialize the first movement phase (sets charge flag, anchor, shielding).
    if ((this.boss.movementPhases?.length ?? 0) > 0) {
      this.boss.movementPhaseIdx = -1; // advance rolls us to 0
      this.advanceMovementPhase(this.boss);
    }
  }

  getEnemies(): ReadonlyArray<Enemy> {
    const live = this.enemies.filter((e) => e.isAlive);
    if (this.boss && this.boss.isAlive) {
      if (this.bossPartStubs.length > 0) {
        // Part-based boss: collision hits parts, not the shell.
        return [...live, ...this.bossPartStubs.filter((s) => s.isAlive)];
      }
      return [...live, this.boss];
    }
    return live;
  }

  getBoss(): Readonly<BossState> | null {
    return this.boss;
  }

  getProjectiles(): ReadonlyArray<Projectile> {
    return this.projectilePool.getActive();
  }

  killProjectile(id: string): void {
    for (const p of this.projectilePool.getActive()) {
      if (p.id === id) {
        p.isAlive = false;
        return;
      }
    }
  }

  /**
   * Apply damage to a shoot-downable enemy projectile (torpedo / missile / bomb).
   * Returns true when the projectile was destroyed by this hit.
   */
  damageEnemyProjectile(id: string, damage: number): { destroyed: boolean; position: { x: number; y: number } } {
    for (const p of this.projectilePool.getActive()) {
      if (p.id !== id || !p.isAlive || p.health === undefined) continue;
      p.health = Math.max(0, p.health - damage);
      const pos = { x: p.position.x, y: p.position.y };
      if (p.health <= 0) {
        p.isAlive = false;
        return { destroyed: true, position: pos };
      }
      return { destroyed: false, position: pos };
    }
    return { destroyed: false, position: { x: 0, y: 0 } };
  }

  consumeDefeated(): EnemyDefeatedEvent[] {
    const out = this.defeatedQueue.slice();
    this.defeatedQueue.length = 0;
    return out;
  }

  onProjectileHit(enemyId: string, damage: number): ProjectileHitResult {
    // ── Boss part hit? ──────────────────────────────────────────────────────
    if (this.boss && this.boss.isAlive && this.boss.parts) {
      const part = this.boss.parts.find((p) => p.id === enemyId && p.isAlive);
      if (part) {
        return this.applyPartDamage(part, damage);
      }
    }

    // ── Classic single-body boss hit ────────────────────────────────────────
    if (this.boss && this.boss.id === enemyId && this.boss.isAlive) {
      this.boss.health = Math.max(0, this.boss.health - damage);
      const pos = { x: this.boss.position.x, y: this.boss.position.y };

      if (
        this.boss.currentPhase === 0 &&
        this.boss.health <= this.boss.phaseHealthThresholds[0]!
      ) {
        const p2 = this.boss.phases[1]!;
        this.boss.currentPhase = 1;
        this.boss.attackPattern = p2.attackPattern;
        this.boss.fireRateMs = p2.fireRateMs;
      }

      if (this.boss.health <= 0) {
        this.boss.isAlive = false;
        this.defeatedQueue.push({
          enemyId: this.boss.id,
          enemyType: "boss",
          position: pos,
          bounty: this.boss.bounty,
        });
        return { defeated: true, enemyType: "boss", bounty: this.boss.bounty, position: pos };
      }
      return { defeated: false, enemyType: "boss", bounty: 0, position: pos };
    }

    // ── Regular enemy hit ───────────────────────────────────────────────────
    const enemy = this.enemies.find((e) => e.id === enemyId && e.isAlive);
    if (!enemy) {
      return { defeated: false, enemyType: null, bounty: 0, position: { x: 0, y: 0 } };
    }
    enemy.health = Math.max(0, enemy.health - damage);
    const pos = { x: enemy.position.x, y: enemy.position.y };
    if (enemy.health <= 0) {
      enemy.isAlive = false;
      this.defeatedQueue.push({
        enemyId: enemy.id,
        enemyType: enemy.type,
        position: pos,
        bounty: enemy.bounty,
      });
      return { defeated: true, enemyType: enemy.type, bounty: enemy.bounty, position: pos };
    }
    return { defeated: false, enemyType: enemy.type, bounty: 0, position: pos };
  }

  // ── Boss part damage handling ──────────────────────────────────────────────

  private applyPartDamage(part: BossPart, damage: number): ProjectileHitResult {
    const boss = this.boss!;

    // Armor-shielded core: route damage to surviving armor parts first.
    if (part.kind === "core") {
      const shielding = boss.parts!.find(
        (p) => p.isAlive && p.shieldsCore,
      );
      if (shielding) {
        part = shielding;
      }
    }

    part.health = Math.max(0, part.health - damage);
    const partPos = { x: part.position.x, y: part.position.y };

    // Sync corresponding stub HP so the renderer / collision remain consistent.
    const stub = this.bossPartStubs.find((s) => s.id === part.id);
    if (stub) stub.health = part.health;

    const partDefeated = part.health <= 0;
    if (partDefeated) {
      part.isAlive = false;
      if (stub) stub.isAlive = false;
    }

    // Aggregate HP bar: sum of all parts.
    boss.health = boss.parts!.reduce((sum, p) => sum + (p.isAlive ? p.health : 0), 0);

    // Phase transition at 50% total part HP.
    if (
      boss.currentPhase === 0 &&
      boss.health <= boss.phaseHealthThresholds[0]!
    ) {
      const p2 = boss.phases[1]!;
      boss.currentPhase = 1;
      boss.attackPattern = p2.attackPattern;
      boss.fireRateMs = p2.fireRateMs;
    }

    // Defeat check.
    const rule = boss.defeatRule ?? "core";
    const coreDead = !boss.parts!.some((p) => p.kind === "core" && p.isAlive);
    const allDead = boss.parts!.every((p) => !p.isAlive);
    const bossDefeated = rule === "core" ? coreDead : allDead;

    if (bossDefeated) {
      boss.isAlive = false;
      boss.health = 0;
      const pos = { x: boss.position.x, y: boss.position.y };
      this.defeatedQueue.push({
        enemyId: boss.id,
        enemyType: "boss",
        position: pos,
        bounty: boss.bounty,
      });
      return {
        defeated: true,
        enemyType: "boss",
        bounty: boss.bounty,
        position: pos,
        bossPartKind: part.kind,
        partDefeated,
      };
    }

    return {
      defeated: false,
      enemyType: "boss",
      bounty: partDefeated ? Math.round(boss.bounty * 0.15) : 0,
      position: partPos,
      bossPartKind: part.kind,
      partDefeated,
    };
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(deltaTimeMs: number, player: PlayerState): void {
    this.elapsedMs += deltaTimeMs;
    const dt = deltaTimeMs / 1_000;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      this.updateEnemyAI(enemy, player, dt, deltaTimeMs);

      // Fire if cooldown elapsed — NOT gated by screen position.
      enemy.lastFireTimeMs += deltaTimeMs;
      if (enemy.lastFireTimeMs >= enemy.fireRateMs) {
        this.fireFromEnemy(enemy, player);
        enemy.lastFireTimeMs = 0;
      }

      // Despawn if it leaves the left edge
      if (enemy.position.x < -enemy.width - 80) {
        enemy.isAlive = false;
      }
    }

    this.enemies = this.enemies.filter((e) => e.isAlive);

    if (this.boss && this.boss.isAlive) {
      this.updateBoss(deltaTimeMs, player);
    }

    this.projectilePool.update(
      deltaTimeMs,
      this.viewportWidth,
      this.viewportHeight,
      player.position,
    );
  }

  private updateEnemyAI(
    enemy: Enemy,
    player: PlayerState,
    dt: number,
    deltaTimeMs: number,
  ): void {
    // Hop-back impulse (spinner) — apply before base motion.
    if (enemy.hopBackTimer && enemy.hopBackTimer > 0) {
      enemy.position.x += 110 * dt;
      enemy.hopBackTimer -= deltaTimeMs;
    }

    switch (enemy.type) {
      case "grunt":
      case "stalker":
      case "spinner":
      case "lancer":
      case "torpedoer":
      case "cannoneer":
      case "pulsar": {
        enemy.position.x += enemy.velocity.x * dt;
        const pat = enemy.behavior.patrolPattern;
        if (pat.type === "sine-wave") {
          const amp = pat.amplitude ?? 60;
          const freq = pat.frequency ?? 1;
          const phase = (this.elapsedMs / 1_000) * freq * Math.PI * 2;
          enemy.position.y = clamp(
            enemy.position.y + Math.sin(phase) * amp * dt,
            80,
            this.viewportHeight - 80,
          );
        }
        if (enemy.type === "stalker") {
          const dy = player.position.y - enemy.position.y;
          enemy.position.y += clamp(dy, -60 * dt, 60 * dt);
        }
        return;
      }

      case "darter": {
        // Zig-zag: period of forward dash, then sharp vertical snap toward player.
        enemy.aiTimer = (enemy.aiTimer ?? 0) + deltaTimeMs;
        enemy.position.x += enemy.velocity.x * dt;
        const dy = player.position.y - enemy.position.y;
        enemy.position.y += clamp(dy, -260 * dt, 260 * dt);
        enemy.position.y = clamp(enemy.position.y, 60, this.viewportHeight - 60);
        return;
      }

      case "orbiter": {
        // Orbit around an anchor that slowly drifts left.
        enemy.aiTimer = (enemy.aiTimer ?? 0) + deltaTimeMs;
        if (enemy.anchor) {
          enemy.anchor.x += enemy.velocity.x * 0.5 * dt;
        } else {
          enemy.anchor = { x: enemy.position.x, y: enemy.position.y };
        }
        const freq = enemy.behavior.patrolPattern.frequency ?? 0.6;
        const amp = enemy.behavior.patrolPattern.amplitude ?? 140;
        const phase = (enemy.aiTimer / 1_000) * freq * Math.PI * 2;
        enemy.position.x = enemy.anchor.x + Math.cos(phase) * amp;
        enemy.position.y = clamp(
          enemy.anchor.y + Math.sin(phase) * amp,
          60,
          this.viewportHeight - 60,
        );
        return;
      }
    }
  }

  private updateBoss(deltaTimeMs: number, player: PlayerState): void {
    const boss = this.boss!;
    const dt = deltaTimeMs / 1_000;
    const speedMul = boss.speedMultiplier ?? 1;

    // ── Movement-phase driver ────────────────────────────────────────────────
    const hasPhases = (boss.movementPhases?.length ?? 0) > 0;
    if (hasPhases) {
      boss.movementPhaseMs = (boss.movementPhaseMs ?? 0) + deltaTimeMs;
      const activePhase = this.currentMovementPhase(boss);
      if (activePhase && boss.movementPhaseMs >= activePhase.durationMs) {
        this.advanceMovementPhase(boss);
      }
      this.driveMovementPhase(boss, player, dt, deltaTimeMs, speedMul);
    } else {
      // Fallback: classic hover.
      const targetX = this.viewportWidth - 200;
      boss.position.x += (targetX - boss.position.x) * 0.8 * dt * speedMul;
      const amp = boss.behavior.patrolPattern.amplitude ?? 160;
      const freq = boss.behavior.patrolPattern.frequency ?? 0.4;
      const center = this.viewportHeight / 2;
      boss.position.y =
        center + Math.sin((this.elapsedMs / 1_000) * freq * Math.PI * 2) * amp;
    }

    // Slow drift rotation for bosses that want it.
    boss.rotation = (boss.rotation ?? 0) + 0.18 * dt * speedMul;

    // ── Firing (gated by charge-up window) ──────────────────────────────────
    const phase = this.currentMovementPhase(boss);
    const chargeMs = phase?.chargeMs ?? 0;
    const chargeDone =
      chargeMs === 0 || (boss.chargeProgressMs ?? 0) >= chargeMs;

    if (boss.isCharging) {
      boss.chargeProgressMs = (boss.chargeProgressMs ?? 0) + deltaTimeMs;
      if ((boss.chargeProgressMs ?? 0) >= chargeMs) {
        // Release the charge-beam shot.
        boss.isCharging = false;
        this.fireChargeBeam(boss, player, phase);
      }
    }

    if (!boss.isCharging && chargeDone) {
      // Pick active attack pattern + fire rate (phase overrides boss default).
      const ap = phase?.attackPattern ?? boss.attackPattern;
      const fr = phase?.fireRateMs ?? boss.fireRateMs;
      boss.lastFireTimeMs += deltaTimeMs;
      if (boss.lastFireTimeMs >= fr) {
        this.fireAttackPattern(boss.position, boss.width, ap, player, "enemy");
        boss.lastFireTimeMs = 0;
      }
    }

    // ── Carrier-style wave spawning (interval-driven) ───────────────────────
    if (phase?.spawnWave?.intervalMs) {
      this.bossWaveTimerMs += deltaTimeMs;
      if (this.bossWaveTimerMs >= phase.spawnWave.intervalMs) {
        this.bossWaveTimerMs = 0;
        this.releaseBossWave(phase.spawnWave);
      }
    }

    // ── Part positions + per-turret cooldowns ───────────────────────────────
    if (boss.parts) {
      this.syncBossPartStubs();
      if (!boss.isCharging && chargeDone) {
        for (const part of boss.parts) {
          if (!part.isAlive || !part.attackPattern || !part.fireRateMs) continue;
          part.lastFireTimeMs = (part.lastFireTimeMs ?? 0) + deltaTimeMs;
          if (part.lastFireTimeMs >= part.fireRateMs) {
            this.fireAttackPattern(
              part.position,
              part.width,
              part.attackPattern,
              player,
              "enemy",
            );
            part.lastFireTimeMs = 0;
          }
        }
      }
    }
  }

  // ── Movement-phase helpers ──────────────────────────────────────────────────

  private currentMovementPhase(boss: BossState): BossMovementPhase | undefined {
    const phases = boss.movementPhases;
    if (!phases || phases.length === 0) return undefined;
    const idx = boss.movementPhaseIdx ?? 0;
    return phases[idx % phases.length];
  }

  /** Advances to the next movement phase (sequential or random) and resets state. */
  private advanceMovementPhase(boss: BossState): void {
    const phases = boss.movementPhases;
    if (!phases || phases.length === 0) return;

    const prevIdx = boss.movementPhaseIdx ?? 0;
    let nextIdx: number;
    if (boss.randomMovement) {
      if (phases.length === 1) {
        nextIdx = 0;
      } else {
        do {
          nextIdx = Math.floor(Math.random() * phases.length);
        } while (nextIdx === prevIdx);
      }
    } else {
      nextIdx = (prevIdx + 1) % phases.length;
    }

    boss.movementPhaseIdx = nextIdx;
    boss.movementPhaseMs = 0;
    boss.movementStep = 0;
    boss.chargeProgressMs = 0;

    const next = phases[nextIdx]!;

    // Pre-pick a concrete kind for "mixed" phases (avoids re-rolling each frame).
    if (next.kind === "mixed") {
      const concreteKinds = ["square", "vertical", "wave", "dart-in", "hover"] as const;
      const pick = concreteKinds[Math.floor(Math.random() * concreteKinds.length)]!;
      // Mutate the phase in-place so every tick sees the same resolved kind.
      (next as { kind: BossMovementPhase["kind"] }).kind = pick;
    }

    // Configure charge-up flag.
    boss.isCharging = (next.chargeMs ?? 0) > 0 || next.kind === "charge";

    // Weak-spot exposure: flip shieldsCore on all parts for this phase.
    this.applyPhaseShielding(boss);

    // Movement anchor: recentred each phase transition (used by square/dart/etc.).
    boss.movementAnchor = {
      x: this.viewportWidth - 200,
      y: this.viewportHeight / 2,
    };
    boss.lastFireTimeMs = 0; // firing burst aligns with phase entry

    // Reset the carrier-style wave timer and release an opening volley.
    this.bossWaveTimerMs = 0;
    if (next.spawnWave) {
      this.releaseBossWave(next.spawnWave);
    }
  }

  /** Spawns `wave.count` enemies drawn uniformly from `wave.mix`. */
  private releaseBossWave(wave: { mix: EnemyType[]; count: number }): void {
    if (!this.currentLevel || wave.mix.length === 0) return;
    for (let i = 0; i < wave.count; i++) {
      const type = wave.mix[Math.floor(Math.random() * wave.mix.length)]!;
      const y = 100 + Math.random() * (this.viewportHeight - 200);
      this.spawnEnemy(type, y, this.currentLevel);
    }
  }

  /** Drops shieldsCore on the phase's exposed part; restores others from originalShieldsCore. */
  private applyPhaseShielding(boss: BossState): void {
    if (!boss.parts) return;
    const phase = this.currentMovementPhase(boss);
    const exposedId = phase?.exposesPartId;
    for (const part of boss.parts) {
      const orig = part.originalShieldsCore ?? false;
      part.shieldsCore = exposedId === part.id ? false : orig;
    }
  }

  /** Drives boss.position for the current movement phase. */
  private driveMovementPhase(
    boss: BossState,
    player: PlayerState,
    dt: number,
    deltaTimeMs: number,
    speedMul: number,
  ): void {
    const phase = this.currentMovementPhase(boss);
    if (!phase) return;

    const anchor = boss.movementAnchor ?? {
      x: this.viewportWidth - 200,
      y: this.viewportHeight / 2,
    };

    const pctThrough = Math.min(1, (boss.movementPhaseMs ?? 0) / Math.max(1, phase.durationMs));

    switch (phase.kind) {
      case "hover": {
        const amp = 120;
        const freq = 0.6;
        const t = (this.elapsedMs / 1_000) * freq * Math.PI * 2;
        this.steerToward(boss, anchor.x, anchor.y + Math.sin(t) * amp, dt, speedMul, 3.5);
        return;
      }

      case "square": {
        // 4 corners, switching at each quarter-phase.
        const corners = [
          { dx: -180, dy: -160 },
          { dx: 180, dy: -160 },
          { dx: 180, dy: 160 },
          { dx: -180, dy: 160 },
        ];
        const stepIdx = Math.min(3, Math.floor(pctThrough * 4));
        boss.movementStep = stepIdx;
        const c = corners[stepIdx]!;
        const targetX = clamp(
          anchor.x + c.dx,
          boss.width,
          this.viewportWidth - boss.width / 2,
        );
        const targetY = clamp(
          anchor.y + c.dy,
          boss.height / 2 + 20,
          this.viewportHeight - boss.height / 2 - 20,
        );
        this.steerToward(boss, targetX, targetY, dt, speedMul, 5);
        return;
      }

      case "vertical": {
        // Stay put horizontally, sweep y up/down fast.
        const amp = this.viewportHeight * 0.35;
        const freq = 0.9;
        const t = ((boss.movementPhaseMs ?? 0) / 1_000) * freq * Math.PI * 2;
        const targetY = clamp(
          anchor.y + Math.sin(t) * amp,
          boss.height / 2 + 20,
          this.viewportHeight - boss.height / 2 - 20,
        );
        this.steerToward(boss, anchor.x, targetY, dt, speedMul, 6);
        return;
      }

      case "wave": {
        // Wide sine in Y and gentle bob in X.
        const yAmp = this.viewportHeight * 0.35;
        const xAmp = 120;
        const yFreq = 1.1;
        const xFreq = 0.6;
        const t = ((boss.movementPhaseMs ?? 0) / 1_000) * Math.PI * 2;
        const targetY = clamp(
          anchor.y + Math.sin(t * yFreq) * yAmp,
          boss.height / 2 + 20,
          this.viewportHeight - boss.height / 2 - 20,
        );
        const targetX = clamp(
          anchor.x + Math.cos(t * xFreq) * xAmp,
          boss.width,
          this.viewportWidth - boss.width / 2,
        );
        this.steerToward(boss, targetX, targetY, dt, speedMul, 5);
        return;
      }

      case "dart-in": {
        // Rush partway toward the player for the first half, retreat in the second.
        const outbound = pctThrough < 0.5;
        const targetX = outbound
          ? Math.max(this.viewportWidth * 0.45, player.position.x + 200)
          : anchor.x;
        const targetY = outbound
          ? clamp(player.position.y, 100, this.viewportHeight - 100)
          : anchor.y;
        this.steerToward(boss, targetX, targetY, dt, speedMul, outbound ? 6 : 4);
        return;
      }

      case "charge": {
        // Freeze near anchor, tiny bob for liveliness.
        const bob = Math.sin(this.elapsedMs * 0.004) * 6;
        this.steerToward(boss, anchor.x, anchor.y + bob, dt, speedMul, 8);
        return;
      }

      case "mixed": {
        // Should have been resolved on phase entry; fall back to hover.
        this.steerToward(boss, anchor.x, anchor.y, dt, speedMul, 3);
        return;
      }
    }
    // Silence unused-param warning for deltaTimeMs in this helper.
    void deltaTimeMs;
  }

  /** Move boss toward (tx, ty) with a critically-damped spring-ish feel. */
  private steerToward(
    boss: BossState,
    tx: number,
    ty: number,
    dt: number,
    speedMul: number,
    aggressiveness: number,
  ): void {
    const k = aggressiveness * speedMul;
    boss.position.x += (tx - boss.position.x) * k * dt;
    boss.position.y += (ty - boss.position.y) * k * dt;
    boss.targetPos = { x: tx, y: ty };
  }

  /** Releases a single charge-beam shot aimed at the player. */
  private fireChargeBeam(
    boss: BossState,
    player: PlayerState,
    phase?: BossMovementPhase,
  ): void {
    const originX = boss.position.x - boss.width / 2;
    const originY = boss.position.y;
    const dx = player.position.x - originX;
    const dy = player.position.y - originY;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ap = phase?.attackPattern;
    const speed = ap?.projectileSpeed ?? 900;
    const dmg = ap?.damage ?? 30;
    this.projectilePool.spawnEx({
      x: originX,
      y: originY,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      damage: dmg,
      owner: "enemy",
      kind: "charge-beam",
      width: 64,
      height: 14,
      lifetimeMs: 1_800,
    });
  }

  /** Recomputes world-space positions of each boss part and mirrors to stubs. */
  private syncBossPartStubs(): void {
    if (!this.boss || !this.boss.parts) return;
    const rot = this.boss.rotation ?? 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (const part of this.boss.parts) {
      const ox = part.offset.x * cos - part.offset.y * sin;
      const oy = part.offset.x * sin + part.offset.y * cos;
      part.position.x = this.boss.position.x + ox;
      part.position.y = this.boss.position.y + oy;
    }
    for (const stub of this.bossPartStubs) {
      const part = this.boss.parts.find((p) => p.id === stub.id);
      if (!part) continue;
      stub.position.x = part.position.x;
      stub.position.y = part.position.y;
      stub.isAlive = part.isAlive;
      stub.health = part.health;
      stub.maxHealth = part.maxHealth;
      stub.width = part.width;
      stub.height = part.height;
    }
  }

  // ── Firing dispatch ────────────────────────────────────────────────────────

  private fireFromEnemy(enemy: Enemy, player: PlayerState): void {
    switch (enemy.type) {
      case "grunt":
        this.fireGruntCycle(enemy);
        return;
      case "spinner":
        this.fireSpinnerCycle(enemy);
        return;
      default:
        break;
    }
    this.fireAttackPattern(
      enemy.position,
      enemy.width,
      enemy.attackPattern,
      player,
      "enemy",
    );
  }

  /** Grunt: forward → double ±35° → forward → double mirrored → repeat. */
  private fireGruntCycle(enemy: Enemy): void {
    const step = enemy.fireStep ?? 0;
    const origin = { x: enemy.position.x - enemy.width / 2, y: enemy.position.y };
    const speed = enemy.attackPattern.projectileSpeed;
    const dmg = enemy.attackPattern.damage ?? 10;

    if (step % 2 === 0) {
      this.projectilePool.spawnEx({
        x: origin.x, y: origin.y, vx: -speed, vy: 0,
        damage: dmg, owner: "enemy", kind: "bullet",
      });
    } else {
      const sign = step === 1 ? 1 : -1;
      const a35 = (35 * Math.PI) / 180;
      this.projectilePool.spawnEx({
        x: origin.x, y: origin.y,
        vx: -speed * Math.cos(a35), vy: sign * speed * Math.sin(a35),
        damage: dmg, owner: "enemy", kind: "bullet",
      });
      this.projectilePool.spawnEx({
        x: origin.x, y: origin.y,
        vx: -speed * Math.cos(a35), vy: -sign * speed * Math.sin(a35),
        damage: dmg, owner: "enemy", kind: "bullet",
      });
    }
    enemy.fireStep = (step + 1) % 4;
  }

  /** Spinner: shotgun forward → radial → hop back. */
  private fireSpinnerCycle(enemy: Enemy): void {
    const step = enemy.fireStep ?? 0;
    const origin = { x: enemy.position.x - enemy.width / 2, y: enemy.position.y };
    const speed = enemy.attackPattern.projectileSpeed;
    const dmg = enemy.attackPattern.damage ?? 10;

    if (step === 0) {
      // Shotgun: tight forward arc.
      const n = 5;
      const spread = (22 * Math.PI) / 180;
      const baseAngle = Math.PI;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const angle = baseAngle - spread / 2 + spread * t;
        this.projectilePool.spawnEx({
          x: origin.x, y: origin.y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          damage: dmg, owner: "enemy", kind: "bullet",
        });
      }
      enemy.fireStep = 1;
    } else {
      // Radial — rotated slightly each cycle for variety.
      const n = Math.max(6, enemy.attackPattern.bulletsPerShot);
      const offset = (this.elapsedMs / 1_000) * 0.9;
      for (let i = 0; i < n; i++) {
        const angle = offset + (Math.PI * 2 * i) / n;
        this.projectilePool.spawnEx({
          x: origin.x, y: origin.y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          damage: dmg, owner: "enemy", kind: "bullet",
        });
      }
      // Hop back: 200ms of +110 px/s = ~22px right.
      // Regular leftward velocity over one cycle (fireRateMs + 200ms) covers
      // more distance, so net movement stays leftward.
      enemy.hopBackTimer = 200;
      enemy.fireStep = 0;
    }
  }

  /** Generic pattern dispatcher — used by bosses, boss-parts, and non-cycle enemies. */
  fireAttackPattern(
    centerPos: { x: number; y: number },
    width: number,
    pattern: AttackPattern,
    player: PlayerState,
    owner: "player" | "enemy",
  ): void {
    const originX = centerPos.x - (width > 0 ? width / 2 : 0);
    const originY = centerPos.y;
    const speed = pattern.projectileSpeed;
    const damage = pattern.damage ?? 10;
    const kind: WeaponKind = pattern.weaponKind ?? "bullet";

    switch (pattern.type) {
      case "straight": {
        this.projectilePool.spawnEx({
          x: originX, y: originY, vx: -speed, vy: 0,
          damage, owner, kind,
        });
        break;
      }
      case "radial": {
        const n = pattern.bulletsPerShot;
        const jitter = (this.elapsedMs / 1_000) * 0.4;
        for (let i = 0; i < n; i++) {
          const angle = jitter + (Math.PI * 2 * i) / n;
          this.projectilePool.spawnEx({
            x: originX, y: originY,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            damage, owner, kind,
          });
        }
        break;
      }
      case "homing": {
        const dx = player.position.x - originX;
        const dy = player.position.y - originY;
        const len = Math.max(1, Math.hypot(dx, dy));
        this.projectilePool.spawnEx({
          x: originX, y: originY,
          vx: (dx / len) * speed, vy: (dy / len) * speed,
          damage, owner, kind,
        });
        break;
      }
      case "spread": {
        const n = pattern.bulletsPerShot;
        const spread = (pattern.spreadAngleDegrees * Math.PI) / 180;
        const baseAngle = Math.PI;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          const angle = baseAngle - spread / 2 + spread * t;
          this.projectilePool.spawnEx({
            x: originX, y: originY,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            damage, owner, kind,
          });
        }
        break;
      }
      case "aimed-burst": {
        const dx = player.position.x - originX;
        const dy = player.position.y - originY;
        const baseAngle = Math.atan2(dy, dx);
        const n = pattern.bulletsPerShot;
        const spread = (pattern.spreadAngleDegrees * Math.PI) / 180;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          const angle = baseAngle - spread / 2 + spread * t;
          this.projectilePool.spawnEx({
            x: originX, y: originY,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            damage, owner, kind,
          });
        }
        break;
      }
      case "laser": {
        // Fast, long, aimed.
        const dx = player.position.x - originX;
        const dy = player.position.y - originY;
        const len = Math.max(1, Math.hypot(dx, dy));
        this.projectilePool.spawnEx({
          x: originX, y: originY,
          vx: (dx / len) * speed, vy: (dy / len) * speed,
          damage, owner, kind: "laser",
          width: 36, height: 4, lifetimeMs: 1500,
        });
        break;
      }
      case "torpedo": {
        const dx = player.position.x - originX;
        const dy = player.position.y - originY;
        const len = Math.max(1, Math.hypot(dx, dy));
        this.projectilePool.spawnEx({
          x: originX, y: originY,
          vx: (dx / len) * speed, vy: (dy / len) * speed,
          damage, owner, kind: "torpedo",
          width: 20, height: 10, isHoming: true, homingTurnRate: 1.6,
          lifetimeMs: 8_000,
          health: 15, // shootable
        });
        break;
      }
      case "cannon": {
        const dx = player.position.x - originX;
        const dy = player.position.y - originY;
        const len = Math.max(1, Math.hypot(dx, dy));
        // Cannon shots are heavy + slow (0.55x speed). Lifetime must cover
        // the full viewport at that speed — 12s gives ~1400px at 120 px/s.
        this.projectilePool.spawnEx({
          x: originX, y: originY,
          vx: (dx / len) * speed * 0.55, vy: (dy / len) * speed * 0.55,
          damage, owner, kind: "cannon",
          width: 30, height: 30, lifetimeMs: 12_000,
        });
        break;
      }
      case "pulse": {
        // 3 concentric rings of bullets at varying speeds.
        const n = Math.max(6, pattern.bulletsPerShot);
        for (let ring = 0; ring < 3; ring++) {
          const ringSpeed = speed * (0.6 + ring * 0.2);
          const offset = (ring * 15 * Math.PI) / 180;
          for (let i = 0; i < n; i++) {
            const angle = offset + (Math.PI * 2 * i) / n;
            this.projectilePool.spawnEx({
              x: originX, y: originY,
              vx: Math.cos(angle) * ringSpeed, vy: Math.sin(angle) * ringSpeed,
              damage, owner, kind: "pulse-bolt",
            });
          }
        }
        break;
      }
      case "multi-direction": {
        // Forward, up/down, and ±45° forward — wide coverage.
        const base = Math.PI;
        const deltas = [
          0,                // forward
          -Math.PI / 2,     // up
          Math.PI / 2,      // down
          -Math.PI / 4,     // forward-up
          Math.PI / 4,      // forward-down
        ];
        for (const d of deltas) {
          const a = base + d;
          this.projectilePool.spawnEx({
            x: originX, y: originY,
            vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            damage, owner, kind,
          });
        }
        break;
      }
    }
  }

  hasNoRegularEnemies(): boolean {
    return this.enemies.length === 0;
  }

  getRegularEnemyCount(): number {
    return this.enemies.length;
  }

  isBossDefeated(): boolean {
    return this.boss !== null && !this.boss.isAlive;
  }

  hasBoss(): boolean {
    return this.boss !== null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Builds a minimal Enemy stub that mirrors a BossPart for collision. */
function makePartStub(part: BossPart): Enemy {
  return {
    id: part.id,
    type: "grunt", // unused; collision reads id/pos/size/isAlive only
    position: { x: part.position.x, y: part.position.y },
    velocity: { x: 0, y: 0 },
    health: part.health,
    maxHealth: part.maxHealth,
    width: part.width,
    height: part.height,
    behavior: {
      patrolPattern: { type: "straight" },
      detectionRange: 0,
      aggressiveness: 0,
    },
    fireRateMs: 0,
    lastFireTimeMs: 0,
    attackPattern: { type: "straight", bulletsPerShot: 0, spreadAngleDegrees: 0, projectileSpeed: 0 },
    bounty: 0,
    isAlive: part.isAlive,
  };
}

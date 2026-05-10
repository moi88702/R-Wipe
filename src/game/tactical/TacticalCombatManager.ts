import type { PointOfInterest } from "../../types/solarsystem";

// ── Arena ─────────────────────────────────────────────────────────────────────

export const ARENA_W = 960;
export const ARENA_H = 540;

// ── Unit types ────────────────────────────────────────────────────────────────

export interface TacticalUnit {
  readonly id: string;
  readonly name: string;
  readonly isPlayerControlled: boolean; // true for bot[0]
  readonly isBot: boolean;              // true for all away-team bots
  readonly personalityType: string;     // for bots; "enemy-drone" etc for enemies
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  hp: number;
  readonly maxHp: number;
  readonly radius: number;
  readonly speedPxS: number;
  readonly attackRange: number;
  readonly attackDamageMin: number;
  readonly attackDamageMax: number;
  readonly attackCooldownMs: number;
  attackCooldownRemainingMs: number;
  isAlive: boolean;
  /** For enemies only: patrol target position. */
  patrolTarget?: { x: number; y: number };
  /** Target id currently being attacked. */
  targetId: string | null;
}

export type TacticalOutcome = "in-progress" | "victory" | "defeat" | "withdrawn";

export interface TacticalObstacle {
  x: number; y: number; w: number; h: number;
}

export interface TacticalCombatState {
  units: TacticalUnit[];
  obstacles: TacticalObstacle[];
  outcome: TacticalOutcome;
  /** Countdown (ms) after outcome before auto-close. */
  outcomeMs: number;
  elapsedMs: number;
  /** POI that triggered this combat (for reward + completion). */
  poiId: string;
  poiDifficulty: 1 | 2 | 3;
  poiName: string;
}

// ── Stat tables ───────────────────────────────────────────────────────────────

interface BotStats {
  hp: number; speed: number; damage: [number, number]; range: number;
}

const BOT_STATS: Record<string, BotStats> = {
  brawler:   { hp: 110, speed: 110, damage: [18, 26], range: 55  },
  warden:    { hp: 130, speed:  80, damage: [12, 18], range: 75  },
  medic:     { hp:  70, speed:  95, damage: [ 7, 13], range: 85  },
  ghost:     { hp:  75, speed: 120, damage: [14, 22], range: 160 },
  engineer:  { hp:  90, speed:  90, damage: [11, 17], range: 110 },
  tactician: { hp:  95, speed: 100, damage: [13, 21], range: 95  },
};

const FALLBACK_BOT_STATS: BotStats = { hp: 90, speed: 95, damage: [12, 18], range: 90 };

interface EnemyTemplate {
  name: string; personalityType: string;
  hp: number; speed: number; damage: [number, number]; range: number; radius: number;
}

const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
  drone:   { name: "Drone",   personalityType: "enemy-drone",   hp: 30,  speed: 85,  damage: [6,  10], range: 60,  radius: 12 },
  soldier: { name: "Soldier", personalityType: "enemy-soldier", hp: 65,  speed: 70,  damage: [10, 14], range: 90,  radius: 14 },
  heavy:   { name: "Heavy",   personalityType: "enemy-heavy",   hp: 125, speed: 50,  damage: [18, 22], range: 65,  radius: 18 },
};

type EnemyWave = Array<keyof typeof ENEMY_TEMPLATES>;

const ENEMY_WAVES: Record<1 | 2 | 3, EnemyWave> = {
  1: ["drone", "drone", "drone"],
  2: ["drone", "drone", "drone", "soldier", "soldier"],
  3: ["drone", "drone", "drone", "soldier", "soldier", "heavy"],
};

// ── Factory ───────────────────────────────────────────────────────────────────

let _idCounter = 0;
const uid = () => `tu-${++_idCounter}`;

function makeBotUnit(
  name: string,
  personalityType: string,
  position: { x: number; y: number },
  isPlayerControlled: boolean,
): TacticalUnit {
  const stats = BOT_STATS[personalityType] ?? FALLBACK_BOT_STATS;
  return {
    id: uid(),
    name,
    isPlayerControlled,
    isBot: true,
    personalityType,
    position: { ...position },
    velocity: { x: 0, y: 0 },
    hp: stats.hp,
    maxHp: stats.hp,
    radius: 14,
    speedPxS: stats.speed,
    attackRange: stats.range,
    attackDamageMin: stats.damage[0],
    attackDamageMax: stats.damage[1],
    attackCooldownMs: 1000,
    attackCooldownRemainingMs: 0,
    isAlive: true,
    targetId: null,
  };
}

function makeEnemyUnit(
  templateKey: keyof typeof ENEMY_TEMPLATES,
  position: { x: number; y: number },
): TacticalUnit {
  const t = ENEMY_TEMPLATES[templateKey]!;
  return {
    id: uid(),
    name: t.name,
    isPlayerControlled: false,
    isBot: false,
    personalityType: t.personalityType,
    position: { ...position },
    velocity: { x: 0, y: 0 },
    hp: t.hp,
    maxHp: t.hp,
    radius: t.radius,
    speedPxS: t.speed,
    attackRange: t.range,
    attackDamageMin: t.damage[0],
    attackDamageMax: t.damage[1],
    attackCooldownMs: 1400,
    attackCooldownRemainingMs: 0,
    isAlive: true,
    patrolTarget: { x: ARENA_W / 2, y: ARENA_H / 2 },
    targetId: null,
  };
}

/** Seeded deterministic pseudo-random (mulberry32). */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x45d9f3b) | 0;
    z = Math.imul(z ^ (z >>> 16), 0x45d9f3b) | 0;
    return ((z ^ (z >>> 16)) >>> 0) / 0xffffffff;
  };
}

function generateObstacles(seed: number): TacticalObstacle[] {
  const rng = seededRng(seed);
  const count = 3 + Math.floor(rng() * 2); // 3-4
  const obs: TacticalObstacle[] = [];
  const margin = 80;
  for (let i = 0; i < count; i++) {
    const w = 60 + Math.floor(rng() * 80);
    const h = 40 + Math.floor(rng() * 60);
    obs.push({
      x: margin + Math.floor(rng() * (ARENA_W - margin * 2 - w)),
      y: margin + Math.floor(rng() * (ARENA_H - margin * 2 - h)),
      w, h,
    });
  }
  return obs;
}

/** Checks if a position is inside any obstacle and returns a push-out offset. */
function resolveObstacles(
  pos: { x: number; y: number },
  radius: number,
  obstacles: TacticalObstacle[],
): { x: number; y: number } {
  let dx = 0, dy = 0;
  for (const o of obstacles) {
    const cx = Math.max(o.x, Math.min(pos.x, o.x + o.w));
    const cy = Math.max(o.y, Math.min(pos.y, o.y + o.h));
    const distX = pos.x - cx;
    const distY = pos.y - cy;
    const dist = Math.hypot(distX, distY);
    if (dist < radius && dist > 0) {
      const pen = radius - dist;
      dx += (distX / dist) * pen;
      dy += (distY / dist) * pen;
    }
  }
  return { x: dx, y: dy };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Main class ────────────────────────────────────────────────────────────────

export class TacticalCombatManager {
  private state: TacticalCombatState | null = null;

  /** Detected approach radius in km — used by GameManager for proximity check. */
  static readonly POI_TRIGGER_RADIUS_KM = 60;
  static readonly OUTCOME_LINGER_MS = 2500;
  static readonly ENEMY_DETECT_RANGE = 220; // px
  static readonly MEDIC_HEAL_RANGE = 120;
  static readonly MEDIC_HEAL_AMOUNT = 6;
  static readonly MEDIC_HEAL_COOLDOWN = 2000;

  /** Extra per-medic state (heal cooldown). Keyed by unit id. */
  private medicCooldowns: Map<string, number> = new Map();

  getState(): TacticalCombatState | null { return this.state; }

  isActive(): boolean { return this.state !== null; }

  /**
   * Initialise a new combat encounter at the given POI.
   * `bots` is the away team (name + personalityType); bot[0] is player-controlled.
   */
  begin(
    poi: PointOfInterest,
    bots: ReadonlyArray<{ name: string; personalityType: string }>,
  ): void {
    const rng = seededRng(poi.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0));

    // Spread bots along the left-bottom area
    const botUnits: TacticalUnit[] = bots.map((b, i) => {
      const px = 80 + (i % 2) * 60;
      const py = ARENA_H - 80 - Math.floor(i / 2) * 60;
      return makeBotUnit(b.name, b.personalityType, { x: px, y: py }, i === 0);
    });

    // Spread enemies along the top-right area
    const wave = ENEMY_WAVES[poi.difficulty];
    const enemyUnits: TacticalUnit[] = wave.map((key, i) => {
      const px = ARENA_W - 80 - (i % 3) * 70 + Math.floor(rng() * 20 - 10);
      const py = 80 + Math.floor(i / 3) * 70 + Math.floor(rng() * 20 - 10);
      return makeEnemyUnit(key, { x: px, y: py });
    });

    this.state = {
      units: [...botUnits, ...enemyUnits],
      obstacles: generateObstacles(rng() * 100000),
      outcome: "in-progress",
      outcomeMs: 0,
      elapsedMs: 0,
      poiId: poi.id,
      poiDifficulty: poi.difficulty,
      poiName: poi.name,
    };
    this.medicCooldowns = new Map();
  }

  withdraw(): void {
    if (this.state && this.state.outcome === "in-progress") {
      this.state.outcome = "withdrawn";
      this.state.outcomeMs = 0;
    }
  }

  /**
   * Move the player-controlled bot. Called by GameManager from arrow/WASD input.
   * `dx`/`dy` are -1/0/1 direction components.
   */
  movePlayer(dx: number, dy: number): void {
    const s = this.state;
    if (!s || s.outcome !== "in-progress") return;
    const player = s.units.find(u => u.isPlayerControlled && u.isAlive);
    if (!player) return;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      player.velocity.x = (dx / len) * player.speedPxS;
      player.velocity.y = (dy / len) * player.speedPxS;
    } else {
      player.velocity.x = 0;
      player.velocity.y = 0;
    }
  }

  /** Trigger a player attack on the nearest enemy in range. */
  playerAttack(): void {
    const s = this.state;
    if (!s || s.outcome !== "in-progress") return;
    const player = s.units.find(u => u.isPlayerControlled && u.isAlive);
    if (!player || player.attackCooldownRemainingMs > 0) return;

    const nearest = this.nearestEnemy(player, s.units);
    if (!nearest) return;
    const dist = Math.hypot(
      nearest.position.x - player.position.x,
      nearest.position.y - player.position.y,
    );
    if (dist <= player.attackRange + nearest.radius) {
      this.applyAttack(player, nearest);
    }
  }

  tick(deltaMs: number): void {
    const s = this.state;
    if (!s) return;

    s.elapsedMs += deltaMs;

    if (s.outcome !== "in-progress") {
      s.outcomeMs += deltaMs;
      return;
    }

    // Tick cooldowns
    for (const u of s.units) {
      if (u.attackCooldownRemainingMs > 0) {
        u.attackCooldownRemainingMs = Math.max(0, u.attackCooldownRemainingMs - deltaMs);
      }
    }
    for (const [id, cd] of this.medicCooldowns) {
      const next = cd - deltaMs;
      if (next <= 0) this.medicCooldowns.delete(id);
      else this.medicCooldowns.set(id, next);
    }

    // Bot AI
    for (const bot of s.units) {
      if (!bot.isAlive || !bot.isBot) continue;
      if (bot.personalityType === "medic") {
        this.tickMedic(bot, s);
      } else if (!bot.isPlayerControlled) {
        this.tickBotAutonomous(bot, s);
      }
    }

    // Enemy AI
    for (const enemy of s.units) {
      if (!enemy.isAlive || enemy.isBot) continue;
      this.tickEnemy(enemy, s);
    }

    // Move all units
    for (const u of s.units) {
      if (!u.isAlive) continue;
      const dtS = deltaMs / 1000;
      u.position.x += u.velocity.x * dtS;
      u.position.y += u.velocity.y * dtS;

      // Arena bounds
      u.position.x = clamp(u.position.x, u.radius, ARENA_W - u.radius);
      u.position.y = clamp(u.position.y, u.radius, ARENA_H - u.radius);

      // Obstacle resolution
      const push = resolveObstacles(u.position, u.radius, s.obstacles);
      u.position.x += push.x;
      u.position.y += push.y;
    }

    // Outcome check
    const botsAlive = s.units.some(u => u.isBot && u.isAlive);
    const enemiesAlive = s.units.some(u => !u.isBot && u.isAlive);
    if (!botsAlive) {
      s.outcome = "defeat";
    } else if (!enemiesAlive) {
      s.outcome = "victory";
    }
  }

  /** XP to award per living bot on victory. */
  victoryXp(): number {
    return 50 * (this.state?.poiDifficulty ?? 1);
  }

  /** Living bot count (for XP distribution). */
  livingBotCount(): number {
    return this.state?.units.filter(u => u.isBot && u.isAlive).length ?? 0;
  }

  end(): void {
    this.state = null;
    this.medicCooldowns.clear();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private nearestEnemy(unit: TacticalUnit, units: TacticalUnit[]): TacticalUnit | null {
    let best: TacticalUnit | null = null;
    let bestDist = Infinity;
    for (const u of units) {
      if (!u.isAlive || u.isBot === unit.isBot) continue;
      const d = Math.hypot(u.position.x - unit.position.x, u.position.y - unit.position.y);
      if (d < bestDist) { bestDist = d; best = u; }
    }
    return best;
  }

  private nearestAllyNeedingHeal(medic: TacticalUnit, units: TacticalUnit[]): TacticalUnit | null {
    let best: TacticalUnit | null = null;
    let bestHpFrac = 1;
    for (const u of units) {
      if (!u.isAlive || !u.isBot || u.id === medic.id) continue;
      const frac = u.hp / u.maxHp;
      if (frac < bestHpFrac) { bestHpFrac = frac; best = u; }
    }
    return (best && best.hp < best.maxHp) ? best : null;
  }

  private applyAttack(attacker: TacticalUnit, target: TacticalUnit): void {
    const dmg = attacker.attackDamageMin
      + Math.floor(Math.random() * (attacker.attackDamageMax - attacker.attackDamageMin + 1));
    target.hp = Math.max(0, target.hp - dmg);
    if (target.hp === 0) target.isAlive = false;
    attacker.attackCooldownRemainingMs = attacker.attackCooldownMs;
    attacker.targetId = target.id;
  }

  private moveToward(unit: TacticalUnit, target: { x: number; y: number }): void {
    const dx = target.x - unit.position.x;
    const dy = target.y - unit.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) { unit.velocity.x = 0; unit.velocity.y = 0; return; }
    unit.velocity.x = (dx / dist) * unit.speedPxS;
    unit.velocity.y = (dy / dist) * unit.speedPxS;
  }

  private tickBotAutonomous(bot: TacticalUnit, s: TacticalCombatState): void {
    const enemy = this.nearestEnemy(bot, s.units);
    if (!enemy) { bot.velocity.x = 0; bot.velocity.y = 0; return; }

    const dist = Math.hypot(
      enemy.position.x - bot.position.x,
      enemy.position.y - bot.position.y,
    );

    if (dist <= bot.attackRange + enemy.radius) {
      // In range — stop and attack
      bot.velocity.x = 0;
      bot.velocity.y = 0;
      if (bot.attackCooldownRemainingMs === 0) {
        this.applyAttack(bot, enemy);
      }
    } else {
      // Move toward enemy
      this.moveToward(bot, enemy.position);
    }
  }

  private tickMedic(medic: TacticalUnit, s: TacticalCombatState): void {
    // Prefer healing injured allies over attacking
    const healTarget = this.nearestAllyNeedingHeal(medic, s.units);
    if (healTarget && !this.medicCooldowns.has(medic.id)) {
      const dist = Math.hypot(
        healTarget.position.x - medic.position.x,
        healTarget.position.y - medic.position.y,
      );
      if (dist <= TacticalCombatManager.MEDIC_HEAL_RANGE) {
        healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + TacticalCombatManager.MEDIC_HEAL_AMOUNT);
        this.medicCooldowns.set(medic.id, TacticalCombatManager.MEDIC_HEAL_COOLDOWN);
        medic.velocity.x = 0;
        medic.velocity.y = 0;
      } else {
        this.moveToward(medic, healTarget.position);
      }
      return;
    }
    // Fall back to attacking the nearest enemy
    this.tickBotAutonomous(medic, s);
  }

  private tickEnemy(enemy: TacticalUnit, s: TacticalCombatState): void {
    // Find nearest bot
    const target = this.nearestEnemy(enemy, s.units);
    if (!target) { enemy.velocity.x = 0; enemy.velocity.y = 0; return; }

    const dist = Math.hypot(
      target.position.x - enemy.position.x,
      target.position.y - enemy.position.y,
    );

    if (dist > TacticalCombatManager.ENEMY_DETECT_RANGE) {
      // Patrol toward patrol target
      if (enemy.patrolTarget) {
        const pd = Math.hypot(
          enemy.patrolTarget.x - enemy.position.x,
          enemy.patrolTarget.y - enemy.position.y,
        );
        if (pd < 30) {
          // New patrol target
          enemy.patrolTarget = {
            x: 100 + Math.random() * (ARENA_W - 200),
            y: 100 + Math.random() * (ARENA_H - 200),
          };
        } else {
          this.moveToward(enemy, enemy.patrolTarget);
        }
      }
      return;
    }

    if (dist <= enemy.attackRange + target.radius) {
      enemy.velocity.x = 0;
      enemy.velocity.y = 0;
      if (enemy.attackCooldownRemainingMs === 0) {
        this.applyAttack(enemy, target);
      }
    } else {
      this.moveToward(enemy, target.position);
    }
  }
}

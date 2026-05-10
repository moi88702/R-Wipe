/**
 * Bot schema — crew robot entity types, skill formulas, XP drive mechanics,
 * trait interface, and decision-bias helpers.
 *
 * No side effects; safe to import in tests, server tools, and game code.
 */

import type { Row } from "../db/types";

// ── Table constants ───────────────────────────────────────────────────────────

export const BOT_TABLES = {
  CREW_BOTS:  "crew_bots",
  BOT_SKILLS: "bot_skills",
  BOT_TRAITS: "bot_traits",
} as const;

export type BotTableName = (typeof BOT_TABLES)[keyof typeof BOT_TABLES];
export const ALL_BOT_TABLES: readonly string[] = Object.values(BOT_TABLES);

// ── Core enums / unions ───────────────────────────────────────────────────────

export type PersonalityType =
  | "brawler"
  | "warden"
  | "medic"
  | "ghost"
  | "tactician"
  | "engineer";

export const ALL_PERSONALITY_TYPES: readonly PersonalityType[] = [
  "brawler", "warden", "medic", "ghost", "tactician", "engineer",
];

export type BotSkillFamily =
  | "combat"
  | "survival"
  | "engineering"
  | "hacking"
  | "command"
  | "stealth";

export const ALL_BOT_SKILL_FAMILIES: readonly BotSkillFamily[] = [
  "combat", "survival", "engineering", "hacking", "command", "stealth",
];

/**
 * Each axis runs from its low pole (negative) to its high pole (positive).
 *
 * aggression:   caution ←→ aggression
 * innovation:   tradition ←→ innovation
 * risk:         conservatism ←→ risk
 * altruism:     self-preservation ←→ altruism
 * curiosity:    skepticism ←→ curiosity
 * independence: loyalty ←→ independence
 */
export type BiasAxis =
  | "aggression"
  | "innovation"
  | "risk"
  | "altruism"
  | "curiosity"
  | "independence";

export const ALL_BIAS_AXES: readonly BiasAxis[] = [
  "aggression", "innovation", "risk", "altruism", "curiosity", "independence",
];

export type DecisionBias = Record<BiasAxis, number>;

export type BotSource =
  | "pool"      // starting crew drawn from the pre-written pool
  | "hired"     // recruited at a station
  | "purchased" // bought off the shelf (blank slate)
  | "built"     // assembled via bot factory module
  | "rescued"   // freed from captivity on a mission
  | "mission"   // joined as a mission reward
  | "stray";    // random encounter recruit

// ── Entity interfaces ─────────────────────────────────────────────────────────

/**
 * One crew robot instance — one row per bot per save slot.
 */
export interface CrewBot extends Row {
  readonly id: string;
  readonly pilotId: string;
  readonly poolId: string;       // pre-written pool entry id, or "" for procedural bots
  readonly name: string;
  readonly personalityType: PersonalityType;
  /** -100 (hard traditionalist) → +100 (full progressive) */
  readonly adoptionLean: number;
  readonly isAlive: boolean;
  readonly isAboard: boolean;    // false when deployed on a mission
  readonly hasBeenRecovered: boolean;
  readonly defectId: string | null;
  readonly monthlyWage: number;  // 0 for founding crew
  readonly source: BotSource;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Skill XP record — one row per (botId, family) pair.
 * id = `${botId}:${family}`
 */
export interface BotSkillRecord extends Row {
  readonly id: string;
  readonly botId: string;
  readonly family: BotSkillFamily;
  readonly level: number;  // 0–10
  readonly xp: number;     // cumulative XP within this skill
  readonly updatedAt: number;
}

/**
 * Trait membership record — one row per (botId, traitId) pair.
 * id = `${botId}:${traitId}`
 */
export interface BotTraitRecord extends Row {
  readonly id: string;
  readonly botId: string;
  readonly traitId: string;
  readonly acquiredAt: number;
}

// ── Trait definition ──────────────────────────────────────────────────────────

export interface TraitDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Skill multiplier offsets. 0.1 = +10% effectiveness, -0.1 = -10%. */
  readonly skillModifiers: Partial<Record<BotSkillFamily, number>>;
  /** Bias axis deltas applied when this trait is present. */
  readonly biasWeights: Partial<Record<BiasAxis, number>>;
  /** Conversation branch flags this trait unlocks. */
  readonly conversationFlags: readonly string[];
}

// ── Pool entry (static data, not persisted) ───────────────────────────────────

export interface CrewPoolEntry {
  readonly poolId: string;
  readonly name: string;
  readonly backstory: string;
  readonly personalityType: PersonalityType;
  /**
   * Bias applied when rolling adoptionLean at new-game start.
   * Actual value = leanTendency + random(-30, +30), clamped to [-100, +100].
   */
  readonly leanTendency: number;
  /** Exactly 3 trait IDs from the trait pool. */
  readonly startingTraitIds: readonly [string, string, string];
  /** Starting skill levels (families not listed default to 0). */
  readonly startingSkills: Partial<Record<BotSkillFamily, number>>;
}

// ── Decision bias helpers ─────────────────────────────────────────────────────

export function neutralBias(): DecisionBias {
  return {
    aggression: 0, innovation: 0, risk: 0,
    altruism: 0, curiosity: 0, independence: 0,
  };
}

export function clampBias(b: DecisionBias): DecisionBias {
  const c = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    aggression: c(b.aggression), innovation: c(b.innovation),
    risk: c(b.risk), altruism: c(b.altruism),
    curiosity: c(b.curiosity), independence: c(b.independence),
  };
}

export function computeBias(
  traitIds: readonly string[],
  allTraits: readonly TraitDefinition[],
): DecisionBias {
  const result = neutralBias();
  const traitMap = new Map(allTraits.map(t => [t.id, t]));
  for (const tid of traitIds) {
    const trait = traitMap.get(tid);
    if (!trait) continue;
    for (const axis of ALL_BIAS_AXES) {
      const w = trait.biasWeights[axis];
      if (w !== undefined) result[axis] += w;
    }
  }
  return clampBias(result);
}

// ── Skill XP formula ──────────────────────────────────────────────────────────

/**
 * Total XP required to reach a given skill level (level 0 = 0 XP).
 * Formula: floor(50 × level^2.2)
 *
 * Sample thresholds:
 *   Lv1 =    50   Lv3 =   480   Lv5 = 1,701
 *   Lv7 = 4,143   Lv10 = 12,566
 */
export function xpForSkillLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(50 * Math.pow(level, 2.2));
}

/** Derive skill level (0–10) from cumulative XP. */
export function skillLevelFromXp(xp: number): number {
  let level = 0;
  while (level < 10 && xp >= xpForSkillLevel(level + 1)) level++;
  return level;
}

/** XP still needed to reach the next level, or 0 if already at cap. */
export function xpToNextSkillLevel(xp: number): number {
  const level = skillLevelFromXp(xp);
  if (level >= 10) return 0;
  return xpForSkillLevel(level + 1) - xp;
}

// ── XP drive mechanics ────────────────────────────────────────────────────────

/**
 * Compute XP gained when a bot installs an XP drive.
 *
 * Gain scales with the gap between drive knowledge and the recipient's skill:
 *   gain = base_level_value × max(0, 1 - recipientLevel / 10)
 *
 * A veteran (Lv9) installing a Lv3 drive gains almost nothing.
 * A rookie (Lv0) installing a Lv5 drive gains most of the level's value.
 */
export function driveXpGain(driveLevel: number, recipientLevel: number): number {
  const base = xpForSkillLevel(driveLevel + 1) - xpForSkillLevel(driveLevel);
  const factor = Math.max(0, 1 - recipientLevel / 10);
  return Math.floor(base * factor);
}

/**
 * Roll an XP drive level for a bot dying with the given skill level.
 * Range: [max(1, skillLevel-3), max(1, skillLevel-1)]
 * Weighted toward (skillLevel-2) — drives are usually slightly below the bot's peak.
 *
 * Returns 0 if skillLevel < 2 (no meaningful drive to drop).
 */
export function rollDriveLevel(skillLevel: number, rng: () => number): number {
  if (skillLevel < 2) return 0;
  const min = Math.max(1, skillLevel - 3);
  const max = skillLevel - 1;
  if (min === max) return min;
  const peak = Math.max(min, Math.min(max, skillLevel - 2));
  // Triangle-ish distribution: 50% peak, 25% each neighbour
  const r = rng();
  if (peak <= min) return r < 0.67 ? peak : max;
  if (peak >= max) return r < 0.67 ? peak : min;
  if (r < 0.25) return min;
  if (r < 0.75) return peak;
  return max;
}

// ── Recovery defects ──────────────────────────────────────────────────────────

export const RECOVERY_DEFECTS: readonly { id: string; description: string }[] = [
  { id: "third-person",     description: "Refers to themselves in third person in formal sentences. Normal otherwise." },
  { id: "forgot-the-mind",  description: "Periodically forgets The Mind is the ship. Addresses you by your old rank. Corrects immediately. Embarrassed." },
  { id: "asteroid-opinion", description: "Has developed a strong, unprompted opinion about a specific asteroid type. Will bring it up." },
  { id: "questions-only",   description: "Speaks exclusively in questions for the first 30 seconds after waking from any sleep cycle." },
  { id: "wrong-category",   description: "One skill is filed under the wrong category in their own head. They use it correctly; they describe it wrong every time." },
  { id: "however",          description: 'Says "however" at the start of every third sentence regardless of context.' },
  { id: "henderson",        description: "Convinced a crew member named Henderson was aboard. Keeps asking where Henderson went. Henderson never existed." },
  { id: "accent",           description: "Has adopted a faint accent from a corrupted reconstruction fragment. Aware of it. Mortified." },
  { id: "hiccup",           description: 'Hiccups (brief static burst) whenever they say the word "operational."' },
  { id: "polite-violence",  description: 'Extremely polite about violence. "I\'d very much appreciate it if you\'d allow me to fire on your position."' },
  { id: "buffering",        description: "Periodically restarts a sentence mid-way, as if buffering. Finishes it correctly." },
  { id: "personal-space",   description: "Has lost the concept of personal space. Stands too close to everyone. Doesn't understand why this is notable." },
];

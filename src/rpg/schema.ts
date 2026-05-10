/**
 * RPG schema — entity types, table name constants, and pure helpers.
 *
 * Nothing in this file has side effects or browser dependencies; it can be
 * imported in tests, server-side tools, and game code alike.
 */

import type { Row } from "../db/types";

// ── Table name constants ──────────────────────────────────────────────────────

export const RPG_TABLES = {
  PILOT_PROFILES:    "pilot_profiles",
  FACTION_STANDINGS: "faction_standings",
  PILOT_SKILLS:      "pilot_skills",
} as const;

export type RPGTableName = (typeof RPG_TABLES)[keyof typeof RPG_TABLES];

/** Ordered list — used to declare all IDB object stores at connection time. */
export const ALL_RPG_TABLES: readonly string[] = Object.values(RPG_TABLES);

// ── Entity types ──────────────────────────────────────────────────────────────

/**
 * Pilot profile — one record per save slot.
 * In single-player the id is always DEFAULT_PILOT_ID.
 * In a SpacetimeDB multi-player context the id is the player's identity token.
 */
export interface PilotProfile extends Row {
  readonly id: string;
  /** Display name chosen by the player. */
  readonly callsign: string;
  /** Starting faction affiliation ("earth" | "mars" | "pirate" | "mercenary"). */
  readonly factionId: string;
  /** Current credit balance. */
  readonly credits: number;
  /** Cumulative experience points earned across all sessions. */
  readonly xp: number;
  /** Pilot level 1–50, stored alongside xp for fast display. */
  readonly level: number;
  /** Unspent skill points available for allocation in the pilot screen. */
  readonly skillPoints: number;
  /** Aggregate in-session play-time in milliseconds. */
  readonly playTimeMs: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Per-faction reputation for a pilot.
 * Primary key: `${pilotId}:${factionId}` — keeps records flat and addressable.
 */
export interface FactionStanding extends Row {
  readonly id: string;
  readonly pilotId: string;
  readonly factionId: string;
  /** Reputation points clamped to [−1000, +1000]. */
  readonly reputation: number;
  readonly updatedAt: number;
}

/** Skill key union — used to type `spendSkillPoint` safely. */
export type SkillKey = "combat" | "navigation" | "trade" | "engineering" | "diplomacy";

/**
 * Skill allocations for a pilot.
 * Primary key equals pilotId (one record per pilot).
 */
export interface PilotSkills extends Row {
  readonly id: string;
  readonly pilotId: string;
  /** Combat proficiency 0–10: increases weapon damage and lock-on speed. */
  readonly combat: number;
  /** Navigation 0–10: improves warp charge speed and gate traversal. */
  readonly navigation: number;
  /** Trade 0–10: better prices and exclusive contracts. */
  readonly trade: number;
  /** Engineering 0–10: faster shield recharge and field repairs. */
  readonly engineering: number;
  /** Diplomacy 0–10: accelerated reputation gain with all factions. */
  readonly diplomacy: number;
  readonly updatedAt: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default pilot id for single-player saves. */
export const DEFAULT_PILOT_ID = "local" as const;

/** All factions that have reputation standings. */
export const STANDING_FACTION_IDS: readonly string[] = [
  "earth", "mars", "pirate", "mercenary",
];

/** Starting credits for a new pilot. */
export const STARTING_CREDITS = 100_000;

/** Skill points awarded per level-up. */
export const SKILL_POINTS_PER_LEVEL = 1;

// ── XP / level formula ────────────────────────────────────────────────────────

/**
 * Total XP required to *reach* a given level (level 1 = 0 XP).
 *
 * Formula: xpForLevel(n) = floor(100 × (n−1)^1.8)
 *
 * Sample thresholds:
 *   L2 =    100 xp     L10 =   6,310 xp
 *   L5 =  1,189 xp     L25 =  72,858 xp
 *   L50 = 486,190 xp
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.8));
}

/** Derive pilot level (1–50) from cumulative XP. */
export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < 50 && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** XP still needed to reach the next level, or 0 if already at max. */
export function xpToNextLevel(xp: number): number {
  const current = levelFromXp(xp);
  if (current >= 50) return 0;
  return xpForLevel(current + 1) - xp;
}

/** XP progress within the current level as a 0–1 fraction. */
export function xpLevelProgress(xp: number): number {
  const current = levelFromXp(xp);
  if (current >= 50) return 1;
  const floor = xpForLevel(current);
  const ceil  = xpForLevel(current + 1);
  return (xp - floor) / (ceil - floor);
}

// ── Faction reputation helpers ────────────────────────────────────────────────

/** Human-readable label for a reputation value. */
export function reputationLabel(rep: number): string {
  if (rep >=  750) return "Allied";
  if (rep >=  300) return "Friendly";
  if (rep >=    0) return "Neutral";
  if (rep >= -300) return "Suspicious";
  if (rep >= -750) return "Hostile";
  return "Enemy";
}

/** True if the player is allowed to dock at this faction's stations. */
export function canDockWithReputation(rep: number): boolean {
  return rep >= -300; // Suspicious and above
}

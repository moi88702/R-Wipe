/**
 * CrewService — typed facade for all crew-robot persistence.
 *
 * Shares a StorageAdapter with RPGDatabase (same IDB connection, different
 * object stores). Instantiate both through createGameDatabase().
 */

import type { StorageAdapter } from "../db/types";
import type {
  CrewBot,
  BotSkillRecord,
  BotTraitRecord,
  BotSkillFamily,
} from "./bot-schema";
import {
  BOT_TABLES,
  ALL_BOT_SKILL_FAMILIES,
  RECOVERY_DEFECTS,
  driveXpGain,
  rollDriveLevel,
  skillLevelFromXp,
  xpForSkillLevel,
} from "./bot-schema";
import { CREW_POOL, ENGINEER_POOL_IDS } from "./crew-pool";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface XpDriveItem {
  readonly sourceBotName: string;
  readonly family: BotSkillFamily;
  readonly driveLevel: number;
}

export interface InstallDriveResult {
  readonly xpGained: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly skill: BotSkillRecord;
}

export interface DrawStartingCrewResult {
  readonly bots: CrewBot[];
}

// ── CrewService ───────────────────────────────────────────────────────────────

export class CrewService {
  constructor(private readonly adapter: StorageAdapter) {}

  // ── Crew retrieval ─────────────────────────────────────────────────────────

  async getCrewBot(botId: string): Promise<CrewBot | null> {
    return this.adapter.get<CrewBot>(BOT_TABLES.CREW_BOTS, botId);
  }

  async getAllCrew(pilotId: string): Promise<CrewBot[]> {
    const all = await this.adapter.getAll<CrewBot>(BOT_TABLES.CREW_BOTS);
    return all.filter(b => b.pilotId === pilotId);
  }

  async getLivingCrew(pilotId: string): Promise<CrewBot[]> {
    return (await this.getAllCrew(pilotId)).filter(b => b.isAlive);
  }

  // ── New game — starting crew draw ──────────────────────────────────────────

  /**
   * Draw 6 random bots from the pool and persist them as the starting crew.
   * Guarantees at least one bot has engineering >= 1.
   * adoptionLean is randomised for each bot around their leanTendency.
   */
  async drawStartingCrew(
    pilotId: string,
    rng: () => number = Math.random,
  ): Promise<DrawStartingCrewResult> {
    const pool = [...CREW_POOL];
    shuffle(pool, rng);

    // Ensure at least one engineer-capable bot is in the draw
    const chosen: typeof pool = [];
    const engineerIds = new Set(ENGINEER_POOL_IDS);
    const engineerInPool = pool.find(e => engineerIds.has(e.poolId));

    // If the shuffled top-6 has no engineer, swap one in
    const top6 = pool.slice(0, 6);
    const hasEngineer = top6.some(e => engineerIds.has(e.poolId));
    if (!hasEngineer && engineerInPool) {
      // Replace last non-engineer slot with the first engineer we find
      let nonEngineerIdx = -1;
      for (let i = top6.length - 1; i >= 0; i--) {
        if (!engineerIds.has(top6[i]!.poolId)) { nonEngineerIdx = i; break; }
      }
      if (nonEngineerIdx >= 0) top6[nonEngineerIdx] = engineerInPool;
    }
    chosen.push(...top6);

    const now = Date.now();
    const bots: CrewBot[] = [];

    for (const entry of chosen) {
      const leanRaw = entry.leanTendency + Math.round((rng() * 60) - 30);
      const adoptionLean = Math.max(-100, Math.min(100, leanRaw));
      const botId = `${pilotId}:${entry.poolId}:${now}`;

      const bot: CrewBot = {
        id: botId,
        pilotId,
        poolId: entry.poolId,
        name: entry.name,
        personalityType: entry.personalityType,
        adoptionLean,
        isAlive: true,
        isAboard: true,
        hasBeenRecovered: false,
        defectId: null,
        monthlyWage: 0,
        source: "pool",
        createdAt: now,
        updatedAt: now,
      };

      await this.adapter.upsert(BOT_TABLES.CREW_BOTS, bot);
      await this.seedSkills(botId, entry.startingSkills);
      await this.seedTraits(botId, entry.startingTraitIds, now);

      bots.push(bot);
    }

    return { bots };
  }

  // ── Bot lifecycle ──────────────────────────────────────────────────────────

  async killBot(botId: string, rng: () => number = Math.random): Promise<XpDriveItem[]> {
    const bot = await this.getCrewBot(botId);
    if (!bot || !bot.isAlive) return [];

    await this.adapter.upsert(BOT_TABLES.CREW_BOTS, {
      ...bot,
      isAlive: false,
      isAboard: false,
      updatedAt: Date.now(),
    });

    // Roll XP drives for each skill at level >= 2
    const skills = await this.getBotSkills(botId);
    const drives: XpDriveItem[] = [];
    for (const skill of skills) {
      if (skill.level < 2) continue;
      const driveLevel = rollDriveLevel(skill.level, rng);
      if (driveLevel > 0) {
        drives.push({ sourceBotName: bot.name, family: skill.family, driveLevel });
      }
    }
    return drives;
  }

  /**
   * Recover a dead bot (rare). Preserves skills and personality.
   * Rolls a random funny defect.
   */
  async recoverBot(botId: string, rng: () => number = Math.random): Promise<CrewBot | null> {
    const bot = await this.getCrewBot(botId);
    if (!bot || bot.isAlive) return null;

    const defectIdx = Math.floor(rng() * RECOVERY_DEFECTS.length);
    const defect = RECOVERY_DEFECTS[defectIdx];

    const recovered: CrewBot = {
      ...bot,
      isAlive: true,
      isAboard: true,
      hasBeenRecovered: true,
      defectId: defect?.id ?? null,
      updatedAt: Date.now(),
    };
    await this.adapter.upsert(BOT_TABLES.CREW_BOTS, recovered);
    return recovered;
  }

  // ── Skills ─────────────────────────────────────────────────────────────────

  async getBotSkills(botId: string): Promise<BotSkillRecord[]> {
    const all = await this.adapter.getAll<BotSkillRecord>(BOT_TABLES.BOT_SKILLS);
    return all.filter(s => s.botId === botId);
  }

  async getBotSkill(botId: string, family: BotSkillFamily): Promise<BotSkillRecord | null> {
    return this.adapter.get<BotSkillRecord>(BOT_TABLES.BOT_SKILLS, `${botId}:${family}`);
  }

  /**
   * Award XP to a specific skill. Handles level-up automatically.
   * Returns the updated skill record.
   */
  async awardSkillXp(
    botId: string,
    family: BotSkillFamily,
    xpAmount: number,
  ): Promise<BotSkillRecord | null> {
    const existing = await this.getBotSkill(botId, family);
    if (!existing) return null;

    const newXp = existing.xp + xpAmount;
    const newLevel = Math.min(10, skillLevelFromXp(newXp));
    const updated: BotSkillRecord = {
      ...existing,
      xp: newXp,
      level: newLevel,
      updatedAt: Date.now(),
    };
    await this.adapter.upsert(BOT_TABLES.BOT_SKILLS, updated);
    return updated;
  }

  /**
   * Install an XP drive into a bot for the specified skill.
   * Returns how much XP was actually gained and whether the bot levelled up.
   */
  async installXpDrive(
    botId: string,
    drive: XpDriveItem,
  ): Promise<InstallDriveResult | null> {
    const skill = await this.getBotSkill(botId, drive.family);
    if (!skill) return null;

    const levelBefore = skill.level;
    const xpGained = driveXpGain(drive.driveLevel, levelBefore);
    if (xpGained <= 0) return { xpGained: 0, levelBefore, levelAfter: levelBefore, skill };

    const updated = await this.awardSkillXp(botId, drive.family, xpGained);
    if (!updated) return null;

    return {
      xpGained,
      levelBefore,
      levelAfter: updated.level,
      skill: updated,
    };
  }

  // ── Traits ─────────────────────────────────────────────────────────────────

  async getBotTraits(botId: string): Promise<BotTraitRecord[]> {
    const all = await this.adapter.getAll<BotTraitRecord>(BOT_TABLES.BOT_TRAITS);
    return all.filter(t => t.botId === botId);
  }

  async addTrait(botId: string, traitId: string): Promise<BotTraitRecord> {
    const record: BotTraitRecord = {
      id: `${botId}:${traitId}`,
      botId,
      traitId,
      acquiredAt: Date.now(),
    };
    await this.adapter.upsert(BOT_TABLES.BOT_TRAITS, record);
    return record;
  }

  async removeTrait(botId: string, traitId: string): Promise<void> {
    await this.adapter.remove(BOT_TABLES.BOT_TRAITS, `${botId}:${traitId}`);
  }

  async hasTrait(botId: string, traitId: string): Promise<boolean> {
    const record = await this.adapter.get<BotTraitRecord>(
      BOT_TABLES.BOT_TRAITS,
      `${botId}:${traitId}`,
    );
    return record !== null;
  }

  // ── Seed helpers ───────────────────────────────────────────────────────────

  private async seedSkills(
    botId: string,
    startingLevels: Partial<Record<BotSkillFamily, number>>,
  ): Promise<void> {
    const now = Date.now();
    await Promise.all(
      ALL_BOT_SKILL_FAMILIES.map(family => {
        const level = startingLevels[family] ?? 0;
        const record: BotSkillRecord = {
          id: `${botId}:${family}`,
          botId,
          family,
          level,
          xp: xpForSkillLevel(level),
          updatedAt: now,
        };
        return this.adapter.upsert(BOT_TABLES.BOT_SKILLS, record);
      }),
    );
  }

  private async seedTraits(
    botId: string,
    traitIds: readonly string[],
    now: number,
  ): Promise<void> {
    await Promise.all(
      traitIds.map(traitId => {
        const record: BotTraitRecord = {
          id: `${botId}:${traitId}`,
          botId,
          traitId,
          acquiredAt: now,
        };
        return this.adapter.upsert(BOT_TABLES.BOT_TRAITS, record);
      }),
    );
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

import { ALL_RPG_TABLES } from "./schema";
import { ALL_BOT_TABLES } from "./bot-schema";
import type { RPGDatabase } from "./RPGDatabase";

/**
 * Production factory — single IDB connection, both RPGDatabase and CrewService
 * share it. All object stores registered up front.
 */
export async function createGameDatabase(): Promise<{
  rpg: RPGDatabase;
  crew: CrewService;
}> {
  const { IndexedDBAdapter } = await import("../db/IndexedDBAdapter");
  const { RPGDatabase: RPGDb } = await import("./RPGDatabase");
  const allTables = [...ALL_RPG_TABLES, ...ALL_BOT_TABLES];
  const adapter = new IndexedDBAdapter("rwipe-rpg", allTables);
  await adapter.connect();
  return {
    rpg: new RPGDb(adapter),
    crew: new CrewService(adapter),
  };
}

/**
 * Test factory — in-memory adapter, both services connected.
 */
export async function createTestGameDatabase(): Promise<{
  rpg: RPGDatabase;
  crew: CrewService;
}> {
  const { InMemoryAdapter } = await import("../db/InMemoryAdapter");
  const { RPGDatabase: RPGDb } = await import("./RPGDatabase");
  const adapter = new InMemoryAdapter();
  await adapter.connect();
  return {
    rpg: new RPGDb(adapter),
    crew: new CrewService(adapter),
  };
}

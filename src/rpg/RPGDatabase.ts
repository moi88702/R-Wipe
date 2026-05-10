import type { StorageAdapter, Unsubscribe } from "../db/types";
import type { FactionStanding, PilotProfile, PilotSkills, SkillKey } from "./schema";
import {
  ALL_RPG_TABLES,
  DEFAULT_PILOT_ID,
  RPG_TABLES,
  SKILL_POINTS_PER_LEVEL,
  STANDING_FACTION_IDS,
  STARTING_CREDITS,
  levelFromXp,
} from "./schema";

export type { Unsubscribe };

/**
 * RPGDatabase — typed domain facade over a StorageAdapter.
 *
 * Contains all game-logic for the RPG layer: pilot CRUD, XP/levelling,
 * faction reputation, and skill allocation.  Game code only talks to this
 * class — it never touches the adapter directly.
 *
 * Swapping backends (IndexedDB → SpacetimeDB) is a one-line change in the
 * factory function at the bottom of this file; no game code changes.
 */
export class RPGDatabase {
  constructor(private readonly adapter: StorageAdapter) {}

  async connect(): Promise<void> {
    await this.adapter.connect();
  }

  disconnect(): void {
    this.adapter.disconnect();
  }

  get isConnected(): boolean {
    return this.adapter.isConnected;
  }

  // ── Pilot profile ──────────────────────────────────────────────────────────

  async getPilot(id: string = DEFAULT_PILOT_ID): Promise<PilotProfile | null> {
    return this.adapter.get<PilotProfile>(RPG_TABLES.PILOT_PROFILES, id);
  }

  /**
   * Create a brand-new pilot profile, seeded with starting resources and
   * reputation.  Safe to call only once per save slot; use `getPilot` first.
   */
  async createPilot(
    callsign: string,
    factionId: string,
    id: string = DEFAULT_PILOT_ID,
  ): Promise<PilotProfile> {
    const now = Date.now();
    const profile: PilotProfile = {
      id,
      callsign,
      factionId,
      credits: STARTING_CREDITS,
      xp: 0,
      level: 1,
      skillPoints: 0,
      playTimeMs: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.adapter.upsert(RPG_TABLES.PILOT_PROFILES, profile);
    await this.seedFactionStandings(id, factionId);
    await this.seedSkills(id);
    return profile;
  }

  /**
   * Partially update a pilot profile.  `id` and `createdAt` are immutable.
   * Returns null if the pilot doesn't exist.
   */
  async updatePilot(
    id: string,
    patch: Partial<Omit<PilotProfile, "id" | "createdAt">>,
  ): Promise<PilotProfile | null> {
    const existing = await this.getPilot(id);
    if (!existing) return null;
    const updated: PilotProfile = {
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    await this.adapter.upsert(RPG_TABLES.PILOT_PROFILES, updated);
    return updated;
  }

  /**
   * Award XP and auto-advance level if thresholds are crossed.
   * Returns the updated profile, or null if the pilot doesn't exist.
   */
  async awardXp(amount: number, pilotId: string = DEFAULT_PILOT_ID): Promise<PilotProfile | null> {
    const pilot = await this.getPilot(pilotId);
    if (!pilot) return null;

    const newXp = pilot.xp + amount;
    const newLevel = levelFromXp(newXp);
    const gainedLevels = newLevel - pilot.level;

    return this.updatePilot(pilotId, {
      xp: newXp,
      level: newLevel,
      skillPoints: pilot.skillPoints + gainedLevels * SKILL_POINTS_PER_LEVEL,
    });
  }

  /**
   * Adjust credits by `delta` (positive = earn, negative = spend).
   * Returns null if the pilot doesn't exist or if spending would go below 0.
   */
  async adjustCredits(
    delta: number,
    pilotId: string = DEFAULT_PILOT_ID,
  ): Promise<PilotProfile | null> {
    const pilot = await this.getPilot(pilotId);
    if (!pilot) return null;
    const newBalance = pilot.credits + delta;
    if (newBalance < 0) return null;
    return this.updatePilot(pilotId, { credits: newBalance });
  }

  /** Accumulate play-time. Call once per session-end or at a regular interval. */
  async addPlayTime(deltaMs: number, pilotId: string = DEFAULT_PILOT_ID): Promise<void> {
    const pilot = await this.getPilot(pilotId);
    if (!pilot) return;
    await this.updatePilot(pilotId, { playTimeMs: pilot.playTimeMs + deltaMs });
  }

  /** Subscribe to all changes to the pilot_profiles table. */
  subscribeToPilots(handler: (profiles: PilotProfile[]) => void): Unsubscribe {
    return this.adapter.subscribe<PilotProfile>(RPG_TABLES.PILOT_PROFILES, handler);
  }

  // ── Faction standings ──────────────────────────────────────────────────────

  /** Composite key for a single pilot+faction pair. */
  private standingId(pilotId: string, factionId: string): string {
    return `${pilotId}:${factionId}`;
  }

  async getFactionStanding(
    factionId: string,
    pilotId: string = DEFAULT_PILOT_ID,
  ): Promise<FactionStanding | null> {
    return this.adapter.get<FactionStanding>(
      RPG_TABLES.FACTION_STANDINGS,
      this.standingId(pilotId, factionId),
    );
  }

  async getAllFactionStandings(
    pilotId: string = DEFAULT_PILOT_ID,
  ): Promise<FactionStanding[]> {
    const all = await this.adapter.getAll<FactionStanding>(
      RPG_TABLES.FACTION_STANDINGS,
    );
    return all.filter((s) => s.pilotId === pilotId);
  }

  /**
   * Adjust reputation with a faction by `delta`, clamped to [−1000, +1000].
   * Initialises the standing at 0 if it doesn't yet exist.
   */
  async adjustReputation(
    factionId: string,
    delta: number,
    pilotId: string = DEFAULT_PILOT_ID,
  ): Promise<FactionStanding> {
    const existing = await this.getFactionStanding(factionId, pilotId);
    const clamped = Math.max(-1000, Math.min(1000, (existing?.reputation ?? 0) + delta));
    const standing: FactionStanding = {
      id: this.standingId(pilotId, factionId),
      pilotId,
      factionId,
      reputation: clamped,
      updatedAt: Date.now(),
    };
    await this.adapter.upsert(RPG_TABLES.FACTION_STANDINGS, standing);
    return standing;
  }

  subscribeToFactionStandings(
    handler: (standings: FactionStanding[]) => void,
  ): Unsubscribe {
    return this.adapter.subscribe<FactionStanding>(
      RPG_TABLES.FACTION_STANDINGS,
      handler,
    );
  }

  // ── Pilot skills ───────────────────────────────────────────────────────────

  async getSkills(pilotId: string = DEFAULT_PILOT_ID): Promise<PilotSkills | null> {
    return this.adapter.get<PilotSkills>(RPG_TABLES.PILOT_SKILLS, pilotId);
  }

  /**
   * Spend one skill point to raise `skill` by 1 (max 10).
   * Returns the updated skill record, or null if:
   *   – the pilot or skills record doesn't exist,
   *   – no skill points are available, or
   *   – the skill is already at its cap (10).
   */
  async spendSkillPoint(
    skill: SkillKey,
    pilotId: string = DEFAULT_PILOT_ID,
  ): Promise<PilotSkills | null> {
    const [skills, pilot] = await Promise.all([
      this.getSkills(pilotId),
      this.getPilot(pilotId),
    ]);
    if (!skills || !pilot) return null;
    if (pilot.skillPoints <= 0) return null;

    const current = (skills as Record<SkillKey, number>)[skill];
    if (current >= 10) return null;

    const updated: PilotSkills = {
      ...skills,
      [skill]: current + 1,
      updatedAt: Date.now(),
    };
    await Promise.all([
      this.adapter.upsert(RPG_TABLES.PILOT_SKILLS, updated),
      this.updatePilot(pilotId, { skillPoints: pilot.skillPoints - 1 }),
    ]);
    return updated;
  }

  subscribeToSkills(handler: (skills: PilotSkills[]) => void): Unsubscribe {
    return this.adapter.subscribe<PilotSkills>(RPG_TABLES.PILOT_SKILLS, handler);
  }

  // ── Seed helpers ───────────────────────────────────────────────────────────

  private async seedFactionStandings(pilotId: string, startingFactionId: string): Promise<void> {
    const now = Date.now();
    await Promise.all(
      STANDING_FACTION_IDS.map((fid) => {
        const standing: FactionStanding = {
          id: this.standingId(pilotId, fid),
          pilotId,
          factionId: fid,
          reputation: fid === startingFactionId ? 200 : 0,
          updatedAt: now,
        };
        return this.adapter.upsert(RPG_TABLES.FACTION_STANDINGS, standing);
      }),
    );
  }

  private async seedSkills(pilotId: string): Promise<void> {
    const skills: PilotSkills = {
      id: pilotId,
      pilotId,
      combat: 0,
      navigation: 0,
      trade: 0,
      engineering: 0,
      diplomacy: 0,
      updatedAt: Date.now(),
    };
    await this.adapter.upsert(RPG_TABLES.PILOT_SKILLS, skills);
  }
}

// ── Factory functions ──────────────────────────────────────────────────────────

/**
 * Production factory — returns an RPGDatabase backed by IndexedDB.
 * Call once at app startup; keep the instance alive for the session.
 *
 * To switch to SpacetimeDB in future:
 *   import { SpacetimeDBAdapter } from "../db/SpacetimeDBAdapter";
 *   const adapter = new SpacetimeDBAdapter(host, namespace, token);
 *   const db = new RPGDatabase(adapter);
 *   await db.connect();
 */
export async function createRPGDatabase(): Promise<RPGDatabase> {
  const { IndexedDBAdapter } = await import("../db/IndexedDBAdapter");
  const adapter = new IndexedDBAdapter("rwipe-rpg", ALL_RPG_TABLES);
  const db = new RPGDatabase(adapter);
  await db.connect();
  return db;
}

/**
 * Test factory — returns an RPGDatabase backed by InMemoryAdapter.
 * Synchronously connected; no browser APIs required.
 */
export async function createTestRPGDatabase(): Promise<RPGDatabase> {
  const { InMemoryAdapter } = await import("../db/InMemoryAdapter");
  const adapter = new InMemoryAdapter();
  await adapter.connect();
  return new RPGDatabase(adapter);
}

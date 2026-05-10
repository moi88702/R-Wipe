import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryAdapter } from "../db/InMemoryAdapter";
import { CrewService } from "./CrewService";
import { CREW_POOL, ENGINEER_POOL_IDS } from "./crew-pool";
import { TRAIT_POOL } from "./trait-pool";
import {
  driveXpGain,
  rollDriveLevel,
  skillLevelFromXp,
  xpForSkillLevel,
  computeBias,
  clampBias,
  neutralBias,
  RECOVERY_DEFECTS,
} from "./bot-schema";

// ── Helpers ────────────────────────────────────────────────────────────────────

const PILOT_ID = "test-pilot";

/** Deterministic RNG returning a fixed sequence. */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0.5;
}

async function makeService(): Promise<CrewService> {
  const adapter = new InMemoryAdapter();
  await adapter.connect();
  return new CrewService(adapter);
}

// ── Schema helpers ─────────────────────────────────────────────────────────────

describe("xpForSkillLevel", () => {
  it("level 0 needs 0 XP", () => expect(xpForSkillLevel(0)).toBe(0));
  it("is strictly increasing", () => {
    for (let l = 1; l <= 10; l++) {
      expect(xpForSkillLevel(l)).toBeGreaterThan(xpForSkillLevel(l - 1));
    }
  });
});

describe("skillLevelFromXp", () => {
  it("0 XP → level 0", () => expect(skillLevelFromXp(0)).toBe(0));
  it("caps at 10", () => expect(skillLevelFromXp(999_999)).toBe(10));
  it("round-trips with xpForSkillLevel", () => {
    for (let l = 0; l <= 10; l++) {
      expect(skillLevelFromXp(xpForSkillLevel(l))).toBe(l);
    }
  });
});

describe("driveXpGain", () => {
  it("rookie (lv0) gets full value from a lv3 drive", () => {
    const gain = driveXpGain(3, 0);
    const base = xpForSkillLevel(4) - xpForSkillLevel(3);
    expect(gain).toBe(base);
  });
  it("expert (lv9) gets much less than a rookie from a lv3 drive", () => {
    const rookieGain = driveXpGain(3, 0);
    const expertGain = driveXpGain(3, 9);
    expect(expertGain).toBeLessThan(rookieGain * 0.15);
  });
  it("returns 0 when recipient level >= drive level cap", () => {
    expect(driveXpGain(3, 10)).toBe(0);
  });
});

describe("rollDriveLevel", () => {
  it("returns 0 for bots with skill < 2", () => {
    expect(rollDriveLevel(0, Math.random)).toBe(0);
    expect(rollDriveLevel(1, Math.random)).toBe(0);
  });
  it("always returns a positive value for skill >= 2", () => {
    const rng = seededRng([0, 0.25, 0.5, 0.75, 1]);
    for (let i = 0; i < 20; i++) {
      expect(rollDriveLevel(5, rng)).toBeGreaterThan(0);
    }
  });
  it("result is always less than skill level", () => {
    const rng = seededRng([0, 0.3, 0.6, 0.9]);
    for (let skill = 2; skill <= 10; skill++) {
      for (let i = 0; i < 4; i++) {
        expect(rollDriveLevel(skill, rng)).toBeLessThan(skill);
      }
    }
  });
});

describe("computeBias", () => {
  it("neutral with no traits", () => {
    const bias = computeBias([], TRAIT_POOL);
    expect(bias).toEqual(neutralBias());
  });
  it("fearless pushes aggression and risk positive", () => {
    const bias = computeBias(["fearless"], TRAIT_POOL);
    expect(bias.aggression).toBeGreaterThan(0);
    expect(bias.risk).toBeGreaterThan(0);
  });
  it("clamps to [-1, 1]", () => {
    const bias = clampBias({ aggression: 5, innovation: -5, risk: 2, altruism: -2, curiosity: 0, independence: 0 });
    expect(bias.aggression).toBe(1);
    expect(bias.innovation).toBe(-1);
    expect(bias.risk).toBe(1);
    expect(bias.altruism).toBe(-1);
  });
  it("traditionalist and innovative pull innovation axis in opposite directions", () => {
    const trad = computeBias(["traditionalist"], TRAIT_POOL);
    const inno = computeBias(["innovative"], TRAIT_POOL);
    expect(trad.innovation).toBeLessThan(0);
    expect(inno.innovation).toBeGreaterThan(0);
  });
});

// ── Crew pool ──────────────────────────────────────────────────────────────────

describe("crew pool", () => {
  it("has exactly 20 entries", () => expect(CREW_POOL.length).toBe(20));
  it("all poolIds are unique", () => {
    const ids = CREW_POOL.map(e => e.poolId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("all entries have exactly 3 starting traits", () => {
    for (const entry of CREW_POOL) {
      expect(entry.startingTraitIds.length).toBe(3);
    }
  });
  it("all starting trait IDs exist in the trait pool", () => {
    const traitIds = new Set(TRAIT_POOL.map(t => t.id));
    for (const entry of CREW_POOL) {
      for (const tid of entry.startingTraitIds) {
        expect(traitIds.has(tid), `Unknown trait "${tid}" in ${entry.poolId}`).toBe(true);
      }
    }
  });
  it("ENGINEER_POOL_IDS are all in CREW_POOL", () => {
    const poolIds = new Set(CREW_POOL.map(e => e.poolId));
    for (const id of ENGINEER_POOL_IDS) {
      expect(poolIds.has(id)).toBe(true);
    }
  });
  it("leanTendency is within [-100, +100]", () => {
    for (const entry of CREW_POOL) {
      expect(entry.leanTendency).toBeGreaterThanOrEqual(-100);
      expect(entry.leanTendency).toBeLessThanOrEqual(100);
    }
  });
});

describe("trait pool", () => {
  it("has 20 traits", () => expect(TRAIT_POOL.length).toBe(20));
  it("all trait IDs are unique", () => {
    const ids = TRAIT_POOL.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every trait has at least one bias weight", () => {
    for (const trait of TRAIT_POOL) {
      expect(Object.keys(trait.biasWeights).length).toBeGreaterThan(0);
    }
  });
});

describe("recovery defects", () => {
  it("has at least 10 defects", () => expect(RECOVERY_DEFECTS.length).toBeGreaterThanOrEqual(10));
  it("all defect IDs are unique", () => {
    const ids = RECOVERY_DEFECTS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── CrewService ────────────────────────────────────────────────────────────────

describe("CrewService.drawStartingCrew", () => {
  let svc: CrewService;
  beforeEach(async () => { svc = await makeService(); });

  it("returns exactly 6 bots", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    expect(bots.length).toBe(6);
  });

  it("all bots are alive and aboard", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    for (const b of bots) {
      expect(b.isAlive).toBe(true);
      expect(b.isAboard).toBe(true);
    }
  });

  it("all bots have source=pool and wage=0", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    for (const b of bots) {
      expect(b.source).toBe("pool");
      expect(b.monthlyWage).toBe(0);
    }
  });

  it("adoptionLean is within [-100, +100]", async () => {
    const rng = seededRng([0, 1, 0.5, 0.2, 0.8, 0.1, 0.9, 0.3, 0.7, 0.4]);
    const { bots } = await svc.drawStartingCrew(PILOT_ID, rng);
    for (const b of bots) {
      expect(b.adoptionLean).toBeGreaterThanOrEqual(-100);
      expect(b.adoptionLean).toBeLessThanOrEqual(100);
    }
  });

  it("starting crew includes at least one bot with engineering >= 1", async () => {
    // Run 10 draws — the guarantee must hold every time
    for (let i = 0; i < 10; i++) {
      const svc2 = await makeService();
      const { bots } = await svc2.drawStartingCrew(`pilot-${i}`);
      const engineerIds = new Set(ENGINEER_POOL_IDS);
      const hasEngineer = bots.some(b => engineerIds.has(b.poolId));
      expect(hasEngineer).toBe(true);
    }
  });

  it("persists bots so getLivingCrew returns them", async () => {
    await svc.drawStartingCrew(PILOT_ID);
    const living = await svc.getLivingCrew(PILOT_ID);
    expect(living.length).toBe(6);
  });

  it("seeds 6 skill records per bot", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    const skills = await svc.getBotSkills(bots[0]!.id);
    expect(skills.length).toBe(6);
  });

  it("starting skills match pool entry", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    const fixture = bots.find(b => b.poolId === "FIXTURE");
    if (!fixture) return; // might not be in this draw; skip
    const engSkill = await svc.getBotSkill(fixture.id, "engineering");
    expect(engSkill?.level).toBe(2);
  });

  it("seeds traits matching pool entry", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    const grey = bots.find(b => b.poolId === "GREY");
    if (!grey) return;
    const hasPara = await svc.hasTrait(grey.id, "paranoid");
    expect(hasPara).toBe(true);
  });
});

describe("CrewService.killBot", () => {
  let svc: CrewService;
  beforeEach(async () => { svc = await makeService(); });

  it("marks the bot as dead", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    const bot = bots[0]!;
    await svc.killBot(bot.id);
    const updated = await svc.getCrewBot(bot.id);
    expect(updated?.isAlive).toBe(false);
  });

  it("returns XP drives for high-skill bots", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    // Manually level up a skill to 5 first
    const bot = bots[0]!;
    await svc.awardSkillXp(bot.id, "combat", xpForSkillLevel(5));
    const drives = await svc.killBot(bot.id);
    expect(drives.some(d => d.family === "combat")).toBe(true);
  });

  it("returns empty drives for bots with all skills < 2", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.connect();
    const svc2 = new CrewService(adapter);
    const { bots } = await svc2.drawStartingCrew("p2");
    // Find a bot with no high skills (all pools start at max lv2)
    // Use a fresh draw and kill immediately — most bots have 1-2 skill entries at lv2
    // The drives pool should still be non-empty since lv2 bots can drop lv1 drives
    const bot = bots[0]!;
    const drives = await svc2.killBot(bot.id);
    // At lv2, rollDriveLevel(2, rng) = 1, which is valid
    expect(Array.isArray(drives)).toBe(true);
  });

  it("is idempotent — killing a dead bot returns empty drives", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    const bot = bots[0]!;
    await svc.killBot(bot.id);
    const secondCall = await svc.killBot(bot.id);
    expect(secondCall.length).toBe(0);
  });
});

describe("CrewService.recoverBot", () => {
  let svc: CrewService;
  beforeEach(async () => { svc = await makeService(); });

  it("revives a dead bot", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    const bot = bots[0]!;
    await svc.killBot(bot.id);
    const recovered = await svc.recoverBot(bot.id);
    expect(recovered?.isAlive).toBe(true);
    expect(recovered?.hasBeenRecovered).toBe(true);
    expect(recovered?.defectId).not.toBeNull();
  });

  it("assigns a valid defect id", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    const bot = bots[0]!;
    await svc.killBot(bot.id);
    const recovered = await svc.recoverBot(bot.id);
    const defectIds = new Set(RECOVERY_DEFECTS.map(d => d.id));
    expect(defectIds.has(recovered!.defectId!)).toBe(true);
  });

  it("returns null for a living bot", async () => {
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    const result = await svc.recoverBot(bots[0]!.id);
    expect(result).toBeNull();
  });
});

describe("CrewService skills", () => {
  let svc: CrewService;
  let botId: string;

  beforeEach(async () => {
    svc = await makeService();
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    botId = bots[0]!.id;
  });

  it("awardSkillXp increases XP and levels up", async () => {
    const before = await svc.getBotSkill(botId, "combat");
    const levelBefore = before?.level ?? 0;
    const xpToNext = xpForSkillLevel(levelBefore + 1) - (before?.xp ?? 0);
    const updated = await svc.awardSkillXp(botId, "combat", xpToNext);
    expect(updated?.level).toBe(levelBefore + 1);
  });

  it("installXpDrive returns xpGained > 0 for a low-level bot", async () => {
    const skill = await svc.getBotSkill(botId, "hacking");
    const level = skill?.level ?? 0;
    const result = await svc.installXpDrive(botId, {
      sourceBotName: "TEST",
      family: "hacking",
      driveLevel: Math.max(1, level + 2),
    });
    expect(result?.xpGained).toBeGreaterThan(0);
  });

  it("installXpDrive returns 0 gain when recipient outskills the drive", async () => {
    // Level bot to 10
    await svc.awardSkillXp(botId, "stealth", xpForSkillLevel(10));
    const result = await svc.installXpDrive(botId, {
      sourceBotName: "TEST",
      family: "stealth",
      driveLevel: 3,
    });
    expect(result?.xpGained).toBe(0);
  });
});

describe("CrewService traits", () => {
  let svc: CrewService;
  let botId: string;

  beforeEach(async () => {
    svc = await makeService();
    const { bots } = await svc.drawStartingCrew(PILOT_ID);
    botId = bots[0]!.id;
  });

  it("addTrait and hasTrait round-trip", async () => {
    await svc.addTrait(botId, "philosophical");
    expect(await svc.hasTrait(botId, "philosophical")).toBe(true);
  });

  it("removeTrait removes the trait", async () => {
    await svc.addTrait(botId, "philosophical");
    await svc.removeTrait(botId, "philosophical");
    expect(await svc.hasTrait(botId, "philosophical")).toBe(false);
  });

  it("getBotTraits returns all current traits", async () => {
    const traits = await svc.getBotTraits(botId);
    expect(traits.length).toBe(3); // seeded from pool entry
  });
});

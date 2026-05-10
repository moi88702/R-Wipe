import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryAdapter } from "../db/InMemoryAdapter";
import { RPGDatabase } from "./RPGDatabase";
import {
  DEFAULT_PILOT_ID,
  STARTING_CREDITS,
  levelFromXp,
  reputationLabel,
  xpForLevel,
  xpLevelProgress,
  xpToNextLevel,
  canDockWithReputation,
} from "./schema";

// ── Helpers ────────────────────────────────────────────────────────────────

async function makeDB(): Promise<RPGDatabase> {
  const adapter = new InMemoryAdapter();
  await adapter.connect();
  return new RPGDatabase(adapter);
}

async function makeDBWithPilot(): Promise<{ db: RPGDatabase }> {
  const db = await makeDB();
  await db.createPilot("Ghost", "earth");
  return { db };
}

// ── Schema helpers ─────────────────────────────────────────────────────────

describe("xpForLevel", () => {
  it("level 1 needs 0 xp", () => expect(xpForLevel(1)).toBe(0));
  it("level 2 needs 100 xp", () => expect(xpForLevel(2)).toBe(100));
  it("is strictly increasing", () => {
    for (let l = 2; l <= 50; l++) {
      expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
    }
  });
});

describe("levelFromXp", () => {
  it("0 xp → level 1", () => expect(levelFromXp(0)).toBe(1));
  it("99 xp → level 1", () => expect(levelFromXp(99)).toBe(1));
  it("100 xp → level 2", () => expect(levelFromXp(100)).toBe(2));
  it("caps at 50", () => expect(levelFromXp(999_999)).toBe(50));
  it("round-trips with xpForLevel", () => {
    for (let l = 1; l <= 50; l++) {
      expect(levelFromXp(xpForLevel(l))).toBe(l);
    }
  });
});

describe("xpToNextLevel", () => {
  it("returns 0 at max level", () => expect(xpToNextLevel(999_999)).toBe(0));
  it("equals gap between adjacent levels", () => {
    const xpAtL5 = xpForLevel(5);
    expect(xpToNextLevel(xpAtL5)).toBe(xpForLevel(6) - xpAtL5);
  });
});

describe("xpLevelProgress", () => {
  it("0 at level floor", () => expect(xpLevelProgress(xpForLevel(3))).toBe(0));
  it("1 at max level", () => expect(xpLevelProgress(999_999)).toBe(1));
  it("0.5 at midpoint", () => {
    const floor = xpForLevel(3);
    const ceil  = xpForLevel(4);
    const mid   = floor + Math.floor((ceil - floor) / 2);
    const frac  = xpLevelProgress(mid);
    expect(frac).toBeGreaterThan(0.4);
    expect(frac).toBeLessThan(0.6);
  });
});

describe("reputationLabel", () => {
  it("covers the full spectrum", () => {
    expect(reputationLabel(1000)).toBe("Allied");
    expect(reputationLabel(750)).toBe("Allied");
    expect(reputationLabel(300)).toBe("Friendly");
    expect(reputationLabel(0)).toBe("Neutral");
    expect(reputationLabel(-1)).toBe("Suspicious");
    expect(reputationLabel(-300)).toBe("Suspicious");
    expect(reputationLabel(-301)).toBe("Hostile");
    expect(reputationLabel(-750)).toBe("Hostile");
    expect(reputationLabel(-751)).toBe("Enemy");
    expect(reputationLabel(-1000)).toBe("Enemy");
  });
});

describe("canDockWithReputation", () => {
  it("allows docking from -300 upward", () => {
    expect(canDockWithReputation(-300)).toBe(true);
    expect(canDockWithReputation(0)).toBe(true);
    expect(canDockWithReputation(1000)).toBe(true);
  });
  it("blocks docking below -300", () => {
    expect(canDockWithReputation(-301)).toBe(false);
    expect(canDockWithReputation(-1000)).toBe(false);
  });
});

// ── Pilot profile ──────────────────────────────────────────────────────────

describe("RPGDatabase — pilot profile", () => {
  let db: RPGDatabase;

  beforeEach(async () => {
    db = await makeDB();
  });

  it("returns null for unknown pilot", async () => {
    expect(await db.getPilot()).toBeNull();
  });

  it("creates a pilot with default values", async () => {
    const pilot = await db.createPilot("Ghost", "earth");
    expect(pilot.callsign).toBe("Ghost");
    expect(pilot.factionId).toBe("earth");
    expect(pilot.credits).toBe(STARTING_CREDITS);
    expect(pilot.xp).toBe(0);
    expect(pilot.level).toBe(1);
    expect(pilot.skillPoints).toBe(0);
    expect(pilot.id).toBe(DEFAULT_PILOT_ID);
  });

  it("can be retrieved after creation", async () => {
    await db.createPilot("Ghost", "earth");
    const fetched = await db.getPilot();
    expect(fetched?.callsign).toBe("Ghost");
  });

  it("createPilot seeds faction standings", async () => {
    await db.createPilot("Ghost", "earth");
    const earthStanding = await db.getFactionStanding("earth");
    expect(earthStanding?.reputation).toBe(200);
    const marsStanding = await db.getFactionStanding("mars");
    expect(marsStanding?.reputation).toBe(0);
  });

  it("createPilot seeds all zero skills", async () => {
    await db.createPilot("Ghost", "earth");
    const skills = await db.getSkills();
    expect(skills?.combat).toBe(0);
    expect(skills?.navigation).toBe(0);
    expect(skills?.diplomacy).toBe(0);
  });
});

// ── XP / levelling ─────────────────────────────────────────────────────────

describe("RPGDatabase — awardXp", () => {
  it("increments xp and stays level 1 before threshold", async () => {
    const { db } = await makeDBWithPilot();
    const pilot = await db.awardXp(50);
    expect(pilot?.xp).toBe(50);
    expect(pilot?.level).toBe(1);
  });

  it("levels up when xp crosses threshold", async () => {
    const { db } = await makeDBWithPilot();
    const pilot = await db.awardXp(xpForLevel(2));
    expect(pilot?.level).toBe(2);
    expect(pilot?.skillPoints).toBe(1);
  });

  it("awards skill points for each level gained at once", async () => {
    const { db } = await makeDBWithPilot();
    const pilot = await db.awardXp(xpForLevel(5));
    expect(pilot?.level).toBe(5);
    expect(pilot?.skillPoints).toBe(4); // levels 2-5 = 4 points
  });

  it("returns null for unknown pilot", async () => {
    const db = await makeDB();
    expect(await db.awardXp(100)).toBeNull();
  });
});

// ── Credits ────────────────────────────────────────────────────────────────

describe("RPGDatabase — adjustCredits", () => {
  it("adds credits correctly", async () => {
    const { db } = await makeDBWithPilot();
    const pilot = await db.adjustCredits(5000);
    expect(pilot?.credits).toBe(STARTING_CREDITS + 5000);
  });

  it("deducts credits correctly", async () => {
    const { db } = await makeDBWithPilot();
    const pilot = await db.adjustCredits(-1000);
    expect(pilot?.credits).toBe(STARTING_CREDITS - 1000);
  });

  it("returns null when spending more than balance", async () => {
    const { db } = await makeDBWithPilot();
    expect(await db.adjustCredits(-(STARTING_CREDITS + 1))).toBeNull();
  });

  it("allows spending entire balance", async () => {
    const { db } = await makeDBWithPilot();
    const pilot = await db.adjustCredits(-STARTING_CREDITS);
    expect(pilot?.credits).toBe(0);
  });
});

// ── Faction standings ──────────────────────────────────────────────────────

describe("RPGDatabase — faction standings", () => {
  it("adjusts reputation and clamps at +1000", async () => {
    const { db } = await makeDBWithPilot();
    const s = await db.adjustReputation("earth", 900); // 200 + 900 = 1100 → clamped
    expect(s.reputation).toBe(1000);
  });

  it("clamps at -1000", async () => {
    const { db } = await makeDBWithPilot();
    const s = await db.adjustReputation("earth", -2000);
    expect(s.reputation).toBe(-1000);
  });

  it("returns all standings for the pilot", async () => {
    const { db } = await makeDBWithPilot();
    const standings = await db.getAllFactionStandings();
    expect(standings.length).toBe(4); // earth, mars, pirate, mercenary
  });

  it("initialises missing faction at 0 when adjusting", async () => {
    const { db } = await makeDBWithPilot();
    const s = await db.adjustReputation("unknown-faction", 50);
    expect(s.reputation).toBe(50);
  });
});

// ── Skills ─────────────────────────────────────────────────────────────────

describe("RPGDatabase — pilot skills", () => {
  it("spendSkillPoint returns null with no points available", async () => {
    const { db } = await makeDBWithPilot();
    // Fresh pilot has 0 skill points
    expect(await db.spendSkillPoint("combat")).toBeNull();
  });

  it("spendSkillPoint increments skill and decrements pilot.skillPoints", async () => {
    const { db } = await makeDBWithPilot();
    await db.awardXp(xpForLevel(3)); // gain 2 skill points
    const skills = await db.spendSkillPoint("combat");
    expect(skills?.combat).toBe(1);
    const pilot = await db.getPilot();
    expect(pilot?.skillPoints).toBe(1);
  });

  it("spendSkillPoint returns null when skill is maxed at 10", async () => {
    const { db } = await makeDBWithPilot();
    // Award enough XP for 15 levels-worth of skill points
    await db.awardXp(xpForLevel(16));
    // Spend 10 on combat
    for (let i = 0; i < 10; i++) {
      await db.spendSkillPoint("combat");
    }
    expect(await db.spendSkillPoint("combat")).toBeNull();
  });

  it("different skills can be maxed independently", async () => {
    const { db } = await makeDBWithPilot();
    await db.awardXp(xpForLevel(21)); // 20 skill points
    for (let i = 0; i < 10; i++) await db.spendSkillPoint("combat");
    for (let i = 0; i < 10; i++) await db.spendSkillPoint("navigation");
    const skills = await db.getSkills();
    expect(skills?.combat).toBe(10);
    expect(skills?.navigation).toBe(10);
    expect(skills?.trade).toBe(0);
  });
});

// ── Subscriptions ──────────────────────────────────────────────────────────

describe("RPGDatabase — subscriptions", () => {
  it("subscribe fires immediately with current snapshot", async () => {
    const { db } = await makeDBWithPilot();
    const received: unknown[][] = [];
    const unsub = db.subscribeToPilots((p) => received.push(p));
    // Give the async immediate snapshot a tick to arrive
    await new Promise((r) => setTimeout(r, 0));
    expect(received.length).toBeGreaterThan(0);
    unsub();
  });

  it("subscribe fires again after an update", async () => {
    const { db } = await makeDBWithPilot();
    const snapshots: number[] = [];
    const unsub = db.subscribeToPilots((pilots) => {
      const p = pilots[0];
      if (p) snapshots.push(p.credits);
    });
    await new Promise((r) => setTimeout(r, 0));
    await db.adjustCredits(500);
    await new Promise((r) => setTimeout(r, 0));
    expect(snapshots[snapshots.length - 1]).toBe(STARTING_CREDITS + 500);
    unsub();
  });

  it("unsubscribing stops further notifications", async () => {
    const { db } = await makeDBWithPilot();
    let callCount = 0;
    const unsub = db.subscribeToPilots(() => callCount++);
    await new Promise((r) => setTimeout(r, 0));
    const countBeforeUnsub = callCount;
    unsub();
    await db.adjustCredits(100);
    await new Promise((r) => setTimeout(r, 0));
    expect(callCount).toBe(countBeforeUnsub);
  });
});

// ── Play-time ──────────────────────────────────────────────────────────────

describe("RPGDatabase — addPlayTime", () => {
  it("accumulates play-time across calls", async () => {
    const { db } = await makeDBWithPilot();
    await db.addPlayTime(60_000);
    await db.addPlayTime(30_000);
    const pilot = await db.getPilot();
    expect(pilot?.playTimeMs).toBe(90_000);
  });
});

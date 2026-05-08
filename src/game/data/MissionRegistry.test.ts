import { describe, it, expect } from "vitest";
import { MissionRegistry } from "./MissionRegistry";

// ── getMission ────────────────────────────────────────────────────────────────

describe("MissionRegistry.getMission", () => {
  it("returns the correct spec for a known mission id", () => {
    // Given a known courier mission id
    // When we look it up
    const mission = MissionRegistry.getMission("mission-tf-courier-alpha");

    // Then we get the full spec with the expected shape
    expect(mission).toBeDefined();
    expect(mission!.id).toBe("mission-tf-courier-alpha");
    expect(mission!.type).toBe("courier");
    expect(mission!.npcId).toBe("npc-commander-voss");
    expect(mission!.destinationLocationId).toBe("station-beta");
    expect(mission!.rewardCredits).toBe(800);
    expect(mission!.rewardReputation).toBe(50);
  });

  it("returns undefined for an unknown mission id", () => {
    // Given an id that does not exist in the registry
    // When we look it up
    const mission = MissionRegistry.getMission("does-not-exist");

    // Then we get undefined, not a throw
    expect(mission).toBeUndefined();
  });

  it("can look up every registered mission by its own id", () => {
    // Given all mission specs
    for (const mission of MissionRegistry.getAllMissions()) {
      // When we look each one up by id
      const found = MissionRegistry.getMission(mission.id);
      // Then we get the same object back
      expect(found).toBe(mission);
    }
  });
});

// ── getAllMissions ────────────────────────────────────────────────────────────

describe("MissionRegistry.getAllMissions", () => {
  it("returns a non-empty frozen array", () => {
    // Given the registry is initialised
    // When we request all missions
    const all = MissionRegistry.getAllMissions();

    // Then the array is non-empty and immutable
    expect(all.length).toBeGreaterThan(0);
    expect(Object.isFrozen(all)).toBe(true);
  });

  it("contains at least 18 missions covering all six factions", () => {
    // Given the full set of registered missions
    const all = MissionRegistry.getAllMissions();

    // Then there are enough missions
    expect(all.length).toBeGreaterThanOrEqual(18);
  });

  it("contains expected mission ids from all factions", () => {
    const ids = MissionRegistry.getAllMissions().map((m) => m.id);
    // One representative per faction
    expect(ids).toContain("mission-tf-courier-alpha");   // terran-federation
    expect(ids).toContain("mission-xc-courier-nexus");   // xeno-collective
    expect(ids).toContain("mission-vm-courier-hub");     // void-merchants
    expect(ids).toContain("mission-sc-courier-salvage"); // scavenger-clans
    expect(ids).toContain("mission-dm-courier-gamma");   // deep-miners
    expect(ids).toContain("mission-nr-courier-rebel");   // nova-rebels
  });

  it("every mission has a non-empty id, title, npcId, and valid type", () => {
    const validTypes = new Set(["courier", "trade", "explore", "kill", "away"]);
    for (const m of MissionRegistry.getAllMissions()) {
      expect(m.id.length).toBeGreaterThan(0);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.npcId.length).toBeGreaterThan(0);
      expect(validTypes.has(m.type)).toBe(true);
    }
  });

  it("every courier mission has a destinationLocationId", () => {
    for (const m of MissionRegistry.getAllMissions()) {
      if (m.type === "courier") {
        expect(m.destinationLocationId).toBeDefined();
        expect(m.destinationLocationId!.length).toBeGreaterThan(0);
      }
    }
  });

  it("every trade mission has requiredItemType, requiredItemCount, and sellPrice", () => {
    for (const m of MissionRegistry.getAllMissions()) {
      if (m.type === "trade") {
        expect(m.requiredItemType).toBeDefined();
        expect(m.requiredItemCount).toBeDefined();
        expect(m.requiredItemCount!).toBeGreaterThan(0);
        expect(m.sellPrice).toBeDefined();
        expect(m.sellPrice!).toBeGreaterThan(0);
      }
    }
  });
});

// ── getAllMissionIds ───────────────────────────────────────────────────────────

describe("MissionRegistry.getAllMissionIds", () => {
  it("returns ids matching getAllMissions", () => {
    const ids = MissionRegistry.getAllMissionIds();
    const expected = MissionRegistry.getAllMissions().map((m) => m.id);
    expect(ids).toEqual(expected);
  });
});

// ── getMissionsByFaction ──────────────────────────────────────────────────────

describe("MissionRegistry.getMissionsByFaction", () => {
  it("returns all missions for terran-federation", () => {
    // Given terran-federation has three missions
    const missions = MissionRegistry.getMissionsByFaction("terran-federation");
    const ids = missions.map((m) => m.id);
    expect(ids).toContain("mission-tf-courier-alpha");
    expect(ids).toContain("mission-tf-patrol-dispatch");
    expect(ids).toContain("mission-tf-trade-alloys");
  });

  it("returns an empty array for an unknown faction id", () => {
    const missions = MissionRegistry.getMissionsByFaction("nonexistent-faction");
    expect(missions).toEqual([]);
  });

  it("returns missions only for the requested faction", () => {
    // Given xeno-collective missions
    const missions = MissionRegistry.getMissionsByFaction("xeno-collective");
    const ids = missions.map((m) => m.id);
    expect(ids).toContain("mission-xc-courier-nexus");
    expect(ids).toContain("mission-xc-trade-crystals");
    expect(ids).toContain("mission-xc-trade-exotic");
    // Ensure no other faction's missions slipped in
    expect(ids).not.toContain("mission-tf-courier-alpha");
  });
});

// ── getMissionsByNPC ──────────────────────────────────────────────────────────

describe("MissionRegistry.getMissionsByNPC", () => {
  it("returns missions offered by the given NPC", () => {
    // Given npc-commander-voss offers two missions
    const missions = MissionRegistry.getMissionsByNPC("npc-commander-voss");
    const ids = missions.map((m) => m.id);
    expect(ids).toContain("mission-tf-courier-alpha");
    expect(ids).toContain("mission-tf-patrol-dispatch");
  });

  it("returns an empty array for an NPC with no missions", () => {
    const missions = MissionRegistry.getMissionsByNPC("npc-nobody");
    expect(missions).toEqual([]);
  });
});

// ── getMissionsByType ─────────────────────────────────────────────────────────

describe("MissionRegistry.getMissionsByType", () => {
  it("returns only courier missions when type is 'courier'", () => {
    const missions = MissionRegistry.getMissionsByType("courier");
    expect(missions.length).toBeGreaterThan(0);
    for (const m of missions) {
      expect(m.type).toBe("courier");
    }
  });

  it("returns only trade missions when type is 'trade'", () => {
    const missions = MissionRegistry.getMissionsByType("trade");
    expect(missions.length).toBeGreaterThan(0);
    for (const m of missions) {
      expect(m.type).toBe("trade");
    }
  });

  it("all known types together equal the full list", () => {
    const couriers = MissionRegistry.getMissionsByType("courier");
    const trades = MissionRegistry.getMissionsByType("trade");
    const explores = MissionRegistry.getMissionsByType("explore");
    const kills = MissionRegistry.getMissionsByType("kill");
    const aways = MissionRegistry.getMissionsByType("away");
    const total = MissionRegistry.getAllMissions().length;
    expect(couriers.length + trades.length + explores.length + kills.length + aways.length).toBe(total);
  });
});

// ── getFactionForMission ──────────────────────────────────────────────────────

describe("MissionRegistry.getFactionForMission", () => {
  it("returns the correct faction id for a known mission", () => {
    // Given mission-tf-courier-alpha belongs to terran-federation
    const factionId = MissionRegistry.getFactionForMission("mission-tf-courier-alpha");
    expect(factionId).toBe("terran-federation");
  });

  it("returns the correct faction id for a nova-rebels mission", () => {
    const factionId = MissionRegistry.getFactionForMission("mission-nr-trade-exotic");
    expect(factionId).toBe("nova-rebels");
  });

  it("returns undefined for an unknown mission id", () => {
    const factionId = MissionRegistry.getFactionForMission("unknown-mission");
    expect(factionId).toBeUndefined();
  });

  it("every mission in the registry resolves to a faction", () => {
    // All registered missions should have a faction owner
    for (const m of MissionRegistry.getAllMissions()) {
      expect(MissionRegistry.getFactionForMission(m.id)).toBeDefined();
    }
  });
});

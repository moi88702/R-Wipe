import { describe, it, expect } from "vitest";
import { NPCRegistry } from "./NPCRegistry";

// ── getNPC ────────────────────────────────────────────────────────────────────

describe("NPCRegistry.getNPC", () => {
  it("returns the correct definition for a known NPC id", () => {
    // Given a known NPC id
    // When we look it up
    const npc = NPCRegistry.getNPC("npc-commander-voss");

    // Then we get the full definition back with the expected shape
    expect(npc).toBeDefined();
    expect(npc!.id).toBe("npc-commander-voss");
    expect(npc!.name).toBe("Commander Voss");
    expect(npc!.factionId).toBe("terran-federation");
    expect(npc!.role).toBe("commander");
    expect(npc!.missionIds).toContain("mission-tf-courier-alpha");
  });

  it("returns undefined for an unknown NPC id", () => {
    // Given an id that does not exist in the registry
    // When we look it up
    const npc = NPCRegistry.getNPC("does-not-exist");

    // Then we get undefined, not a throw
    expect(npc).toBeUndefined();
  });

  it("can look up every registered NPC by its own id", () => {
    // Given all NPC definitions
    for (const npc of NPCRegistry.getAllNPCs()) {
      // When we look each one up by id
      const found = NPCRegistry.getNPC(npc.id);
      // Then we get the same object back
      expect(found).toBe(npc);
    }
  });
});

// ── getAllNPCs ────────────────────────────────────────────────────────────────

describe("NPCRegistry.getAllNPCs", () => {
  it("returns a non-empty frozen array", () => {
    // Given the registry is initialised
    // When we request all NPCs
    const all = NPCRegistry.getAllNPCs();

    // Then the array is non-empty and immutable
    expect(all.length).toBeGreaterThan(0);
    expect(Object.isFrozen(all)).toBe(true);
  });

  it("contains exactly the twelve expected NPCs", () => {
    const ids = NPCRegistry.getAllNPCs().map((n) => n.id);
    const expected = [
      "npc-commander-voss",
      "npc-trader-halley",
      "npc-emissary-zyx",
      "npc-archivist-krell",
      "npc-broker-sable",
      "npc-captain-mira",
      "npc-chief-rask",
      "npc-scrapper-dex",
      "npc-foreman-groth",
      "npc-geologist-pera",
      "npc-insurgent-tyne",
      "npc-strategist-orion",
    ];
    for (const id of expected) {
      expect(ids).toContain(id);
    }
    expect(ids).toHaveLength(12);
  });

  it("every NPC has a non-empty id, name, factionId, and dialogue", () => {
    for (const npc of NPCRegistry.getAllNPCs()) {
      expect(npc.id.length).toBeGreaterThan(0);
      expect(npc.name.length).toBeGreaterThan(0);
      expect(npc.factionId.length).toBeGreaterThan(0);
      expect(npc.dialogueGreeting.length).toBeGreaterThan(0);
      expect(npc.dialogueIdle.length).toBeGreaterThan(0);
    }
  });

  it("every NPC offers at least one mission", () => {
    for (const npc of NPCRegistry.getAllNPCs()) {
      expect(npc.missionIds.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── getAllNPCIds ───────────────────────────────────────────────────────────────

describe("NPCRegistry.getAllNPCIds", () => {
  it("returns ids matching getAllNPCs", () => {
    const ids = NPCRegistry.getAllNPCIds();
    const expected = NPCRegistry.getAllNPCs().map((n) => n.id);
    expect(ids).toEqual(expected);
  });
});

// ── getNPCsByFaction ──────────────────────────────────────────────────────────

describe("NPCRegistry.getNPCsByFaction", () => {
  it("returns all NPCs belonging to the given faction", () => {
    // Given terran-federation has two NPCs
    const npcs = NPCRegistry.getNPCsByFaction("terran-federation");
    const ids = npcs.map((n) => n.id);
    expect(ids).toContain("npc-commander-voss");
    expect(ids).toContain("npc-trader-halley");
    expect(npcs.every((n) => n.factionId === "terran-federation")).toBe(true);
  });

  it("returns an empty array for an unknown faction id", () => {
    const npcs = NPCRegistry.getNPCsByFaction("nonexistent-faction");
    expect(npcs).toEqual([]);
  });

  it("returns the correct NPCs for each faction", () => {
    // Spot-check each faction has the expected NPC count
    const expectations: Array<[string, number]> = [
      ["terran-federation", 2],
      ["xeno-collective", 2],
      ["void-merchants", 2],
      ["scavenger-clans", 2],
      ["deep-miners", 2],
      ["nova-rebels", 2],
    ];
    for (const [factionId, expectedCount] of expectations) {
      const npcs = NPCRegistry.getNPCsByFaction(factionId);
      expect(npcs).toHaveLength(expectedCount);
    }
  });
});

// ── getNPCForMission ──────────────────────────────────────────────────────────

describe("NPCRegistry.getNPCForMission", () => {
  it("returns the NPC that offers the given mission", () => {
    // Given mission-tf-courier-alpha is offered by npc-commander-voss
    const npc = NPCRegistry.getNPCForMission("mission-tf-courier-alpha");
    expect(npc).toBeDefined();
    expect(npc!.id).toBe("npc-commander-voss");
  });

  it("returns the NPC for a trade mission", () => {
    // Given mission-xc-trade-exotic is offered by npc-archivist-krell
    const npc = NPCRegistry.getNPCForMission("mission-xc-trade-exotic");
    expect(npc).toBeDefined();
    expect(npc!.id).toBe("npc-archivist-krell");
  });

  it("returns undefined for an unknown mission id", () => {
    const npc = NPCRegistry.getNPCForMission("unknown-mission-id");
    expect(npc).toBeUndefined();
  });
});

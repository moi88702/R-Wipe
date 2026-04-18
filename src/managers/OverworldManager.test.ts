import { describe, expect, it } from "vitest";
import {
  InMemoryStorage,
  OverworldManager,
  OVERWORLD_STORAGE_KEY,
  createInitialOverworldState,
} from "./OverworldManager";
import { StorageMigrationError } from "../services/LocalStorageService";
import type { MissionSpec, Sector, SectorNode } from "../types/campaign";

function makeSector(): Sector {
  const a: SectorNode = {
    id: "a",
    name: "Alpha",
    kind: "station",
    position: { x: 0, y: 0 },
    missionIds: ["m-a1"],
    unlocksNodeIds: ["b"],
  };
  const b: SectorNode = {
    id: "b",
    name: "Beta",
    kind: "asteroid-field",
    position: { x: 100, y: 0 },
    missionIds: ["m-b1", "m-b2"],
    unlocksNodeIds: ["c"],
  };
  const c: SectorNode = {
    id: "c",
    name: "Gamma",
    kind: "nebula",
    position: { x: 200, y: 0 },
    missionIds: [],
    unlocksNodeIds: [],
  };

  const mk = (id: string, nodeId: string, extra: Partial<MissionSpec> = {}): MissionSpec => ({
    id,
    nodeId,
    name: id,
    difficulty: 1,
    levelNumber: 1,
    rewardCredits: 100,
    rewardParts: [],
    rewardBlueprints: [],
    rewardMaterials: { scrap: 3 },
    ...extra,
  });

  return {
    id: "sec-test",
    name: "Test Sector",
    startNodeId: "a",
    nodes: { a, b, c },
    missions: {
      "m-a1": mk("m-a1", "a", { rewardParts: ["hull-t1"] }),
      "m-b1": mk("m-b1", "b"),
      "m-b2": mk("m-b2", "b"),
    },
  };
}

describe("createInitialOverworldState", () => {
  it("marks only the starting node unlocked", () => {
    const s = createInitialOverworldState(makeSector());
    expect(s.currentNodeId).toBe("a");
    expect(s.unlockedNodeIds).toEqual(["a"]);
    expect(s.completedMissionIds).toEqual([]);
    expect(s.inventory.credits).toBe(0);
  });
});

describe("OverworldManager", () => {
  it("lists only uncompleted missions at the current node", () => {
    const om = new OverworldManager(makeSector(), null);
    expect(om.getAvailableMissionsAtNode("a").map((m) => m.id)).toEqual(["m-a1"]);
    om.completeMission("m-a1");
    expect(om.getAvailableMissionsAtNode("a")).toEqual([]);
  });

  it("blocks movement to locked nodes", () => {
    const om = new OverworldManager(makeSector(), null);
    expect(om.moveTo("b")).toBe(false);
    // After clearing the only mission at "a", "b" unlocks.
    om.completeMission("m-a1");
    expect(om.moveTo("b")).toBe(true);
    expect(om.getState().currentNodeId).toBe("b");
  });

  it("startMission rejects locked or unknown missions", () => {
    const om = new OverworldManager(makeSector(), null);
    expect(om.startMission("m-b1").ok).toBe(false);
    expect(om.startMission("missing").reason).toBe("unknown-mission");
    expect(om.startMission("m-a1").ok).toBe(true);
  });

  it("completeMission is idempotent and rewards only once", () => {
    const om = new OverworldManager(makeSector(), null);
    const first = om.completeMission("m-a1");
    expect(first.outcome).toBe("cleared");
    expect(first.awardedCredits).toBe(100);
    expect(om.getState().inventory.credits).toBe(100);
    expect(om.getState().inventory.unlockedParts).toContain("hull-t1");

    const again = om.completeMission("m-a1");
    expect(again.outcome).toBe("already-done");
    expect(om.getState().inventory.credits).toBe(100);
  });

  it("only cascades unlocks once every mission at the node is done", () => {
    const om = new OverworldManager(makeSector(), null);
    om.completeMission("m-a1"); // unlocks b
    om.moveTo("b");
    const first = om.completeMission("m-b1");
    expect(first.newlyUnlockedNodes).toEqual([]);
    expect(om.getState().unlockedNodeIds).not.toContain("c");
    const second = om.completeMission("m-b2");
    expect(second.newlyUnlockedNodes).toEqual(["c"]);
    expect(om.getState().unlockedNodeIds).toContain("c");
  });

  it("persists state across instances via storage", () => {
    const storage = new InMemoryStorage();
    const a = new OverworldManager(makeSector(), storage);
    a.completeMission("m-a1");
    a.save();
    expect(storage.getItem(OVERWORLD_STORAGE_KEY)).not.toBeNull();

    const b = new OverworldManager(makeSector(), storage);
    expect(b.load()).toBe(true);
    expect(b.getState().completedMissionIds).toContain("m-a1");
    expect(b.getState().inventory.credits).toBe(100);
    expect(b.getState().unlockedNodeIds).toContain("b");
  });

  it("throws StorageMigrationError when the stored sector id doesn't match", () => {
    const storage = new InMemoryStorage();
    // Save under a sector with id "sec-test"
    new OverworldManager(makeSector(), storage).save();
    // Load with a sector that reports a different id.
    const other = { ...makeSector(), id: "sec-other" };
    const om = new OverworldManager(other, storage);
    expect(() => om.load()).toThrow(StorageMigrationError);
  });

  it("strips references to nodes / missions that no longer exist on load", () => {
    const storage = new InMemoryStorage();
    // Seed storage with a payload that points to a deleted node + mission.
    const envelope = {
      schemaVersion: 1,
      data: {
        schemaVersion: 1,
        sectorId: "sec-test",
        currentNodeId: "removed-node",
        completedMissionIds: ["m-a1", "missing-mission"],
        unlockedNodeIds: ["a", "removed-node"],
        inventory: {
          credits: 50,
          materials: {},
          unlockedParts: [],
          unlockedColours: [],
          blueprints: [],
          equippedBlueprintId: null,
        },
      },
    };
    storage.setItem(OVERWORLD_STORAGE_KEY, JSON.stringify(envelope));

    const om = new OverworldManager(makeSector(), storage);
    expect(om.load()).toBe(true);
    const s = om.getState();
    // currentNode falls back to the sector start.
    expect(s.currentNodeId).toBe("a");
    expect(s.unlockedNodeIds).toEqual(["a"]);
    expect(s.completedMissionIds).toEqual(["m-a1"]);
  });

  it("spendCredits enforces balance", () => {
    const om = new OverworldManager(makeSector(), null);
    om.addCredits(250);
    expect(om.spendCredits(300)).toBe(false);
    expect(om.spendCredits(100)).toBe(true);
    expect(om.getState().inventory.credits).toBe(150);
  });

  it("equipBlueprint requires the blueprint to be in inventory", () => {
    const om = new OverworldManager(makeSector(), null);
    expect(om.equipBlueprint("bp-missing")).toBe(false);
    // Completing a mission that rewards a blueprint...
    // But our test mission has no blueprints, so equip should also fail.
    expect(om.equipBlueprint(null)).toBe(true);
    expect(om.getState().inventory.equippedBlueprintId).toBeNull();
  });
});

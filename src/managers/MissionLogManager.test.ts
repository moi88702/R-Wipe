import { describe, it, expect } from "vitest";
import { MissionLogManager, MissionLogError } from "./MissionLogManager";
import {
  InMemoryStorage,
  MISSIONS_STORAGE_KEY,
} from "../services/LocalStorageService";
import { MissionRegistry } from "../game/data/MissionRegistry";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeManager() {
  return new MissionLogManager(new InMemoryStorage());
}

// Real specs from MissionRegistry — no mocking needed for same-package code.
// courier: mission-tf-courier-alpha  →  npc-commander-voss, dest: station-beta
// trade:   mission-tf-trade-alloys   →  npc-trader-halley  (at station-alpha)
// courier: mission-tf-patrol-dispatch → npc-commander-voss, dest: outpost-frontier
const COURIER  = MissionRegistry.getMission("mission-tf-courier-alpha")!;
const TRADE    = MissionRegistry.getMission("mission-tf-trade-alloys")!;
const COURIER2 = MissionRegistry.getMission("mission-tf-patrol-dispatch")!;
const TRADE2   = MissionRegistry.getMission("mission-vm-trade-alloys")!;
const TRADE3   = MissionRegistry.getMission("mission-sc-trade-parts")!;

// ── acceptMission ─────────────────────────────────────────────────────────────

describe("acceptMission()", () => {
  it("happy path — courier: creates an active entry with primary waypoint at destination", () => {
    // Given
    const manager = makeManager();
    // When
    const entry = manager.acceptMission(COURIER, COURIER.npcId);
    // Then
    expect(entry.missionId).toBe("mission-tf-courier-alpha");
    expect(entry.npcId).toBe("npc-commander-voss");
    expect(entry.status).toBe("active");
    expect(entry.waypointAssignments.primary).toBe("station-beta");
    expect(entry.waypointAssignments.secondary).toBeNull();
    expect(entry.waypointAssignments.tertiary).toBeNull();
  });

  it("happy path — trade: creates an active entry with primary waypoint at the NPC's location", () => {
    // Given
    const manager = makeManager();
    // When — npc-trader-halley lives at station-alpha
    const entry = manager.acceptMission(TRADE, "npc-trader-halley");
    // Then
    expect(entry.missionId).toBe("mission-tf-trade-alloys");
    expect(entry.status).toBe("active");
    expect(entry.waypointAssignments.primary).toBe("station-alpha");
  });

  it("happy path — trade with unregistered npcId: no auto waypoint is set", () => {
    // Given
    const manager = makeManager();
    // When
    const entry = manager.acceptMission(TRADE, "npc-unknown-npc");
    // Then
    expect(entry.waypointAssignments.primary).toBeNull();
  });

  it("accepting a second courier mission displaces the first entry's primary slot", () => {
    // Given
    const manager = makeManager();
    const first = manager.acceptMission(COURIER, COURIER.npcId); // primary = station-beta
    // When
    const second = manager.acceptMission(COURIER2, COURIER2.npcId); // primary = outpost-frontier
    // Then — first entry's primary must have been released
    expect(first.waypointAssignments.primary).toBeNull();
    expect(second.waypointAssignments.primary).toBe("outpost-frontier");
  });

  it("persists immediately — a second manager loading the same storage sees the new entry", () => {
    // Given
    const storage = new InMemoryStorage();
    const a = new MissionLogManager(storage);
    // When
    a.acceptMission(COURIER, COURIER.npcId);
    // Then
    const b = new MissionLogManager(storage);
    b.load();
    expect(b.getMissionLog()).toHaveLength(1);
    expect(b.getMissionLog()[0]!.missionId).toBe("mission-tf-courier-alpha");
  });

  it("throws MissionLogError when spec id is not in MissionRegistry", () => {
    const manager = makeManager();
    const unknownSpec = { ...COURIER, id: "mission-does-not-exist" };
    expect(() => manager.acceptMission(unknownSpec, "npc-any")).toThrow(MissionLogError);
  });

  it("throws MissionLogError when the mission is already in the log", () => {
    const manager = makeManager();
    manager.acceptMission(COURIER, COURIER.npcId);
    expect(() => manager.acceptMission(COURIER, COURIER.npcId)).toThrow(MissionLogError);
  });
});

// ── getMissionLog ─────────────────────────────────────────────────────────────

describe("getMissionLog()", () => {
  it("returns all entries including completed ones", () => {
    // Given
    const manager = makeManager();
    manager.acceptMission(COURIER, COURIER.npcId);
    manager.acceptMission(TRADE, "npc-unknown-npc");
    manager.completeMission("mission-tf-courier-alpha");
    // When
    const log = manager.getMissionLog();
    // Then
    expect(log).toHaveLength(2);
    expect(log.find((e) => e.missionId === "mission-tf-courier-alpha")?.status).toBe("completed");
    expect(log.find((e) => e.missionId === "mission-tf-trade-alloys")?.status).toBe("active");
  });

  it("returns a copy — mutations do not affect internal state", () => {
    const manager = makeManager();
    manager.acceptMission(COURIER, COURIER.npcId);
    const log = manager.getMissionLog();
    log.pop();
    expect(manager.getMissionLog()).toHaveLength(1);
  });
});

// ── completeMission ───────────────────────────────────────────────────────────

describe("completeMission()", () => {
  it("happy path: marks entry completed, records id in completedSet, and returns the reward summary", () => {
    // Given
    const manager = makeManager();
    manager.acceptMission(COURIER, COURIER.npcId);
    // When
    const rewards = manager.completeMission("mission-tf-courier-alpha");
    // Then
    const entry = manager.getMissionLog()[0]!;
    expect(entry.status).toBe("completed");
    expect(manager.getCompletedMissionIds().has("mission-tf-courier-alpha")).toBe(true);
    expect(rewards.credits).toBe(800);
    expect(rewards.reputation).toBe(50);
    expect(rewards.items).toEqual([]);
  });

  it("clears ALL waypoint slots on the completed entry, releasing them immediately", () => {
    // Given — courier auto-sets primary; manually set secondary too
    const manager = makeManager();
    manager.acceptMission(COURIER, COURIER.npcId); // primary = station-beta
    manager.setWaypoint("mission-tf-courier-alpha", "secondary", "station-alpha");
    // When
    manager.completeMission("mission-tf-courier-alpha");
    // Then
    const entry = manager.getMissionLog()[0]!;
    expect(entry.waypointAssignments.primary).toBeNull();
    expect(entry.waypointAssignments.secondary).toBeNull();
    expect(entry.waypointAssignments.tertiary).toBeNull();
  });

  it("released primary slot is immediately claimable by the next accepted mission", () => {
    // Given
    const manager = makeManager();
    manager.acceptMission(COURIER, COURIER.npcId); // primary = station-beta
    manager.completeMission("mission-tf-courier-alpha");  // frees primary
    // When
    manager.acceptMission(COURIER2, COURIER2.npcId); // primary = outpost-frontier
    // Then
    const log = manager.getMissionLog();
    const completed = log.find((e) => e.missionId === "mission-tf-courier-alpha")!;
    const active    = log.find((e) => e.missionId === "mission-tf-patrol-dispatch")!;
    expect(completed.waypointAssignments.primary).toBeNull();
    expect(active.waypointAssignments.primary).toBe("outpost-frontier");
  });

  it("includes item rewards when the spec has rewardItems", () => {
    // Given — mission-dm-courier-survey rewards power-crystal x3
    const surveySpec = MissionRegistry.getMission("mission-dm-courier-survey")!;
    const manager = makeManager();
    manager.acceptMission(surveySpec, surveySpec.npcId);
    // When
    const rewards = manager.completeMission("mission-dm-courier-survey");
    // Then
    expect(rewards.items).toEqual([{ type: "power-crystal", count: 3 }]);
  });

  it("persists immediately — completed status survives a reload", () => {
    const storage = new InMemoryStorage();
    const a = new MissionLogManager(storage);
    a.acceptMission(COURIER, COURIER.npcId);
    a.completeMission("mission-tf-courier-alpha");

    const b = new MissionLogManager(storage);
    b.load();
    expect(b.getMissionLog()[0]!.status).toBe("completed");
    expect(b.getCompletedMissionIds().has("mission-tf-courier-alpha")).toBe(true);
  });

  it("throws MissionLogError when missionId is not in the log", () => {
    const manager = makeManager();
    expect(() => manager.completeMission("mission-tf-courier-alpha")).toThrow(MissionLogError);
  });
});

// ── setWaypoint ───────────────────────────────────────────────────────────────

describe("setWaypoint()", () => {
  it("happy path: assigns the requested slot on the entry and persists", () => {
    // Given — trade mission has no auto-waypoint when npcId unknown
    const storage = new InMemoryStorage();
    const manager = new MissionLogManager(storage);
    manager.acceptMission(TRADE, "npc-unknown-npc");
    // When
    manager.setWaypoint("mission-tf-trade-alloys", "primary", "station-beta");
    // Then — visible from a reloaded manager
    const b = new MissionLogManager(storage);
    b.load();
    expect(b.getMissionLog()[0]!.waypointAssignments.primary).toBe("station-beta");
  });

  it("releases the previous holder of a slot before assigning to a new mission", () => {
    // Given
    const manager = makeManager();
    manager.acceptMission(TRADE, "npc-unknown-npc");
    manager.acceptMission(TRADE2, "npc-unknown-npc");
    manager.setWaypoint("mission-tf-trade-alloys", "secondary", "station-alpha");
    // When
    manager.setWaypoint("mission-vm-trade-alloys", "secondary", "station-beta");
    // Then
    const log = manager.getMissionLog();
    const first  = log.find((e) => e.missionId === "mission-tf-trade-alloys")!;
    const second = log.find((e) => e.missionId === "mission-vm-trade-alloys")!;
    expect(first.waypointAssignments.secondary).toBeNull();
    expect(second.waypointAssignments.secondary).toBe("station-beta");
  });

  it("throws MissionLogError when missionId is not in the log", () => {
    const manager = makeManager();
    expect(() =>
      manager.setWaypoint("mission-tf-courier-alpha", "primary", "station-beta"),
    ).toThrow(MissionLogError);
  });

  it("throws MissionLogError when targetId is not a known location", () => {
    const manager = makeManager();
    manager.acceptMission(TRADE, "npc-unknown-npc");
    expect(() =>
      manager.setWaypoint("mission-tf-trade-alloys", "primary", "location-does-not-exist"),
    ).toThrow(MissionLogError);
  });

  it("throws MissionLogError when the mission is not active (completed)", () => {
    const manager = makeManager();
    manager.acceptMission(COURIER, COURIER.npcId);
    manager.completeMission("mission-tf-courier-alpha");
    expect(() =>
      manager.setWaypoint("mission-tf-courier-alpha", "secondary", "station-alpha"),
    ).toThrow(MissionLogError);
  });
});

// ── clearWaypoint ─────────────────────────────────────────────────────────────

describe("clearWaypoint()", () => {
  it("happy path: nulls the given slot on the entry and persists", () => {
    // Given — courier auto-sets primary
    const storage = new InMemoryStorage();
    const manager = new MissionLogManager(storage);
    manager.acceptMission(COURIER, COURIER.npcId); // primary = station-beta
    // When
    manager.clearWaypoint("mission-tf-courier-alpha", "primary");
    // Then
    const b = new MissionLogManager(storage);
    b.load();
    expect(b.getMissionLog()[0]!.waypointAssignments.primary).toBeNull();
  });

  it("throws MissionLogError when missionId is not in the log", () => {
    const manager = makeManager();
    expect(() =>
      manager.clearWaypoint("mission-tf-courier-alpha", "primary"),
    ).toThrow(MissionLogError);
  });

  it("throws MissionLogError when the mission is not active (completed)", () => {
    const manager = makeManager();
    manager.acceptMission(COURIER, COURIER.npcId);
    manager.completeMission("mission-tf-courier-alpha");
    expect(() =>
      manager.clearWaypoint("mission-tf-courier-alpha", "primary"),
    ).toThrow(MissionLogError);
  });
});

// ── getWaypoints ──────────────────────────────────────────────────────────────

describe("getWaypoints()", () => {
  it("happy path: returns one colour-coded Waypoint per occupied slot for active missions", () => {
    // Given
    const manager = makeManager();
    manager.acceptMission(TRADE, "npc-unknown-npc");
    manager.acceptMission(TRADE2, "npc-unknown-npc");
    manager.acceptMission(TRADE3, "npc-unknown-npc");
    manager.setWaypoint("mission-tf-trade-alloys", "primary",   "station-alpha");
    manager.setWaypoint("mission-vm-trade-alloys", "secondary", "station-beta");
    manager.setWaypoint("mission-sc-trade-parts",  "tertiary",  "scavenger-haven");
    // When
    const waypoints = manager.getWaypoints();
    // Then
    expect(waypoints).toHaveLength(3);
    const primary   = waypoints.find((w) => w.type === "primary")!;
    const secondary = waypoints.find((w) => w.type === "secondary")!;
    const tertiary  = waypoints.find((w) => w.type === "tertiary")!;
    expect(primary.targetId).toBe("station-alpha");
    expect(primary.color).toEqual({ r: 0, g: 255, b: 255 });   // cyan
    expect(primary.assignedMissionId).toBe("mission-tf-trade-alloys");
    expect(secondary.color).toEqual({ r: 255, g: 255, b: 0 }); // yellow
    expect(tertiary.color).toEqual({ r: 255, g: 0, b: 255 });  // magenta
    // Positions come from LocationRegistry
    expect(typeof primary.targetPosition.x).toBe("number");
    expect(typeof primary.targetPosition.y).toBe("number");
  });

  it("does NOT return waypoints for a completed mission (fix: status filter)", () => {
    // Given — courier auto-sets primary
    const manager = makeManager();
    manager.acceptMission(COURIER, COURIER.npcId); // primary = station-beta
    // When
    manager.completeMission("mission-tf-courier-alpha");
    // Then — no active missions → no waypoints
    expect(manager.getWaypoints()).toHaveLength(0);
  });

  it("does NOT return waypoints for non-active entries even when waypointAssignments is non-null (legacy data guard)", () => {
    // Given — load a storage snapshot where a completed mission kept its waypoint
    const storage = new InMemoryStorage();
    storage.setItem(
      MISSIONS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        data: {
          entries: [
            {
              missionId: "mission-tf-courier-alpha",
              npcId: "npc-commander-voss",
              acceptedAt: 1_000,
              status: "completed",
              progressData: {},
              waypointAssignments: {
                primary: "station-beta", // non-null but belongs to completed mission
                secondary: null,
                tertiary: null,
              },
            },
          ],
          completedMissionIds: ["mission-tf-courier-alpha"],
          lastUpdatedAt: 1_000,
        },
      }),
    );
    const manager = new MissionLogManager(storage);
    manager.load();
    // When / Then — completed mission's waypoint must be suppressed
    expect(manager.getWaypoints()).toHaveLength(0);
  });

  it("returns empty when there are no missions at all", () => {
    expect(makeManager().getWaypoints()).toHaveLength(0);
  });

  it("returns empty when all missions are active but have no waypoints assigned", () => {
    const manager = makeManager();
    manager.acceptMission(TRADE, "npc-unknown-npc"); // no auto-waypoint
    expect(manager.getWaypoints()).toHaveLength(0);
  });
});

// ── load() / persistence round-trip ──────────────────────────────────────────

describe("load() / persistence", () => {
  it("round-trips entries, completedMissionIds, and active waypoints through storage", () => {
    // Given
    const storage = new InMemoryStorage();
    const a = new MissionLogManager(storage);
    a.acceptMission(COURIER, COURIER.npcId);          // primary = station-beta
    a.completeMission("mission-tf-courier-alpha");    // frees primary
    a.acceptMission(TRADE, "npc-trader-halley");      // primary = station-alpha
    // When
    const b = new MissionLogManager(storage);
    const loaded = b.load();
    // Then
    expect(loaded).toBe(true);
    const log = b.getMissionLog();
    expect(log).toHaveLength(2);
    expect(log.find((e) => e.missionId === "mission-tf-courier-alpha")?.status).toBe("completed");
    expect(log.find((e) => e.missionId === "mission-tf-trade-alloys")?.status).toBe("active");
    expect(b.getCompletedMissionIds().has("mission-tf-courier-alpha")).toBe(true);
    // Only the active trade mission contributes a waypoint
    const waypoints = b.getWaypoints();
    expect(waypoints).toHaveLength(1);
    expect(waypoints[0]!.targetId).toBe("station-alpha");
  });

  it("returns false when nothing is stored", () => {
    const manager = makeManager();
    expect(manager.load()).toBe(false);
  });
});

// ── reset() ───────────────────────────────────────────────────────────────────

describe("reset()", () => {
  it("clears all in-memory state and removes the storage entry", () => {
    // Given
    const storage = new InMemoryStorage();
    const manager = new MissionLogManager(storage);
    manager.acceptMission(COURIER, COURIER.npcId);
    // When
    manager.reset();
    // Then — in-memory state is empty
    expect(manager.getMissionLog()).toEqual([]);
    expect(manager.getCompletedMissionIds().size).toBe(0);
    expect(manager.getWaypoints()).toHaveLength(0);
    // And storage entry was removed — a fresh manager finds nothing
    const fresh = new MissionLogManager(storage);
    expect(fresh.load()).toBe(false);
  });
});

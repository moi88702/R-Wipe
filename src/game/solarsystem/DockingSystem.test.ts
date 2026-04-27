/**
 * Tests for DockingSystem
 *
 * These are pure-function / class-constructor tests: no mocks, no I/O, no
 * external boundaries. All inputs are constructed inline from real type data.
 *
 * Observable contracts under test:
 *
 *   checkProximity
 *     1a. Player inside a location's docking radius → withinDockingRange is set.
 *     1b. Player exactly on the boundary → still within range (inclusive).
 *     1c. Player just outside the boundary → withinDockingRange is null.
 *     1d. Multiple locations → returns the *closest* one and its distance.
 *     1e. Empty location list → null, Infinity.
 *
 *   canDock
 *     2.  Reputation gate: player rep below threshold → denied, reason + values.
 *     3.  Item gate: missing required item → denied, reason = "missing-item".
 *     4.  Mission gate: incomplete prerequisite → denied, reason = "mission-incomplete".
 *     5.  All three gates met → allowed.
 *     6.  All three gates fail simultaneously → first gate (reputation) wins.
 *     7.  Item gate only: item present with qty > 1 → allowed.
 *     8.  No requirements on the location → always allowed regardless of state.
 *
 *   requestDocking  (instance method, delegates to canDock)
 *     9.  Granted when all gates pass; result carries the correct location.
 *     10. Denied with correct reason when a gate fails; location is preserved.
 *
 * Gherkin scenarios (integration-style, using the full DockingSystem flow):
 *     G1. "Player docking is denied due to low faction reputation"
 *     G2. "Player successfully docks with a location and views menu"
 */

import { describe, expect, it } from "vitest";
import { DockingSystem } from "./DockingSystem";
import type { Location } from "../../types/solarsystem";
import type { FactionStanding } from "../../types/factions";

// ── Shared test helpers ───────────────────────────────────────────────────────

/**
 * Build a minimal Location for docking tests.
 * `position` defaults to the world origin; `dockingRadius` defaults to 2 km.
 */
function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "station-test",
    name: "Test Station",
    bodyId: "planet-1",
    position: { x: 0, y: 0 },
    dockingRadius: 2, // km
    controllingFaction: "terran",
    npcs: [],
    shops: [],
    type: "station",
    ...overrides,
  };
}

/**
 * Build a minimal FactionStanding for docking tests.
 * Defaults to neutral-positive reputation (100) — above most default gates.
 */
function makeStanding(overrides: Partial<FactionStanding> = {}): FactionStanding {
  return {
    factionId: "terran",
    reputation: 100,
    missionsDoneCount: 0,
    canDockAt: new Set<string>(),
    isHostile: false,
    ...overrides,
  };
}

// ── (1) checkProximity ────────────────────────────────────────────────────────

describe("DockingSystem.checkProximity — range detection", () => {
  it("given player well inside docking radius, withinDockingRange is the location", () => {
    // Given
    const location = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 2 });
    const playerPos = { x: 1, y: 0 }; // 1 km away — well within 2 km radius

    // When
    const result = DockingSystem.checkProximity(playerPos, [location]);

    // Then
    expect(result.withinDockingRange).toBe(location);
    expect(result.distance).toBeCloseTo(1, 10);
  });

  it("given player exactly on the docking radius boundary, withinDockingRange is set (inclusive)", () => {
    // Given — player is exactly 2 km from a location with dockingRadius = 2
    const location = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 2 });
    const playerPos = { x: 2, y: 0 }; // distance = 2.0 km exactly

    // When
    const result = DockingSystem.checkProximity(playerPos, [location]);

    // Then — boundary is inclusive (≤ dockingRadius)
    expect(result.withinDockingRange).toBe(location);
    expect(result.distance).toBeCloseTo(2, 10);
  });

  it("given player just outside the docking radius, withinDockingRange is null", () => {
    // Given — player is 2.001 km away from a 2 km docking radius
    const location = makeLocation({ position: { x: 0, y: 0 }, dockingRadius: 2 });
    const playerPos = { x: 2.001, y: 0 };

    // When
    const result = DockingSystem.checkProximity(playerPos, [location]);

    // Then
    expect(result.withinDockingRange).toBeNull();
    expect(result.distance).toBeCloseTo(2.001, 3);
  });

  it("given multiple locations, returns the closest one and its distance", () => {
    // Given — two locations; the player is closer to location B
    const locationA = makeLocation({ id: "loc-a", position: { x: 10, y: 0 }, dockingRadius: 2 });
    const locationB = makeLocation({ id: "loc-b", position: { x:  3, y: 0 }, dockingRadius: 5 });
    const playerPos = { x: 0, y: 0 };

    // When
    const result = DockingSystem.checkProximity(playerPos, [locationA, locationB]);

    // Then — closest is B (3 km away), and 3 ≤ 5 so it's within range
    expect(result.distance).toBeCloseTo(3, 10);
    expect(result.withinDockingRange?.id).toBe("loc-b");
  });

  it("given multiple locations where only a farther one is in range, returns that one", () => {
    // Given — A is closest but small radius; B is farther but large enough to include player
    const locationA = makeLocation({ id: "loc-a", position: { x: 5, y: 0 }, dockingRadius: 1 });
    const locationB = makeLocation({ id: "loc-b", position: { x: 8, y: 0 }, dockingRadius: 10 });
    const playerPos = { x: 0, y: 0 };

    // When
    const result = DockingSystem.checkProximity(playerPos, [locationA, locationB]);

    // Then — closest location is A (5 km); 5 > 1 so A is NOT in range.
    // B is 8 km away which is ≤ 10 km radius, but it's not the closest location.
    // checkProximity only tests the CLOSEST location against its radius.
    expect(result.distance).toBeCloseTo(5, 10);
    expect(result.withinDockingRange).toBeNull(); // closest (A) is outside its own radius
  });

  it("given an empty location list, returns null and Infinity", () => {
    // Given
    const playerPos = { x: 0, y: 0 };

    // When
    const result = DockingSystem.checkProximity(playerPos, []);

    // Then
    expect(result.withinDockingRange).toBeNull();
    expect(result.distance).toBe(Infinity);
  });
});

// ── (2) canDock — reputation gate ────────────────────────────────────────────

describe("DockingSystem.canDock — reputation gate", () => {
  it("given player reputation below required threshold, docking is denied with low-reputation reason", () => {
    // Given
    const standing = makeStanding({ reputation: 50 });
    const location = makeLocation({ requiredReputation: 100 });
    const inventory: Record<string, number> = {};
    const completedMissions = new Set<string>();

    // When
    const result = DockingSystem.canDock(standing, location, inventory, completedMissions);

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("low-reputation");
    expect(result.requiredReputation).toBe(100);
    expect(result.currentReputation).toBe(50);
  });

  it("given player reputation exactly equal to required threshold, docking is allowed", () => {
    // Given — rep == threshold (boundary, inclusive)
    const standing = makeStanding({ reputation: 100 });
    const location = makeLocation({ requiredReputation: 100 });

    // When
    const result = DockingSystem.canDock(standing, location, {}, new Set());

    // Then
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("given player reputation above required threshold, reputation gate passes", () => {
    // Given
    const standing = makeStanding({ reputation: 500 });
    const location = makeLocation({ requiredReputation: 100 });

    // When
    const result = DockingSystem.canDock(standing, location, {}, new Set());

    // Then
    expect(result.allowed).toBe(true);
  });

  it("given negative reputation and a positive threshold, denial includes both values", () => {
    // Given
    const standing = makeStanding({ reputation: -200 });
    const location = makeLocation({ requiredReputation: 50 });

    // When
    const result = DockingSystem.canDock(standing, location, {}, new Set());

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("low-reputation");
    expect(result.currentReputation).toBe(-200);
    expect(result.requiredReputation).toBe(50);
  });
});

// ── (3) canDock — item gate ───────────────────────────────────────────────────

describe("DockingSystem.canDock — item gate", () => {
  it("given location requires an item the player does not carry, docking is denied", () => {
    // Given
    const standing = makeStanding({ reputation: 200 }); // rep OK
    const location = makeLocation({ requiredItems: ["access-card"] });
    const inventory: Record<string, number> = {}; // no items

    // When
    const result = DockingSystem.canDock(standing, location, inventory, new Set());

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("missing-item");
  });

  it("given location requires an item the player has with qty 0, docking is denied", () => {
    // Given — item is present as a key but quantity is 0
    const standing = makeStanding({ reputation: 200 });
    const location = makeLocation({ requiredItems: ["access-card"] });
    const inventory = { "access-card": 0 };

    // When
    const result = DockingSystem.canDock(standing, location, inventory, new Set());

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("missing-item");
  });

  it("given location requires an item the player carries with qty >= 1, item gate passes", () => {
    // Given
    const standing = makeStanding({ reputation: 200 });
    const location = makeLocation({ requiredItems: ["access-card"] });
    const inventory = { "access-card": 1 };

    // When
    const result = DockingSystem.canDock(standing, location, inventory, new Set());

    // Then
    expect(result.allowed).toBe(true);
  });

  it("given location requires multiple items and one is missing, docking is denied", () => {
    // Given
    const standing = makeStanding({ reputation: 200 });
    const location = makeLocation({ requiredItems: ["access-card", "fuel-cell"] });
    const inventory = { "access-card": 1 }; // missing fuel-cell

    // When
    const result = DockingSystem.canDock(standing, location, inventory, new Set());

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("missing-item");
  });

  it("given location requires multiple items and all are present, item gate passes", () => {
    // Given
    const standing = makeStanding({ reputation: 200 });
    const location = makeLocation({ requiredItems: ["access-card", "fuel-cell"] });
    const inventory = { "access-card": 2, "fuel-cell": 1 };

    // When
    const result = DockingSystem.canDock(standing, location, inventory, new Set());

    // Then
    expect(result.allowed).toBe(true);
  });
});

// ── (4) canDock — mission gate ────────────────────────────────────────────────

describe("DockingSystem.canDock — mission gate", () => {
  it("given location requires a mission the player has not completed, docking is denied", () => {
    // Given
    const standing = makeStanding({ reputation: 200 }); // rep OK
    const location = makeLocation({ requiredMissions: ["rescue-op-1"] });
    const completedMissions = new Set<string>(); // mission not done

    // When
    const result = DockingSystem.canDock(standing, location, {}, completedMissions);

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("mission-incomplete");
  });

  it("given player has completed the required mission, mission gate passes", () => {
    // Given
    const standing = makeStanding({ reputation: 200 });
    const location = makeLocation({ requiredMissions: ["rescue-op-1"] });
    const completedMissions = new Set(["rescue-op-1"]);

    // When
    const result = DockingSystem.canDock(standing, location, {}, completedMissions);

    // Then
    expect(result.allowed).toBe(true);
  });

  it("given location requires multiple missions and one is incomplete, docking is denied", () => {
    // Given
    const standing = makeStanding({ reputation: 200 });
    const location = makeLocation({ requiredMissions: ["mission-a", "mission-b"] });
    const completedMissions = new Set(["mission-a"]); // mission-b not done

    // When
    const result = DockingSystem.canDock(standing, location, {}, completedMissions);

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("mission-incomplete");
  });

  it("given all required missions are completed, mission gate passes", () => {
    // Given
    const standing = makeStanding({ reputation: 200 });
    const location = makeLocation({ requiredMissions: ["mission-a", "mission-b"] });
    const completedMissions = new Set(["mission-a", "mission-b"]);

    // When
    const result = DockingSystem.canDock(standing, location, {}, completedMissions);

    // Then
    expect(result.allowed).toBe(true);
  });
});

// ── (5) canDock — no requirements ────────────────────────────────────────────

describe("DockingSystem.canDock — location with no requirements", () => {
  it("given no reputation, item, or mission requirements, docking is always allowed", () => {
    // Given — all optional fields absent; location is open to all
    const standing = makeStanding({ reputation: -999 }); // even hostile rep
    const location = makeLocation({}); // no requiredReputation, items, or missions
    const inventory: Record<string, number> = {};
    const completedMissions = new Set<string>();

    // When
    const result = DockingSystem.canDock(standing, location, inventory, completedMissions);

    // Then
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("given explicitly empty required arrays, docking is allowed", () => {
    // Given — arrays present but empty
    const standing = makeStanding({ reputation: 0 });
    const location = makeLocation({
      requiredItems: [],
      requiredMissions: [],
      requiredReputation: 0,
    });

    // When
    const result = DockingSystem.canDock(standing, location, {}, new Set());

    // Then
    expect(result.allowed).toBe(true);
  });
});

// ── (6) canDock — all three gates coexist ────────────────────────────────────

describe("DockingSystem.canDock — all three gates coexist (gate priority)", () => {
  /**
   * Location used throughout this block requires ALL THREE gates to pass:
   *   - reputation ≥ 100
   *   - must carry "access-card"
   *   - must have completed "intro-mission"
   */
  const strictLocation = makeLocation({
    requiredReputation: 100,
    requiredItems: ["access-card"],
    requiredMissions: ["intro-mission"],
  });

  it("given only reputation fails, reason is low-reputation (gate 1 wins)", () => {
    // Given — rep too low; item present; mission done
    const standing = makeStanding({ reputation: 50 }); // < 100
    const inventory = { "access-card": 1 };
    const completedMissions = new Set(["intro-mission"]);

    // When
    const result = DockingSystem.canDock(standing, strictLocation, inventory, completedMissions);

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("low-reputation");
  });

  it("given reputation passes but item is missing, reason is missing-item (gate 2 wins)", () => {
    // Given — rep OK; item missing; mission done
    const standing = makeStanding({ reputation: 150 }); // ≥ 100
    const inventory: Record<string, number> = {}; // no access-card
    const completedMissions = new Set(["intro-mission"]);

    // When
    const result = DockingSystem.canDock(standing, strictLocation, inventory, completedMissions);

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("missing-item");
  });

  it("given reputation and item pass but mission incomplete, reason is mission-incomplete (gate 3)", () => {
    // Given — rep OK; item present; mission NOT done
    const standing = makeStanding({ reputation: 150 });
    const inventory = { "access-card": 1 };
    const completedMissions = new Set<string>(); // intro-mission not completed

    // When
    const result = DockingSystem.canDock(standing, strictLocation, inventory, completedMissions);

    // Then
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("mission-incomplete");
  });

  it("given all three gates simultaneously fail, gate 1 (reputation) is reported", () => {
    // Given — everything wrong
    const standing = makeStanding({ reputation: 0 }); // < 100
    const inventory: Record<string, number> = {}; // no access-card
    const completedMissions = new Set<string>(); // mission not done

    // When
    const result = DockingSystem.canDock(standing, strictLocation, inventory, completedMissions);

    // Then — gate 1 fires first and returns before checking gates 2 and 3
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("low-reputation");
  });

  it("given all three gates pass, docking is allowed with no reason", () => {
    // Given — all conditions met
    const standing = makeStanding({ reputation: 200 }); // ≥ 100
    const inventory = { "access-card": 1 };
    const completedMissions = new Set(["intro-mission"]);

    // When
    const result = DockingSystem.canDock(standing, strictLocation, inventory, completedMissions);

    // Then
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

// ── (9–10) requestDocking — instance method ───────────────────────────────────

describe("DockingSystem.requestDocking — instance wrapper", () => {
  it("given all gates pass, returns granted=true with the correct location", () => {
    // Given
    const standing = makeStanding({ reputation: 500 });
    const location = makeLocation({ requiredReputation: 100 });
    const system = new DockingSystem(standing, { "fuel-cell": 1 }, new Set(["quest-1"]));

    // When
    const result = system.requestDocking(location);

    // Then
    expect(result.granted).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.location).toBe(location);
  });

  it("given reputation gate fails, returns granted=false with low-reputation reason and location", () => {
    // Given
    const standing = makeStanding({ reputation: -100 });
    const location = makeLocation({ requiredReputation: 200 });
    const system = new DockingSystem(standing, {}, new Set());

    // When
    const result = system.requestDocking(location);

    // Then
    expect(result.granted).toBe(false);
    expect(result.reason).toBe("low-reputation");
    expect(result.location).toBe(location); // location reference preserved
  });

  it("given item gate fails, returns granted=false with missing-item reason", () => {
    // Given
    const standing = makeStanding({ reputation: 500 });
    const location = makeLocation({ requiredReputation: 100, requiredItems: ["data-chip"] });
    const system = new DockingSystem(standing, {}, new Set()); // no data-chip

    // When
    const result = system.requestDocking(location);

    // Then
    expect(result.granted).toBe(false);
    expect(result.reason).toBe("missing-item");
  });

  it("given mission gate fails, returns granted=false with mission-incomplete reason", () => {
    // Given
    const standing = makeStanding({ reputation: 500 });
    const location = makeLocation({ requiredMissions: ["prerequisite-mission"] });
    const system = new DockingSystem(standing, {}, new Set()); // mission not done

    // When
    const result = system.requestDocking(location);

    // Then
    expect(result.granted).toBe(false);
    expect(result.reason).toBe("mission-incomplete");
  });
});

// ── Gherkin scenarios ─────────────────────────────────────────────────────────

describe("Scenario: Player docking is denied due to low faction reputation", () => {
  /**
   * Given: the player is approaching a location controlled by faction A
   *   And: the player's standing with faction A is below the docking threshold
   *  When: the player reaches the docking threshold
   *  Then: docking permission is denied
   *   And: the denial reason identifies the reputation requirement
   */
  it("approaching faction A location with insufficient standing → denied with low-reputation reason", () => {
    // Given — faction A location requiring rep ≥ 200; player only has 75
    const factionALocation = makeLocation({
      id: "faction-a-hq",
      controllingFaction: "faction-a",
      position: { x: 0, y: 0 },
      dockingRadius: 2,
      requiredReputation: 200,
    });
    const playerStanding = makeStanding({ factionId: "faction-a", reputation: 75 });

    // When — player reaches the docking threshold (proximity check clears first)
    const proximity = DockingSystem.checkProximity({ x: 1, y: 0 }, [factionALocation]);
    const system = new DockingSystem(playerStanding, {}, new Set());
    const dockingResult = system.requestDocking(factionALocation);

    // Then — player is inside docking range but permission is denied
    expect(proximity.withinDockingRange?.id).toBe("faction-a-hq");
    expect(dockingResult.granted).toBe(false);
    expect(dockingResult.reason).toBe("low-reputation");
    expect(dockingResult.location.id).toBe("faction-a-hq");
  });

  it("improving reputation above threshold changes denial to approval", () => {
    // Given — same setup but player later gains enough reputation
    const location = makeLocation({ requiredReputation: 200, controllingFaction: "faction-a" });
    const lowStanding = makeStanding({ reputation: 75 });
    const sufficientStanding = makeStanding({ reputation: 250 });

    // When (before rep gain)
    const deniedResult = DockingSystem.canDock(lowStanding, location, {}, new Set());
    // When (after rep gain)
    const approvedResult = DockingSystem.canDock(sufficientStanding, location, {}, new Set());

    // Then
    expect(deniedResult.allowed).toBe(false);
    expect(approvedResult.allowed).toBe(true);
  });
});

describe("Scenario: Player successfully docks with a location and views menu", () => {
  /**
   * Given: the player is approaching a location
   *   And: docking permission conditions are met (reputation, items, missions)
   *  When: the player reaches the docking threshold
   *   And: docking permission is granted
   *  Then: the DockingSystem signals successful entry
   *        (the UI layer is responsible for playing the animation and showing the menu)
   */
  it("approaching location with all gates met → proximity triggers and docking is granted", () => {
    // Given — a fully gated location; all conditions satisfied
    const location = makeLocation({
      id: "safe-harbor",
      position: { x: 0, y: 0 },
      dockingRadius: 2,
      requiredReputation: 100,
      requiredItems: ["visitor-pass"],
      requiredMissions: ["intro-mission"],
    });
    const playerPos = { x: 1.5, y: 0 }; // inside 2 km docking radius
    const standing = makeStanding({ reputation: 300 });
    const inventory = { "visitor-pass": 1 };
    const completedMissions = new Set(["intro-mission"]);

    // When
    const proximity = DockingSystem.checkProximity(playerPos, [location]);
    const system = new DockingSystem(standing, inventory, completedMissions);
    const dockingResult = system.requestDocking(location);

    // Then — proximity confirms player is in range
    expect(proximity.withinDockingRange?.id).toBe("safe-harbor");
    expect(proximity.distance).toBeCloseTo(1.5, 10);
    // And — all gates pass; the caller may now trigger the docking animation and
    // open the location menu
    expect(dockingResult.granted).toBe(true);
    expect(dockingResult.reason).toBeUndefined();
    expect(dockingResult.location.id).toBe("safe-harbor");
  });

  it("open location (no gates) always grants docking when player is in range", () => {
    // Given — an unrestricted location
    const location = makeLocation({ id: "open-port", position: { x: 0, y: 0 }, dockingRadius: 5 });
    const playerPos = { x: 3, y: 0 }; // 3 km — inside 5 km radius
    // Even a hostile player with nothing in their inventory can dock
    const standing = makeStanding({ reputation: -999, isHostile: false });
    const system = new DockingSystem(standing, {}, new Set());

    // When
    const proximity = DockingSystem.checkProximity(playerPos, [location]);
    const dockingResult = system.requestDocking(location);

    // Then
    expect(proximity.withinDockingRange?.id).toBe("open-port");
    expect(dockingResult.granted).toBe(true);
  });
});

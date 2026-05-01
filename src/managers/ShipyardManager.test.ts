/**
 * Tests for ShipyardManager - Integration-first TDD approach
 *
 * ShipyardManager is the primary entry point for the shipyard experience.
 * Tests assert observable session-state outcomes (blueprint changes,
 * validation, confirmTriggered signal) — not internal wiring.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ShipyardManager } from "./ShipyardManager";
import { BlueprintStore } from "./BlueprintStore";
import { InMemoryStorage } from "../services/LocalStorageService";
import type { Blueprint } from "../types/shipBuilder";

function makeTestStore(): BlueprintStore {
  return new BlueprintStore(new InMemoryStorage());
}

function makeMinimalBlueprint(overrides: Partial<Blueprint> = {}): Blueprint {
  return {
    id: "test-bp-1",
    name: "Test Ship",
    parts: [
      {
        id: "core-1",
        partId: "core-starter",
        parentId: null,
        parentSocketId: null,
        colourId: null,
      },
      {
        id: "hull-1",
        partId: "hull-starter",
        parentId: "core-1",
        parentSocketId: "s-hull",
        colourId: null,
      },
    ],
    ...overrides,
  };
}

function makeBlueprintWithPowerBudget(overrides: Partial<Blueprint> = {}): Blueprint {
  return {
    id: "test-bp-power",
    name: "Test Ship with Power",
    parts: [
      {
        id: "core-1",
        partId: "core-mid",
        parentId: null,
        parentSocketId: null,
        colourId: null,
      },
      {
        id: "hull-1",
        partId: "hull-starter",
        parentId: "core-1",
        parentSocketId: "s-hull",
        colourId: null,
      },
    ],
    ...overrides,
  };
}

// ── openShipyard ──────────────────────────────────────────────────────────────

describe("ShipyardManager.openShipyard", () => {
  let store: BlueprintStore;
  let manager: ShipyardManager;

  beforeEach(() => {
    store = makeTestStore();
    manager = new ShipyardManager(store);
  });

  it("given an existing blueprint id, loads that blueprint for editing", () => {
    const blueprint = makeMinimalBlueprint({ id: "existing-bp", name: "My Ship" });
    store.upsert(blueprint);
    const state = manager.openShipyard("existing-bp");
    expect(state.blueprint.id).toBe("existing-bp");
    expect(state.blueprint.name).toBe("My Ship");
    expect(state.blueprint.parts).toHaveLength(2);
  });

  it("given null blueprint id, creates a minimal starter blueprint", () => {
    const state = manager.openShipyard(null);
    expect(state.blueprint.parts).toHaveLength(2);
    expect(state.blueprint.parts[0]!.partId).toBe("core-starter");
    expect(state.blueprint.parts[1]!.partId).toBe("hull-starter");
  });

  it("given unknown blueprint id, creates a minimal starter blueprint", () => {
    const state = manager.openShipyard("nonexistent");
    expect(state.blueprint.parts).toHaveLength(2);
    expect(state.blueprint.parts[0]!.partId).toBe("core-starter");
  });

  it("given opened shipyard, session state starts valid", () => {
    const state = manager.openShipyard(null);
    expect(state.isValid).toBe(true);
    expect(state.validationReport.ok).toBe(true);
    expect(state.validationReport.errors).toHaveLength(0);
  });

  it("given opened shipyard, confirmTriggered starts false", () => {
    const state = manager.openShipyard(null);
    expect(state.confirmTriggered).toBe(false);
  });

  it("given active shipyard session, throws on second open", () => {
    manager.openShipyard(null);
    expect(() => manager.openShipyard(null)).toThrow(
      "ShipyardManager: shipyard already open",
    );
  });
});

// ── addPart ───────────────────────────────────────────────────────────────────

describe("ShipyardManager.addPart", () => {
  let store: BlueprintStore;
  let manager: ShipyardManager;

  beforeEach(() => {
    store = makeTestStore();
    manager = new ShipyardManager(store);
    const bp = makeBlueprintWithPowerBudget();
    store.upsert(bp);
    manager.openShipyard(bp.id);
  });

  it("given valid part and open socket, adds the part and validates", () => {
    const session = manager.getSessionState()!;
    const hullId = session.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    const result = manager.addPart("wing-fin-l", hullId, "s-nose");
    expect(result.success).toBe(true);
    expect(result.state.blueprint.parts).toHaveLength(3);
  });

  it("given unknown part id, returns reason unknown-part", () => {
    const session = manager.getSessionState()!;
    const hullId = session.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    const result = manager.addPart("nonexistent-part", hullId, "s-nose");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("unknown-part");
  });

  it("given unknown parent id, returns reason parent-not-found", () => {
    const result = manager.addPart("wing-fin-l", "nonexistent-parent", "s-nose");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("parent-not-found");
  });

  it("given unknown socket, returns reason socket-not-found", () => {
    const session = manager.getSessionState()!;
    const hullId = session.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    const result = manager.addPart("wing-fin-l", hullId, "nonexistent-socket");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("socket-not-found");
  });

  it("given occupied socket, returns reason socket-occupied", () => {
    const session1 = manager.getSessionState()!;
    const hullId = session1.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    manager.addPart("wing-fin-l", hullId, "s-nose");
    const result = manager.addPart("engine-boost", hullId, "s-nose");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("socket-occupied");
  });

  it("given no active session, throws", () => {
    manager.closeShipyard();
    expect(() => manager.addPart("wing-fin-l", "hull-1", "s-nose")).toThrow(
      "ShipyardManager: no active shipyard session",
    );
  });
});

// ── removePart ────────────────────────────────────────────────────────────────

describe("ShipyardManager.removePart", () => {
  let store: BlueprintStore;
  let manager: ShipyardManager;

  beforeEach(() => {
    store = makeTestStore();
    manager = new ShipyardManager(store);
    const bp = makeBlueprintWithPowerBudget();
    store.upsert(bp);
    manager.openShipyard(bp.id);
  });

  it("given non-root part, removes it and validates", () => {
    const session1 = manager.getSessionState()!;
    const hullId = session1.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    const result1 = manager.addPart("wing-fin-l", hullId, "s-nose");
    const newPartId = result1.state.blueprint.parts.find(
      (p) => p.parentId === hullId && p.parentSocketId === "s-nose",
    )!.id;
    const result = manager.removePart(newPartId);
    expect(result.success).toBe(true);
    expect(result.state.blueprint.parts).toHaveLength(2);
  });

  it("given root core, returns reason cannot-remove-root", () => {
    const session = manager.getSessionState()!;
    const coreId = session.blueprint.parts.find((p) => p.parentId === null)!.id;
    const result = manager.removePart(coreId);
    expect(result.success).toBe(false);
    expect(result.reason).toBe("cannot-remove-root");
  });

  it("given part with children, returns reason has-children", () => {
    const session1 = manager.getSessionState()!;
    const hullId = session1.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    manager.addPart("wing-fin-l", hullId, "s-nose");
    const result = manager.removePart(hullId);
    expect(result.success).toBe(false);
    expect(result.reason).toBe("has-children");
  });

  it("given unknown part id, returns reason part-not-found", () => {
    const result = manager.removePart("nonexistent-part");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("part-not-found");
  });

  it("given no active session, throws", () => {
    manager.closeShipyard();
    expect(() => manager.removePart("part-1")).toThrow(
      "ShipyardManager: no active shipyard session",
    );
  });
});

// ── changePart ────────────────────────────────────────────────────────────────

describe("ShipyardManager.changePart", () => {
  let store: BlueprintStore;
  let manager: ShipyardManager;

  beforeEach(() => {
    store = makeTestStore();
    manager = new ShipyardManager(store);
    manager.openShipyard(null);
  });

  it("given non-root part, changes it to new type and validates", () => {
    const session1 = manager.getSessionState()!;
    const hullId = session1.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    const result = manager.changePart(hullId, "hull-heavy");
    expect(result.success).toBe(true);
    expect(result.state.blueprint.parts.find((p) => p.id === hullId)!.partId).toBe(
      "hull-heavy",
    );
  });

  it("given root core, returns reason cannot-change-root", () => {
    const session = manager.getSessionState()!;
    const coreId = session.blueprint.parts.find((p) => p.parentId === null)!.id;
    const result = manager.changePart(coreId, "core-mid");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("cannot-change-root");
  });

  it("given unknown new part type, returns reason unknown-part", () => {
    const session = manager.getSessionState()!;
    const hullId = session.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    const result = manager.changePart(hullId, "nonexistent-part");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("unknown-part");
  });

  it("given unknown placed part id, returns reason part-not-found", () => {
    const result = manager.changePart("nonexistent-part", "hull-heavy");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("part-not-found");
  });

  it("given no active session, throws", () => {
    manager.closeShipyard();
    expect(() => manager.changePart("hull-1", "hull-heavy")).toThrow(
      "ShipyardManager: no active shipyard session",
    );
  });
});

// ── renameBlueprintTo ─────────────────────────────────────────────────────────

describe("ShipyardManager.renameBlueprintTo", () => {
  let store: BlueprintStore;
  let manager: ShipyardManager;

  beforeEach(() => {
    store = makeTestStore();
    manager = new ShipyardManager(store);
  });

  it("given active session, renames the blueprint", () => {
    manager.openShipyard(null);
    const state = manager.renameBlueprintTo("New Name");
    expect(state.blueprint.name).toBe("New Name");
  });

  it("given no active session, throws", () => {
    expect(() => manager.renameBlueprintTo("New Name")).toThrow(
      "ShipyardManager: no active shipyard session",
    );
  });
});

// ── confirmModifications ──────────────────────────────────────────────────────

describe("ShipyardManager.confirmModifications", () => {
  let store: BlueprintStore;
  let manager: ShipyardManager;

  beforeEach(() => {
    store = makeTestStore();
    manager = new ShipyardManager(store);
  });

  it("given valid blueprint, sets confirmTriggered to true", () => {
    manager.openShipyard(null);
    const state = manager.confirmModifications();
    expect(state.confirmTriggered).toBe(true);
  });

  it("given invalid blueprint (power budget exceeded), throws", () => {
    // Use starter core which has only 1 capacity
    manager.openShipyard(null);
    const session = manager.getSessionState()!;
    const hullId = session.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;

    // Try to add engine-plasma (cost 2) to starter core (capacity 1)
    // Hull already costs 1, so total would be 3 > 1 capacity
    manager.addPart("engine-plasma", hullId, "s-nose");

    // Verify it's actually invalid
    const invalidState = manager.getSessionState()!;
    expect(invalidState.isValid).toBe(false);

    // Now confirm should throw
    expect(() => {
      manager.confirmModifications();
    }).toThrow("ShipyardManager: cannot confirm invalid blueprint");
  });

  it("given no active session, throws", () => {
    expect(() => manager.confirmModifications()).toThrow(
      "ShipyardManager: no active shipyard session",
    );
  });
});

// ── getSessionState / closeShipyard ───────────────────────────────────────────

describe("ShipyardManager state snapshot and cleanup", () => {
  let store: BlueprintStore;
  let manager: ShipyardManager;

  beforeEach(() => {
    store = makeTestStore();
    manager = new ShipyardManager(store);
  });

  it("given open session, getSessionState returns value object (mutations don't leak)", () => {
    manager.openShipyard(null);
    const state1 = manager.getSessionState()!;
    state1.blueprint.name = "Mutated";
    const state2 = manager.getSessionState()!;
    expect(state2.blueprint.name).not.toBe("Mutated");
  });

  it("given closed session, getSessionState returns null", () => {
    manager.openShipyard(null);
    manager.closeShipyard();
    const state = manager.getSessionState();
    expect(state).toBeNull();
  });

  it("given closeShipyard, subsequent operations throw", () => {
    manager.openShipyard(null);
    manager.closeShipyard();
    expect(() => manager.addPart("wing-fin-l", "hull-1", "s-nose")).toThrow(
      "ShipyardManager: no active shipyard session",
    );
  });
});

// ── Integration scenarios ─────────────────────────────────────────────────────

describe("ShipyardManager integration scenarios", () => {
  let store: BlueprintStore;
  let manager: ShipyardManager;

  beforeEach(() => {
    store = makeTestStore();
    manager = new ShipyardManager(store);
  });

  it("happy path: load blueprint → add part → confirm → ready to persist", () => {
    const original = makeBlueprintWithPowerBudget({ id: "ship-1", name: "Original" });
    store.upsert(original);

    manager.openShipyard("ship-1");
    const session1 = manager.getSessionState()!;
    expect(session1.blueprint.id).toBe("ship-1");

    const hullId = session1.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    const addResult = manager.addPart("wing-fin-l", hullId, "s-nose");
    expect(addResult.success).toBe(true);

    const finalState = manager.confirmModifications();
    expect(finalState.confirmTriggered).toBe(true);
    expect(finalState.isValid).toBe(true);
    expect(finalState.blueprint.parts).toHaveLength(3);
  });

  it("unhappy path: load blueprint → add invalid part → catch validation error", () => {
    manager.openShipyard(null);
    const session = manager.getSessionState()!;
    const hullId = session.blueprint.parts.find((p) => p.partId === "hull-starter")!.id;
    const result = manager.addPart("bad-part-id", hullId, "s-nose");
    expect(result.success).toBe(false);
    expect(result.reason).toContain("unknown");
  });

  it("cancel scenario: open shipyard → close without confirming → no persistence", () => {
    manager.openShipyard(null);
    manager.closeShipyard();
    expect(manager.getSessionState()).toBeNull();
  });
});

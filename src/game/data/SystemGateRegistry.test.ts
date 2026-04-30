/**
 * Tests for SystemGateRegistry
 *
 * Integration-first strategy: the registry is a pure data module — no I/O,
 * no Pixi, no external dependencies.  All methods run for real; nothing is
 * mocked.
 *
 * Observable contracts under test:
 *
 *   getGate
 *     1.  Returns the correct definition for a known gate id.
 *     2.  Returns undefined for an unknown gate id.
 *     3.  Every gate returned by getAllGates() is retrievable by its own id.
 *
 *   getAllGates / getAllGateIds
 *     4.  getAllGates returns a non-empty collection.
 *     5.  getAllGateIds returns the same ids as getAllGates.
 *
 *   getGatesBySystem
 *     6.  Returns all gates whose systemId matches the query.
 *     7.  Returns an empty array for an unknown systemId.
 *
 *   getSisterGate
 *     8.  Returns the correct sister gate for a known gate id.
 *     9.  Returns undefined for an unknown gate id.
 *    10.  Sister relationship is symmetric: A.sisterGateId === B.id and
 *         getSisterGate(B.id).id === A.id.
 *
 *   Structural invariants
 *    11.  Every gate's sisterGateId resolves to an existing gate.
 *    12.  Sister gates are always in different systems.
 *    13.  A gate's destinationSystemId equals its sister gate's systemId.
 *    14.  Gates come in pairs (even count overall).
 *    15.  No two gates share the same id.
 */

import { describe, expect, it } from "vitest";
import { SystemGateRegistry } from "./SystemGateRegistry";

// ── getGate ───────────────────────────────────────────────────────────────────

describe("SystemGateRegistry.getGate", () => {
  it("returns the correct definition for a known gate id", () => {
    // Given the well-known Sol → Kepler gate id
    // When we look it up
    const gate = SystemGateRegistry.getGate("gate-sol-to-kepler");

    // Then we get the full definition
    expect(gate).toBeDefined();
    expect(gate!.id).toBe("gate-sol-to-kepler");
    expect(gate!.systemId).toBe("sol");
    expect(gate!.destinationSystemId).toBe("kepler-442");
    expect(gate!.sisterGateId).toBe("gate-kepler-to-sol");
    expect(gate!.triggerRadius).toBeGreaterThan(0);
  });

  it("returns undefined for an unknown gate id", () => {
    // Given an id that is not in the registry
    // When we look it up
    const gate = SystemGateRegistry.getGate("does-not-exist");

    // Then undefined is returned without throwing
    expect(gate).toBeUndefined();
  });

  it("every gate returned by getAllGates is retrievable by its own id", () => {
    // Given all gates in the registry
    for (const gate of SystemGateRegistry.getAllGates()) {
      // When we look each one up by id
      const found = SystemGateRegistry.getGate(gate.id);

      // Then the same object is returned
      expect(found).toBe(gate);
    }
  });
});

// ── getAllGates / getAllGateIds ────────────────────────────────────────────────

describe("SystemGateRegistry.getAllGates", () => {
  it("returns a non-empty collection", () => {
    // Given the registry
    const gates = SystemGateRegistry.getAllGates();

    // Then there is at least one gate defined
    expect(gates.length).toBeGreaterThan(0);
  });

  it("getAllGateIds returns the same ids as getAllGates", () => {
    // Given all gate objects and all gate ids
    const gates = SystemGateRegistry.getAllGates();
    const ids = SystemGateRegistry.getAllGateIds();

    // Then the two collections cover exactly the same gates
    expect(ids).toHaveLength(gates.length);
    for (const gate of gates) {
      expect(ids).toContain(gate.id);
    }
  });
});

// ── getGatesBySystem ──────────────────────────────────────────────────────────

describe("SystemGateRegistry.getGatesBySystem", () => {
  it("returns all gates whose systemId matches the query", () => {
    // Given the Sol system
    // When we query for Sol gates
    const solGates = SystemGateRegistry.getGatesBySystem("sol");

    // Then at least one Sol gate is returned and every result belongs to Sol
    expect(solGates.length).toBeGreaterThan(0);
    for (const gate of solGates) {
      expect(gate.systemId).toBe("sol");
    }
  });

  it("returns an empty array for an unknown systemId", () => {
    // Given a system id that has no registered gates
    // When we query for that system's gates
    const gates = SystemGateRegistry.getGatesBySystem("unknown-system");

    // Then an empty array is returned
    expect(gates).toHaveLength(0);
  });
});

// ── getSisterGate ─────────────────────────────────────────────────────────────

describe("SystemGateRegistry.getSisterGate", () => {
  it("returns the correct sister gate for a known gate id", () => {
    // Given: gate-sol-to-kepler connects to gate-kepler-to-sol
    // When we look up the sister of gate-sol-to-kepler
    const sister = SystemGateRegistry.getSisterGate("gate-sol-to-kepler");

    // Then the Kepler-side gate is returned
    expect(sister).toBeDefined();
    expect(sister!.id).toBe("gate-kepler-to-sol");
    expect(sister!.systemId).toBe("kepler-442");
  });

  it("returns undefined for an unknown gate id", () => {
    // Given an id that is not in the registry
    // When we look up its sister
    const sister = SystemGateRegistry.getSisterGate("no-such-gate");

    // Then undefined is returned without throwing
    expect(sister).toBeUndefined();
  });

  it("sister relationship is symmetric: getSisterGate(B.id).id === A.id", () => {
    // Given the Sol ↔ Kepler gate pair
    const gateA = SystemGateRegistry.getGate("gate-sol-to-kepler")!;
    const gateB = SystemGateRegistry.getSisterGate("gate-sol-to-kepler")!;

    // When we resolve B's sister
    const backToA = SystemGateRegistry.getSisterGate(gateB.id);

    // Then we arrive back at A
    expect(backToA).toBeDefined();
    expect(backToA!.id).toBe(gateA.id);
  });
});

// ── Structural invariants ─────────────────────────────────────────────────────

describe("SystemGateRegistry — structural invariants", () => {
  it("every gate's sisterGateId resolves to an existing gate in the registry", () => {
    // Given all gates
    for (const gate of SystemGateRegistry.getAllGates()) {
      // When we resolve each sisterGateId
      const sister = SystemGateRegistry.getGate(gate.sisterGateId);

      // Then it exists
      expect(sister).toBeDefined();
    }
  });

  it("sister gates are always in different systems", () => {
    // Given all gates
    for (const gate of SystemGateRegistry.getAllGates()) {
      const sister = SystemGateRegistry.getGate(gate.sisterGateId)!;

      // Then the two gates are in different systems
      expect(gate.systemId).not.toBe(sister.systemId);
    }
  });

  it("a gate's destinationSystemId matches its sister gate's systemId", () => {
    // Given all gates
    for (const gate of SystemGateRegistry.getAllGates()) {
      const sister = SystemGateRegistry.getGate(gate.sisterGateId)!;

      // Then destinationSystemId and the sister's systemId are identical
      expect(gate.destinationSystemId).toBe(sister.systemId);
    }
  });

  it("gates come in pairs (registry has an even number of entries)", () => {
    // Given all gates
    const count = SystemGateRegistry.getAllGates().length;

    // Then the total is divisible by 2
    expect(count % 2).toBe(0);
  });

  it("no two gates share the same id", () => {
    // Given all gate ids
    const ids = SystemGateRegistry.getAllGateIds();
    const unique = new Set(ids);

    // Then every id is unique
    expect(unique.size).toBe(ids.length);
  });
});

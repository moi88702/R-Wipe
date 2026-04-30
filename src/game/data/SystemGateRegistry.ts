/**
 * SystemGateRegistry — static definitions for all inter-system travel gates.
 *
 * Gates always come in **pairs** (see `SystemGate`). Each gate in the registry
 * has a `sisterGateId` that points to the matching gate in another system,
 * creating a bidirectional connection:
 *
 *   Gate A (System 1)  ↔  Gate B (System 2)
 *   Gate B.sisterGateId === Gate A.id
 *   Gate A.sisterGateId === Gate B.id
 *
 * Gate positions are placed far from the solar system's centre (in km) to
 * represent edge-of-system structures.  A `triggerRadius` of 50 km gives the
 * player a comfortable approach window without snapping them instantly.
 *
 * Usage:
 *   SystemGateRegistry.getGate("gate-sol-to-kepler")
 *   SystemGateRegistry.getSisterGate("gate-sol-to-kepler")
 *   SystemGateRegistry.getGatesBySystem("sol")
 *   SystemGateRegistry.getAllGates()
 */

import type { SystemGate } from "../../types/solarsystem";

// ── Gate pair: Sol ↔ Kepler-442 ───────────────────────────────────────────────

/**
 * The Sol-side gate for the Sol → Kepler-442 corridor.
 * Positioned on the ecliptic east edge of the Sol system.
 */
const GATE_SOL_TO_KEPLER: SystemGate = {
  id: "gate-sol-to-kepler",
  name: "Sol → Kepler-442 Gate",
  systemId: "sol",
  position: { x: 8000, y: 0 },
  triggerRadius: 50,
  sisterGateId: "gate-kepler-to-sol",
  destinationSystemId: "kepler-442",
};

/**
 * The Kepler-442-side gate for the Sol → Kepler-442 corridor.
 * Positioned on the ecliptic west edge of the Kepler-442 system.
 */
const GATE_KEPLER_TO_SOL: SystemGate = {
  id: "gate-kepler-to-sol",
  name: "Kepler-442 → Sol Gate",
  systemId: "kepler-442",
  position: { x: -8000, y: 0 },
  triggerRadius: 50,
  sisterGateId: "gate-sol-to-kepler",
  destinationSystemId: "sol",
};

// ── Gate pair: Sol ↔ Proxima Centauri ────────────────────────────────────────

/**
 * The Sol-side gate for the Sol → Proxima Centauri corridor.
 * Positioned on the ecliptic north edge of the Sol system.
 */
const GATE_SOL_TO_PROXIMA: SystemGate = {
  id: "gate-sol-to-proxima",
  name: "Sol → Proxima Centauri Gate",
  systemId: "sol",
  position: { x: 0, y: -8000 },
  triggerRadius: 50,
  sisterGateId: "gate-proxima-to-sol",
  destinationSystemId: "proxima-centauri",
};

/**
 * The Proxima-Centauri-side gate for the Sol → Proxima Centauri corridor.
 * Positioned on the ecliptic south edge of the Proxima Centauri system.
 */
const GATE_PROXIMA_TO_SOL: SystemGate = {
  id: "gate-proxima-to-sol",
  name: "Proxima Centauri → Sol Gate",
  systemId: "proxima-centauri",
  position: { x: 0, y: 8000 },
  triggerRadius: 50,
  sisterGateId: "gate-sol-to-proxima",
  destinationSystemId: "sol",
};

// ── Gate pair: Kepler-442 ↔ Proxima Centauri ─────────────────────────────────

/**
 * The Kepler-442-side gate for the Kepler-442 → Proxima Centauri corridor.
 * Positioned on the ecliptic north edge of the Kepler-442 system.
 */
const GATE_KEPLER_TO_PROXIMA: SystemGate = {
  id: "gate-kepler-to-proxima",
  name: "Kepler-442 → Proxima Centauri Gate",
  systemId: "kepler-442",
  position: { x: 0, y: -8000 },
  triggerRadius: 50,
  sisterGateId: "gate-proxima-to-kepler",
  destinationSystemId: "proxima-centauri",
};

/**
 * The Proxima-Centauri-side gate for the Kepler-442 → Proxima Centauri
 * corridor.  Positioned on the ecliptic east edge of the Proxima Centauri
 * system.
 */
const GATE_PROXIMA_TO_KEPLER: SystemGate = {
  id: "gate-proxima-to-kepler",
  name: "Proxima Centauri → Kepler-442 Gate",
  systemId: "proxima-centauri",
  position: { x: 8000, y: 0 },
  triggerRadius: 50,
  sisterGateId: "gate-kepler-to-proxima",
  destinationSystemId: "kepler-442",
};

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_GATES: readonly SystemGate[] = Object.freeze([
  GATE_SOL_TO_KEPLER,
  GATE_KEPLER_TO_SOL,
  GATE_SOL_TO_PROXIMA,
  GATE_PROXIMA_TO_SOL,
  GATE_KEPLER_TO_PROXIMA,
  GATE_PROXIMA_TO_KEPLER,
]);

const GATE_MAP: Readonly<Record<string, SystemGate>> = Object.freeze(
  Object.fromEntries(ALL_GATES.map((g) => [g.id, g])),
);

// ── Public API ────────────────────────────────────────────────────────────────

export const SystemGateRegistry = {
  /**
   * Returns the gate definition for the given id, or `undefined` if not found.
   */
  getGate(id: string): SystemGate | undefined {
    return GATE_MAP[id];
  },

  /**
   * Returns every gate definition across all systems.
   */
  getAllGates(): readonly SystemGate[] {
    return ALL_GATES;
  },

  /**
   * Returns all gate ids in the registry.
   */
  getAllGateIds(): string[] {
    return ALL_GATES.map((g) => g.id);
  },

  /**
   * Returns all gates that reside in the given solar system.
   *
   * @param systemId - Matches `SystemGate.systemId`.
   */
  getGatesBySystem(systemId: string): SystemGate[] {
    return ALL_GATES.filter((g) => g.systemId === systemId);
  },

  /**
   * Returns the sister gate for the given gate id.
   *
   * The sister gate is the gate in the destination system that the player
   * arrives at when they traverse the source gate.
   *
   * Returns `undefined` when either the source gate id or the sister gate id
   * is not present in the registry.
   *
   * @param gateId - Id of the source gate.
   */
  getSisterGate(gateId: string): SystemGate | undefined {
    const gate = GATE_MAP[gateId];
    if (gate === undefined) return undefined;
    return GATE_MAP[gate.sisterGateId];
  },
} as const;

/**
 * ShipyardManager — orchestrates ship modification when docked at a shipyard
 * station. Manages blueprint loading, part modifications, validation, and
 * persistence.
 *
 * Responsibilities
 * ────────────────
 * • Load the player's currently equipped blueprint from the BlueprintStore.
 * • Apply modifications (add/remove/change parts) to a working copy.
 * • Validate the modified blueprint (assembly rules, power budget).
 * • Persist confirmed modifications back to the BlueprintStore.
 * • Track modification state (pending changes, validity, errors).
 *
 * State model
 * ───────────
 * When openShipyard() is called, the manager:
 *   1. Loads the currently equipped blueprint from BlueprintStore.
 *   2. Creates a mutable working copy for editing.
 *   3. Returns a shipyard session state with the loaded blueprint + validation.
 *
 * During editing, the caller invokes modification methods (addPart, removePart,
 * changePart) which mutate the working copy and return updated session state.
 *
 * When the player confirms, confirmModifications() validates the final state
 * and persists to BlueprintStore. When the player cancels, closeShipyard()
 * discards the working copy without saving.
 *
 * No Pixi dependency — unit-testable. The rendering layer reads session state
 * and draws the shipyard UI accordingly.
 */

import type { Blueprint, PlacedPart, ShipStats } from "../types/shipBuilder";
import { BlueprintStore } from "./BlueprintStore";
import { PARTS_REGISTRY } from "../game/parts/registry";
import { validateBlueprint, type AssemblyReport } from "../game/parts/assembly";
import { computeShipStats } from "../game/parts/stats";

// ── Shipyard session state ────────────────────────────────────────────────────

/**
 * Immutable snapshot of the active shipyard session state.
 *
 * Returned by every mutating method and by `getSessionState()`. The caller
 * should treat this as a value object — do not mutate the fields.
 */
export interface ShipyardSessionState {
  /** The blueprint currently being edited (working copy). */
  blueprint: Blueprint;
  /** Validation result for the current blueprint. */
  validationReport: AssemblyReport;
  /** Whether the current blueprint is valid (can be saved). */
  isValid: boolean;
  /**
   * True when the player confirms modifications.
   * The caller is responsible for:
   *   1. Calling `BlueprintStore.upsert()` to save the blueprint.
   *   2. Switching back to the dock menu.
   *   3. Calling `ShipyardManager.closeShipyard()` to release internal state.
   */
  confirmTriggered: boolean;
  /** Computed ship stats for the current blueprint (if valid). */
  shipStats: ShipStats | undefined;
}

// ── Shipyard modification results ─────────────────────────────────────────────

/**
 * Result of a part modification attempt (add, remove, change).
 */
export interface PartModificationResult {
  /** True when the modification succeeded. */
  success: boolean;
  /** Why the modification failed. Absent on success. */
  reason?: string;
  /** Updated shipyard session state (present on both success and failure). */
  state: ShipyardSessionState;
}

// ── ShipyardManager ───────────────────────────────────────────────────────────

export class ShipyardManager {
  private readonly blueprintStore: BlueprintStore;
  /** Active shipyard session state. Null when the shipyard is closed. */
  private sessionState: ShipyardSessionState | null = null;

  /**
   * @param blueprintStore  Optional injected BlueprintStore for testing.
   *                       Defaults to a fresh instance.
   */
  constructor(blueprintStore?: BlueprintStore) {
    this.blueprintStore = blueprintStore ?? new BlueprintStore();
  }

  // ── Session lifecycle ───────────────────────────────────────────────────────

  /**
   * Open the shipyard for a specific blueprint.
   *
   * Loads the blueprint from the BlueprintStore and creates a working copy
   * for editing. Returns the initial shipyard session state.
   *
   * @param blueprintId  The id of the blueprint to edit. If null or unknown,
   *                     creates a minimal starter blueprint.
   * @returns The initial shipyard session state with validation.
   * @throws Error when called with an active shipyard session.
   */
  openShipyard(blueprintId: string | null): ShipyardSessionState {
    if (this.sessionState !== null) {
      throw new Error("ShipyardManager: shipyard already open");
    }

    // Load or create a blueprint
    let blueprint: Blueprint;
    if (blueprintId) {
      const loaded = this.blueprintStore.get(blueprintId);
      if (loaded) {
        blueprint = {
          id: loaded.id,
          name: loaded.name,
          parts: [...loaded.parts], // create a mutable copy
        };
      } else {
        // Fallback: create a minimal starter blueprint
        blueprint = this.createMinimalBlueprint();
      }
    } else {
      // No blueprint specified; create a minimal one
      blueprint = this.createMinimalBlueprint();
    }

    // Create and store the session state
    this.sessionState = this.buildSessionState(blueprint);
    return this.snapshot();
  }

  /**
   * Add a part to the blueprint at a specified parent socket.
   *
   * @param partId        The part type to add (must exist in PARTS_REGISTRY).
   * @param parentId      The id of the existing part to attach to.
   * @param parentSocketId The socket on the parent to attach into.
   * @returns Result including success flag and updated session state.
   * @throws Error when called with no active shipyard session.
   */
  addPart(
    partId: string,
    parentId: string,
    parentSocketId: string,
  ): PartModificationResult {
    this.requireSession();
    const state = this.sessionState!;

    // Validate part exists
    const partDef = PARTS_REGISTRY[partId as keyof typeof PARTS_REGISTRY];
    if (!partDef) {
      return { success: false, reason: "unknown-part", state: this.snapshot() };
    }

    // Validate parent and socket exist
    const parent = state.blueprint.parts.find((p) => p.id === parentId);
    if (!parent) {
      return { success: false, reason: "parent-not-found", state: this.snapshot() };
    }

    const parentDef = PARTS_REGISTRY[parent.partId as keyof typeof PARTS_REGISTRY];
    if (!parentDef) {
      return { success: false, reason: "parent-def-not-found", state: this.snapshot() };
    }

    const socket = parentDef.sockets.find((s) => s.id === parentSocketId);
    if (!socket) {
      return { success: false, reason: "socket-not-found", state: this.snapshot() };
    }

    // Validate socket is not already occupied
    const socketUsed = state.blueprint.parts.some(
      (p) => p.parentId === parentId && p.parentSocketId === parentSocketId,
    );
    if (socketUsed) {
      return { success: false, reason: "socket-occupied", state: this.snapshot() };
    }

    // Create the new placed part
    const newPart: PlacedPart = {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      partId,
      parentId,
      parentSocketId,
      colourId: null,
    };

    // Add to blueprint
    const modified = {
      ...state.blueprint,
      parts: [...state.blueprint.parts, newPart],
    };

    // Update session with new blueprint
    this.sessionState = this.buildSessionState(modified);
    return { success: true, state: this.snapshot() };
  }

  /**
   * Remove a part from the blueprint.
   *
   * @param partId  The id of the placed part to remove.
   * @returns Result including success flag and updated session state.
   * @throws Error when called with no active shipyard session.
   */
  removePart(partId: string): PartModificationResult {
    this.requireSession();
    const state = this.sessionState!;

    // Find the part
    const part = state.blueprint.parts.find((p) => p.id === partId);
    if (!part) {
      return { success: false, reason: "part-not-found", state: this.snapshot() };
    }

    // Cannot remove the root core
    if (part.parentId === null) {
      return { success: false, reason: "cannot-remove-root", state: this.snapshot() };
    }

    // Check if any other parts depend on this one as a parent
    const hasChildren = state.blueprint.parts.some((p) => p.parentId === partId);
    if (hasChildren) {
      return { success: false, reason: "has-children", state: this.snapshot() };
    }

    // Remove the part
    const modified = {
      ...state.blueprint,
      parts: state.blueprint.parts.filter((p) => p.id !== partId),
    };

    // Update session
    this.sessionState = this.buildSessionState(modified);
    return { success: true, state: this.snapshot() };
  }

  /**
   * Change the part type at a placed part slot.
   *
   * Effectively removes the old part and adds a new one at the same location.
   *
   * @param placedPartId  The id of the placed part to replace.
   * @param newPartId     The new part type.
   * @returns Result including success flag and updated session state.
   * @throws Error when called with no active shipyard session.
   */
  changePart(placedPartId: string, newPartId: string): PartModificationResult {
    this.requireSession();
    const state = this.sessionState!;

    // Find the part to replace
    const oldPart = state.blueprint.parts.find((p) => p.id === placedPartId);
    if (!oldPart) {
      return { success: false, reason: "part-not-found", state: this.snapshot() };
    }

    // Cannot change the root core
    if (oldPart.parentId === null) {
      return { success: false, reason: "cannot-change-root", state: this.snapshot() };
    }

    // Validate new part exists
    const newPartDef = PARTS_REGISTRY[newPartId as keyof typeof PARTS_REGISTRY];
    if (!newPartDef) {
      return { success: false, reason: "unknown-part", state: this.snapshot() };
    }

    // Replace the part in the parts list
    const modified = {
      ...state.blueprint,
      parts: state.blueprint.parts.map((p) =>
        p.id === placedPartId ? { ...p, partId: newPartId } : p,
      ),
    };

    // Update session
    this.sessionState = this.buildSessionState(modified);
    return { success: true, state: this.snapshot() };
  }

  /**
   * Rename the blueprint.
   *
   * @param newName  The new name for the blueprint.
   * @returns Updated shipyard session state.
   * @throws Error when called with no active shipyard session.
   */
  renameBlueprintTo(newName: string): ShipyardSessionState {
    this.requireSession();

    const modified = {
      ...this.sessionState!.blueprint,
      name: newName,
    };

    this.sessionState = this.buildSessionState(modified);
    return this.snapshot();
  }

  /**
   * Confirm the current modifications and persist to BlueprintStore.
   *
   * Only succeeds when the blueprint is valid (validation report has no errors).
   *
   * Sets `confirmTriggered: true` in the session state. The caller must:
   *   1. Read the confirmed blueprint from the session state.
   *   2. Call `BlueprintStore.upsert(blueprint)` to persist.
   *   3. Switch back to the dock menu.
   *   4. Call `closeShipyard()` to release internal state.
   *
   * @returns Updated session state with confirmTriggered set.
   * @throws Error when called with no active shipyard session or invalid blueprint.
   */
  confirmModifications(): ShipyardSessionState {
    this.requireSession();

    if (!this.sessionState!.isValid) {
      throw new Error("ShipyardManager: cannot confirm invalid blueprint");
    }

    this.sessionState = {
      ...this.sessionState!,
      confirmTriggered: true,
    };

    return this.snapshot();
  }

  // ── State accessors ─────────────────────────────────────────────────────────

  /**
   * Read-only snapshot of the current shipyard session state.
   * Returns `null` when the shipyard is not open.
   */
  getSessionState(): ShipyardSessionState | null {
    return this.sessionState !== null ? this.snapshot() : null;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  /**
   * Close the shipyard without saving.
   *
   * Call this after either confirming modifications (once saved by the caller)
   * or canceling the shipyard session. Subsequent method calls will throw until
   * the next `openShipyard()` invocation.
   */
  closeShipyard(): void {
    this.sessionState = null;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private requireSession(): void {
    if (this.sessionState === null) {
      throw new Error("ShipyardManager: no active shipyard session");
    }
  }

  /**
   * Build the full session state from a blueprint.
   * Includes validation and computed stats.
   */
  private buildSessionState(blueprint: Blueprint): ShipyardSessionState {
    const validationReport = validateBlueprint(blueprint);
    const isValid = validationReport.ok;
    const shipStats = isValid ? computeShipStats(blueprint) : undefined;

    return {
      blueprint,
      validationReport,
      isValid,
      confirmTriggered: false,
      shipStats,
    };
  }

  /**
   * Create a minimal starter blueprint with just a core and hull.
   */
  private createMinimalBlueprint(): Blueprint {
    const corePart: PlacedPart = {
      id: "core-root",
      partId: "core-starter",
      parentId: null,
      parentSocketId: null,
      colourId: null,
    };

    const hullPart: PlacedPart = {
      id: "hull-root",
      partId: "hull-starter",
      parentId: "core-root",
      parentSocketId: "s-hull",
      colourId: null,
    };

    return {
      id: `blueprint-${Date.now()}`,
      name: "Unnamed Ship",
      parts: [corePart, hullPart],
    };
  }

  /**
   * Returns a shallow copy of the session state (value object).
   */
  private snapshot(): ShipyardSessionState {
    const s = this.sessionState!;
    return {
      blueprint: {
        ...s.blueprint,
        parts: [...s.blueprint.parts],
      },
      validationReport: {
        ...s.validationReport,
        errors: [...s.validationReport.errors],
      },
      isValid: s.isValid,
      confirmTriggered: s.confirmTriggered,
      shipStats: s.shipStats,
    };
  }
}

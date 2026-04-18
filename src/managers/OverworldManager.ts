/**
 * OverworldManager — pure state + reducers for the campaign's metaprogress
 * layer. Owns:
 *
 *  - Current sector + node the player is parked at.
 *  - Set of completed missions and unlocked nodes.
 *  - Inventory: credits, rare materials, unlocked parts/colours/blueprints,
 *    currently equipped blueprint.
 *
 * No Pixi. No DOM. Serialises via the LocalStorageService envelope.
 *
 * Arcade-mode gameplay is untouched; this manager only exists when the
 * player chooses Campaign from the main menu.
 */

import type {
  Inventory,
  MaterialId,
  MissionId,
  MissionSpec,
  NodeId,
  OverworldState,
  PartId,
  Sector,
} from "../types/campaign";
import {
  InMemoryStorage,
  type StorageBackend,
  StorageMigrationError,
  VersionedSlot,
} from "../services/LocalStorageService";

export const OVERWORLD_SCHEMA_VERSION = 1 as const;
export const OVERWORLD_STORAGE_KEY = "rwipe.overworld.v1";

export type MissionCompleteOutcome = "cleared" | "already-done" | "unknown";

export interface StartMissionResult {
  ok: boolean;
  reason: null | "node-not-unlocked" | "mission-not-at-node" | "unknown-mission";
  spec: MissionSpec | null;
}

export interface CompleteMissionResult {
  outcome: MissionCompleteOutcome;
  awardedCredits: number;
  awardedParts: PartId[];
  /** Nodes that were unlocked as a consequence of this completion. */
  newlyUnlockedNodes: NodeId[];
}

function emptyInventory(): Inventory {
  return {
    credits: 0,
    materials: {},
    unlockedParts: [],
    unlockedColours: [],
    blueprints: [],
    equippedBlueprintId: null,
  };
}

/** Builds a fresh campaign state for a given sector. */
export function createInitialOverworldState(sector: Sector): OverworldState {
  return {
    schemaVersion: 1,
    sectorId: sector.id,
    currentNodeId: sector.startNodeId,
    completedMissionIds: [],
    unlockedNodeIds: [sector.startNodeId],
    inventory: emptyInventory(),
  };
}

export class OverworldManager {
  private state: OverworldState;
  private readonly sector: Sector;
  private readonly slot: VersionedSlot<OverworldState>;

  /**
   * Construct against a sector registry. Pass `storage` (e.g. InMemoryStorage)
   * in tests; in the browser, pass nothing to use the default localStorage.
   */
  constructor(sector: Sector, storage?: StorageBackend | null) {
    this.sector = sector;
    this.slot = new VersionedSlot<OverworldState>({
      key: OVERWORLD_STORAGE_KEY,
      currentVersion: OVERWORLD_SCHEMA_VERSION,
      storage: storage ?? null,
      validate: (raw): raw is OverworldState =>
        typeof raw === "object" &&
        raw !== null &&
        "sectorId" in raw &&
        "currentNodeId" in raw &&
        "inventory" in raw,
    });
    this.state = createInitialOverworldState(sector);
  }

  // ── Read-only accessors ──────────────────────────────────────────────────

  getState(): Readonly<OverworldState> {
    return this.state;
  }

  getSector(): Readonly<Sector> {
    return this.sector;
  }

  getCurrentNode() {
    return this.sector.nodes[this.state.currentNodeId];
  }

  /** All nodes the player has unlocked access to (reachable on the starmap). */
  getUnlockedNodes() {
    return this.state.unlockedNodeIds
      .map((id) => this.sector.nodes[id])
      .filter((n): n is NonNullable<typeof n> => n !== undefined);
  }

  /** Missions available at the current node that haven't been completed. */
  getAvailableMissionsAtNode(nodeId: NodeId): MissionSpec[] {
    const node = this.sector.nodes[nodeId];
    if (!node) return [];
    return node.missionIds
      .map((id) => this.sector.missions[id])
      .filter((m): m is MissionSpec => !!m)
      .filter((m) => !this.state.completedMissionIds.includes(m.id));
  }

  isMissionCompleted(id: MissionId): boolean {
    return this.state.completedMissionIds.includes(id);
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  /** Move the player to an unlocked node. Returns false if the node is locked. */
  moveTo(nodeId: NodeId): boolean {
    if (!this.state.unlockedNodeIds.includes(nodeId)) return false;
    if (!this.sector.nodes[nodeId]) return false;
    this.state = { ...this.state, currentNodeId: nodeId };
    return true;
  }

  // ── Mission lifecycle ────────────────────────────────────────────────────

  /**
   * Resolves a mission for launch. Does not mutate state. The caller uses the
   * returned spec to build a LevelState via MissionManager, then calls
   * `completeMission` when the mission clears.
   */
  startMission(missionId: MissionId): StartMissionResult {
    const spec = this.sector.missions[missionId];
    if (!spec) return { ok: false, reason: "unknown-mission", spec: null };

    if (!this.state.unlockedNodeIds.includes(spec.nodeId)) {
      return { ok: false, reason: "node-not-unlocked", spec: null };
    }

    const node = this.sector.nodes[spec.nodeId];
    if (!node || !node.missionIds.includes(missionId)) {
      return { ok: false, reason: "mission-not-at-node", spec: null };
    }

    return { ok: true, reason: null, spec };
  }

  /**
   * Records a mission as cleared, awards its rewards, and unlocks follow-on
   * nodes when every mission at the current node has been completed. Idempotent
   * — calling a second time for the same mission returns "already-done" and
   * doesn't double-reward.
   */
  completeMission(missionId: MissionId): CompleteMissionResult {
    const spec = this.sector.missions[missionId];
    if (!spec) {
      return {
        outcome: "unknown",
        awardedCredits: 0,
        awardedParts: [],
        newlyUnlockedNodes: [],
      };
    }

    if (this.state.completedMissionIds.includes(missionId)) {
      return {
        outcome: "already-done",
        awardedCredits: 0,
        awardedParts: [],
        newlyUnlockedNodes: [],
      };
    }

    const nextCompleted = [...this.state.completedMissionIds, missionId];

    // Credit + material + part rewards merge into inventory.
    const nextInventory: Inventory = {
      ...this.state.inventory,
      credits: this.state.inventory.credits + spec.rewardCredits,
      materials: mergeMaterials(this.state.inventory.materials, spec.rewardMaterials),
      unlockedParts: mergeUnique(this.state.inventory.unlockedParts, spec.rewardParts),
      blueprints: mergeUnique(this.state.inventory.blueprints, spec.rewardBlueprints),
    };

    // Node-unlock cascade: if every mission at this node is now done, the
    // node's unlocksNodeIds become reachable.
    const node = this.sector.nodes[spec.nodeId];
    const newlyUnlocked: NodeId[] = [];
    let unlockedNodeIds = this.state.unlockedNodeIds;
    if (node) {
      const allCleared = node.missionIds.every((mid) => nextCompleted.includes(mid));
      if (allCleared) {
        for (const id of node.unlocksNodeIds) {
          if (!unlockedNodeIds.includes(id) && this.sector.nodes[id]) {
            unlockedNodeIds = [...unlockedNodeIds, id];
            newlyUnlocked.push(id);
          }
        }
      }
    }

    this.state = {
      ...this.state,
      completedMissionIds: nextCompleted,
      unlockedNodeIds,
      inventory: nextInventory,
    };

    return {
      outcome: "cleared",
      awardedCredits: spec.rewardCredits,
      awardedParts: spec.rewardParts,
      newlyUnlockedNodes: newlyUnlocked,
    };
  }

  // ── Inventory mutators (used by shipyard in phase D) ─────────────────────

  /** Spend credits. Returns false if insufficient. */
  spendCredits(amount: number): boolean {
    if (amount < 0) return false;
    if (this.state.inventory.credits < amount) return false;
    this.state = {
      ...this.state,
      inventory: { ...this.state.inventory, credits: this.state.inventory.credits - amount },
    };
    return true;
  }

  addCredits(amount: number): void {
    if (amount <= 0) return;
    this.state = {
      ...this.state,
      inventory: { ...this.state.inventory, credits: this.state.inventory.credits + amount },
    };
  }

  /** Equip a blueprint (phase D). Blueprint must already be in inventory. */
  equipBlueprint(blueprintId: string | null): boolean {
    if (blueprintId !== null && !this.state.inventory.blueprints.includes(blueprintId)) {
      return false;
    }
    this.state = {
      ...this.state,
      inventory: { ...this.state.inventory, equippedBlueprintId: blueprintId },
    };
    return true;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  save(): void {
    this.slot.save(this.state);
  }

  /**
   * Load from storage. Returns true on success, false if no save exists.
   * Throws StorageMigrationError on schema / validation failure so the
   * caller can decide whether to reset.
   */
  load(): boolean {
    const raw = this.slot.load();
    if (!raw) return false;
    if (raw.sectorId !== this.sector.id) {
      throw new StorageMigrationError(
        `Stored sectorId ${raw.sectorId} does not match current sector ${this.sector.id}`,
      );
    }
    // Re-apply invariants: all stored node ids / mission ids must still exist
    // in the sector registry. Strip anything that doesn't to survive content
    // updates that remove nodes.
    const unlocked = raw.unlockedNodeIds.filter((id) => this.sector.nodes[id]);
    const completed = raw.completedMissionIds.filter((id) => this.sector.missions[id]);
    const current = this.sector.nodes[raw.currentNodeId]
      ? raw.currentNodeId
      : this.sector.startNodeId;

    this.state = {
      ...raw,
      currentNodeId: current,
      unlockedNodeIds: unlocked,
      completedMissionIds: completed,
    };
    return true;
  }

  clearSaved(): void {
    this.slot.clear();
  }

  /** Testing helper: reset to a fresh sector start without touching storage. */
  resetForTest(): void {
    this.state = createInitialOverworldState(this.sector);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mergeMaterials(
  base: Partial<Record<MaterialId, number>>,
  add: Partial<Record<MaterialId, number>>,
): Partial<Record<MaterialId, number>> {
  const out: Partial<Record<MaterialId, number>> = { ...base };
  for (const k of Object.keys(add) as MaterialId[]) {
    out[k] = (out[k] ?? 0) + (add[k] ?? 0);
  }
  return out;
}

function mergeUnique<T>(base: T[], add: T[]): T[] {
  const set = new Set(base);
  for (const x of add) set.add(x);
  return [...set];
}

export { InMemoryStorage };

/**
 * MissionLogManager — mission acceptance, log tracking, waypoint management,
 * and persistence for the Open World Solar System Exploration feature.
 *
 * Responsibilities:
 *  - acceptMission: validate against registry, create log entry, auto-set
 *    primary waypoint (courier destination or trade NPC location), persist.
 *  - getMissionLog: return all entries (active + completed + failed + abandoned).
 *  - completeMission: mark entry completed, return reward summary, persist.
 *  - setWaypoint / clearWaypoint: manage per-entry waypoint assignments,
 *    ensuring each global slot (primary/secondary/tertiary) is held by at most
 *    one entry at a time.
 *  - getWaypoints: return one Waypoint per occupied slot, colour-coded.
 *
 * Persistence key: "rwipe.missions.v1" (LocalStorageService).
 *
 * Validation:
 *  - Mission spec id must exist in MissionRegistry.
 *  - setWaypoint targetId must resolve in LocationRegistry.
 */

import type { MissionSpec, MissionLogEntry, Waypoint } from "../types/missions";
import {
  LocalStorageService,
  MISSIONS_STORAGE_KEY,
  MISSIONS_SCHEMA_VERSION,
  missionsMigrations,
  type StorageBackend,
} from "../services/LocalStorageService";
import { MissionRegistry } from "../game/data/MissionRegistry";
import { LocationRegistry } from "../game/data/LocationRegistry";

// ── Colour constants ──────────────────────────────────────────────────────────

const WAYPOINT_COLORS: Record<
  "primary" | "secondary" | "tertiary",
  { r: number; g: number; b: number }
> = {
  primary: { r: 0, g: 255, b: 255 }, // cyan
  secondary: { r: 255, g: 255, b: 0 }, // yellow
  tertiary: { r: 255, g: 0, b: 255 }, // magenta
};

// ── Public types ──────────────────────────────────────────────────────────────

/** Reward summary returned by completeMission. */
export interface MissionRewards {
  credits: number;
  reputation: number;
  items: Array<{ type: string; count: number }>;
}

// ── Error ─────────────────────────────────────────────────────────────────────

/**
 * Thrown by MissionLogManager when an operation is invalid (unknown mission id,
 * unknown target id, etc.).
 */
export class MissionLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissionLogError";
  }
}

// ── Persisted shape ───────────────────────────────────────────────────────────

/**
 * JSON-serialisable form stored under "rwipe.missions.v1".
 * completedMissionIds is an array here because Set cannot be JSON-serialised.
 */
interface PersistedMissionLog {
  entries: MissionLogEntry[];
  completedMissionIds: string[];
  lastUpdatedAt: number;
}

// ── MissionLogManager ─────────────────────────────────────────────────────────

export class MissionLogManager {
  private entries: MissionLogEntry[] = [];
  private completedMissionIds = new Set<string>();
  private readonly storageService: LocalStorageService;

  /**
   * @param storageBackend  Inject an InMemoryStorage in tests; leave undefined
   *                        in the browser to use window.localStorage.
   */
  constructor(storageBackend?: StorageBackend | null) {
    this.storageService = new LocalStorageService(storageBackend ?? null);
  }

  // ── Core API ────────────────────────────────────────────────────────────────

  /**
   * Accept a mission from an NPC and add it to the log.
   *
   * Validates that `missionSpec.id` exists in MissionRegistry.
   * Auto-sets the **primary** waypoint:
   *   - courier → `destinationLocationId`
   *   - trade   → first location where `npcId` appears (the sell-back point)
   * If a primary waypoint is being set, any previously assigned primary is
   * cleared from other entries first (only one primary at a time globally).
   * Persists the updated log immediately.
   *
   * @throws MissionLogError when the spec id is not in MissionRegistry.
   */
  acceptMission(missionSpec: MissionSpec, npcId: string): MissionLogEntry {
    if (!MissionRegistry.getMission(missionSpec.id)) {
      throw new MissionLogError(
        `Mission "${missionSpec.id}" is not registered in MissionRegistry`,
      );
    }

    // Guard against duplicate entries — one log entry per mission id at a time.
    if (this.findEntry(missionSpec.id)) {
      throw new MissionLogError(
        `Mission "${missionSpec.id}" is already in the mission log`,
      );
    }

    // Resolve the auto primary waypoint target.
    let autoWaypoint: string | null = null;
    if (missionSpec.type === "courier" && missionSpec.destinationLocationId) {
      autoWaypoint = missionSpec.destinationLocationId;
    } else if (missionSpec.type === "trade") {
      // Set primary to the NPC's location so the player can navigate back
      // after collecting the required items.
      const npcLocations = LocationRegistry.getLocationsForNPC(npcId);
      const firstLocation = npcLocations[0];
      if (firstLocation) {
        autoWaypoint = firstLocation.id;
      }
      // If the NPC is not listed at any registered location, autoWaypoint stays
      // null and no primary waypoint is auto-set.  The player can still assign
      // waypoints manually via setWaypoint().
    }

    // Claim the primary slot (clear from any current holder).
    if (autoWaypoint !== null) {
      this.clearWaypointTypeGlobally("primary");
    }

    const entry: MissionLogEntry = {
      missionId: missionSpec.id,
      npcId,
      acceptedAt: Date.now(),
      status: "active",
      progressData: {},
      waypointAssignments: {
        primary: autoWaypoint,
        secondary: null,
        tertiary: null,
      },
    };

    this.entries.push(entry);
    this.persist();
    return entry;
  }

  /**
   * Returns all log entries — active, completed, failed, and abandoned.
   * Returns a shallow copy of the internal array; mutations are not reflected.
   */
  getMissionLog(): MissionLogEntry[] {
    return [...this.entries];
  }

  /**
   * Returns the set of mission ids the player has ever completed.
   * Intended for prerequisite checks on location docking and mission unlock.
   * The returned set is a live read-only view — callers must not mutate it.
   */
  getCompletedMissionIds(): ReadonlySet<string> {
    return this.completedMissionIds;
  }

  /**
   * Mark a mission as completed and return its reward summary.
   *
   * @throws MissionLogError when missionId is not found in the log or not in
   *         MissionRegistry.
   */
  completeMission(missionId: string): MissionRewards {
    const entry = this.findEntry(missionId);
    if (!entry) {
      throw new MissionLogError(`Mission "${missionId}" not found in mission log`);
    }

    const spec = MissionRegistry.getMission(missionId);
    if (!spec) {
      // Should not happen if acceptMission validated correctly, but guard anyway.
      throw new MissionLogError(
        `Mission "${missionId}" is not registered in MissionRegistry`,
      );
    }

    entry.status = "completed";
    this.completedMissionIds.add(missionId);
    this.persist();

    return {
      credits: spec.rewardCredits,
      reputation: spec.rewardReputation,
      items: spec.rewardItems ?? [],
    };
  }

  /**
   * Assign a waypoint of the given type to a mission.
   *
   * Enforces uniqueness per slot type: any existing holder of the same slot
   * type is cleared before the new assignment is made.
   *
   * @throws MissionLogError when `missionId` is not in the log or `targetId`
   *         does not resolve in LocationRegistry.
   */
  setWaypoint(
    missionId: string,
    type: "primary" | "secondary" | "tertiary",
    targetId: string,
  ): void {
    const entry = this.findEntry(missionId);
    if (!entry) {
      throw new MissionLogError(`Mission "${missionId}" not found in mission log`);
    }

    if (!this.isWaypointModifiable(entry)) {
      throw new MissionLogError(
        `Waypoints cannot be modified on a ${entry.status} mission ("${missionId}")`,
      );
    }

    if (!LocationRegistry.getLocation(targetId)) {
      throw new MissionLogError(
        `Target "${targetId}" is not a valid location or body`,
      );
    }

    // Release the slot from whichever entry currently holds it.
    this.clearWaypointTypeGlobally(type);

    entry.waypointAssignments[type] = targetId;
    this.persist();
  }

  /**
   * Remove a waypoint assignment from a mission entry.
   *
   * @throws MissionLogError when `missionId` is not in the log.
   */
  clearWaypoint(
    missionId: string,
    type: "primary" | "secondary" | "tertiary",
  ): void {
    const entry = this.findEntry(missionId);
    if (!entry) {
      throw new MissionLogError(`Mission "${missionId}" not found in mission log`);
    }

    if (!this.isWaypointModifiable(entry)) {
      throw new MissionLogError(
        `Waypoints cannot be modified on a ${entry.status} mission ("${missionId}")`,
      );
    }

    entry.waypointAssignments[type] = null;
    this.persist();
  }

  /**
   * Return all currently active waypoints, one per occupied slot type.
   * Colour-coded: primary = cyan, secondary = yellow, tertiary = magenta.
   * `targetPosition` is resolved from LocationRegistry where available.
   */
  getWaypoints(): Waypoint[] {
    const waypoints: Waypoint[] = [];
    const typesFound = new Set<"primary" | "secondary" | "tertiary">();

    for (const entry of this.entries) {
      for (const type of ["primary", "secondary", "tertiary"] as const) {
        const targetId = entry.waypointAssignments[type];
        if (targetId && !typesFound.has(type)) {
          const location = LocationRegistry.getLocation(targetId);
          if (!location) {
            // The persisted targetId no longer resolves — likely stale saved data.
            // Warn and skip rather than silently placing a waypoint at the origin.
            console.warn(
              `[MissionLogManager] getWaypoints: targetId "${targetId}" assigned to mission "${entry.missionId}" no longer resolves in LocationRegistry; skipping waypoint.`,
            );
            continue;
          }
          typesFound.add(type);
          waypoints.push({
            id: `waypoint-${type}`,
            type,
            targetId,
            targetPosition: { x: location.position.x, y: location.position.y },
            color: WAYPOINT_COLORS[type],
            assignedMissionId: entry.missionId,
          });
        }
      }
    }

    return waypoints;
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  /**
   * Load mission log from "rwipe.missions.v1".
   * Returns `true` when saved data was found and applied, `false` otherwise.
   */
  load(): boolean {
    const data = this.storageService.load<PersistedMissionLog>(
      MISSIONS_STORAGE_KEY,
      MISSIONS_SCHEMA_VERSION,
      missionsMigrations,
    );
    if (!data) return false;

    this.entries = data.entries ?? [];
    this.completedMissionIds = new Set(data.completedMissionIds ?? []);
    return true;
  }

  /**
   * Clear all in-memory state and remove the storage entry.
   * Useful for tests and "new game" resets.
   */
  reset(): void {
    this.entries = [];
    this.completedMissionIds = new Set();
    this.storageService.clear(MISSIONS_STORAGE_KEY);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private findEntry(missionId: string): MissionLogEntry | undefined {
    return this.entries.find((e) => e.missionId === missionId);
  }

  /**
   * Returns true when waypoint assignments on the given entry may be mutated.
   * Only active missions can have waypoints set or cleared; modifying waypoints
   * on completed, failed, or abandoned missions is not permitted.
   */
  private isWaypointModifiable(entry: MissionLogEntry): boolean {
    return entry.status === "active";
  }

  /**
   * Release `type` from every entry that currently holds it.
   * Called before assigning the slot to a new entry so only one entry can
   * occupy a given slot type at a time.
   */
  private clearWaypointTypeGlobally(
    type: "primary" | "secondary" | "tertiary",
  ): void {
    for (const entry of this.entries) {
      if (entry.waypointAssignments[type] !== null) {
        entry.waypointAssignments[type] = null;
      }
    }
  }

  /** Serialise and write the current state to localStorage. */
  private persist(): void {
    const data: PersistedMissionLog = {
      entries: this.entries,
      completedMissionIds: [...this.completedMissionIds],
      lastUpdatedAt: Date.now(),
    };
    this.storageService.save(
      MISSIONS_STORAGE_KEY,
      data,
      MISSIONS_SCHEMA_VERSION,
    );
  }
}

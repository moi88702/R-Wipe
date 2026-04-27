/**
 * FactionManager — owns faction reputation standings for the player.
 *
 * Responsibilities:
 *  - Initialise every registered faction to 0 reputation on first session.
 *  - Expose reputation read / write through `getStanding` and `addReputation`.
 *  - Keep derived fields (`canDockAt`, `isHostile`) consistent after every
 *    reputation change.
 *  - Process `FactionTakeoverEvent`s: update `SolarSystemState.currentFactionControl`,
 *    append to the system's state-change log, and invoke refresh callbacks so
 *    NPC / mission / shop layers can react.
 *  - Persist standings to the `rwipe.factions.v1` localStorage slot via
 *    `VersionedSlot` (same pattern as OverworldManager).
 *
 * Usage:
 *   const mgr = new FactionManager(new InMemoryStorage(), solarSystemState);
 *   mgr.load();
 *   mgr.addReputation("terran-federation", 100, "mission-completed");
 *   mgr.canDock("player-1", "terran-federation"); // true
 *   mgr.save();
 */

import type {
  FactionStanding,
  FactionTakeoverEvent,
} from "../types/factions";
import type { SolarSystemState } from "../types/solarsystem";
import { FactionRegistry } from "../game/data/FactionRegistry";
import { LocationRegistry } from "../game/data/LocationRegistry";
import {
  FACTIONS_SCHEMA_VERSION,
  FACTIONS_STORAGE_KEY,
  factionsMigrations,
  type StorageBackend,
  VersionedSlot,
} from "../services/LocalStorageService";

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Minimum reputation to dock with a faction at its default (unrestricted)
 * locations. Individual locations may require a higher threshold via their
 * `requiredReputation` field.
 */
export const DOCKING_THRESHOLD = 0;

/**
 * Reputation below which a faction is hostile (attack-on-sight).
 * Matches the design spec value of −300.
 */
export const HOSTILE_THRESHOLD = -300;

/** Reputation floor (cannot go below −1000). */
const REP_MIN = -1000;
/** Reputation ceiling (cannot exceed +1000). */
const REP_MAX = 1000;

// ── Serialisation helpers ──────────────────────────────────────────────────
//
// JSON does not natively serialise Set; we store canDockAt as a plain string[]
// in the persisted envelope and hydrate it back to a Set on load.

type StoredStanding = Omit<FactionStanding, "canDockAt"> & { canDockAt: string[] };
type StoredStandingsState = { standings: Record<string, StoredStanding>; lastUpdatedAt: number };

function standingToStored(s: FactionStanding): StoredStanding {
  return { ...s, canDockAt: [...s.canDockAt] };
}

function storedToStanding(s: StoredStanding): FactionStanding {
  return { ...s, canDockAt: new Set(s.canDockAt) };
}

// ── canDockAt computation ──────────────────────────────────────────────────

/**
 * Derives the set of location ids where the player may dock given the current
 * reputation with `factionId`.
 *
 * If a `SolarSystemState` is supplied, the *live* faction control map
 * (`currentFactionControl`) is consulted; otherwise the static
 * `LocationRegistry` baseline (`controllingFaction`) is used.
 */
function buildCanDockAt(
  factionId: string,
  reputation: number,
  systemState: SolarSystemState | null,
): Set<string> {
  const dockable = new Set<string>();
  for (const location of LocationRegistry.getAllLocations()) {
    const controlling =
      systemState?.currentFactionControl[location.id] ?? location.controllingFaction;
    if (controlling !== factionId) continue;
    const required = location.requiredReputation ?? DOCKING_THRESHOLD;
    if (reputation >= required) {
      dockable.add(location.id);
    }
  }
  return dockable;
}

// ── Default-standing factory ───────────────────────────────────────────────

function makeDefaultStanding(
  factionId: string,
  systemState: SolarSystemState | null,
): FactionStanding {
  return {
    factionId,
    reputation: 0,
    missionsDoneCount: 0,
    canDockAt: buildCanDockAt(factionId, 0, systemState),
    isHostile: false,
  };
}

/** Build a full standings map with 0 reputation for every registered faction. */
function initializeAllFactions(
  systemState: SolarSystemState | null,
): Record<string, FactionStanding> {
  return Object.fromEntries(
    FactionRegistry.getAllFactions().map((f) => [
      f.id,
      makeDefaultStanding(f.id, systemState),
    ]),
  );
}

// ── FactionManager ─────────────────────────────────────────────────────────

export class FactionManager {
  private standings: Record<string, FactionStanding>;
  private systemState: SolarSystemState | null;

  private readonly slot: VersionedSlot<StoredStandingsState>;

  /**
   * Callbacks invoked (with the affected locationId) whenever a takeover event
   * is applied. Used by NPC / mission / shop subsystems to refresh offerings.
   */
  private readonly refreshCallbacks: Array<(locationId: string) => void> = [];

  /**
   * @param storage  - Pass `new InMemoryStorage()` in tests; `null` in
   *                   environments without a browser storage API.
   * @param systemState - Optional: the active solar system state, required for
   *                      `applyTakeover` to mutate `currentFactionControl`.
   *                      Attach (or replace) later via `attachSystemState`.
   */
  constructor(
    storage: StorageBackend | null,
    systemState: SolarSystemState | null = null,
  ) {
    this.slot = new VersionedSlot<StoredStandingsState>({
      key: FACTIONS_STORAGE_KEY,
      currentVersion: FACTIONS_SCHEMA_VERSION,
      migrations: factionsMigrations,
      storage,
    });
    this.systemState = systemState;
    this.standings = initializeAllFactions(systemState);
  }

  // ── Configuration ────────────────────────────────────────────────────────

  /**
   * Attach (or replace) the active solar system state.
   * Call this whenever the player transitions into a solar system so that
   * `applyTakeover` can write to the correct `currentFactionControl` map.
   */
  attachSystemState(state: SolarSystemState): void {
    this.systemState = state;
    // Rebuild canDockAt for all factions using the new live control map.
    this.rebuildAllCanDockAt();
  }

  /**
   * Register a callback to be fired whenever `applyTakeover` changes the
   * controlling faction of a location. Used by NPC, mission, and shop systems.
   */
  onLocationRefresh(cb: (locationId: string) => void): void {
    this.refreshCallbacks.push(cb);
  }

  // ── Read accessors ───────────────────────────────────────────────────────

  /**
   * Returns the player's standing with `factionId`.
   * (`playerId` is present for API symmetry; the game is single-player.)
   * Returns a default 0-reputation standing for unknown faction ids.
   */
  getStanding(_playerId: string, factionId: string): FactionStanding {
    return this.standings[factionId] ?? makeDefaultStanding(factionId, this.systemState);
  }

  /**
   * Returns all current faction standings (for Faction Status Panel UI).
   */
  getAllStandings(): ReadonlyArray<Readonly<FactionStanding>> {
    return Object.values(this.standings);
  }

  /**
   * Returns true when the player's reputation with `factionId` is at or above
   * the global docking threshold (0).  Per-location checks (higher required
   * reputation, required items, required missions) are the responsibility of
   * `DockingSystem.canDock`.
   */
  canDock(_playerId: string, factionId: string): boolean {
    const standing = this.standings[factionId];
    if (!standing) return false;
    return standing.reputation >= DOCKING_THRESHOLD;
  }

  /**
   * Returns the ids of all factions whose reputation has dropped below the
   * hostile threshold (−300). The player should be treated as a target by
   * these factions' ships.
   */
  getHostileFactions(): string[] {
    return Object.values(this.standings)
      .filter((s) => s.reputation < HOSTILE_THRESHOLD)
      .map((s) => s.factionId);
  }

  // ── Mutation ─────────────────────────────────────────────────────────────

  /**
   * Apply a reputation delta (positive or negative) to `factionId`.
   *
   * - Clamps the result to [−1000, +1000].
   * - Recomputes `canDockAt` and `isHostile` immediately.
   * - Increments `missionsDoneCount` when `reason === "mission-completed"`.
   * - Persists to storage after each call.
   *
   * @param factionId - Which faction's reputation to change.
   * @param delta     - Positive = reputation gain; negative = reputation loss.
   * @param reason    - Human-readable reason for audit / log purposes.
   */
  addReputation(factionId: string, delta: number, reason: string): void {
    const current =
      this.standings[factionId] ?? makeDefaultStanding(factionId, this.systemState);

    const reputation = Math.max(REP_MIN, Math.min(REP_MAX, current.reputation + delta));
    const canDockAt = buildCanDockAt(factionId, reputation, this.systemState);
    const isHostile = reputation < HOSTILE_THRESHOLD;
    const missionsDoneCount =
      reason === "mission-completed"
        ? current.missionsDoneCount + 1
        : current.missionsDoneCount;

    this.standings = {
      ...this.standings,
      [factionId]: {
        ...current,
        reputation,
        canDockAt,
        isHostile,
        missionsDoneCount,
      },
    };

    this.save();
  }

  /**
   * Process a faction takeover event.
   *
   * Effects:
   *  1. Updates `SolarSystemState.currentFactionControl[event.locationId]` to
   *     `event.newFactionId` (if a system state is attached).
   *  2. Appends a `"faction-takeover"` entry to the system's state-change log.
   *  3. Sets `SolarSystemState.lastUpdatedAt` to the event timestamp.
   *  4. Recomputes `canDockAt` for both the old and the new controlling faction
   *     so docking eligibility reflects the new ownership.
   *  5. Fires all registered `onLocationRefresh` callbacks with `locationId`.
   *  6. Persists standings to storage.
   */
  applyTakeover(event: FactionTakeoverEvent): void {
    // 1–3. Mutate the solar system state.
    if (this.systemState) {
      this.systemState.currentFactionControl[event.locationId] = event.newFactionId;
      this.systemState.stateChangeLog.entries.push({
        timestamp: event.timestamp,
        eventType: "faction-takeover",
        details: {
          locationId: event.locationId,
          oldFactionId: event.oldFactionId,
          newFactionId: event.newFactionId,
          trigger: event.trigger,
        },
      });
      this.systemState.lastUpdatedAt = event.timestamp;
    }

    // 4. Rebuild canDockAt for the two affected factions so the standing
    //    reflects the new ownership immediately.
    for (const factionId of [event.oldFactionId, event.newFactionId]) {
      const standing = this.standings[factionId];
      if (standing) {
        this.standings = {
          ...this.standings,
          [factionId]: {
            ...standing,
            canDockAt: buildCanDockAt(factionId, standing.reputation, this.systemState),
          },
        };
      }
    }

    // 5. Fire refresh callbacks.
    for (const cb of this.refreshCallbacks) {
      cb(event.locationId);
    }

    // 6. Persist.
    this.save();
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  /**
   * Persist the current standings to the `rwipe.factions.v1` localStorage
   * slot. Converts `Set<string>` to `string[]` for JSON compatibility.
   */
  save(): void {
    const stored: StoredStandingsState = {
      standings: Object.fromEntries(
        Object.entries(this.standings).map(([id, s]) => [id, standingToStored(s)]),
      ),
      lastUpdatedAt: Date.now(),
    };
    this.slot.save(stored);
  }

  /**
   * Load standings from storage.
   *
   * - Returns `true` if a save was found and applied.
   * - Returns `false` on first session (no data stored); standings remain at
   *   the 0-reputation default for all registered factions.
   * - Any faction registered since the last save is seeded at 0 reputation so
   *   the standing map always covers every current faction.
   *
   * Throws `StorageMigrationError` on schema violation (let the caller decide
   * whether to reset to default or surface the error).
   */
  load(): boolean {
    const raw = this.slot.load();
    if (!raw) return false;

    const standings: Record<string, FactionStanding> = {};
    for (const [id, stored] of Object.entries(raw.standings)) {
      standings[id] = storedToStanding(stored);
    }

    // Seed any factions added to the registry after this save file was written.
    for (const faction of FactionRegistry.getAllFactions()) {
      if (!standings[faction.id]) {
        standings[faction.id] = makeDefaultStanding(faction.id, this.systemState);
      }
    }

    this.standings = standings;
    return true;
  }

  /** Remove the saved standings entry (reset / test teardown). */
  clearSaved(): void {
    this.slot.clear();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Rebuild `canDockAt` for every faction using the currently attached
   * `SolarSystemState`. Call after attaching or replacing the system state.
   */
  private rebuildAllCanDockAt(): void {
    const updated: Record<string, FactionStanding> = {};
    for (const [id, standing] of Object.entries(this.standings)) {
      updated[id] = {
        ...standing,
        canDockAt: buildCanDockAt(id, standing.reputation, this.systemState),
      };
    }
    this.standings = updated;
  }
}

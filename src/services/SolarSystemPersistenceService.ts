/**
 * SolarSystemPersistenceService — save and load solar system session state.
 *
 * Persists all space-combat session data to localStorage:
 *   - Player ship state (position, velocity, heading, health, shields, weapons)
 *   - Target lock status (locks, focused target)
 *   - Docking state (docked location, pre-dock snapshot)
 *   - Enemy station state (hull, shields, alert level, active ships)
 *   - Discovered locations
 *
 * Patterns mirrors MissionLogManager, FactionManager, and OverworldManager:
 * uses VersionedSlot for versioned storage with migration support.
 *
 * Persistence key: "rwipe.solarsystem.v1" (LocalStorageService).
 */

import type { CapitalShipState } from "../types/capital-ship";
import type { EnemyStationState } from "../types/combat";
import type { TargetingState } from "../systems/combat/types";
import type { PreDockSnapshot } from "../managers/DockingManager";
import type { StorageBackend } from "./LocalStorageService";
import {
  VersionedSlot,
  SOLAR_SYSTEM_STORAGE_KEY,
  SOLAR_SYSTEM_SCHEMA_VERSION,
  solarSystemMigrations,
} from "./LocalStorageService";

// ── Persisted shape ───────────────────────────────────────────────────────────

/**
 * Snapshot of all solar system session state ready for JSON serialization.
 * Mirrors SolarSystemSessionState but converts Set to array and includes
 * all persisted combat/targeting state.
 */
export interface PersistedSolarSystemState {
  // Player ship state
  shipState: CapitalShipState;

  // Targeting / lock state
  playerTargetingState?: TargetingState;

  // Docking state
  dockedLocationId: string | null;
  preDockSnapshot?: PreDockSnapshot | null;

  // Navigation
  primaryGravitySourceId: string;
  zoomLevel: number;
  discoveredLocations: string[]; // Set serialized as array

  // Enemy stations (hostile strongholds)
  enemyStationStates?: Record<string, EnemyStationState>;

  // Timestamp for debugging / reload detection
  savedAtMs: number;
}

// ── SolarSystemPersistenceService ─────────────────────────────────────────────

export class SolarSystemPersistenceService {
  private readonly slot: VersionedSlot<PersistedSolarSystemState>;

  /**
   * @param storageBackend  Inject InMemoryStorage in tests; undefined uses window.localStorage
   */
  constructor(storageBackend?: StorageBackend | null) {
    this.slot = new VersionedSlot<PersistedSolarSystemState>({
      key: SOLAR_SYSTEM_STORAGE_KEY,
      currentVersion: SOLAR_SYSTEM_SCHEMA_VERSION,
      migrations: solarSystemMigrations,
      storage: storageBackend ?? null,
      validate: (raw): raw is PersistedSolarSystemState =>
        typeof raw === "object" &&
        raw !== null &&
        "shipState" in raw &&
        "dockedLocationId" in raw &&
        "primaryGravitySourceId" in raw &&
        "zoomLevel" in raw &&
        "discoveredLocations" in raw &&
        "savedAtMs" in raw &&
        typeof raw.zoomLevel === "number" &&
        Array.isArray(raw.discoveredLocations) &&
        typeof raw.savedAtMs === "number",
    });
  }

  /**
   * Persist the current solar system session state.
   *
   * Accepts a snapshot containing:
   *   - Player ship configuration and position
   *   - All current target locks
   *   - Docking state + pre-dock snapshot (if docked)
   *   - Enemy station damage/alert state
   *   - Discovered locations
   *
   * Converts Set<string> (discoveredLocations) to array for JSON serialization.
   * Updates `savedAtMs` timestamp for reload detection.
   */
  save(state: PersistedSolarSystemState): void {
    const toSave: PersistedSolarSystemState = {
      ...state,
      savedAtMs: Date.now(),
    };
    this.slot.save(toSave);
  }

  /**
   * Load persisted solar system state from localStorage.
   *
   * Returns `null` if no save exists or storage is unavailable.
   * Throws `StorageMigrationError` if the stored version is incompatible
   * or validation fails.
   *
   * The caller is responsible for converting discoveredLocations back to a Set
   * and integrating it with the active SolarSystemSessionState.
   */
  load(): PersistedSolarSystemState | null {
    return this.slot.load();
  }

  /** Remove the stored save file. */
  clear(): void {
    this.slot.clear();
  }
}

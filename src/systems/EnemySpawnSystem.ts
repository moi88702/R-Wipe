/**
 * EnemySpawnSystem — manages hostile station alert states, ship-spawn waves,
 * damage application, and encounter lifecycle.
 *
 * All public methods are **pure functions**: they accept state, return new
 * state, and never mutate their inputs. The caller (typically GameManager or
 * a solar-system combat orchestrator) is responsible for:
 *   - Calling `updateAlertStates` each tick when the player moves.
 *   - Calling `escalateToCombat` after the alerted delay or when a station
 *     first fires at the player.
 *   - Calling `trySpawn` each combat tick and creating enemy entities at the
 *     returned positions.
 *   - Calling `registerSpawnedEnemies` with the new entity ids after creation.
 *   - Calling `onEnemyDestroyed` whenever any enemy entity is removed.
 *   - Calling `applyDamage` when the player's weapons hit a station.
 *   - Calling `rechargeShields` once per tick with the frame delta.
 *
 * Units: positions in km (world space), time in ms.
 */

import type {
  EnemyStationDefinition,
  EnemyStationState,
  StationAlertLevel,
} from "../types/combat";

// ── Result types ──────────────────────────────────────────────────────────────

/**
 * Returned by `EnemySpawnSystem.trySpawn`.
 */
export interface SpawnWaveResult {
  /** True when a spawn wave was triggered this call. */
  didSpawn: boolean;
  /**
   * World-space positions (km) for each ship in the wave.
   * Empty when `didSpawn` is false.
   */
  spawnPositions: ReadonlyArray<{ x: number; y: number }>;
  /**
   * Updated copy of the station state reflecting the new `lastSpawnAtMs`.
   * Discard the old state and use this one.
   *
   * Note: `activeEnemyIds` is NOT updated here — call
   * `registerSpawnedEnemies` once you have the real entity ids.
   */
  updatedState: EnemyStationState;
}

// ── EnemySpawnSystem ──────────────────────────────────────────────────────────

export class EnemySpawnSystem {
  // ── Alert management ────────────────────────────────────────────────────────

  /**
   * Scan all stations and transition any dormant station to "alerted" if the
   * player has entered its `alertRadiusKm`.
   *
   * Alert transitions are **one-way escalations**: alerted and combat stations
   * are never stepped back to dormant by this method. Destroyed stations are
   * left unchanged.
   *
   * @param playerPos   - Player capital ship position (km).
   * @param definitions - All station definitions (static; read-only).
   * @param states      - Current runtime states for all stations.
   * @returns A new array of states with updated `alertLevel` fields.
   */
  static updateAlertStates(
    playerPos: { x: number; y: number },
    definitions: readonly EnemyStationDefinition[],
    states: EnemyStationState[],
  ): EnemyStationState[] {
    const defMap = new Map<string, EnemyStationDefinition>(
      definitions.map((d) => [d.id, d]),
    );

    return states.map((state) => {
      if (state.isDestroyed) return state;
      if (state.alertLevel !== "dormant") return state; // already escalated

      const def = defMap.get(state.stationId);
      if (def === undefined) return state;

      const dx = playerPos.x - def.position.x;
      const dy = playerPos.y - def.position.y;
      const distanceSq = dx * dx + dy * dy;
      const alertRadiusSq = def.alertRadiusKm * def.alertRadiusKm;

      if (distanceSq <= alertRadiusSq) {
        return { ...state, alertLevel: "alerted" as StationAlertLevel };
      }

      return state;
    });
  }

  /**
   * Escalate a single station from "alerted" to "combat".
   *
   * Call this after the alert-to-combat delay has elapsed, or immediately when
   * the station takes damage or fires its first shot (designer choice).
   * Has no effect on dormant or already-in-combat stations.
   *
   * @param stationId - Id of the station to escalate.
   * @param states    - Current runtime states.
   * @returns Updated states array.
   */
  static escalateToCombat(
    stationId: string,
    states: EnemyStationState[],
  ): EnemyStationState[] {
    return states.map((state) => {
      if (state.stationId !== stationId) return state;
      if (state.isDestroyed) return state;
      if (state.alertLevel !== "alerted") return state;
      return { ...state, alertLevel: "combat" as StationAlertLevel };
    });
  }

  // ── Spawn management ────────────────────────────────────────────────────────

  /**
   * Attempt to spawn a wave of enemy ships from a single station.
   *
   * **Preconditions for a successful spawn** (all must hold):
   * 1. Station is not destroyed.
   * 2. Station `alertLevel` is `"combat"`.
   * 3. `currentTimeMs − lastSpawnAtMs ≥ spawnConfig.spawnIntervalMs`.
   * 4. `activeEnemyIds.length < spawnConfig.maxActiveShips`.
   *
   * The wave size is `min(shipsPerWave, maxActiveShips − activeEnemyIds.length)`.
   * Ship positions are scattered uniformly within `spawnRadiusKm` of the station
   * centre using the provided `rng` function.
   *
   * **Caller responsibilities after a successful spawn:**
   * - Create enemy entities at `result.spawnPositions`.
   * - Call `registerSpawnedEnemies(stationId, newIds, states)` with the real
   *   entity ids so the station can track its active fleet size.
   *
   * @param definition    - Static station definition (provides spawn config).
   * @param state         - Current runtime state (provides active enemy count).
   * @param currentTimeMs - Current simulation time (ms); compared to `lastSpawnAtMs`.
   * @param rng           - Deterministic or random `[0, 1)` source for position scatter.
   * @returns Spawn result: whether a wave fired, positions, and updated state.
   */
  static trySpawn(
    definition: EnemyStationDefinition,
    state: EnemyStationState,
    currentTimeMs: number,
    rng: () => number,
  ): SpawnWaveResult {
    const noSpawn: SpawnWaveResult = {
      didSpawn: false,
      spawnPositions: [],
      updatedState: state,
    };

    if (state.isDestroyed) return noSpawn;
    if (state.alertLevel !== "combat") return noSpawn;

    const cooldownElapsed =
      currentTimeMs - state.lastSpawnAtMs >= definition.spawnConfig.spawnIntervalMs;
    if (!cooldownElapsed) return noSpawn;

    const slotsAvailable =
      state.activeEnemyIds.length < definition.spawnConfig.maxActiveShips;
    if (!slotsAvailable) return noSpawn;

    // Wave size is limited by both the per-wave cap and available slots.
    const maxThisWave = Math.min(
      definition.spawnConfig.shipsPerWave,
      definition.spawnConfig.maxActiveShips - state.activeEnemyIds.length,
    );

    // Scatter positions uniformly within spawnRadiusKm.
    const spawnPositions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < maxThisWave; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = rng() * definition.spawnConfig.spawnRadiusKm;
      spawnPositions.push({
        x: definition.position.x + Math.cos(angle) * radius,
        y: definition.position.y + Math.sin(angle) * radius,
      });
    }

    const updatedState: EnemyStationState = {
      ...state,
      lastSpawnAtMs: currentTimeMs,
    };

    return { didSpawn: true, spawnPositions, updatedState };
  }

  /**
   * Register newly-spawned enemy entity ids with the station that created them.
   *
   * Must be called after `trySpawn` returns `didSpawn: true` and the caller
   * has created the actual enemy entities. Appends the ids to
   * `activeEnemyIds` so the station tracks its current fleet.
   *
   * @param stationId    - The station that spawned the wave.
   * @param newEnemyIds  - Ids of the freshly created enemy entities.
   * @param states       - Current runtime states.
   * @returns Updated states array.
   */
  static registerSpawnedEnemies(
    stationId: string,
    newEnemyIds: string[],
    states: EnemyStationState[],
  ): EnemyStationState[] {
    return states.map((state) => {
      if (state.stationId !== stationId) return state;
      return {
        ...state,
        activeEnemyIds: [...state.activeEnemyIds, ...newEnemyIds],
      };
    });
  }

  /**
   * Notify the system that an enemy entity was destroyed.
   *
   * Removes the given id from the `activeEnemyIds` list of whichever station
   * was tracking it. If the id is not present in any station's list, the call
   * is a no-op (safe to call for all enemy deaths without filtering).
   *
   * @param enemyId - Entity id of the destroyed enemy.
   * @param states  - Current runtime states.
   * @returns Updated states array.
   */
  static onEnemyDestroyed(
    enemyId: string,
    states: EnemyStationState[],
  ): EnemyStationState[] {
    return states.map((state) => {
      if (!state.activeEnemyIds.includes(enemyId)) return state;
      return {
        ...state,
        activeEnemyIds: state.activeEnemyIds.filter((id) => id !== enemyId),
      };
    });
  }

  // ── Damage ──────────────────────────────────────────────────────────────────

  /**
   * Apply damage to a station using the shield-before-hull model.
   *
   * Damage flow:
   * 1. Shields absorb as much damage as possible (`currentShield → 0`).
   * 2. Any remaining damage is applied to `currentHull`.
   * 3. If hull reaches 0 the station is destroyed: `isDestroyed = true`,
   *    `activeEnemyIds` is cleared, and `alertLevel` is frozen at `"combat"`.
   *
   * Calls against an already-destroyed station are no-ops.
   *
   * @param stationId - Target station id.
   * @param damage    - Raw damage to apply (positive number).
   * @param states    - Current runtime states.
   * @returns Updated states array.
   */
  static applyDamage(
    stationId: string,
    damage: number,
    states: EnemyStationState[],
  ): EnemyStationState[] {
    return states.map((state) => {
      if (state.stationId !== stationId) return state;
      if (state.isDestroyed) return state;

      let remaining = damage;
      let newShield = state.currentShield;
      let newHull = state.currentHull;

      // Step 1: shields absorb first.
      if (newShield > 0) {
        const absorbed = Math.min(newShield, remaining);
        newShield -= absorbed;
        remaining -= absorbed;
      }

      // Step 2: overflow hits hull.
      if (remaining > 0) {
        newHull = Math.max(0, newHull - remaining);
      }

      const isDestroyed = newHull <= 0;

      return {
        ...state,
        currentShield: newShield,
        currentHull: newHull,
        isDestroyed,
        // On destruction clear the fleet list so the caller knows no new
        // enemies should be expected from this station.
        activeEnemyIds: isDestroyed ? [] : state.activeEnemyIds,
        // Alert level stays at whatever it was; destruction freezes state.
        alertLevel: isDestroyed ? "combat" : state.alertLevel,
      };
    });
  }

  // ── Shield recharge ─────────────────────────────────────────────────────────

  /**
   * Passively recharge shields for all non-destroyed stations.
   *
   * Adds `shieldRechargeRatePerS × (deltaMs / 1000)` to each station's
   * `currentShield`, capped at `shieldCapacity`. Stations with
   * `shieldRechargeRatePerS === 0` and destroyed stations are skipped.
   *
   * @param deltaMs     - Elapsed frame time (ms).
   * @param definitions - Static definitions (provides recharge rates and caps).
   * @param states      - Current runtime states.
   * @returns Updated states array.
   */
  static rechargeShields(
    deltaMs: number,
    definitions: readonly EnemyStationDefinition[],
    states: EnemyStationState[],
  ): EnemyStationState[] {
    const defMap = new Map<string, EnemyStationDefinition>(
      definitions.map((d) => [d.id, d]),
    );

    return states.map((state) => {
      if (state.isDestroyed) return state;

      const def = defMap.get(state.stationId);
      if (def === undefined || def.shieldRechargeRatePerS <= 0) return state;
      if (state.currentShield >= def.shieldCapacity) return state;

      const recharge = def.shieldRechargeRatePerS * (deltaMs / 1000);
      const newShield = Math.min(def.shieldCapacity, state.currentShield + recharge);

      return { ...state, currentShield: newShield };
    });
  }

  // ── Query helpers ───────────────────────────────────────────────────────────

  /**
   * Return paired definitions and states for every non-dormant, non-destroyed
   * station (i.e. stations that are "alerted" or "combat").
   *
   * Use this to drive turret firing and spawn ticks: only active stations
   * need per-frame processing.
   *
   * @param definitions - All station definitions.
   * @param states      - Current runtime states.
   * @returns Paired records for active stations.
   */
  static getActiveStations(
    definitions: readonly EnemyStationDefinition[],
    states: EnemyStationState[],
  ): Array<{ definition: EnemyStationDefinition; state: EnemyStationState }> {
    const stateMap = new Map<string, EnemyStationState>(
      states.map((s) => [s.stationId, s]),
    );

    const result: Array<{ definition: EnemyStationDefinition; state: EnemyStationState }> = [];

    for (const def of definitions) {
      const state = stateMap.get(def.id);
      if (
        state !== undefined &&
        !state.isDestroyed &&
        state.alertLevel !== "dormant"
      ) {
        result.push({ definition: def, state });
      }
    }

    return result;
  }

  /**
   * Return every station definition whose `alertRadiusKm` encloses the player.
   *
   * Useful for drawing approach indicators or pre-alerting the player that
   * hostiles are nearby before the station formally transitions to alerted.
   *
   * @param playerPos   - Player position (km).
   * @param definitions - All station definitions.
   * @returns Stations whose alert radius contains the player.
   */
  static getStationsInAlertRange(
    playerPos: { x: number; y: number },
    definitions: readonly EnemyStationDefinition[],
  ): EnemyStationDefinition[] {
    return definitions.filter((def) => {
      const dx = playerPos.x - def.position.x;
      const dy = playerPos.y - def.position.y;
      return dx * dx + dy * dy <= def.alertRadiusKm * def.alertRadiusKm;
    });
  }
}

/**
 * registryValidator — build-time / test-time cross-reference checker.
 *
 * Validates that every id referenced across the data registries resolves to a
 * real entry.  The function has no side-effects and returns an array of
 * structured error objects so callers can decide how to surface them (throw,
 * log, assert in tests, etc.).
 *
 * Checked cross-references:
 *   FactionRegistry.baselineNpcs       → NPCRegistry
 *   FactionRegistry.baselineLocations  → LocationRegistry
 *   LocationRegistry.npcs              → NPCRegistry
 *   LocationRegistry.requiredMissions  → MissionRegistry
 *   MissionRegistry.npcId             → NPCRegistry
 *   MissionRegistry.destinationLocationId (courier) → LocationRegistry
 *   MissionRegistry.rewardMissionUnlock → MissionRegistry
 *   NPCRegistry.missionIds            → MissionRegistry
 *
 * Note: shop ids have no registry to validate against and are intentionally
 * excluded.
 *
 * Usage (in tests):
 *   import { validateRegistryReferences } from "./registryValidator";
 *   const errors = validateRegistryReferences();
 *   expect(errors).toEqual([]);
 */

import { FactionRegistry } from "./FactionRegistry";
import { LocationRegistry } from "./LocationRegistry";
import { MissionRegistry } from "./MissionRegistry";
import { NPCRegistry } from "./NPCRegistry";

// ── Error shape ───────────────────────────────────────────────────────────────

export interface RegistryValidationError {
  /** The registry that owns the entity with the broken reference. */
  registry: string;
  /** Id of the entity that has the broken reference. */
  entityId: string;
  /** Field on that entity that holds the broken id. */
  field: string;
  /** The id that could not be resolved. */
  missingRef: string;
  /** The registry we expected the id to exist in. */
  expectedIn: string;
}

// ── Validator ─────────────────────────────────────────────────────────────────

/**
 * Checks every cross-registry reference and returns a (possibly empty) list
 * of errors.  An empty array means all references resolve successfully.
 */
export function validateRegistryReferences(): RegistryValidationError[] {
  const errors: RegistryValidationError[] = [];

  const npcIds = new Set(NPCRegistry.getAllNPCIds());
  const locationIds = new Set(LocationRegistry.getAllLocationIds());
  const missionIds = new Set(MissionRegistry.getAllMissionIds());

  // ── FactionRegistry ────────────────────────────────────────────────────────

  for (const faction of FactionRegistry.getAllFactions()) {
    for (const npcId of faction.baselineNpcs) {
      if (!npcIds.has(npcId)) {
        errors.push({
          registry: "FactionRegistry",
          entityId: faction.id,
          field: "baselineNpcs",
          missingRef: npcId,
          expectedIn: "NPCRegistry",
        });
      }
    }

    for (const locationId of faction.baselineLocations) {
      if (!locationIds.has(locationId)) {
        errors.push({
          registry: "FactionRegistry",
          entityId: faction.id,
          field: "baselineLocations",
          missingRef: locationId,
          expectedIn: "LocationRegistry",
        });
      }
    }
  }

  // ── LocationRegistry ───────────────────────────────────────────────────────

  for (const location of LocationRegistry.getAllLocations()) {
    for (const npcId of location.npcs) {
      if (!npcIds.has(npcId)) {
        errors.push({
          registry: "LocationRegistry",
          entityId: location.id,
          field: "npcs",
          missingRef: npcId,
          expectedIn: "NPCRegistry",
        });
      }
    }

    for (const missionId of location.requiredMissions ?? []) {
      if (!missionIds.has(missionId)) {
        errors.push({
          registry: "LocationRegistry",
          entityId: location.id,
          field: "requiredMissions",
          missingRef: missionId,
          expectedIn: "MissionRegistry",
        });
      }
    }
  }

  // ── MissionRegistry ────────────────────────────────────────────────────────

  for (const mission of MissionRegistry.getAllMissions()) {
    if (!npcIds.has(mission.npcId)) {
      errors.push({
        registry: "MissionRegistry",
        entityId: mission.id,
        field: "npcId",
        missingRef: mission.npcId,
        expectedIn: "NPCRegistry",
      });
    }

    if (mission.destinationLocationId !== undefined) {
      if (!locationIds.has(mission.destinationLocationId)) {
        errors.push({
          registry: "MissionRegistry",
          entityId: mission.id,
          field: "destinationLocationId",
          missingRef: mission.destinationLocationId,
          expectedIn: "LocationRegistry",
        });
      }
    }

    for (const unlockId of mission.rewardMissionUnlock ?? []) {
      if (!missionIds.has(unlockId)) {
        errors.push({
          registry: "MissionRegistry",
          entityId: mission.id,
          field: "rewardMissionUnlock",
          missingRef: unlockId,
          expectedIn: "MissionRegistry",
        });
      }
    }
  }

  // ── NPCRegistry ────────────────────────────────────────────────────────────

  for (const npc of NPCRegistry.getAllNPCs()) {
    for (const missionId of npc.missionIds) {
      if (!missionIds.has(missionId)) {
        errors.push({
          registry: "NPCRegistry",
          entityId: npc.id,
          field: "missionIds",
          missingRef: missionId,
          expectedIn: "MissionRegistry",
        });
      }
    }
  }

  return errors;
}

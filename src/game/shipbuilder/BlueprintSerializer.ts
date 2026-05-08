/**
 * BlueprintSerializer — JSON encode / decode for SolarShipBlueprint.
 *
 * Wire format:
 *   { "v": 1, "blueprint": <SolarShipBlueprint> }
 *
 * Throws on malformed JSON, missing required fields, or schema version mismatch.
 */

import type { SolarShipBlueprint } from "../../types/solarShipBuilder";

const SCHEMA_VERSION = 1;

interface WireFormat {
  v: number;
  blueprint: SolarShipBlueprint;
}

export const BlueprintSerializer = {

  serialize(blueprint: SolarShipBlueprint): string {
    const wire: WireFormat = { v: SCHEMA_VERSION, blueprint };
    return JSON.stringify(wire);
  },

  deserialize(json: string): SolarShipBlueprint {
    let wire: unknown;
    try {
      wire = JSON.parse(json);
    } catch {
      throw new Error("BlueprintSerializer: invalid JSON");
    }

    if (!wire || typeof wire !== "object") {
      throw new Error("BlueprintSerializer: expected object");
    }
    const w = wire as Record<string, unknown>;

    if (w["v"] !== SCHEMA_VERSION) {
      throw new Error(`BlueprintSerializer: unsupported schema version ${String(w["v"])}`);
    }

    const bp = w["blueprint"];
    if (!bp || typeof bp !== "object") {
      throw new Error("BlueprintSerializer: missing blueprint field");
    }
    const b = bp as Record<string, unknown>;

    if (typeof b["id"] !== "string" || typeof b["name"] !== "string") {
      throw new Error("BlueprintSerializer: missing id or name");
    }
    if (!Array.isArray(b["modules"])) {
      throw new Error("BlueprintSerializer: modules must be an array");
    }
    if (typeof b["coreSideCount"] !== "number") {
      throw new Error("BlueprintSerializer: missing coreSideCount");
    }

    return bp as SolarShipBlueprint;
  },

  /**
   * Compare a blueprint's module list against an inventory map (defId → qty owned).
   * Returns entries for modules where the needed quantity exceeds what's in inventory.
   */
  diffAgainstInventory(
    blueprint: SolarShipBlueprint,
    inventory: ReadonlyMap<string, number>,
  ): Array<{ moduleDefId: string; need: number; have: number }> {
    const needed = new Map<string, number>();
    for (const placed of blueprint.modules) {
      needed.set(placed.moduleDefId, (needed.get(placed.moduleDefId) ?? 0) + 1);
    }
    const shortfall: Array<{ moduleDefId: string; need: number; have: number }> = [];
    for (const [defId, need] of needed) {
      const have = inventory.get(defId) ?? 0;
      if (have < need) shortfall.push({ moduleDefId: defId, need, have });
    }
    return shortfall;
  },

} as const;

/**
 * BlueprintStore — persistent catalogue of the player's saved ship
 * blueprints. Thin wrapper over VersionedSlot that exposes list / upsert /
 * delete operations, plus a typed validator so corrupt saves throw
 * StorageMigrationError instead of silently producing invalid Blueprints.
 *
 * Pure logic — no Pixi. The campaign uses this alongside the OverworldManager
 * (which holds the equippedBlueprintId) to drive the shipyard screen.
 */

import type { Blueprint, PlacedPart } from "../types/shipBuilder";
import {
  type StorageBackend,
  VersionedSlot,
} from "../services/LocalStorageService";

export const BLUEPRINT_SCHEMA_VERSION = 1 as const;
export const BLUEPRINT_STORAGE_KEY = "rwipe.blueprints.v1";

interface BlueprintPayload {
  blueprints: Blueprint[];
}

function isPlacedPart(raw: unknown): raw is PlacedPart {
  if (typeof raw !== "object" || raw === null) return false;
  const p = raw as Record<string, unknown>;
  return (
    typeof p["id"] === "string" &&
    typeof p["partId"] === "string" &&
    (p["parentId"] === null || typeof p["parentId"] === "string") &&
    (p["parentSocketId"] === null || typeof p["parentSocketId"] === "string") &&
    (p["colourId"] === null || typeof p["colourId"] === "string")
  );
}

function isBlueprint(raw: unknown): raw is Blueprint {
  if (typeof raw !== "object" || raw === null) return false;
  const b = raw as Record<string, unknown>;
  return (
    typeof b["id"] === "string" &&
    typeof b["name"] === "string" &&
    Array.isArray(b["parts"]) &&
    (b["parts"] as unknown[]).every(isPlacedPart)
  );
}

function isPayload(raw: unknown): raw is BlueprintPayload {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "blueprints" in raw &&
    Array.isArray((raw as { blueprints: unknown }).blueprints) &&
    ((raw as { blueprints: unknown[] }).blueprints as unknown[]).every(isBlueprint)
  );
}

export class BlueprintStore {
  private blueprints: Blueprint[] = [];
  private readonly slot: VersionedSlot<BlueprintPayload>;

  constructor(storage?: StorageBackend | null) {
    this.slot = new VersionedSlot<BlueprintPayload>({
      key: BLUEPRINT_STORAGE_KEY,
      currentVersion: BLUEPRINT_SCHEMA_VERSION,
      storage: storage ?? null,
      validate: isPayload,
    });
  }

  list(): ReadonlyArray<Blueprint> {
    return this.blueprints;
  }

  get(id: string): Blueprint | undefined {
    return this.blueprints.find((b) => b.id === id);
  }

  /** Insert or replace a blueprint (matched by `id`). */
  upsert(bp: Blueprint): void {
    const idx = this.blueprints.findIndex((b) => b.id === bp.id);
    if (idx < 0) {
      this.blueprints = [...this.blueprints, bp];
    } else {
      const next = [...this.blueprints];
      next[idx] = bp;
      this.blueprints = next;
    }
  }

  delete(id: string): boolean {
    const before = this.blueprints.length;
    this.blueprints = this.blueprints.filter((b) => b.id !== id);
    return this.blueprints.length < before;
  }

  save(): void {
    this.slot.save({ blueprints: this.blueprints });
  }

  /** Returns true if saved data was loaded. Throws on schema failure. */
  load(): boolean {
    const raw = this.slot.load();
    if (!raw) return false;
    this.blueprints = raw.blueprints;
    return true;
  }

  clearSaved(): void {
    this.slot.clear();
  }

  resetForTest(): void {
    this.blueprints = [];
  }
}

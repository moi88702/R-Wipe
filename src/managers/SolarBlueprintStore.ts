import type { PlacedSolarModule, SolarShipBlueprint } from "../types/solarShipBuilder";
import { VersionedSlot, defaultStorage } from "../services/LocalStorageService";
import type { StorageBackend } from "../services/LocalStorageService";
import type { ModuleHpEntry } from "../systems/ModuleHpSystem";

export const SOLAR_BLUEPRINT_STORAGE_KEY = "rwipe.solar-ships.v1";

export interface SquadDefinition {
  name: string;
  botIds: string[];
}

const DEFAULT_SQUADS: SquadDefinition[] = [
  { name: "ALPHA", botIds: [] },
  { name: "BETA",  botIds: [] },
  { name: "GAMMA", botIds: [] },
];

interface SolarBlueprintPayload {
  activeId: string | null;
  blueprints: SolarShipBlueprint[];
  /** Persisted cargo inventory: moduleDefId → quantity. */
  inventory: Record<string, number>;
  /** Persisted player credits. */
  credits?: number;
  /** Per-ship damage state: blueprintId → ModuleHpEntry[]. */
  shipHpStates?: Record<string, ModuleHpEntry[]>;
  /** Per-station item storage: locationId → (moduleDefId → qty). */
  stationHangars?: Record<string, Record<string, number>>;
  /** Named squad presets (always 3 slots). */
  squads?: SquadDefinition[];
}

function isPlacedSolarModule(raw: unknown): raw is PlacedSolarModule {
  if (typeof raw !== "object" || raw === null) return false;
  const m = raw as Record<string, unknown>;
  return (
    typeof m["placedId"] === "string" &&
    typeof m["moduleDefId"] === "string" &&
    (m["parentPlacedId"] === null || typeof m["parentPlacedId"] === "string") &&
    (m["parentSideIndex"] === null || typeof m["parentSideIndex"] === "number") &&
    (m["ownSideIndex"] === null || typeof m["ownSideIndex"] === "number")
  );
}

function isSolarBlueprint(raw: unknown): raw is SolarShipBlueprint {
  if (typeof raw !== "object" || raw === null) return false;
  const b = raw as Record<string, unknown>;
  return (
    typeof b["id"] === "string" &&
    typeof b["name"] === "string" &&
    typeof b["sizeClass"] === "number" &&
    typeof b["coreSideCount"] === "number" &&
    Array.isArray(b["modules"]) &&
    (b["modules"] as unknown[]).every(isPlacedSolarModule)
  );
}

function isPayload(raw: unknown): raw is SolarBlueprintPayload {
  if (typeof raw !== "object" || raw === null) return false;
  const p = raw as Record<string, unknown>;
  if (!(p["activeId"] === null || typeof p["activeId"] === "string")) return false;
  if (!Array.isArray(p["blueprints"])) return false;
  if (!(p["blueprints"] as unknown[]).every(isSolarBlueprint)) return false;
  // inventory is optional in old saves — tolerate its absence
  if (p["inventory"] !== undefined) {
    if (typeof p["inventory"] !== "object" || p["inventory"] === null) return false;
    for (const v of Object.values(p["inventory"] as object)) {
      if (typeof v !== "number") return false;
    }
  }
  return true;
}

export class SolarBlueprintStore {
  private _blueprints: SolarShipBlueprint[] = [];
  private _activeId: string | null = null;
  private _inventory: Record<string, number> = {};
  private _credits: number | null = null;
  private _shipHpStates: Record<string, ModuleHpEntry[]> = {};
  private _stationHangars: Record<string, Record<string, number>> = {};
  private _squads: SquadDefinition[] = DEFAULT_SQUADS.map(s => ({ ...s }));
  private readonly slot: VersionedSlot<SolarBlueprintPayload>;

  constructor(storage?: StorageBackend | null) {
    this.slot = new VersionedSlot<SolarBlueprintPayload>({
      key: SOLAR_BLUEPRINT_STORAGE_KEY,
      currentVersion: 1,
      storage: storage !== undefined ? storage : defaultStorage(),
      validate: isPayload,
    });
  }

  list(): ReadonlyArray<SolarShipBlueprint> {
    return this._blueprints;
  }

  getActiveId(): string | null {
    return this._activeId;
  }

  setActiveId(id: string | null): void {
    this._activeId = id;
  }

  /** Returns the persisted inventory (moduleDefId → quantity). */
  getInventory(): Readonly<Record<string, number>> {
    return this._inventory;
  }

  /** Overwrites the in-memory inventory (call save() to persist). */
  setInventory(inv: Record<string, number>): void {
    this._inventory = { ...inv };
  }

  /** True if at least one inventory entry has been saved (used to distinguish "first play" from "empty cargo"). */
  hasInventory(): boolean {
    return Object.keys(this._inventory).length > 0;
  }

  /** Returns the persisted credits, or null if never saved. */
  getCredits(): number | null {
    return this._credits;
  }

  /** Overwrites the in-memory credits (call save() to persist). */
  setCredits(credits: number): void {
    this._credits = credits;
  }

  /** Returns saved HP state for a blueprint, or null if none recorded. */
  getShipHpState(blueprintId: string): ModuleHpEntry[] | null {
    return this._shipHpStates[blueprintId] ?? null;
  }

  /** Records HP state for a blueprint (call save() to persist). */
  setShipHpState(blueprintId: string, entries: ModuleHpEntry[]): void {
    this._shipHpStates = { ...this._shipHpStates, [blueprintId]: entries };
  }

  /** Removes HP state for a deleted blueprint. */
  removeShipHpState(blueprintId: string): void {
    const next = { ...this._shipHpStates };
    delete next[blueprintId];
    this._shipHpStates = next;
  }

  /** Returns all persisted station hangars. */
  getStationHangars(): Readonly<Record<string, Record<string, number>>> {
    return this._stationHangars;
  }

  /** Overwrites all station hangars (call save() to persist). */
  setStationHangars(hangars: Record<string, Record<string, number>>): void {
    this._stationHangars = { ...hangars };
  }

  /** Returns the 3 named squad presets. */
  getSquads(): readonly SquadDefinition[] {
    return this._squads;
  }

  /** Overwrites a single squad slot (index 0-2) and keeps the 3-slot invariant. */
  setSquad(index: number, squad: SquadDefinition): void {
    const next = [...this._squads];
    while (next.length < 3) next.push({ name: "SQUAD", botIds: [] });
    if (index >= 0 && index < next.length) next[index] = { ...squad };
    this._squads = next;
  }

  upsert(bp: SolarShipBlueprint): void {
    const idx = this._blueprints.findIndex((b) => b.id === bp.id);
    if (idx < 0) {
      this._blueprints = [...this._blueprints, bp];
    } else {
      const next = [...this._blueprints];
      next[idx] = bp;
      this._blueprints = next;
    }
  }

  delete(id: string): boolean {
    const before = this._blueprints.length;
    this._blueprints = this._blueprints.filter((b) => b.id !== id);
    if (this._activeId === id) {
      this._activeId = this._blueprints[0]?.id ?? null;
    }
    this.removeShipHpState(id);
    return this._blueprints.length < before;
  }

  save(): void {
    const payload: SolarBlueprintPayload = {
      activeId: this._activeId,
      blueprints: this._blueprints,
      inventory: this._inventory,
    };
    if (this._credits !== null) payload.credits = this._credits;
    if (Object.keys(this._shipHpStates).length > 0) payload.shipHpStates = this._shipHpStates;
    if (Object.keys(this._stationHangars).length > 0) payload.stationHangars = this._stationHangars;
    if (this._squads.some(s => s.botIds.length > 0)) payload.squads = this._squads;
    this.slot.save(payload);
  }

  load(): boolean {
    const raw = this.slot.load();
    if (!raw) return false;
    this._blueprints = raw.blueprints;
    this._activeId = raw.activeId;
    this._inventory = raw.inventory ?? {};
    this._credits = raw.credits ?? null;
    this._shipHpStates = raw.shipHpStates ?? {};
    this._stationHangars = raw.stationHangars ?? {};
    if (raw.squads && raw.squads.length >= 3) {
      this._squads = raw.squads.slice(0, 3).map((s, i) => ({
        name: s.name || DEFAULT_SQUADS[i]!.name,
        botIds: Array.isArray(s.botIds) ? s.botIds : [],
      }));
    }
    return true;
  }

  clearSaved(): void {
    this.slot.clear();
  }

  resetForTest(): void {
    this._blueprints = [];
    this._activeId = null;
    this._inventory = {};
    this._credits = null;
    this._shipHpStates = {};
    this._stationHangars = {};
    this._squads = DEFAULT_SQUADS.map(s => ({ ...s }));
  }
}

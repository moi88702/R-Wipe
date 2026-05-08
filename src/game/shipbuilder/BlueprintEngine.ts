/**
 * BlueprintEngine — mutable session for building / editing a SolarShipBlueprint.
 *
 * Owns one blueprint and recomputes budget state from scratch on every query
 * (avoids drift from incremental tracking; 50-part ships are trivially fast).
 *
 * Usage:
 *   const engine = BlueprintEngine.create("core-c1-balanced", 6, "My Frigate");
 *   const { placedId } = engine.placeModule(def, parentId, parentSideIdx, ownSideIdx);
 *   engine.removeModule(placedId);   // removes subtree
 *   const bp = engine.getBlueprint(); // ready for serialisation
 */

import type {
  SolarModuleDefinition,
  CoreDefinition,
  SolarShipBlueprint,
  PlacedSolarModule,
  BudgetState,
  PlaceResult,
} from "../../types/solarShipBuilder";
import { SolarModuleRegistry } from "../data/SolarModuleRegistry";

function uid(): string {
  return `pm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function blueprintUid(): string {
  return `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class BlueprintEngine {
  private blueprint: SolarShipBlueprint;
  private readonly defs: ReadonlyMap<string, SolarModuleDefinition>;

  private constructor(blueprint: SolarShipBlueprint) {
    this.blueprint = blueprint;
    this.defs = SolarModuleRegistry.getModuleMap();
  }

  // ── Factory ─────────────────────────────────────────────────────────────────

  /** Create a brand-new ship with just a core placed at the origin. */
  static create(
    coreDefId: string,
    coreSideCount: number,
    name = "New Ship",
  ): BlueprintEngine {
    const def = SolarModuleRegistry.getModule(coreDefId);
    if (!def || def.type !== "core") throw new Error(`Not a core module: ${coreDefId}`);
    const coreDef = def as CoreDefinition;
    const clampedSides = Math.max(3, Math.min(20, coreSideCount));
    const blueprint: SolarShipBlueprint = {
      id: blueprintUid(),
      name,
      sizeClass: coreDef.sizeClass,
      coreSideCount: clampedSides,
      modules: [
        {
          placedId: "core",
          moduleDefId: coreDefId,
          parentPlacedId: null,
          parentSideIndex: null,
          ownSideIndex: null,
        },
      ],
    };
    return new BlueprintEngine(blueprint);
  }

  /** Load an existing blueprint into an engine for editing. */
  static load(blueprint: SolarShipBlueprint): BlueprintEngine {
    return new BlueprintEngine({
      ...blueprint,
      modules: [...blueprint.modules],
    });
  }

  // ── Accessors ───────────────────────────────────────────────────────────────

  getBlueprint(): SolarShipBlueprint {
    return this.blueprint;
  }

  rename(name: string): void {
    const trimmed = name.trim();
    if (trimmed) this.blueprint = { ...this.blueprint, name: trimmed };
  }

  getBudget(): BudgetState {
    return this.computeBudget();
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  canPlace(
    def: SolarModuleDefinition,
    parentPlacedId: string,
    parentSideIndex: number,
  ): PlaceResult {
    const parent = this.blueprint.modules.find(m => m.placedId === parentPlacedId);
    if (!parent) return { ok: false, reason: "no-such-parent" };

    // Side already occupied?
    const sideOccupied = this.blueprint.modules.some(
      m => m.parentPlacedId === parentPlacedId && m.parentSideIndex === parentSideIndex,
    );
    if (sideOccupied) return { ok: false, reason: "side-occupied" };

    // Size class must match parent's def
    const parentDef = this.defs.get(parent.moduleDefId);
    if (!parentDef || parentDef.sizeClass !== def.sizeClass) {
      return { ok: false, reason: "size-mismatch" };
    }

    const budget = this.computeBudget();

    if (budget.partsUsed >= budget.partsMax) return { ok: false, reason: "part-limit" };

    switch (def.type) {
      case "weapon":
        if (budget.weaponUsed >= budget.weaponTotal) return { ok: false, reason: "budget" };
        break;
      case "external":
        if (budget.externalUsed >= budget.externalTotal) return { ok: false, reason: "budget" };
        break;
      case "internal":
        if (budget.internalUsed >= budget.internalTotal) return { ok: false, reason: "budget" };
        break;
      case "converter": {
        const cost = def.converterSpec?.converterBudgetCost ?? 5;
        if (budget.converterUsed + cost > budget.converterTotal) {
          return { ok: false, reason: "budget" };
        }
        break;
      }
      default:
        break; // structure and core: no budget check
    }

    return { ok: true };
  }

  // ── Mutations ───────────────────────────────────────────────────────────────

  placeModule(
    def: SolarModuleDefinition,
    parentPlacedId: string,
    parentSideIndex: number,
    ownSideIndex: number,
  ): { placedId: string; budget: BudgetState } {
    const newModule: PlacedSolarModule = {
      placedId: uid(),
      moduleDefId: def.id,
      parentPlacedId,
      parentSideIndex,
      ownSideIndex,
    };
    this.blueprint = {
      ...this.blueprint,
      modules: [...this.blueprint.modules, newModule],
    };
    return { placedId: newModule.placedId, budget: this.computeBudget() };
  }

  /** Remove a module and its entire subtree. The core module cannot be removed. */
  removeModule(placedId: string): BudgetState {
    if (placedId === "core") return this.computeBudget();

    const toRemove = new Set<string>();
    const queue = [placedId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      toRemove.add(id);
      for (const m of this.blueprint.modules) {
        if (m.parentPlacedId === id) queue.push(m.placedId);
      }
    }
    this.blueprint = {
      ...this.blueprint,
      modules: this.blueprint.modules.filter(m => !toRemove.has(m.placedId)),
    };
    return this.computeBudget();
  }

  // ── Budget computation ──────────────────────────────────────────────────────

  private computeBudget(): BudgetState {
    const empty: BudgetState = {
      weaponUsed: 0, weaponTotal: 0,
      externalUsed: 0, externalTotal: 0,
      internalUsed: 0, internalTotal: 0,
      converterUsed: 0, converterTotal: 0,
      partsUsed: 0, partsMax: 50,
    };

    const coreModule = this.blueprint.modules.find(m => {
      const d = this.defs.get(m.moduleDefId);
      return d?.type === "core";
    });
    if (!coreModule) return empty;

    const coreDef = this.defs.get(coreModule.moduleDefId) as CoreDefinition | undefined;
    if (!coreDef) return empty;

    let weaponTotal = coreDef.weaponPoints;
    let externalTotal = coreDef.externalPoints;
    let internalTotal = coreDef.internalPoints;
    let weaponUsed = 0;
    let externalUsed = 0;
    let internalUsed = 0;
    let converterUsed = 0;

    for (const placed of this.blueprint.modules) {
      const def = this.defs.get(placed.moduleDefId);
      if (!def || def.type === "core") continue;

      switch (def.type) {
        case "weapon":   weaponUsed   += def.budgetCost; break;
        case "external": externalUsed += def.budgetCost; break;
        case "internal": internalUsed += def.budgetCost; break;
        case "converter": {
          const spec = def.converterSpec;
          if (spec) {
            converterUsed += spec.converterBudgetCost;
            if (spec.fromType === "weapon")   weaponTotal--;
            if (spec.fromType === "external") externalTotal--;
            if (spec.fromType === "internal") internalTotal--;
            if (spec.toType   === "weapon")   weaponTotal++;
            if (spec.toType   === "external") externalTotal++;
            if (spec.toType   === "internal") internalTotal++;
          }
          break;
        }
        default: break; // structure: free
      }
    }

    return {
      weaponUsed, weaponTotal,
      externalUsed, externalTotal,
      internalUsed, internalTotal,
      converterUsed, converterTotal: coreDef.converterPoints,
      partsUsed: this.blueprint.modules.length,
      partsMax: coreDef.maxParts,
    };
  }
}

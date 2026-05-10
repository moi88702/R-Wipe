/**
 * ModuleHpSystem — per-module HP tracking, damage resolution, and destruction cascade.
 *
 * All methods are pure (no I/O, no Pixi). Callers own all state arrays and pass
 * them in; results are returned as new arrays (no mutation of inputs).
 *
 * Coordinate convention for bounding circles: blueprint-pixel space (local to
 * the ship's centre). The caller converts to world km via `kmPerBp`.
 */

import type { SolarShipBlueprint, SolarModuleDefinition } from "../types/solarShipBuilder";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ModuleHpEntry {
  readonly placedId: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly isDestroyed: boolean;
}

export interface ShipEffectiveStats {
  /** Sum of all surviving engine thrustMs2. 0 when stranded. */
  readonly totalThrustMs2: number;
  /** Core base + all surviving sensor sensorRangeKm. */
  readonly scannerRangeKm: number;
  /** Sum of surviving targeting-sensor lockRangeBoostKm. */
  readonly lockRangeBoostKm: number;
  /** Sum of surviving multi-lock sensor additionalTargetSlots. */
  readonly additionalTargetSlots: number;
  /** Flat HP absorbed from every incoming hit (half-life stacked). */
  readonly damageReduction: number;
  /** HP/sec restored to damaged modules; 0 when no repair bots survive. */
  readonly repairRatePerSec: number;
  /** Power/sec consumed when repairing. */
  readonly repairPowerCost: number;
  /** Additive fractional bonus to base turn rate (0 = none). Hook for future gyro/RCS modules. */
  readonly turnRateBoostFrac: number;
}

// ── Module HP system ──────────────────────────────────────────────────────────

export class ModuleHpSystem {

  // ── Initialization ──────────────────────────────────────────────────────────

  /**
   * Build initial HP entries for every module in `bp`.
   * Bond armor neighbours get their `connectedHpBonus` at spawn.
   */
  static initModuleHp(
    bp: SolarShipBlueprint,
    defs: ReadonlyMap<string, SolarModuleDefinition>,
  ): ModuleHpEntry[] {
    // Build adjacency: placedId → [parent, ...children]
    const neighbors = new Map<string, string[]>();
    for (const m of bp.modules) {
      if (!neighbors.has(m.placedId)) neighbors.set(m.placedId, []);
      if (m.parentPlacedId) {
        neighbors.get(m.placedId)!.push(m.parentPlacedId);
        if (!neighbors.has(m.parentPlacedId)) neighbors.set(m.parentPlacedId, []);
        neighbors.get(m.parentPlacedId)!.push(m.placedId);
      }
    }

    // First pass: base HP per module
    const baseHpMap = new Map<string, number>();
    for (const m of bp.modules) {
      const def = defs.get(m.moduleDefId);
      const sizeClass = def?.sizeClass ?? 1;
      // Cores use registry hp; all others use formula + optional hp stat bonus
      const base = def?.stats.hp ?? ModuleHpSystem.baseHp(sizeClass);
      baseHpMap.set(m.placedId, base);
    }

    // Second pass: accumulate bond armor bonuses onto neighbours
    const bonusMap = new Map<string, number>();
    for (const m of bp.modules) {
      const def = defs.get(m.moduleDefId);
      const bonus = def?.stats.connectedHpBonus;
      if (!bonus) continue;
      for (const nid of neighbors.get(m.placedId) ?? []) {
        bonusMap.set(nid, (bonusMap.get(nid) ?? 0) + bonus);
      }
    }

    return bp.modules.map(m => {
      const base = baseHpMap.get(m.placedId) ?? 10;
      const bonus = bonusMap.get(m.placedId) ?? 0;
      const maxHp = base + bonus;
      return { placedId: m.placedId, hp: maxHp, maxHp, isDestroyed: false };
    });
  }

  /** Base HP derived from size class when no explicit `hp` stat is present. */
  static baseHp(sizeClass: number): number {
    return Math.round(40 * Math.pow(sizeClass, 1.5));
  }

  // ── Effective stats ─────────────────────────────────────────────────────────

  /**
   * Recompute stats from surviving (non-destroyed) modules.
   * `baseScannerRangeKm` is the core's intrinsic range before sensor bonuses.
   */
  static computeEffectiveStats(
    bp: SolarShipBlueprint,
    moduleHp: readonly ModuleHpEntry[],
    defs: ReadonlyMap<string, SolarModuleDefinition>,
    baseScannerRangeKm: number,
  ): ShipEffectiveStats {
    const destroyed = new Set(moduleHp.filter(e => e.isDestroyed).map(e => e.placedId));
    const armorValues: number[] = [];
    let totalThrustMs2 = 0;
    let scannerRangeKm = baseScannerRangeKm;
    let lockRangeBoostKm = 0;
    let additionalTargetSlots = 0;
    let repairRatePerSec = 0;
    let repairPowerCost = 0;

    for (const m of bp.modules) {
      if (destroyed.has(m.placedId)) continue;
      const s = defs.get(m.moduleDefId)?.stats;
      if (!s) continue;
      if (s.armor             !== undefined) armorValues.push(s.armor);
      if (s.thrustMs2         !== undefined) totalThrustMs2        += s.thrustMs2;
      if (s.sensorRangeKm     !== undefined) scannerRangeKm        += s.sensorRangeKm;
      if (s.lockRangeBoostKm  !== undefined) lockRangeBoostKm      += s.lockRangeBoostKm;
      if (s.additionalTargetSlots !== undefined) additionalTargetSlots += s.additionalTargetSlots;
      if (s.repairRatePerSec  !== undefined) repairRatePerSec      += s.repairRatePerSec;
      if (s.repairPowerCost   !== undefined) repairPowerCost       += s.repairPowerCost;
    }

    return {
      totalThrustMs2,
      scannerRangeKm,
      lockRangeBoostKm,
      additionalTargetSlots,
      damageReduction: ModuleHpSystem.stackedDamageReduction(armorValues),
      repairRatePerSec,
      repairPowerCost,
      turnRateBoostFrac: 0, // reserved for future gyro/RCS modules
    };
  }

  /**
   * Half-life stacking: sort armor values descending, each successive module
   * contributes 30% of the previous one's rate.
   *   total = Σ armor_i × 0.3^i   (sorted descending)
   */
  static stackedDamageReduction(armorValues: number[]): number {
    if (armorValues.length === 0) return 0;
    return [...armorValues]
      .sort((a, b) => b - a)
      .reduce((sum, v, i) => sum + v * Math.pow(0.3, i), 0);
  }

  // ── Damage application ──────────────────────────────────────────────────────

  /**
   * Apply `rawDamage` to module `placedId`, after subtracting ship-wide
   * `damageReduction`.  Returns updated entries and list of IDs that just
   * hit zero HP (before cascade).
   */
  static applyHit(
    moduleHp: readonly ModuleHpEntry[],
    placedId: string,
    rawDamage: number,
    effectiveStats: ShipEffectiveStats,
  ): { entries: ModuleHpEntry[]; newlyDestroyed: string[] } {
    const damage = Math.max(0, rawDamage - effectiveStats.damageReduction);
    let justDestroyed = false;

    const entries = moduleHp.map(e => {
      if (e.placedId !== placedId || e.isDestroyed) return e;
      const newHp = Math.max(0, e.hp - damage);
      if (newHp <= 0 && !e.isDestroyed) justDestroyed = true;
      return { ...e, hp: newHp, isDestroyed: newHp <= 0 };
    });

    return { entries, newlyDestroyed: justDestroyed ? [placedId] : [] };
  }

  // ── Destruction cascade ─────────────────────────────────────────────────────

  /**
   * BFS all children of `directlyDestroyedIds` and return the complete set of
   * module IDs that must be destroyed (including the originals).
   */
  static cascadeDestruction(
    bp: SolarShipBlueprint,
    directlyDestroyedIds: string[],
    moduleHp: readonly ModuleHpEntry[],
  ): string[] {
    const alreadyDestroyed = new Set(moduleHp.filter(e => e.isDestroyed).map(e => e.placedId));

    // Build parent → children map
    const childrenOf = new Map<string, string[]>();
    for (const m of bp.modules) {
      if (!m.parentPlacedId) continue;
      if (!childrenOf.has(m.parentPlacedId)) childrenOf.set(m.parentPlacedId, []);
      childrenOf.get(m.parentPlacedId)!.push(m.placedId);
    }

    const toDestroy = new Set(directlyDestroyedIds);
    const queue = [...directlyDestroyedIds];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const child of childrenOf.get(id) ?? []) {
        if (!alreadyDestroyed.has(child) && !toDestroy.has(child)) {
          toDestroy.add(child);
          queue.push(child);
        }
      }
    }
    return [...toDestroy];
  }

  /**
   * Mark all IDs in `toDestroyIds` as destroyed and apply snap-down for any
   * bond armor modules that lose their HP bonus to neighbours.
   */
  static applyDestruction(
    moduleHp: readonly ModuleHpEntry[],
    toDestroyIds: string[],
    bp: SolarShipBlueprint,
    defs: ReadonlyMap<string, SolarModuleDefinition>,
  ): ModuleHpEntry[] {
    const destroySet = new Set(toDestroyIds);
    // Snap destroyed entries to 0
    let entries: ModuleHpEntry[] = moduleHp.map(e =>
      destroySet.has(e.placedId) ? { ...e, hp: 0, isDestroyed: true } : e,
    );

    // For each destroyed bond armor, remove its HP bonus from surviving neighbours
    for (const id of toDestroyIds) {
      const placed = bp.modules.find(m => m.placedId === id);
      const bonus = placed ? defs.get(placed.moduleDefId)?.stats.connectedHpBonus : undefined;
      if (!bonus) continue;

      const neighborIds = new Set<string>();
      if (placed!.parentPlacedId) neighborIds.add(placed!.parentPlacedId);
      for (const m of bp.modules) {
        if (m.parentPlacedId === id) neighborIds.add(m.placedId);
      }

      entries = entries.map(e => {
        if (!neighborIds.has(e.placedId) || e.isDestroyed) return e;
        const newMax = Math.max(1, e.maxHp - bonus);
        return { ...e, maxHp: newMax, hp: Math.min(e.hp, newMax) };
      });
    }
    return entries;
  }

  // ── Repair bot tick ─────────────────────────────────────────────────────────

  /**
   * Distribute repair to the most-damaged surviving module.
   * No-op when no repair rate, or no module needs healing.
   */
  static tickRepair(
    moduleHp: readonly ModuleHpEntry[],
    effectiveStats: ShipEffectiveStats,
    deltaMs: number,
  ): ModuleHpEntry[] {
    if (effectiveStats.repairRatePerSec <= 0) return [...moduleHp];

    const repairAmount = effectiveStats.repairRatePerSec * (deltaMs / 1000);
    let mostDamaged: ModuleHpEntry | undefined;
    let lowestFraction = 1;

    for (const e of moduleHp) {
      if (e.isDestroyed || e.hp >= e.maxHp) continue;
      const frac = e.hp / e.maxHp;
      if (frac < lowestFraction) { lowestFraction = frac; mostDamaged = e; }
    }
    if (!mostDamaged) return [...moduleHp];

    const target = mostDamaged;
    return moduleHp.map(e =>
      e.placedId === target.placedId
        ? { ...e, hp: Math.min(e.maxHp, e.hp + repairAmount) }
        : e,
    );
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /** True if the core module (first entry in bp.modules) is still alive. */
  static isCoreAlive(bp: SolarShipBlueprint, moduleHp: readonly ModuleHpEntry[]): boolean {
    const coreId = bp.modules[0]?.placedId;
    if (!coreId) return false;
    return !(moduleHp.find(e => e.placedId === coreId)?.isDestroyed ?? true);
  }

  /** True if at least one engine module survives. */
  static hasEngine(
    bp: SolarShipBlueprint,
    moduleHp: readonly ModuleHpEntry[],
    defs: ReadonlyMap<string, SolarModuleDefinition>,
  ): boolean {
    const destroyed = new Set(moduleHp.filter(e => e.isDestroyed).map(e => e.placedId));
    return bp.modules.some(m => {
      if (destroyed.has(m.placedId)) return false;
      const def = defs.get(m.moduleDefId);
      return def?.stats.thrustMs2 !== undefined && def.stats.thrustMs2 > 0;
    });
  }

  /** IDs of surviving weapon modules (for pruning the firing roster). */
  static survivingWeaponPlacedIds(
    bp: SolarShipBlueprint,
    moduleHp: readonly ModuleHpEntry[],
    defs: ReadonlyMap<string, SolarModuleDefinition>,
  ): string[] {
    const destroyed = new Set(moduleHp.filter(e => e.isDestroyed).map(e => e.placedId));
    return bp.modules
      .filter(m => !destroyed.has(m.placedId) && defs.get(m.moduleDefId)?.type === "weapon")
      .map(m => m.placedId);
  }
}

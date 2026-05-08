import type { EconomyType } from "../../types/economy";

// ── Location and faction economy assignments ───────────────────────────────────

const LOCATION_ECONOMY: Record<string, EconomyType> = {
  "station-earth-orbit": "trading",
  "outpost-mars": "industrial",
  "station-kepler-orbital": "research",
  "station-proxima-relay": "military",
};

const FACTION_ECONOMY: Record<string, EconomyType> = {
  "terran-federation": "trading",
  "xeno-collective": "research",
  "void-merchants": "trading",
  "scavenger-clans": "mining",
  "nova-rebels": "military",
};

// ── Demand bias: range -2..+2 (negative = cheap, positive = expensive) ────────

const DEMAND_BIAS: Record<EconomyType, Record<string, number>> = {
  military:    { weapon: -2, external: -1, internal:  0, structure: -1, converter:  1 },
  industrial:  { weapon:  1, external:  0, internal: -2, structure: -2, converter:  0 },
  agricultural:{ weapon:  2, external:  1, internal:  1, structure: -1, converter:  2 },
  research:    { weapon:  1, external: -1, internal:  0, structure:  1, converter: -2 },
  trading:     { weapon:  0, external:  0, internal:  0, structure:  0, converter:  0 },
  mining:      { weapon:  0, external:  1, internal: -1, structure: -2, converter:  1 },
};

// ── Module selection probability ──────────────────────────────────────────────

const MODULE_SELECTION_PROB: Record<EconomyType, Record<string, number>> = {
  military:    { weapon: 0.9, external: 0.6, internal: 0.6, structure: 0.7, converter: 0.3 },
  industrial:  { weapon: 0.4, external: 0.5, internal: 0.8, structure: 0.9, converter: 0.5 },
  agricultural:{ weapon: 0.2, external: 0.7, internal: 0.4, structure: 0.8, converter: 0.2 },
  research:    { weapon: 0.3, external: 0.8, internal: 0.6, structure: 0.3, converter: 0.9 },
  trading:     { weapon: 0.6, external: 0.6, internal: 0.6, structure: 0.6, converter: 0.6 },
  mining:      { weapon: 0.5, external: 0.3, internal: 0.7, structure: 0.9, converter: 0.4 },
};

// ── Public API ────────────────────────────────────────────────────────────────

export function economyTypeForLocation(locationId: string, factionId: string): EconomyType {
  return LOCATION_ECONOMY[locationId] ?? FACTION_ECONOMY[factionId] ?? "trading";
}

export function getDemandBias(economyType: EconomyType, moduleType: string): number {
  return DEMAND_BIAS[economyType][moduleType] ?? 0;
}

export function getModuleSelectionProb(economyType: EconomyType, moduleType: string): number {
  return MODULE_SELECTION_PROB[economyType][moduleType] ?? 0.5;
}

// LCG: state = (state * 1664525 + 1013904223) >>> 0
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

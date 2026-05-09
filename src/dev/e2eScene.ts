/**
 * E2E test scene configuration.
 *
 * Dev-only — tree-shaken from production builds because main.ts imports this
 * module inside an `import.meta.env.DEV` block (same pattern as cheats.ts).
 *
 * URL format (all params prefixed with `e2e_`):
 *
 *   ?e2e=1                                  — required to activate e2e mode
 *   &e2e_scene=10v1                         — named preset (below)
 *   &e2e_pos=x,y                            — player start position in km
 *   &e2e_ship=starter                       — ship blueprint name / id hint
 *   &e2e_enemies=fighter:10                — type:count (sizeClass defaults to 1)
 *   &e2e_enemies=fighter:10:2             — type:count:sizeClass
 *   &e2e_enemies=scout:5@100,0            — type:count@cx,cy (ring centre override)
 *   &e2e_enemies=fighter:3;scout:2        — multiple types in one param (;-separated)
 *   &e2e_station=pirate@200,0            — faction@x,y
 *   &e2e_station=earth@-200,0;mars@0,400 — multiple in one param (;-separated)
 *
 * Enemy type names (case-insensitive):
 *   scout(0) | interceptor(1) | fighter(2) | gunship(3) | destroyer(4) |
 *   predator(5) | wraith(6) | titan(7) | spectre(8) | ravager(9)
 *
 * Station factions: pirate | earth | mars
 *
 * Named presets (`e2e_scene`):
 *   10v1        — 10 fighters ringed 300 km around player
 *   death       — 1 gunship 100 km away, quick test of death / break sequence
 *   5v20        — 20 scouts ringed around player, enemy-death / loot testing
 *   station     — pirate station at (300,0), 5 fighters at r=150 from (150,0)
 */

import type { GameManager } from "../game/GameManager";

// ── Spec types ────────────────────────────────────────────────────────────────

export type E2eFaction = "pirate" | "earth" | "mars";

export interface EnemySpawnSpec {
  typeIdx: number;    // index into SOLAR_ENEMY_TYPES (0–9)
  sizeClass: number;  // 1–3
  count: number;
  /** Ring centre override in km; defaults to the player spawn position. */
  cx?: number;
  cy?: number;
}

export interface StationE2eSpec {
  faction: E2eFaction;
  x: number;
  y: number;
  /** When true the station starts in combat mode immediately (default: true). */
  startInCombat?: boolean;
}

export interface E2eSceneSpec {
  /** Name of the preset that was expanded (if any). */
  scene?: string;
  /** Blueprint name or id hint for the player's ship. */
  ship?: string | undefined;
  /** Player starting position in km. */
  playerX: number;
  playerY: number;
  enemies: EnemySpawnSpec[];
  stations: StationE2eSpec[];
}

// ── Type name → typeIdx map ───────────────────────────────────────────────────

const ENEMY_TYPE_MAP: Record<string, number> = {
  scout: 0, interceptor: 1, fighter: 2, gunship: 3, destroyer: 4,
  predator: 5, wraith: 6, titan: 7, spectre: 8, ravager: 9,
};

// ── Named presets ─────────────────────────────────────────────────────────────

const NAMED_SCENES: Record<string, Omit<E2eSceneSpec, "scene">> = {
  "10v1": {
    playerX: 0, playerY: 0,
    enemies: [{ typeIdx: 2, sizeClass: 1, count: 10 }],
    stations: [],
  },
  "death": {
    playerX: 0, playerY: 0,
    enemies: [{ typeIdx: 3, sizeClass: 2, count: 1, cx: 100, cy: 0 }],
    stations: [],
  },
  "5v20": {
    playerX: 0, playerY: 0,
    enemies: [{ typeIdx: 0, sizeClass: 1, count: 20 }],
    stations: [],
  },
  "station": {
    playerX: 0, playerY: 0,
    enemies: [{ typeIdx: 2, sizeClass: 1, count: 5, cx: 150, cy: 0 }],
    stations: [{ faction: "pirate", x: 300, y: 0, startInCombat: true }],
  },
};

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseXY(raw: string): { x: number; y: number } | null {
  const parts = raw.split(",");
  if (parts.length < 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/** Parse one enemy spec fragment: `type:count` or `type:count@cx,cy`. */
function parseOneEnemy(fragment: string): EnemySpawnSpec | null {
  // Split on "@" first to separate optional centre override
  const atSplit = fragment.split("@");
  const mainPart = atSplit[0]!.trim();
  const posPart = atSplit[1]?.trim();

  const colonIdx = mainPart.indexOf(":");
  if (colonIdx < 0) return null;

  const typeName = mainPart.slice(0, colonIdx).toLowerCase();
  const typeIdx = ENEMY_TYPE_MAP[typeName];
  if (typeIdx === undefined) return null;

  const rest = mainPart.slice(colonIdx + 1);
  // Optional sizeClass suffix: `fighter:10:2` → count=10, sizeClass=2
  const restParts = rest.split(":");
  const count = parseInt(restParts[0] ?? "", 10);
  if (!Number.isFinite(count) || count < 1) return null;
  const sizeClass = restParts[1] !== undefined ? Math.max(1, Math.min(9, parseInt(restParts[1], 10))) : 1;

  const spec: EnemySpawnSpec = { typeIdx, sizeClass, count };
  if (posPart) {
    const pos = parseXY(posPart);
    if (pos) { spec.cx = pos.x; spec.cy = pos.y; }
  }
  return spec;
}

/** Parse one station spec fragment: `faction@x,y`. */
function parseOneStation(fragment: string): StationE2eSpec | null {
  const atSplit = fragment.split("@");
  if (atSplit.length < 2) return null;

  const faction = atSplit[0]!.trim().toLowerCase() as E2eFaction;
  if (faction !== "pirate" && faction !== "earth" && faction !== "mars") return null;

  const pos = parseXY(atSplit[1]!.trim());
  if (!pos) return null;

  return { faction, x: pos.x, y: pos.y, startInCombat: true };
}

/**
 * Parse the URL search string into an E2eSceneSpec.
 * Returns null when `e2e=1` is absent or the string has no recognised params.
 */
export function parseE2eScene(search: string): E2eSceneSpec | null {
  const params = new URLSearchParams(search);

  // `e2e=1` (or any truthy value) is required to activate the system.
  const e2eFlag = params.get("e2e");
  if (!e2eFlag || e2eFlag === "0" || e2eFlag.toLowerCase() === "false") return null;

  // Named scene expands to a full spec — other params are ignored.
  const sceneName = params.get("e2e_scene")?.trim().toLowerCase();
  if (sceneName && sceneName in NAMED_SCENES) {
    return { ...NAMED_SCENES[sceneName]!, scene: sceneName };
  }

  // Manual spec assembly
  const posRaw = params.get("e2e_pos");
  const pos = posRaw ? parseXY(posRaw) : null;

  // Enemy specs are `;`-separated so that `@x,y` positions don't clash with
  // the type-list delimiter.  A single spec without `;` also works fine.
  const enemies: EnemySpawnSpec[] = [];
  for (const raw of params.getAll("e2e_enemies")) {
    for (const fragment of raw.split(";")) {
      const spec = parseOneEnemy(fragment.trim());
      if (spec) enemies.push(spec);
    }
  }

  const stations: StationE2eSpec[] = [];
  for (const raw of params.getAll("e2e_station")) {
    for (const fragment of raw.split(";")) {
      const spec = parseOneStation(fragment.trim());
      if (spec) stations.push(spec);
    }
  }

  return {
    ...(sceneName ? { scene: sceneName } : {}),
    ship: params.get("e2e_ship") ?? undefined,
    playerX: pos?.x ?? 0,
    playerY: pos?.y ?? 0,
    enemies,
    stations,
  };
}

// ── Applier ───────────────────────────────────────────────────────────────────

/** True when an E2e spec contains at least one meaningful configuration. */
export function hasE2eScene(spec: E2eSceneSpec | null): spec is E2eSceneSpec {
  return spec !== null;
}

/**
 * Apply a parsed E2eSceneSpec to a running GameManager.
 * Must be called after the GameManager is constructed but before the first tick.
 */
export function applyE2eScene(game: GameManager, spec: E2eSceneSpec): void {
  game.applyE2eScene(spec);
  console.log("[e2e] scene applied:", spec);
}

/**
 * Dev-only cheat parser + applier.
 *
 * This module is imported dynamically from `src/main.ts` inside an
 * `import.meta.env.DEV` block. Rollup replaces that literal with `false` for
 * production builds, so the dynamic import becomes unreachable and the module
 * is tree-shaken out of the prod bundle entirely.
 *
 * URL shape:
 *   /?god=1&weapon=spread&weaponLevel=5&lives=99&shield=1&speed=2&startLevel=5&autostart=1
 *
 * Unknown params are ignored. Invalid values (e.g. weapon=foo) are dropped.
 */

import type { GameManager } from "../game/GameManager";
import type { DevCheats, PlayerWeaponType } from "../types/index";

const WEAPON_VALUES: ReadonlySet<PlayerWeaponType> = new Set([
  "bullet",
  "spread",
  "bomb",
]);

function asBool(raw: string | null): boolean | undefined {
  if (raw === null) return undefined;
  const v = raw.toLowerCase();
  if (v === "" || v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return undefined;
}

function asNumber(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function asWeapon(raw: string | null): PlayerWeaponType | undefined {
  if (raw === null) return undefined;
  const v = raw.toLowerCase() as PlayerWeaponType;
  return WEAPON_VALUES.has(v) ? v : undefined;
}

/** Parses a `location.search` string into a DevCheats object. */
export function parseCheats(search: string): DevCheats {
  const params = new URLSearchParams(search);
  const cheats: DevCheats = {};

  const god = asBool(params.get("god"));
  if (god !== undefined) cheats.god = god;

  const lives = asNumber(params.get("lives"));
  if (lives !== undefined) cheats.lives = lives;

  const health = asNumber(params.get("health"));
  if (health !== undefined) cheats.health = health;

  const weapon = asWeapon(params.get("weapon"));
  if (weapon !== undefined) cheats.weapon = weapon;

  const weaponLevel = asNumber(params.get("weaponLevel"));
  if (weaponLevel !== undefined) cheats.weaponLevel = weaponLevel;

  const shield = asBool(params.get("shield"));
  if (shield !== undefined) cheats.shield = shield;

  const speed = asNumber(params.get("speed"));
  if (speed !== undefined) cheats.speed = speed;

  const megaLaserMs = asNumber(params.get("megaLaserMs"));
  if (megaLaserMs !== undefined) cheats.megaLaserMs = megaLaserMs;

  const startLevel = asNumber(params.get("startLevel"));
  if (startLevel !== undefined) cheats.startLevel = startLevel;

  const autostart = asBool(params.get("autostart"));
  if (autostart !== undefined) cheats.autostart = autostart;

  return cheats;
}

/** True iff at least one cheat field is set. */
export function hasCheats(cheats: DevCheats): boolean {
  return Object.keys(cheats).length > 0;
}

/** Apply the parsed cheats to a GameManager instance. */
export function applyCheats(game: GameManager, cheats: DevCheats): void {
  if (!hasCheats(cheats)) return;
  game.applyDevCheats(cheats);
  console.log("[dev] cheats applied:", cheats);
}

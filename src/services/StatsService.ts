/**
 * StatsService – localStorage-backed persistence for all-time stats and the
 * most-recently-completed run. Safe to call from non-browser contexts (tests):
 * when `localStorage` is undefined, reads return defaults and writes no-op.
 */

import type { AllTimeStats, RunStats } from "../types/index";

const ALL_TIME_KEY = "rwipe.allTimeStats.v1";
const LAST_RUN_KEY = "rwipe.lastRun.v1";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadAllTimeStats(): AllTimeStats | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(ALL_TIME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AllTimeStats;
  } catch {
    return null;
  }
}

export function saveAllTimeStats(stats: AllTimeStats): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(ALL_TIME_KEY, JSON.stringify(stats));
  } catch {
    // quota / disabled storage – silently drop
  }
}

export function loadLastRun(): RunStats | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(LAST_RUN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RunStats;
  } catch {
    return null;
  }
}

export function saveLastRun(run: RunStats): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(LAST_RUN_KEY, JSON.stringify(run));
  } catch {
    // ignore
  }
}

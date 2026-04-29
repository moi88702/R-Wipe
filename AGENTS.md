# AGENTS.md — Contributor / Agent Guide

See [`CLAUDE.md`](./CLAUDE.md) for the authoritative codebase guide used by Claude.  
This file supplements it with notes relevant to automated agents and contributors.

## Setup

```bash
pnpm install
pnpm exec tsc --noEmit   # type-check
pnpm test                 # unit + integration tests
pnpm build                # production build
```

## Testing philosophy

Integration-first TDD (see system prompt). Mock only **true external boundaries**:
- `localStorage` → use the `InMemoryStorage` test double from `LocalStorageService.ts`.
- No mocking of internal helpers, pure functions, or same-package modules.

## Key new subsystems (task 8af74932)

### EnemyStationRegistry (`src/game/data/EnemyStationRegistry.ts`)

Static registry of hostile station definitions. Four stations across two factions:
- `scavenger-clans`: `enemy-station-scav-belt`, `enemy-station-scav-wreck`
- `nova-rebels`: `enemy-station-rebel-strike`, `enemy-station-rebel-forward`

**Adding a new station**: add a `const` definition at the top of the file, then append it to `ALL_STATIONS`. The registry derives `STATION_MAP` from that array automatically.

### EnemySpawnSystem (`src/systems/EnemySpawnSystem.ts`)

Pure-function system managing station encounters:

| Method | Purpose |
|---|---|
| `updateAlertStates` | dormant → alerted when player enters alertRadiusKm |
| `escalateToCombat` | alerted → combat (call after alert delay or on first shot) |
| `trySpawn` | returns spawn positions if cooldown + slot conditions are met |
| `registerSpawnedEnemies` | records new entity ids in the station's active fleet |
| `onEnemyDestroyed` | removes dead enemy from active fleet |
| `applyDamage` | shield-then-hull damage model; sets isDestroyed when hull = 0 |
| `rechargeShields` | passive shield regen per tick |
| `getActiveStations` | returns alerted/combat stations for frame processing |
| `getStationsInAlertRange` | query which stations the player is approaching |

### Types (`src/types/combat.ts`)

- `EnemyStationDefinition` — static config (id, faction, position, health, turrets, spawn config)
- `EnemyStationState` — runtime/persisted state (hull, shield, alertLevel, activeEnemyIds)
- `StationTurretConfig` — turret count, damage, fire rate, range, weapon kind
- `StationSpawnConfig` — ship types, max active, interval, wave size, radius
- `StationAlertLevel` — `"dormant" | "alerted" | "combat"`
- `SpawnWaveResult` — result from `trySpawn` (didSpawn, positions, updatedState)

All types are re-exported from `src/types/index.ts`.

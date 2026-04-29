# R-Wipe — Spaceship Game

Fast-paced horizontally-scrolling arcade shooter with an open-world solar system exploration layer. Built on **Pixi.js 8.18 + TypeScript (strict) + Vite 8 + Vitest 4**.

## Quick start

```bash
pnpm install
pnpm dev        # dev server
pnpm build      # tsc + vite build
pnpm test       # vitest run
pnpm lint       # oxlint
```

Full preflight: `pnpm exec tsc --noEmit && pnpm test && pnpm build`

## Architecture overview

See [`CLAUDE.md`](./CLAUDE.md) for the full developer guide.  
Key subsystems:

| Module | Purpose |
|---|---|
| `GameManager` | Frame-level orchestrator; dispatches per screen mode |
| `StateManager` | Canonical in-memory game state |
| `PlayerManager` | Player ship, weapons, shield, invulnerability |
| `EnemyManager` | Enemy entities, AI ticks, boss state machine |
| `CollisionSystem` | AABB hit detection; returns event objects |
| `GameRenderer` | Pixi.js draw layer (no state mutation) |
| `InputHandler` | Keyboard + touch; pulse-flag contract |
| `GravitySystem` | Inverse-square gravity for the solar system layer |
| `DockingSystem` | Proximity detection + multi-gate docking permission |
| `MissionLogManager` | Mission acceptance, log, waypoints, persistence |
| `EnemyStationRegistry` | Static definitions for hostile enemy strongholds |
| `EnemySpawnSystem` | Alert state machine, ship-spawn waves, station damage |

## Solar system — Enemy Stations

Hostile stations (scavenger-clans, nova-rebels) act as persistent strongholds:

- **Four stations** registered: Scav Belt Outpost, Wreck Haven, Strike Base Kappa, Forward Post Sigma.
- **Alert lifecycle**: dormant → alerted (player enters `alertRadiusKm`) → combat (manual escalation or first shot fired).
- **Spawn pipeline**: while in combat mode, stations release waves of enemy ships at configurable intervals (`spawnIntervalMs`) up to a `maxActiveShips` cap.
- **Shield + hull model**: incoming damage depletes shields first; overflow goes to hull; hull = 0 destroys the station.
- **Persistence-ready**: `EnemyStationState` is a plain serialisable object — store it alongside other solar system save data.

### Key APIs

```ts
import { EnemyStationRegistry } from "./src/game/data/EnemyStationRegistry";
import { EnemySpawnSystem }     from "./src/systems/EnemySpawnSystem";

// --- Session init ---
const defs   = EnemyStationRegistry.getAllStations();
let   states = EnemyStationRegistry.createInitialStates();

// --- Each frame ---
states = EnemySpawnSystem.updateAlertStates(playerPos, defs, states);

// --- When station fires first shot / alert delay elapsed ---
states = EnemySpawnSystem.escalateToCombat(stationId, states);

// --- Combat tick ---
for (const { definition, state } of EnemySpawnSystem.getActiveStations(defs, states)) {
  const wave = EnemySpawnSystem.trySpawn(definition, state, nowMs, Math.random);
  if (wave.didSpawn) {
    const ids = wave.spawnPositions.map(() => createEnemyEntity(...));
    states = EnemySpawnSystem.registerSpawnedEnemies(definition.id, ids, [wave.updatedState]);
  }
  states = EnemySpawnSystem.rechargeShields(deltaMs, defs, states);
}

// --- On enemy death ---
states = EnemySpawnSystem.onEnemyDestroyed(deadEnemyId, states);

// --- On player weapon hit ---
states = EnemySpawnSystem.applyDamage(stationId, dmg, states);
```

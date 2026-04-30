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

## Key new subsystems (task 5ff56ba9)

### ShipControlManager (`src/game/solarsystem/ShipControlManager.ts`)

Pure-static manager for WASD / arrow-key ship movement with gravity physics.

**Public API**:

```ts
ShipControlManager.update(current, input, config, primaryBody, deltaMs)
  → ShipControlResult   // { position, velocity, headingRadians, isThrustActive, isRotating }
```

**`ShipControlConfig`** — ship stats driving the physics:
- `hullMass` (kg) — stored for physics reference
- `thrusterPower` (m/s²) — forward/reverse acceleration
- `strafePower?` (m/s²) — lateral acceleration (defaults to `thrusterPower`)
- `turnRateRadPerS` (rad/s) — angular turn speed
- `maxSpeedMs?` (m/s) — optional speed cap

**`ShipControlInput`** — per-frame key snapshot:
- `thrustForward` / `thrustReverse` — W / S keys
- `turnLeft` / `turnRight` — A / D keys
- `strafeLeft` / `strafeRight` — ← / → arrow keys
- `mouseHeadingTarget?` — optional smooth turn override (radians)

**Heading convention**: radians, 0 = North (−y), clockwise. Use
`ShipControlManager.degreesToRadians` / `radiansToDegrees` to bridge
`SolarSystemSessionState.playerHeading` (degrees 0–359).

**InputState additions**: `InputState` in `src/types/index.ts` gained four optional
fields (`thrustForward`, `thrustReverse`, `turnLeft`, `turnRight`). `InputHandler.poll()`
populates them from KeyW / KeyS / KeyA / KeyD. Existing classic-mode code is unaffected
(fields are optional; classical move keys still map to ArrowUp/Down/Left/Right).

## Key new subsystems (task 44432e67)

### TargetLockManager (`src/systems/combat/TargetLockManager.ts`)

Pure-static manager for scanner-based target locking, multi-lock persistence, and
focus management in solar-system combat. Both the player ship and enemy ships use
the same manager with their own `TargetingState` objects.

**Public API**:

```ts
// Geometry helpers
TargetLockManager.calculateDistance(pos1, pos2)   → number   // km
TargetLockManager.rayCircleIntersects(p1, p2, centre, radius) → boolean
TargetLockManager.isLineOfSightBlocked(srcPos, tgtPos, body, penetrationLevel) → boolean

// State factory
TargetLockManager.createTargetingState() → TargetingState

// Lock lifecycle
TargetLockManager.attemptLock(state, sourcePos, target, scanner, obstacles, nowMs?)
  → LockAttemptResult  // { success, lock?, reason? }
TargetLockManager.validateLock(_lock, sourcePos, targetPos, scanner, obstacles) → boolean
TargetLockManager.validateAllLocks(state, sourcePos, getTargetPos, scanner, obstacles)
  → string[]  // broken lock ids
TargetLockManager.breakLock(state, lockId) → void
TargetLockManager.onTargetDestroyed(state, targetId) → void

// Focus management
TargetLockManager.cycleFocusedLock(state, nowMs?)    // Tab key
TargetLockManager.setFocusedLock(state, lockId, nowMs?) → boolean   // HUD click

// Quick-lock ("/" key)
TargetLockManager.quickLockNearestHostile(state, sourcePos, enemies, scanner, obstacles, nowMs?)
  → LockAttemptResult
```

**New types** (`src/systems/combat/types.ts`):

- `ScannerEquipment` — id, name, range (km), penetrationLevel (0–3), maxSimultaneousLocks
- `Aggression` enum — `NEUTRAL | VIGILANT | HOSTILE`  
- `TargetLock` — id, targetId, targetName, lockedAtMs, distanceKm, isFocused, lockStrength
- `TargetingState` — allLocks, focusedLockId?, lastTabCycleMs, lastClickLockMs

**Penetration model** (body type → min scanner level to see through):

| Body type | Min penetration |
|-----------|-----------------|
| asteroid  | 1               |
| moon      | 1               |
| planet    | 2               |
| star      | 3               |
| station   | ∞ (never)       |

**Key behaviours**:
- `attemptLock` applies 3 sequential gates: lock-limit → range → LOS
- First lock acquired is automatically focused
- `cycleFocusedLock` (Tab) wraps cyclically through all active locks
- `quickLockNearestHostile` ("/") selects nearest VIGILANT or HOSTILE enemy; evicts oldest lock when at capacity
- When a focused lock breaks, focus auto-shifts to the next lock in the list
- Only `Aggression.NEUTRAL` enemies are excluded from "/" quick-lock

## Key new subsystems (task 96e13e8d)

### EnemyAISystem (`src/systems/combat/EnemyAISystem.ts`)

Pure-static system for enemy AI targeting, aggression state machines, and
per-frame lock management. Both written and tested alongside `TargetLockManager`.

**Entry-point (game loop)**:

```ts
EnemyAISystem.tick(enemy, player, playerFiredOnEnemy, obstacles, nowMs)
  → EnemyAITickResult   // { aggressionChanged, lockAcquired, brokenLockIds, shouldFire }
```

When `shouldFire` is true, call `EnemyAISystem.getFocusedTarget(enemy)` to get
the lock and aim the enemy's weapon at that target's position.

**State factory**:

```ts
EnemyAISystem.createState(id, name, position, scanner, aggression?)
  → EnemyAIState   // one object per enemy, owned by the caller
```

**Individual sub-operations** (callable separately for fine-grained control):

```ts
EnemyAISystem.updateAggression(enemy, playerPos, playerFiredOnEnemy, nowMs)
EnemyAISystem.acquirePlayerLock(enemy, player, obstacles, nowMs) → boolean
EnemyAISystem.validateEnemyLocks(enemy, getPlayerPos, obstacles)  → string[]
```

**Query helpers** (pure, no mutation):

```ts
EnemyAISystem.shouldEngage(enemy)                         → boolean
EnemyAISystem.canDetectPlayer(enemy, playerPos, obstacles) → boolean
EnemyAISystem.getFocusedTarget(enemy)                     → TargetLock | undefined
```

**`EnemyAIState`** — one per enemy, mutated in-place by the system:
- `id`, `name`, `position` — entity identity and world-space location (km)
- `scanner: ScannerEquipment` — range, penetrationLevel, maxSimultaneousLocks
- `targetingState: TargetingState` — multi-lock state (see TargetLockManager)
- `aggression: Aggression` — `NEUTRAL | VIGILANT | HOSTILE`
- `lastAggravatedByPlayerAt?: number` — timestamp when last fired upon

**Aggression state machine** (one-way escalation):

| Current    | Trigger                      | New state  |
|------------|------------------------------|------------|
| NEUTRAL    | Player within 200 km         | VIGILANT   |
| NEUTRAL    | Player fires on the enemy    | HOSTILE    |
| VIGILANT   | Player fires on the enemy    | HOSTILE    |
| HOSTILE    | (anything)                   | HOSTILE    |

VIGILANT does **not** revert to NEUTRAL when the player retreats.

**Lock behaviour**: identical to the player — uses `TargetLockManager.attemptLock`
and `validateAllLocks`. Only VIGILANT and HOSTILE enemies attempt to acquire locks.
The `tick()` method gates `acquirePlayerLock` behind `shouldEngage()`.

**Constant**: `EnemyAISystem.VIGILANCE_RANGE_KM = 200` (km).

**Exports** (`src/systems/combat/index.ts`):
- `EnemyAISystem` — the class
- `EnemyAIState` — per-enemy state type
- `EnemyAITickResult` — return type of `tick()`

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

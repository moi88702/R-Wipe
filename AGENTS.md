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

## Key new subsystems (task 40f0f0e8)

### CombatSystem (`src/systems/CombatSystem.ts`)

Orchestrates weapon / ability activation for solar-system combat. Wraps `CombatManager`.

**Public API**:

```ts
const cs = new CombatSystem(combatManager);
cs.registerShip(ship);    // must be called before the ship fires or is targeted
cs.unregisterShip(id);    // on death or dock cleanup

const result = cs.tick(
  playerShip,             // isDocked gate checked here
  focusedTargetId,        // string | null
  combatInput,            // { fireWeapon, abilityKeys: {B,V,C,X,Z} }
  abilityKeyMap,          // Partial<Record<AbilityKey, abilityId>>
  primaryWeaponId,        // string | null
  lockStrength?,          // 0–1, default 1
);
// result → { weapon?: WeaponFireResult, abilities: Partial<Record<AbilityKey, …>> }
```

**Docking guard**: when `playerShip.isDocked === true` every pressed key returns `reason: "docked"` immediately — no `CombatManager` calls are made.

**Space → weapon fire**: requires both `primaryWeaponId` and `focusedTargetId`. Either missing returns a typed failure reason. On success delegates to `CombatManager.fireWeapon` (hit/miss, shield absorption, armor, kill detection).

**B/V/C/X/Z → ability activation**: looks up `abilityKeyMap[key]`, then calls `CombatManager.activateAbility` which enforces cooldown and energy gates. Returns `{ activated: false, reason: "not-available" }` when the manager rejects.

**InputState additions for V/C/X/Z** (populated by `InputHandler.poll()`):
- `abilityV`, `abilityC`, `abilityX`, `abilityZ` — one-frame pulse booleans.
- Cleared by `InputHandler.endFrame()` — same lifecycle as `bombPulse`.
- B maps to the existing `bomb` field (`keysPressed.has("KeyB") || bombPulse`).

**Exports** (via `src/systems/combat/index.ts`):
- `CombatSystem`, `AbilityKey`, `ABILITY_KEYS`
- `CombatInput`, `WeaponFireResult`, `AbilityActivationResult`, `CombatTickResult`

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

## Key new subsystems (task bb597638)

### SystemGateRegistry (`src/game/data/SystemGateRegistry.ts`)

Static registry of inter-system traversal gates. Six gates across three systems
forming three bidirectional corridors:
- `sol` ↔ `kepler-442`: `gate-sol-to-kepler` / `gate-kepler-to-sol`
- `sol` ↔ `proxima-centauri`: `gate-sol-to-proxima` / `gate-proxima-to-sol`
- `kepler-442` ↔ `proxima-centauri`: `gate-kepler-to-proxima` / `gate-proxima-to-kepler`

**Adding a new gate pair**: add two `const` definitions (one per system) at the
top of the file, append both to `ALL_GATES`, and confirm that each gate's
`sisterGateId` points to the other's `id`.

**Public API**:
```ts
SystemGateRegistry.getGate(id)               → SystemGate | undefined
SystemGateRegistry.getAllGates()             → readonly SystemGate[]
SystemGateRegistry.getAllGateIds()           → string[]
SystemGateRegistry.getGatesBySystem(systemId) → SystemGate[]
SystemGateRegistry.getSisterGate(gateId)     → SystemGate | undefined
```

**Structural invariants (enforced by tests)**:
- Every gate's `sisterGateId` resolves to an existing gate in the registry.
- Sister gates are always in different systems.
- A gate's `destinationSystemId` equals its sister gate's `systemId`.
- Total gate count is even (gates always come in pairs).

### GateTeleportSystem (`src/game/solarsystem/GateTeleportSystem.ts`)

Pure-static system for inter-system transit. Two entry points:

```ts
// Per-frame proximity check (current system's gates only)
GateTeleportSystem.checkGateProximity(playerPos, gates)
  → SystemGate | null

// Execute transit (mutates session in-place on success)
GateTeleportSystem.teleport(session, sourceGate, sisterGate, destinationSystem)
  → TeleportResult
```

**`TeleportResult`** is a discriminated union on `success`:
- `{ success: true, sourceGate, destinationGate, newPlayerPosition }` — session mutated.
- `{ success: false, sourceGate, reason }` — session unchanged.

**Failure reasons**: `"docked"` | `"no-primary-body-in-destination"`

**Session mutations on success**:
- `currentSystem` ← `destinationSystem`
- `playerPosition` ← `sisterGate.position`
- `primaryGravitySourceId` ← destination system's primary body id
- `nearbyLocations` ← `[]` (stale ids cleared)
- `playerVelocity` / `playerHeading` — **preserved** (inertial continuity)

**Proximity check**: inclusive boundary (`distance ≤ triggerRadius`), consistent
with `DockingSystem.checkProximity`. Returns the first gate in definition order
when multiple radii overlap.

**Re-trigger prevention**: the caller is responsible for preventing an immediate
re-trigger after arrival (e.g., one-frame cooldown before re-arming the check).

**New type** (`src/types/solarsystem.ts`):

`SystemGate` — `{ id, name, systemId, position, triggerRadius, sisterGateId, destinationSystemId }`  
Re-exported from `src/types/index.ts`.

## Key new subsystems (task 220336b7)

### DockingManager (`src/managers/DockingManager.ts`)

Orchestrates the full docking lifecycle for the Space Combat Control System.
Bridges the pure-function `DockingSystem` with mutable `SolarSystemSessionState`.

**Relationship with DockingSystem**

| Concern | Owner |
|---------|-------|
| Proximity geometry (distance ≤ dockingRadius) | `DockingSystem.checkProximity` (pure) |
| Permission gates (reputation / items / missions) | `DockingSystem.canDock` (pure) |
| Session mutation on dock | `DockingManager.dock()` |
| Session mutation on undock | `DockingManager.undock()` |
| "Dock" button visibility | `DockingManager.isDockButtonVisible()` |

**Public API**

```ts
// One instance per play session
const dm = new DockingManager();

// Per-frame proximity update
dm.updateNearbyLocations(session, allLocations);

// HUD dock-button visibility (proximity-based only; permissions deferred to click)
const show = dm.isDockButtonVisible(session, allLocations);

// Range query (used by minimap, HUD distance indicators)
const nearby = dm.getNearestDocksWithinRange(shipPos, allLocations, 50 /* km */);

// Player clicks Dock button
const dockResult = dm.dock(session, location, factionStanding, inventory, completedMissions);
// dockResult.success / dockResult.reason / dockResult.dockedLocationId

// Player selects "Undock" from dock menu
const undockResult = dm.undock(session);
// undockResult.restoredPosition === location.position (km)

// Save/load integration
const snapshot = dm.getPreDockSnapshot(); // PreDockSnapshot | null
```

**`dock()` gates (checked in order)**:
1. **Already-docked guard** — `"already-docked"` if `session.dockedLocationId !== null`
2. **Proximity gate** — `"not-in-range"` if player is outside `location.dockingRadius`
3. **Permission gates** (via `DockingSystem.canDock`): `"low-reputation"` → `"missing-item"` → `"mission-incomplete"`

**Session mutations on `dock()`**:
- `session.dockedLocationId` ← `location.id`
- `session.playerVelocity` ← `{ x: 0, y: 0 }`
- `session.discoveredLocations` ← `+ location.id`
- `preDockSnapshot` ← position / velocity / heading / station position

**Session mutations on `undock()`**:
- `session.playerPosition` ← docked station's world position (from snapshot)
- `session.playerVelocity` ← `{ x: 0, y: 0 }`
- `session.playerHeading` ← pre-dock heading restored
- `session.dockedLocationId` ← `null`
- `preDockSnapshot` ← cleared

**Undocking is always explicit**: `DockingManager` never auto-undocks.
The game loop must call `undock()` from the dock-menu "Undock" handler.

**Exports** (`src/managers/index.ts`):
- `DockingManager` — the class
- `PreDockSnapshot` — saved state type
- `DockResult` — return type of `dock()`
- `UndockResult` — return type of `undock()`

## Key new subsystems (task b9261a0a)

### HUDRenderer (`src/rendering/HUDRenderer.ts`)

Pixi.js-based HUD overlay renderer for solar-system combat display. Renders four distinct HUD layers:
1. Target locks (reticles on enemies, lock list in HUD corner)
2. Ability cooldowns (bars for B/V/C/X/Z keys)
3. Ship status (health and shield bars with numeric labels)
4. Navigation waypoints (color-coded position markers)

**Constructor**:
```ts
const hud = new HUDRenderer(width: number, height: number);
```

**Public API**:
```ts
// Render methods (called each frame with HUDRenderData)
hud.renderTargetLocks(data: HUDRenderData): void     // reticles + lock list
hud.renderAbilityCooldowns(data: HUDRenderData): void // cooldown bars
hud.renderShipStatus(data: HUDRenderData): void       // health/shield bars
hud.renderWaypoints(data: HUDRenderData): void        // waypoint markers

// Accessors (for adding containers to game stage)
hud.getLocksContainer(): Container
hud.getLocksGraphics(): Graphics
hud.getStatusContainer(): Container
hud.getCooldownsContainer(): Container
hud.getWaypointsContainer(): Container
```

**`HUDRenderData` contract** (passed to each render method):
```ts
{
  playerLocks: TargetingState;  // all locks + focused lock id
  shipHealth: number;           // current health
  shipMaxHealth: number;        // max health
  shipShield: number;           // current shield
  shipMaxShield: number;        // max shield
  abilityCooldowns: Record<"B"|"V"|"C"|"X"|"Z", number>; // 0–1 ratio
  waypointMarkers: WaypointMarker[];  // { name, positionKm, color, type }
  playerPositionKm: { x: number; y: number }; // player position (km) for waypoint conversion
}
```

**Lock display invariants**:
- Focused lock is red reticle; unfocused locks are green
- All locks up to `maxSimultaneousLocks` show in HUD list
- When focused lock breaks (out of range/destroyed), focus auto-shifts to next lock
- Tab-cycling and HUD clicks change focus without breaking background locks

**Cooldown display invariants**:
- Each key (B/V/C/X/Z) has a bar showing 0–1 cooldown ratio
- 0 = ready, 1 = full cooldown
- Bar fills left-to-right as cooldown progresses

**Status display invariants**:
- Health bar: green >25%, red ≤25%
- Shield bar: always blue
- Both display numeric values (e.g., "H: 60/100")

### HUDSystem (`src/systems/HUDSystem.ts`)

Pure-logic data construction for HUD rendering. Converts game state into `HUDRenderData` each frame.
No Pixi dependency — unit-testable independently.

**Public API**:
```ts
HUDSystem.buildHUDData(options: {
  playerTargetingState: TargetingState;
  playerHealth: number;
  playerMaxHealth: number;
  playerShield: number;
  playerMaxShield: number;
  abilityCooldownsMs: Record<"B"|"V"|"C"|"X"|"Z", number>;
  maxAbilityCooldownMs: Record<"B"|"V"|"C"|"X"|"Z", number>;
  currentWaypoints?: Waypoint[];
  playerPositionKm?: { x: number; y: number };
}) → HUDRenderData
```

**Usage pattern** (game loop):
```ts
const hudData = HUDSystem.buildHUDData({
  playerTargetingState: playerShip.targetingState,
  playerHealth: playerShip.stats.health,
  playerMaxHealth: playerShip.stats.maxHealth,
  playerShield: playerShip.stats.shield,
  playerMaxShield: playerShip.stats.maxShield,
  abilityCooldownsMs: { B: remainingBMs, V: remainingVMs, ... },
  maxAbilityCooldownMs: { B: 5000, V: 5000, ... },
  currentWaypoints: missionLogManager.getWaypoints(),
  playerPositionKm: session.playerPosition,
});

// Render each HUD layer
hud.renderTargetLocks(hudData);
hud.renderAbilityCooldowns(hudData);
hud.renderShipStatus(hudData);
hud.renderWaypoints(hudData);
```

**Conversions performed**:
- Absolute cooldown milliseconds → 0–1 ratios via `Math.max(0, Math.min(1, current / max))`
- RGB waypoint colors → hex numbers via bitshift
- `Waypoint` objects → `WaypointMarker` with screen-space positioning

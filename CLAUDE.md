# R-Wipe — Codebase Guide for Claude

Fast-paced horizontally-scrolling arcade shooter. Pixi.js 8.18 + TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vite 8, Vitest 4, oxlint, pnpm.

Scripts: `pnpm dev`, `pnpm build` (runs `tsc && vite build`), `pnpm test`, `pnpm lint`.

## Architecture

Flat manager layout driven by `GameManager.tick(deltaMs)`:

- `src/game/GameManager.ts` — orchestrator. Owns every subsystem, dispatches by screen (main-menu / gameplay / pause / stats / game-over). `makeLevelState(n)` at the bottom defines per-level difficulty + enemy unlocks.
- `src/managers/StateManager.ts` — canonical game state (player mirror, run stats, all-time stats, level state, screen).
- `src/managers/PlayerManager.ts` — player ship, weapons, bombs, invulnerability. No Pixi dependency (unit-testable).
- `src/managers/EnemyManager.ts` — enemy + boss spawning, AI ticks, enemy projectile pool, boss phase/charge state machine.
- `src/managers/LevelManager.ts` — level progression, spawn pacing, boss phase handoff.
- `src/managers/PowerUpManager.ts` — drops + collection. Stats dirty flag.
- `src/managers/BossRegistry.ts` — all boss definitions. Exports `getBossDefinitionForLevel(n)` which uses `(n - 1) % BOSS_REGISTRY.length`.
- `src/systems/CollisionSystem.ts` — AABB collisions, returns events consumed by GameManager.
- `src/rendering/GameRenderer.ts` — Pixi draw. Layer order: bg / game / fx / hud / menu. Single `entityGfx` / `fxGfx` cleared per frame.
- `src/input/InputHandler.ts` — keyboard + touch. **Pulse contract**: `poll()` may be called multiple times per frame; pulse flags (`bombPulse`, `menuConfirmPulse`, `pausePulse`) are cleared only by `endFrame()`, which GameManager.tick calls once at the very end.
- `src/dev/cheats.ts` — URL-param cheats. Dead-code-eliminated in prod via `import.meta.env.DEV`.

## Boss registry (in order, 1-indexed by level)

1. SENTINEL, 2. SKIRMISHER, 3. WARDEN, 4. WEAVER, 5. DREADNOUGHT, 6. PHANTOM, 7. CARRIER. Wraps.

Lookup is level-based only. To override by id, add an override to GameManager and wrap all call sites.

## Weapon kinds

`WeaponKind = "bullet" | "laser" | "torpedo" | "cannon" | "pulse-bolt" | "charge-beam" | "prox-bomb"` (`src/types/index.ts`).

Renderer switch lives in `GameRenderer.drawProjectile` (~1294–1368). Each kind has its own visual style. Default fallback is a cyan rect.

Cannon kind = Warden's "red and white circles": orange-red outer ring + white ring + inner glow (~GameRenderer 1318–1331).

## Boss charge-up state

Boss phase config carries `chargeMs`. `EnemyManager` (~575–631) ticks `boss.isCharging` and accumulates `boss.chargeProgressMs`. When `chargeProgressMs >= chargeMs`, it calls `fireChargeBeam` / equivalent.

There is currently no visual tell for charging — renderer doesn't read `isCharging`. Add the visual in `GameRenderer.drawBoss` reading those state fields.

## Enemy roster

`ENEMY_BASE` (EnemyManager ~60–70) defines: grunt, spinner, stalker, darter, orbiter, lancer, torpedoer, cannoneer, pulsar.

**Level gating**: `makeLevelState` in GameManager (~787) sets `newEnemyTypesUnlocked` — currently ONLY `grunt / spinner / stalker`. The "cool" types (darter, orbiter, lancer, torpedoer, cannoneer, pulsar) only appear in the Carrier boss's `spawnWave` arrays, so they never show up in regular level waves unless `newEnemyTypesUnlocked` is widened.

## Cheats

Params parsed in `src/dev/cheats.ts` (~44–80): god, lives, health, weapon, weaponLevel, shield, speed, megaLaserMs, startLevel, autostart.

Add a new cheat by: (1) adding field to `DevCheats` in `src/types/index.ts`, (2) parsing it in `parseCheats`, (3) applying it in `GameManager.applyDevCheats`.

## Projectile fields worth knowing

- `health` — >0 makes the projectile shootable. Collision emits `enemy-projectile-shot-down` events.
- `proxTriggerRadius` / `proxBlastRadius` — AoE on proximity or lifetime expiry (enemy homing torpedoes and player prox-bomb kind both use this).
- `kind` — drives renderer switch.
- `lifetimeMs` — auto-expire.

## Input / touch semantics

- `InputHandler.attachTouch(element, gameWidth, gameHeight)` — maps touch coords to internal game coords (1280×720). Drag-to-move, hold-to-fire, double-tap bomb (320ms window), two-finger tap pauses.
- `input.touchTarget` is where the finger is in game coords. `PlayerManager.applyMovement` glides the ship toward this point at `PLAYER_SPEED_PX_S`.
- Ship bounds: `x ∈ [100, 300]`, `y ∈ [100, 600]`.
- Canvas CSS preserves 1280×720 internal resolution while fitting the viewport. `touch-action: none` on the canvas disables native gestures.

## Player bombs (two kinds, don't confuse them)

1. **Fired bomb** (weapon type `"bomb"`): `tryFire` case "bomb" — forward-traveling prox-bomb projectile (kind `prox-bomb`).
2. **Panic bomb** (B key / touch double-tap): `tryDropBomb` queues a `PanicBombEvent` on `pendingPanicBombs`; `GameManager.detonatePlayerPanicBombs` drains the queue, damages enemies in `blastRadius` around the ship, sweeps enemy projectiles inside the blast, calls `renderer.showPlayerBomb`. Post-respawn credits (3) bypass the cooldown.

## FX pools (renderer)

- `explosions` — generic radial burst, 450ms lifetime.
- `ringPulses` — expanding ring shockwave, 500ms default.
- `sparks` — 4-spoke crackle, 170ms. Used for mega-laser hits.
- `floatingTexts` — power-up pickup labels.

Reset in `resetFx`. All are per-run ephemeral.

## Render frame extras

`renderFrame(state, deltaMs, extras)` extras object is the GameManager→renderer contract. Fields today: `playerProjectiles`, `enemyProjectiles`, `enemies`, `boss`, `powerUps`, `menuSelection`, `lastRun`, `bombCredits`.

Add new HUD data here, never poke renderer internals.

## Solar System — EnemyAISystem

`src/systems/combat/EnemyAISystem.ts` — static class, pure logic (no I/O, no Pixi).
Drives enemy scanner-based targeting and aggression state per AI ship.

**Game-loop entry point:**
```ts
EnemyAISystem.tick(enemy, player, playerFiredOnEnemy, obstacles, nowMs)
  → { aggressionChanged, lockAcquired, brokenLockIds, shouldFire }
```
Call once per enemy per frame. When `shouldFire` is true, read the lock from
`getFocusedTarget(enemy)` and aim the enemy's fire at `lock.targetId`.

**State factory:**
```ts
EnemyAISystem.createState(id, name, position, scanner, aggression?)
  → EnemyAIState   // one per enemy, caller owns it
```

**Individual operations** (fine-grained control):
- `updateAggression(enemy, playerPos, playerFiredOnEnemy, nowMs)` — advance state machine
- `acquirePlayerLock(enemy, player, obstacles, nowMs)` → `boolean` — attempt lock
- `validateEnemyLocks(enemy, getPlayerPos, obstacles)` → `string[]` — drop stale locks

**Pure queries** (no mutation):
- `shouldEngage(enemy)` → `boolean` — `true` when VIGILANT or HOSTILE
- `canDetectPlayer(enemy, playerPos, obstacles)` → `boolean` — range + LOS check
- `getFocusedTarget(enemy)` → `TargetLock | undefined` — focused lock for firing

**Aggression state machine** (one-way escalation):

| Current  | Trigger                   | New state |
|----------|---------------------------|-----------|
| NEUTRAL  | Player within 200 km      | VIGILANT  |
| NEUTRAL  | Player fires on enemy     | HOSTILE   |
| VIGILANT | Player fires on enemy     | HOSTILE   |
| HOSTILE  | (anything)                | HOSTILE   |

VIGILANT does **not** revert to NEUTRAL when the player retreats.

**Lock behaviour**: delegates entirely to `TargetLockManager`. Only VIGILANT
and HOSTILE enemies attempt locks. Lock-limit, range, and penetration rules
are identical to the player scanner.

**Constant**: `EnemyAISystem.VIGILANCE_RANGE_KM = 200` (km).

## Solar System — TargetLockManager

`src/systems/combat/TargetLockManager.ts` — static class, pure logic (no I/O, no Pixi).
Both player and enemies use the same manager with independent `TargetingState` objects.

**Key static methods:**
- `createTargetingState()` → fresh empty state
- `attemptLock(state, sourcePos, target, scanner, obstacles, nowMs?)` — 3 gates: lock-limit → range → LOS → `LockAttemptResult`
- `validateAllLocks(state, sourcePos, getTargetPos, scanner, obstacles)` → broken lock ids; refreshes `distanceKm` on survivors
- `breakLock(state, lockId)` — removes lock; auto-focuses next if focused lock breaks
- `onTargetDestroyed(state, targetId)` — remove lock by enemy id (shorthand for breakLock)
- `cycleFocusedLock(state, nowMs?)` — Tab key: advance focus cyclically through allLocks
- `setFocusedLock(state, lockId, nowMs?)` → bool — HUD click: focus specific lock
- `quickLockNearestHostile(state, sourcePos, enemies, scanner, obstacles, nowMs?)` — "/" key; evicts oldest lock when at capacity
- `isLineOfSightBlocked(srcPos, tgtPos, body, penetrationLevel)` — penetration-level gated LOS (ray-circle)
- `calculateDistance(p1, p2)` — Euclidean km distance
- `rayCircleIntersects(p1, p2, centre, radius)` — parametric [0,1] segment test

**Types** (all in `src/systems/combat/types.ts`, exported from `index.ts`):
- `ScannerEquipment` — { id, name, range, penetrationLevel, maxSimultaneousLocks }
- `Aggression` — `NEUTRAL | VIGILANT | HOSTILE`
- `TargetLock` — { id, targetId, targetName, lockedAtMs, distanceKm, isFocused, lockStrength }
- `TargetingState` — { allLocks, focusedLockId?, lastTabCycleMs, lastClickLockMs }

**Penetration levels** (body.type → minimum scanner penetrationLevel to see through):
asteroid=1, moon=1, planet=2, star=3, station=∞ (always opaque).

**Focus invariant**: at most one `lock.isFocused === true` at any time; `TargetLockManager` is the sole mutator.

**`exactOptionalPropertyTypes` note**: `TargetingState.focusedLockId` is typed `string | undefined` (not just `string?`) so the manager can explicitly clear it without `delete`.

## Solar System — ShipControlManager

`src/game/solarsystem/ShipControlManager.ts` — static class. `update(current, input, config, primaryBody, deltaMs)` computes one physics tick.

**Steps (in order)**: rotation → thrust → gravity → speed-cap → position integration.

**Heading**: radians, 0 = North (−y), clockwise. `forwardVector(h)` = `(sin h, −cos h)`. `strafeRightVector(h)` = `(cos h, sin h)`.

**Input mapping**: W/S = forward/reverse thrust, A/D = rotation, ← / → arrows = strafe. Optional `mouseHeadingTarget` (radians) overrides keyboard turning.

**Position units**: position km, velocity m/s → `Δpos_km = vel_ms × dt_s / 1000`.

**`InputState` additions**: four optional boolean fields added (`thrustForward`, `thrustReverse`, `turnLeft`, `turnRight`) and populated in `InputHandler.poll()` from KeyW / KeyS / KeyA / KeyD. Classic arcade mode is unaffected — those fields are optional.

## Solar System — CombatSystem

`src/systems/CombatSystem.ts` — processes Space / B / V / C / X / Z combat input and delegates to `CombatManager`.

**Key design facts**:
- `ship.isDocked === true` → all combat blocked immediately; every pressed key returns `reason: "docked"`.
- Space → `CombatManager.fireWeapon(attackerId, targetId, weaponId, lockStrength)`. Both `primaryWeaponId` and `focusedTargetId` must be non-null.
- B / V / C / X / Z → `CombatManager.activateAbility(shipId, abilityId)`. Ability id sourced from caller-supplied `abilityKeyMap`. Missing slot → `"no-ability-equipped"`. CombatManager rejection (cooldown/energy) → `"not-available"`.
- Only keys with `=== true` in `CombatInput` produce entries in `CombatTickResult`.
- Ships must be registered via `cs.registerShip(ship)` before they appear in any `tick()` call (delegates to `CombatManager.registerShip`).

**`InputState` additions for ability keys** (`src/types/index.ts`):
- `abilityV`, `abilityC`, `abilityX`, `abilityZ` — one-frame pulse booleans, cleared by `endFrame()`.
- `simulateKeyDown("KeyV" | "KeyC" | "KeyX" | "KeyZ")` sets the matching pulse.
- B uses the existing `bomb` field (continuous hold + `bombPulse`).

**Exports** (all re-exported from `src/systems/combat/index.ts`):
`CombatSystem`, `AbilityKey`, `ABILITY_KEYS`, `CombatInput`, `WeaponFireResult`, `AbilityActivationResult`, `CombatTickResult`.

## Solar System — DockingManager

`src/managers/DockingManager.ts` — instance class (one per play session).
Wraps `DockingSystem` (pure) and owns `SolarSystemSessionState` mutations.

```ts
const dm = new DockingManager();

// Per-frame HUD trigger + nearby list
dm.updateNearbyLocations(session, locations);
const show = dm.isDockButtonVisible(session, locations); // proximity-only check

// Range query
const nearby = dm.getNearestDocksWithinRange(shipPos, locations, rangeKm);

// Dock (gates: already-docked → not-in-range → low-reputation → missing-item → mission-incomplete)
const { success, reason } = dm.dock(session, location, standing, inventory, missions);

// Undock (explicit only — never auto-undocked)
dm.undock(session); // ship placed at station.position, velocity zeroed, heading restored

// Snapshot for save/load
const snap = dm.getPreDockSnapshot(); // PreDockSnapshot | null
```

**Exports** from `src/managers/index.ts`: `DockingManager`, `PreDockSnapshot`,
`DockResult`, `UndockResult`.

## Solar System — GravitySystem

`src/game/solarsystem/GravitySystem.ts` — static `applyGravity(shipPos, shipVel, primaryBody, deltaMs)` method.

- Units: positions in km, velocities in m/s, gravityStrength in m/s².
- Formula: `a = gravityStrength × (radius / distance)²` (inverse-square, simplified surface-gravity form).
- Integration: explicit Euler (`v_new = v + a × dt`).
- Collision boundary: if `distance ≤ radius`, cancels the inward velocity component (prevents ship penetration). Caller is responsible for the position push-out (repositioning outside the body surface).
- Degenerate (ship exactly at body centre): returns `{x:0, y:0}`.

## Solar System — Enemy Stations & Spawn System

### EnemyStationRegistry (`src/game/data/EnemyStationRegistry.ts`)

Static registry of four hostile stations. Two factions own them:
- `scavenger-clans`: `enemy-station-scav-belt` (asteroid-belt), `enemy-station-scav-wreck` (asteroid-belt)
- `nova-rebels`: `enemy-station-rebel-strike` (moon-petra), `enemy-station-rebel-forward` (planet-void)

**Public API:**
- `getStation(id)` → `EnemyStationDefinition | undefined`
- `getAllStations()` → frozen `readonly EnemyStationDefinition[]`
- `getAllStationIds()` → `string[]`
- `getStationsByFaction(factionId)` → `EnemyStationDefinition[]`
- `getStationsByBody(bodyId)` → `EnemyStationDefinition[]`
- `createInitialStates()` → `EnemyStationState[]` — one dormant/full-health state per station

**Shape guarantees (enforced by tests):**
- `alertRadiusKm > turrets.rangeKm` — station always alerts before turrets fire.
- `spawnRadiusKm < alertRadiusKm` — ships spawn near the station, not at its edge.

### EnemySpawnSystem (`src/systems/EnemySpawnSystem.ts`)

Pure-function class. Every method takes state arrays and returns new state arrays (no mutation).

**Alert state machine** (`StationAlertLevel`): `"dormant"` → `"alerted"` → `"combat"`. One-way escalation only.

| Method | When to call |
|---|---|
| `updateAlertStates(playerPos, defs, states)` | Every frame when player moves |
| `escalateToCombat(stationId, states)` | After alert delay elapses, or on first incoming damage |
| `trySpawn(def, state, nowMs, rng)` | Each combat tick; returns `SpawnWaveResult` |
| `registerSpawnedEnemies(id, newIds, states)` | After creating enemy entities from `spawnPositions` |
| `onEnemyDestroyed(enemyId, states)` | When any enemy entity dies |
| `applyDamage(stationId, dmg, states)` | When player weapon hits a station |
| `rechargeShields(deltaMs, defs, states)` | Each frame tick |
| `getActiveStations(defs, states)` | Returns `{definition, state}[]` for alerted/combat stations |
| `getStationsInAlertRange(playerPos, defs)` | For approach HUD / map indicators |

**`trySpawn` preconditions** (all must be true):
1. `!isDestroyed`
2. `alertLevel === "combat"`
3. `currentTimeMs − lastSpawnAtMs ≥ spawnIntervalMs`
4. `activeEnemyIds.length < maxActiveShips`

Wave size = `min(shipsPerWave, maxActiveShips − activeEnemyIds.length)`.

**`applyDamage` model**: shields absorb first; overflow to hull; `hull ≤ 0` → `isDestroyed = true`, `activeEnemyIds` cleared.

### Types (`src/types/combat.ts`, re-exported from `src/types/index.ts`)

- `EnemyStationDefinition` — static config
- `EnemyStationState` — runtime/save-ready state
- `StationTurretConfig` — turret count, damage, fire-rate, range, weaponKind
- `StationSpawnConfig` — ship types, max-active, interval, wave-size, radius
- `StationAlertLevel` — union literal
- `SpawnWaveResult` — result from `trySpawn`

---

## Solar System — MissionLogManager

`src/managers/MissionLogManager.ts` — mission log, waypoint management, and persistence for the open-world solar system.

**Public API:**
- `acceptMission(spec, npcId)` — validates spec.id in `MissionRegistry`, creates active `MissionLogEntry`, auto-sets primary waypoint (courier→`destinationLocationId`, trade→NPC's first `LocationRegistry` location), persists. Throws `MissionLogError` if id unknown or already in log. Only one entry may hold each slot globally (previous holder is cleared).
- `getMissionLog()` — returns shallow copy of all entries (active, completed, failed, abandoned).
- `getCompletedMissionIds()` — returns live `ReadonlySet<string>` for prerequisite checks.
- `completeMission(missionId)` — marks entry completed, clears all its waypoint slots, adds to completedSet, returns `MissionRewards {credits, reputation, items}`, persists. Throws if id not in log.
- `setWaypoint(missionId, type, targetId)` — validates targetId in `LocationRegistry`, clears the slot's current holder, assigns, persists. Only active missions can be modified. Throws `MissionLogError` on bad id/location/status.
- `clearWaypoint(missionId, type)` — nulls the slot on the entry, persists. Only active missions.
- `getWaypoints()` — returns up to 3 `Waypoint` objects (one per occupied slot type), filtered to active missions only. Colours: primary=cyan(0,255,255), secondary=yellow(255,255,0), tertiary=magenta(255,0,255).
- `load()` — loads from `rwipe.missions.v1`; returns `true` if data found.
- `reset()` — clears in-memory state and removes storage entry (new-game / test teardown).

**Constructor:** `new MissionLogManager(storageBackend?)` — pass `new InMemoryStorage()` in tests.

**Storage key:** `MISSIONS_STORAGE_KEY = "rwipe.missions.v1"` (schema v1, exported from `LocalStorageService`).

**Static registries (same package — no mocking needed in tests):**
- `MissionRegistry` (`src/game/data/MissionRegistry.ts`) — 18 missions across 5 factions; `getMission(id)`, `getMissionsByFaction`, `getMissionsByNPC`, `getMissionsByType`.
- `LocationRegistry` (`src/game/data/LocationRegistry.ts`) — 10 locations; `getLocation(id)`, `getLocationsForNPC(npcId)`, `getLocationsByFaction`, `getLocationsByBody`.

## Testing

Tests live in `src/**/*.test.ts`. Node-environment safe — nothing Pixi-bound.

## Commit style

`feat: ...` / `fix: ...` / `chore: ...` subjects, body bullets on "why", trailing `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

## Known-good incantations

- Full preflight: `pnpm exec tsc --noEmit && pnpm test && pnpm build`.
- Run just typecheck: `pnpm exec tsc --noEmit`.
- Dev server: `pnpm dev`.

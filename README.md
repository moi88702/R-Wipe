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
| `ShipControlManager` | WASD/arrow-key movement physics + gravity integration |
| `SystemGateRegistry` | Static definitions for inter-system traversal gate pairs |
| `GateTeleportSystem` | Gate proximity detection + inter-system teleportation |
| `CombatSystem` | Space / B / V / C / X / Z weapon & ability activation for solar-system combat |
| `CombatManager` | Damage resolution, hit/miss calculation, ability cooldown enforcement |
| `DockingSystem` | Proximity detection + multi-gate docking permission (pure functions) |
| `DockingManager` | Dock/undock lifecycle, UI trigger (Dock button), session-state transitions |
| `LocationManager` | NPC dialogue (greeting/farewell/shop), shop inventory, buy/sell transactions |
| `StationUI` | Docked-station UI state machine: dock menu, NPC dialogue, shop, shipyard, undock |
| `ShipyardManager` | Ship blueprint modification: add/remove/change parts, validate, persist |
| `ShopRegistry` | Static shop item catalogue; maps shop ids → item lists with buy/sell pricing |
| `MissionLogManager` | Mission acceptance, log, waypoints, persistence |
| `EnemyStationRegistry` | Static definitions for hostile enemy strongholds |
| `EnemySpawnSystem` | Alert state machine, ship-spawn waves, station damage |
| `TargetLockManager` | Scanner-based target locking, multi-lock, LOS, "/" quick-lock |
| `EnemyAISystem` | Enemy aggression state machine, scanner targeting, per-frame AI tick |

## Solar system — Ship controls

`ShipControlManager` (`src/game/solarsystem/ShipControlManager.ts`) translates WASD / arrow-key input into velocity + heading changes with full gravitational physics each tick.

**Input mapping**:

| Key | Action |
|---|---|
| W | Forward thrust (ship's facing direction) |
| S | Reverse / retro-burn (opposite heading) |
| A | Rotate counter-clockwise (turn left) |
| D | Rotate clockwise (turn right) |
| ← ArrowLeft | Strafe left (perpendicular to heading) |
| → ArrowRight | Strafe right (perpendicular to heading) |
| Mouse heading target | Smooth turn-toward-cursor override |

**Physics model** (explicit Euler, per-tick order):
1. **Rotation** — heading += `turnRateRadPerS × Δt`, or closest-path turn toward mouse heading.
2. **Thrust** — `v += thrusterPower × Δt` in the forward direction; lateral (`strafePower`).
3. **Gravity** — `GravitySystem.applyGravity` applied to running velocity.
4. **Speed cap** — optional `maxSpeedMs` clamp before position integration.
5. **Position** — `pos_km += vel_ms × Δt_s / 1000`.

**Heading convention**: radians, 0 = North (−y screen), clockwise. Helper methods
`degreesToRadians` / `radiansToDegrees` bridge the degrees stored in `SolarSystemSessionState`.

**`InputState` additions** (optional fields populated by `InputHandler`):
- `thrustForward` (W key)
- `thrustReverse` (S key)
- `turnLeft` (A key)
- `turnRight` (D key)
- `abilityV` (V key — pulse, cleared by `endFrame()`)
- `abilityC` (C key — pulse)
- `abilityX` (X key — pulse)
- `abilityZ` (Z key — pulse)
- B key uses the existing `bomb` pulse field

```ts
import { ShipControlManager } from "./src/game/solarsystem/ShipControlManager";

const result = ShipControlManager.update(
  { position, velocity, headingRadians },
  { thrustForward: true, thrustReverse: false, turnLeft: false, turnRight: false,
    strafeLeft: false, strafeRight: false },
  { hullMass: 1000, thrusterPower: 150, turnRateRadPerS: Math.PI, maxSpeedMs: 500 },
  primaryGravityBody,  // CelestialBody | null
  deltaMs,
);
// result: { position, velocity, headingRadians, isThrustActive, isRotating }
```

## Solar system — CombatSystem

`CombatSystem` (`src/systems/CombatSystem.ts`) translates Space / B / V / C / X / Z key presses into weapon fire and ability activations, delegating all damage and cooldown resolution to `CombatManager`.

**Combat is disabled when `ship.isDocked === true`** — every action returns `reason: "docked"`.

**Input mapping**:

| Key | Action |
|---|---|
| Space | Fire primary weapon at focused lock target |
| B | Activate ability in the B slot (reuses InputState `bomb` field) |
| V | Activate ability in the V slot (`abilityV` pulse) |
| C | Activate ability in the C slot (`abilityC` pulse) |
| X | Activate ability in the X slot (`abilityX` pulse) |
| Z | Activate ability in the Z slot (`abilityZ` pulse) |

```ts
import { CombatSystem, CombatManager } from "./src/systems/combat";

const combatManager = new CombatManager();
const combatSystem  = new CombatSystem(combatManager);

// Register ships before they can fight
combatSystem.registerShip(playerShip);
combatSystem.registerShip(enemyShip);

// Each frame — construct CombatInput from InputState
const combatInput = {
  fireWeapon: inputState.fire,           // Space key
  abilityKeys: {
    B: inputState.bomb   ?? false,
    V: inputState.abilityV ?? false,
    C: inputState.abilityC ?? false,
    X: inputState.abilityX ?? false,
    Z: inputState.abilityZ ?? false,
  },
};

const result = combatSystem.tick(
  playerShip,
  focusedTargetId,    // string | null — current lock target
  combatInput,
  { B: "shield-boost-mk1", V: "evasive-maneuver-mk1" }, // abilityKeyMap
  "laser-mk1",        // primaryWeaponId
  lockStrength,       // 0–1, defaults to 1
);

// result.weapon   → WeaponFireResult  | undefined
// result.abilities → Partial<Record<AbilityKey, AbilityActivationResult>>
```

**Failure reasons:**
- `"docked"` — ship is docked; combat disabled.
- `"no-target"` — weapon fire without a focused target.
- `"no-weapon"` — weapon fire with `primaryWeaponId = null`.
- `"no-ability-equipped"` — ability key pressed with no mapping.
- `"not-available"` — CombatManager rejected (cooldown or insufficient energy).

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

## Solar system — Combat targeting

`TargetLockManager` and `EnemyAISystem` implement scanner-based targeting for both the player and AI-controlled enemy ships.

### TargetLockManager

Both player and enemies share the same manager; each ship owns an independent `TargetingState` object.

```ts
import { TargetLockManager } from "./src/systems/combat/TargetLockManager";
import { TargetLockManager as TLM } from "./src/systems/combat";

// Lock onto an enemy
const result = TargetLockManager.attemptLock(
  targetingState, shipPos, { id, name, position }, scanner, obstacles, nowMs,
);
// result: { success, lock?, reason? }

// Tab to cycle focused lock
TargetLockManager.cycleFocusedLock(targetingState, nowMs);

// "/" key — quick-lock nearest aggro'd enemy (evicts oldest if at cap)
TargetLockManager.quickLockNearestHostile(
  targetingState, shipPos, enemies, scanner, obstacles, nowMs,
);

// Per-frame validation — drop out-of-range or occluded locks
const broken = TargetLockManager.validateAllLocks(
  targetingState, shipPos, (id) => getPosition(id), scanner, obstacles,
);
```

**Scanner penetration levels** (minimum level to see through body type):

| Body     | Min level |
|----------|-----------|
| asteroid | 1         |
| moon     | 1         |
| planet   | 2         |
| star     | 3         |
| station  | ∞ (never) |

### EnemyAISystem

Drives enemy aggression and targeting each frame. Pure static API; caller owns one `EnemyAIState` per enemy.

```ts
import { EnemyAISystem } from "./src/systems/combat/EnemyAISystem";

// Spawn enemy
const enemy = EnemyAISystem.createState(id, name, pos, scanner, Aggression.NEUTRAL);

// Each frame
const { aggressionChanged, lockAcquired, brokenLockIds, shouldFire } =
  EnemyAISystem.tick(enemy, player, playerFiredOnEnemy, obstacles, nowMs);

if (shouldFire) {
  const lock = EnemyAISystem.getFocusedTarget(enemy);
  // aim enemy weapon at lock.targetId
}
```

**Aggression escalation** (one-way, never de-escalates):

| State    | Trigger                    | → New     |
|----------|----------------------------|-----------|
| NEUTRAL  | Player within 200 km       | VIGILANT  |
| NEUTRAL  | Player fires on enemy      | HOSTILE   |
| VIGILANT | Player fires on enemy      | HOSTILE   |
| HOSTILE  | (any)                      | HOSTILE   |

## Solar system — DockingManager

`DockingManager` (`src/managers/DockingManager.ts`) orchestrates the full docking
lifecycle: proximity detection, UI trigger logic, permission enforcement (via
`DockingSystem`), and session-state transitions on dock and undock.

`DockingSystem` provides the **pure geometry and permission functions**;
`DockingManager` wraps them and owns the mutable `SolarSystemSessionState`
side-effects.

**Relationship between the two**:

| Concern | Owner |
|---------|-------|
| Proximity geometry (distance ≤ dockingRadius) | `DockingSystem.checkProximity` |
| Permission gates (reputation / items / missions) | `DockingSystem.canDock` |
| Session mutation on dock | `DockingManager.dock()` |
| Session mutation on undock | `DockingManager.undock()` |
| "Dock" button visibility | `DockingManager.isDockButtonVisible()` |

### Usage

```ts
import { DockingManager } from "./src/managers/DockingManager";

const dockingManager = new DockingManager(); // one per play session

// Each frame — keep nearbyLocations current
dockingManager.updateNearbyLocations(session, allLocations);

// Drive the "Dock" button in the HUD
const showButton = dockingManager.isDockButtonVisible(session, allLocations);

// Player clicks the Dock button
const result = dockingManager.dock(
  session,
  targetLocation,
  playerFactionStanding,
  playerInventory,
  completedMissions,
);
if (!result.success) {
  displayDenialMessage(result.reason); // "low-reputation" | "missing-item" | …
}

// Player selects "Undock" from the dock menu (explicit only — never automatic)
const undockResult = dockingManager.undock(session);
// undockResult.restoredPosition === targetLocation.position (km)
```

### Session mutations on `dock()`

| Field | Before | After |
|-------|--------|-------|
| `session.dockedLocationId` | `null` | `location.id` |
| `session.playerVelocity` | any | `{ x: 0, y: 0 }` |
| `session.discoveredLocations` | any | `+ location.id` |
| Pre-dock snapshot | cleared | saved (pos / vel / heading / station pos) |

### Session mutations on `undock()`

| Field | Before | After |
|-------|--------|-------|
| `session.playerPosition` | any | docked station's world position (km) |
| `session.playerVelocity` | `{ x: 0, y: 0 }` | `{ x: 0, y: 0 }` |
| `session.playerHeading` | docked value | pre-dock heading restored |
| `session.dockedLocationId` | `location.id` | `null` |
| Pre-dock snapshot | saved | cleared |

### Dock button visibility contract

The button appears **only on proximity** — permission checks run when the
button is clicked, not when the player approaches.  This keeps the button
responsive and lets the UI show a denial reason *after* the player acts.

```
isDockButtonVisible returns true  ⟺  player is within location.dockingRadius
                                      AND  session.dockedLocationId === null
```

### Undocking is always explicit

`DockingManager` never auto-undocks.  The only way to clear `dockedLocationId`
is to call `undock()` — which the game loop must invoke from the dock-menu
"Undock" selection handler.

## Solar system — System Gates

`SystemGateRegistry` (`src/game/data/SystemGateRegistry.ts`) holds the static
definitions for all inter-system traversal gates.  Gates come in **pairs**: each
gate's `sisterGateId` points to the matching gate in another system, so
travelling through gate A deposits the player at gate B, and using gate B returns
the player to gate A.

`GateTeleportSystem` (`src/game/solarsystem/GateTeleportSystem.ts`) provides
the pure logic for proximity detection and executing the transit.

### Gate connections (current registry)

| Gate id | System | ↔ Sister | Destination |
|---|---|---|---|
| `gate-sol-to-kepler` | `sol` | `gate-kepler-to-sol` | `kepler-442` |
| `gate-kepler-to-sol` | `kepler-442` | `gate-sol-to-kepler` | `sol` |
| `gate-sol-to-proxima` | `sol` | `gate-proxima-to-sol` | `proxima-centauri` |
| `gate-proxima-to-sol` | `proxima-centauri` | `gate-sol-to-proxima` | `sol` |
| `gate-kepler-to-proxima` | `kepler-442` | `gate-proxima-to-kepler` | `proxima-centauri` |
| `gate-proxima-to-kepler` | `proxima-centauri` | `gate-kepler-to-proxima` | `kepler-442` |

### Usage

```ts
import { SystemGateRegistry } from "./src/game/data/SystemGateRegistry";
import { GateTeleportSystem }  from "./src/game/solarsystem/GateTeleportSystem";

// --- Each frame: check whether the player has entered a gate ---
const systemGates = SystemGateRegistry.getGatesBySystem(session.currentSystem.seed.name);
const triggeredGate = GateTeleportSystem.checkGateProximity(
  session.playerPosition,
  systemGates,
);

if (triggeredGate !== null) {
  const sisterGate       = SystemGateRegistry.getSisterGate(triggeredGate.id)!;
  const destinationSystem = loadSystem(triggeredGate.destinationSystemId); // caller provides

  const result = GateTeleportSystem.teleport(
    session,
    triggeredGate,
    sisterGate,
    destinationSystem,
  );

  if (result.success) {
    // session.currentSystem, playerPosition, primaryGravitySourceId updated
    // session.nearbyLocations reset to []
    // playerVelocity and playerHeading preserved
    showTransitEffect(result.newPlayerPosition);
  }
}
```

### Session mutations on `GateTeleportSystem.teleport()` (success path)

| Field | Before | After |
|-------|--------|-------|
| `session.currentSystem` | source system | destination `SolarSystemState` |
| `session.playerPosition` | near source gate | sister gate's `position` (km) |
| `session.primaryGravitySourceId` | source body id | destination primary body id |
| `session.nearbyLocations` | source ids | `[]` (stale ids cleared) |
| `session.playerVelocity` | any | **unchanged** (inertial continuity) |
| `session.playerHeading` | any | **unchanged** |

### Failure reasons

| Reason | Cause |
|--------|-------|
| `"docked"` | Player is docked at a station; transit blocked. |
| `"no-primary-body-in-destination"` | Destination `SolarSystemState` has no body with `isPrimaryGravitySource: true`. |

### Preventing immediate re-trigger

After a successful teleport the player arrives at the sister gate's exact
position — still inside the trigger radius.  The caller is responsible for
preventing an immediate re-trigger (e.g., one-frame cooldown flag or waiting
until the player exits the radius before re-arming the check).

## Solar System — HUD Visual Feedback

`HUDRenderer` (`src/rendering/HUDRenderer.ts`) renders the in-game HUD overlays
for solar-system combat mode, displaying:
- Target lock indicators (reticles and lock list)
- Ability cooldown bars (B/V/C/X/Z keys)
- Ship status bars (health and shields)
- Navigation waypoint markers

`HUDSystem` (`src/systems/HUDSystem.ts`) is a pure-logic data construction
system that builds `HUDRenderData` from game state each frame, converting:
- Target lock state to displayable lock list with focused lock highlighting
- Absolute millisecond cooldown values to 0–1 ratios (0 = ready, 1 = full)
- Waypoint navigation data to color-coded HUD markers

### HUDRenderer public API

```ts
import { HUDRenderer, type HUDRenderData } from "./src/rendering/HUDRenderer";

const hud = new HUDRenderer(1280, 720);

// Build HUD data from game state
const hudData: HUDRenderData = {
  playerLocks: targetingState,          // TargetingState (locks + focused id)
  shipHealth: 80,                       // current health
  shipMaxHealth: 100,                   // max health
  shipShield: 60,                       // current shield
  shipMaxShield: 100,                   // max shield
  abilityCooldowns: {
    B: 0.5,  // 0–1 ratio (0 = ready, 1 = full cooldown)
    V: 0,
    C: 0.3,
    X: 0,
    Z: 0,
  },
  waypointMarkers: [
    { name: "Sol", positionKm: {...}, color: 0xffff00, type: "primary" },
    { name: "Alpha Centauri", positionKm: {...}, color: 0xff00ff, type: "secondary" },
  ],
};

// Render all HUD elements
hud.renderTargetLocks(hudData);      // draws lock reticles and list
hud.renderAbilityCooldowns(hudData); // draws cooldown bars
hud.renderShipStatus(hudData);       // draws health/shield bars
hud.renderWaypoints(hudData);        // draws waypoint markers
```

### HUDSystem public API

```ts
import { HUDSystem } from "./src/systems/HUDSystem";

// Build HUD data from game state each frame
const hudData = HUDSystem.buildHUDData({
  playerTargetingState: targetingState,
  playerHealth: 80,
  playerMaxHealth: 100,
  playerShield: 60,
  playerMaxShield: 100,
  abilityCooldownsMs: {
    B: 1000,   // absolute milliseconds remaining
    V: 0,
    C: 2000,
    X: 500,
    Z: 0,
  },
  maxAbilityCooldownMs: {
    B: 5000,   // max cooldown for each ability
    V: 5000,
    C: 5000,
    X: 5000,
    Z: 5000,
  },
  currentWaypoints: [...], // optional Waypoint[] from MissionLogManager
});

// Pass hudData to HUDRenderer for display
hud.renderTargetLocks(hudData);
// ... etc
```

### Lock display contract

- All locks up to `scanner.maxSimultaneousLocks` appear in the HUD list.
- Exactly one lock is **focused** (`isFocused === true`); it receives weapons fire.
- Focused lock is highlighted visually (e.g., red reticle; background green).
- When focused lock breaks (out of range or destroyed), focus auto-shifts to next lock.
- Tab-cycling and HUD clicks change focus without breaking background locks.

### Cooldown display contract

- Each ability key (B/V/C/X/Z) has a cooldown bar.
- Cooldown ratio ranges 0–1 (0 = ready, 1 = full cooldown).
- Bar fills from left to right as cooldown progresses.
- When ratio is 0, key is ready to press.

### Status display contract

- Health bar shows as green at >25% health, red at ≤25%.
- Shield bar shows as blue; depletes first (absorbs 1 hit typically).
- Both bars display numeric values (e.g., "H: 60/100").

### Waypoint colors

- `primary` waypoint: yellow (0xffff00)
- `secondary` waypoint: magenta (0xff00ff)
- `tertiary` waypoint: cyan (0x00ffff)

These colors match the mission-log waypoint slot conventions.
## Solar system — Persistence

`SolarSystemPersistenceService` (`src/services/SolarSystemPersistenceService.ts`)
provides versioned save/load for all solar system session data. It mirrors the
pattern used by `MissionLogManager`, `FactionManager`, and `OverworldManager`:
uses `VersionedSlot<T>` from `LocalStorageService` for schema versioning and
migration support.

### Persisted state

The service saves and restores:

- **Player ship state**: position, velocity, heading, health, shields, weapons
- **Target locks**: all active locks, focused lock, lock timestamps
- **Docking state**: docked location id, pre-dock snapshot (for undocking)
- **Navigation**: primary gravity source, zoom level, discovered locations
- **Enemy stations**: hull, shields, alert level, spawned ship ids

### Usage

```ts
import { SolarSystemPersistenceService } from "./src/services/SolarSystemPersistenceService";

const persistenceService = new SolarSystemPersistenceService();

// Build a snapshot from current session state
const snapshot: PersistedSolarSystemState = {
  shipState: getCurrentShipState(),
  playerTargetingState: player.targetingState,
  dockedLocationId: session.dockedLocationId,
  preDockSnapshot: dockingManager.getPreDockSnapshot(),
  primaryGravitySourceId: session.primaryGravitySourceId,
  zoomLevel: session.zoomLevel,
  discoveredLocations: Array.from(session.discoveredLocations),
  enemyStationStates: getAllEnemyStationStates(),
  savedAtMs: Date.now(),
};

// Save on session exit or docking
persistenceService.save(snapshot);

// Load on session init
const saved = persistenceService.load();
if (saved) {
  restoreShipState(saved.shipState);
  restorePlayerLocks(saved.playerTargetingState);
  restoreSessionNavigation(saved.primaryGravitySourceId, saved.zoomLevel);
  // ...and so on
}

// Clear save (e.g. on "new game")
persistenceService.clear();
```

### Storage location

All solar system state lives in a single versioned localStorage slot:
- **Key**: `"rwipe.solarsystem.v1"`
- **Version**: Currently `1`
- **Migrations**: Defined in `solarSystemMigrations` (empty for v1)

To add a v1→v2 migration, populate `solarSystemMigrations[1]` with a transform
function and bump `SOLAR_SYSTEM_SCHEMA_VERSION` to `2`.

### Type guard and validation

The service validates the loaded payload before returning it, ensuring required
fields (`shipState`, `dockedLocationId`, `primaryGravitySourceId`) are present.
If validation fails or the stored version is incompatible, a `StorageMigrationError`
is thrown; callers typically catch and fall back to a fresh session.

## Solar system — Docked Station UI

### LocationManager (`src/managers/LocationManager.ts`)

Pure NPC/shop service for the docked-station experience. No Pixi dependency.

**NPC dialogue flow**:

```
startNPCInteraction(npc, locationId)
  → phase: "greeting", message: npc.dialogueGreeting
    options: ["continue", ("shop" if location has shops), "close"]

selectDialogueOption("continue")
  → phase: "farewell", message: npc.dialogueIdle, options: ["close"]

selectDialogueOption("shop")
  → transitionTo: "shop"  (caller shows shop screen; dialogue preserved)

selectDialogueOption("close")
  → transitionTo: "closed"  (dialogue dismissed)
```

**Shop API**:

```ts
const lm = new LocationManager();

// NPCs at a location (ordered by Location.npcs array)
lm.getNPCsAtLocation("station-alpha")  → NPCDefinition[]

// Shop items for the location (aggregated across all Location.shops)
lm.getShopInventory("station-alpha")   → ShopItem[]

// Transactions — caller owns the credit balance
lm.purchaseItem("item-medkit", 1000)   → { success: true, newBalance: 900, item }
lm.purchaseItem("item-medkit", 50)     → { success: false, reason: "insufficient-credits" }
lm.sellItem("item-medkit", 200)        → { success: true, creditsEarned: 50, newBalance: 250 }
```

Sell price = `floor(item.priceCredits × 0.5)`.

---

### StationUI (`src/managers/StationUI.ts`)

State machine for the docked-station interface. No Pixi dependency. The game
loop reads the returned `DockSessionState` snapshots and renders accordingly.

**Screen enum**: `"dock-main" | "npc-dialogue" | "npc-shop" | "shipyard"`

**Typical usage**:

```ts
const ui = new StationUI();

// 1. Player docks — open the dock menu
const s0 = ui.openDockMenu(location, playerCredits);
// s0.screen === "dock-main"
// s0.availableMenuOptions: [{ id:"npc", available:true }, { id:"shipyard", ... }, { id:"undock", ... }]

// 2. Player selects "Talk to NPC"
const s1 = ui.selectMenuItem("npc");
// s1.screen === "npc-dialogue"
// s1.dialogue.phase === "greeting"
// s1.dialogue.message === npc.dialogueGreeting

// 3a. Player selects "continue" (farewell)
const s2a = ui.selectDialogueOption("continue");
// s2a.dialogue.phase === "farewell"

// 3b. Player selects "close" from farewell → back to dock-main
const s3b = ui.selectDialogueOption("close");
// s3b.screen === "dock-main"

// ── OR ──────────────────────────────────────────────────────────────────────

// 3c. Player selects "shop" → shop screen
const s2c = ui.selectDialogueOption("shop");
// s2c.screen === "npc-shop", s2c.shopItems populated

// Buy an item
const buyResult = ui.purchaseItem("item-medkit");
// buyResult.success, buyResult.newBalance
// ui.getSessionState().playerCredits reflects the deduction

// Sell an item
const sellResult = ui.sellItem("item-medkit");
// sellResult.creditsEarned === 50 (floor(100 * 0.5))

// Return to main menu
const s3c = ui.returnToMainMenu();
// s3c.screen === "dock-main"

// ── Undock ───────────────────────────────────────────────────────────────────

// 4. Player selects "Undock"
const s4 = ui.selectMenuItem("undock");
// s4.undockTriggered === true
// Caller invokes: dockingManager.undock(session) then ui.closeDockSession()
```

**`DockMenuOption.available`** — when `false` the option is greyed out:
- `"npc"` — `false` when `location.npcs` is empty.
- `"shipyard"` — `false` when `location.type !== "station"`.
- `"undock"` — always `true`.

**Credit tracking** — `playerCredits` in the session state is updated
immediately on each `purchaseItem` / `sellItem` call so the HUD always shows
the correct live balance.

**Undock handoff pattern**:

```ts
if (state.undockTriggered) {
  const undockResult = dockingManager.undock(solarSystemSession);
  // undockResult.restoredPosition === location.position (km)
  ui.closeDockSession();
  switchToCombatScreen();
}
```

---

### ShopRegistry (`src/game/data/ShopRegistry.ts`)

Static catalogue of all purchasable items and their shop assignments.

```ts
ShopRegistry.getShopItems("shop-tf-alpha")  → ShopItem[]   // items at one shop
ShopRegistry.getItem("item-medkit")         → ShopItem | undefined
ShopRegistry.getSellPrice("item-medkit")    → 50            // floor(100 * 0.5)
ShopRegistry.getAllItems()                  → readonly ShopItem[]
ShopRegistry.getAllShopIds()                → string[]
```

**`ShopItem`** fields: `id`, `name`, `category` (`"weapon"|"ability"|"equipment"|"consumable"`), `priceCredits`, `description`.

Shop ids match the `Location.shops` array in `LocationRegistry`.

## Dev cheats (dev only)

URL query params — active in `pnpm dev` builds only, tree-shaken from prod. All params are optional and can be combined freely.

| Param | Values | Effect |
|---|---|---|
| `god` | `1` / `0` | Invulnerability |
| `lives` | integer | Starting lives count |
| `shield` | `1` | Activate shield immediately |
| `speed` | number | Ship speed multiplier |
| `weapon` | `spread` / `laser` / `bomb` / … | Force weapon type |
| `weaponLevel` | 1–5 | Force weapon upgrade level |
| `megaLaserMs` | integer | Pre-charge mega-laser by N ms |
| `startLevel` | integer | Skip to level N |
| `autostart` | `1` | Skip title screen, start immediately |
| `unlockParts` | `1` | Unlock all ship parts in shipyard |
| `credits` | integer | Set credit balance |

**Arcade mode god-run (quick testing / shipyard)**
```
http://localhost:5173/?god=1&weapon=spread&weaponLevel=5&lives=99&shield=1&speed=2&autostart=1
```

**Shipyard / parts testing with full credits**
```
http://localhost:5173/?unlockParts=1&credits=99999
```

**Full-power arcade run with no death pressure**
```
http://localhost:5173/?god=1&weapon=spread&weaponLevel=5&lives=99&shield=1&speed=2&autostart=0&unlockParts=1&credits=99999
```

---

## E2E test scenes (dev only)

Available in **dev builds only** (`pnpm dev`). Append query params to the dev server URL. All save/load is suppressed while any `e2e` param is active — the session is fully ephemeral.

### Named presets

| URL | What it tests |
|-----|---------------|
| `?e2e=1&e2e_scene=10v1` | 10 fighters ringed around the player — basic combat stress test |
| `?e2e=1&e2e_scene=5v20` | 20 scouts vs player — enemy death, break-up, and loot drops |
| `?e2e=1&e2e_scene=death` | 1 gunship 100 km away — quick death/respawn sequence check |
| `?e2e=1&e2e_scene=station` | Pirate station at (300,0) + 5 fighters — station shield, docking, and turrets |

### Custom scenes

Build any scene from individual params:

```
?e2e=1
  &e2e_pos=0,0                      player start in km (default: 0,0)
  &e2e_ship=starter                 blueprint name hint
  &e2e_enemies=fighter:10           type:count  (sizeClass defaults to 1)
  &e2e_enemies=titan:1:4            type:count:sizeClass
  &e2e_enemies=scout:5@100,0        type:count@cx,cy  (ring centre override)
  &e2e_enemies=fighter:3;scout:2    multiple types, ;-separated
  &e2e_station=pirate@300,0         faction@x,y
  &e2e_station=earth@-200,0;mars@0,400
```

Enemy type names (case-insensitive): `scout` `interceptor` `fighter` `gunship` `destroyer` `predator` `wraith` `titan` `spectre` `ravager`

Station factions: `pirate` `earth` `mars`

### Example URLs

**Capital carrier vs battle-cruiser fleet**
```
http://localhost:5173/?e2e=1&e2e_pos=0,0&e2e_enemies=titan:1:4@800,0&e2e_enemies=destroyer:6:3@550,0&e2e_enemies=gunship:4:2@600,100
```
You fly a capital-class carrier; the enemy fleet is a heavy destroyer screen with gunship escort.

**Same fleet with a pirate station behind enemy lines**
```
http://localhost:5173/?e2e=1&e2e_pos=0,0&e2e_enemies=titan:1:4@900,0&e2e_enemies=destroyer:6:3@650,0&e2e_enemies=gunship:4:2@700,80&e2e_station=pirate@1100,0
```
Adds a pirate stronghold at (1100, 0) — tests station shields under combined arms assault.

**Quick death + respawn check**
```
http://localhost:5173/?e2e=1&e2e_scene=death
```

**Loot + enemy break-up stress test**
```
http://localhost:5173/?e2e=1&e2e_scene=5v20
```

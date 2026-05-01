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

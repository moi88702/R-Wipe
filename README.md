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
| `CombatSystem` | Space / B / V / C / X / Z weapon & ability activation for solar-system combat |
| `CombatManager` | Damage resolution, hit/miss calculation, ability cooldown enforcement |
| `DockingSystem` | Proximity detection + multi-gate docking permission |
| `MissionLogManager` | Mission acceptance, log, waypoints, persistence |
| `EnemyStationRegistry` | Static definitions for hostile enemy strongholds |
| `EnemySpawnSystem` | Alert state machine, ship-spawn waves, station damage |

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

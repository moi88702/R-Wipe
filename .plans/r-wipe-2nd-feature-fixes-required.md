# Solar System Integration Implementation Plan

## Context

The R-Wipe codebase has comprehensive solar system subsystems fully impleme
nted (gravity, docking, gates, combat, factions, missions, persistence) but
 they are completely disconnected from the main game loop. The user expects
:

1. **Main game mode**: Top-down solar system exploration with real-time fli
ght, planets, stations, enemy ships, warp gates
2. **Controls**: WASD movement, mouse aiming, combat abilities (B/V/C/X/Z),
 shooting (Space)
3. **Away missions**: Transitions from solar system to arcade side-scroller
 for surface/station missions
4. **Map screen**: View different solar systems and stargate connections
5. **Persistence**: Money, resources, ship parts, mission progress

**Current state**: All building blocks exist but nothing is orchestrated. S
olar system physics, docking, combat systems are ready but have no game loo
p calling them, no rendering, and no menu entry point.

---

## Implementation Strategy

### Phase 1: Foundation (Core Game Loop Integration)

#### 1.1 Add "solar-system" ScreenType
**File**: `src/types/index.ts` (line 563-571)
- Add `| "solar-system"` to ScreenType union
- Also need `| "solar-system-paused"` for pause overlay during solar system
 play

#### 1.2 Create SolarSystemSessionManager
**New file**: `src/managers/SolarSystemSessionManager.ts`
- Owns `SolarSystemSessionState` (player position, velocity, heading, zoom,
 docked location, discovered locations, nearby locations)
- Owns `CapitalShipState` (ship health, shields, targeting, equipment)
- Initialization: Load from persistence service or create new via `SolarSys
temPersistenceService`
- Coordinates all subsystem updates (gravity, docking, gates, combat)
- Provides accessors for position, velocity, etc.

#### 1.3 Integrate into GameManager Constructor
**File**: `src/game/GameManager.ts` (lines 118-147)
- Instantiate `SolarSystemSessionManager`
- Instantiate `DockingManager` (already exists but unused)
- Instantiate `FactionManager` (already exists but unused)
- Instantiate `MissionLogManager` (already exists but unused)
- Initialize capital ship state from equipped blueprint

#### 1.4 Add updateSolarSystem() Case to tick()
**File**: `src/game/GameManager.ts` (lines 189-225)
- Add `else if (screen === "solar-system") { this.updateSolarSystem(clamped
); }`
- Implement `updateSolarSystem(deltaMs)` with:
  - Input polling (WASD, fire, abilities, pointer)
  - Ship control physics via `ShipControlManager.update()`
  - Gravity application via `GravitySystem.applyGravity()`
  - Docking proximity check via `DockingManager.updateNearbyLocations()`
  - Gate proximity check via `GateTeleportSystem.checkGateProximity()`
  - Combat simulation via `CombatSystem.tick()`
  - HUD data construction via `HUDSystem.buildHUDData()`
  - Rendering via `renderer.renderFrame()` with solar system extras

---

### Phase 2: Rendering

#### 2.1 Add SolarSystemRenderData Type
**File**: `src/rendering/GameRenderer.ts` (new)
- Extends existing render contract with solar system-specific fields:
  - `celestialBodies` - stars, planets, moons to draw (position, radius, co
lor)
  - `ships` - enemy capital ships, allies, player ship (position, rotation,
 heading, health bar)
  - `locations` - dockable stations (position, name, faction, docking range
 indicator)
  - `gates` - system gates (position, trigger radius, destination indicator
)
  - `resources` - harvestable deposits visible on map
  - `trails` - ship movement trails/exhaust
  - `waypointMarkers` - mission objectives (color-coded)
  - `hudData` - HUDRenderData from HUDSystem
  - `zoomLevel` - current map zoom (0.5–3.0)
  - `viewportCenter` - camera position (usually player ship)

#### 2.2 Add Solar System Rendering Methods
**File**: `src/rendering/GameRenderer.ts`
- `drawSolarSystem(data: SolarSystemRenderData)` - main entry point
  - Clear solarSystemLayer
  - Draw background (stars, nebulae, starfield)
  - Draw celestial bodies (planets, moons, asteroids as circles with colors
)
  - Draw locations/stations (icon + name label)
  - Draw gates (warp gate visual indicator)
  - Draw enemy ships (with rotation)
  - Draw player ship (centered or offset based on zoom)
  - Draw HUD overlay (lock reticles, cooldowns, waypoints)
  - Draw docking button if in range
  - Draw location menu if docked

#### 2.3 Add SolarSystemLayer to GameRenderer Constructor
**File**: `src/rendering/GameRenderer.ts` (line 350+)
- Create `private readonly solarSystemGfx: Graphics`
- Create `private readonly solarSystemLayer: Container`
- Add to appropriate layer hierarchy (below HUD, above game layer)

#### 2.4 Update renderFrame() Dispatch
**File**: `src/rendering/GameRenderer.ts` (line 867-943)
- Add case for `"solar-system"` screen:
  - Call `this.drawSolarSystem(extras.solarSystem)`
- Ensure HUD layer is visible for solar system mode

---

### Phase 3: Input Wiring

#### 3.1 Complete InputHandler for Solar System
**File**: `src/input/InputHandler.ts`
- Implement missing controls:
  - **Strafe left/right**: Add `strafeLeft`, `strafeRight` to `InputState`
(← / → arrow keys)
  - **Tab cycling**: Implement Tab key handling for target cycling
  - **Quick lock ("/")**: Implement "/" key for quick-lock nearest hostile
  - **Mouse heading**: Wire up mouse pointer to optional `mouseHeadingTarge
t` in input

#### 3.2 Wire Input to ShipControlManager in updateSolarSystem()
**File**: `src/game/GameManager.ts`
- Extract movement input from `input.poll()`
- Call `ShipControlManager.update(currentShip, movementInput, config, prima
ryBody, deltaMs)`
- Update ship velocity, heading, position from result

#### 3.3 Wire Input to CombatSystem
**File**: `src/game/GameManager.ts`
- Extract combat input (Space, B, V, C, X, Z)
- Call `CombatSystem.tick(ship, input, deltaMs)`
- Apply damage results to enemy ships
- Apply ability effects to ship state

---

### Phase 4: Docking & Away Missions

#### 4.1 Implement Docking Flow
**File**: `src/game/GameManager.ts` in updateSolarSystem()
- When docking button clicked:
  - Call `DockingManager.dock(location)`
  - If successful: set screen to `"docked"` (show location menu)
  - If denied: show denial reason in HUD

#### 4.2 Create Docked Location Menu Screen
**File**: `src/game/GameManager.ts`
- New case in tick(): `else if (screen === "docked") { this.updateDocked(cl
amped); }`
- Show menu: Talk to NPCs, Shipyard, Accept Mission, Undock
- Handle selections and transitions

#### 4.3 Away Mission Transition
**File**: `src/game/GameManager.ts`
- When "Start Mission" selected from docked menu:
  - Save capital ship state via `SolarSystemPersistenceService`
  - Load mission spec from `MissionRegistry`
  - Initialize arcade mode with mission parameters (enemy types, objective,
 etc.)
  - Set screen to `"gameplay"`
  - Mission completion triggers return to solar system with `startSolarSyst
em()`

#### 4.4 Undocking Transition
**File**: `src/game/GameManager.ts`
- When "Undock" selected from docked menu:
  - Call `DockingManager.undock()` (restores ship position, velocity, headi
ng)
  - Set screen back to `"solar-system"`

---

### Phase 5: Map Screen & Navigation

#### 5.1 Implement Map Screen
**File**: `src/game/GameManager.ts`
- New case: `else if (screen === "system-map") { this.updateSystemMap(clamped); }`
- Display all solar systems as nodes
- Show stargate connections as lines
- Display legend (distance, travel time estimate, hazards)
- Allow clicking to view system details or set destination

#### 5.2 System Details Panel
- Show celestial bodies, stations, factions controlling locations
- Estimated resources/loot
- Estimated difficulty
- "Set Destination" button

#### 5.3 Navigation via Gates
- When gate proximity detected, show "Jump" prompt
- On selection: call `GateTeleportSystem.teleport()`, update position, fade to black, fade in at destination system

---

### Phase 6: Menu Integration

#### 6.1 Add Solar System Menu Item
**File**: `src/rendering/GameRenderer.ts` (line 2602)
- Modify `updateMainMenu()` to show 5 items instead of 4:
  - PLAY (arcade)
  - CAMPAIGN (starmap node-based)
  - SOLAR SYSTEM (main game mode - NEW)
  - SHIPYARD (builder)
  - STATS

#### 6.2 Wire Menu Selection
**File**: `src/game/GameManager.ts` in updateMenu()
- Add case for "solar-system" menu item
- Call `openSolarSystem()`

#### 6.3 Implement openSolarSystem()
**File**: `src/game/GameManager.ts` (new method)
- Load or initialize solar system session state
- Initialize capital ship from equipped blueprint
- Load faction standings
- Load mission log
- Set screen to `"solar-system"`
- Set initial zoom, camera position

---

### Phase 7: Missing Features

#### 7.1 Tab Key Cycling
**File**: `src/input/InputHandler.ts` + `src/systems/HUDSystem.ts`
- Detect Tab key press
- Call `TargetLockManager.cycleFocusedLock(targetingState, nowMs)`
- Update HUD focus highlight

#### 7.2 Quick Lock ("/") Key
**File**: `src/input/InputHandler.ts` + `src/systems/combat/`
- Detect "/" key press
- Call `TargetLockManager.quickLockNearestHostile()`
- Auto-focus nearest locked target

#### 7.3 Strafe Input
**File**: `src/input/InputHandler.ts`
- Map ← / → arrow keys to `strafeLeft` / `strafeRight`
- Pass to `ShipControlManager` which already supports strafing

---

## Critical Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `src/types/index.ts` | Add "solar-system" ScreenType | P0 |
| `src/game/GameManager.ts` | Add solar system manager, updateSolarSystem(), openSolarSystem() | P0 |
| `src/managers/SolarSystemSessionManager.ts` | NEW - orchestrator | P0 |
| `src/rendering/GameRenderer.ts` | Add solarSystemLayer, drawSolarSystem(), update dispatch | P0 |
| `src/input/InputHandler.ts` | Complete strafe, Tab, "/" key support | P1
|
| `src/systems/HUDSystem.ts` | Already exists, just needs to be called | P1 |
| `src/rendering/GameRenderer.ts` | Update main menu to 5 items including SOLAR SYSTEM | P1 |

## Integration Checklist

- [ ] Add "solar-system" to ScreenType
- [ ] Create SolarSystemSessionManager
- [ ] Instantiate managers in GameManager constructor
- [ ] Implement updateSolarSystem() game loop
- [ ] Add SolarSystemRenderData type
- [ ] Implement drawSolarSystem() rendering
- [ ] Add solarSystemLayer to renderer
- [ ] Wire WASD input to ShipControlManager
- [ ] Wire combat input to CombatSystem
- [ ] Implement docking flow
- [ ] Implement away mission transitions
- [ ] Add map screen
- [ ] Add SOLAR SYSTEM menu item (5th item)
- [ ] Implement Tab cycling
- [ ] Implement "/" quick lock
- [ ] Implement strafe input
- [ ] Test transitions: main menu → solar system → docking → away mission → back to solar system
- [ ] Test controls: WASD movement, shooting, abilities, docking
- [ ] Test rendering: planets, ships, stations, HUD, waypoints
- [ ] Test controls: WASD movement, shooting, abilities, docking
- [ ] Test rendering: planets, ships, stations, HUD, waypoints

## Testing Strategy

1. **Game loop**: Verify updateSolarSystem() runs when screen is "solar-system"
2. **Physics**: Player ship responds to WASD, gravity affects velocity, collision prevention works
3. **Rendering**: Planets, stations, ships, HUD elements all visible and positioned correctly
4. **Input**: All controls (WASD, Space, B/V/C/X/Z, Tab, "/") work as expected
5. **Docking**: Proximity detection triggers, docking succeeds/fails correctly, menu appears
6. **Away mission**: Transition to arcade mode, completion returns to solar system with ship state preserved
7. **Persistence**: State saves on exit, loads correctly on re-entry
8. **Map**: All systems visible, gates connect correctly, travel works

---

## Implementation Order

1. **Phase 1**: Foundation (ScreenType, managers, game loop) - Gets something working
2. **Phase 2**: Rendering (celestial bodies, ships, HUD) - Makes it visible
3. **Phase 3**: Input (WASD, combat, missing features) - Makes it playable
4. **Phase 4**: Docking & Away Missions - Enables full gameplay loop
5. **Phase 5**: Map Screen - Strategic navigation
6. **Phase 6**: Menu Integration - User can access the mode
7. **Phase 7**: Polish (Tab cycling, quick lock) - Refinement

This prioritization ensures playable functionality first, then extends to full feature set.

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

## Testing

Tests live in `src/**/*.test.ts`. Only PlayerManager has tests currently (3 cases). Node-environment safe — nothing Pixi-bound.

## Commit style

`feat: ...` / `fix: ...` / `chore: ...` subjects, body bullets on "why", trailing `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

## Known-good incantations

- Full preflight: `pnpm exec tsc --noEmit && pnpm test && pnpm build`.
- Run just typecheck: `pnpm exec tsc --noEmit`.
- Dev server: `pnpm dev`.

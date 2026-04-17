/**
 * GameManager – top-level orchestrator.
 *
 * Owns every subsystem and drives the per-frame update + render cycle based on
 * the current screen. Screen transitions (main-menu ↔ gameplay ↔ game-over) are
 * driven by input.
 */

import type { Application } from "pixi.js";
import type { DevCheats, PowerUp, Projectile, ScreenType } from "../types/index";
import { InputHandler } from "../input/InputHandler";
import { StateManager } from "../managers/StateManager";
import { PlayerManager } from "../managers/PlayerManager";
import { EnemyManager } from "../managers/EnemyManager";
import { LevelManager } from "../managers/LevelManager";
import { PowerUpManager } from "../managers/PowerUpManager";
import { CollisionSystem } from "../systems/CollisionSystem";
import { GameRenderer } from "../rendering/GameRenderer";
import { getBossDefinitionForLevel } from "../managers/BossRegistry";

/** Menu item ids used by updateMenu / updatePause. */
type MainMenuItem = "play" | "stats";
type PauseMenuItem = "continue" | "stats" | "quit";
const MAIN_MENU_ITEMS: readonly MainMenuItem[] = ["play", "stats"];
const PAUSE_MENU_ITEMS: readonly PauseMenuItem[] = ["continue", "stats", "quit"];

export interface GameManagerOptions {
  width: number;
  height: number;
}

/** Minimum delay between menu-confirm triggers so a held key doesn't re-fire. */
const MENU_DEBOUNCE_MS = 350;

export class GameManager {
  private readonly width: number;
  private readonly height: number;

  private readonly state: StateManager;
  private readonly input: InputHandler;
  private readonly player: PlayerManager;
  private readonly enemies: EnemyManager;
  private readonly level: LevelManager;
  private readonly powerUps: PowerUpManager;
  private readonly collisions: CollisionSystem;
  private readonly renderer: GameRenderer;

  private safeTimerMs = 0;
  private menuDebounceMs = 0;

  // Edge-triggered menu input tracking. `prev*` mirrors last frame's poll.
  private prevPausePressed = false;
  private prevMenuConfirmPressed = false;
  private prevMenuBackPressed = false;
  private prevUpPressed = false;
  private prevDownPressed = false;
  /** Active selection index within the current menu list. */
  private menuSelection = 0;
  /** Where the stats screen should return to when ESC/back is pressed. */
  private statsReturnTo: ScreenType = "main-menu";

  // Death / respawn state machine
  /** While > 0, gameplay is paused on a death explosion. */
  private deathAnimationMs = 0;
  /** True when the in-flight death animation should end in game-over (no lives). */
  private finalDeath = false;
  /** True while the post-respawn 3s invulnerability is still up for early-cancel on fire. */
  private respawnInvulnArmed = false;
  /** Rising-edge detection for fire: only cancel on a fresh press, not a held key. */
  private prevFirePressed = false;
  /** After respawn, require fire to be released once before it can cancel invuln. */
  private awaitingFireRelease = false;

  // Level transition state machine
  /** While > 0, gameplay is frozen on a "level clear" banner + lingering boss FX. */
  private levelTransitionMs = 0;

  constructor(app: Application, opts: GameManagerOptions) {
    this.width = opts.width;
    this.height = opts.height;

    this.state = new StateManager(opts.width, opts.height);
    this.input = new InputHandler();
    this.player = new PlayerManager(opts.width, opts.height);
    this.enemies = new EnemyManager(opts.width, opts.height);
    this.level = new LevelManager(opts.height);
    this.powerUps = new PowerUpManager();
    this.collisions = new CollisionSystem();
    this.renderer = new GameRenderer(app, opts.width, opts.height);
  }

  /**
   * Wire drag-to-move / hold-to-fire / double-tap-bomb / two-finger-pause
   * gestures to the given element (typically the Pixi canvas).
   */
  enableTouchControls(element: HTMLElement): void {
    this.input.attachTouch(element, this.width, this.height);
  }

  // ── Public loop entry ────────────────────────────────────────────────────

  tick(deltaMs: number): void {
    const clamped = Math.min(deltaMs, 100); // cap to avoid huge jumps on tab-switch

    this.menuDebounceMs = Math.max(0, this.menuDebounceMs - clamped);
    const screen = this.state.getScreen();

    if (screen === "main-menu") {
      this.updateMenu();
    } else if (screen === "gameplay") {
      this.updateGameplay(clamped);
    } else if (screen === "pause") {
      this.updatePause();
    } else if (screen === "stats") {
      this.updateStats();
    } else if (screen === "game-over") {
      this.updateGameOver();
    }

    // Commit edge-trigger prev-state AFTER all update*() have consumed edges.
    const input = this.input.poll();
    this.prevPausePressed = input.pause;
    this.prevMenuConfirmPressed = input.menuConfirm;
    this.prevMenuBackPressed = input.menuBack;
    this.prevUpPressed = input.moveUp;
    this.prevDownPressed = input.moveDown;

    this.renderFrame(clamped);

    // Clear one-frame touch pulses (bomb, menuConfirm, pause from a tap) so
    // they don't leak into the next frame. Must come after every poll() caller
    // in this tick has had a chance to see them.
    this.input.endFrame();
  }

  // ── Menu input helpers ───────────────────────────────────────────────────

  /** Moves the menu selection by ±1, wrapping, on Up/Down edge presses. */
  private stepMenuSelection(itemCount: number): void {
    const input = this.input.poll();
    const upEdge = input.moveUp && !this.prevUpPressed;
    const downEdge = input.moveDown && !this.prevDownPressed;
    if (upEdge) {
      this.menuSelection = (this.menuSelection - 1 + itemCount) % itemCount;
    }
    if (downEdge) {
      this.menuSelection = (this.menuSelection + 1) % itemCount;
    }
  }

  /** True when menuConfirm is newly pressed (edge-triggered). */
  private wasMenuConfirmPressed(): boolean {
    const input = this.input.poll();
    return input.menuConfirm && !this.prevMenuConfirmPressed;
  }

  /** True when menuBack is newly pressed (edge-triggered). */
  private wasMenuBackPressed(): boolean {
    const input = this.input.poll();
    return input.menuBack && !this.prevMenuBackPressed;
  }

  /** True when pause toggle (ESC/P) is newly pressed (edge-triggered). */
  private wasPausePressed(): boolean {
    const input = this.input.poll();
    return input.pause && !this.prevPausePressed;
  }

  /** Public accessor for the renderer. */
  getMenuSelection(): number {
    return this.menuSelection;
  }

  // ── Screen: main menu ────────────────────────────────────────────────────

  private updateMenu(): void {
    this.stepMenuSelection(MAIN_MENU_ITEMS.length);
    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      const pick = MAIN_MENU_ITEMS[this.menuSelection]!;
      if (pick === "play") {
        this.startNewRun();
      } else {
        this.openStats("main-menu");
      }
    }
  }

  // ── Screen: pause ────────────────────────────────────────────────────────

  private updatePause(): void {
    // ESC closes the pause menu (toggle off).
    if (this.wasPausePressed() || this.wasMenuBackPressed()) {
      this.menuSelection = 0;
      this.state.setScreen("gameplay");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }
    this.stepMenuSelection(PAUSE_MENU_ITEMS.length);
    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      const pick = PAUSE_MENU_ITEMS[this.menuSelection]!;
      if (pick === "continue") {
        this.menuSelection = 0;
        this.state.setScreen("gameplay");
      } else if (pick === "stats") {
        this.openStats("pause");
      } else if (pick === "quit") {
        // Finalize run so quit counts the session in all-time stats.
        this.state.finalizeRun("no-lives");
        this.menuSelection = 0;
        this.state.setScreen("main-menu");
      }
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    }
  }

  // ── Screen: stats ────────────────────────────────────────────────────────

  private updateStats(): void {
    if (
      (this.wasMenuBackPressed() || this.wasMenuConfirmPressed()) &&
      this.menuDebounceMs === 0
    ) {
      this.menuSelection = 0;
      this.state.setScreen(this.statsReturnTo);
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    }
  }

  private openStats(returnTo: ScreenType): void {
    this.statsReturnTo = returnTo;
    this.state.setScreen("stats");
    this.menuDebounceMs = MENU_DEBOUNCE_MS;
  }

  // ── Screen: game over ────────────────────────────────────────────────────

  private updateGameOver(): void {
    if (this.wasMenuConfirmPressed() && this.menuDebounceMs === 0) {
      this.state.setScreen("main-menu");
      this.menuSelection = 0;
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
    }
  }

  // ── Run lifecycle ────────────────────────────────────────────────────────

  private startNewRun(): void {
    this.state.resetRunStats();
    this.player.initialize(200, this.height / 2);
    this.powerUps.initialize();
    this.enemies.initialize();
    this.renderer.resetFx();
    this.renderer.resetGameOverFade();
    this.safeTimerMs = 0;
    this.deathAnimationMs = 0;
    this.finalDeath = false;
    this.respawnInvulnArmed = false;
    this.awaitingFireRelease = false;
    this.prevFirePressed = false;
    this.levelTransitionMs = 0;
    this.menuSelection = 0;

    const levelState = this.state.getGameState().levelState;
    this.level.startLevel(levelState, this.enemies);

    this.state.setScreen("gameplay");
    this.menuDebounceMs = MENU_DEBOUNCE_MS;
  }

  private startNextLevel(): void {
    const current = this.state.getGameState().levelState;
    const nextLevelNumber = current.levelNumber + 1;
    // Rebuild level state via a cheap trick: recreate the whole state object
    // by updating the fields the StateManager owns.
    const nextLevel = makeLevelState(nextLevelNumber);
    this.state.updateLevelState(nextLevel);
    this.state.updateRunStats({ levelReached: nextLevelNumber });

    this.player.resetForLevel();
    this.enemies.initialize();
    this.powerUps.initialize();
    this.renderer.resetFx();
    // Re-show a short arrival banner for the new level, naming the upcoming boss.
    const nextBoss = getBossDefinitionForLevel(nextLevelNumber);
    this.renderer.showLevelBanner(
      `LEVEL ${nextLevelNumber}`,
      `BOSS: ${nextBoss.displayName}`,
      1_400,
    );
    // A new level starts fresh — clear any leftover death/respawn state.
    this.deathAnimationMs = 0;
    this.finalDeath = false;
    this.respawnInvulnArmed = false;
    this.awaitingFireRelease = false;
    this.levelTransitionMs = 0;

    this.level.startLevel(
      this.state.getGameState().levelState,
      this.enemies,
    );
  }

  private gameOver(): void {
    this.state.finalizeRun("no-lives");
    this.state.setScreen("game-over");
    this.menuDebounceMs = MENU_DEBOUNCE_MS;
    this.renderer.beginGameOverFade();
  }

  /** Spawn a cluster of explosions at the ship's last position. */
  private triggerDeathExplosion(x: number, y: number, big: boolean): void {
    const mainSize = big ? 140 : 90;
    this.renderer.showExplosion(x, y, 0x00ffff, mainSize);
    this.renderer.showExplosion(x - 18, y + 12, 0xff8844, mainSize * 0.8);
    this.renderer.showExplosion(x + 16, y - 14, 0xffaa33, mainSize * 0.9);
    if (big) {
      this.renderer.showExplosion(x + 8, y + 22, 0xffffff, mainSize * 0.7);
      this.renderer.showExplosion(x - 22, y - 8, 0xff3366, mainSize * 0.75);
    }
  }

  // ── Screen: gameplay ─────────────────────────────────────────────────────

  private updateGameplay(deltaMs: number): void {
    const input = this.input.poll();
    const firePressed = input.fire && !this.prevFirePressed;
    this.prevFirePressed = input.fire;

    // ── ESC opens the pause menu ───────────────────────────────────────────
    // Never pause during death/level-transition so those animations can finish.
    if (
      this.wasPausePressed() &&
      this.deathAnimationMs === 0 &&
      this.levelTransitionMs === 0 &&
      this.menuDebounceMs === 0
    ) {
      this.menuSelection = 0;
      this.state.setScreen("pause");
      this.menuDebounceMs = MENU_DEBOUNCE_MS;
      return;
    }

    // ── Level transition path: freeze gameplay, let FX finish ──────────────
    if (this.levelTransitionMs > 0) {
      this.levelTransitionMs -= deltaMs;
      // Keep power-ups drifting so nothing snaps, but no collisions.
      this.powerUps.update(deltaMs);
      if (this.levelTransitionMs <= 0) {
        this.levelTransitionMs = 0;
        this.startNextLevel();
      }
      return;
    }

    // ── Death animation path: freeze player, let the world keep moving ─────
    if (this.deathAnimationMs > 0) {
      this.deathAnimationMs -= deltaMs;
      const frozen = this.player.getState();
      // Enemies / projectiles / power-ups keep moving for visual continuity,
      // but no collisions are processed while the ship is dead.
      this.enemies.setCurrentLevel(this.state.getGameState().levelState);
      this.enemies.update(deltaMs, frozen);
      this.powerUps.update(deltaMs);

      if (this.deathAnimationMs <= 0) {
        this.deathAnimationMs = 0;
        if (this.finalDeath) {
          this.gameOver();
          return;
        }
        this.player.respawn(200, this.height / 2, 3_000);
        this.respawnInvulnArmed = true;
        this.awaitingFireRelease = input.fire; // if fire is already held, wait for release
        this.state.updatePlayerState(this.player.getState());
      }
      return;
    }

    // ── Respawn-invulnerability early-cancel on fire press ─────────────────
    if (this.respawnInvulnArmed) {
      const ps = this.player.getState();
      if (ps.invulnerabilityTimer <= 0) {
        this.respawnInvulnArmed = false;
        this.awaitingFireRelease = false;
      } else if (this.awaitingFireRelease) {
        if (!input.fire) this.awaitingFireRelease = false;
      } else if (firePressed) {
        this.player.cancelInvulnerability();
        this.respawnInvulnArmed = false;
      }
    }

    // Subsystem updates
    this.player.update(deltaMs, input);
    const playerState = this.player.getState();
    // Keep StateManager's playerState mirror in sync so the renderer reads live values.
    this.state.updatePlayerState(playerState);
    this.enemies.setCurrentLevel(this.state.getGameState().levelState);
    this.enemies.update(deltaMs, playerState);
    this.powerUps.update(deltaMs);
    this.level.update(deltaMs, this.state.getGameState().levelState, this.enemies);

    // Time-alive / safe-timer tracking
    const run = this.state.getCurrentRunStats();
    let timeAliveMs = run.timeAliveMs + deltaMs;
    this.safeTimerMs += deltaMs;
    const longestSafe = Math.max(
      run.longestTimeWithoutDamageSec,
      this.safeTimerMs / 1_000,
    );

    // Collisions
    const events = this.collisions.update(
      playerState,
      this.player.getProjectiles(),
      this.enemies.getProjectiles(),
      this.enemies.getEnemies(),
      this.powerUps.getActivePowerUps(),
    );

    let scoreDelta = 0;
    let enemiesKilledDelta = 0;
    let consecutiveHits = run.consecutiveHits;
    let peakConsecutiveHits = run.peakConsecutiveHits;
    let totalDamageReceived = run.totalDamageReceived;
    let didDie = false;

    // Dedupe projectile hits: if one projectile hits multiple enemies in a
    // single frame, only the first one counts.
    const consumedProjectiles = new Set<string>();

    for (const ev of events) {
      if (ev.type === "enemy-hit-by-projectile" && ev.enemyId && ev.projectileId) {
        if (consumedProjectiles.has(ev.projectileId)) continue;
        consumedProjectiles.add(ev.projectileId);

        const result = this.enemies.onProjectileHit(ev.enemyId, ev.damage);
        this.player.killProjectile(ev.projectileId);

        if (result.defeated) {
          scoreDelta += result.bounty;
          if (result.enemyType !== "boss") {
            enemiesKilledDelta += 1;
            this.powerUps.onEnemyDefeated(result.position.x, result.position.y);
          }
          if (result.enemyType) {
            this.renderer.showEnemyDefeated(
              result.position.x,
              result.position.y,
              result.enemyType,
            );
          }
        }
        consecutiveHits += 1;
        if (consecutiveHits > peakConsecutiveHits) peakConsecutiveHits = consecutiveHits;
      } else if (ev.type === "player-hit-by-projectile" && ev.projectileId) {
        this.enemies.killProjectile(ev.projectileId);
        const dmgResult = this.player.takeDamage(ev.damage);
        if (!dmgResult.blocked) {
          totalDamageReceived += ev.damage;
          consecutiveHits = 0;
          this.safeTimerMs = 0;
          this.renderer.showHitFlash();
        }
        if (dmgResult.died && !this.player.getState().isAlive) {
          didDie = true;
        }
      } else if (
        ev.type === "enemy-projectile-shot-down" &&
        ev.projectileId &&
        ev.enemyProjectileId
      ) {
        if (consumedProjectiles.has(ev.projectileId)) continue;
        consumedProjectiles.add(ev.projectileId);
        const r = this.enemies.damageEnemyProjectile(ev.enemyProjectileId, ev.damage);
        this.player.killProjectile(ev.projectileId);
        if (r.destroyed) {
          this.renderer.showExplosion(r.position.x, r.position.y, 0xffaa33, 38);
        }
      }
    }

    // ── Enemy homing-missile detonation (proximity OR lifetime expiry) ─────
    const missileDamage = this.detonateEnemyMissiles(deltaMs);
    if (missileDamage > 0) {
      totalDamageReceived += missileDamage;
      consecutiveHits = 0;
      this.safeTimerMs = 0;
      this.renderer.showHitFlash();
      if (!this.player.getState().isAlive) {
        didDie = true;
      }
    }

    // ── Proximity-bomb detonation ──────────────────────────────────────────
    this.detonateProximityBombs();

    // ── Player panic-bomb detonation (B-key / bomb credit) ─────────────────
    this.detonatePlayerPanicBombs();

    // ── Mega-laser continuous damage ──────────────────────────────────────
    if (playerState.megaLaserMs > 0) {
      const beamDeltas = this.applyMegaLaserDamage(playerState, deltaMs);
      scoreDelta += beamDeltas.scoreDelta;
      enemiesKilledDelta += beamDeltas.killed;
    }

    // Shoot-to-collect: any player projectile overlapping an active power-up
    // consumes the projectile and collects the power-up.
    const runStatsMutable = { ...run } as typeof run;
    const shotIds = new Set<string>();
    const activePowerUpsList = this.powerUps.getActivePowerUps();
    for (const proj of this.player.getProjectiles()) {
      if (!proj.isAlive) continue;
      for (const pu of activePowerUpsList) {
        if (pu.isCollected || shotIds.has(pu.id)) continue;
        if (this.collisions.checkOverlap(proj, pu)) {
          this.player.killProjectile(proj.id);
          shotIds.add(pu.id);
          break;
        }
      }
    }
    const shotCollections = this.powerUps.collectByIds(
      Array.from(shotIds),
      this.player,
      runStatsMutable,
    );
    for (const c of shotCollections) {
      this.renderer.showPowerUpCollected(c.feedback.x, c.feedback.y, c.type);
    }

    // Touch-collect: any power-up overlapping the player
    const touchCollections = this.powerUps.checkAndApply(
      playerState,
      this.player,
      runStatsMutable,
    );
    for (const c of touchCollections) {
      this.renderer.showPowerUpCollected(c.feedback.x, c.feedback.y, c.type);
    }

    if (shotCollections.length > 0 || this.powerUps.isStatsDirty()) {
      this.state.updateRunStats({
        shieldsCollected: runStatsMutable.shieldsCollected,
        extraLivesCollected: runStatsMutable.extraLivesCollected,
        gunUpgradeAchieved: runStatsMutable.gunUpgradeAchieved,
      });
      if (this.powerUps.isStatsDirty()) this.powerUps.clearStatsDirty();
    }

    // Re-sync player mirror after damage/power-up effects so the HUD is current.
    this.state.updatePlayerState(this.player.getState());

    // Commit stats
    this.state.updateRunStats({
      timeAliveMs,
      score: run.score + scoreDelta,
      enemiesKilled: run.enemiesKilled + enemiesKilledDelta,
      consecutiveHits,
      peakConsecutiveHits,
      totalDamageReceived,
      longestTimeWithoutDamageSec: longestSafe,
    });

    // Level state stats snapshot (for the renderer)
    this.state.updateLevelState({
      enemiesDefeated: this.state.getGameState().levelState.enemiesDefeated + enemiesKilledDelta,
      isBossPhase: this.level.isBossPhase(this.enemies),
      durationMs: this.state.getGameState().levelState.durationMs + deltaMs,
    });

    // Level complete → begin between-level transition. Boss explosion is
    // already in flight; hold for ~2s so the player sees it finish, then
    // hand off to startNextLevel() from the transition path.
    if (this.level.isLevelComplete(this.enemies)) {
      const nextLevelNumber = this.state.getGameState().levelState.levelNumber + 1;
      this.levelTransitionMs = 2_000;
      this.renderer.showLevelBanner(
        `LEVEL ${nextLevelNumber - 1} CLEAR`,
        `PREPARING LEVEL ${nextLevelNumber}`,
        2_000,
      );
      return;
    }

    // Death → start explosion animation. Respawn or game-over happens when
    // the animation finishes (handled at the top of the next updateGameplay).
    if (didDie) {
      const lastPos = this.player.getState().position;
      const livesRemaining = this.player.getState().lives;
      this.finalDeath = livesRemaining <= 0;
      this.deathAnimationMs = this.finalDeath ? 1_400 : 1_000;
      this.triggerDeathExplosion(lastPos.x, lastPos.y, this.finalDeath);
      return;
    }
  }

  // ── Enemy homing missile detonation ──────────────────────────────────────

  /**
   * Walks active enemy projectiles; any homing missile that is either close
   * enough to the player (within `proxTriggerRadius`) or has reached the end
   * of its lifetime detonates. The blast kills the missile and damages the
   * player if inside `proxBlastRadius`.
   *
   * Returns the raw damage dealt to the player (for run-stat bookkeeping).
   */
  private detonateEnemyMissiles(deltaMs: number): number {
    const playerState = this.player.getState();
    let damageDealt = 0;
    for (const p of this.enemies.getProjectiles()) {
      if (!p.isAlive || !p.isHoming) continue;
      const trigger = p.proxTriggerRadius ?? 0;
      const blast = p.proxBlastRadius ?? 0;
      if (trigger <= 0 && blast <= 0) continue;

      const dx = playerState.position.x - p.position.x;
      const dy = playerState.position.y - p.position.y;
      const distSq = dx * dx + dy * dy;
      const inTrigger = trigger > 0 && distSq <= trigger * trigger;
      const expiring = p.lifetime <= deltaMs;
      if (!inTrigger && !expiring) continue;

      if (blast > 0 && distSq <= blast * blast) {
        const result = this.player.takeDamage(p.damage);
        if (!result.blocked) damageDealt += p.damage;
      }
      this.enemies.killProjectile(p.id);
      this.renderer.showExplosion(p.position.x, p.position.y, 0xff6633, blast * 1.3);
    }
    return damageDealt;
  }

  // ── Proximity bombs ──────────────────────────────────────────────────────

  /**
   * Walks active player projectiles; any "prox-bomb" that has an enemy within
   * its proxTriggerRadius detonates (kills itself) and deals damage to every
   * enemy inside proxBlastRadius.
   */
  private detonateProximityBombs(): void {
    const enemies = this.enemies.getEnemies();
    for (const proj of this.player.getProjectiles()) {
      if (!proj.isAlive || proj.kind !== "prox-bomb") continue;
      const trigger = proj.proxTriggerRadius ?? 0;
      if (trigger <= 0) continue;
      let shouldDetonate = false;
      for (const e of enemies) {
        if (!e.isAlive) continue;
        const dx = e.position.x - proj.position.x;
        const dy = e.position.y - proj.position.y;
        if (dx * dx + dy * dy <= trigger * trigger) {
          shouldDetonate = true;
          break;
        }
      }
      if (!shouldDetonate) continue;

      const blast = proj.proxBlastRadius ?? trigger;
      // Damage every enemy in blast radius.
      for (const e of enemies) {
        if (!e.isAlive) continue;
        const dx = e.position.x - proj.position.x;
        const dy = e.position.y - proj.position.y;
        if (dx * dx + dy * dy <= blast * blast) {
          const result = this.enemies.onProjectileHit(e.id, proj.damage);
          if (result.defeated) {
            if (result.enemyType !== "boss") {
              this.powerUps.onEnemyDefeated(result.position.x, result.position.y);
            }
            if (result.enemyType) {
              this.renderer.showEnemyDefeated(
                result.position.x,
                result.position.y,
                result.enemyType,
              );
            }
          }
        }
      }
      // Kill the bomb and render a big shockwave.
      this.player.killProjectile(proj.id);
      this.renderer.showExplosion(proj.position.x, proj.position.y, 0xffdd55, blast * 1.3);
    }
  }

  // ── Player panic bomb ────────────────────────────────────────────────────

  /**
   * Drains any panic-bomb detonation requests the player queued this frame
   * (B-key press or post-respawn credit) and applies them: damages every
   * enemy inside `blastRadius` of the ship, sweeps incoming enemy projectiles
   * out of the blast so the player actually gets breathing room, and cues
   * the layered "1 large + 6 satellite" explosion FX.
   */
  private detonatePlayerPanicBombs(): void {
    const bombs = this.player.consumePendingPanicBombs();
    if (bombs.length === 0) return;
    const enemies = this.enemies.getEnemies();
    for (const b of bombs) {
      const r2 = b.blastRadius * b.blastRadius;
      for (const e of enemies) {
        if (!e.isAlive) continue;
        const dx = e.position.x - b.x;
        const dy = e.position.y - b.y;
        if (dx * dx + dy * dy > r2) continue;
        const result = this.enemies.onProjectileHit(e.id, b.damage);
        if (result.defeated) {
          if (result.enemyType !== "boss") {
            this.powerUps.onEnemyDefeated(result.position.x, result.position.y);
          }
          if (result.enemyType) {
            this.renderer.showEnemyDefeated(
              result.position.x,
              result.position.y,
              result.enemyType,
            );
          }
        }
      }
      // Sweep enemy projectiles inside the blast so the player clears space.
      for (const p of this.enemies.getProjectiles()) {
        if (!p.isAlive) continue;
        const dx = p.position.x - b.x;
        const dy = p.position.y - b.y;
        if (dx * dx + dy * dy > r2) continue;
        this.enemies.killProjectile(p.id);
        this.renderer.showExplosion(p.position.x, p.position.y, 0xffaa33, 26);
      }
      this.renderer.showPlayerBomb(b.x, b.y, b.blastRadius);
    }
  }

  // ── Mega-laser ───────────────────────────────────────────────────────────

  /**
   * Applies 50 dps damage to every enemy (and boss part) overlapping the
   * mega-laser beam. Returns aggregate score + kill delta so updateGameplay
   * can fold the numbers into the run stats.
   */
  private applyMegaLaserDamage(
    player: { position: { x: number; y: number }; width: number; height: number },
    deltaMs: number,
  ): { scoreDelta: number; killed: number } {
    const noseX = player.position.x + player.width / 2;
    const beamStart = noseX;
    const beamEnd = this.width + 120;
    const beamW = beamEnd - beamStart;
    const beamH = player.height * 1.8;
    const beamBox = {
      position: { x: (beamStart + beamEnd) / 2, y: player.position.y },
      width: beamW,
      height: beamH,
    };
    const dps = 50;
    const dmg = dps * (deltaMs / 1_000);

    let scoreDelta = 0;
    let killed = 0;
    // Spawn sparks at ~24/sec per hit enemy. Scales with frame time so it's
    // framerate-independent.
    const sparkChance = Math.min(1, (deltaMs / 1_000) * 24);
    for (const e of this.enemies.getEnemies()) {
      if (!e.isAlive) continue;
      if (!this.collisions.checkOverlap(beamBox, e)) continue;
      const r = this.enemies.onProjectileHit(e.id, dmg);
      if (Math.random() < sparkChance) {
        const sparkX = Math.max(beamStart, e.position.x - e.width / 2);
        const sparkY = Math.max(
          e.position.y - e.height / 2,
          Math.min(e.position.y + e.height / 2, player.position.y),
        );
        this.renderer.showLaserSpark(sparkX, sparkY);
      }
      if (r.defeated) {
        scoreDelta += r.bounty;
        if (r.enemyType !== "boss") {
          killed += 1;
          this.powerUps.onEnemyDefeated(r.position.x, r.position.y);
        }
        if (r.enemyType) {
          this.renderer.showEnemyDefeated(r.position.x, r.position.y, r.enemyType);
        }
      }
    }
    return { scoreDelta, killed };
  }

  // ── Dev cheats (wired only in dev builds — see src/dev/cheats.ts) ────────

  /**
   * Apply a parsed set of URL-param cheats. Safe to call once at startup:
   * `autostart` bypasses the menu and `startLevel` jumps to an arbitrary
   * level. All other fields override player stats directly so the HUD and
   * gameplay pick them up on the next frame.
   */
  applyDevCheats(cheats: DevCheats): void {
    if (cheats.autostart) {
      this.startNewRun();
    }
    if (cheats.startLevel !== undefined && cheats.startLevel > 1) {
      this.jumpToLevel(cheats.startLevel);
    }
    if (cheats.god !== undefined) this.player.setGodMode(cheats.god);
    if (cheats.health !== undefined) this.player.setHealth(cheats.health);
    if (cheats.lives !== undefined) this.player.setLives(cheats.lives);
    if (cheats.weapon !== undefined) this.player.setWeaponType(cheats.weapon);
    if (cheats.weaponLevel !== undefined) this.player.upgradeWeapon(cheats.weaponLevel);
    if (cheats.shield !== undefined) this.player.setShieldActive(cheats.shield);
    if (cheats.speed !== undefined) this.player.setSpeedMultiplier(cheats.speed);
    if (cheats.megaLaserMs !== undefined) this.player.setMegaLaserMs(cheats.megaLaserMs);
    this.state.updatePlayerState(this.player.getState());
  }

  /** Rebuild the level state at `n` and kick off the level manager. */
  private jumpToLevel(n: number): void {
    const target = Math.max(1, Math.floor(n));
    this.state.updateLevelState(makeLevelState(target));
    this.state.updateRunStats({ levelReached: target });
    this.enemies.initialize();
    this.powerUps.initialize();
    this.level.startLevel(this.state.getGameState().levelState, this.enemies);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private renderFrame(deltaMs: number): void {
    const state = this.state.getGameState();
    const playerProjectiles: ReadonlyArray<Projectile> = this.player.getProjectiles();
    const enemyProjectiles: ReadonlyArray<Projectile> = this.enemies.getProjectiles();
    const enemies = this.enemies.getEnemies().filter((e) => {
      // Exclude the boss from the generic enemy draw pass; the renderer draws it separately.
      const boss = this.enemies.getBoss();
      return !(boss && e.id === boss.id);
    });
    const powerUps: ReadonlyArray<PowerUp> = this.powerUps.getActivePowerUps();

    this.renderer.renderFrame(state, deltaMs, {
      playerProjectiles,
      enemyProjectiles,
      enemies,
      boss: this.enemies.getBoss(),
      powerUps,
      menuSelection: this.menuSelection,
      lastRun: this.state.getLastRun(),
      bombCredits: this.player.getBombCredits(),
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeLevelState(levelNumber: number) {
  const unlocked: ("grunt" | "spinner" | "stalker")[] =
    levelNumber >= 7
      ? ["grunt", "spinner", "stalker"]
      : levelNumber >= 3
        ? ["grunt", "spinner"]
        : ["grunt"];

  return {
    levelNumber,
    difficulty: {
      enemyCountBase: 5 + (levelNumber - 1) * 3,
      enemyCountMultiplier: 1 + (levelNumber - 1) * 0.2,
      enemyFireRateMultiplier: 1 + (levelNumber - 1) * 0.1,
      enemyHealthMultiplier: 1 + (levelNumber - 1) * 0.15,
      enemySpeedMultiplier: 1 + (levelNumber - 1) * 0.1,
      newEnemyTypesUnlocked: unlocked,
    },
    enemies: [],
    isBossPhase: false,
    enemiesSpawned: 0,
    enemiesDefeated: 0,
    durationMs: 0,
    targetDurationMs: Math.min(60_000 * levelNumber, 600_000),
    isComplete: false,
  };
}

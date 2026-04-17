/**
 * GameRenderer – Pixi.js rendering for all game screens.
 *
 * Redraws the Graphics objects each frame from the current game state. For the
 * sprite counts in this game (tens of entities), that's well within budget and
 * avoids managing a sprite pool on top of the existing object pools.
 */

import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type {
  BossState,
  Enemy,
  GameState,
  PlayerState,
  PowerUp,
  PowerUpType,
  Projectile,
  RunStats,
} from "../types/index";
import {
  drawCircle,
  drawHexagon,
  drawOctagon,
  drawPentagon,
  drawRect,
  drawRotatedRect,
  drawTriangle,
} from "./ShapePrimitives";
import { drawBossBody } from "./BossArt";

interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
}

interface Explosion {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  color: number;
  radius: number;
}

interface RingPulse {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  color: number;
  maxRadius: number;
}

interface Spark {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  color: number;
  size: number;
  rot: number;
}

interface FloatingText {
  text: Text;
  age: number;
  maxAge: number;
  vy: number;
}

const COLOR = {
  bg: 0x0a0a14,
  player: 0x00ffff,
  playerAccent: 0x66ffff,
  playerProjectile: 0x00ffff,
  enemyGrunt: 0xff3355,
  enemySpinner: 0xff9933,
  enemyStalker: 0x9933ff,
  enemyProjectile: 0xffaa33,
  boss: 0xff0066,
  bossAccent: 0xffaacc,
  shield: 0x33ccff,
  hudAmber: 0xffcc33,
  hudCyan: 0x33ffff,
  hudRed: 0xff4455,
  hudWhite: 0xffffff,
  powerUpWeapon: 0xffdd33,
  powerUpShield: 0x33ccff,
  powerUpLife: 0xff3366,
  powerUpHealth: 0x33ff66,
} as const;

export class GameRenderer {
  readonly app: Application;
  readonly width: number;
  readonly height: number;

  private readonly bgLayer: Container;
  private readonly gameLayer: Container;
  private readonly fxLayer: Container;
  private readonly hudLayer: Container;
  private readonly menuLayer: Container;

  private readonly starGfx: Graphics;
  private readonly entityGfx: Graphics;
  private readonly fxGfx: Graphics;
  private readonly hudBgGfx: Graphics;

  private readonly stars: Star[] = [];
  private readonly explosions: Explosion[] = [];
  private readonly ringPulses: RingPulse[] = [];
  private readonly sparks: Spark[] = [];
  private readonly floatingTexts: FloatingText[] = [];
  private hitFlashTimer = 0;
  private gameOverFadeMs = 0;
  private readonly GAME_OVER_FADE_DURATION_MS = 800;

  // Level banner (between-level transition)
  private readonly bannerTitleText: Text;
  private readonly bannerSubText: Text;
  private bannerAgeMs = 0;
  private bannerMaxAgeMs = 0;

  // HUD text elements
  private readonly scoreText: Text;
  private readonly levelText: Text;
  private readonly livesText: Text;
  private readonly shieldText: Text;
  private readonly hitsText: Text;
  private readonly weaponText: Text;
  private readonly healthText: Text;
  private readonly bombsText: Text;

  // Menu text elements
  private readonly titleText: Text;
  private readonly subtitleText: Text;
  private readonly promptText: Text;

  // Generic menu-list items — reused across main-menu and pause screens.
  // Max items = 3 (pause menu). Unused slots hidden per-frame.
  private readonly menuItemTexts: Text[];

  // Pause overlay: translucent backdrop + "PAUSED" title.
  private readonly pauseOverlay: Graphics;
  private readonly pauseTitle: Text;

  // Stats screen: title + three column bodies (CURRENT / LAST / ALL-TIME).
  private readonly statsTitle: Text;
  private readonly statsColCurrent: Text;
  private readonly statsColLast: Text;
  private readonly statsColAllTime: Text;
  private readonly statsColCurrentHeader: Text;
  private readonly statsColLastHeader: Text;
  private readonly statsColAllTimeHeader: Text;
  private readonly statsPrompt: Text;

  // Game-over text elements
  private readonly gameOverTitle: Text;
  private readonly gameOverStats: Text;
  private readonly gameOverPrompt: Text;

  // Boss name label (shown next to the boss health bar during a boss fight)
  private readonly bossNameText: Text;

  constructor(app: Application, width: number, height: number) {
    this.app = app;
    this.width = width;
    this.height = height;

    this.bgLayer = new Container();
    this.gameLayer = new Container();
    this.fxLayer = new Container();
    this.hudLayer = new Container();
    this.menuLayer = new Container();

    app.stage.addChild(this.bgLayer, this.gameLayer, this.fxLayer, this.hudLayer, this.menuLayer);

    this.starGfx = new Graphics();
    this.bgLayer.addChild(this.starGfx);

    this.entityGfx = new Graphics();
    this.gameLayer.addChild(this.entityGfx);

    this.fxGfx = new Graphics();
    this.fxLayer.addChild(this.fxGfx);

    this.hudBgGfx = new Graphics();
    this.hudLayer.addChild(this.hudBgGfx);

    // HUD text
    const hudStyle = (color: number, size = 20): TextStyle =>
      new TextStyle({
        fontFamily: "monospace",
        fontSize: size,
        fill: color,
        fontWeight: "bold",
      });

    this.scoreText = new Text({ text: "SCORE 0", style: hudStyle(COLOR.hudAmber, 22) });
    this.scoreText.x = 20;
    this.scoreText.y = 16;
    this.hudLayer.addChild(this.scoreText);

    this.levelText = new Text({ text: "LEVEL 1", style: hudStyle(COLOR.hudCyan, 22) });
    this.levelText.anchor.set(0.5, 0);
    this.levelText.x = width / 2;
    this.levelText.y = 16;
    this.hudLayer.addChild(this.levelText);

    this.livesText = new Text({ text: "LIVES 3", style: hudStyle(COLOR.hudRed, 22) });
    this.livesText.x = 20;
    this.livesText.y = 46;
    this.hudLayer.addChild(this.livesText);

    this.healthText = new Text({ text: "HP 100", style: hudStyle(COLOR.hudWhite, 18) });
    this.healthText.x = 20;
    this.healthText.y = 76;
    this.hudLayer.addChild(this.healthText);

    this.shieldText = new Text({ text: "", style: hudStyle(COLOR.shield, 18) });
    this.shieldText.x = 20;
    this.shieldText.y = 100;
    this.hudLayer.addChild(this.shieldText);

    this.hitsText = new Text({ text: "HITS 0", style: hudStyle(COLOR.hudAmber, 18) });
    this.hitsText.anchor.set(1, 0);
    this.hitsText.x = width - 20;
    this.hitsText.y = 16;
    this.hudLayer.addChild(this.hitsText);

    this.weaponText = new Text({ text: "GUN I", style: hudStyle(COLOR.hudCyan, 18) });
    this.weaponText.anchor.set(1, 0);
    this.weaponText.x = width - 20;
    this.weaponText.y = 44;
    this.hudLayer.addChild(this.weaponText);

    this.bombsText = new Text({ text: "", style: hudStyle(COLOR.hudAmber, 18) });
    this.bombsText.anchor.set(1, 0);
    this.bombsText.x = width - 20;
    this.bombsText.y = 68;
    this.hudLayer.addChild(this.bombsText);

    // Menu text
    this.titleText = new Text({
      text: "R-WIPE",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 96,
        fill: COLOR.hudCyan,
        fontWeight: "bold",
        dropShadow: { color: 0x003366, blur: 16, distance: 4, angle: Math.PI / 2, alpha: 1 },
      }),
    });
    this.titleText.anchor.set(0.5, 0.5);
    this.titleText.x = width / 2;
    this.titleText.y = height / 2 - 80;
    this.menuLayer.addChild(this.titleText);

    this.subtitleText = new Text({
      text: "A SPACESHIP SHOOTER",
      style: hudStyle(COLOR.hudAmber, 22),
    });
    this.subtitleText.anchor.set(0.5, 0.5);
    this.subtitleText.x = width / 2;
    this.subtitleText.y = height / 2;
    this.menuLayer.addChild(this.subtitleText);

    this.promptText = new Text({
      text: "↑↓ SELECT   ENTER CONFIRM   TAP TO PLAY",
      style: hudStyle(COLOR.hudWhite, 16),
    });
    this.promptText.anchor.set(0.5, 0.5);
    this.promptText.x = width / 2;
    this.promptText.y = height - 40;
    this.menuLayer.addChild(this.promptText);

    // Menu list items — centred column, spaced ~44px apart.
    this.menuItemTexts = [];
    for (let i = 0; i < 3; i++) {
      const t = new Text({
        text: "",
        style: hudStyle(COLOR.hudWhite, 28),
      });
      t.anchor.set(0.5, 0.5);
      t.x = width / 2;
      t.y = height / 2 + 80 + i * 46;
      this.menuLayer.addChild(t);
      this.menuItemTexts.push(t);
    }

    // Pause overlay — dark scrim + title. Drawn over the frozen gameplay layer.
    this.pauseOverlay = new Graphics();
    this.menuLayer.addChild(this.pauseOverlay);

    this.pauseTitle = new Text({
      text: "PAUSED",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 64,
        fill: COLOR.hudCyan,
        fontWeight: "bold",
        dropShadow: { color: 0x003366, blur: 12, distance: 3, angle: Math.PI / 2, alpha: 1 },
      }),
    });
    this.pauseTitle.anchor.set(0.5, 0.5);
    this.pauseTitle.x = width / 2;
    this.pauseTitle.y = height / 2 - 80;
    this.menuLayer.addChild(this.pauseTitle);

    // Stats screen — 3-column layout.
    this.statsTitle = new Text({
      text: "STATISTICS",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 48,
        fill: COLOR.hudAmber,
        fontWeight: "bold",
      }),
    });
    this.statsTitle.anchor.set(0.5, 0);
    this.statsTitle.x = width / 2;
    this.statsTitle.y = 40;
    this.menuLayer.addChild(this.statsTitle);

    const colY = 120;
    const colWidth = Math.floor(width / 3);
    const mkStatHeader = (text: string, col: number): Text => {
      const t = new Text({
        text,
        style: hudStyle(COLOR.hudCyan, 18),
      });
      t.anchor.set(0.5, 0);
      t.x = colWidth * col + colWidth / 2;
      t.y = colY;
      this.menuLayer.addChild(t);
      return t;
    };
    const mkStatBody = (col: number): Text => {
      const t = new Text({
        text: "",
        style: new TextStyle({
          fontFamily: "monospace",
          fontSize: 16,
          fill: COLOR.hudWhite,
          align: "left",
          lineHeight: 22,
        }),
      });
      // Anchor-x = 0.5 centers the block under the column header, while
      // align: "left" keeps every row flush-left within that block so the
      // padded label/value pairs render as a neat two-column table.
      t.anchor.set(0.5, 0);
      t.x = colWidth * col + colWidth / 2;
      t.y = colY + 36;
      this.menuLayer.addChild(t);
      return t;
    };

    this.statsColCurrentHeader = mkStatHeader("CURRENT RUN", 0);
    this.statsColLastHeader = mkStatHeader("LAST RUN", 1);
    this.statsColAllTimeHeader = mkStatHeader("ALL-TIME", 2);
    this.statsColCurrent = mkStatBody(0);
    this.statsColLast = mkStatBody(1);
    this.statsColAllTime = mkStatBody(2);

    this.statsPrompt = new Text({
      text: "PRESS  ESC  OR  ENTER  TO  GO  BACK",
      style: hudStyle(COLOR.hudWhite, 16),
    });
    this.statsPrompt.anchor.set(0.5, 1);
    this.statsPrompt.x = width / 2;
    this.statsPrompt.y = height - 40;
    this.menuLayer.addChild(this.statsPrompt);

    // Game over text — packed into the top of the canvas so it stays
    // readable even when the viewport is ~658px of usable height.
    this.gameOverTitle = new Text({
      text: "GAME OVER",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 56,
        fill: COLOR.hudRed,
        fontWeight: "bold",
      }),
    });
    this.gameOverTitle.anchor.set(0.5, 0);
    this.gameOverTitle.x = width / 2;
    this.gameOverTitle.y = 60;
    this.gameOverTitle.visible = false;
    this.menuLayer.addChild(this.gameOverTitle);

    this.gameOverStats = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 18,
        fill: COLOR.hudWhite,
        align: "center",
        lineHeight: 26,
      }),
    });
    this.gameOverStats.anchor.set(0.5, 0);
    this.gameOverStats.x = width / 2;
    this.gameOverStats.y = 160;
    this.gameOverStats.visible = false;
    this.menuLayer.addChild(this.gameOverStats);

    this.gameOverPrompt = new Text({
      text: "PRESS  ENTER  TO  RESTART",
      style: hudStyle(COLOR.hudAmber, 22),
    });
    this.gameOverPrompt.anchor.set(0.5, 1);
    this.gameOverPrompt.x = width / 2;
    this.gameOverPrompt.y = height - 40;
    this.gameOverPrompt.visible = false;
    this.menuLayer.addChild(this.gameOverPrompt);

    // Boss name label — drawn vertically next to the boss HP bar.
    this.bossNameText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 16,
        fill: COLOR.hudWhite,
        fontWeight: "bold",
        letterSpacing: 3,
      }),
    });
    this.bossNameText.anchor.set(0, 0);
    this.bossNameText.x = 40;
    this.bossNameText.y = this.height / 2 - 180;
    this.bossNameText.visible = false;
    this.hudLayer.addChild(this.bossNameText);

    // Level banner — hidden by default; shown during level transitions.
    this.bannerTitleText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 72,
        fill: COLOR.hudCyan,
        fontWeight: "bold",
        dropShadow: { color: 0x003366, blur: 12, distance: 3, angle: Math.PI / 2, alpha: 1 },
      }),
    });
    this.bannerTitleText.anchor.set(0.5, 0.5);
    this.bannerTitleText.x = width / 2;
    this.bannerTitleText.y = height / 2 - 30;
    this.bannerTitleText.visible = false;
    this.fxLayer.addChild(this.bannerTitleText);

    this.bannerSubText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 26,
        fill: COLOR.hudAmber,
        fontWeight: "bold",
      }),
    });
    this.bannerSubText.anchor.set(0.5, 0.5);
    this.bannerSubText.x = width / 2;
    this.bannerSubText.y = height / 2 + 30;
    this.bannerSubText.visible = false;
    this.fxLayer.addChild(this.bannerSubText);

    this.initStarfield();
  }

  // ── Starfield ───────────────────────────────────────────────────────────

  private initStarfield(): void {
    this.stars.length = 0;
    for (let i = 0; i < 140; i++) {
      const z = Math.random();
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        speed: 30 + z * 180,
        size: 1 + Math.round(z * 2),
        alpha: 0.3 + z * 0.7,
      });
    }
  }

  private drawStarfield(deltaMs: number): void {
    const dt = deltaMs / 1_000;
    this.starGfx.clear();
    for (const s of this.stars) {
      s.x -= s.speed * dt;
      if (s.x < -2) {
        s.x = this.width + 2;
        s.y = Math.random() * this.height;
      }
      this.starGfx
        .rect(s.x, s.y, s.size, s.size)
        .fill({ color: 0xffffff, alpha: s.alpha });
    }
  }

  // ── Public frame API ─────────────────────────────────────────────────────

  renderFrame(
    state: Readonly<GameState>,
    deltaMs: number,
    extras: {
      playerProjectiles: ReadonlyArray<Projectile>;
      enemyProjectiles: ReadonlyArray<Projectile>;
      enemies: ReadonlyArray<Enemy>;
      boss: Readonly<BossState> | null;
      powerUps: ReadonlyArray<PowerUp>;
      menuSelection: number;
      lastRun: Readonly<RunStats> | null;
      bombCredits: number;
    },
  ): void {
    this.drawStarfield(deltaMs);
    this.fxGfx.clear();
    this.entityGfx.clear();
    this.hudBgGfx.clear();
    this.pauseOverlay.clear();

    const screen = state.screen;
    const isGameplay = screen === "gameplay";
    const isPause = screen === "pause";
    const isStats = screen === "stats";
    const isMenu = screen === "main-menu";
    const isGameOver = screen === "game-over";
    // Gameplay entities stay visible behind the pause overlay.
    const drawsEntities = isGameplay || isPause;

    this.menuLayer.visible = isMenu || isGameOver || isPause || isStats;
    this.titleText.visible = isMenu;
    this.subtitleText.visible = isMenu;
    this.promptText.visible = isMenu || isPause;
    this.gameOverTitle.visible = isGameOver;
    this.gameOverStats.visible = isGameOver;
    this.gameOverPrompt.visible = isGameOver;
    this.pauseTitle.visible = isPause;
    // Stats overlay elements
    this.statsTitle.visible = isStats;
    this.statsColCurrentHeader.visible = isStats;
    this.statsColLastHeader.visible = isStats;
    this.statsColAllTimeHeader.visible = isStats;
    this.statsColCurrent.visible = isStats;
    this.statsColLast.visible = isStats;
    this.statsColAllTime.visible = isStats;
    this.statsPrompt.visible = isStats;
    // Menu list items: used by main-menu (2) and pause (3); hidden on stats.
    const showList = isMenu || isPause;
    for (const t of this.menuItemTexts) t.visible = showList;

    this.hudLayer.visible = drawsEntities;
    // gameLayer stays visible so the menu ship + bg render. entityGfx is cleared each frame.

    if (isMenu) {
      this.drawMenuShip();
      this.updateMainMenu(extras.menuSelection);
      this.promptText.alpha = 0.6 + 0.4 * Math.sin(performance.now() * 0.004);
      return;
    }

    if (isStats) {
      this.updateStatsScreen(state, extras.lastRun);
      this.statsPrompt.alpha = 0.6 + 0.4 * Math.sin(performance.now() * 0.004);
      return;
    }

    if (isGameOver) {
      this.gameOverFadeMs = Math.min(
        this.GAME_OVER_FADE_DURATION_MS,
        this.gameOverFadeMs + deltaMs,
      );
      const a = this.gameOverFadeMs / this.GAME_OVER_FADE_DURATION_MS;
      this.gameOverTitle.alpha = a;
      this.gameOverStats.alpha = a;
      this.gameOverPrompt.alpha = 0.6 * a + 0.4 * a * Math.sin(performance.now() * 0.004);
      this.updateGameOverText(state);
      // Keep lingering explosions drawing over the fade.
      this.updateExplosions(deltaMs);
      return;
    }

    if (!drawsEntities) return;

    // Background boss health bar + name label
    if (extras.boss && extras.boss.isAlive) {
      this.drawBossHealth(extras.boss);
      const name = extras.boss.displayName ?? "BOSS";
      this.bossNameText.text = name;
      this.bossNameText.style.fill = extras.boss.colorPrimary ?? COLOR.boss;
      this.bossNameText.visible = true;
    } else {
      this.bossNameText.visible = false;
    }

    // Entities
    for (const pu of extras.powerUps) this.drawPowerUp(pu);
    for (const e of extras.enemies) this.drawEnemy(e);
    if (extras.boss && extras.boss.isAlive) this.drawBoss(extras.boss);
    for (const p of extras.playerProjectiles) this.drawProjectile(p, true);
    for (const p of extras.enemyProjectiles) this.drawProjectile(p, false);

    if (state.playerState.isAlive) this.drawPlayer(state.playerState);
    if (state.playerState.isAlive && state.playerState.megaLaserMs > 0) {
      this.drawMegaLaser(state.playerState);
    }

    // Pause scrim drawn on top of the frozen gameplay layer.
    if (isPause) {
      this.pauseOverlay
        .rect(0, 0, this.width, this.height)
        .fill({ color: 0x000014, alpha: 0.65 });
      this.updatePauseMenu(extras.menuSelection);
      this.promptText.alpha = 0.6 + 0.4 * Math.sin(performance.now() * 0.004);
    }

    // FX
    this.updateExplosions(deltaMs);
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - deltaMs);
      const alpha = (this.hitFlashTimer / 200) * 0.4;
      this.fxGfx.rect(0, 0, this.width, this.height).fill({ color: 0xff2244, alpha });
    }

    this.updateHud(state, extras.bombCredits);
  }

  // ── FX API ───────────────────────────────────────────────────────────────

  showExplosion(x: number, y: number, color = 0xffaa33, radius = 40): void {
    this.explosions.push({ x, y, age: 0, maxAge: 450, color, radius });
  }

  /** Cluster of offset puffs for enemy / boss defeat. */
  showEnemyDefeated(x: number, y: number, enemyType: Enemy["type"] | "boss"): void {
    if (enemyType === "boss") {
      this.showExplosion(x, y, 0xff3366, 140);
      this.showExplosion(x - 30, y + 20, 0xffaa33, 110);
      this.showExplosion(x + 26, y - 18, 0xffffff, 100);
      this.showExplosion(x - 10, y - 30, 0xff66aa, 120);
      this.showExplosion(x + 18, y + 26, 0xffdd33, 95);
      return;
    }
    const baseCol =
      enemyType === "grunt" ? 0xff5566
        : enemyType === "spinner" ? 0xffaa44
          : 0xcc66ff;
    this.showExplosion(x, y, baseCol, 50);
    this.showExplosion(x - 10, y + 8, 0xffaa33, 36);
    this.showExplosion(x + 10, y - 6, 0xffffff, 30);
  }

  /** Collection FX: expanding ring + floating label. */
  showPowerUpCollected(x: number, y: number, type: PowerUpType): void {
    let color: number = COLOR.powerUpWeapon;
    let label = "";
    switch (type) {
      case "weapon-upgrade":
        color = COLOR.powerUpWeapon;
        label = "GUN+";
        break;
      case "shield":
        color = COLOR.powerUpShield;
        label = "SHIELD";
        break;
      case "extra-life":
        color = COLOR.powerUpLife;
        label = "+LIFE";
        break;
      case "health-recovery":
        color = COLOR.powerUpHealth;
        label = "+HP";
        break;
      case "speed-boost":
        color = 0x99ffff;
        label = "SPEED!";
        break;
      case "weapon-spread":
        color = 0xffaa33;
        label = "SPREAD";
        break;
      case "weapon-bomb":
        color = 0xff6699;
        label = "BOMB";
        break;
      case "mega-laser":
        color = 0xff4466;
        label = "MEGA LASER!!";
        break;
    }
    this.ringPulses.push({ x, y, age: 0, maxAge: 500, color, maxRadius: 52 });

    const txt = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 20,
        fill: color,
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    txt.anchor.set(0.5, 0.5);
    txt.x = x;
    txt.y = y;
    this.fxLayer.addChild(txt);
    this.floatingTexts.push({ text: txt, age: 0, maxAge: 900, vy: -60 });
  }

  /** Shows a full-screen level banner for `durationMs`. */
  showLevelBanner(title: string, subtitle: string, durationMs = 1800): void {
    this.bannerTitleText.text = title;
    this.bannerSubText.text = subtitle;
    this.bannerTitleText.visible = true;
    this.bannerSubText.visible = true;
    this.bannerAgeMs = 0;
    this.bannerMaxAgeMs = durationMs;
  }

  showHitFlash(): void {
    this.hitFlashTimer = 200;
  }

  /**
   * Panic-bomb FX centred on the ship: one massive layered core burst +
   * six satellite bursts arranged in a hex ring + an expanding shockwave.
   * Meant to make the player feel like they just cleared the airspace.
   */
  showPlayerBomb(x: number, y: number, radius: number): void {
    // Layered core: hot white → amber → red-orange, overlapped so the
    // blend looks like a single rolling fireball instead of a disc.
    this.showExplosion(x, y, 0xffffff, radius * 0.95);
    this.showExplosion(x, y, 0xffdd55, radius * 0.75);
    this.showExplosion(x, y, 0xff6633, radius * 1.1);
    // Six satellite bursts in a hex ring around the ship.
    const satRadius = radius * 0.55;
    const satSize = radius * 0.45;
    const satColors = [0xffdd55, 0xff8844, 0xffffff, 0xffaa33, 0xff66aa, 0xffeeaa];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 12;
      const sx = x + Math.cos(a) * satRadius;
      const sy = y + Math.sin(a) * satRadius;
      this.showExplosion(sx, sy, satColors[k] ?? 0xffaa33, satSize);
    }
    // Expanding shockwave.
    this.ringPulses.push({
      x,
      y,
      age: 0,
      maxAge: 650,
      color: 0xffdd55,
      maxRadius: radius * 1.35,
    });
  }

  /**
   * Cannon round impact FX — two overlapping shockwave rings (white outer,
   * red inner) + a starburst of red spokes. Different silhouette from
   * the generic bullet hit flash so the player can tell the heavy round
   * apart from regular fire.
   */
  showCannonImpact(x: number, y: number): void {
    this.ringPulses.push({
      x,
      y,
      age: 0,
      maxAge: 520,
      color: 0xffffff,
      maxRadius: 70,
    });
    this.ringPulses.push({
      x,
      y,
      age: 0,
      maxAge: 640,
      color: 0xff3344,
      maxRadius: 95,
    });
    // Six red spokes via the spark FX, longer + hotter than a laser spark.
    this.sparks.push({
      x,
      y,
      age: 0,
      maxAge: 260,
      color: 0xff4466,
      size: 28,
      rot: 0,
    });
    this.sparks.push({
      x,
      y,
      age: 0,
      maxAge: 260,
      color: 0xffffff,
      size: 22,
      rot: Math.PI / 4,
    });
  }

  /**
   * Short-lived radiating spark for mega-laser impacts on enemy hulls.
   * Hot white core + four spokes that grow + fade over ~170ms.
   */
  showLaserSpark(x: number, y: number, color = 0xffffaa): void {
    this.sparks.push({
      x,
      y,
      age: 0,
      maxAge: 170,
      color,
      size: 14 + Math.random() * 6,
      rot: Math.random() * Math.PI,
    });
  }

  resetFx(): void {
    this.explosions.length = 0;
    this.ringPulses.length = 0;
    this.sparks.length = 0;
    for (const f of this.floatingTexts) f.text.destroy();
    this.floatingTexts.length = 0;
    this.hitFlashTimer = 0;
    this.bannerAgeMs = 0;
    this.bannerMaxAgeMs = 0;
    this.bannerTitleText.visible = false;
    this.bannerSubText.visible = false;
  }

  /** Called by GameManager when the screen transitions to "game-over". */
  beginGameOverFade(): void {
    this.gameOverFadeMs = 0;
  }

  resetGameOverFade(): void {
    this.gameOverFadeMs = 0;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private drawMenuShip(): void {
    // Large ship silhouette under the title
    const cx = this.width / 2;
    const cy = this.height / 2 + 260;
    this.entityGfx
      .poly([
        cx + 120, cy,
        cx - 80, cy - 40,
        cx - 40, cy,
        cx - 80, cy + 40,
      ])
      .fill({ color: COLOR.player, alpha: 0.85 })
      .stroke({ color: COLOR.playerAccent, width: 2 });
    this.entityGfx
      .rect(cx - 30, cy - 8, 40, 16)
      .fill({ color: COLOR.playerAccent, alpha: 0.6 });
  }

  private drawPlayer(p: Readonly<PlayerState>): void {
    const { x, y } = p.position;
    const w = p.width;
    const h = p.height;
    const flicker = p.invulnerabilityTimer > 0 && Math.floor(p.invulnerabilityTimer / 80) % 2 === 0;
    if (flicker) return;

    // Main body: arrowhead pointing right
    this.entityGfx
      .poly([
        x + w / 2, y,
        x - w / 2, y - h / 2,
        x - w / 4, y,
        x - w / 2, y + h / 2,
      ])
      .fill({ color: COLOR.player });

    // Cockpit stripe
    this.entityGfx
      .rect(x - w / 4, y - 3, w / 2, 6)
      .fill({ color: COLOR.playerAccent });

    // Engine glow — bigger + brighter while a speed boost is active.
    const boosting = p.speedBoostMs > 0;
    const engineLen = boosting ? 18 + 6 * Math.sin(performance.now() * 0.03) : 6;
    const engineH = boosting ? 14 : 8;
    this.entityGfx
      .rect(x - w / 2 - engineLen, y - engineH / 2, engineLen, engineH)
      .fill({ color: COLOR.hudAmber, alpha: 0.85 });
    if (boosting) {
      // Outer flame tail
      this.entityGfx
        .poly([
          x - w / 2 - engineLen, y - engineH / 2,
          x - w / 2 - engineLen - 10, y,
          x - w / 2 - engineLen, y + engineH / 2,
        ])
        .fill({ color: 0xffdd88, alpha: 0.7 });
    }

    // ── Gun(s) on the nose — art depends on weapon type + upgrade level. ──
    this.drawPlayerGun(p);

    // Shield ring
    if (p.shield.active) {
      this.entityGfx
        .circle(x, y, Math.max(w, h) * 0.9)
        .stroke({ color: COLOR.shield, width: 2, alpha: 0.85 });
    }
  }

  /** Renders the weapon mounted on the player ship's nose. */
  private drawPlayerGun(p: Readonly<PlayerState>): void {
    const { x, y } = p.position;
    const w = p.width;
    const noseX = x + w / 2;
    const level = p.weapon.upgradeLevel;
    // Muzzle-flash when the last shot is very recent.
    const sinceShot = Math.max(0, performance.now() - p.weapon.lastFireTimeMs);
    const flashing = sinceShot < 80;

    switch (p.weapon.weaponType) {
      case "bullet": {
        // Barrel gets longer + stacks a second barrel at higher levels.
        const barrelLen = 10 + level * 2;
        this.entityGfx
          .rect(noseX - 2, y - 2, barrelLen, 4)
          .fill({ color: 0x99ddff });
        if (level >= 2) {
          this.entityGfx
            .rect(noseX - 2, y - 9, barrelLen - 2, 3)
            .fill({ color: 0x99ddff });
          this.entityGfx
            .rect(noseX - 2, y + 6, barrelLen - 2, 3)
            .fill({ color: 0x99ddff });
        }
        if (level >= 4) {
          // heatsink block
          this.entityGfx
            .rect(noseX - 4, y - 6, 4, 12)
            .fill({ color: 0x66aabb });
        }
        if (flashing) {
          this.entityGfx
            .circle(noseX + barrelLen, y, 4)
            .fill({ color: 0xffffff, alpha: 0.9 });
        }
        break;
      }
      case "spread": {
        // Fan of 3 (5 at L3+) small barrels
        const count = level >= 3 ? 5 : 3;
        const len = 10 + level;
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 4;
          const a = off * 0.04;
          drawRotatedRect(this.entityGfx,
            noseX + Math.cos(a) * len * 0.5,
            y + off + Math.sin(a) * len * 0.5,
            len, 2.5, a,
            { color: 0xffcc55 });
        }
        if (flashing) {
          this.entityGfx
            .circle(noseX + len, y, 5)
            .fill({ color: 0xffee99, alpha: 0.9 });
        }
        break;
      }
      case "bomb": {
        // Stubby chunky launcher
        const len = 12 + level * 2;
        this.entityGfx
          .rect(noseX - 2, y - 6, len, 12)
          .fill({ color: 0xff88aa })
          .stroke({ color: 0xffffff, width: 1 });
        this.entityGfx
          .circle(noseX + len, y, 4)
          .fill({ color: 0xff6699 });
        if (flashing) {
          this.entityGfx
            .circle(noseX + len, y, 8)
            .fill({ color: 0xffffff, alpha: 0.8 });
        }
        break;
      }
    }
  }

  /**
   * Renders the mega-laser beam: a full-width beam from the nose with a
   * bright core, bloom halo, and a spray of heat/sparks at the emitter.
   */
  private drawMegaLaser(p: Readonly<PlayerState>): void {
    const { x, y } = p.position;
    const w = p.width;
    const noseX = x + w / 2;
    const beamEnd = this.width + 120;
    const beamLen = beamEnd - noseX;
    const beamH = p.height * 1.8;

    // End-of-life fade (last 400ms).
    const fadeInMs = 180;
    const fadeOutMs = 400;
    const mlm = p.megaLaserMs;
    let alpha = 1;
    if (mlm < fadeOutMs) alpha = mlm / fadeOutMs;
    // Initial ramp-up (for the first fadeInMs we don't know total, estimate
    // from current mlm — good enough for visual flair).
    void fadeInMs;

    const t = performance.now() * 0.018;
    const flicker = 0.85 + 0.15 * Math.sin(t * 2.3);

    // Outer halo (wide, soft).
    this.fxGfx
      .rect(noseX, y - beamH, beamLen, beamH * 2)
      .fill({ color: 0xff4466, alpha: 0.18 * alpha * flicker });
    // Mid glow.
    this.fxGfx
      .rect(noseX, y - beamH * 0.7, beamLen, beamH * 1.4)
      .fill({ color: 0xff88aa, alpha: 0.28 * alpha * flicker });
    // Core beam.
    this.fxGfx
      .rect(noseX, y - beamH / 2, beamLen, beamH)
      .fill({ color: 0xffccdd, alpha: 0.75 * alpha * flicker });
    // Inner bright-white stripe.
    this.fxGfx
      .rect(noseX, y - beamH * 0.22, beamLen, beamH * 0.44)
      .fill({ color: 0xffffff, alpha: 0.9 * alpha });

    // Scan-line banding so it feels energetic.
    const bands = 6;
    const bandH = beamH / bands;
    for (let i = 0; i < bands; i++) {
      const dy = (i - (bands - 1) / 2) * bandH;
      const jitter = Math.sin(t * 1.7 + i * 0.9) * 0.3 + 0.4;
      this.fxGfx
        .rect(noseX, y + dy - 0.5, beamLen, 1.2)
        .fill({ color: 0xffffff, alpha: 0.25 * jitter * alpha });
    }

    // ── Heat shimmer + sparks at the emitter ──────────────────────────────
    const emitterR = beamH * 0.75;
    // Heat ring (pulsing).
    this.fxGfx
      .circle(noseX, y, emitterR * (0.9 + 0.1 * Math.sin(t * 3)))
      .fill({ color: 0xffaa33, alpha: 0.45 * alpha });
    this.fxGfx
      .circle(noseX, y, emitterR * 0.6)
      .fill({ color: 0xffffff, alpha: 0.9 * alpha });

    // Sparks: 8 radial streaks at random-ish angles.
    const sparkCount = 10;
    for (let i = 0; i < sparkCount; i++) {
      const ang = t * 0.8 + i * ((Math.PI * 2) / sparkCount);
      const len = 10 + Math.abs(Math.sin(t * 4 + i)) * 18;
      const sx = noseX + Math.cos(ang) * (emitterR * 0.8);
      const sy = y + Math.sin(ang) * (emitterR * 0.8);
      const ex = sx + Math.cos(ang) * len;
      const ey = sy + Math.sin(ang) * len;
      this.fxGfx
        .moveTo(sx, sy)
        .lineTo(ex, ey)
        .stroke({ color: 0xffee66, width: 2, alpha: 0.85 * alpha });
    }
    // Tiny dot sparks.
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + t * 1.4;
      const r = emitterR * (0.7 + Math.random() * 0.5);
      this.fxGfx
        .circle(noseX + Math.cos(ang) * r, y + Math.sin(ang) * r, 1.5)
        .fill({ color: 0xffffff, alpha: 0.9 * alpha });
    }
  }

  private drawEnemy(e: Readonly<Enemy>): void {
    const { x, y } = e.position;
    const w = e.width;
    const h = e.height;

    switch (e.type) {
      case "grunt":
        // Triangle pointing left
        this.entityGfx
          .poly([
            x - w / 2, y,
            x + w / 2, y - h / 2,
            x + w / 4, y,
            x + w / 2, y + h / 2,
          ])
          .fill({ color: COLOR.enemyGrunt });
        this.entityGfx
          .rect(x + w / 6, y - 3, w / 4, 6)
          .fill({ color: 0xffcccc });
        break;
      case "spinner": {
        // Rotating diamond
        const t = performance.now() * 0.004;
        const cs = Math.cos(t);
        const sn = Math.sin(t);
        const half = w / 2;
        const pts = [
          [0, -half],
          [half, 0],
          [0, half],
          [-half, 0],
        ].map(([px, py]) => [x + (px! * cs - py! * sn), y + (px! * sn + py! * cs)]);
        this.entityGfx
          .poly(pts.flat())
          .fill({ color: COLOR.enemySpinner })
          .stroke({ color: 0xffffaa, width: 2 });
        break;
      }
      case "stalker":
        // Jagged silhouette
        this.entityGfx
          .poly([
            x - w / 2, y,
            x - w / 4, y - h / 2,
            x + w / 4, y - h / 3,
            x + w / 2, y,
            x + w / 4, y + h / 3,
            x - w / 4, y + h / 2,
          ])
          .fill({ color: COLOR.enemyStalker })
          .stroke({ color: 0xddaaff, width: 2 });
        break;
      case "darter": {
        // Sleek arrowhead with dual fins
        const col = 0x00ddcc;
        drawTriangle(this.entityGfx, x, y, w * 0.55, Math.PI,
          { color: col }, { color: 0xaaffff, width: 2 });
        drawTriangle(this.entityGfx, x + w * 0.15, y - h * 0.35, w * 0.25, Math.PI * 0.85,
          { color: col, alpha: 0.85 });
        drawTriangle(this.entityGfx, x + w * 0.15, y + h * 0.35, w * 0.25, -Math.PI * 0.85,
          { color: col, alpha: 0.85 });
        drawCircle(this.entityGfx, x - w * 0.2, y, 4,
          { color: 0xffffff });
        break;
      }
      case "orbiter": {
        // Spinning hexagonal gyro
        const t = performance.now() * 0.003;
        drawHexagon(this.entityGfx, x, y, w * 0.5, t,
          { color: 0xff66aa }, { color: 0xffccdd, width: 2 });
        drawHexagon(this.entityGfx, x, y, w * 0.28, -t * 1.4,
          { color: 0x330022 }, { color: 0xffaacc, width: 1 });
        drawCircle(this.entityGfx, x, y, 4, { color: 0xffffff });
        break;
      }
      case "lancer": {
        // Long laser emitter — rectangular body + front pentagon
        const col = 0xff3366;
        drawRect(this.entityGfx, x, y, w * 0.9, h * 0.5,
          { color: 0x220011 }, { color: col, width: 2 });
        drawPentagon(this.entityGfx, x - w * 0.35, y, w * 0.3, -Math.PI / 2,
          { color: col }, { color: 0xffaacc, width: 2 });
        drawRect(this.entityGfx, x - w * 0.55, y, 6, 4, { color: 0xffffff });
        break;
      }
      case "torpedoer": {
        // Chunky launcher with two tubes
        const col = 0x33aa55;
        drawOctagon(this.entityGfx, x, y, w * 0.55, 0,
          { color: col }, { color: 0x88ffaa, width: 2 });
        drawRect(this.entityGfx, x - w * 0.35, y - h * 0.2, w * 0.25, 6,
          { color: 0x222222 }, { color: 0x88ffaa, width: 1 });
        drawRect(this.entityGfx, x - w * 0.35, y + h * 0.2, w * 0.25, 6,
          { color: 0x222222 }, { color: 0x88ffaa, width: 1 });
        drawCircle(this.entityGfx, x + w * 0.1, y, 5, { color: 0xffff88 });
        break;
      }
      case "cannoneer": {
        // Heavy armored cube with front barrel
        const col = 0xcc6622;
        drawRect(this.entityGfx, x, y, w * 0.8, h * 0.8,
          { color: col }, { color: 0xffcc88, width: 3 });
        drawRect(this.entityGfx, x - w * 0.35, y, w * 0.3, h * 0.35,
          { color: 0x332211 }, { color: 0xffcc88, width: 2 });
        drawCircle(this.entityGfx, x + w * 0.1, y, 6,
          { color: 0xffaa44 }, { color: 0xffffff, width: 1 });
        break;
      }
      case "pulsar": {
        // Pulsing octagon with inner rotating triangle
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.006);
        const t = performance.now() * 0.002;
        drawOctagon(this.entityGfx, x, y, w * 0.5 * pulse, t,
          { color: 0x8844ff, alpha: 0.35 });
        drawOctagon(this.entityGfx, x, y, w * 0.45, 0,
          { color: 0x6633cc }, { color: 0xccaaff, width: 2 });
        drawTriangle(this.entityGfx, x, y, w * 0.3, t * 2,
          { color: 0xccaaff });
        break;
      }
    }

    // Health bar for enemies below full HP
    if (e.health < e.maxHealth) {
      const barW = w;
      const pct = e.health / e.maxHealth;
      this.entityGfx
        .rect(x - barW / 2, y - h / 2 - 8, barW, 3)
        .fill({ color: 0x333333 });
      this.entityGfx
        .rect(x - barW / 2, y - h / 2 - 8, barW * pct, 3)
        .fill({ color: 0xff4455 });
    }
  }

  private drawBoss(b: Readonly<BossState>): void {
    const time = performance.now() * 0.001;

    // 1. Body art (layered composition from BossArt.ts).
    if (b.artId) {
      drawBossBody(this.entityGfx, b, time);
    } else {
      // Legacy fallback: simple shape if no artId wired up.
      const { x, y } = b.position;
      const w = b.width;
      const h = b.height;
      const phase = b.currentPhase;
      const primary = b.colorPrimary ?? COLOR.boss;
      const accent = b.colorAccent ?? COLOR.bossAccent;
      const col = phase === 0 ? primary : mixColor(primary, 0xffffff, 0.25);
      this.entityGfx
        .poly([
          x - w / 2, y,
          x - w / 4, y - h / 2,
          x + w / 2, y - h / 3,
          x + w / 2, y + h / 3,
          x - w / 4, y + h / 2,
        ])
        .fill({ color: col })
        .stroke({ color: accent, width: 3 });
    }

    // 1b. Charge-up tell. If the current phase defines a chargeMs window and
    // the boss is actively charging, render a big growing + flashing aura at
    // the weapon muzzle (left side of the boss, since bosses face the player).
    // The aura grows 40% → 130% of its max radius across the charge window,
    // warms yellow → red as it nears firing, and strobes in brightness so the
    // player can't miss the tell even in chaotic moments.
    const phase = b.movementPhases?.[b.currentPhase];
    const chargeMs = phase?.chargeMs;
    if (b.isCharging && chargeMs && chargeMs > 0) {
      const t = Math.min(1, (b.chargeProgressMs ?? 0) / chargeMs);
      const muzzleX = b.position.x - b.width / 2;
      const muzzleY = b.position.y;
      const strobe = 0.55 + 0.45 * Math.sin(time * 26);
      const isMegaMissile = phase?.attackPattern?.weaponKind === "mega-missile";

      if (isMegaMissile) {
        // Slowly assemble the missile at the muzzle: body extends outward,
        // warhead tip slides into place, exhaust halo brightens as it nears
        // firing. Uses t to drive length, brightness, and the warhead glow.
        const missileFullLen = 110 + b.width * 0.25;
        const thick = 22;
        const currentLen = missileFullLen * (0.25 + 0.9 * t);
        const bodyAlpha = 0.5 + 0.5 * t;
        const bodyCol = 0xaa2244;
        const warmCol = t < 0.5
          ? 0xffcc44
          : mixColor(0xffcc44, 0xff3333, (t - 0.5) * 2);

        // Tail exhaust halo builds
        this.fxGfx
          .circle(muzzleX + currentLen * 0.4, muzzleY, thick * (0.4 + t * 0.9))
          .fill({ color: 0xffaa33, alpha: 0.25 + 0.4 * t * strobe });

        // Body rectangle — anchor pivot at muzzleX (tip aims left at -π)
        const bodyCenterX = muzzleX - currentLen * 0.5;
        drawRotatedRect(
          this.fxGfx,
          bodyCenterX,
          muzzleY,
          currentLen,
          thick,
          Math.PI,
          { color: bodyCol, alpha: bodyAlpha },
          { color: 0xffffff, width: 2, alpha: bodyAlpha },
        );
        // Warhead triangle tip — fades in / glows strobe
        const noseX = muzzleX - currentLen;
        drawTriangle(
          this.fxGfx,
          noseX,
          muzzleY,
          thick * 1.1,
          Math.PI,
          { color: warmCol, alpha: 0.6 + 0.4 * strobe },
          { color: 0xffffff, width: 2, alpha: bodyAlpha },
        );
        // Inner warhead pulse
        this.fxGfx
          .circle(noseX + thick * 0.2, muzzleY, thick * 0.45 * (0.6 + 0.6 * t * strobe))
          .fill({ color: 0xffffff, alpha: 0.3 + 0.6 * t * strobe });
        // Loading rail bars that fade as missile approaches full length
        const railAlpha = 0.7 * (1 - t) + 0.2;
        for (let k = -1; k <= 1; k += 2) {
          this.fxGfx
            .moveTo(muzzleX, muzzleY + k * (thick * 0.9))
            .lineTo(muzzleX - missileFullLen * 1.05, muzzleY + k * (thick * 0.9))
            .stroke({ color: warmCol, width: 2, alpha: railAlpha * strobe });
        }
      } else {
        // Generic charge aura: growing ring + starburst spikes + strobing core.
        const maxR = 60 + b.width * 0.35;
        const outerR = maxR * (0.4 + t * 0.9);
        const warmCol = t < 0.5
          ? 0xffee66
          : mixColor(0xffee66, 0xff3333, (t - 0.5) * 2);
        this.fxGfx
          .circle(muzzleX, muzzleY, outerR)
          .stroke({
            color: warmCol,
            width: 3 + t * 2,
            alpha: 0.4 + 0.5 * strobe,
          });
        this.fxGfx
          .circle(muzzleX, muzzleY, outerR * 0.45 * (0.85 + strobe * 0.2))
          .fill({ color: 0xffffff, alpha: 0.25 + 0.55 * strobe });
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + time * 1.5;
          const len = outerR * 1.1;
          this.fxGfx
            .moveTo(muzzleX, muzzleY)
            .lineTo(muzzleX + Math.cos(a) * len, muzzleY + Math.sin(a) * len)
            .stroke({ color: warmCol, width: 2, alpha: 0.25 + 0.4 * strobe });
        }
      }
    }

    // 2. Parts (turrets / armor / core). Each carries its own HP + visual cue.
    if (b.parts && b.parts.length > 0) {
      for (const part of b.parts) {
        if (!part.isAlive) continue;
        this.drawBossPart(part);
      }
      // Small HP pips above each surviving part (visual cue for "alive").
      for (const part of b.parts) {
        if (!part.isAlive) continue;
        const pct = part.health / part.maxHealth;
        if (pct >= 1) continue;
        const barW = Math.max(part.width, 24);
        this.entityGfx
          .rect(part.position.x - barW / 2, part.position.y - part.height / 2 - 7, barW, 2)
          .fill({ color: 0x222233, alpha: 0.8 });
        this.entityGfx
          .rect(part.position.x - barW / 2, part.position.y - part.height / 2 - 7, barW * pct, 2)
          .fill({ color: 0xff4455 });
      }
    }
  }

  private drawBossPart(part: Readonly<import("../types/index").BossPart>): void {
    const { x, y } = part.position;
    const time = performance.now() * 0.001;

    switch (part.kind) {
      case "core": {
        // Weak point — pulsing bright core ring, always stands out.
        const pulse = 0.6 + 0.4 * Math.sin(time * 6);
        this.entityGfx
          .circle(x, y, Math.max(part.width, part.height) * 0.55 + pulse * 4)
          .stroke({ color: 0xffffff, width: 3, alpha: 0.7 * pulse });
        this.entityGfx
          .circle(x, y, Math.max(part.width, part.height) * 0.45)
          .fill({ color: part.accent });
        this.entityGfx
          .circle(x, y, Math.max(part.width, part.height) * 0.3)
          .fill({ color: part.color })
          .stroke({ color: 0xffffff, width: 2 });
        // "WEAK POINT" pip
        this.entityGfx
          .circle(x, y, 4)
          .fill({ color: 0xffffff });
        break;
      }
      case "turret": {
        // Hex turret with barrel
        drawHexagon(this.entityGfx, x, y, part.width * 0.55, 0,
          { color: part.color }, { color: part.accent, width: 2 });
        drawRect(this.entityGfx, x - part.width * 0.4, y, part.width * 0.45, 4,
          { color: part.accent });
        drawCircle(this.entityGfx, x, y, 4, { color: 0xffdd88 });
        break;
      }
      case "armor": {
        // Plated rectangle — shieldsCore parts get a subtle golden shimmer
        const shieldAlpha = part.shieldsCore
          ? 0.25 + 0.1 * Math.sin(time * 3)
          : 0;
        if (shieldAlpha > 0) {
          drawRect(this.entityGfx, x, y, part.width + 6, part.height + 6,
            { color: 0xffdd33, alpha: shieldAlpha });
        }
        drawRect(this.entityGfx, x, y, part.width, part.height,
          { color: part.color }, { color: part.accent, width: 2 });
        // Rivet detail
        for (let i = -1; i <= 1; i += 2) {
          drawCircle(this.entityGfx, x + (part.width * 0.4 * i), y - part.height * 0.3, 2,
            { color: part.accent });
          drawCircle(this.entityGfx, x + (part.width * 0.4 * i), y + part.height * 0.3, 2,
            { color: part.accent });
        }
        break;
      }
    }
  }

  private drawBossHealth(b: Readonly<BossState>): void {
    const barX = 20;
    const barY = this.height / 2 - 180;
    const barW = 12;
    const barH = 360;
    const pct = Math.max(0, b.health / b.maxHealth);
    const barColor = b.colorPrimary ?? (b.currentPhase === 0 ? COLOR.boss : 0xffaa33);

    this.hudBgGfx.rect(barX, barY, barW, barH).fill({ color: 0x222233, alpha: 0.8 });
    this.hudBgGfx
      .rect(barX, barY + barH * (1 - pct), barW, barH * pct)
      .fill({ color: barColor });
  }

  private drawProjectile(p: Readonly<Projectile>, fromPlayer: boolean): void {
    const { x, y } = p.position;
    const kind = p.kind ?? "bullet";
    const angle = Math.atan2(p.velocity.y, p.velocity.x);
    const defaultCol = fromPlayer ? COLOR.playerProjectile : COLOR.enemyProjectile;

    switch (kind) {
      case "laser": {
        const col = fromPlayer ? 0x88ffff : 0xff4466;
        drawRotatedRect(this.entityGfx, x, y, p.width, p.height, angle,
          { color: col, alpha: 0.35 });
        drawRotatedRect(this.entityGfx, x, y, p.width, Math.max(2, p.height * 0.5), angle,
          { color: 0xffffff, alpha: 0.95 });
        break;
      }
      case "torpedo": {
        const col = fromPlayer ? 0x66ff88 : 0xffaa55;
        const r = Math.max(p.width, p.height) * 0.5;
        const tailAngle = angle + Math.PI;
        const tx = x + Math.cos(tailAngle) * r * 1.6;
        const ty = y + Math.sin(tailAngle) * r * 1.6;
        this.entityGfx
          .circle(tx, ty, r * 0.55)
          .fill({ color: 0xffdd88, alpha: 0.5 });
        drawRotatedRect(this.entityGfx, x, y, r * 2.4, r * 0.9, angle,
          { color: 0x333344 }, { color: col, width: 2 });
        drawTriangle(this.entityGfx, x, y, r * 1.1, angle,
          { color: col });
        break;
      }
      case "cannon": {
        const col = fromPlayer ? 0xffcc33 : 0xff5533;
        const r = Math.max(p.width, p.height) * 0.5;
        this.entityGfx
          .circle(x, y, r * 1.6)
          .fill({ color: col, alpha: 0.2 });
        this.entityGfx
          .circle(x, y, r)
          .fill({ color: col })
          .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
        this.entityGfx
          .circle(x, y, r * 0.45)
          .fill({ color: 0xfff0cc, alpha: 0.95 });
        break;
      }
      case "pulse-bolt": {
        const col = fromPlayer ? 0xaa88ff : 0xff66cc;
        const pulse = 0.6 + 0.4 * Math.sin(((p.ageMs ?? 0) / 60));
        const r = Math.max(p.width, p.height) * 0.5;
        this.entityGfx
          .circle(x, y, r * (1.4 + pulse * 0.6))
          .fill({ color: col, alpha: 0.25 });
        this.entityGfx
          .circle(x, y, r)
          .fill({ color: col })
          .stroke({ color: 0xffffff, width: 1, alpha: 0.8 });
        break;
      }
      case "charge-beam": {
        // Long tapered beam trailing the tip
        const col = 0xff4488;
        const len = p.width * 1.6;
        drawRotatedRect(this.entityGfx, x, y, len, p.height * 1.2, angle,
          { color: col, alpha: 0.4 });
        drawRotatedRect(this.entityGfx, x, y, len, p.height * 0.5, angle,
          { color: 0xffffff, alpha: 0.95 });
        // Leading glow dot
        this.entityGfx
          .circle(x + Math.cos(angle) * len * 0.5, y + Math.sin(angle) * len * 0.5, 6)
          .fill({ color: 0xffffff, alpha: 0.85 });
        break;
      }
      case "mega-missile": {
        // Heavy missile: long body, glowing warhead tip, exhaust flame trail.
        const bodyCol = 0xaa2244;
        const warheadCol = 0xffee66;
        const t = performance.now() * 0.004;
        const flicker = 0.7 + 0.3 * Math.sin(t * 8);
        const len = Math.max(p.width, 80);
        const thick = Math.max(p.height, 22);
        // Exhaust halo trailing the tail
        const tailX = x - Math.cos(angle) * len * 0.5;
        const tailY = y - Math.sin(angle) * len * 0.5;
        this.entityGfx
          .circle(tailX, tailY, thick * 1.1 * flicker)
          .fill({ color: 0xffaa33, alpha: 0.35 });
        this.entityGfx
          .circle(tailX, tailY, thick * 0.65 * flicker)
          .fill({ color: 0xffffdd, alpha: 0.7 });
        // Body
        drawRotatedRect(this.entityGfx, x, y, len * 0.85, thick, angle,
          { color: bodyCol }, { color: 0xffffff, width: 2 });
        // Warhead nose (bright triangle pointing in velocity direction)
        const noseX = x + Math.cos(angle) * len * 0.42;
        const noseY = y + Math.sin(angle) * len * 0.42;
        drawTriangle(this.entityGfx, noseX, noseY, thick * 1.1, angle,
          { color: warheadCol }, { color: 0xffffff, width: 2 });
        // Warhead inner glow
        this.entityGfx
          .circle(noseX - Math.cos(angle) * thick * 0.2, noseY - Math.sin(angle) * thick * 0.2, thick * 0.45 * flicker)
          .fill({ color: 0xffffff, alpha: 0.85 });
        // Fins — two small rectangles perpendicular near tail
        const finOffX = Math.cos(angle + Math.PI / 2) * thick * 0.9;
        const finOffY = Math.sin(angle + Math.PI / 2) * thick * 0.9;
        const finBaseX = x - Math.cos(angle) * len * 0.3;
        const finBaseY = y - Math.sin(angle) * len * 0.3;
        drawRotatedRect(this.entityGfx, finBaseX + finOffX, finBaseY + finOffY,
          thick * 0.6, thick * 0.3, angle,
          { color: bodyCol }, { color: 0xffffff, width: 1 });
        drawRotatedRect(this.entityGfx, finBaseX - finOffX, finBaseY - finOffY,
          thick * 0.6, thick * 0.3, angle,
          { color: bodyCol }, { color: 0xffffff, width: 1 });
        break;
      }
      case "prox-bomb": {
        // Pulsing canister with trigger halo
        const pulse = 0.6 + 0.4 * Math.sin(((p.ageMs ?? 0) / 80));
        const r = Math.max(p.width, p.height) * 0.55;
        this.entityGfx
          .circle(x, y, (p.proxTriggerRadius ?? 80) * 0.15 * pulse)
          .stroke({ color: 0xff6699, width: 2, alpha: 0.4 * pulse });
        drawOctagon(this.entityGfx, x, y, r, (p.ageMs ?? 0) * 0.008,
          { color: 0xff6699 }, { color: 0xffffff, width: 2 });
        this.entityGfx
          .circle(x, y, r * 0.4)
          .fill({ color: 0xffffff, alpha: 0.9 * pulse });
        break;
      }
      default: {
        const col = defaultCol;
        this.entityGfx
          .rect(x - p.width / 2, y - p.height / 2, p.width, p.height)
          .fill({ color: col });
        this.entityGfx
          .rect(x - p.width / 2 - 2, y - p.height / 2 - 1, p.width + 4, p.height + 2)
          .fill({ color: col, alpha: 0.25 });
      }
    }
  }

  private drawPowerUp(pu: Readonly<PowerUp>): void {
    const { x, y } = pu.position;
    const half = pu.width / 2;
    const t = performance.now() * 0.004;
    const pulse = 0.7 + 0.3 * Math.sin(t);

    let col: number = COLOR.powerUpWeapon;
    switch (pu.type) {
      case "weapon-upgrade":
        col = COLOR.powerUpWeapon;
        break;
      case "shield":
        col = COLOR.powerUpShield;
        break;
      case "extra-life":
        col = COLOR.powerUpLife;
        break;
      case "health-recovery":
        col = COLOR.powerUpHealth;
        break;
      case "speed-boost":
        col = 0x99ffff;
        break;
      case "weapon-spread":
        col = 0xffaa33;
        break;
      case "weapon-bomb":
        col = 0xff6699;
        break;
      case "mega-laser":
        col = 0xff4466;
        break;
    }

    this.entityGfx
      .rect(x - half - 2, y - half - 2, pu.width + 4, pu.height + 4)
      .fill({ color: col, alpha: 0.25 * pulse });
    this.entityGfx
      .rect(x - half, y - half, pu.width, pu.height)
      .fill({ color: col, alpha: 0.95 })
      .stroke({ color: 0xffffff, width: 2 });

    // Tiny pictogram per type so pickups read at a glance.
    switch (pu.type) {
      case "speed-boost":
        // chevron trio
        for (let i = 0; i < 3; i++) {
          this.entityGfx
            .poly([
              x - 6 + i * 3, y - 5,
              x + i * 3, y,
              x - 6 + i * 3, y + 5,
            ])
            .fill({ color: 0xffffff, alpha: 0.9 });
        }
        break;
      case "weapon-spread":
        // three diverging bars
        for (let i = -1; i <= 1; i++) {
          this.entityGfx
            .rect(x - 1, y - 6, 2, 12)
            .fill({ color: 0xffffff, alpha: 0.9 });
          this.entityGfx
            .rect(x - 1 + i * 4, y - 5, 2, 10)
            .fill({ color: 0xffffff, alpha: 0.7 });
        }
        break;
      case "weapon-bomb":
        this.entityGfx
          .circle(x, y + 1, 5)
          .fill({ color: 0xffffff, alpha: 0.9 });
        this.entityGfx
          .rect(x - 1, y - 6, 2, 3)
          .fill({ color: 0xffffff, alpha: 0.95 });
        break;
      case "mega-laser":
        // A long beam pictogram across the pickup.
        this.entityGfx
          .rect(x - 8, y - 1, 16, 2)
          .fill({ color: 0xffffff, alpha: 0.95 });
        this.entityGfx
          .rect(x - 8, y - 3, 16, 1)
          .fill({ color: 0xffdd99, alpha: 0.8 });
        this.entityGfx
          .rect(x - 8, y + 2, 16, 1)
          .fill({ color: 0xffdd99, alpha: 0.8 });
        this.entityGfx
          .circle(x - 8, y, 3)
          .fill({ color: 0xffff88, alpha: 0.95 });
        break;
      default:
        this.entityGfx
          .rect(x - 4, y - 6, 8, 12)
          .fill({ color: 0xffffff, alpha: 0.9 });
    }
  }

  private updateExplosions(deltaMs: number): void {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i]!;
      e.age += deltaMs;
      if (e.age >= e.maxAge) {
        this.explosions.splice(i, 1);
        continue;
      }
      const t = e.age / e.maxAge;
      const r = e.radius * (0.3 + t * 1.1);
      this.fxGfx
        .circle(e.x, e.y, r)
        .stroke({ color: e.color, width: 3, alpha: 1 - t });
      this.fxGfx
        .circle(e.x, e.y, r * 0.5)
        .fill({ color: e.color, alpha: (1 - t) * 0.5 });
    }

    // Laser-impact sparks: radiating spokes + hot core.
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.age += deltaMs;
      if (s.age >= s.maxAge) {
        this.sparks.splice(i, 1);
        continue;
      }
      const t = s.age / s.maxAge;
      const alpha = 1 - t;
      const len = s.size * (0.4 + t * 1.1);
      // Four radiating spokes (× two perpendicular pairs rotated by s.rot).
      for (let k = 0; k < 4; k++) {
        const a = s.rot + k * (Math.PI / 2);
        const ex = s.x + Math.cos(a) * len;
        const ey = s.y + Math.sin(a) * len;
        this.fxGfx
          .moveTo(s.x, s.y)
          .lineTo(ex, ey)
          .stroke({ color: s.color, width: 2, alpha });
      }
      this.fxGfx
        .circle(s.x, s.y, s.size * 0.35 * (1 - t * 0.5))
        .fill({ color: 0xffffff, alpha: alpha * 0.9 });
    }

    // Ring pulses
    for (let i = this.ringPulses.length - 1; i >= 0; i--) {
      const rp = this.ringPulses[i]!;
      rp.age += deltaMs;
      if (rp.age >= rp.maxAge) {
        this.ringPulses.splice(i, 1);
        continue;
      }
      const t = rp.age / rp.maxAge;
      const r = rp.maxRadius * t;
      this.fxGfx
        .circle(rp.x, rp.y, r)
        .stroke({ color: rp.color, width: 4, alpha: 1 - t });
      this.fxGfx
        .circle(rp.x, rp.y, r * 0.6)
        .stroke({ color: 0xffffff, width: 2, alpha: (1 - t) * 0.7 });
    }

    // Floating texts
    const dt = deltaMs / 1_000;
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i]!;
      f.age += deltaMs;
      if (f.age >= f.maxAge) {
        f.text.destroy();
        this.floatingTexts.splice(i, 1);
        continue;
      }
      const t = f.age / f.maxAge;
      f.text.y += f.vy * dt;
      f.text.alpha = 1 - t;
      f.text.scale.set(1 + t * 0.3);
    }

    // Banner
    if (this.bannerMaxAgeMs > 0) {
      this.bannerAgeMs += deltaMs;
      if (this.bannerAgeMs >= this.bannerMaxAgeMs) {
        this.bannerTitleText.visible = false;
        this.bannerSubText.visible = false;
        this.bannerMaxAgeMs = 0;
      } else {
        const t = this.bannerAgeMs / this.bannerMaxAgeMs;
        // Fade in quick, hold, fade out.
        let a = 1;
        if (t < 0.15) a = t / 0.15;
        else if (t > 0.8) a = 1 - (t - 0.8) / 0.2;
        this.bannerTitleText.alpha = a;
        this.bannerSubText.alpha = a;
        const pulse = 1 + 0.08 * Math.sin(performance.now() * 0.01);
        this.bannerTitleText.scale.set(pulse);
      }
    }
  }

  private updateHud(state: Readonly<GameState>, bombCredits: number): void {
    const run = state.currentRunStats;
    const player = state.playerState;
    this.scoreText.text = `SCORE ${run.score}`;
    this.levelText.text = `LEVEL ${state.levelState.levelNumber}`;
    this.livesText.text = `LIVES ${player.lives}`;
    this.healthText.text = `HP ${player.health}`;
    this.shieldText.text = player.shield.active ? "SHIELD ON" : "";
    this.hitsText.text = `HITS ${run.consecutiveHits}`;
    const gun = "I".repeat(Math.max(1, Math.min(5, player.weapon.upgradeLevel)));
    this.weaponText.text = `GUN ${gun}`;
    this.bombsText.text = bombCredits > 0 ? `BOMBS ${bombCredits}` : "";
  }

  /** Populates the 2-item main-menu list and highlights the selected one. */
  private updateMainMenu(selectedIdx: number): void {
    const items = ["PLAY", "STATS"];
    this.renderMenuList(items, selectedIdx, this.height / 2 + 80, 46);
  }

  /** Populates the 3-item pause-menu list and highlights the selected one. */
  private updatePauseMenu(selectedIdx: number): void {
    const items = ["CONTINUE", "STATS", "QUIT TO MENU"];
    this.renderMenuList(items, selectedIdx, this.height / 2, 52);
  }

  private renderMenuList(
    items: string[],
    selectedIdx: number,
    startY: number,
    rowSpacing: number,
  ): void {
    for (let i = 0; i < this.menuItemTexts.length; i++) {
      const t = this.menuItemTexts[i]!;
      if (i >= items.length) {
        t.text = "";
        t.visible = false;
        continue;
      }
      t.visible = true;
      const label = items[i]!;
      const selected = i === selectedIdx;
      t.text = selected ? `> ${label} <` : label;
      t.style.fill = selected ? COLOR.hudAmber : COLOR.hudWhite;
      t.y = startY + i * rowSpacing;
    }
  }

  /** Populates the stats screen columns from current/last/all-time stats. */
  private updateStatsScreen(
    state: Readonly<GameState>,
    lastRun: Readonly<RunStats> | null,
  ): void {
    this.statsColCurrent.text = formatRunStats(state.currentRunStats);
    this.statsColLast.text = lastRun
      ? formatRunStats(lastRun)
      : "— NO RUNS YET —";
    this.statsColAllTime.text = formatAllTimeStats(state.allTimeStats);
  }

  private updateGameOverText(state: Readonly<GameState>): void {
    const run = state.currentRunStats;
    const all = state.allTimeStats;
    const secs = Math.round(run.timeAliveMs / 1_000);
    this.gameOverStats.text = [
      `SCORE  ${run.score}`,
      `LEVEL REACHED  ${run.levelReached}`,
      `TIME ALIVE  ${secs}s`,
      `ENEMIES KILLED  ${run.enemiesKilled}`,
      `BEST GUN  LV ${run.gunUpgradeAchieved}`,
      `PEAK HITS  ${run.peakConsecutiveHits}`,
      "",
      `TOP SCORE  ${all.topScore}`,
      `FURTHEST LEVEL  ${all.furthestLevel}`,
    ].join("\n");
  }
}

// Two-column table layout: labels pad to LABEL_W, values pad-start to VAL_W
// so every row has the same monospace width and renders as a tidy grid.
const LABEL_W = 14;
const VAL_W = 7;

function row(label: string, value: string | number): string {
  return label.padEnd(LABEL_W) + String(value).padStart(VAL_W);
}

function formatRunStats(r: Readonly<RunStats>): string {
  const secs = Math.round(r.timeAliveMs / 1_000);
  return [
    row("SCORE", r.score),
    row("LEVEL", r.levelReached),
    row("TIME ALIVE", `${secs}s`),
    row("ENEMIES", r.enemiesKilled),
    row("BEST GUN", `LV ${r.gunUpgradeAchieved}`),
    row("PEAK HITS", r.peakConsecutiveHits),
    row("SAFE TIME", `${Math.round(r.longestTimeWithoutDamageSec)}s`),
    row("DAMAGE TAKEN", r.totalDamageReceived),
    row("SHIELDS", r.shieldsCollected),
    row("LIVES GAINED", r.extraLivesCollected),
  ].join("\n");
}

function formatAllTimeStats(a: {
  topScore: number;
  furthestLevel: number;
  bestGunUpgrade: number;
  totalEnemiesKilled: number;
  totalGamesPlayed: number;
  longestTimeAlive: number;
  longestTimeSafeSec: number;
  averageScore: number;
  averageLevelReached: number;
}): string {
  const secs = Math.round(a.longestTimeAlive / 1_000);
  return [
    row("TOP SCORE", a.topScore),
    row("FURTHEST LVL", a.furthestLevel),
    row("BEST GUN", `LV ${a.bestGunUpgrade}`),
    row("TOTAL KILLS", a.totalEnemiesKilled),
    row("GAMES PLAYED", a.totalGamesPlayed),
    row("LONGEST LIFE", `${secs}s`),
    row("LONGEST SAFE", `${Math.round(a.longestTimeSafeSec)}s`),
    row("AVG SCORE", Math.round(a.averageScore)),
    row("AVG LEVEL", a.averageLevelReached.toFixed(1)),
  ].join("\n");
}

/** Blend hex color `a` toward `b` by factor `t` (0..1). Used for phase-2 tint. */
function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

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

interface ShipyardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShipyardPaletteTile {
  readonly partId: string;
  readonly rect: ShipyardRect;
  readonly name: string;
  readonly powerCost: number;
  readonly powerCapacity: number;
  readonly visualKind: string;
  readonly colour: number;
  readonly shape: { readonly width: number; readonly height: number };
  readonly category: string;
  readonly disabled: boolean;
  readonly isHeld: boolean;
}

export interface ShipyardSavedSlot {
  readonly rect: ShipyardRect;
  readonly index: number;
  readonly name: string;
  readonly empty: boolean;
  readonly equipped: boolean;
  readonly current: boolean;
}

export interface ShipyardRenderData {
  readonly layout: {
    readonly canvasRect: ShipyardRect;
    readonly paletteRect: ShipyardRect;
    readonly statsRect: ShipyardRect;
    readonly savedPanelRect: ShipyardRect;
    readonly newBtn: ShipyardRect;
    readonly saveBtn: ShipyardRect;
    readonly backBtn: ShipyardRect;
    readonly trashBtn: ShipyardRect;
  };
  readonly savedSlots: ReadonlyArray<ShipyardSavedSlot>;
  readonly statusMsg: string | null;
  readonly trashAction: "none" | "part" | "blueprint";
  readonly palette: ReadonlyArray<ShipyardPaletteTile>;
  readonly ship: {
    readonly originX: number;
    readonly originY: number;
    readonly scale: number;
    readonly placements: ReadonlyArray<{
      readonly placedId: string;
      readonly partId: string;
      readonly worldX: number;
      readonly worldY: number;
      readonly visualKind: string;
      readonly colour: number;
      readonly shape: { readonly width: number; readonly height: number };
      readonly selected: boolean;
      readonly category: string;
    }>;
    readonly sockets: ReadonlyArray<{
      readonly parentPlacedId: string;
      readonly socketId: string;
      readonly screenX: number;
      readonly screenY: number;
      readonly highlighted: boolean;
    }>;
  };
  readonly ghost: null | {
    readonly screenX: number;
    readonly screenY: number;
    readonly visualKind: string;
    readonly colour: number;
    readonly shape: { readonly width: number; readonly height: number };
    readonly valid: boolean;
  };
  readonly stats: {
    readonly hp: number;
    readonly speed: number;
    readonly damage: number;
    readonly fireRate: number;
    readonly hitboxW: number;
    readonly hitboxH: number;
    readonly powerUsed: number;
    readonly powerCapacity: number;
    readonly cost: number;
  };
  readonly blueprintName: string;
  readonly credits: number;
  readonly hasSelection: boolean;
  readonly heldPartName: string | null;
}

export interface PlayerBlueprintVisual {
  readonly placements: ReadonlyArray<{
    readonly worldX: number;
    readonly worldY: number;
    readonly visualKind: string;
    readonly colour: number;
    readonly shape: { readonly width: number; readonly height: number };
  }>;
}

export interface StarmapRenderData {
  readonly sectorName: string;
  readonly nodes: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly x: number;
    readonly y: number;
    readonly unlocked: boolean;
    readonly completed: boolean;
    readonly current: boolean;
    readonly selected: boolean;
  }>;
  readonly edges: ReadonlyArray<{
    readonly fromX: number;
    readonly fromY: number;
    readonly toX: number;
    readonly toY: number;
    readonly unlocked: boolean;
  }>;
  readonly credits: number;
  readonly selectedMissionLabel: string | null;
}

export interface SolarSystemRenderData {
  readonly playerPosition: { x: number; y: number };
  readonly playerHeading: number;
  readonly celestialBodies: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly position: { x: number; y: number };
    readonly radius: number;
    readonly color: { r: number; g: number; b: number };
  }>;
  readonly locations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly position: { x: number; y: number };
    readonly dockingRadius: number;
  }>;
  readonly nearbyLocations: string[];
  readonly zoomLevel: number;
  readonly mapOpen?: boolean;
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
  powerUpWeapon: 0xffcc33,   // gold — weapon-upgrade
  powerUpShield: 0x99ccff,   // pale blue — shield
  powerUpLife: 0xff3377,     // crimson/pink — extra-life
  powerUpHealth: 0xbbffdd,   // mint — health-recovery
  powerUpSpeed: 0xaa66ff,    // violet — speed-boost
  powerUpSpread: 0xff9933,   // orange — weapon-spread
  powerUpBomb: 0xcc2244,     // dark red — weapon-bomb
  powerUpMegaLaser: 0xff4466, // pink-red — matches the beam halo in drawMegaLaser
} as const;

/**
 * Per-type visual defs for power-ups. Drives both drop rendering (drawPowerUp)
 * and the collection FX (showPowerUpCollected) so pickups read the same way
 * everywhere they appear.
 *
 * `pulseHz` — cycles per second of the glow's sine pulse.
 * `pulseShape` — `"sine"` default breathe, `"double"` heartbeat (two quick
 *   pulses then rest), `"flicker"` faster wobble, `"strobe"` square wave.
 */
type PowerUpPulseShape = "sine" | "double" | "flicker" | "strobe";
interface PowerUpVisualDef {
  readonly color: number;
  readonly pulseHz: number;
  readonly pulseShape: PowerUpPulseShape;
}
const POWER_UP_VISUAL: Readonly<Record<PowerUpType, PowerUpVisualDef>> = {
  "extra-life":      { color: COLOR.powerUpLife,      pulseHz: 1.6, pulseShape: "double" },
  "health-recovery": { color: COLOR.powerUpHealth,    pulseHz: 0.8, pulseShape: "sine" },
  "shield":          { color: COLOR.powerUpShield,    pulseHz: 0.6, pulseShape: "sine" },
  "weapon-upgrade":  { color: COLOR.powerUpWeapon,    pulseHz: 2.4, pulseShape: "flicker" },
  "weapon-spread":   { color: COLOR.powerUpSpread,    pulseHz: 2.2, pulseShape: "flicker" },
  "weapon-bomb":     { color: COLOR.powerUpBomb,      pulseHz: 1.2, pulseShape: "sine" },
  "mega-laser":      { color: COLOR.powerUpMegaLaser, pulseHz: 5.0, pulseShape: "strobe" },
  "speed-boost":     { color: COLOR.powerUpSpeed,     pulseHz: 3.0, pulseShape: "flicker" },
};

/** Returns a [0, 1] pulse intensity for the given shape at time `tSec`. */
function pulseIntensity(shape: PowerUpPulseShape, hz: number, tSec: number): number {
  const phase = (tSec * hz) % 1;
  switch (shape) {
    case "sine":
      return 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
    case "double": {
      // Heartbeat: two quick bumps (0.0 and 0.2 of the cycle), then rest.
      const bump = (p: number): number => {
        const d = Math.min(Math.abs(phase - p), Math.abs(phase - p - 1));
        return Math.max(0, 1 - d * 8);
      };
      return Math.max(bump(0.0), bump(0.2));
    }
    case "flicker": {
      // Sine layered with a higher-frequency wobble — never quite settles.
      const base = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const wob = 0.25 * Math.sin(phase * Math.PI * 6);
      return Math.min(1, Math.max(0, base + wob));
    }
    case "strobe":
      return phase < 0.5 ? 1 : 0.25;
  }
}

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

  // Starmap (campaign) overlay elements.
  private readonly starmapGfx: Graphics;
  private readonly starmapTitle: Text;
  private readonly starmapSelectedName: Text;
  private readonly starmapMissionLabel: Text;
  private readonly starmapCreditsText: Text;
  private readonly starmapPrompt: Text;
  private readonly starmapNodeLabels: Text[] = [];

  // Solar system overlay elements.
  private readonly solarSystemGfx: Graphics;

  // Shipyard overlay elements.
  private readonly shipyardGfx: Graphics;
  private readonly shipyardTitle: Text;
  private readonly shipyardStatsText: Text;
  private readonly shipyardSummaryText: Text;
  private readonly shipyardPrompt: Text;
  private readonly shipyardPaletteLabels: Text[] = [];
  private readonly shipyardButtonLabels: Text[] = [];
  private readonly shipyardSavedLabels: Text[] = [];
  private readonly shipyardSavedHeader: Text;
  private readonly shipyardStatusText: Text;

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
    // Pause overlay — dark scrim drawn under every menuLayer element so the
    // scrim dims the frozen gameplay but never dims the pause menu itself.
    // Cleared when not in pause, so order doesn't affect other screens.
    this.pauseOverlay = new Graphics();
    this.menuLayer.addChild(this.pauseOverlay);

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
    for (let i = 0; i < 5; i++) {
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

    // Starmap overlay — drawn into its own Graphics layer that lives under
    // the text labels. Nodes + edges are rebuilt every frame from extras.
    this.starmapGfx = new Graphics();
    this.menuLayer.addChild(this.starmapGfx);

    // Solar system overlay — drawn into its own Graphics layer
    this.solarSystemGfx = new Graphics();
    this.menuLayer.addChild(this.solarSystemGfx);

    this.starmapTitle = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 40,
        fill: COLOR.hudCyan,
        fontWeight: "bold",
      }),
    });
    this.starmapTitle.anchor.set(0.5, 0);
    this.starmapTitle.x = width / 2;
    this.starmapTitle.y = 24;
    this.starmapTitle.visible = false;
    this.menuLayer.addChild(this.starmapTitle);

    this.starmapSelectedName = new Text({
      text: "",
      style: hudStyle(COLOR.hudAmber, 22),
    });
    this.starmapSelectedName.anchor.set(0.5, 1);
    this.starmapSelectedName.x = width / 2;
    this.starmapSelectedName.y = height - 76;
    this.starmapSelectedName.visible = false;
    this.menuLayer.addChild(this.starmapSelectedName);

    this.starmapMissionLabel = new Text({
      text: "",
      style: hudStyle(COLOR.hudWhite, 18),
    });
    this.starmapMissionLabel.anchor.set(0.5, 1);
    this.starmapMissionLabel.x = width / 2;
    this.starmapMissionLabel.y = height - 50;
    this.starmapMissionLabel.visible = false;
    this.menuLayer.addChild(this.starmapMissionLabel);

    this.starmapCreditsText = new Text({
      text: "",
      style: hudStyle(COLOR.hudAmber, 18),
    });
    this.starmapCreditsText.anchor.set(1, 0);
    this.starmapCreditsText.x = width - 24;
    this.starmapCreditsText.y = 24;
    this.starmapCreditsText.visible = false;
    this.menuLayer.addChild(this.starmapCreditsText);

    this.starmapPrompt = new Text({
      text: "↑↓ SELECT   ENTER  LAUNCH   ESC  BACK",
      style: hudStyle(COLOR.hudWhite, 14),
    });
    this.starmapPrompt.anchor.set(0.5, 1);
    this.starmapPrompt.x = width / 2;
    this.starmapPrompt.y = height - 20;
    this.starmapPrompt.visible = false;
    this.menuLayer.addChild(this.starmapPrompt);

    // Shipyard overlay
    this.shipyardGfx = new Graphics();
    this.menuLayer.addChild(this.shipyardGfx);

    this.shipyardTitle = new Text({
      text: "SHIPYARD",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 28,
        fill: COLOR.hudAmber,
        fontWeight: "bold",
      }),
    });
    this.shipyardTitle.anchor.set(0.5, 0);
    this.shipyardTitle.x = width / 2;
    this.shipyardTitle.y = 18;
    this.shipyardTitle.visible = false;
    this.menuLayer.addChild(this.shipyardTitle);

    this.shipyardStatsText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 16,
        fill: COLOR.hudWhite,
        align: "left",
        lineHeight: 22,
      }),
    });
    this.shipyardStatsText.anchor.set(0, 0);
    this.shipyardStatsText.x = 976;
    this.shipyardStatsText.y = 118;
    this.shipyardStatsText.visible = false;
    this.menuLayer.addChild(this.shipyardStatsText);

    this.shipyardSummaryText = new Text({
      text: "",
      style: hudStyle(COLOR.hudCyan, 16),
    });
    this.shipyardSummaryText.anchor.set(0.5, 0);
    this.shipyardSummaryText.x = width / 2;
    this.shipyardSummaryText.y = 56;
    this.shipyardSummaryText.visible = false;
    this.menuLayer.addChild(this.shipyardSummaryText);

    this.shipyardPrompt = new Text({
      text: "TAP A PART  •  TAP THE SHIP TO SNAP  •  TAP A PART TO SELECT",
      style: hudStyle(COLOR.hudWhite, 14),
    });
    this.shipyardPrompt.anchor.set(0.5, 1);
    this.shipyardPrompt.x = width / 2;
    this.shipyardPrompt.y = height - 8;
    this.shipyardPrompt.visible = false;
    this.menuLayer.addChild(this.shipyardPrompt);

    this.shipyardSavedHeader = new Text({
      text: "SAVED SHIPS",
      style: hudStyle(COLOR.hudAmber, 14),
    });
    this.shipyardSavedHeader.anchor.set(0.5, 0);
    this.shipyardSavedHeader.visible = false;
    this.menuLayer.addChild(this.shipyardSavedHeader);

    this.shipyardStatusText = new Text({
      text: "",
      style: hudStyle(COLOR.hudAmber, 16),
    });
    this.shipyardStatusText.anchor.set(0.5, 0);
    this.shipyardStatusText.x = width / 2;
    this.shipyardStatusText.y = 80;
    this.shipyardStatusText.visible = false;
    this.menuLayer.addChild(this.shipyardStatusText);

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
      starmap: StarmapRenderData | null;
      shipyard: ShipyardRenderData | null;
      solarSystem: SolarSystemRenderData | null;
      playerBlueprint: PlayerBlueprintVisual | null;
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
    const isStarmap = screen === "starmap";
    const isShipyard = screen === "shipyard";
    const isSolarSystem = screen === "solar-system" || screen === "solar-system-paused";
    const isDocked = screen === "docked";
    // Gameplay entities stay visible behind the pause overlay.
    const drawsEntities = isGameplay || isPause;

    this.menuLayer.visible = isMenu || isGameOver || isPause || isStats || isStarmap || isShipyard || isSolarSystem || isDocked;
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
    // Starmap overlay toggles
    this.starmapTitle.visible = isStarmap;
    this.starmapSelectedName.visible = isStarmap;
    this.starmapMissionLabel.visible = isStarmap;
    this.starmapCreditsText.visible = isStarmap;
    this.starmapPrompt.visible = isStarmap;
    for (const t of this.starmapNodeLabels) t.visible = isStarmap;
    if (!isStarmap) this.starmapGfx.clear();
    // Solar system overlay toggles
    if (!isSolarSystem && !isDocked) this.solarSystemGfx.clear();
    // Shipyard overlay toggles
    this.shipyardTitle.visible = isShipyard;
    this.shipyardStatsText.visible = isShipyard;
    this.shipyardSummaryText.visible = isShipyard;
    this.shipyardPrompt.visible = isShipyard;
    this.shipyardSavedHeader.visible = isShipyard;
    // shipyardStatusText visibility is driven by data.statusMsg each frame.
    if (!isShipyard) this.shipyardStatusText.visible = false;
    for (const t of this.shipyardPaletteLabels) t.visible = isShipyard;
    for (const t of this.shipyardButtonLabels) t.visible = isShipyard;
    for (const t of this.shipyardSavedLabels) t.visible = isShipyard;
    if (!isShipyard) this.shipyardGfx.clear();
    // Menu list items: used by main-menu (3) and pause (3); hidden on stats / starmap.
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

    if (isStarmap && extras.starmap) {
      this.drawStarmap(extras.starmap);
      return;
    }

    if (isShipyard && extras.shipyard) {
      this.drawShipyard(extras.shipyard);
      return;
    }

    if (isSolarSystem && extras.solarSystem) {
      this.drawSolarSystem(extras.solarSystem);
      // Draw pause overlay if paused
      if (screen === "solar-system-paused") {
        this.drawPauseOverlay();
      }
      return;
    }

    if (isDocked) {
      // Draw docked menu overlay
      this.drawDockedMenu(state);
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

    if (state.playerState.isAlive) this.drawPlayer(state.playerState, extras.playerBlueprint);
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
    const color: number = POWER_UP_VISUAL[type].color;
    let label = "";
    switch (type) {
      case "weapon-upgrade":
        label = "GUN+";
        break;
      case "shield":
        label = "SHIELD";
        break;
      case "extra-life":
        label = "+LIFE";
        break;
      case "health-recovery":
        label = "+HP";
        break;
      case "speed-boost":
        label = "SPEED!";
        break;
      case "weapon-spread":
        label = "SPREAD";
        break;
      case "weapon-bomb":
        label = "BOMB";
        break;
      case "mega-laser":
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

  private drawPlayer(
    p: Readonly<PlayerState>,
    blueprint: PlayerBlueprintVisual | null,
  ): void {
    const { x, y } = p.position;
    const w = p.width;
    const h = p.height;
    const flicker = p.invulnerabilityTimer > 0 && Math.floor(p.invulnerabilityTimer / 80) % 2 === 0;
    if (flicker) return;

    if (blueprint && blueprint.placements.length > 0) {
      // Assembled silhouette from the equipped blueprint. Placements carry
      // world offsets from the root core; drawPartVisual handles the per-kind
      // look. Rendered at 1:1 since shape/socket offsets are already in pixels.
      for (const pl of blueprint.placements) {
        this.drawPartVisual(
          this.entityGfx,
          pl.visualKind,
          x + pl.worldX,
          y + pl.worldY,
          pl.shape.width,
          pl.shape.height,
          pl.colour,
          1,
        );
      }
    } else {
      // Default arrowhead used when no blueprint is equipped (arcade default).
      this.entityGfx
        .poly([
          x + w / 2, y,
          x - w / 2, y - h / 2,
          x - w / 4, y,
          x - w / 2, y + h / 2,
        ])
        .fill({ color: COLOR.player });
      this.entityGfx
        .rect(x - w / 4, y - 3, w / 2, 6)
        .fill({ color: COLOR.playerAccent });
    }

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
    const def = POWER_UP_VISUAL[pu.type];
    const tSec = performance.now() / 1000;
    const intensity = pulseIntensity(def.pulseShape, def.pulseHz, tSec);

    this.drawPulseGlow(x, y, def.color, intensity);

    switch (pu.type) {
      case "extra-life":
        this.drawHeartPowerUp(x, y, def.color);
        break;
      case "health-recovery":
        this.drawCrossPowerUp(x, y, def.color);
        break;
      case "shield":
        this.drawPentagonPowerUp(x, y, def.color, tSec);
        break;
      case "weapon-upgrade":
        this.drawChevronPowerUp(x, y, def.color);
        break;
      case "weapon-spread":
        this.drawTridentPowerUp(x, y, def.color);
        break;
      case "weapon-bomb":
        this.drawCrosshairPowerUp(x, y, def.color);
        break;
      case "mega-laser":
        this.drawDiamondPowerUp(x, y, def.color, intensity);
        break;
      case "speed-boost":
        this.drawDoubleChevronPowerUp(x, y, def.color);
        break;
    }
  }

  /** Shared pulsing halo behind every power-up icon. */
  private drawPulseGlow(x: number, y: number, color: number, intensity: number): void {
    const rOuter = 18 + intensity * 6;
    const rInner = 12 + intensity * 3;
    this.entityGfx.circle(x, y, rOuter).fill({ color, alpha: 0.08 + intensity * 0.12 });
    this.entityGfx.circle(x, y, rInner).fill({ color, alpha: 0.18 + intensity * 0.18 });
  }

  private drawHeartPowerUp(x: number, y: number, color: number): void {
    // Heart = two circles + a downward-pointing triangle. Position tuned so
    // the two lobes read clearly at 24x24.
    this.entityGfx.circle(x - 4, y - 3, 5).fill({ color });
    this.entityGfx.circle(x + 4, y - 3, 5).fill({ color });
    this.entityGfx
      .poly([x - 8, y - 1, x + 8, y - 1, x, y + 9])
      .fill({ color });
    // Highlight spark on the upper-left lobe for depth.
    this.entityGfx.circle(x - 5, y - 4, 1.5).fill({ color: 0xffffff, alpha: 0.85 });
  }

  private drawCrossPowerUp(x: number, y: number, color: number): void {
    // Medical cross — two rectangles forming a plus sign.
    const arm = 3;
    const len = 10;
    this.entityGfx.rect(x - arm, y - len, arm * 2, len * 2).fill({ color });
    this.entityGfx.rect(x - len, y - arm, len * 2, arm * 2).fill({ color });
    // Thin stroke in white for contrast on dark bg.
    this.entityGfx
      .rect(x - arm, y - len, arm * 2, len * 2)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
    this.entityGfx
      .rect(x - len, y - arm, len * 2, arm * 2)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
  }

  private drawPentagonPowerUp(x: number, y: number, color: number, tSec: number): void {
    // Slowly rotating pentagon with an inner ring — shield identity.
    const rot = tSec * 0.6;
    const r = 10;
    const pts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = rot + i * ((Math.PI * 2) / 5) - Math.PI / 2;
      pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    this.entityGfx.poly(pts).fill({ color, alpha: 0.85 });
    this.entityGfx.poly(pts).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    this.entityGfx.circle(x, y, 4).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
  }

  private drawChevronPowerUp(x: number, y: number, color: number): void {
    // Up-chevron (weapon upgrade = tier up). Two stacked triangles.
    this.entityGfx
      .poly([x - 9, y + 2, x, y - 7, x + 9, y + 2, x + 5, y + 2, x, y - 2, x - 5, y + 2])
      .fill({ color });
    this.entityGfx
      .poly([x - 9, y + 8, x, y - 1, x + 9, y + 8, x + 5, y + 8, x, y + 4, x - 5, y + 8])
      .fill({ color, alpha: 0.85 });
  }

  private drawTridentPowerUp(x: number, y: number, color: number): void {
    // Three-prong fan — spread shot identity.
    for (let i = -1; i <= 1; i++) {
      const tipX = x + i * 6;
      this.entityGfx
        .poly([tipX - 2, y + 8, tipX + 2, y + 8, tipX, y - 9])
        .fill({ color });
    }
    this.entityGfx.rect(x - 7, y + 6, 14, 3).fill({ color });
  }

  private drawCrosshairPowerUp(x: number, y: number, color: number): void {
    // Circle + crosshair reticle — bomb identity.
    this.entityGfx.circle(x, y, 9).stroke({ color, width: 2 });
    this.entityGfx.circle(x, y, 5).fill({ color, alpha: 0.7 });
    this.entityGfx.rect(x - 10, y - 0.5, 7, 1.5).fill({ color });
    this.entityGfx.rect(x + 3, y - 0.5, 7, 1.5).fill({ color });
    this.entityGfx.rect(x - 0.5, y - 10, 1.5, 7).fill({ color });
    this.entityGfx.rect(x - 0.5, y + 3, 1.5, 7).fill({ color });
  }

  private drawDiamondPowerUp(x: number, y: number, color: number, intensity: number): void {
    // Rotated square (diamond) with a beam stripe — mega-laser identity.
    const r = 10;
    this.entityGfx
      .poly([x, y - r, x + r, y, x, y + r, x - r, y])
      .fill({ color, alpha: 0.3 + intensity * 0.5 });
    this.entityGfx
      .poly([x, y - r, x + r, y, x, y + r, x - r, y])
      .stroke({ color: 0xffffff, width: 1.5 });
    // Horizontal beam stripe through the centre.
    this.entityGfx.rect(x - r, y - 1, r * 2, 2).fill({ color: 0xffffff, alpha: 0.9 });
  }

  private drawDoubleChevronPowerUp(x: number, y: number, color: number): void {
    // Double chevron "≫" — speed identity.
    for (let i = 0; i < 2; i++) {
      const ox = -5 + i * 6;
      this.entityGfx
        .poly([x + ox - 4, y - 7, x + ox + 4, y, x + ox - 4, y + 7, x + ox - 1, y, x + ox - 4, y - 3])
        .fill({ color });
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

  /**
   * Draws the campaign starmap: node dots + connecting paths + labels.
   *
   * Edges go first so dots draw on top. Locked nodes are rendered dimmed,
   * the current node has an outer halo, and the selected node gets a
   * thicker amber ring.
   */
  private drawStarmap(data: StarmapRenderData): void {
    const g = this.starmapGfx;
    g.clear();

    // Edges
    for (const e of data.edges) {
      const color = e.unlocked ? 0x446688 : 0x223344;
      const alpha = e.unlocked ? 0.75 : 0.35;
      g.moveTo(e.fromX, e.fromY).lineTo(e.toX, e.toY).stroke({ color, width: 2, alpha });
    }

    // Nodes — one circle per node, with halo / rings layered as needed.
    for (const n of data.nodes) {
      const baseColor = n.completed
        ? 0x44cc66
        : n.unlocked
          ? 0x33ccff
          : 0x556677;
      const alpha = n.unlocked ? 1 : 0.45;

      if (n.current) {
        g.circle(n.x, n.y, 22).fill({ color: 0x336699, alpha: 0.35 });
      }
      if (n.selected) {
        g.circle(n.x, n.y, 18).stroke({ color: COLOR.hudAmber, width: 3, alpha: 1 });
      }
      g.circle(n.x, n.y, 10).fill({ color: baseColor, alpha });
      g.circle(n.x, n.y, 10).stroke({ color: 0xffffff, width: 1, alpha: alpha * 0.7 });
    }

    // Node labels — reuse a pool of Text objects sized to the node list.
    while (this.starmapNodeLabels.length < data.nodes.length) {
      const t = new Text({
        text: "",
        style: new TextStyle({
          fontFamily: "monospace",
          fontSize: 14,
          fill: COLOR.hudWhite,
          fontWeight: "bold",
        }),
      });
      t.anchor.set(0.5, 0);
      this.menuLayer.addChild(t);
      this.starmapNodeLabels.push(t);
    }
    for (let i = 0; i < this.starmapNodeLabels.length; i++) {
      const t = this.starmapNodeLabels[i]!;
      const n = data.nodes[i];
      if (!n) {
        t.visible = false;
        continue;
      }
      t.visible = true;
      t.text = n.unlocked ? n.name : "???";
      t.style.fill = n.selected ? COLOR.hudAmber : n.completed ? 0x99ffaa : COLOR.hudWhite;
      t.alpha = n.unlocked ? 1 : 0.5;
      t.x = n.x;
      t.y = n.y + 18;
    }

    this.starmapTitle.text = data.sectorName.toUpperCase();
    this.starmapCreditsText.text = `CREDITS ${data.credits}`;

    const selected = data.nodes.find((n) => n.selected);
    if (selected) {
      this.starmapSelectedName.text = selected.unlocked
        ? `${selected.name.toUpperCase()}  —  ${selected.kind.replace(/-/g, " ").toUpperCase()}`
        : "UNDISCOVERED";
      this.starmapMissionLabel.text = data.selectedMissionLabel ?? "";
    } else {
      this.starmapSelectedName.text = "";
      this.starmapMissionLabel.text = "";
    }
  }

  /**
   * Draws the visual shipyard builder: parts palette on the left, ship canvas
   * in the centre (with placements, open sockets, and an optional drag-ghost),
   * a stats sheet on the right, and action buttons along the bottom.
   */

  private drawSolarSystem(data: SolarSystemRenderData): void {
    const g = this.solarSystemGfx;
    g.clear();

    // Draw nebula background
    this.drawNebulaBackground(g);

    // Draw celestial bodies with glow effect
    for (const body of data.celestialBodies) {
      const color = (body.color.r << 16) | (body.color.g << 8) | body.color.b;
      const screenRadius = Math.max(8, body.radius / (200 / data.zoomLevel));
      const centerX = this.width / 2 + body.position.x / 100 * data.zoomLevel;
      const centerY = this.height / 2 + body.position.y / 100 * data.zoomLevel;

      // Draw outer glow
      g.circle(centerX, centerY, screenRadius + 2)
        .stroke({ color, width: 2, alpha: 0.3 });
      // Draw main body
      g.circle(centerX, centerY, screenRadius)
        .fill({ color, alpha: 0.95 });
      // Draw highlight
      g.circle(centerX - screenRadius * 0.3, centerY - screenRadius * 0.3, screenRadius * 0.4)
        .fill({ color: 0xffffff, alpha: 0.4 });
    }

    // Draw locations (docking stations)
    for (const loc of data.locations) {
      const x = this.width / 2 + loc.position.x / 100 * data.zoomLevel;
      const y = this.height / 2 + loc.position.y / 100 * data.zoomLevel;
      const nearby = data.nearbyLocations.includes(loc.id);
      const color = nearby ? 0x00ff00 : 0xcccccc;

      // Draw location marker as a diamond with pulsing outer ring
      g.rect(x - 10, y - 10, 20, 20).stroke({ color, width: 2, alpha: 0.8 });
      if (nearby) {
        g.rect(x - 14, y - 14, 28, 28).stroke({ color, width: 1, alpha: 0.5 });
      }
    }

    // Draw player ship at center (delta-wing fighter)
    this.drawDeltaWing(g, this.width / 2, this.height / 2, data.playerHeading);

    // Draw map overlay if open
    if (data.mapOpen) {
      this.drawGalaxyMap(g);
    }
  }

  private drawNebulaBackground(g: Graphics): void {
    // Draw gradient nebula background
    g.rect(0, 0, this.width, this.height).fill({ color: 0x0a0020, alpha: 1 }); // Dark blue-purple base

    // Draw nebula clouds with varying colors
    const nebulaClouds = [
      { x: this.width * 0.2, y: this.height * 0.3, color: 0x6600cc, size: 400 }, // Purple
      { x: this.width * 0.7, y: this.height * 0.2, color: 0xff0066, size: 350 }, // Pink/Magenta
      { x: this.width * 0.4, y: this.height * 0.7, color: 0x0066ff, size: 380 }, // Blue
      { x: this.width * 0.8, y: this.height * 0.6, color: 0xff6600, size: 320 }, // Orange
    ];

    for (const cloud of nebulaClouds) {
      g.circle(cloud.x, cloud.y, cloud.size).fill({ color: cloud.color, alpha: 0.08 });
    }

    // Add some distant stars scattered across background
    const starCount = 50;
    for (let i = 0; i < starCount; i++) {
      const x = (i * 73) % this.width; // Pseudo-random but deterministic
      const y = ((i * 127) % this.height);
      const size = 0.5 + ((i % 3) * 0.5);
      g.circle(x, y, size).fill({ color: 0xffffff, alpha: 0.6 });
    }
  }

  private drawDeltaWing(g: Graphics, centerX: number, centerY: number, headingDegrees: number): void {
    // Convert heading to radians for drawing
    const headingRad = (headingDegrees * Math.PI) / 180;

    // Ship dimensions
    const len = 16; // nose-to-tail
    const width = 10; // wing-to-wing

    // Calculate ship orientation vectors
    const forwardX = Math.sin(headingRad);
    const forwardY = -Math.cos(headingRad);
    const rightX = Math.cos(headingRad);
    const rightY = Math.sin(headingRad);

    // Calculate ship points (delta-wing fighter shape)
    const nose = {
      x: centerX + forwardX * len,
      y: centerY + forwardY * len,
    };

    const wingLeft = {
      x: centerX - rightX * width - forwardX * (len * 0.5),
      y: centerY - rightY * width - forwardY * (len * 0.5),
    };

    const wingRight = {
      x: centerX + rightX * width - forwardX * (len * 0.5),
      y: centerY + rightY * width - forwardY * (len * 0.5),
    };

    const tail = {
      x: centerX - forwardX * (len * 0.3),
      y: centerY - forwardY * (len * 0.3),
    };

    // Draw main hull (cyan)
    g.moveTo(nose.x, nose.y);
    g.lineTo(wingLeft.x, wingLeft.y);
    g.lineTo(tail.x, tail.y);
    g.lineTo(wingRight.x, wingRight.y);
    g.lineTo(nose.x, nose.y);
    g.fill({ color: 0x00ffff, alpha: 0.9 });
    g.stroke({ color: 0x00ff99, width: 2, alpha: 1 });

    // Draw cockpit (brighter accent)
    const cockpitX = centerX + forwardX * (len * 0.4);
    const cockpitY = centerY + forwardY * (len * 0.4);
    g.circle(cockpitX, cockpitY, 3).fill({ color: 0xffff00, alpha: 1 });

    // Draw engine glow at tail
    const engineX = centerX - forwardX * (len * 0.25);
    const engineY = centerY - forwardY * (len * 0.25);
    g.circle(engineX, engineY, 2).fill({ color: 0xff6600, alpha: 0.8 });
  }

  private drawGalaxyMap(g: Graphics): void {
    // Semi-transparent overlay
    g.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: 0.7 });

    // Draw grid lines
    const gridSize = 100;
    const gridColor = 0x333333;
    for (let x = 0; x < this.width; x += gridSize) {
      g.moveTo(x, 0).lineTo(x, this.height).stroke({ color: gridColor, width: 1, alpha: 0.3 });
    }
    for (let y = 0; y < this.height; y += gridSize) {
      g.moveTo(0, y).lineTo(this.width, y).stroke({ color: gridColor, width: 1, alpha: 0.3 });
    }

    // Draw current system marker (in center)
    g.circle(this.width / 2, this.height / 2, 10).fill({ color: 0x00ffff, alpha: 1 });
    g.circle(this.width / 2, this.height / 2, 10).stroke({ color: 0x00ffff, width: 2, alpha: 1 });
  }

  private drawPauseOverlay(): void {
    const g = this.solarSystemGfx;

    // Semi-transparent dark overlay
    g.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: 0.5 });

    // Pause panel
    const panelWidth = 300;
    const panelHeight = 150;
    const panelX = this.width / 2 - panelWidth / 2;
    const panelY = this.height / 2 - panelHeight / 2;

    g.rect(panelX, panelY, panelWidth, panelHeight).fill({ color: 0x001a4d, alpha: 0.95 });
    g.rect(panelX, panelY, panelWidth, panelHeight).stroke({ color: 0x00ffff, width: 2, alpha: 1 });

    // Text
    this.pauseTitle.text = "PAUSED";
    this.pauseTitle.x = panelX + panelWidth / 2 - this.pauseTitle.width / 2;
    this.pauseTitle.y = panelY + 30;

    this.promptText.text = "Press [P] or [ESC] to Resume";
    this.promptText.x = panelX + panelWidth / 2 - this.promptText.width / 2;
    this.promptText.y = panelY + 100;
  }

  private drawDockedMenu(_state: GameState): void {
    const g = this.solarSystemGfx;

    // Draw semi-transparent overlay
    g.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: 0.6 });

    // Draw menu panel background
    const panelWidth = 400;
    const panelHeight = 250;
    const panelX = this.width / 2 - panelWidth / 2;
    const panelY = this.height / 2 - panelHeight / 2;

    g.rect(panelX, panelY, panelWidth, panelHeight).fill({ color: 0x001a4d, alpha: 0.9 });
    g.rect(panelX, panelY, panelWidth, panelHeight).stroke({ color: 0x00ffff, width: 2, alpha: 1 });

    // Draw title using existing text field
    this.titleText.text = "DOCKED AT STATION";
    this.titleText.x = panelX + panelWidth / 2 - this.titleText.width / 2;
    this.titleText.y = panelY + 30;

    // Draw menu options
    this.subtitleText.text = "Station Options\n\n[ESC] Undock\n[M] View Map";
    this.subtitleText.style.fontSize = 18;
    this.subtitleText.x = panelX + 30;
    this.subtitleText.y = panelY + 80;

    // Draw prompt
    this.promptText.text = "Ready to explore the system?";
    this.promptText.x = panelX + panelWidth / 2 - this.promptText.width / 2;
    this.promptText.y = panelY + panelHeight - 40;
  }

  private drawShipyard(data: ShipyardRenderData): void {
    const g = this.shipyardGfx;
    g.clear();

    // ── Panel backgrounds ─────────────────────────────────────────────────
    const { layout } = data;
    this.drawPanelRect(g, layout.paletteRect, 0x0e1a2e, 0x2a466b);
    this.drawPanelRect(g, layout.canvasRect, 0x0a1020, 0x2a466b);
    this.drawPanelRect(g, layout.statsRect, 0x0e1a2e, 0x2a466b);
    this.drawPanelRect(g, layout.savedPanelRect, 0x0e1a2e, 0x2a466b);

    // ── Saved-ships header + slots ────────────────────────────────────────
    this.shipyardSavedHeader.x = layout.savedPanelRect.x + layout.savedPanelRect.w / 2;
    this.shipyardSavedHeader.y = layout.savedPanelRect.y + 6;
    const savedCount = data.savedSlots.filter((s) => !s.empty).length;
    this.shipyardSavedHeader.text = `SAVED SHIPS  ${savedCount}/${data.savedSlots.length}`;

    this.ensureTextPool(this.shipyardSavedLabels, data.savedSlots.length, 13);
    for (let i = 0; i < this.shipyardSavedLabels.length; i++) {
      const label = this.shipyardSavedLabels[i]!;
      const slot = data.savedSlots[i];
      if (!slot) {
        label.visible = false;
        continue;
      }
      label.visible = true;
      const r = slot.rect;
      const borderColor = slot.current
        ? COLOR.hudAmber
        : slot.equipped
          ? COLOR.hudCyan
          : 0x3a5a80;
      const fillColor = slot.current ? 0x1a2a14 : slot.equipped ? 0x0a1a2a : 0x050a14;
      g.rect(r.x, r.y, r.w, r.h)
        .fill({ color: fillColor, alpha: 0.9 })
        .stroke({ color: borderColor, width: slot.current ? 2 : 1 });
      const suffix = slot.equipped ? "  [EQUIPPED]" : "";
      label.text = slot.empty
        ? "— EMPTY —"
        : `${slot.name.toUpperCase()}${suffix}`;
      label.style.fill = slot.empty
        ? 0x4a5a70
        : slot.current
          ? COLOR.hudAmber
          : slot.equipped
            ? COLOR.hudCyan
            : COLOR.hudWhite;
      label.anchor.set(0, 0.5);
      label.x = r.x + 8;
      label.y = r.y + r.h / 2;
    }

    // ── Status message (SAVED / LIBRARY FULL / etc.) ─────────────────────
    if (data.statusMsg) {
      this.shipyardStatusText.text = data.statusMsg;
      this.shipyardStatusText.visible = true;
    } else {
      this.shipyardStatusText.visible = false;
    }

    // ── Palette tiles ─────────────────────────────────────────────────────
    this.ensureTextPool(this.shipyardPaletteLabels, data.palette.length, 12);
    for (let i = 0; i < this.shipyardPaletteLabels.length; i++) {
      const label = this.shipyardPaletteLabels[i]!;
      const tile = data.palette[i];
      if (!tile) {
        label.visible = false;
        continue;
      }
      label.visible = true;

      const { rect } = tile;
      const border = tile.isHeld
        ? COLOR.hudAmber
        : tile.disabled
          ? 0x444a5a
          : 0x5a7aa0;
      const fill = tile.isHeld ? 0x2a2a10 : 0x050a14;
      g.rect(rect.x, rect.y, rect.w, rect.h)
        .fill({ color: fill, alpha: tile.disabled ? 0.5 : 1 })
        .stroke({ color: border, width: tile.isHeld ? 2 : 1 });

      // Part silhouette preview — centred in the upper two-thirds of the tile.
      const previewMax = Math.min(rect.w - 14, rect.h - 28);
      const maxShape = Math.max(tile.shape.width, tile.shape.height);
      const scale = previewMax / maxShape;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2 - 8;
      this.drawPartVisual(
        g,
        tile.visualKind,
        cx,
        cy,
        tile.shape.width * scale,
        tile.shape.height * scale,
        tile.colour,
        tile.disabled ? 0.4 : 1,
      );

      const powerText = tile.powerCapacity > 0
        ? `CAP ${tile.powerCapacity}`
        : `PWR ${tile.powerCost}`;
      label.text = `${tile.name.toUpperCase()}\n${powerText}`;
      label.style.fill = tile.disabled ? 0x778899 : COLOR.hudWhite;
      label.x = rect.x + rect.w / 2;
      label.y = rect.y + rect.h - 22;
    }

    // ── Ship canvas: placements ───────────────────────────────────────────
    const { ship } = data;
    for (const pl of ship.placements) {
      const cx = ship.originX + pl.worldX * ship.scale;
      const cy = ship.originY + pl.worldY * ship.scale;
      const w = pl.shape.width * ship.scale;
      const h = pl.shape.height * ship.scale;
      this.drawPartVisual(g, pl.visualKind, cx, cy, w, h, pl.colour, 1);
      if (pl.selected) {
        g.rect(cx - w / 2 - 3, cy - h / 2 - 3, w + 6, h + 6)
          .stroke({ color: COLOR.hudAmber, width: 2, alpha: 0.9 });
      }
    }

    // ── Open sockets ──────────────────────────────────────────────────────
    for (const sk of ship.sockets) {
      const color = sk.highlighted ? COLOR.hudAmber : COLOR.hudCyan;
      const r = sk.highlighted ? 7 : 5;
      g.circle(sk.screenX, sk.screenY, r)
        .fill({ color, alpha: 0.2 })
        .stroke({ color, width: 2, alpha: 0.9 });
    }

    // ── Ghost preview ─────────────────────────────────────────────────────
    if (data.ghost) {
      const gh = data.ghost;
      const w = gh.shape.width * ship.scale;
      const h = gh.shape.height * ship.scale;
      const tint = gh.valid ? gh.colour : COLOR.hudRed;
      this.drawPartVisual(g, gh.visualKind, gh.screenX, gh.screenY, w, h, tint, 0.5);
      g.rect(gh.screenX - w / 2, gh.screenY - h / 2, w, h)
        .stroke({ color: tint, width: 2, alpha: 0.8 });
    }

    // ── Buttons ───────────────────────────────────────────────────────────
    const trashLabel = data.trashAction === "part"
      ? "TRASH PART"
      : data.trashAction === "blueprint"
        ? "DELETE SHIP"
        : "TRASH";
    const buttons = [
      { rect: layout.newBtn, label: "NEW" },
      { rect: layout.saveBtn, label: "SAVE" },
      { rect: layout.backBtn, label: "BACK" },
      {
        rect: layout.trashBtn,
        label: trashLabel,
        disabled: data.trashAction === "none",
      },
    ];
    this.ensureTextPool(this.shipyardButtonLabels, buttons.length, 18);
    for (let i = 0; i < this.shipyardButtonLabels.length; i++) {
      const label = this.shipyardButtonLabels[i]!;
      const btn = buttons[i];
      if (!btn) {
        label.visible = false;
        continue;
      }
      label.visible = true;
      const disabled = btn.disabled === true;
      g.rect(btn.rect.x, btn.rect.y, btn.rect.w, btn.rect.h)
        .fill({ color: 0x10243c, alpha: disabled ? 0.4 : 1 })
        .stroke({ color: disabled ? 0x445566 : COLOR.hudCyan, width: 2 });
      label.text = btn.label;
      label.style.fill = disabled ? 0x778899 : COLOR.hudWhite;
      label.x = btn.rect.x + btn.rect.w / 2;
      label.y = btn.rect.y + btn.rect.h / 2;
    }

    // ── Stats panel ───────────────────────────────────────────────────────
    const s = data.stats;
    this.shipyardStatsText.text = [
      `HP          ${s.hp}`,
      `SPEED       ${s.speed}`,
      `DAMAGE      ${s.damage}`,
      `FIRE RATE   ${s.fireRate.toFixed(2)}`,
      `HITBOX      ${s.hitboxW}×${s.hitboxH}`,
      ``,
      `POWER       ${s.powerUsed}/${s.powerCapacity}`,
      `COST        ${s.cost}¢`,
    ].join("\n");

    const heldSuffix = data.heldPartName
      ? `   •   HOLDING ${data.heldPartName.toUpperCase()}`
      : "";
    this.shipyardSummaryText.text =
      `${data.blueprintName.toUpperCase()}   •   CREDITS ${data.credits}${heldSuffix}`;
  }

  /** Fills a rect with flat dark fill + thin stroke for UI panels. */
  private drawPanelRect(
    g: Graphics,
    rect: { x: number; y: number; w: number; h: number },
    fill: number,
    stroke: number,
  ): void {
    g.rect(rect.x, rect.y, rect.w, rect.h)
      .fill({ color: fill, alpha: 0.85 })
      .stroke({ color: stroke, width: 1 });
  }

  /** Ensures a Text pool has at least `count` entries and applies base style. */
  private ensureTextPool(pool: Text[], count: number, fontSize: number): void {
    while (pool.length < count) {
      const t = new Text({
        text: "",
        style: new TextStyle({
          fontFamily: "monospace",
          fontSize,
          fill: COLOR.hudWhite,
          fontWeight: "bold",
          align: "center",
        }),
      });
      t.anchor.set(0.5, 0.5);
      this.menuLayer.addChild(t);
      pool.push(t);
    }
  }

  /**
   * Draws a stylised silhouette for a part kind inside the AABB (cx, cy, w, h).
   * Every `visualKind` from the parts registry is handled; unknown kinds fall
   * back to a plain rect so new parts can be added without renderer changes.
   */
  private drawPartVisual(
    g: Graphics,
    kind: string,
    cx: number,
    cy: number,
    w: number,
    h: number,
    colour: number,
    alpha: number,
  ): void {
    const fill = { color: colour, alpha };
    const accent = { color: 0xffffff, alpha: alpha * 0.35 };
    switch (kind) {
      case "core-hex":
        drawHexagon(g, cx, cy, Math.min(w, h) / 2, 0, fill, { color: 0xffffff, width: 1, alpha });
        drawCircle(g, cx, cy, Math.min(w, h) / 5, { color: 0xffffff, alpha });
        break;
      case "hull-delta": {
        const hw = w / 2;
        const hh = h / 2;
        g.poly([cx + hw, cy, cx - hw, cy - hh, cx - hw * 0.6, cy, cx - hw, cy + hh])
          .fill(fill);
        drawRect(g, cx - hw * 0.2, cy, hw * 0.8, hh * 0.4, accent);
        break;
      }
      case "hull-block": {
        drawRect(g, cx, cy, w, h, fill);
        drawRect(g, cx, cy, w * 0.5, h * 0.4, accent);
        break;
      }
      case "wing-fin-top": {
        const hw = w / 2;
        const hh = h / 2;
        g.poly([cx - hw, cy + hh, cx + hw, cy + hh, cx + hw * 0.6, cy - hh, cx - hw * 0.4, cy - hh * 0.4])
          .fill(fill);
        break;
      }
      case "wing-fin-bot": {
        const hw = w / 2;
        const hh = h / 2;
        g.poly([cx - hw, cy - hh, cx + hw, cy - hh, cx + hw * 0.6, cy + hh, cx - hw * 0.4, cy + hh * 0.4])
          .fill(fill);
        break;
      }
      case "wing-long": {
        drawRect(g, cx, cy, w, h, fill);
        drawRect(g, cx, cy, w * 0.4, h * 0.85, accent);
        break;
      }
      case "engine-nozzle": {
        drawRect(g, cx, cy, w * 0.8, h, fill);
        drawTriangle(g, cx - w * 0.5, cy, h * 0.6, Math.PI, { color: 0xff9e3d, alpha });
        break;
      }
      case "engine-plasma": {
        drawRect(g, cx + w * 0.1, cy, w * 0.7, h, fill);
        drawTriangle(g, cx - w * 0.4, cy, h * 0.7, Math.PI, { color: 0xff3df0, alpha });
        drawCircle(g, cx + w * 0.25, cy, h * 0.25, accent);
        break;
      }
      case "cannon-barrel": {
        drawRect(g, cx, cy, w, h * 0.6, fill);
        drawRect(g, cx + w * 0.3, cy, w * 0.35, h, { color: 0xffffff, alpha: alpha * 0.6 });
        break;
      }
      case "shield-ring": {
        const r = Math.min(w, h) / 2;
        drawCircle(g, cx, cy, r, { color: colour, alpha: alpha * 0.3 }, { color: colour, width: 2, alpha });
        drawCircle(g, cx, cy, r * 0.5, fill);
        break;
      }
      default:
        drawRect(g, cx, cy, w, h, fill);
    }
  }

  /** Populates the 4-item main-menu list and highlights the selected one. */
  private updateMainMenu(selectedIdx: number): void {
    const items = ["PLAY", "CAMPAIGN", "SOLAR SYSTEM", "SHIPYARD", "STATS"];
    this.renderMenuList(items, selectedIdx, this.height / 2 + 40, 40);
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

import { Container, Graphics } from "pixi.js";
import type { NPCDefinition } from "../managers/LocationManager";

export interface RobotData {
  seed: number;
  H: number;
  W: number;
  headCY: number;
  detail: string;
  headGroup: Container;
  faceGfx: Graphics;
  armsGfx: Graphics;
}

/** Typed storage for robot animation data; avoids `as any` on Container. */
export const robotDataStore = new WeakMap<Container, RobotData>();

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return Math.abs(h);
}

function getFactionColor(factionId: string): number {
  const colors: Record<string, number> = {
    "terran-federation": 0x4499ff,
    "xeno-collective":   0x44ee88,
    "void-merchants":    0xcc77ff,
    "scavenger-clans":   0xff9933,
    "nova-rebels":       0xff4455,
    neutral:             0x88aacc,
  };
  return colors[factionId] ?? 0x88aacc;
}

interface RoleStyle {
  widthMul: number;
  heightMul: number;
  headMul: number;
  shoulderMul: number;
  detail: "industrial" | "sleek" | "technical";
}

function getRoleStyle(role: string): RoleStyle {
  const table: Record<string, RoleStyle> = {
    commander:  { widthMul: 1.2,  heightMul: 1.0,  headMul: 0.90, shoulderMul: 1.30, detail: "industrial" },
    captain:    { widthMul: 1.15, heightMul: 1.05, headMul: 0.95, shoulderMul: 1.25, detail: "industrial" },
    trader:     { widthMul: 0.85, heightMul: 1.10, headMul: 1.05, shoulderMul: 0.95, detail: "sleek"      },
    broker:     { widthMul: 0.80, heightMul: 1.15, headMul: 1.10, shoulderMul: 0.90, detail: "sleek"      },
    emissary:   { widthMul: 0.90, heightMul: 1.20, headMul: 1.15, shoulderMul: 0.95, detail: "technical"  },
    archivist:  { widthMul: 0.75, heightMul: 1.25, headMul: 1.25, shoulderMul: 0.85, detail: "technical"  },
    chief:      { widthMul: 1.25, heightMul: 0.95, headMul: 0.85, shoulderMul: 1.40, detail: "industrial" },
    foreman:    { widthMul: 1.10, heightMul: 0.98, headMul: 0.90, shoulderMul: 1.20, detail: "industrial" },
    scrapper:   { widthMul: 1.15, heightMul: 1.02, headMul: 0.88, shoulderMul: 1.25, detail: "industrial" },
    geologist:  { widthMul: 0.95, heightMul: 1.08, headMul: 1.00, shoulderMul: 1.00, detail: "technical"  },
    strategist: { widthMul: 0.85, heightMul: 1.10, headMul: 1.08, shoulderMul: 0.95, detail: "technical"  },
    insurgent:  { widthMul: 1.05, heightMul: 1.05, headMul: 0.95, shoulderMul: 1.10, detail: "industrial" },
  };
  return table[role] ?? { widthMul: 1, heightMul: 1, headMul: 1, shoulderMul: 1, detail: "technical" };
}

export function createNPCRobot(npc: NPCDefinition, height: number = 280): Container {
  const container = new Container();
  const seed      = hashSeed(npc.id);
  const style     = getRoleStyle(npc.role);
  const accent    = getFactionColor(npc.factionId);

  const H      = height;
  const W      = H * 0.55 * style.widthMul;
  const torsoW = W * 0.55; // defined early so arm block can reference it

  const primary   = 0x2a2a3a;
  const secondary = 0x4a4a5a;
  const light     = 0xccddee;

  const g = (zIndex = 0): Graphics => {
    const gfx = new Graphics();
    gfx.zIndex = zIndex;
    container.addChild(gfx);
    return gfx;
  };

  // Storage for robotData refs (populated inside each block)
  let armsGfx!: Graphics;
  let headGroup!: Container;
  let faceGfx!: Graphics;

  // ── Legs ──────────────────────────────────────────────────────────────────
  {
    const lg    = g(0);
    const legW  = W * 0.20;
    const legH  = H * 0.30;
    const footW = legW * 1.3;
    const footH = H * 0.05;
    const legGap = W * 0.16;
    const legTop = H * 0.10;

    lg.rect(-legGap / 2 - legW, legTop, legW, legH).fill({ color: primary });
    lg.rect(-legGap / 2 - legW, legTop, legW, legH).stroke({ color: secondary, width: 1 });
    lg.rect(legGap / 2,         legTop, legW, legH).fill({ color: primary });
    lg.rect(legGap / 2,         legTop, legW, legH).stroke({ color: secondary, width: 1 });
    lg.rect(-legGap / 2 - footW + legW * 0.35, legTop + legH, footW, footH).fill({ color: secondary });
    lg.rect( legGap / 2           - legW * 0.35, legTop + legH, footW, footH).fill({ color: secondary });
  }

  // ── Arms ──────────────────────────────────────────────────────────────────
  {
    const ar    = g(1);
    const armW  = W * 0.14;
    const armH  = H * 0.30;
    const shldr = torsoW / 2; // flush with torso edge
    const armTop = -H * 0.12;

    ar.rect(-shldr - armW, armTop, armW, armH).fill({ color: primary });
    ar.rect(-shldr - armW, armTop, armW, armH).stroke({ color: secondary, width: 1 });
    ar.rect(shldr,          armTop, armW, armH).fill({ color: primary });
    ar.rect(shldr,          armTop, armW, armH).stroke({ color: secondary, width: 1 });
    const handR = W * 0.07;
    ar.circle(-shldr - armW / 2, armTop + armH + handR, handR).fill({ color: light });
    ar.circle( shldr + armW / 2, armTop + armH + handR, handR).fill({ color: light });

    armsGfx = ar;
  }

  // ── Torso ─────────────────────────────────────────────────────────────────
  {
    const tr    = g(2);
    const torsoH = H * 0.38;
    const torsoTop = -H * 0.18;

    tr.rect(-torsoW / 2, torsoTop, torsoW, torsoH).fill({ color: primary });
    tr.rect(-torsoW / 2, torsoTop, torsoW, torsoH).stroke({ color: accent, width: 2 });

    const panelW = torsoW * 0.48;
    const panelH = torsoH * 0.60;
    tr.rect(-panelW / 2, torsoTop + torsoH * 0.15, panelW, panelH).fill({ color: secondary });
    tr.rect(-panelW / 2, torsoTop + torsoH * 0.15, panelW, panelH).stroke({ color: accent, width: 1 });

    const lightR = W * 0.035;
    for (let i = 0; i < 3; i++) {
      const lx = panelW * 0.20;
      const ly = torsoTop + torsoH * 0.25 + i * H * 0.07;
      tr.circle(lx, ly, lightR).fill({ color: accent, alpha: 0.85 });
    }

    const padH = H * 0.06;
    tr.rect(-torsoW / 2 - W * 0.04, torsoTop, torsoW * 0.22, padH).fill({ color: secondary });
    tr.rect( torsoW / 2 - torsoW * 0.22 + W * 0.04, torsoTop, torsoW * 0.22, padH).fill({ color: secondary });
  }

  // ── Head + Face (combined Container so face eyes rotate with head) ─────────
  {
    headGroup = new Container();
    headGroup.zIndex = 3;
    container.addChild(headGroup);

    const hd  = new Graphics();
    const hR  = H * 0.13 * style.headMul;
    const hcx = 0;
    const hcy = -H * 0.35;

    // Neck
    const neckW = W * 0.12;
    hd.rect(-neckW / 2, hcy + hR, neckW, H * 0.05).fill({ color: secondary });

    // Head sphere
    hd.circle(hcx, hcy, hR).fill({ color: primary });
    hd.circle(hcx, hcy, hR).stroke({ color: accent, width: 2 });

    // Visor / optics
    if (style.detail === "technical") {
      const eyeR = hR * 0.18;
      const gap  = hR * 0.30;
      hd.circle(hcx - gap, hcy - hR * 0.05, eyeR).fill({ color: accent });
      hd.circle(hcx,       hcy - hR * 0.05, eyeR).fill({ color: accent });
      hd.circle(hcx + gap, hcy - hR * 0.05, eyeR).fill({ color: accent });
    } else if (style.detail === "sleek") {
      hd.roundRect(hcx - hR * 0.5, hcy - hR * 0.18, hR, hR * 0.30, 4).fill({ color: accent });
    } else {
      const eyeSize = hR * 0.22;
      const eyeGap  = hR * 0.22;
      hd.rect(hcx - eyeGap - eyeSize, hcy - eyeSize / 2, eyeSize, eyeSize).fill({ color: accent });
      hd.rect(hcx + eyeGap,           hcy - eyeSize / 2, eyeSize, eyeSize).fill({ color: accent });
    }

    // Mouth slit
    hd.moveTo(hcx - hR * 0.5, hcy + hR * 0.35)
      .lineTo(hcx + hR * 0.5, hcy + hR * 0.35)
      .stroke({ color: light, width: 1, alpha: 0.6 });

    // Antenna
    const antX = hcx + (seed % 2 === 0 ? hR * 0.40 : -hR * 0.40);
    const antH = hR * 0.50;
    hd.moveTo(antX, hcy - hR).lineTo(antX, hcy - hR - antH).stroke({ color: accent, width: 2 });
    hd.circle(antX, hcy - hR - antH, hR * 0.08).fill({ color: accent });

    headGroup.addChild(hd);

    // Face layer — blinking eyes, child of headGroup so they rotate with head
    const fc = new Graphics();
    if (style.detail !== "technical") {
      const eyeR  = hR * 0.10;
      const eyeGap = hR * 0.28;
      fc.circle(hcx - eyeGap, hcy - hR * 0.05, eyeR).fill({ color: light });
      fc.circle(hcx + eyeGap, hcy - hR * 0.05, eyeR).fill({ color: light });
      fc.circle(hcx - eyeGap, hcy - hR * 0.05, eyeR * 0.45).fill({ color: 0x000000 });
      fc.circle(hcx + eyeGap, hcy - hR * 0.05, eyeR * 0.45).fill({ color: 0x000000 });
    }
    headGroup.addChild(fc);

    faceGfx = fc;
  }

  robotDataStore.set(container, {
    seed,
    H,
    W,
    headCY: -H * 0.35,
    detail: style.detail,
    headGroup,
    faceGfx,
    armsGfx,
  });

  return container;
}

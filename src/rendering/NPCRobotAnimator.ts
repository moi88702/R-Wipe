import { Container } from "pixi.js";
import { robotDataStore } from "./NPCRobotRenderer";

export class NPCRobotAnimator {
  private blinkStates = new WeakMap<Container, { nextBlinkMs: number; blinkStartMs: number }>();

  update(robot: Container, _deltaMs: number, nowMs: number): void {
    const data = robotDataStore.get(robot);
    if (!data) return;

    const { seed, H, headGroup, faceGfx, armsGfx } = data;

    // ── 1. Arm raise: one arm lifts and lowers on a slow cycle ───────────
    if (armsGfx) {
      const armPeriod = 8000 + (seed % 3) * 1500;
      const armPhase  = ((nowMs + seed * 400) % armPeriod) / armPeriod;
      let armY = 0;
      if (armPhase < 0.12) {
        armY = -H * 0.10 * (armPhase / 0.12);
      } else if (armPhase < 0.35) {
        armY = -H * 0.10;
      } else if (armPhase < 0.50) {
        armY = -H * 0.10 * (1 - (armPhase - 0.35) / 0.15);
      }
      armsGfx.y = armY;
    }

    // ── 2. Head nod: occasional forward tilt ─────────────────────────────
    if (headGroup) {
      const headPeriod = 6000 + (seed % 4) * 800;
      const headPhase  = ((nowMs + seed * 200) % headPeriod) / headPeriod;
      let headRot = 0;
      if (headPhase < 0.08) {
        headRot = 10 * (headPhase / 0.08);
      } else if (headPhase < 0.30) {
        headRot = 10;
      } else if (headPhase < 0.42) {
        headRot = 10 * (1 - (headPhase - 0.30) / 0.12);
      }
      headGroup.rotation = (headRot * Math.PI) / 180;
    }

    // ── 3. Eye blink ──────────────────────────────────────────────────────
    if (faceGfx) {
      let bs = this.blinkStates.get(robot);
      if (!bs) {
        const interval = 3000 + (seed % 1000) * 2;
        bs = { nextBlinkMs: nowMs + interval, blinkStartMs: 0 };
        this.blinkStates.set(robot, bs);
      }
      if (nowMs >= bs.nextBlinkMs) {
        bs.blinkStartMs = nowMs;
        const interval = 3000 + (seed % 1000) * 2;
        bs.nextBlinkMs = nowMs + interval;
      }
      const blinkAge = nowMs - bs.blinkStartMs;
      faceGfx.alpha = blinkAge < 120 ? 0.1 : 1.0;
    }
  }
}

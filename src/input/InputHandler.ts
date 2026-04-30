/**
 * InputHandler – polls keyboard + touch state each frame and returns an
 * InputState snapshot. Arrow keys control movement; Space fires; Escape/P
 * pauses. On touch devices, `attachTouch()` wires up drag-to-move with
 * auto-fire and a double-tap-for-bomb gesture.
 *
 * `simulateKeyDown` / `simulateKeyUp` helpers allow tests to inject synthetic
 * key states without requiring a real DOM environment.
 */

import type { InputState } from "../types/index";

/** Max ms between two taps for the second tap to register as a double-tap. */
const DOUBLE_TAP_MS = 320;

export class InputHandler {
  private readonly keysPressed = new Set<string>();
  private readonly boundKeyDown: (e: KeyboardEvent) => void;
  private readonly boundKeyUp: (e: KeyboardEvent) => void;

  // ── Touch state ────────────────────────────────────────────────────────
  private touchTarget: { x: number; y: number } | null = null;
  private touchActiveCount = 0;
  private lastTapMs = 0;
  /** One-frame pulses consumed on the next poll(). */
  private bombPulse = false;
  private menuConfirmPulse = false;
  private pausePulse = false;
  private touchDisposers: Array<() => void> = [];

  // ── Solar-system combat ability key pulses ──────────────────────────────
  // B uses the existing bombPulse path; V/C/X/Z get their own pulse fields.
  private abilityVPulse = false;
  private abilityCPulse = false;
  private abilityXPulse = false;
  private abilityZPulse = false;

  // ── Pointer state (mouse + primary touch, used by menu screens) ────────
  private pointerPos: { x: number; y: number } | null = null;
  private pointerDownPulse: { x: number; y: number } | null = null;
  private pointerHeld = false;
  private pointerDisposers: Array<() => void> = [];

  constructor() {
    this.boundKeyDown = (e: KeyboardEvent) => {
      // Prevent arrow-key / space page scroll during gameplay
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }
      this.keysPressed.add(e.code);

      // Solar-system ability key pulses (one-shot per keydown)
      if (e.code === "KeyV") this.abilityVPulse = true;
      if (e.code === "KeyC") this.abilityCPulse = true;
      if (e.code === "KeyX") this.abilityXPulse = true;
      if (e.code === "KeyZ") this.abilityZPulse = true;
    };

    this.boundKeyUp = (e: KeyboardEvent) => {
      this.keysPressed.delete(e.code);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.boundKeyDown);
      window.addEventListener("keyup", this.boundKeyUp);
    }
  }

  /**
   * Wires drag-to-move / hold-to-fire / double-tap-for-bomb on the given
   * element. Two-finger tap triggers pause. Call once the canvas is attached.
   */
  attachTouch(element: HTMLElement, gameWidth: number, gameHeight: number): void {
    const mapTouch = (t: Touch): { x: number; y: number } => {
      const rect = element.getBoundingClientRect();
      const w = rect.width || gameWidth;
      const h = rect.height || gameHeight;
      return {
        x: ((t.clientX - rect.left) / w) * gameWidth,
        y: ((t.clientY - rect.top) / h) * gameHeight,
      };
    };

    const onStart = (e: TouchEvent): void => {
      e.preventDefault();
      const prevCount = this.touchActiveCount;
      this.touchActiveCount = e.touches.length;
      const first = e.touches[0];
      if (first) {
        const p = mapTouch(first);
        this.touchTarget = p;
        this.pointerPos = p;
        this.pointerDownPulse = p;
        this.pointerHeld = true;
      }

      // Second finger landing → pause pulse.
      if (prevCount < 2 && this.touchActiveCount >= 2) {
        this.pausePulse = true;
        return;
      }

      // First finger landing → menu confirm (for menu screens) + double-tap
      // detection (for in-game bomb).
      if (prevCount === 0 && this.touchActiveCount >= 1) {
        this.menuConfirmPulse = true;
        const now = performance.now();
        if (now - this.lastTapMs < DOUBLE_TAP_MS) {
          this.bombPulse = true;
          this.lastTapMs = 0; // reset so triple-tap doesn't chain
        } else {
          this.lastTapMs = now;
        }
      }
    };

    const onMove = (e: TouchEvent): void => {
      e.preventDefault();
      const first = e.touches[0];
      if (first) {
        const p = mapTouch(first);
        this.touchTarget = p;
        this.pointerPos = p;
      }
    };

    const onEnd = (e: TouchEvent): void => {
      e.preventDefault();
      this.touchActiveCount = e.touches.length;
      if (this.touchActiveCount === 0) {
        this.touchTarget = null;
        this.pointerHeld = false;
      }
    };

    const opts: AddEventListenerOptions = { passive: false };
    element.addEventListener("touchstart", onStart, opts);
    element.addEventListener("touchmove", onMove, opts);
    element.addEventListener("touchend", onEnd, opts);
    element.addEventListener("touchcancel", onEnd, opts);

    this.touchDisposers.push(() => {
      element.removeEventListener("touchstart", onStart, opts);
      element.removeEventListener("touchmove", onMove, opts);
      element.removeEventListener("touchend", onEnd, opts);
      element.removeEventListener("touchcancel", onEnd, opts);
    });
  }

  /**
   * Wires mouse pointer events on the given element so menu screens (shipyard,
   * starmap) can respond to click/drag positions. Non-interfering with the
   * keyboard-driven arcade loop — in-game pointer data is simply ignored.
   */
  attachPointer(element: HTMLElement, gameWidth: number, gameHeight: number): void {
    const mapMouse = (e: MouseEvent): { x: number; y: number } => {
      const rect = element.getBoundingClientRect();
      const w = rect.width || gameWidth;
      const h = rect.height || gameHeight;
      return {
        x: ((e.clientX - rect.left) / w) * gameWidth,
        y: ((e.clientY - rect.top) / h) * gameHeight,
      };
    };

    const onDown = (e: MouseEvent): void => {
      if (e.button !== 0) return;
      const p = mapMouse(e);
      this.pointerPos = p;
      this.pointerDownPulse = p;
      this.pointerHeld = true;
    };
    const onMove = (e: MouseEvent): void => {
      this.pointerPos = mapMouse(e);
    };
    const onUp = (e: MouseEvent): void => {
      if (e.button !== 0) return;
      this.pointerHeld = false;
    };
    const onLeave = (): void => {
      this.pointerHeld = false;
    };

    element.addEventListener("mousedown", onDown);
    element.addEventListener("mousemove", onMove);
    element.addEventListener("mouseup", onUp);
    element.addEventListener("mouseleave", onLeave);

    this.pointerDisposers.push(() => {
      element.removeEventListener("mousedown", onDown);
      element.removeEventListener("mousemove", onMove);
      element.removeEventListener("mouseup", onUp);
      element.removeEventListener("mouseleave", onLeave);
    });
  }

  /**
   * Returns a snapshot of the current input state. May be called multiple
   * times per frame — pulse flags stay set across all polls in a frame and
   * are only cleared by an explicit {@link endFrame} call.
   */
  poll(): InputState {
    const touchFire = this.touchActiveCount > 0;
    return {
      moveUp: this.keysPressed.has("ArrowUp"),
      moveDown: this.keysPressed.has("ArrowDown"),
      moveLeft: this.keysPressed.has("ArrowLeft"),
      moveRight: this.keysPressed.has("ArrowRight"),
      fire: this.keysPressed.has("Space") || touchFire,
      bomb: this.keysPressed.has("KeyB") || this.bombPulse,
      pause:
        this.keysPressed.has("Escape") ||
        this.keysPressed.has("KeyP") ||
        this.pausePulse,
      menuConfirm:
        this.keysPressed.has("Enter") ||
        this.keysPressed.has("Space") ||
        this.menuConfirmPulse,
      menuBack: this.keysPressed.has("Escape"),
      touchTarget: this.touchTarget,
      pointer: this.pointerPos,
      pointerDownPulse: this.pointerDownPulse,
      pointerHeld: this.pointerHeld,
      // ── Solar-system free-flight keys ─────────────────────────────────────
      thrustForward: this.keysPressed.has("KeyW"),
      thrustReverse: this.keysPressed.has("KeyS"),
      turnLeft: this.keysPressed.has("KeyA"),
      turnRight: this.keysPressed.has("KeyD"),

      // ── Solar-system combat ability keys (pulse per keydown) ─────────────
      // B reuses the existing `bomb` field above.
      abilityV: this.abilityVPulse,
      abilityC: this.abilityCPulse,
      abilityX: this.abilityXPulse,
      abilityZ: this.abilityZPulse,
    };
  }

  /**
   * Must be called once at the end of each frame. Clears single-frame pulse
   * flags (bomb, menuConfirm, pause from touch) so they don't leak into the
   * next frame. Keeping pulses alive across multiple polls in a single frame
   * is essential — the GameManager calls `poll()` from several helpers per
   * frame and each must see the same edge.
   */
  endFrame(): void {
    this.bombPulse = false;
    this.menuConfirmPulse = false;
    this.pausePulse = false;
    this.pointerDownPulse = null;
    // Solar-system ability key pulses
    this.abilityVPulse = false;
    this.abilityCPulse = false;
    this.abilityXPulse = false;
    this.abilityZPulse = false;
  }

  // ── Test helpers ─────────────────────────────────────────────────────────

  /** Simulate pressing a key (identified by KeyboardEvent.code). */
  simulateKeyDown(code: string): void {
    this.keysPressed.add(code);
    // Mirror the keydown handler's pulse logic for test helpers
    if (code === "KeyV") this.abilityVPulse = true;
    if (code === "KeyC") this.abilityCPulse = true;
    if (code === "KeyX") this.abilityXPulse = true;
    if (code === "KeyZ") this.abilityZPulse = true;
  }

  /** Simulate releasing a key. */
  simulateKeyUp(code: string): void {
    this.keysPressed.delete(code);
  }

  /** Removes DOM event listeners.  Call when the handler is no longer needed. */
  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.boundKeyDown);
      window.removeEventListener("keyup", this.boundKeyUp);
    }
    for (const dispose of this.touchDisposers) dispose();
    this.touchDisposers = [];
    for (const dispose of this.pointerDisposers) dispose();
    this.pointerDisposers = [];
    this.keysPressed.clear();
  }
}

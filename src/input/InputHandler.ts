/**
 * InputHandler – polls keyboard state each frame and returns an InputState
 * snapshot.  Arrow keys control movement; Space fires; Escape/P pauses.
 *
 * Uses a Set of currently-pressed `KeyboardEvent.code` values so that
 * simultaneous key presses are captured correctly.
 *
 * The `simulateKeyDown` / `simulateKeyUp` helpers allow tests to inject
 * synthetic key states without requiring a real DOM environment.
 */

import type { InputState } from "../types/index";

export class InputHandler {
  private readonly keysPressed = new Set<string>();
  private readonly boundKeyDown: (e: KeyboardEvent) => void;
  private readonly boundKeyUp: (e: KeyboardEvent) => void;

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
   * Returns a snapshot of the current input state.
   * Call once per frame at the start of the update cycle.
   */
  poll(): InputState {
    return {
      moveUp: this.keysPressed.has("ArrowUp"),
      moveDown: this.keysPressed.has("ArrowDown"),
      moveLeft: this.keysPressed.has("ArrowLeft"),
      moveRight: this.keysPressed.has("ArrowRight"),
      fire: this.keysPressed.has("Space"),
      bomb: this.keysPressed.has("KeyB"),
      pause:
        this.keysPressed.has("Escape") || this.keysPressed.has("KeyP"),
      menuConfirm:
        this.keysPressed.has("Enter") || this.keysPressed.has("Space"),
      menuBack: this.keysPressed.has("Escape"),
    };
  }

  // ── Test helpers ─────────────────────────────────────────────────────────

  /** Simulate pressing a key (identified by KeyboardEvent.code). */
  simulateKeyDown(code: string): void {
    this.keysPressed.add(code);
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
    this.keysPressed.clear();
  }
}

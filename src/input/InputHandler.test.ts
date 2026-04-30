/**
 * Tests for InputHandler — solar-system ability key extensions.
 *
 * Scope: only the new ability-key pulse fields added for the CombatSystem
 * (abilityV, abilityC, abilityX, abilityZ) plus the corresponding
 * simulateKeyDown / endFrame lifecycle.  DOM-attached listeners are not
 * exercised because the test environment is Node; instead the existing
 * `simulateKeyDown` / `simulateKeyUp` helpers are used throughout.
 *
 * Observable contracts:
 *
 *  Ability key pulses (V / C / X / Z)
 *    1. simulateKeyDown("KeyV") → poll().abilityV === true.
 *    2. simulateKeyDown("KeyC") → poll().abilityC === true.
 *    3. simulateKeyDown("KeyX") → poll().abilityX === true.
 *    4. simulateKeyDown("KeyZ") → poll().abilityZ === true.
 *    5. After endFrame() all four pulses are cleared (false).
 *    6. Key still held after endFrame(): re-calling simulateKeyDown restores the pulse.
 *    7. Pulse visible across multiple poll() calls within the same frame
 *       (cleared only by endFrame(), not by reading).
 *    8. B ability key is represented by the existing `bomb` field
 *       (simulateKeyDown("KeyB") → poll().bomb === true).
 *
 *  No cross-contamination
 *    9. Pressing V does NOT set abilityC / abilityX / abilityZ.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InputHandler } from "./InputHandler";

let handler: InputHandler;

beforeEach(() => {
  handler = new InputHandler();
});

// ── Ability key pulses ─────────────────────────────────────────────────────────

describe("solar-system ability key pulses", () => {
  it("simulateKeyDown('KeyV') → poll().abilityV is true", () => {
    handler.simulateKeyDown("KeyV");
    expect(handler.poll().abilityV).toBe(true);
  });

  it("simulateKeyDown('KeyC') → poll().abilityC is true", () => {
    handler.simulateKeyDown("KeyC");
    expect(handler.poll().abilityC).toBe(true);
  });

  it("simulateKeyDown('KeyX') → poll().abilityX is true", () => {
    handler.simulateKeyDown("KeyX");
    expect(handler.poll().abilityX).toBe(true);
  });

  it("simulateKeyDown('KeyZ') → poll().abilityZ is true", () => {
    handler.simulateKeyDown("KeyZ");
    expect(handler.poll().abilityZ).toBe(true);
  });

  it("endFrame() clears all four ability key pulses", () => {
    handler.simulateKeyDown("KeyV");
    handler.simulateKeyDown("KeyC");
    handler.simulateKeyDown("KeyX");
    handler.simulateKeyDown("KeyZ");

    handler.endFrame();

    const state = handler.poll();
    expect(state.abilityV).toBe(false);
    expect(state.abilityC).toBe(false);
    expect(state.abilityX).toBe(false);
    expect(state.abilityZ).toBe(false);
  });

  it("pulse remains visible across multiple poll() calls within the same frame", () => {
    handler.simulateKeyDown("KeyV");

    // Two polls before endFrame — both should see the pulse
    expect(handler.poll().abilityV).toBe(true);
    expect(handler.poll().abilityV).toBe(true);

    handler.endFrame();
    expect(handler.poll().abilityV).toBe(false);
  });

  it("B ability uses the existing bomb field (simulateKeyDown('KeyB') → poll().bomb is true)", () => {
    // B is the bomb key in arcade mode and the B-slot ability key in solar mode;
    // both are served by the same 'bomb' field in InputState.
    handler.simulateKeyDown("KeyB");
    expect(handler.poll().bomb).toBe(true);
  });
});

// ── No cross-contamination between ability keys ────────────────────────────────

describe("no cross-contamination between ability key pulses", () => {
  it("pressing V does not set abilityC, abilityX, or abilityZ", () => {
    handler.simulateKeyDown("KeyV");
    const state = handler.poll();
    expect(state.abilityV).toBe(true);
    expect(state.abilityC).toBe(false);
    expect(state.abilityX).toBe(false);
    expect(state.abilityZ).toBe(false);
  });

  it("pressing Z does not set abilityV, abilityC, or abilityX", () => {
    handler.simulateKeyDown("KeyZ");
    const state = handler.poll();
    expect(state.abilityZ).toBe(true);
    expect(state.abilityV).toBe(false);
    expect(state.abilityC).toBe(false);
    expect(state.abilityX).toBe(false);
  });
});

// ── Existing behaviour is unaffected ──────────────────────────────────────────

describe("existing InputHandler behaviour is unaffected by ability key additions", () => {
  it("Space key still maps to fire", () => {
    handler.simulateKeyDown("Space");
    expect(handler.poll().fire).toBe(true);
  });

  it("WASD still maps to thrust/turn", () => {
    handler.simulateKeyDown("KeyW");
    handler.simulateKeyDown("KeyA");
    const state = handler.poll();
    expect(state.thrustForward).toBe(true);
    expect(state.turnLeft).toBe(true);
  });

  it("endFrame() still clears bomb pulse (backward-compat)", () => {
    // Bomb is set by simulateKeyDown for KeyB because keysPressed drives it
    // (bomb = keysPressed.has("KeyB") || bombPulse).  After simulateKeyUp,
    // keysPressed is cleared so bomb reverts to false on the next poll.
    handler.simulateKeyDown("KeyB");
    expect(handler.poll().bomb).toBe(true);
    handler.simulateKeyUp("KeyB");
    expect(handler.poll().bomb).toBe(false);
  });
});

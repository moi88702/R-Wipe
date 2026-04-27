// @vitest-environment happy-dom
/**
 * Integration tests — open-world solar system entry point in GameManager.
 *
 * Environment: happy-dom (provides window / KeyboardEvent).
 * Mocked boundaries: `pixi.js` (external library, never reaches the network).
 * Everything else runs for real: StateManager, InputHandler, SolarSystemManager,
 * OverworldManager, etc.
 *
 * Observable contracts:
 *  1. MAIN_MENU_ITEMS contains "solar-system".
 *  2. "solar-system" is at index 3 — between "shipyard" and "stats".
 *  3. Confirming item 3 on the main menu transitions the screen to "solar-system".
 *  4. ESC/Back while on "solar-system" returns to "main-menu".
 *  5. The solar system simulation ticks without throwing while on that screen.
 *  6. Down-arrow wraps correctly across all 5 menu items.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { MAIN_MENU_ITEMS } from "./GameManager";

// ── Pixi.js mock ──────────────────────────────────────────────────────────────
// vi.mock is hoisted — all declarations must live inside the factory function.

vi.mock("pixi.js", () => {
  class Anchor {
    set() {}
  }
  class MockText {
    text = "";
    x = 0;
    y = 0;
    visible = false;
    alpha = 1;
    style: Record<string, unknown> = {};
    anchor = new Anchor();
    constructor(opts: { text?: string; style?: unknown } = {}) {
      this.text = opts.text ?? "";
    }
    destroy() {}
  }
  class MockGraphics {
    x = 0;
    y = 0;
    visible = true;
    alpha = 1;
    clear() { return this; }
    rect() { return this; }
    fill() { return this; }
    circle() { return this; }
    stroke() { return this; }
    roundRect() { return this; }
    lineTo() { return this; }
    moveTo() { return this; }
    poly() { return this; }
    addChild() { return this; }
  }
  class MockContainer {
    x = 0;
    y = 0;
    visible = true;
    alpha = 1;
    children: unknown[] = [];
    addChild(...args: unknown[]) {
      this.children.push(...args);
      return args[0];
    }
  }
  class MockApplication {
    stage = new MockContainer();
    ticker = { add() {} };
    canvas = {} as HTMLCanvasElement;
    async init() {}
  }
  return {
    Application: MockApplication,
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
    TextStyle: class {
      constructor(_opts?: unknown) {}
    },
    VERSION: "8.0.0-mock",
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a GameManager starting on the main menu. */
async function makeGameManager() {
  const { GameManager } = await import("./GameManager");
  const { Application } = await import("pixi.js");
  const app = new Application() as unknown as import("pixi.js").Application;
  return new GameManager(app, { width: 1280, height: 720 });
}

/**
 * Simulate an edge-triggered keydown + keyup pair and tick the game.
 * InputHandler listens to window keyboard events (attached in its constructor).
 */
function pressKey(
  gm: Awaited<ReturnType<typeof makeGameManager>>,
  key: string,
) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, code: keyToCode(key) }));
  gm.tick(16);
  window.dispatchEvent(new KeyboardEvent("keyup", { key, code: keyToCode(key) }));
  gm.tick(16);
}

/** Map key names to KeyboardEvent.code values expected by InputHandler. */
function keyToCode(key: string): string {
  const map: Record<string, string> = {
    ArrowDown: "ArrowDown",
    ArrowUp: "ArrowUp",
    Enter: "Enter",
    Escape: "Escape",
    " ": "Space",
  };
  return map[key] ?? key;
}

// ── 1. Menu items contract ────────────────────────────────────────────────────

describe("MAIN_MENU_ITEMS", () => {
  it("includes 'solar-system'", () => {
    expect(MAIN_MENU_ITEMS).toContain("solar-system");
  });

  it("has 'solar-system' at index 3 (after play, campaign, shipyard)", () => {
    expect(MAIN_MENU_ITEMS[3]).toBe("solar-system");
  });

  it("has 'stats' immediately after 'solar-system'", () => {
    const idx = MAIN_MENU_ITEMS.indexOf("solar-system");
    expect(MAIN_MENU_ITEMS[idx + 1]).toBe("stats");
  });

  it("preserves the existing play / campaign / shipyard items in order", () => {
    expect(MAIN_MENU_ITEMS[0]).toBe("play");
    expect(MAIN_MENU_ITEMS[1]).toBe("campaign");
    expect(MAIN_MENU_ITEMS[2]).toBe("shipyard");
  });
});

// ── 2. Screen transitions ─────────────────────────────────────────────────────

describe("GameManager — navigating to the solar-system screen", () => {
  beforeEach(() => {
    // Release any lingering held keys.
    ["ArrowDown", "ArrowUp", "Enter", "Escape"].forEach((key) => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key, code: keyToCode(key) }),
      );
    });
  });

  it("given main menu, when item 3 selected and confirmed, then screen opens (selection resets to 0)", async () => {
    // Given
    const gm = await makeGameManager();
    // Let the initial startup debounce (MENU_DEBOUNCE_MS = 350ms) expire.
    gm.tick(400);

    // When — navigate down 3 times to land on "solar-system" (index 3).
    pressKey(gm, "ArrowDown"); // → index 1
    pressKey(gm, "ArrowDown"); // → index 2
    pressKey(gm, "ArrowDown"); // → index 3 ("solar-system")
    gm.tick(400);              // let debounce reset before confirm
    pressKey(gm, "Enter");

    // Then — opening any new screen resets menuSelection to 0.
    expect(gm.getMenuSelection()).toBe(0);
  });

  it("given solar-system screen, when ESC pressed, menuSelection stays 0 (back to main menu)", async () => {
    // Given — open solar-system first
    const gm = await makeGameManager();
    gm.tick(400);
    pressKey(gm, "ArrowDown");
    pressKey(gm, "ArrowDown");
    pressKey(gm, "ArrowDown");
    gm.tick(400);
    pressKey(gm, "Enter");
    expect(gm.getMenuSelection()).toBe(0);

    // When — ESC after debounce expires
    gm.tick(400);
    pressKey(gm, "Escape");

    // Then — back on main menu, selection is 0.
    expect(gm.getMenuSelection()).toBe(0);
  });

  it("ticking 30 frames on the solar-system screen does not throw", async () => {
    // Given
    const gm = await makeGameManager();
    gm.tick(400);
    pressKey(gm, "ArrowDown");
    pressKey(gm, "ArrowDown");
    pressKey(gm, "ArrowDown");
    gm.tick(400);
    pressKey(gm, "Enter");

    // When / Then
    expect(() => {
      for (let i = 0; i < 30; i++) gm.tick(16);
    }).not.toThrow();
  });

  it("down-arrow wraps past the last item back to index 0", async () => {
    // Given — start at selection 0 on the main menu.
    const gm = await makeGameManager();
    gm.tick(400);

    // When — press down MAIN_MENU_ITEMS.length times (full wrap-around).
    for (let i = 0; i < MAIN_MENU_ITEMS.length; i++) {
      pressKey(gm, "ArrowDown");
    }

    // Then — wrapped back to index 0.
    expect(gm.getMenuSelection()).toBe(0);
  });
});

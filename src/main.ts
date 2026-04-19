import { Application, VERSION } from "pixi.js";
import { GameManager } from "./game/GameManager";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const app = new Application();

async function init(): Promise<void> {
  await app.init({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: 0x0a0a14,
    antialias: true,
  });

  const container = document.getElementById("game-container");
  if (container) {
    container.appendChild(app.canvas);
  }

  // Fullscreen toggle. Pointerup (not click) so iOS Safari treats it as a
  // user gesture on the first tap. Falls back to a no-op on desktops where
  // the API isn't available.
  const fsButton = document.getElementById("fullscreen-btn");
  if (fsButton) {
    const ENTER_GLYPH = "⛶";
    const EXIT_GLYPH = "✕";
    const syncIcon = (): void => {
      const active = document.fullscreenElement !== null;
      fsButton.textContent = active ? EXIT_GLYPH : ENTER_GLYPH;
      fsButton.setAttribute(
        "aria-label",
        active ? "Exit fullscreen" : "Enter fullscreen",
      );
    };
    syncIcon();
    document.addEventListener("fullscreenchange", syncIcon);

    const toggleFullscreen = async (): Promise<void> => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen?.();
          type OrientationLock = (orientation: "landscape") => Promise<void>;
          const lock = (screen.orientation as unknown as { lock?: OrientationLock })
            ?.lock;
          if (typeof lock === "function") {
            await lock.call(screen.orientation, "landscape").catch(() => undefined);
          }
        } else {
          await document.exitFullscreen?.();
        }
      } catch {
        // Fullscreen denied or unsupported — fail silently.
      }
    };
    fsButton.addEventListener("pointerup", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void toggleFullscreen();
    });
    // Prevent the button's touch from being interpreted as a game tap.
    fsButton.addEventListener("touchstart", (e) => e.stopPropagation(), {
      passive: true,
    });
  }

  const game = new GameManager(app, {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  });

  // Drag-to-move, hold-to-fire, double-tap-bomb, two-finger-pause.
  game.enableTouchControls(app.canvas);
  // Mouse pointer for menu screens (shipyard, starmap).
  game.enablePointerControls(app.canvas);

  // Drive the game from Pixi's ticker — deltaMS is the real frame duration in ms.
  app.ticker.add((ticker) => {
    game.tick(ticker.deltaMS);
  });

  // Dev-only URL-param cheats. The `import.meta.env.DEV` literal is replaced
  // with `false` by Vite in production, so the dynamic import and the whole
  // `src/dev/cheats.ts` module are tree-shaken out of the prod bundle.
  if (import.meta.env.DEV) {
    const mod = await import("./dev/cheats");
    mod.applyCheats(game, mod.parseCheats(window.location.search));
  }

  console.log("R-Wipe: Pixi.js Application initialized", {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixiVersion: VERSION ?? "unknown",
  });
}

init().catch(console.error);

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

  // Fullscreen via Cmd/Ctrl+Enter (keyboard shortcut only — no on-screen button).
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
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void toggleFullscreen();
    }
  }, { capture: true });

  // Block the tab/window from closing while the game is open.
  window.addEventListener("beforeunload", function(e) {
    e.stopPropagation();
    e.preventDefault();
    return false;
  }, true);

  const game = new GameManager(app, {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  });

  // Drag-to-move, hold-to-fire, double-tap-bomb, two-finger-pause.
  game.enableTouchControls(app.canvas);
  // Mouse pointer for menu screens (shipyard, starmap).
  game.enablePointerControls(app.canvas);

  // ── Orientation management ───────────────────────────────────────────────
  // Arcade gameplay requires landscape. Menus + solar system support portrait
  // by CSS-rotating the game container +90° CW.
  const gameContainer = document.getElementById("game-container");
  const rotateHintEl = document.getElementById("rotate-hint");
  const ARCADE_SCREENS = new Set(["gameplay", "pause"]);

  function updateOrientationState(): void {
    const isPortrait = window.innerWidth < window.innerHeight;
    const screen = game.getCurrentScreen();
    const isArcade = ARCADE_SCREENS.has(screen);

    const showRotateHint = isPortrait && isArcade;
    const usePortraitRotation = isPortrait && !isArcade;

    document.body.classList.toggle("show-rotate-hint", showRotateHint);
    gameContainer?.classList.toggle("portrait-rotated", usePortraitRotation);
    game.setPortraitMode(usePortraitRotation);

    // Keep the hint element itself accessible (don't compete with CSS class)
    if (rotateHintEl) rotateHintEl.style.pointerEvents = showRotateHint ? "auto" : "none";
  }

  window.addEventListener("resize", updateOrientationState);
  window.addEventListener("orientationchange", updateOrientationState);
  updateOrientationState(); // run once on load

  // Drive the game from Pixi's ticker — deltaMS is the real frame duration in ms.
  app.ticker.add((ticker) => {
    game.tick(ticker.deltaMS);
    updateOrientationState(); // keep in sync as game screen changes
  });

  // Dev-only URL-param cheats and E2E scene setup.
  // `import.meta.env.DEV` is replaced with `false` by Vite in production, so
  // the dynamic imports and both src/dev/ modules are tree-shaken out.
  if (import.meta.env.DEV) {
    const [cheatsMod, e2eMod] = await Promise.all([
      import("./dev/cheats"),
      import("./dev/e2eScene"),
    ]);
    cheatsMod.applyCheats(game, cheatsMod.parseCheats(window.location.search));
    const e2eSpec = e2eMod.parseE2eScene(window.location.search);
    if (e2eMod.hasE2eScene(e2eSpec)) {
      e2eMod.applyE2eScene(game, e2eSpec);
    }
  }

  console.log("R-Wipe: Pixi.js Application initialized", {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixiVersion: VERSION ?? "unknown",
  });
}

init().catch(console.error);

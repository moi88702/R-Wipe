import { Application, VERSION } from "pixi.js";
import { GameManager } from "./game/GameManager";
import { soundManager } from "./audio/SoundManager";

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

  // Mute toggle button
  const muteBtn = document.getElementById("mute-btn");
  if (muteBtn) {
    const syncMuteIcon = (): void => {
      muteBtn.textContent = soundManager.isMuted() ? "🔇" : "🔊";
      muteBtn.setAttribute("aria-label", soundManager.isMuted() ? "Unmute sound" : "Mute sound");
    };
    muteBtn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      e.stopPropagation();
      soundManager.init();
      soundManager.toggleMute();
      syncMuteIcon();
    });
    muteBtn.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
  }

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

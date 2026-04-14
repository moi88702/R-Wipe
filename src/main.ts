/**
 * Application entry point.
 *
 * Bootstraps the Pixi.js Application at the target resolution (1280×720),
 * attaches the canvas to the DOM, and starts the 60 FPS ticker.
 *
 * A green test rectangle is rendered to confirm the WebGL/Canvas pipeline
 * is operational before any game scenes are loaded.
 */

import { Application, Graphics } from 'pixi.js';
import { SCREEN_WIDTH, SCREEN_HEIGHT, TARGET_FPS, BACKGROUND_COLOR } from './config/game.config';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Initialise the Pixi.js Application and mount it to the DOM.
 * Returns the fully-initialised `Application` instance for downstream use.
 */
export async function initApp(): Promise<Application> {
  const app = new Application();

  await app.init({
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: BACKGROUND_COLOR,
    antialias: false,
    resolution: 1,
    autoDensity: false,
  });

  // Cap the ticker to the target frame rate.
  app.ticker.maxFPS = TARGET_FPS;

  // Attach the Pixi canvas to the page.
  const container = document.getElementById('game-container');
  if (!container) {
    throw new Error(
      'DOM element #game-container not found. Ensure index.html contains <div id="game-container">.',
    );
  }
  container.appendChild(app.canvas);

  return app;
}

/**
 * Render a temporary green rectangle to verify the Pixi pipeline works.
 * The rectangle is removed after 3 seconds so it does not persist into
 * actual gameplay.
 */
function addTestRectangle(app: Application): void {
  const rect = new Graphics();
  rect.rect(40, 40, 240, 80);
  rect.fill(0x00ff00);

  // Label via a second graphics object (a thin white border) so the test
  // rectangle is unmistakable in the top-left corner.
  const border = new Graphics();
  border.rect(40, 40, 240, 80);
  border.stroke({ width: 2, color: 0xffffff });

  app.stage.addChild(rect);
  app.stage.addChild(border);

  // Auto-remove after 3 s so a production build starts clean.
  setTimeout(() => {
    app.stage.removeChild(rect);
    app.stage.removeChild(border);
    rect.destroy();
    border.destroy();
  }, 3000);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

initApp()
  .then((app) => {
    // Verify the renderer is alive.
    addTestRectangle(app);

    console.log(
      `[R-Type] Pixi.js ${app.renderer.type === 1 ? 'WebGL' : 'Canvas'} renderer ` +
        `initialised at ${SCREEN_WIDTH}×${SCREEN_HEIGHT} @ ${TARGET_FPS} FPS`,
    );
  })
  .catch((err: unknown) => {
    console.error('[R-Type] Failed to initialise application:', err);
  });

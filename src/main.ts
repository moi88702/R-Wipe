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

  const game = new GameManager(app, {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  });

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

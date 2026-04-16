import { Application, Text, TextStyle, VERSION } from "pixi.js";

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

  // Render "Hello R-Wipe" message
  const style = new TextStyle({
    fontFamily: "monospace",
    fontSize: 48,
    fill: 0x00ffff,
    fontWeight: "bold",
    dropShadow: {
      color: 0x0000ff,
      blur: 8,
      distance: 4,
    },
  });

  const helloText = new Text({ text: "Hello R-Wipe", style });
  helloText.anchor.set(0.5, 0.5);
  helloText.x = CANVAS_WIDTH / 2;
  helloText.y = CANVAS_HEIGHT / 2;
  app.stage.addChild(helloText);

  console.log("R-Wipe: Pixi.js Application initialized", {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixiVersion: VERSION ?? "unknown",
  });

  // Game loop – Pixi ticker uses requestAnimationFrame internally
  app.ticker.add((ticker) => {
    // Pulse the text to demonstrate 60 FPS rendering
    helloText.alpha = 0.7 + 0.3 * Math.sin(ticker.lastTime * 0.002);
  });
}

init().catch(console.error);

import { Application } from "pixi.js";

const app = new Application();

async function init(): Promise<void> {
  await app.init({
    width: 800,
    height: 600,
    backgroundColor: 0x0a0a14,
    antialias: true,
  });

  const container = document.getElementById("game-container");
  if (container) {
    container.appendChild(app.canvas);
  }
}

init().catch(console.error);

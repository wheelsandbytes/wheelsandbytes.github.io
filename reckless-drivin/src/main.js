// Entry point (main.c / initexit.c): load data, then run the menu/game loop.

import { G } from './state.js';
import { ResourceFile } from './resources.js';
import { Packs } from './packs.js';
import { GameData } from './data.js';
import { initScreen, screen, FadeScreen, present, nextFrame } from './screen.js';
import { initSound } from './sound.js';
import { initInput, waitEvent } from './input.js';
import { LoadPrefs } from './preferences.js';
import { ShowPicScreen, InitInterface, Eventloop, setCursorVisible } from './interface.js';
import { GameFrame } from './gameframe.js';

async function Init(canvas) {
  initScreen(canvas);
  const buffer = await fetch('data/resources.dat').then((r) => {
    if (!r.ok) throw new Error(`could not load data/resources.dat (${r.status})`);
    return r.arrayBuffer();
  });
  const resources = new ResourceFile(buffer);
  LoadPrefs(resources);
  G.data = { resources };
  await ShowPicScreen(1003);
  // Let the loading screen paint before the heavy unpacking.
  await nextFrame();
  const packs = new Packs(resources);
  G.registered = packs.checkRegistration();
  G.data = new GameData(resources, packs);
  initInput(canvas);
  initSound();
  await InitInterface();
}

function showMessage(lines) {
  screen.overlay = (ctx) => {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#fff';
    ctx.font = '16px Geneva, Verdana, sans-serif';
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, 320, 230 + i * 24));
    ctx.restore();
  };
  present();
}

async function main() {
  const canvas = document.getElementById('screen');
  try {
    await Init(canvas);
    for (;;) {
      while (!G.exit) {
        if (G.gameOn) await GameFrame();
        else await Eventloop();
      }
      // There is no Finder to quit to: show a black screen until the player clicks.
      await FadeScreen(1);
      setCursorVisible(true);
      showMessage(['Thanks for playing Reckless Drivin’!', 'Click to return to the menu.']);
      await FadeScreen(0);
      for (;;) {
        const ev = await waitEvent(1000);
        if (ev && ev.type === 'mousedown') break;
      }
      G.exit = false;
      await InitInterface();
    }
  } catch (err) {
    console.error(err);
    screen.canvas.style.filter = '';
    showMessage(['Reckless Drivin’ hit an error:', String(err.message ?? err)]);
  }
}

// Exposed for debugging and automated tests.
window.RD = { G, screen };

main();

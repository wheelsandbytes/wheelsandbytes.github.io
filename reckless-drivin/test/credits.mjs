// Finishes level 10 to show the end credits, then checks weapons (mines/missiles) on level 1.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, state } from './smoke.mjs';

const out = new URL('./out/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const { server, browser, page, errors } = await launch(false);
const shot = (name) => page.locator('#screen').screenshot({ path: join(out, `${name}.png`) });

try {
  await page.waitForFunction(() => window.RD?.G?.data?.sprites && !window.RD.G.gameOn, null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyS');
  await page.keyboard.up('Alt');
  await page.fill('.rd-dialog [name=level]', '10');
  await page.click('.rd-dialog button');
  await page.waitForFunction(() => window.RD.G.gameOn && window.RD.G.frameCount > 30, null, { timeout: 15000 });
  await page.evaluate(() => {
    const G = window.RD.G;
    const y = G.levelData.levelEnd - 150;
    const r = Math.trunc(y / 2) * 4;
    const road = G.roadData;
    const p = G.playerObj;
    p.pos.x = road[r + 1] !== road[r + 2] ? (road[r] + road[r + 1]) / 2 : (road[r] + road[r + 3]) / 2;
    p.pos.y = y;
    p.dir = 0;
    p.velo = { x: 0, y: 30 };
  });
  await page.waitForFunction(() => window.RD.G.finishDelay > 0, null, { timeout: 10000 });
  // Credits start once the tally closes (levelID becomes 10); they draw straight onto the canvas.
  await page.waitForFunction(() => window.RD.G.levelID === 10, null, { timeout: 60000 });
  await page.waitForTimeout(8000);
  await shot('credits-1');
  await page.waitForTimeout(6000);
  await shot('credits-2');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.RD.G.levelID === 0 && window.RD.G.frameCount > 30, null, { timeout: 20000 });
  console.log('after credits', await state(page));

  // Weapons.
  await page.evaluate(() => {
    window.RD.G.numMines = 3;
    window.RD.G.numMissiles = 3;
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(150);
  await shot('weapons-missile');
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(300);
  await shot('weapons-mine');
  await page.keyboard.up('ArrowUp');
  console.log('weapons left', await page.evaluate(() => [window.RD.G.numMines, window.RD.G.numMissiles]));
} finally {
  console.log(errors.filter((e) => !e.includes('404')).join('\n') || 'no errors');
  await browser.close();
  server.close();
}

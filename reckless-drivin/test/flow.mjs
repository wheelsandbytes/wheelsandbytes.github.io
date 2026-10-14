// End-to-end flow test: finish a level (tally + next level), pause/resume, game over + high score.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, state } from './smoke.mjs';

const out = new URL('./out/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const { server, browser, page, errors } = await launch(process.argv.includes('--headed'));
const shot = (name) => page.locator('#screen').screenshot({ path: join(out, `${name}.png`) });

// Moves the player onto the road just before the finish line.
const teleportToFinish = () =>
  page.evaluate(() => {
    const G = window.RD.G;
    const y = G.levelData.levelEnd - 150;
    const r = Math.trunc(y / 2) * 4;
    const road = G.roadData;
    const p = G.playerObj;
    p.pos.x = road[r + 1] !== road[r + 2] ? (road[r] + road[r + 1]) / 2 : (road[r] + road[r + 3]) / 2;
    p.pos.y = y;
    p.dir = 0;
    p.velo = { x: 0, y: 30 };
    const up = G.trackUp.track;
    p.target = Math.max(1, up.findIndex((t) => t.y > y));
  });

try {
  await page.waitForFunction(() => window.RD?.G?.data?.sprites && !window.RD.G.gameOn, null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.keyboard.press('s');
  await page.waitForFunction(() => window.RD.G.gameOn && window.RD.G.frameCount > 30, null, { timeout: 15000 });

  // Pause and resume.
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(1500);
  await shot('flow-pause');
  const pausedFrame = (await state(page)).frame;
  await page.waitForTimeout(500);
  const stillPaused = (await state(page)).frame === pausedFrame;
  await page.mouse.click(400, 300);
  await page.waitForTimeout(1000);
  console.log('pause held frames:', stillPaused, 'resumed:', (await state(page)).frame > pausedFrame);

  // Finish level 1.
  await teleportToFinish();
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.RD.G.finishDelay > 0, null, { timeout: 10000 });
  await page.keyboard.up('ArrowUp');
  console.log('finished level 1', await state(page));
  await page.waitForFunction(() => window.RD.G.finishDelay > 7, null, { timeout: 20000 });
  await shot('flow-tally1');
  await page.waitForFunction(() => window.RD.G.finishDelay > 12, null, { timeout: 20000 });
  await shot('flow-tally2');
  await page.waitForFunction(() => window.RD.G.levelID === 1, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot('flow-level2');
  console.log('level 2', await state(page));

  // Game over: one life left, drive into the grass.
  await page.evaluate(() => (window.RD.G.playerLives = 1));
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.RD.G.playerDeathDelay > 0, null, { timeout: 15000 });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(3200);
  await shot('flow-gameover');
  await page.waitForSelector('.rd-dialog input', { timeout: 20000 });
  await shot('flow-highscore-dialog');
  await page.fill('.rd-dialog input', 'Playwright');
  await page.click('.rd-dialog button');
  await page.waitForTimeout(2000);
  await shot('flow-highscores');
  console.log('high scores', JSON.stringify(await page.evaluate(() => window.RD.G.prefs.high.slice(0, 3))));
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await shot('flow-menu-again');
  console.log('back at menu:', !(await state(page)).gameOn);
} finally {
  console.log(errors.filter((e) => !e.includes('404')).join('\n') || 'no errors');
  await browser.close();
  server.close();
}

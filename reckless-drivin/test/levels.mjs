// Loads each level via the Option+Start level-select dialog, drives briefly, and screenshots it.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, state } from './smoke.mjs';

const out = new URL('./out/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const only = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const levels = only.length ? only : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const { server, browser, page, errors } = await launch(false);
try {
  for (const level of levels) {
    await page.reload();
    await page.waitForFunction(() => window.RD?.G?.data?.sprites && !window.RD.G.gameOn, null, { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.keyboard.down('Alt');
    await page.keyboard.press('KeyS');
    await page.keyboard.up('Alt');
    await page.waitForSelector('.rd-dialog [name=level]');
    await page.fill('.rd-dialog [name=level]', String(level));
    await page.click('.rd-dialog button');
    await page.waitForFunction(() => window.RD.G.gameOn && window.RD.G.frameCount > 30, null, { timeout: 15000 });
    await page.locator('#screen').screenshot({ path: join(out, `level${level}-a.png`) });
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(2500);
    await page.locator('#screen').screenshot({ path: join(out, `level${level}-b.png`) });
    await page.keyboard.up('ArrowUp');
    const s = await state(page);
    const perf = await page.evaluate(() => ({ frames: window.RD.G.frameCount, rendered: window.RD.G.graphFrameCount }));
    console.log(level, JSON.stringify(s.player), 'road', await page.evaluate(() => window.RD.G.roadInfo.id), JSON.stringify(perf));
  }
} finally {
  console.log(errors.filter((e) => !e.includes('404')).join('\n') || 'no errors');
  await browser.close();
  server.close();
}

// Debug: crash the car and dump visible objects plus screenshots.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch } from './smoke.mjs';

const out = new URL('./out/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const { server, browser, page, errors } = await launch(process.argv.includes('--headed'));
try {
  await page.waitForFunction(() => window.RD?.G?.data?.sprites && !window.RD.G.gameOn, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('s');
  await page.waitForFunction(() => window.RD.G.gameOn && window.RD.G.frameCount > 30, null, { timeout: 15000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2500);
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.RD.G.playerDeathDelay > 0, null, { timeout: 10000 });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(250);
    await page.locator('#screen').screenshot({ path: join(out, `crash-${i}.png`) });
    const objs = await page.evaluate(() => {
      const G = window.RD.G;
      const res = [];
      for (let o = G.firstVisObj; o !== G.lastVisObj; o = o.next)
        if (Math.abs(o.pos.y - G.cameraObj.pos.y) < 400)
          res.push(`${o.type.id}/f${o.frame}/L${o.layer}/j${o.jumpHeight.toFixed(1)} @${o.pos.x.toFixed(0)},${o.pos.y.toFixed(0)}`);
      return { zoom: 0.5 + G.zoomVelo / 50, n: res.length, res };
    });
    console.log(i, JSON.stringify(objs));
  }
} finally {
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
  server.close();
}

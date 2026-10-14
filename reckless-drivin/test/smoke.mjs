// Browser smoke test: serves the project, loads the game in Chrome via Playwright, starts a game,
// drives for a few seconds and saves screenshots to test/out/.
// Usage: node test/smoke.mjs [--headed]

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'test', 'out');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.dat': 'application/octet-stream' };

export function startServer() {
  const server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path === '/') path = '/index.html';
    try {
      const body = await readFile(join(root, path));
      res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function launch(headed) {
  const server = await startServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: !headed, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  return { server, browser, page, errors };
}

export const state = (page) =>
  page.evaluate(() => {
    const G = window.RD.G;
    const p = G.playerObj;
    return {
      gameOn: G.gameOn,
      level: G.levelID + 1,
      frame: G.frameCount,
      lives: G.playerLives,
      score: G.playerScore,
      time: G.gameTime && +G.gameTime.toFixed(2),
      player: p && { x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), speed: +Math.hypot(p.velo.x, p.velo.y).toFixed(1), type: p.type.id },
    };
  });

async function main() {
  const headed = process.argv.includes('--headed');
  await mkdir(outDir, { recursive: true });
  const { server, browser, page, errors } = await launch(headed);
  const shot = (name) => page.locator('#screen').screenshot({ path: join(outDir, `${name}.png`) });
  try {
    await page.waitForFunction(() => window.RD?.G?.data?.sprites && !window.RD.G.gameOn, null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await shot('01-menu');
    await page.keyboard.press('s');
    await page.waitForFunction(() => window.RD.G.gameOn && window.RD.G.frameCount > 30, null, { timeout: 15000 });
    await shot('02-start');
    console.log('start', await state(page));
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(3000);
    await shot('03-driving');
    console.log('driving', await state(page));
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(1500);
    await shot('04-steer');
    console.log('steered', await state(page));
    await page.keyboard.up('ArrowUp');
  } finally {
    console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
    await browser.close();
    server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

// Screen handling (screen.c / screenfx.c): a 640x480 RGB555 back buffer the game renders into,
// a front buffer representing what is on the display, and presentation to an HTML canvas.

import { G, kXSize, kYSize } from './state.js';

export const screen = {
  back: new Uint16Array(kXSize * kYSize),
  front: new Uint16Array(kXSize * kYSize),
  base: null, // current draw target (gBaseAddr)
  canvas: null,
  ctx: null,
  image: null,
  pixels: null,
  overlay: null, // optional callback(ctx) drawn on top after each present
  brightness: 1,
};
screen.base = screen.back;

// RGB555 -> canvas RGBA (as little-endian Uint32).
const lut = new Uint32Array(32768);
for (let c = 0; c < 32768; c++) {
  const r = (((c >> 10) & 31) * 255) / 31;
  const g = (((c >> 5) & 31) * 255) / 31;
  const b = ((c & 31) * 255) / 31;
  lut[c] = (0xff << 24) | (b << 16) | (g << 8) | r;
}

export function initScreen(canvas) {
  screen.canvas = canvas;
  screen.ctx = canvas.getContext('2d');
  screen.image = screen.ctx.createImageData(kXSize, kYSize);
  screen.pixels = new Uint32Array(screen.image.data.buffer);
}

export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Microsecond clock (input.c GetMSTime).
export const GetMSTime = () => performance.now() * 1000;

export function present() {
  const src = screen.front;
  const dst = screen.pixels;
  for (let i = 0; i < src.length; i++) dst[i] = lut[src[i] & 0x7fff];
  screen.ctx.putImageData(screen.image, 0, 0);
  if (screen.overlay) screen.overlay(screen.ctx);
}

export function BlendRGB16(a, b) {
  return ((a & 0x001e) >> 1) + ((b & 0x001e) >> 1) + ((a & 0x03c0) >> 1) + ((b & 0x03c0) >> 1) + ((a & 0x7800) >> 1) + ((b & 0x7800) >> 1);
}

export const kLightValues = 16;
export function ShadeRGB16(shade, a) {
  return (
    (((a & 0x001e) * shade) / kLightValues | 0) +
    ((((a & 0x03c0) * shade) / kLightValues) & 0x03c0) +
    ((((a & 0x7800) * shade) / kLightValues) & 0x7800)
  );
}

function setBrightness(b) {
  screen.brightness = b;
  screen.canvas.style.filter = b >= 1 ? '' : `brightness(${Math.max(0, b)})`;
}

const kFadeTime = 400; // ms; DrawSprocket gamma fades

async function fadeTo(target) {
  const start = screen.brightness;
  const t0 = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - t0) / kFadeTime);
    setBrightness(start + (target - start) * t);
    if (t >= 1) break;
    await nextFrame();
  }
}

// screen.c FadeScreen: 1 = fade out, 0 = fade in, >=256 = set gamma (256..512 -> 0..100%).
export async function FadeScreen(out) {
  if (out === 1) await fadeTo(0);
  else if (out === 0) await fadeTo(1);
  if (out >= 256) setBrightness(out > 512 ? 0 : (out - 256) / 256);
}

export function ScreenClear() {
  screen.front.fill(0);
  present();
}

// Copies a decoded RGBA picture into the front buffer as RGB555.
export function drawPictureToFront(pict, dx = 0, dy = 0, clipRect = null) {
  const { width, height, rgba } = pict;
  for (let y = 0; y < height; y++) {
    const sy = y + dy;
    if (sy < 0 || sy >= kYSize) continue;
    for (let x = 0; x < width; x++) {
      const sx = x + dx;
      if (sx < 0 || sx >= kXSize) continue;
      if (clipRect && (sx < clipRect.left || sx >= clipRect.right || sy < clipRect.top || sy >= clipRect.bottom)) continue;
      const o = (y * width + x) * 4;
      screen.front[sy * kXSize + sx] = ((rgba[o] >> 3) << 10) | ((rgba[o + 1] >> 3) << 5) | (rgba[o + 2] >> 3);
    }
  }
}

// screenfx.c ShiftInPictureFrame16: even rows slide in from the left, odd rows from the right.
function shiftInPictureFrame(per) {
  const { front, back } = screen;
  for (let y = 0; y < kYSize; y += 2) {
    const relY = y / kYSize;
    let x = ((4 / (relY * relY + 2 * relY + 1) - 4 / (relY + 1) - 1) * (1 - per) * kXSize) | 0;
    if (x > 0) x = 0;
    const row = y * kXSize;
    const count = x + kXSize;
    for (let i = 0; i < count; i++) front[row + i] = back[row + i - x];
  }
  for (let y = 1; y < kYSize; y += 2) {
    const relY = 1 - y / kYSize;
    let x = ((-4 / (relY * relY + 2 * relY + 1) + 4 / (relY + 1) + 1) * (1 - per) * kXSize) | 0;
    if (x < 0) x = 0;
    const row = y * kXSize;
    const count = kXSize - x;
    for (let i = 0; i < count; i++) front[row + x + i] = back[row + i];
  }
}

const kShiftInDuration = 0.8;

export async function ShiftInPicture(pauseFrameCount, resumeFrameCount) {
  pauseFrameCount();
  const animStart = GetMSTime();
  let t;
  do {
    t = (GetMSTime() - animStart) / 1000000.0;
    shiftInPictureFrame(Math.min(t / kShiftInDuration, 1));
    present();
    await nextFrame();
  } while (t < kShiftInDuration);
  resumeFrameCount();
}

export async function Blit2Screen(pauseFrameCount, resumeFrameCount) {
  if (G.screenBlitSpecial) {
    G.screenBlitSpecial = false;
    await ShiftInPicture(pauseFrameCount, resumeFrameCount);
  } else {
    screen.front.set(screen.back);
    present();
  }
}

// Animated text effects drawn with the RLE game font (textfx.c, 16-bit path).
// Strings use the font's own encoding: 'A'-'Z' letters, '['-'d' digits, 'e' '!', 'f' '.', 'g' ',', 'h' space.

import { G, kXSize, kYSize, kFrameDuration, kInvLines } from './state.js';
import { screen } from './screen.js';
import { sin, PI } from './trig.js';
import { decodeTokens, kDrawPixelsToken, kSkipPixelsToken } from './rle.js';
import { toInt } from './sprites.js';

export const kEffectExplode = 1 << 0;
export const kEffectSinLines = 1 << 2;
export const kEffectMoveUp = 1 << 3;
export const kEffectMoveDown = 1 << 4;
export const kEffectMoveLeft = 1 << 5;
export const kEffectMoveRight = 1 << 6;
export const kEffectTiny = 1 << 7;
export const kEffectAbsPos = 1 << 8;

const kMaxFX = 10;
const kCharSize = 32;
const kExplAccel = 10.0;
const kEffectAccel = 150.0;
const kEffectTimeOut = 2.0;
const kEffectSinAmp = 30.0;
const kEffectSinFreq = 2.0 / kCharSize;
const kEffectSinVelo = 2 * PI;

let textFX = [];

export function NewTextEffect(x, y, effectFlags, text) {
  if (textFX.length < kMaxFX) textFX.push({ x: Math.trunc(x), y: Math.trunc(y), effectFlags, fxStartFrame: G.frameCount, text });
}

export function ClearTextFX() {
  textFX = [];
}

export function MakeFXStringFromNumStr(numStr) {
  let s = '';
  for (const ch of String(numStr)) s += String.fromCharCode(ch.charCodeAt(0) + 0x2b);
  return s;
}

const glyphCache = new Map();

function glyph(ch) {
  let t = glyphCache.get(ch);
  if (!t) {
    const entry = G.data.font.get(ch.charCodeAt(0) - 65 + 128);
    t = entry ? decodeTokens(entry, 8) : [];
    glyphCache.set(ch, t);
  }
  return t;
}

// Draws one line of glyph tokens starting at index idx; returns the index after the line token.
function drawCharLine(tokens, idx, x, y) {
  const buf = screen.base;
  const noDraw = y < 0 || y >= kYSize - kInvLines || x + kCharSize < 0 || x >= kXSize || x < 0 || x + kCharSize >= kXSize;
  let dst = x + y * kXSize;
  for (; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.op === kDrawPixelsToken) {
      if (!noDraw) {
        let i = 0;
        for (; t.n - 2 >= i; i += 2) {
          buf[dst + i] = t.pixels[i];
          buf[dst + i + 1] = t.pixels[i + 1];
        }
        if (t.n - 1 >= i) buf[dst + i] = (t.pixels[i] & 0xff00) | (buf[dst + i] & 0x00ff);
      }
      dst += t.n;
    } else if (t.op === kSkipPixelsToken) {
      dst += t.n;
    } else {
      return idx + 1;
    }
  }
  return idx;
}

// x and zoom are 16.16 fixed point.
function drawZoomedCharLine(tokens, idx, x, y, zoom) {
  const buf = screen.base;
  const lineBase = y * kXSize;
  const px = x >> 16;
  const w = zoom >>> 11;
  const noDraw = y < 0 || y >= kYSize - kInvLines || px + w < 0 || px >= kXSize || px < 0 || px + w >= kXSize;
  for (; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.op === kDrawPixelsToken) {
      if (!noDraw) {
        for (let i = 0; i < t.n; i++) {
          buf[lineBase + (x >> 16)] = t.pixels[i];
          x = (x + zoom) | 0;
        }
      }
    } else if (t.op === kSkipPixelsToken) {
      if (!noDraw) x = (x + t.n * zoom) | 0;
    } else {
      return idx + 1;
    }
  }
  return idx;
}

export function DrawTextFXZoomed(xDrawStart, yDrawStart, zoom) {
  for (let i = 0; i < textFX.length; i++) {
    const fx = textFX[i];
    const tiny = fx.effectFlags & kEffectTiny;
    const dt = (G.frameCount - fx.fxStartFrame) * kFrameDuration * (tiny ? 3 : 1);
    const exploZoom = (fx.effectFlags & kEffectExplode ? 1 + 0.5 * dt * dt * kExplAccel : 1) * (tiny ? 0.25 : 1);
    let baseX = fx.x - fx.text.length * kCharSize * 0.5 * exploZoom;
    let baseY = fx.y - kCharSize * 0.5 * exploZoom;
    if (fx.effectFlags & kEffectAbsPos) {
      baseY = (yDrawStart - baseY) / zoom;
      baseX = (baseX - xDrawStart) / zoom;
      fx.x = Math.trunc((fx.x - xDrawStart) / zoom);
      fx.y = Math.trunc((yDrawStart - fx.y) / zoom);
      fx.effectFlags ^= kEffectAbsPos;
    }
    if (fx.effectFlags & kEffectMoveUp) baseY -= 0.5 * dt * dt * kEffectAccel;
    else if (fx.effectFlags & kEffectMoveDown) baseY += 0.5 * dt * dt * kEffectAccel;
    if (fx.effectFlags & kEffectMoveLeft) baseX -= 0.5 * dt * dt * kEffectAccel;
    else if (fx.effectFlags & kEffectMoveRight) baseX += 0.5 * dt * dt * kEffectAccel;
    for (const ch of fx.text) {
      const tokens = glyph(ch);
      let idx = 0;
      let y = baseY;
      for (let line = 0; line < kCharSize; line++) {
        const x = baseX + (fx.effectFlags & kEffectSinLines ? sin(line * kEffectSinFreq + dt * kEffectSinVelo) * kEffectSinAmp * exploZoom : 0);
        if (exploZoom !== 1) idx = drawZoomedCharLine(tokens, idx, toInt(x * 65536.0), Math.trunc(y), toInt(exploZoom * 65536.0));
        else idx = drawCharLine(tokens, idx, Math.trunc(x), Math.trunc(y));
        y += exploZoom;
      }
      baseX += exploZoom * kCharSize;
    }
    if (dt * (tiny ? 2 : 1) >= kEffectTimeOut) textFX.splice(i, 1);
  }
}

// Half-size text (missile/mine counters).
export function SimpleDrawText(text, xPos, yPos) {
  for (const ch of text) {
    const tokens = glyph(ch);
    let idx = 0;
    let y = yPos;
    for (let line = 0; line < kCharSize / 2; line++) {
      idx = drawZoomedCharLine(tokens, idx, xPos << 16, y, 1 << 15);
      idx = drawZoomedCharLine(tokens, idx, xPos << 16, y, 1 << 15);
      y++;
    }
    xPos += kCharSize / 2;
  }
}

// RLE blitter for panel graphics and the game font (rle.c / textfx.c token format).
// Each entry is an 8-byte Rect followed by 4-byte tokens: byte 0 = opcode, low 24 bits = count.

import { G, kXSize, kYSize } from './state.js';
import { screen } from './screen.js';

export const kEndShapeToken = 0;
export const kLineStartToken = 1;
export const kDrawPixelsToken = 2;
export const kSkipPixelsToken = 3;

// Decodes an RLE token stream (starting at byte offset) into [{op, n, pixels}].
export function decodeTokens(bytes, offset) {
  const tokens = [];
  let p = offset;
  for (;;) {
    const op = bytes[p];
    const n = (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
    if (op === kDrawPixelsToken) {
      const pixels = new Uint16Array(n);
      for (let i = 0; i < n; i++) pixels[i] = (bytes[p + 4 + i * 2] << 8) | bytes[p + 5 + i * 2];
      const size = n * 2;
      p += 4 + size + (size & 3 ? (4 - size) & 3 : 0);
      tokens.push({ op, n, pixels });
    } else if (op === kSkipPixelsToken || op === kLineStartToken) {
      p += 4;
      tokens.push({ op, n });
    } else if (op === kEndShapeToken) {
      tokens.push({ op, n });
      break;
    } else {
      throw new Error(`bad RLE token ${op} at ${p}`);
    }
  }
  return tokens;
}

const cache = new Map();

function rleTokens(id) {
  let t = cache.get(id);
  if (!t) {
    t = decodeTokens(G.data.rle.get(id), 8);
    cache.set(id, t);
  }
  return t;
}

// Copies a pixel run. Like the original, an odd trailing pixel only gets its high byte copied.
function copyRun(buf, dst, pixels, n) {
  let i = 0;
  for (; n - 2 >= i; i += 2) {
    buf[dst + i] = pixels[i];
    buf[dst + i + 1] = pixels[i + 1];
  }
  if (n - 1 >= i) buf[dst + i] = (pixels[i] & 0xff00) | (buf[dst + i] & 0x00ff);
}

function drawRLEInternal(h, v, id, yclip) {
  const buf = screen.base;
  let lineStart = h + v * kXSize;
  let dst = lineStart;
  for (const t of rleTokens(id)) {
    switch (t.op) {
      case kDrawPixelsToken:
        if (!yclip || v >= 0) copyRun(buf, dst, t.pixels, t.n);
        dst += t.n;
        break;
      case kSkipPixelsToken:
        dst += t.n;
        break;
      case kLineStartToken:
        lineStart += kXSize;
        dst = lineStart;
        if (yclip) {
          v++;
          if (v >= kYSize) return;
        }
        break;
      case kEndShapeToken:
        return;
    }
  }
}

export function DrawRLE(h, v, id) {
  drawRLEInternal(h, v, id, false);
}

export function DrawRLEYClip(h, v, id) {
  drawRLEInternal(h, v, id, true);
}

// Rotated/scaled sprite rasterizer and sprite damage distortion (sprites.c, 16-bit path).

import { G, kXSize, kYSize } from './state.js';
import { screen, BlendRGB16, ShadeRGB16, kLightValues } from './screen.js';
import { sin, cos } from './trig.js';
import { RanFl } from './random.js';

const kNumSprites = 300;
const kNumSpecialSprites = 100;
const kDrawModeTransparent = 1 << 0;
const kDrawModeDoubleSize = 1 << 2;

// C float->int conversion as on PowerPC (saturating, NaN -> INT_MIN).
export function toInt(v) {
  if (v !== v) return -2147483648;
  if (v >= 2147483647) return 2147483647;
  if (v <= -2147483648) return -2147483648;
  return v | 0;
}

const kMaxScreenY = 641;
const slopeX1 = new Int32Array(kMaxScreenY);
const slopeX2 = new Int32Array(kMaxScreenY);
const slopeU = new Int32Array(kMaxScreenY);
const slopeV = new Int32Array(kMaxScreenY);

function slopeInitUVLine(v1, v2, dudx, dvdx) {
  let { x: x1, y: y1, u: u1, v: w1 } = v1;
  let y2 = v2.y;
  const dxdy = toInt(((v2.x - x1) * 65536.0) / (y2 - y1));
  const dudy = toInt(((v2.u - u1) << 8) / (y2 - y1));
  const dvdy = toInt(((v2.v - w1) << 8) / (y2 - y1));
  if (y1 >= kYSize) return;
  if (y2 < 0) return;
  if (y1 < 0) {
    x1 += (-y1 * dxdy) / 65536.0;
    u1 = toInt(u1 + (-y1 * dudy) / 256.0);
    w1 = toInt(w1 + (-y1 * dvdy) / 256.0);
    y1 = 0;
  }
  if (y2 >= kYSize) y2 = kYSize;
  const firsty = Math.ceil(y1);
  const lasty = Math.floor(y2);
  if (!(firsty >= 0 && firsty < kMaxScreenY)) return;
  slopeX2[firsty] = toInt(x1 * 65536.0 + (firsty - y1) * dxdy);
  slopeU[firsty] = toInt((u1 << 8) + (firsty - y1) * dudy);
  slopeV[firsty] = toInt((w1 << 8) + (firsty - y1) * dvdy);
  for (let y = firsty + 1; y <= lasty; y++) {
    slopeX2[y] = slopeX2[y - 1] + dxdy;
    slopeU[y] = slopeU[y - 1] + dudy;
    slopeV[y] = slopeV[y - 1] + dvdy;
  }
  slopeU[firsty] += dudx;
  slopeV[firsty] += dvdx;
  slopeX2[firsty] += 65536;
}

function slopeInitLine(v1, v2) {
  let { x: x1, y: y1 } = v1;
  let y2 = v2.y;
  const dxdy = toInt(((v2.x - x1) * 65536.0) / (y2 - y1));
  if (y1 >= kYSize) return;
  if (y2 < 0) return;
  if (y1 < 0) {
    x1 += (-y1 * dxdy) / 65535.0;
    y1 = 0;
  }
  if (y2 >= kYSize) y2 = kYSize;
  const firsty = Math.ceil(y1);
  const lasty = Math.floor(y2);
  if (!(firsty >= 0 && firsty < kMaxScreenY)) return;
  slopeX1[firsty] = toInt(x1 * 65536.0 + (firsty - y1) * dxdy);
  for (let y = firsty + 1; y <= lasty; y++) slopeX1[y] = slopeX1[y - 1] + dxdy;
}

// Returns null if nothing to draw, otherwise {y1, y2, clip}.
function slopeInit(cx, cy, dirCos, dirSin, sprite, dudx, dvdx) {
  const hx = sprite.xSize / 2;
  const hy = sprite.ySize / 2;
  const vt = [
    { x: cx - dirCos * hx + dirSin * hy, y: cy - dirSin * hx - dirCos * hy, u: 0, v: 0 },
    { x: cx + dirCos * hx + dirSin * hy, y: cy + dirSin * hx - dirCos * hy, u: sprite.xSize, v: 0 },
    { x: cx + dirCos * hx - dirSin * hy, y: cy + dirSin * hx + dirCos * hy, u: sprite.xSize, v: sprite.ySize },
    { x: cx - dirCos * hx - dirSin * hy, y: cy - dirSin * hx + dirCos * hy, u: 0, v: sprite.ySize },
  ];
  let hi = -1;
  let hiY = Infinity;
  for (let i = 0; i < 4; i++) {
    if (vt[i].y < hiY) {
      hi = i;
      hiY = vt[i].y;
    }
  }
  if (hi < 0) return null;
  if (vt[(hi + 1) & 3].x < 0 || vt[(hi - 1) & 3].x >= kXSize) return null;
  slopeInitUVLine(vt[hi], vt[(hi - 1) & 3], dudx, dvdx);
  slopeInitUVLine(vt[(hi - 1) & 3], vt[(hi - 2) & 3], dudx, dvdx);
  slopeInitLine(vt[hi], vt[(hi + 1) & 3]);
  slopeInitLine(vt[(hi + 1) & 3], vt[(hi + 2) & 3]);
  const bottom = vt[(hi + 2) & 3].y;
  const y2 = Math.ceil((bottom > kYSize ? kYSize : bottom) - 1);
  const y1 = hiY < 0 ? 0 : Math.ceil(hiY);
  const clip = vt[(hi - 1) & 3].x < 0 || vt[(hi + 1) & 3].x >= kXSize;
  return { y1, y2, clip };
}

function drawSpriteRotated(sprite, dudx, dvdx, y, y2, clip, translucent) {
  const buf = screen.base;
  const data = sprite.data;
  const vMask = (sprite.ySize - 1) << 8;
  const vShift = 8 - sprite.log2xSize;
  const mask = data[0];
  for (; y < y2; y++) {
    let x = slopeX2[y] >> 16;
    let endX = slopeX1[y] >> 16;
    let u = slopeU[y];
    let v = slopeV[y];
    if (clip) {
      if (x >= kXSize) continue;
      if (endX < 0) continue;
      if (x < 0) {
        u -= dudx * x;
        v -= dvdx * x;
        x = 0;
      }
      if (endX >= kXSize) endX = kXSize - 1;
    }
    const row = y * kXSize;
    let dst = row + x;
    const endDst = row + endX;
    if (translucent) {
      while (dst < endDst) {
        const color = data[(u >> 8) + ((v & vMask) >> vShift)];
        if (color !== mask && color !== undefined) buf[dst] = BlendRGB16(color, buf[dst]);
        u += dudx;
        v += dvdx;
        dst++;
      }
    } else {
      while (dst < endDst) {
        const color = data[(u >> 8) + ((v & vMask) >> vShift)];
        if (color !== mask && color !== undefined) buf[dst] = color;
        u += dudx;
        v += dvdx;
        dst++;
      }
    }
  }
}

function drawSpriteInternal(id, cx, cy, dir, zoom, forceTranslucent) {
  const sprite = G.data.sprites[id - 128];
  if (!sprite) return;
  if (sprite.drawMode & kDrawModeDoubleSize) zoom *= 0.5;
  let dirCos = cos(dir);
  let dirSin = sin(dir);
  const dudx = toInt((dirCos * 256) / zoom);
  const dvdx = toInt((-dirSin * 256) / zoom);
  if (forceTranslucent && sprite.drawMode) return;
  dirCos *= zoom;
  dirSin *= zoom;
  const s = slopeInit(cx, cy, dirCos, dirSin, sprite, dudx, dvdx);
  if (!s) return;
  const translucent = forceTranslucent || (sprite.drawMode & kDrawModeTransparent) !== 0;
  drawSpriteRotated(sprite, dudx, dvdx, s.y1, s.y2, s.clip, translucent);
}

export function DrawSprite(id, cx, cy, dir, zoom) {
  drawSpriteInternal(id, cx, cy, dir, zoom, false);
}

export function DrawSpriteTranslucent(id, cx, cy, dir, zoom) {
  drawSpriteInternal(id, cx, cy, dir, zoom, true);
}

function getUniqueSpriteNum() {
  for (let i = kNumSprites; i < kNumSprites + kNumSpecialSprites; i++) if (!G.data.sprites[i]) return i;
  return 0;
}

// Returns [sprite, id] for a private, modifiable copy of sprite id.
function uniqueSprite(id) {
  const sprites = G.data.sprites;
  if (id - 128 < kNumSprites) {
    const src = sprites[id - 128];
    if (!src) return null;
    const newID = getUniqueSpriteNum();
    if (!newID) return null;
    sprites[newID] = { ...src, data: src.data.slice() };
    return [sprites[newID], newID + 128];
  }
  const s = sprites[id - 128];
  return s ? [s, id] : null;
}

function shadePixel(data, idx, srcIdx, mask, shade) {
  const pv = data[srcIdx];
  if (pv !== mask && pv !== undefined && idx >= 0 && idx < data.length) data[idx] = ShadeRGB16(shade, pv);
}

function setPixel(data, idx, value) {
  if (idx >= 0 && idx < data.length) data[idx] = value;
}

// Generic crunch along one axis. step is the pixel stride along the crunched axis,
// lineStep the stride between successive lines.
function distort(sprite, start, lines, length, step, lineStep, dir, damage) {
  const data = sprite.data;
  const mask = data[0];
  let lineStart = start;
  if (damage > 2) damage = 2;
  for (let line = 0; line < lines; line++) {
    const c = line / lines;
    const crunch = (-c * c + c) * (1 + RanFl(-0.5, 0.5)) * length * damage;
    if (crunch) {
      const crunchFactor = length / (length - crunch);
      const invCrunchFac = 1 / crunchFactor;
      const maxShade = (kLightValues - 1) * (1 - invCrunchFac);
      const crunchLength = length - crunch;
      const icrunch = Math.trunc(crunch);
      if (!dir) {
        for (let i = length; i > icrunch; i--) {
          const shade = toInt(kLightValues - 1 - maxShade * ((length - i) / crunchLength));
          shadePixel(data, lineStart + i * step, lineStart + toInt(length - (length - i) * crunchFactor) * step, mask, shade);
        }
        for (let i = 0; i <= icrunch; i++) setPixel(data, lineStart + i * step, mask);
      } else {
        for (let i = 0; i < length - icrunch; i++) {
          const shade = toInt(kLightValues - 1 - maxShade * (i / crunchLength));
          shadePixel(data, lineStart + i * step, lineStart + toInt(i * crunchFactor) * step, mask, shade);
        }
        for (let i = length; i >= length - icrunch; i--) setPixel(data, lineStart + i * step, mask);
      }
    }
    lineStart += lineStep;
  }
}

function clipDistortRect(sprite, startA, endA, startB, endB, sizeA, sizeB) {
  if (sprite.drawMode & kDrawModeDoubleSize) {
    startA *= 2;
    endA *= 2;
    startB *= 2;
    endB *= 2;
  }
  endA -= startA;
  endB -= startB;
  startB += (sizeB / 2) | 0;
  startA += (sizeA / 2) | 0;
  if (startB < 0) {
    endB += startB;
    startB = 0;
  }
  if (startA < 0) {
    endA += startA;
    startA = 0;
  }
  if (startB + endB >= sizeB) endB -= startB + endB + 1 - sizeB;
  if (startA + endA >= sizeA) endA -= startA + endA + 1 - sizeA;
  return [startA, endA, startB, endB];
}

// Crunches pixels horizontally (x) over a range of rows (y).
export function XDistortSprite(id, startY, endY, startX, endX, dir, damage) {
  const u = uniqueSprite(id);
  if (!u) return id;
  const [sprite, newId] = u;
  const [sy, ey, sx, ex] = clipDistortRect(sprite, Math.trunc(startY), Math.trunc(endY), Math.trunc(startX), Math.trunc(endX), sprite.ySize, sprite.xSize);
  distort(sprite, sprite.xSize * sy + sx, ey, ex, 1, sprite.xSize, dir, damage);
  return newId;
}

// Crunches pixels vertically (y) over a range of columns (x).
export function YDistortSprite(id, startX, endX, startY, endY, dir, damage) {
  const u = uniqueSprite(id);
  if (!u) return id;
  const [sprite, newId] = u;
  const [sx, ex, sy, ey] = clipDistortRect(sprite, Math.trunc(startX), Math.trunc(endX), Math.trunc(startY), Math.trunc(endY), sprite.xSize, sprite.ySize);
  distort(sprite, sprite.xSize * sy + sx, ex, ey, sprite.xSize, 1, dir, damage);
  return newId;
}

export function SpriteUnused(id) {
  if (id - 128 >= kNumSprites && G.data.sprites[id - 128]) G.data.sprites[id - 128] = null;
}

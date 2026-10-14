// Zoomed scanline road/terrain renderer (roaddraw.c, 16-bit path).

import { G, kXSize, kYSize } from './state.js';
import { screen } from './screen.js';

// Float to C SInt16 (truncate, wrap).
const toS16 = (v) => ((v | 0) << 16) >> 16;

function drawLineZoomed(buf, dp, xDrawStart, x1, x2, y, xDrift, yDrift, data, zoom) {
  if (x1 < 0) x1 = 0;
  if (x2 > kXSize) x2 = kXSize;
  if (x2 < x1) return dp;
  const v = ((-y + yDrift) & 0x7f) << 7;
  let u = (((x1 * zoom + xDrawStart + xDrift) | 0) & 0x7f) << 8;
  const dudx = (zoom * 256) | 0;
  for (let n = x2 - x1; n > 0; n--) {
    buf[dp++] = data[v + ((u >> 8) & 0x7f)];
    u += dudx;
  }
  return dp;
}

function drawBorderZoomed(buf, dp, x1, x2, y, data, zoom) {
  const v = (-y & 0x7f) << 4;
  let u = 0;
  if (x2 < 0) return dp;
  if (x1 < 0) {
    u = Math.trunc(-x1 * 256 * zoom);
    x1 = 0;
  }
  if (x2 > kXSize) x2 = kXSize;
  if (x2 < x1) return dp;
  const dudx = (zoom * 256) | 0;
  for (let n = x2 - x1; n > 0; n--) {
    buf[dp++] = data[v + (u >> 8)];
    u += dudx;
  }
  return dp;
}

function drawBorderLineZoomed(buf, dp, xDrawStart, x1, x2, y, data, leftBorder, rightBorder, zoom) {
  let leftBordEnd = Math.trunc(x1 + 16 / zoom);
  let rightBordEnd = Math.trunc(x2 - 16 / zoom);
  if (leftBordEnd > rightBordEnd) {
    leftBordEnd = x1 + ((x2 - x1) >> 1);
    rightBordEnd = leftBordEnd;
  }
  dp = drawBorderZoomed(buf, dp, x1, leftBordEnd, y, leftBorder, zoom);
  dp = drawLineZoomed(buf, dp, xDrawStart, leftBordEnd, rightBordEnd, y, Math.trunc(G.xDriftPos), Math.trunc(G.yDriftPos), data, zoom);
  return drawBorderZoomed(buf, dp, rightBordEnd, x2, y, rightBorder, zoom);
}

const kMinX = -2147483648;
const kMaxX = 0x7fffffff;

export function DrawRoadZoomed16(xDrawStart, yDrawStart, zoom) {
  const buf = screen.base;
  const invZoom = 1 / zoom;
  const ri = G.roadInfo;
  const backgrTex = G.data.texture(ri.backgroundTex);
  const roadTex = G.data.texture(ri.foregroundTex);
  const leftBorder = G.data.texture(ri.roadLeftBorder);
  const rightBorder = G.data.texture(ri.roadRightBorder);
  const road = G.roadData;
  const maxLine = G.roadLength - 1;
  const xStart = Math.trunc(xDrawStart);
  const xFront = Math.trunc(G.xFrontDriftPos);
  const yFront = Math.trunc(G.yFrontDriftPos);
  for (let screenY = 0; screenY < kYSize; screenY++) {
    let worldY = yDrawStart - screenY * zoom;
    if (worldY < 0) worldY = 0;
    else if (worldY > G.roadLength * 2) worldY = G.roadLength * 2;
    const ceilRoadLine = Math.ceil(worldY * 0.5);
    const floorRoadLine = Math.floor(worldY * 0.5);
    let floorPerc = ceilRoadLine - worldY * 0.5;
    const c = Math.min(ceilRoadLine, maxLine) * 4;
    const f = Math.min(floorRoadLine, maxLine) * 4;
    const ceilSplit = road[c + 1] !== road[c + 2];
    const floorSplit = road[f + 1] !== road[f + 2];
    if (ceilSplit !== floorSplit) floorPerc = ceilSplit ? 1 : 0;
    else if (ceilSplit && floorSplit) {
      if (road[c + 3] < road[f + 2] || road[c + 2] > road[f + 3]) floorPerc = 1;
    }
    const r0 = toS16((floorPerc * road[f] + (1 - floorPerc) * road[c] - xDrawStart) * invZoom);
    const r1 = toS16((floorPerc * road[f + 1] + (1 - floorPerc) * road[c + 1] - xDrawStart) * invZoom);
    const r2 = toS16((floorPerc * road[f + 2] + (1 - floorPerc) * road[c + 2] - xDrawStart) * invZoom);
    const r3 = toS16((floorPerc * road[f + 3] + (1 - floorPerc) * road[c + 3] - xDrawStart) * invZoom);
    const y = Math.trunc(worldY);
    let dp = screenY * kXSize;
    dp = drawBorderLineZoomed(buf, dp, xStart, kMinX, r0, y, backgrTex, leftBorder, rightBorder, zoom);
    dp = drawLineZoomed(buf, dp, xStart, r0, r1, y, xFront, yFront, roadTex, zoom);
    dp = drawBorderLineZoomed(buf, dp, xStart, r1, r2, y, backgrTex, leftBorder, rightBorder, zoom);
    dp = drawLineZoomed(buf, dp, xStart, r2, r3, y, xFront, yFront, roadTex, zoom);
    drawBorderLineZoomed(buf, dp, xStart, r3, kMaxX, y, backgrTex, leftBorder, rightBorder, zoom);
  }
}

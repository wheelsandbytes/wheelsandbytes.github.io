// Frame rendering (renderframe.c, 16-bit path): camera, lane marks, tyre tracks, sprite layers,
// HUD panel and the level-complete tally.

import { G, kXSize, kYSize, kCalcFPS, kFrameDuration, kScale, kNumLayers, kInvLines, kObjectFloating } from './state.js';
import { screen, Blit2Screen } from './screen.js';
import { DrawRoadZoomed16 } from './roaddraw.js';
import { DrawSprite, DrawSpriteTranslucent, toInt } from './sprites.js';
import { DrawRLE, DrawRLEYClip } from './rle.js';
import { DrawTextFXZoomed, SimpleDrawText, MakeFXStringFromNumStr } from './textfx.js';
import { DrawParticleFXZoomed } from './particlefx.js';
import { sin, cos, PI } from './trig.js';
import { VEC2D_Value, VEC2D_DotProduct, VEC2D_Difference, VEC2D_Scale, P2D } from './vec2d.js';
import { SimplePlaySound } from './sound.js';
import { PauseFrameCount, ResumeFrameCount } from './gameframe.js';
import { DisposeLevel, LoadLevel } from './gameinitexit.js';
import { savePrefs } from './preferences.js';

const kXCameraScreenPos = 0.5;
const kYCameraScreenPos = 0.55;
const kPanelHeight = 121;
const kMaxDisplayVelo = 89.408;
const kZoomVeloFactor = 50;
const kTrackSize = 3.4;
const kTrackLifeTime = 14.0 * kCalcFPS;
const kTrackDeathDuration = 0.8 * kCalcFPS;

const kDigitOffs = 18;
const kTimeDecimalOffs = kDigitOffs + 3;
const kTimeMinuteOffs = -2 * kDigitOffs - 5;
const kScoreX = 610;
const kScoreY = 51;
const kLiveX = 613;
const kLiveY = 76;
const kTimeX = 586;
const kTimeY = 26;
const kAddOnX = 292;
const kAddOnY = 25;

const kComplYSize = 370;
const kTimeTakeX = 302;
const kTimeTakeY = 204;
const kTimeBestX = 302;
const kTimeBestY = 233;
const kTimeLeftX = 438;
const kTimeLeftY = 282;
const kTimeBonusX = 459;
const kTimeBonusY = 311;
const kTimeBonus2X = 459;
const kTimeBonus2Y = 342;

const kScrollComplDelay = 1.5;
const kShowComplDelay = 4;
const kShowBestTimeDelay = 6;
const kShowBonusTimeDelay = 8;
const kStartBonusDelay = 10;
const kCountBonusSpeed = 0.1;
const kCountNoiseSpeed = 0.1;
const kMultiplyDelay = 1;
const kCloseDelay = 3.5;

const kMaxMarkLength = 128;

let gBonusCount = 0;
let gNoBonusScore = 0;

function DrawNum(h, v, num, digits) {
  num = Math.trunc(num);
  for (let i = 0; i < digits; i++) {
    const p = Math.pow(10, i);
    const d = Math.trunc(num / p);
    if (d || !i) DrawRLE(h, v, 128 + (d % 10));
    h -= kDigitOffs;
  }
}

function DrawNumZeroed(h, v, num, digits) {
  num = Math.trunc(num);
  for (let i = 0; i < digits; i++) {
    DrawRLE(h, v, 128 + (Math.trunc(num / Math.pow(10, i)) % 10));
    h -= kDigitOffs;
  }
}

async function DrawComplCount() {
  const ld = G.levelData;
  const timeDiff = ld.time - G.gameTime > 0 ? ld.time - G.gameTime : 0;
  const countTime = timeDiff * kCountBonusSpeed;
  const bonus = Math.trunc(timeDiff * 10);
  const fd = G.finishDelay;
  if (fd >= kShowComplDelay) DrawRLE(0, kYSize / 2 - kComplYSize / 2, 149);
  else if (fd >= kScrollComplDelay) {
    const yPos = Math.trunc((kYSize / 2 + kComplYSize / 2) * Math.sqrt((fd - kScrollComplDelay) / (kShowComplDelay - kScrollComplDelay)) - kComplYSize);
    DrawRLEYClip(0, yPos, 149);
    gNoBonusScore = G.playerScore;
    gBonusCount = 0;
  }
  if (fd >= kShowBestTimeDelay) {
    const laps = G.prefs.lapRecords;
    if (laps[G.levelID] > G.gameTime) {
      laps[G.levelID] = G.gameTime;
      savePrefs();
      SimplePlaySound(155);
    }
    const lap = laps[G.levelID];
    DrawNum(kTimeBestX + kTimeMinuteOffs, kTimeBestY, Math.floor(lap) / 60, 2);
    DrawNumZeroed(kTimeBestX, kTimeBestY, Math.floor(lap) % 60, 2);
    DrawNum(kTimeBestX + kTimeDecimalOffs, kTimeBestY, Math.floor(lap * 10), 1);
    DrawNum(kTimeTakeX + kTimeMinuteOffs, kTimeTakeY, Math.floor(G.gameTime) / 60, 2);
    DrawNumZeroed(kTimeTakeX, kTimeTakeY, Math.floor(G.gameTime) % 60, 2);
    DrawNum(kTimeTakeX + kTimeDecimalOffs, kTimeTakeY, Math.floor(G.gameTime * 10) % 10, 1);
  }
  if (fd >= kStartBonusDelay) {
    let bonusPerc = (fd - kStartBonusDelay) / countTime;
    if (bonusPerc > 1) bonusPerc = 1;
    if (bonus * bonusPerc * kCountNoiseSpeed > gBonusCount) {
      gBonusCount++;
      SimplePlaySound(148);
    }
    const left = timeDiff - timeDiff * bonusPerc;
    DrawNum(kTimeLeftX + kTimeMinuteOffs, kTimeLeftY, Math.floor(left) / 60, 2);
    DrawNumZeroed(kTimeLeftX, kTimeLeftY, Math.floor(left) % 60, 2);
    DrawNum(kTimeLeftX + kTimeDecimalOffs, kTimeLeftY, Math.floor(left * 10), 1);
    DrawNum(kTimeBonusX, kTimeBonusY, bonus * bonusPerc, 5);
    G.playerScore = Math.trunc(gNoBonusScore + bonus * bonusPerc);
  } else if (fd >= kShowBonusTimeDelay) {
    DrawNum(kTimeLeftX + kTimeMinuteOffs, kTimeLeftY, Math.floor(timeDiff) / 60, 2);
    DrawNumZeroed(kTimeLeftX, kTimeLeftY, Math.floor(timeDiff) % 60, 2);
    DrawNum(kTimeLeftX + kTimeDecimalOffs, kTimeLeftY, Math.floor(timeDiff * 10), 1);
    DrawNum(kTimeBonusX, kTimeBonusY, 0, 5);
  }
  if (fd >= kStartBonusDelay + countTime + kMultiplyDelay && G.playerBonus !== 1) {
    if (gBonusCount !== 32767) {
      SimplePlaySound(141);
      gBonusCount = 32767;
    }
    DrawRLE(kTimeBonus2X - 5 * kDigitOffs, kTimeBonus2Y, 137 + G.playerBonus);
    DrawNum(kTimeBonus2X, kTimeBonus2Y, bonus * G.playerBonus, 5);
  }
  if (fd >= kStartBonusDelay + countTime + kCloseDelay) {
    G.playerScore = gNoBonusScore + bonus * G.playerBonus;
    DisposeLevel();
    G.levelID++;
    return LoadLevel();
  }
  return true;
}

function DrawDisplays() {
  const cam = G.cameraObj;
  const timeDisp = G.levelData.time - G.gameTime > 0 ? G.levelData.time - G.gameTime : 0;
  let veloDisplay;
  if (!cam.jumpHeight) veloDisplay = -PI / 2 + (VEC2D_DotProduct(cam.velo, P2D(sin(cam.dir), cos(cam.dir))) * PI) / kMaxDisplayVelo;
  else veloDisplay = -PI / 2 + cam.input.throttle * PI;
  DrawRLE(0, kYSize - kPanelHeight, 148);
  DrawSprite(189, 148, kYSize - 14, veloDisplay, 1);
  DrawNum(kScoreX, kYSize - kScoreY, G.displayScore, 6);
  DrawNum(kLiveX, kYSize - kLiveY, G.playerLives, 2);
  DrawNum(kTimeX + kTimeMinuteOffs, kYSize - kTimeY, Math.floor(timeDisp) / 60, 2);
  DrawNumZeroed(kTimeX, kYSize - kTimeY, Math.floor(timeDisp) % 60, 2);
  DrawNum(kTimeX + kTimeDecimalOffs, kYSize - kTimeY, Math.floor(timeDisp * 10), 1);
  for (let i = 0; i < 6; i++) if (G.playerAddOns & (1 << i)) DrawRLE(kAddOnX + 20 * i, kYSize - kAddOnY, 142 + i);
  if (G.playerBonus !== 1) DrawRLE(kAddOnX + 6 * 20, kYSize - kAddOnY, 137 + G.playerBonus);
  if (G.numMissiles) {
    DrawRLE(kXSize - 120, 5, 154);
    SimpleDrawText(MakeFXStringFromNumStr(G.numMissiles), kXSize - 60, 5);
  }
  if (G.numMines) {
    DrawRLE(kXSize - 120, G.numMissiles ? 30 : 5, 155);
    SimpleDrawText(MakeFXStringFromNumStr(G.numMines), kXSize - 60, G.numMissiles ? 30 : 5);
  }
}

async function DrawPanel() {
  if (G.playerLives) {
    if (G.finishDelay) return DrawComplCount();
    else if (G.playerDeathDelay) DrawRLE(0, kYSize - kPanelHeight, 150);
    else DrawDisplays();
  }
  return true;
}

function drawTextureBlock(buf, x, y, size, zoom, u, v, texture, texOff) {
  let dst = y * kXSize + x;
  for (let line = 0; line < size; line++) {
    const row = texOff + ((v >> 9) & 0x3f80);
    for (let pix = 0; pix < size; pix++) {
      u = (u + zoom) | 0;
      buf[dst++] = texture[row + ((u >> 16) & 0x7f)];
    }
    v = (v + zoom) | 0;
    dst += kXSize - size;
  }
}

function drawTextureBlockClipped(buf, x, y, size, zoom, u, v, texture, texOff) {
  let xSize = size;
  let ySize = size;
  if (x < 0) {
    xSize += x;
    x = 0;
  }
  if (y < 0) {
    ySize += y;
    y = 0;
  }
  if (x + size > kXSize) xSize += kXSize - x - size;
  if (y + size > kYSize) ySize += kYSize - y - size;
  let dst = y * kXSize + x;
  for (let line = 0; line < ySize; line++) {
    const row = texOff + ((v >> 9) & 0x3f80);
    for (let pix = 0; pix < xSize; pix++) {
      u = (u + zoom) | 0;
      buf[dst++] = texture[row + ((u >> 16) & 0x7f)];
    }
    v = (v + zoom) | 0;
    dst += kXSize - xSize;
  }
}

// Shared by marks and tracks: draws a segment p1->p2 as a run of textured square blocks.
function drawSegment(buf, seg, xDrawStart, yDrawStart, invZoom, size, fixZoom, texture, texOff) {
  let x2 = (seg.p2.x - xDrawStart) * invZoom - ((size / 2) | 0);
  let x1 = (seg.p1.x - xDrawStart) * invZoom - ((size / 2) | 0);
  if (!((x1 > -size || x2 > -size) && (x1 < kXSize || x2 < kXSize))) return;
  const y1 = (yDrawStart - seg.p1.y) * invZoom - ((size / 2) | 0);
  const y2 = (yDrawStart - seg.p2.y) * invZoom - ((size / 2) | 0);
  const v1 = toInt(seg.p1.y) << 16;
  const u1 = toInt(seg.p1.x) << 16;
  const u2 = toInt(seg.p2.x) << 16;
  const dy = toInt(y2 - y1);
  if (dy) {
    const dxdy = toInt(((x2 - x1) / (y2 - y1)) * 65536.0);
    const dudy = toInt((u2 - u1) / (y2 - y1));
    let x = toInt(x1 * 65536.0);
    let u = u1;
    let v = v1;
    let numBlocks = toInt(Math.ceil(Math.abs((x2 - x1) / (y2 - y1)) - size));
    if (numBlocks < 0) numBlocks = 0;
    numBlocks++;
    for (let y = toInt(y1); y < y2; y++) {
      let blockU = u;
      let blockX = x >> 16;
      for (let i = 0; i < numBlocks; i++) {
        if (blockX >= 0 && blockX < kXSize - size && y >= 0 && y < kYSize - size) drawTextureBlock(buf, blockX, y, size, fixZoom, blockU, v, texture, texOff);
        else drawTextureBlockClipped(buf, blockX, y, size, fixZoom, blockU, v, texture, texOff);
        blockU = (blockU + fixZoom) | 0;
        blockX++;
      }
      x = (x + dxdy) | 0;
      u = (u + dudy) | 0;
      v = (v + fixZoom) | 0;
    }
  } else {
    const yi = Math.trunc(y1);
    if (x2 < 0) x2 = 0;
    if (x1 > kXSize - size) x1 = kXSize - size;
    if (x1 < x2) {
      let u = u1;
      if (x1 < 0) x1 = 0;
      if (x2 > kXSize - size) x2 = kXSize - size;
      for (let x = Math.trunc(x1); x < x2; x++) {
        u = (u + fixZoom) | 0;
        drawTextureBlockClipped(buf, x, yi, size, fixZoom, u, v1, texture, texOff);
      }
    } else {
      let u = u2;
      if (x2 < 0) x2 = 0;
      if (x1 > kXSize - size) x1 = kXSize - size;
      for (let x = Math.trunc(x2); x < x1; x++) {
        u = (u + fixZoom) | 0;
        drawTextureBlockClipped(buf, x, yi, size, fixZoom, u, v1, texture, texOff);
      }
    }
  }
}

function DrawTracksZoomed16(xDrawStart, yDrawStart, zoom) {
  const buf = screen.base;
  const invZoom = 1 / zoom;
  const fixZoom = toInt(zoom * 65536.0);
  const size = toInt(kTrackSize * invZoom);
  const y1Clip = toInt(yDrawStart - (kYSize - (G.finishDelay ? 0 : kInvLines)) * zoom);
  const textures = G.data.texture(G.roadInfo.tracks);
  for (let i = 0; i < G.trackCount; i++) {
    const t = G.tracks[i];
    if (t.p2.y <= yDrawStart + size && t.p1.y > y1Clip && t.time + kTrackLifeTime + kTrackDeathDuration > G.frameCount) {
      const fade = t.time + kTrackLifeTime > G.frameCount ? 1 : 1 - (G.frameCount - t.time - kTrackLifeTime) / kTrackDeathDuration;
      const intensity = t.intensity * 3 * fade;
      drawSegment(buf, t, xDrawStart, yDrawStart, invZoom, size, fixZoom, textures, toInt(intensity) * 128 * 128);
    }
  }
}

function DrawMarksZoomed16(xDrawStart, yDrawStart, zoom) {
  const buf = screen.base;
  const invZoom = 1 / zoom;
  const fixZoom = toInt(zoom * 65536.0);
  const size = toInt(4.2 * invZoom);
  const y1Clip = toInt(yDrawStart - (kYSize - (G.finishDelay ? 0 : kInvLines)) * zoom);
  const texture = G.data.texture(G.roadInfo.marks);
  const marks = G.marks;
  let l = 0;
  let r = G.markSize;
  while (r - 1 > l) {
    const m = (l + r) >> 1;
    if (marks[m].p1.y + marks[m].p2.y > yDrawStart * 2 + kMaxMarkLength) l = m;
    else r = m;
  }
  for (let i = l; i < G.markSize && marks[i].p1.y + marks[i].p2.y > y1Clip * 2 - kMaxMarkLength; i++) {
    const mk = marks[i];
    if (mk.p2.y <= yDrawStart + size && mk.p1.y > y1Clip) drawSegment(buf, mk, xDrawStart, yDrawStart, invZoom, size, fixZoom, texture, 0);
  }
}

function DrawSpriteLayerZoomed(xDrawStart, yDrawStart, zoom, tide, layer, blur) {
  const invZoom = 1 / zoom;
  const maxDrawOffs = 128 * invZoom;
  for (let o = G.firstVisObj; o !== G.lastVisObj; o = o.next) {
    if (o.layer !== layer || !o.frame || o.jumpHeight) continue;
    const x = (o.pos.x - xDrawStart) * invZoom;
    const y = (yDrawStart - o.pos.y) * invZoom;
    if (y > -maxDrawOffs && y < kYSize + maxDrawOffs) {
      const objTide = G.roadInfo.water && o.type.flags2 & kObjectFloating ? 1 + tide * 0.5 + tide * VEC2D_Value(o.velo) * 0.04 : 1;
      DrawSprite(o.frame, x, y, o.dir, objTide * invZoom);
      if (blur) {
        const velDiff = VEC2D_Difference(G.cameraObj.velo, o.velo);
        if (velDiff.x * velDiff.x + velDiff.y * velDiff.y > 35 * 35) {
          const fuzzPos = VEC2D_Scale(velDiff, kFrameDuration * kScale * 0.2);
          DrawSpriteTranslucent(o.frame, x + fuzzPos.x, y + fuzzPos.y, o.dir - o.rotVelo * kFrameDuration, objTide * invZoom);
        }
      }
    }
  }
}

function DrawSpritesZoomed(xDrawStart, yDrawStart, zoom) {
  const invZoom = 1 / zoom;
  const tide = 0.05 * sin(G.gameTime * 2.6);
  for (let layer = 0; layer < kNumLayers; layer++) DrawSpriteLayerZoomed(xDrawStart, yDrawStart, zoom, tide, layer, G.prefs.motionBlur);
  for (let o = G.firstVisObj; o !== G.lastVisObj; o = o.next) {
    if (o.frame && o.jumpHeight) {
      const x = (o.pos.x - xDrawStart) * invZoom;
      const y = (yDrawStart - o.pos.y) * invZoom;
      if (y > -256 && y < kYSize + 256) DrawSprite(o.frame, x, y, o.dir, (o.jumpHeight * 0.18 + 1) * invZoom);
    }
  }
}

export async function RenderFrame() {
  const cam = G.cameraObj;
  const zoom = 0.5 + G.zoomVelo / kZoomVeloFactor + cam.jumpHeight * 0.05;
  const xDrawStart = cam.pos.x - kXSize * kXCameraScreenPos * zoom;
  let yDrawStart = cam.pos.y + kYSize * kYCameraScreenPos * zoom;
  const preSpecBlit = G.screenBlitSpecial;
  if (G.finishDelay) yDrawStart = G.levelData.levelEnd + kYSize * kYCameraScreenPos * zoom;
  screen.base = screen.back;
  DrawRoadZoomed16(xDrawStart, yDrawStart, zoom);
  DrawMarksZoomed16(xDrawStart, yDrawStart, zoom);
  DrawTracksZoomed16(xDrawStart, yDrawStart, zoom);
  DrawParticleFXZoomed(xDrawStart, yDrawStart, zoom, 0);
  DrawSpritesZoomed(xDrawStart, yDrawStart, zoom);
  DrawParticleFXZoomed(xDrawStart, yDrawStart, zoom, 1);
  DrawTextFXZoomed(xDrawStart, yDrawStart, zoom);
  if (await DrawPanel()) {
    if (preSpecBlit !== G.screenBlitSpecial) await RenderFrame();
    else await Blit2Screen(PauseFrameCount, ResumeFrameCount);
  }
}

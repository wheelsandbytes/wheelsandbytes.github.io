// Fixed 60 Hz game loop and per-frame player handling (gameframe.c).

import {
  G, kCalcFPS, kFrameDuration, kMaxZoomVelo, kObjectCop, kObjectDriveUp, kNormalPlayerBoatID, kAddOnSpikes,
} from './state.js';
import { GetMSTime, nextFrame } from './screen.js';
import { sin, cos } from './trig.js';
import { VEC2D_Value, VEC2D_DotProduct, P2D } from './vec2d.js';
import { MoveObjects, NewObject, KillObject, FireWeapon, GetUniquePos, trackPoint } from './objects.js';
import { RenderFrame } from './renderframe.js';
import { SetCarSound, SimplePlaySound } from './sound.js';
import { NewTextEffect, kEffectSinLines, kEffectMoveDown, kEffectMoveUp, kEffectExplode } from './textfx.js';
import { EndGame } from './gameinitexit.js';
import { PauseGame } from './interface.js';

const kCalcFPMS = kCalcFPS / 1000000;
const kDisplayScoreIncr = 360;
const kZoomAcceleration = 80.0;
const kExtraLiveScore = 5000;
const kPenaltyTime = 0;
const kMinCopDist = 1200;
// If the simulation falls this many frames behind real time (e.g. the tab was hidden), resync.
const kMaxCatchUpFrames = 30;

export function InitFrameCount() {
  G.frameCount = 0;
  G.startMS = GetMSTime();
}

export function PauseFrameCount() {
  G.pauseMS = GetMSTime();
}

export function ResumeFrameCount() {
  G.startMS += GetMSTime() - G.pauseMS;
}

const optFrameCount = () => Math.trunc((GetMSTime() - G.startMS) * kCalcFPMS);

function CheckFrameTime() {
  const opt = optFrameCount();
  if (opt - G.frameCount > kMaxCatchUpFrames) G.startMS = GetMSTime() - (G.frameCount - 1) / kCalcFPMS;
  return G.frameCount > optFrameCount();
}

async function CheckTimeSkip() {
  while (G.frameCount > optFrameCount()) await nextFrame();
}

export function CopClear() {
  for (let o = G.firstObj.next; o !== G.firstObj; o = o.next) {
    if (!(o.type.flags & kObjectCop)) continue;
    for (let tries = 0; Math.abs(o.pos.y - G.playerObj.pos.y) < kMinCopDist && tries < 1000; tries++) {
      const u = GetUniquePos(20, 200, -1);
      o.pos = u.pos;
      o.dir = u.objDir;
      o.control = u.dir;
    }
  }
}

function ResurrectPlayer() {
  const up = G.trackUp;
  let i;
  for (i = 0; i < up.num && up.track[i].y < G.playerObj.pos.y; i++);
  G.playerObj = NewObject(G.firstObj, G.roadInfo.water ? kNormalPlayerBoatID : G.playerCarID);
  const p = G.playerObj;
  const prev = trackPoint(up, i - 1);
  p.pos.x = prev.x;
  p.pos.y = prev.y;
  p.control = kObjectDriveUp;
  if (p.pos.y >= 500) {
    p.target = i;
    const t = trackPoint(up, i);
    p.dir = p.pos.y - t.y ? Math.atan((p.pos.x - t.x) / (p.pos.y - t.y)) : 0;
  } else {
    p.pos.x = G.levelData.xStartPos;
    p.pos.y = 500;
    p.target = 1;
  }
  G.cameraObj = p;
  G.screenBlitSpecial = true;
  G.zoomVelo = kMaxZoomVelo;
  G.gameTime += kPenaltyTime;
  CopClear();
}

function PlayerHandling() {
  const cam = G.cameraObj;
  const ri = G.roadInfo;
  if (G.playerDeathDelay) {
    G.playerDeathDelay -= kFrameDuration;
    if (G.playerDeathDelay <= 0) {
      G.playerDeathDelay = 0;
      if (G.playerLives) ResurrectPlayer();
      else G.endGame = true;
    }
    SetCarSound(-1, 0, 0, 0);
  } else {
    const engine = Math.abs(cam.throttle) + (ri.water ? cam.input.brake : 0);
    if (!cam.jumpHeight) {
      SetCarSound(engine, (G.playerSlide[0] + G.playerSlide[2]) * 0.5, (G.playerSlide[1] + G.playerSlide[3]) * 0.5, VEC2D_DotProduct(cam.velo, P2D(sin(cam.dir), cos(cam.dir))));
    } else {
      SetCarSound(engine, 0, 0, Math.abs(cam.input.throttle) * 71);
    }
    if (!G.playerObj.jumpHeight) {
      if (G.fire && G.numMines) {
        FireWeapon(G.playerObj, ri.water ? 254 : 206);
        G.numMines--;
      }
      if (G.missile && G.numMissiles) {
        FireWeapon(G.playerObj, ri.water ? 221 : 162);
        G.numMissiles--;
      }
    }
  }
  // time handling
  if (G.finishDelay) G.finishDelay += kFrameDuration;
  else G.gameTime += kFrameDuration;
  const ld = G.levelData;
  if (!(G.frameCount % Math.trunc(kCalcFPS / 10))) {
    if (G.gameTime > ld.time && G.playerScore) G.playerScore -= 1;
    if (!(G.frameCount % kCalcFPS) && !G.finishDelay && G.gameTime >= ld.time - 10) {
      if (G.gameTime < ld.time) SimplePlaySound(144);
      if (Math.trunc(G.gameTime) === Math.trunc(ld.time)) {
        NewTextEffect(320, 240, kEffectSinLines + kEffectMoveDown, 'TIMEhUPee');
        SimplePlaySound(149);
      }
    }
  }
  // score handling
  if (G.displayScore < G.playerScore) {
    G.displayScore = Math.trunc(G.displayScore + kDisplayScoreIncr * kFrameDuration);
    if (G.displayScore > G.playerScore) G.displayScore = G.playerScore;
  }
  if (G.displayScore > G.playerScore) G.displayScore = G.playerScore;
  if (G.playerScore > (G.extraLives + 1) * kExtraLiveScore) {
    NewTextEffect(320, 240, kEffectSinLines + kEffectMoveUp, 'EXTRAhLIFEee');
    G.extraLives++;
    G.playerLives++;
    SimplePlaySound(154);
  }
  // finish detection
  if (G.cameraObj.pos.y < 320) G.cameraObj.pos.y = 320;
  if (G.playerObj.pos.y > ld.levelEnd && !G.playerDeathDelay) {
    NewTextEffect(320, 240, kEffectExplode, 'LEVELhCOMPLETED');
    if (!G.finishDelay) G.finishDelay = 0.001;
  }
  // background drift
  G.xDriftPos += ri.xDrift * kFrameDuration;
  G.yDriftPos += ri.yDrift * kFrameDuration;
  G.xFrontDriftPos += ri.xFrontDrift * kFrameDuration;
  G.yFrontDriftPos += ri.yFrontDrift * kFrameDuration;
  // camera distance
  const pv = VEC2D_Value(G.playerObj.velo);
  if (G.zoomVelo > pv) {
    G.zoomVelo -= kZoomAcceleration * kFrameDuration;
    if (G.zoomVelo < pv) G.zoomVelo = pv;
  } else {
    G.zoomVelo += kZoomAcceleration * kFrameDuration;
    if (G.zoomVelo > pv) G.zoomVelo = pv;
  }
  if (G.zoomVelo > kMaxZoomVelo) G.zoomVelo = kMaxZoomVelo;
  // spike handling
  G.spikeFrame += pv / 20;
  if (G.playerAddOns & kAddOnSpikes && !(G.playerDeathDelay !== 0) && !ri.water) {
    if (!G.spikeObj) G.spikeObj = NewObject(G.playerObj, 207);
    const s = G.spikeObj;
    s.pos = { x: G.playerObj.pos.x, y: G.playerObj.pos.y };
    s.dir = G.playerObj.dir;
    s.jumpHeight = G.playerObj.jumpHeight;
    s.frame = s.type.frame + (Math.trunc(G.spikeFrame) % s.type.numFrames);
  } else if (G.spikeObj) {
    KillObject(G.spikeObj);
    G.spikeObj = null;
  }
  // brake light handling
  if (G.brakeObj) {
    KillObject(G.brakeObj);
    G.brakeObj = null;
  }
  const inp = G.playerObj.input;
  if ((inp.brake || inp.reverse) && !ri.water && !(G.playerDeathDelay !== 0) && G.playerLives) {
    const b = NewObject(G.playerObj, 228);
    if (inp.reverse) b.frame = 394;
    if (!inp.brake) b.frame = 395;
    b.pos = { x: G.playerObj.pos.x, y: G.playerObj.pos.y };
    b.dir = G.playerObj.dir;
    b.jumpHeight = G.playerObj.jumpHeight;
    G.brakeObj = b;
  }
  // invincibility
  G.playerObj.damage = 0;
}

let framesSinceYield = 0;

export async function GameFrame() {
  MoveObjects();
  PlayerHandling();
  G.frameCount++;
  if (CheckFrameTime()) {
    await RenderFrame();
    G.graphFrameCount++;
    await CheckTimeSkip();
    framesSinceYield = 0;
  } else if (++framesSinceYield > kMaxCatchUpFrames) {
    framesSinceYield = 0;
    await nextFrame();
  }
  if (G.pauseRequested) {
    G.pauseRequested = false;
    await PauseGame();
  }
  if (G.endGame && G.gameOn) await EndGame();
}

// Game start/end and level loading (gameinitexit.c).

import { G, kNormalPlayerCarID, kNormalPlayerBoatID, kObjectDriveUp, kMaxZoomVelo } from './state.js';
import { screen, FadeScreen, ScreenClear, nextFrame, present, GetMSTime } from './screen.js';
import { newSentinel, NewObject, RemoveObject, InsertObjectGroup, SortObjects } from './objects.js';
import { SpriteUnused, DrawSprite } from './sprites.js';
import { ClearTextFX } from './textfx.js';
import { StartCarChannels, BeQuiet, SimplePlaySound } from './sound.js';
import { RenderFrame } from './renderframe.js';
import { InitFrameCount, CopClear } from './gameframe.js';
import { InputMode } from './input.js';
import { DisposeInterface, InitInterface, CheckHighScore, GameEndSequence, GetLevelNumber, setCursorVisible } from './interface.js';
import { RanInt, RanProb } from './random.js';
import { PI } from './trig.js';

export function NumLevels() {
  return G.data.packs.numLevels();
}

export async function LoadLevel() {
  G.firstObj = newSentinel();
  if (G.levelID >= NumLevels()) {
    await GameEndSequence();
    G.levelID = 0;
  }
  const level = G.data.level(G.levelID);
  G.levelData = level.levelData;
  G.marks = level.marks;
  G.markSize = level.markSize;
  G.roadInfo = G.data.roadInfo(G.levelData.roadInfo);
  G.trackUp = level.trackUp;
  G.trackDown = level.trackDown;
  G.roadLength = level.roadLength;
  G.roadData = level.roadData;

  for (const obj of level.objs) {
    const o = NewObject(G.firstObj, obj.typeRes);
    o.dir = obj.dir;
    o.pos.x = obj.x;
    o.pos.y = obj.y;
  }
  for (let i = 0; i < 9; i++) if (G.levelData.objGrps[i].resID) InsertObjectGroup(G.levelData.objGrps[i]);

  G.playerObj = NewObject(G.firstObj, G.roadInfo.water ? kNormalPlayerBoatID : G.playerCarID);
  G.playerObj.pos.x = G.levelData.xStartPos;
  G.playerObj.pos.y = 500;
  G.playerObj.control = kObjectDriveUp;
  G.playerObj.target = 1;
  G.cameraObj = G.playerObj;
  G.playerBonus = 1;
  G.spikeObj = null;
  G.brakeObj = null;
  CopClear();
  SortObjects();

  G.gameTime = 0;
  G.trackCount = 0;
  G.playerDeathDelay = 0;
  G.finishDelay = 0;
  G.playerBonus = 1;
  G.displayScore = G.playerScore;
  G.xDriftPos = 0;
  G.yDriftPos = 0;
  G.xFrontDriftPos = 0;
  G.yFrontDriftPos = 0;
  G.zoomVelo = kMaxZoomVelo;
  ClearTextFX();
  StartCarChannels();
  G.screenBlitSpecial = true;
  return true;
}

export function DisposeLevel() {
  G.playerObj = null;
  while (G.firstObj.next !== G.firstObj) {
    SpriteUnused(G.firstObj.next.frame);
    RemoveObject(G.firstObj.next);
  }
}

export async function StartGame(lcheat) {
  DisposeInterface();
  G.playerLives = 3;
  G.extraLives = 0;
  G.playerAddOns = 0;
  G.playerDeathDelay = 0;
  G.finishDelay = 0;
  G.playerScore = 0;
  G.levelID = 0;
  G.playerCarID = kNormalPlayerCarID;
  G.numMissiles = 0;
  G.numMines = 0;
  G.gameOn = true;
  G.endGame = false;
  G.pauseRequested = false;
  if (lcheat) await GetLevelNumber();
  G.lCheat = lcheat;
  await FadeScreen(1);
  setCursorVisible(false);
  InputMode();
  if (await LoadLevel()) {
    ScreenClear();
    await FadeScreen(512);
    await RenderFrame();
    InitFrameCount();
  }
}

// screenfx.c GameOverAnim: sprite 265 spins or flies in, drawn straight onto the visible screen.
const kGameOverSprite = 265;
const kFadeStart = 1.4;
const kAnimDuration = 2.1;
// The original redrew as fast as the CPU allowed, leaving a dense trail; draw several steps per frame.
const kGameOverStepsPerFrame = 8;

async function GameOverAnim() {
  const type = RanInt(0, 2);
  const side = RanProb(0.5);
  screen.base = screen.front;
  const animStart = GetMSTime();
  let lastT = 0;
  let t;
  do {
    t = (GetMSTime() - animStart) / 1000000.0;
    for (let s = 1; s <= kGameOverStepsPerFrame; s++) {
      const st = lastT + ((t - lastT) * s) / kGameOverStepsPerFrame;
      const size = st * st;
      let yPos;
      let dir = 0;
      if (type === 0) {
        yPos = 240;
        dir = (side ? 1 : -1) * 2 * PI * st;
      } else if (side) yPos = 240 * (4.0 / 3.0) * (1.0 / (-st - 1.0) + 1.0);
      else yPos = 480 - 240 * (4.0 / 3.0) * (1.0 / (-st - 1.0) + 1.0);
      DrawSprite(kGameOverSprite, 320, yPos, dir, size);
    }
    lastT = t;
    present();
    if (t > kFadeStart) await FadeScreen(256 - ((t - kFadeStart) / (kAnimDuration - kFadeStart)) * 256 + 256);
    await nextFrame();
  } while (t < kAnimDuration);
  screen.base = screen.back;
  ScreenClear();
  await FadeScreen(512);
}

export async function EndGame() {
  G.playerLives = 0; // so RenderFrame will not draw the panel
  await RenderFrame();
  DisposeLevel();
  BeQuiet();
  SimplePlaySound(152);
  await GameOverAnim();
  await InitInterface();
  setCursorVisible(true);
  if (!G.lCheat) await CheckHighScore(G.playerScore);
}

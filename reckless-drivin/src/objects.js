// Object list, spawning, death, motion integration and animation (objects.c).
// Objects form a circular doubly linked list with a sentinel (G.firstObj), kept sorted by pos.y.

import {
  G, newInputData, kXSize, kYSize, kVisDist, kScale, kFrameDuration, kMinCarDist, kLowCalcRatio,
  kObjectNoInput, kObjectDriveUp, kObjectDriveDown, kObjectCrossRoad,
  kObjectRandomFrameFlag, kObjectRoadKill, kObjectHeliFlag, kObjectDefaultDeath, kObjectSink,
  kObjectCop, kObjectEngineSound, kObjectDieWhenAnimEndsFlag, kObjectFloating, kObjectMissile,
  kAddOnLock, kObjectCopControl,
} from './state.js';
import { PI, sin, cos } from './trig.js';
import { RanFl, RanInt, RanProb } from './random.js';
import { P2D, VEC2D_Sum, VEC2D_Scale, VEC2D_Value } from './vec2d.js';
import { PlaySound } from './sound.js';
import { NewTextEffect, MakeFXStringFromNumStr, kEffectExplode, kEffectTiny, kEffectAbsPos } from './textfx.js';
import { SpriteUnused } from './sprites.js';
import { ObjectControl } from './objectControl.js';
import { ObjectPhysics } from './objectPhysics.js';
import { Input } from './input.js';

const kPlayerDeathDelay = 2.5;
const kMaxRotVelo = 2 * PI * 5;
const kExpMass = 250;
const kGravity = 50.0;

// Index of the road segment for world y (gRoadData+(int)(y/2)), clamped to the road.
export function roadIndex(y) {
  let i = Math.trunc(y / 2);
  if (!(i > 0)) i = 0;
  else if (i >= G.roadLength) i = G.roadLength - 1;
  return i * 4;
}

// Track point accessor, clamped so out-of-range targets don't read past the array.
const kNoTrackPoint = { flags: 0, x: 0, y: 0, velo: 0 };
export function trackPoint(track, i) {
  if (!track.num) return kNoTrackPoint;
  if (i >= track.num) i = track.num - 1;
  if (i < 0) i = 0;
  return track.track[i];
}

// C integer division of track deltas (SInt16 x / SInt32 y), as in the original interpolation.
export const idiv = (a, b) => (b ? Math.trunc(a / b) : 0);

export function newSentinel() {
  const o = makeObject();
  o.next = o;
  o.prev = o;
  return o;
}

function makeObject() {
  return {
    next: null,
    prev: null,
    pos: { x: 0, y: 0 },
    velo: { x: 0, y: 0 },
    dir: 0,
    rotVelo: 0,
    slide: 0,
    throttle: 0,
    steering: 0,
    frameDuration: 0,
    jumpVelo: 0,
    jumpHeight: 0,
    damage: 0,
    target: 0,
    control: 0,
    frame: 0,
    frameRepeation: 0,
    layer: 0,
    damageFlags: 0,
    type: null,
    shooter: null,
    input: newInputData(),
  };
}

export function Explosion(pos, velo, offs, mass, sound) {
  if (Math.abs(pos.y - G.cameraObj.pos.y) < kVisDist) {
    const l = 3 * kScale * Math.sqrt(mass * 0.001);
    const num = Math.trunc(mass / kExpMass);
    if (sound) {
      const boom = num * 0.07 + 0.5;
      PlaySound(pos, P2D(0, 0), 1, boom > 1 ? 1 : boom, offs ? 140 : 129);
    }
    for (let i = 0; i < num; i++) {
      let expObj;
      const ran = RanFl(0, 1);
      if (offs) expObj = NewObject(G.firstObj, 1001 + offs);
      else if (ran > 0.3) expObj = NewObject(G.firstObj, 1001);
      else if (ran > 0.08) expObj = NewObject(G.firstObj, 195);
      else {
        expObj = NewObject(G.firstObj, 1020);
        expObj.jumpVelo = 15;
      }
      expObj.frameDuration = RanFl(0, 0.25);
      expObj.frame = 0;
      expObj.pos.x = pos.x + RanFl(0, l);
      expObj.pos.y = pos.y + RanFl(0, l);
      expObj.dir = RanFl(0, 2 * PI);
      expObj.velo = VEC2D_Sum(VEC2D_Scale(velo, 0.5), VEC2D_Scale(P2D(sin(expObj.dir), cos(expObj.dir)), ran > 0.08 ? 7 : 50));
    }
  }
}

// Returns the squared distance to the closest object other than posObj.
function GetCloseObjDist(pos, posObj) {
  let dist = Infinity;
  for (let o = G.firstObj.next; o !== G.firstObj; o = o.next) {
    if (o === posObj) continue;
    const xdist = o.pos.x - pos.x;
    const ydist = o.pos.y - pos.y;
    const sqdist = xdist * xdist + ydist * ydist;
    if (sqdist < dist) dist = sqdist;
  }
  return dist;
}

function interpolateTrack(track, target, y) {
  const a = trackPoint(track, target - 1);
  const b = trackPoint(track, target);
  return a.x + idiv(b.x - a.x, b.y - a.y) * (y - a.y);
}

// Finds a random free position for a new object. Returns {pos, objDir, dir}.
export function GetUniquePos(minOffs, maxOffs, objDir) {
  const pos = { x: 0, y: 0 };
  const up = G.trackUp;
  const down = G.trackDown;
  const road = G.roadData;
  let ok = false;
  let target = 0;
  let dir = kObjectNoInput;
  for (let tries = 0; !ok && tries < 100000; tries++) {
    pos.y = RanFl(500, G.levelData.levelEnd);
    const r = roadIndex(pos.y);
    if (objDir === -1) {
      if (RanProb(0.5) || !down.num) {
        for (target = 1; target < up.num && up.track[target].y < pos.y; target++);
        pos.x = interpolateTrack(up, target, pos.y);
        dir = kObjectDriveUp;
      } else {
        for (target = 1; target < down.num && down.track[target].y > pos.y; target++);
        pos.x = interpolateTrack(down, target, pos.y);
        dir = kObjectDriveDown;
      }
      ok = GetCloseObjDist(pos, null) > kScale * kScale * kMinCarDist * kMinCarDist;
    } else {
      const border = RanInt(0, 4);
      if (road[r + 1] === road[r + 2]) {
        if (border === 0 || border === 2) {
          pos.x = road[r] + RanFl(minOffs, maxOffs);
          ok = road[r + 3] >= pos.x + minOffs;
        } else {
          pos.x = road[r + 3] - RanFl(minOffs, maxOffs);
          ok = road[r] <= pos.x - minOffs;
        }
      } else if (border === 0 || border === 2) {
        pos.x = road[r + border] + RanFl(minOffs, maxOffs);
        if (minOffs >= 0) ok = road[r + border + 1] >= pos.x + minOffs;
        else ok = border === 2 ? road[r + 1] <= pos.x + minOffs : true;
      } else {
        pos.x = road[r + border] - RanFl(minOffs, maxOffs);
        if (minOffs >= 0) ok = road[r + border - 1] <= pos.x - minOffs;
        else ok = border === 1 ? road[r + 2] >= pos.x - minOffs : true;
      }
      dir = kObjectNoInput;
    }
  }
  if (objDir === -1) {
    const t = trackPoint(dir === kObjectDriveUp ? up : down, target);
    if (pos.y - t.y) {
      if (dir === kObjectDriveUp) objDir = Math.atan((pos.x - t.x) / (pos.y - t.y));
      else objDir = PI + Math.atan((pos.x - t.x) / (pos.y - t.y));
    } else objDir = dir === kObjectDriveUp ? 0 : PI;
  } else objDir = RanFl(-objDir, objDir);
  return { pos, objDir, dir };
}

export function InsertObjectGroup(groupRef) {
  const probilities = new Array(100).fill(0);
  let indexCount = 0;
  const group = G.data.objectGroup(groupRef.resID);
  for (let e = 0; e < group.numEntries; e++)
    for (let p = 0; p < group.data[e].probility; p++) probilities[indexCount++] = e;
  for (let n = 0; n < groupRef.numObjs; n++) {
    const entry = group.data[probilities[RanInt(0, 100)]];
    const o = NewObject(G.firstObj, entry.typeRes);
    o.pos = P2D(Infinity, Infinity);
    o.dir = entry.dir;
    const u = GetUniquePos(entry.minOffs, entry.maxOffs, o.dir);
    o.pos = u.pos;
    o.dir = u.objDir;
    o.control += u.dir;
    if ((o.control & 0xf) === kObjectDriveUp)
      for (o.target = 0; o.target < G.trackUp.num && G.trackUp.track[o.target].y < o.pos.y; o.target++);
    else
      for (o.target = 0; o.target < G.trackDown.num && G.trackDown.track[o.target].y > o.pos.y; o.target++);
  }
}

export function NewObject(prev, typeRes) {
  const o = makeObject();
  o.next = prev.next;
  o.prev = prev;
  prev.next.prev = o;
  prev.next = o;
  const t = G.data.objectType(typeRes);
  o.type = t;
  if (t.flags & kObjectRandomFrameFlag) o.frame = t.frame + RanInt(0, t.numFrames);
  else o.frame = t.frame;
  o.control = t.flags2 & kObjectRoadKill ? kObjectCrossRoad : 0;
  if (t.flags & kObjectHeliFlag) o.jumpHeight = 12;
  o.layer = (t.flags2 >> 5) & 3;
  if (t.creationSound && G.playerObj) PlaySound(G.playerObj.pos, G.playerObj.velo, 1, 1, t.creationSound);
  return o;
}

export function RemoveObject(o) {
  if (o === G.playerObj) {
    o.frame = 0;
    o.type = G.data.objectType(2000);
  } else {
    if (o === G.firstVisObj) G.firstVisObj = G.firstVisObj.next;
    if (o === G.lastVisObj) G.lastVisObj = G.lastVisObj.next;
    o.prev.next = o.next;
    o.next.prev = o.prev;
  }
}

// 0 = on road, 1 = near the edge (within tolerance), 2 = off road.
export function CalcBackCollision(pos) {
  const road = G.roadData;
  const r = roadIndex(pos.y);
  if (road[r] > pos.x) return road[r] - pos.x > G.roadInfo.tolerance ? 2 : 1;
  if (road[r + 3] < pos.x) return pos.x - road[r + 3] > G.roadInfo.tolerance ? 2 : 1;
  if (road[r + 1] < pos.x && road[r + 2] > pos.x) {
    const d = pos.x - road[r + 1] < road[r + 2] - pos.x ? pos.x - road[r + 1] : road[r + 2] - pos.x;
    return d > 16 ? 2 : 1;
  }
  return 0;
}

export function KillObject(o) {
  let objType = o.type;
  const sinkEnable = CalcBackCollision(o.pos) === 2 && objType.flags2 & kObjectSink;
  if (o === G.playerObj) {
    if (!G.finishDelay && !(G.playerDeathDelay !== 0) && G.playerLives) {
      NewTextEffect(320, 240, kEffectExplode, 'OUCHeee');
      G.playerLives--;
      if (!(G.playerAddOns & kAddOnLock)) {
        G.playerAddOns = 0;
        G.numMines = 0;
        G.numMissiles = 0;
      } else G.playerAddOns ^= kAddOnLock;
      G.playerDeathDelay = kPlayerDeathDelay;
    }
    o.slide = 0;
    G.playerSlide[0] = G.playerSlide[1] = G.playerSlide[2] = G.playerSlide[3] = 0;
    o.throttle = 0;
  } else if (objType.score) {
    G.playerScore += objType.score;
    NewTextEffect(o.pos.x, o.pos.y, kEffectExplode + kEffectTiny + kEffectAbsPos, MakeFXStringFromNumStr(objType.score));
  }
  SpriteUnused(o.frame);
  if (objType.flags & kObjectDefaultDeath) Explosion(o.pos, o.velo, sinkEnable ? G.roadInfo.deathOffs : 0, objType.mass, true);
  if (objType.deathObj === -1) {
    RemoveObject(o);
    return;
  }
  o.type = G.data.objectType(objType.deathObj + (sinkEnable ? G.roadInfo.deathOffs : 0));
  o.layer = (o.type.flags2 >> 5) & 3;
  objType = o.type;
  if (objType.flags & kObjectRandomFrameFlag) o.frame = objType.frame + RanInt(0, objType.numFrames);
  else o.frame = objType.frame;
  if (objType.creationSound) PlaySound(o.pos, o.velo, 1, 1, objType.creationSound);
  o.frameDuration = objType.frameDuration;
  o.control = kObjectNoInput;
}

function ChangeObjs(obj1, obj2) {
  obj1.prev.next = obj2;
  obj2.next.prev = obj1;
  obj1.next = obj2.next;
  obj2.prev = obj1.prev;
  obj1.prev = obj2;
  obj2.next = obj1;
}

function GetVisObjs() {
  let o = G.firstObj.next;
  const minVis = Math.trunc(G.cameraObj.pos.y - kVisDist);
  const maxVis = Math.trunc(G.cameraObj.pos.y + kVisDist);
  while (o.pos.y < minVis) o = o.next;
  G.firstVisObj = o;
  while (o.pos.y < maxVis && o !== G.firstObj) o = o.next;
  G.lastVisObj = o;
}

// Cocktail sort by pos.y.
export function SortObjects() {
  let startObj = G.firstObj;
  let endObj = G.firstObj;
  let change;
  do {
    let o = startObj;
    change = false;
    while (o.next !== endObj) {
      const nextObj = o.next;
      if (nextObj.pos.y < o.pos.y) {
        ChangeObjs(o, nextObj);
        change = true;
      } else o = nextObj;
    }
    if (change) {
      endObj = endObj.prev;
      o = endObj;
      while (o.prev !== startObj) {
        const prevObj = o.prev;
        if (prevObj.pos.y > o.pos.y) ChangeObjs(prevObj, o);
        else o = prevObj;
      }
      startObj = startObj.next;
    }
  } while (change);
  GetVisObjs();
}

function RepairObj(o) {
  o.damage = 0;
  o.damageFlags = 0;
  SpriteUnused(o.frame);
  o.frame = o.type.frame;
}

export function FireWeapon(shooter, weaponID) {
  if (!shooter.jumpHeight) {
    const p = NewObject(shooter, weaponID);
    p.dir = shooter.dir;
    p.pos = { x: shooter.pos.x, y: shooter.pos.y };
    p.shooter = shooter;
    if (p.type.flags2 & kObjectMissile) p.jumpVelo = 25.0 + RanFl(-2.0, 2.0);
    if (p.type.weaponInfo)
      p.velo = VEC2D_Sum(shooter.velo, P2D(sin(shooter.dir) * p.type.weaponInfo, cos(shooter.dir) * p.type.weaponInfo));
  }
}

function MoveObject(o) {
  if (o.velo.x || o.velo.y) {
    o.pos = VEC2D_Sum(o.pos, VEC2D_Scale(o.velo, kScale * kFrameDuration));
    if (o.pos.y > G.roadLength * 2) {
      o.pos = P2D(G.trackUp.track[0].x, 100);
      if (o.control === kObjectDriveUp) o.target = 0;
      RepairObj(o);
    } else if (o.pos.y < 0) {
      o.pos = P2D(G.trackDown.num ? G.trackDown.track[0].x : G.trackUp.track[0].x, G.roadLength * 2 - 100);
      if (o.control === kObjectDriveDown) o.target = 0;
      RepairObj(o);
    }
  }
  if (G.roadInfo.water && o.type.flags2 & kObjectFloating)
    o.pos = VEC2D_Sum(o.pos, P2D(-G.roadInfo.xFrontDrift * 0.5 * kFrameDuration, G.roadInfo.yFrontDrift * 0.5 * kFrameDuration));
  if (o.rotVelo) {
    o.dir += o.rotVelo * kFrameDuration;
    if (o.dir >= 2 * PI) o.dir -= 2 * PI;
    else if (o.dir < 0) o.dir += 2 * PI;
    if (Math.abs(o.rotVelo) > kMaxRotVelo) o.rotVelo = o.rotVelo > 0 ? kMaxRotVelo : -kMaxRotVelo;
  }
  if (o.jumpVelo) {
    o.jumpHeight += o.jumpVelo * kFrameDuration;
    o.jumpVelo -= kGravity * kFrameDuration;
    if (!o.jumpVelo) o.jumpVelo = -0.0001;
    if (o.jumpHeight <= 0 && o.jumpVelo <= 0) {
      const vol = -o.jumpVelo * 0.018;
      o.jumpHeight = 0;
      o.jumpVelo = 0;
      PlaySound(o.pos, o.velo, 1.0, vol > 1.0 ? 1.0 : vol, 137);
    }
  }
}

function AnimateObject(o) {
  const t = o.type;
  if (!t.frameDuration) return;
  if (t.flags & kObjectCop && !(t.flags & kObjectHeliFlag) && !(t.flags2 & kObjectEngineSound) && o.control !== kObjectCopControl) {
    o.frame = t.frame;
    return;
  }
  o.frameDuration -= kFrameDuration;
  if (o.frameDuration <= 0) {
    o.frameDuration += t.frameDuration;
    const last = t.frame + (t.numFrames & 0xff) - 1;
    if (o.frame >= t.frame && o.frame < last) o.frame++;
    else if (t.flags & kObjectDieWhenAnimEndsFlag && o.frame === last) {
      KillObject(o);
      return;
    } else {
      o.frameRepeation++;
      o.frame = t.frame;
      if (o.frameRepeation === (t.numFrames >> 8) - 1 || !(t.numFrames >> 8)) {
        o.frameRepeation = 0;
        if (t.otherSound && Math.abs(o.pos.y - G.cameraObj.pos.y) < kYSize * 2) {
          if (!(t.flags2 & kObjectEngineSound)) PlaySound(o.pos, o.velo, 1, 1, t.otherSound);
          else PlaySound(o.pos, o.velo, 0.95 + VEC2D_Value(o.velo) / 240, 0.6 + VEC2D_Value(o.velo) / 30, t.otherSound);
        }
      }
    }
  }
  if (t.flags2 & kObjectRoadKill && o.velo.x === 0 && o.velo.y === 0) o.frame = t.frame;
}

export function MoveObjects() {
  let o = G.firstObj.next;
  const input = Input();
  while (o !== G.firstObj) {
    const next = o.next;
    if (o === G.playerObj || !(G.frameCount % kLowCalcRatio)) {
      if (G.frameCount % (2 * kLowCalcRatio)) ObjectControl(o, input);
      ObjectPhysics(o);
      if (next.prev === o) {
        MoveObject(o);
        AnimateObject(o);
      }
    } else {
      MoveObject(o);
      AnimateObject(o);
    }
    o = next;
  }
  SortObjects();
}

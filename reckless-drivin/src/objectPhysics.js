// Vehicle and object physics (objectPhysics.c): four-wheel car model, helicopters, sliding debris,
// damage smoke and tyre tracks.

import {
  G, kScale, kFrameDuration, kCalcFPS, kLowFrameDuration, kLowCalcFPS, kVisDist, kMaxTracks,
  kObjectRearSteer, kObjectRearDrive, kObjectWheelFlag, kObjectSolidFrictionFlag, kObjectHeliFlag,
  kObjectMissile, kObjectBackCollFlag, kObjectSink, kObjectFrontCollFlag, kObjectBounce, kObjectCop,
  kObjectDamageble, kObjectDieWhenOutOfScreen, kAddOnCop, kAddOnTurbo,
  kObjectDriveUp, kObjectNoInput, kObjectDriveDown, kObjectCopControl,
} from './state.js';
import { PI, sin, cos } from './trig.js';
import { RanFl, RanProb } from './random.js';
import {
  P2D, VEC2D_Sum, VEC2D_Difference, VEC2D_Scale, VEC2D_CP, VEC2D_DotProduct, VEC2D_CrossProduct, VEC2D_Value, VEC2D_Norm,
} from './vec2d.js';
import { NewParticleFX } from './particlefx.js';
import { NewObject, KillObject, RemoveObject, CalcBackCollision, FireWeapon, Explosion } from './objects.js';
import { ObjectStartChase } from './objectControl.js';
import { HandleCollision } from './objectCollision.js';

const kMechResistance = 100;
const kMinSteerTime = 0.8;
const kVeloSteerTime = 0.075;
const kJustTime = 0.2;
const kHeliRotAccel = 10.0;
const kHeliResistance = 5.0;
const kMaxHeliRotVelo = PI;
const kMinSlide = 0.75;
const kSlideFactor = 0.5;
const kMotorRunTime = 0.3;
const kTrackIntensity = 0.075;
const kStartChaseDist = 42.0;
const kStartChaseSpeed = 28.0;

// AI wheel force: slide accumulates into slideRef.value.
function CalcWheelForce(dir, wheelPower, fRoadFriction, mass, velo, vVelo, o, slideRef) {
  const ri = G.roadInfo;
  let fWheel = P2D(0, 0);
  if (o.input.brake && !ri.water && velo) {
    if (o.input.brake < 0.8) fWheel = VEC2D_Scale(vVelo, (-1500 * mass * o.input.brake * o.input.brake) / velo);
    else fWheel = VEC2D_Scale(vVelo, -fRoadFriction);
    if (VEC2D_Value(VEC2D_Scale(fWheel, (1 / mass) * kFrameDuration)) > velo) fWheel = VEC2D_Scale(vVelo, -mass * kLowCalcFPS);
  }
  if (o.input.brake < 0.8 || (ri.water && velo)) {
    const vDir = P2D(sin(dir), cos(dir));
    const ortoDir = VEC2D_CP(vDir);
    const ortoVelo = VEC2D_DotProduct(vVelo, ortoDir);
    const fSidewall = VEC2D_Scale(ortoDir, -ortoVelo * mass * kLowCalcFPS);
    const fEngine = VEC2D_Scale(vDir, wheelPower);
    fWheel = VEC2D_Sum(fWheel, VEC2D_Sum(fEngine, fSidewall));
  }
  const val = VEC2D_Value(fWheel);
  const slideOut = val / fRoadFriction;
  slideRef.value += slideOut / 4;
  if (slideOut > 1) fWheel = VEC2D_Scale(fWheel, 1 / slideOut);
  const fResistance = VEC2D_Sum(VEC2D_Scale(o.velo, -velo * ri.airResistance), VEC2D_Scale(vVelo, -kMechResistance));
  return [VEC2D_Sum(fWheel, fResistance)];
}

// Player wheel force: returns [force, slide].
function CalcWheelForcePlayer(dir, wheelPower, fRoadFriction, mass, velo, vVelo, o, brake) {
  const ri = G.roadInfo;
  let fWheel = P2D(0, 0);
  if (brake > 1) brake = 1;
  if (brake && !ri.water && velo) {
    if (brake < 0.8) fWheel = VEC2D_Scale(vVelo, (-1500 * mass * brake * brake) / velo);
    else fWheel = VEC2D_Scale(vVelo, -fRoadFriction);
    if (VEC2D_Value(VEC2D_Scale(fWheel, (1 / mass) * kFrameDuration)) > velo) fWheel = VEC2D_Scale(vVelo, -mass * kCalcFPS);
  }
  if (brake < 0.8 || (ri.water && velo)) {
    const vDir = P2D(sin(dir), cos(dir));
    const ortoDir = VEC2D_CP(vDir);
    const ortoVelo = VEC2D_DotProduct(vVelo, ortoDir);
    const fSidewall = VEC2D_Scale(ortoDir, -ortoVelo * mass * kCalcFPS);
    const fEngine = VEC2D_Scale(vDir, wheelPower);
    fWheel = VEC2D_Sum(fWheel, VEC2D_Sum(fEngine, fSidewall));
  }
  const val = VEC2D_Value(fWheel);
  const slide = val / fRoadFriction;
  if (slide > 1) fWheel = VEC2D_Scale(fWheel, 1 / slide);
  const fResistance = VEC2D_Sum(VEC2D_Scale(o.velo, -velo * ri.airResistance), VEC2D_Scale(vVelo, -kMechResistance));
  return [VEC2D_Sum(fWheel, fResistance), slide];
}

export function AddTrack(p1, p2, intensity) {
  G.trackCount++;
  if (G.trackCount >= kMaxTracks) {
    // BlockMoveData(gTracks+kMaxTracks/2, gTracks, ...): move the newer half down.
    const half = kMaxTracks / 2;
    for (let i = 0; i < half; i++) {
      const src = G.tracks[i + half];
      const dst = G.tracks[i];
      dst.p1.x = src.p1.x;
      dst.p1.y = src.p1.y;
      dst.p2.x = src.p2.x;
      dst.p2.y = src.p2.y;
      dst.intensity = src.intensity;
      dst.time = src.time;
    }
    G.trackCount -= half;
  }
  const t = G.tracks[G.trackCount];
  const [hi, lo] = p1.y > p2.y ? [p1, p2] : [p2, p1];
  t.p1.x = hi.x;
  t.p1.y = hi.y;
  t.p2.x = lo.x;
  t.p2.y = lo.y;
  t.intensity = intensity > 1 ? 1 : intensity;
  t.time = G.frameCount;
}

function CalcSteeringPlayer(o, velo) {
  const steerTime = kMinSteerTime + velo * kVeloSteerTime;
  const maxSteering = o.type.steering;
  const target = o.input.steering * maxSteering;
  if (target > o.steering) {
    o.steering += kFrameDuration / (o.steering > 0 ? steerTime : kJustTime);
    if (target < o.steering) o.steering = target;
  } else if (target < o.steering) {
    o.steering -= kFrameDuration / (o.steering < 0 ? steerTime : kJustTime);
    if (target > o.steering) o.steering = target;
  }
}

function CalcPower(o, velo) {
  const t = o.type;
  const ri = G.roadInfo;
  const signedVelo = VEC2D_DotProduct(o.velo, P2D(sin(o.dir), cos(o.dir)));
  const accel = o.input.kickdown && !ri.water ? (velo < 25 || signedVelo < 0 ? 50 : 3) : 2;
  // accel/6 is C integer division.
  let throttle = o.throttle * (velo < 50 ? accel / (velo * 0.1 + 1) + 1 - Math.trunc(accel / 6) : 1) * 15;
  if (ri.water && o.input.brake) throttle = -o.input.brake * (signedVelo > 0 ? 30 : -30);
  let power = signedVelo > -30 ? throttle * t.maxEngineForce : 0;
  if (o === G.playerObj) power *= G.playerAddOns & kAddOnTurbo && ri.friction >= 100 ? 1.7 : 1;
  if (o.input.throttle > o.throttle) {
    o.throttle += kFrameDuration / kMotorRunTime;
    if (o.throttle > o.input.throttle) o.throttle = o.input.throttle;
  } else if (o.input.throttle < o.throttle) {
    o.throttle -= kFrameDuration / kMotorRunTime;
    if (o.throttle < o.input.throttle) o.throttle = o.input.throttle;
  }
  return power;
}

function SlideFriction(slide) {
  if (slide > kMinSlide) {
    slide -= kMinSlide;
    slide *= kSlideFactor;
    if (slide > 1) slide = 1;
    return 1 - slide * G.roadInfo.slideFriction;
  }
  return 1;
}

// Wheel offsets (in metres, rotated) for front-left, front-right, rear-left, rear-right.
function wheelPositions(t, sinDir, cosDir) {
  const L = t.wheelLength;
  const W = t.wheelWidth;
  return [
    P2D(sinDir * L - cosDir * W, cosDir * L + sinDir * W),
    P2D(sinDir * L + cosDir * W, cosDir * L - sinDir * W),
    P2D(-sinDir * L - cosDir * W, -cosDir * L + sinDir * W),
    P2D(-sinDir * L + cosDir * W, -cosDir * L - sinDir * W),
  ];
}

function ControlWheelObjectPlayer(o) {
  const t = o.type;
  const ri = G.roadInfo;
  const cosDir = cos(o.dir);
  const sinDir = sin(o.dir);
  const velo = VEC2D_Value(o.velo);
  const fRoadFriction = t.mass * t.friction * ri.friction;
  const power = CalcPower(o, velo);
  const rotMass = t.length * t.length * t.mass;
  const slide = [0, 0, 0, 0];
  const rearSteer = t.flags2 & kObjectRearSteer;
  const rearDrive = t.flags2 & kObjectRearDrive;
  const p = wheelPositions(t, sinDir, cosDir);
  const v = [];
  const pTotal = [];
  const f = [];
  let aRot = 0;
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    v[i] = VEC2D_Sum(o.velo, VEC2D_Scale(VEC2D_CP(p[i]), o.rotVelo));
    pTotal[i] = VEC2D_Sum(VEC2D_Scale(p[i], kScale), o.pos);
    const dir = front ? o.dir + (rearSteer ? 0 : o.steering) : o.dir - (rearSteer ? o.steering : 0);
    const wheelPower = front ? (rearDrive ? 0 : power) : rearDrive ? power : 0;
    const brake = front ? o.input.brake : o.input.handbrake + 0.8 * o.input.brake;
    const [force, s] = CalcWheelForcePlayer(dir, wheelPower, fRoadFriction * SlideFriction(G.playerSlide[i]), t.mass, velo, v[i], o, brake);
    f[i] = force;
    slide[i] = s;
    aRot += VEC2D_CrossProduct(force, p[i]);
  }
  const aTotal = VEC2D_Scale(VEC2D_Sum(VEC2D_Sum(VEC2D_Sum(f[0], f[1]), f[2]), f[3]), (0.25 / t.mass) * kFrameDuration);
  const aRotTotal = (aRot / (4 * rotMass)) * kFrameDuration;
  for (let i = 0; i < 4; i++) {
    if (slide[i] > ri.trackSlide && !CalcBackCollision(pTotal[i]))
      AddTrack(pTotal[i], VEC2D_Sum(VEC2D_Scale(v[i], kScale * kFrameDuration), pTotal[i]), (slide[i] - ri.trackSlide) * kTrackIntensity);
    if (slide[i] > ri.dustSlide) NewParticleFX(pTotal[i], v[i], 12, ri.dustColor, 0, 20);
  }
  o.velo = VEC2D_Sum(aTotal, o.velo);
  o.rotVelo += aRotTotal;
  o.slide = (slide[0] + slide[1] + slide[2] + slide[3]) / 4;
  for (let i = 0; i < 4; i++) G.playerSlide[i] = slide[i];
  CalcSteeringPlayer(o, velo);
}

function ControlWheelObject(o) {
  const t = o.type;
  const cosDir = cos(o.dir);
  const sinDir = sin(o.dir);
  const velo = VEC2D_Value(o.velo);
  const fRoadFriction = t.mass * t.friction * G.roadInfo.friction * SlideFriction(o.slide);
  const power = CalcPower(o, velo);
  const rotMass = t.length * t.length * t.mass;
  const slideRef = { value: 0 };
  const p = wheelPositions(t, sinDir, cosDir);
  const f = [];
  let aRot = 0;
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    const v = VEC2D_Sum(o.velo, VEC2D_Scale(VEC2D_CP(p[i]), o.rotVelo));
    const [force] = CalcWheelForce(front ? o.dir + o.steering : o.dir, front ? power : 0, fRoadFriction, t.mass, velo, v, o, slideRef);
    f[i] = force;
    aRot += VEC2D_CrossProduct(force, p[i]);
  }
  const aTotal = VEC2D_Scale(VEC2D_Sum(VEC2D_Sum(VEC2D_Sum(f[0], f[1]), f[2]), f[3]), (0.25 / t.mass) * kLowFrameDuration);
  const aRotTotal = (aRot / (4 * rotMass)) * kLowFrameDuration;
  o.velo = VEC2D_Sum(aTotal, o.velo);
  o.rotVelo += aRotTotal;
  o.slide = slideRef.value;
  o.steering = o.input.steering;
}

function ControlWheelObjectFast(o) {
  const objDir = P2D(sin(o.dir), cos(o.dir));
  o.dir += o.input.steering * PI * kLowFrameDuration;
  o.velo = VEC2D_Scale(objDir, o.throttle * 30);
  o.rotVelo = 0;
  if (o.throttle < o.input.throttle) o.throttle += kLowFrameDuration;
  else o.throttle -= kLowFrameDuration;
  if (o.input.brake) o.throttle = 0;
}

function ControlHeliObject(o) {
  const t = o.type;
  const objDir = P2D(sin(o.dir), cos(o.dir));
  const velo = VEC2D_Value(o.velo);
  const fEngine = CalcPower(o, velo);
  const nv = VEC2D_Norm(o.velo);
  const spanArea = Math.abs(VEC2D_DotProduct(objDir, nv)) * 3 + Math.abs(VEC2D_DotProduct(VEC2D_CP(objDir), nv) * 10);
  const vfEngine = VEC2D_Scale(objDir, fEngine);
  const vfResistance = VEC2D_Scale(o.velo, -velo * G.roadInfo.airResistance * spanArea);
  const aTotal = VEC2D_Scale(VEC2D_Sum(vfResistance, vfEngine), kLowFrameDuration / t.mass);
  o.velo = VEC2D_Sum(aTotal, o.velo);
  o.rotVelo += o.steering * kHeliRotAccel * kLowFrameDuration;
  o.rotVelo -= o.rotVelo * kHeliResistance * kLowFrameDuration;
  if (Math.abs(o.rotVelo) > kMaxHeliRotVelo) o.rotVelo = o.rotVelo > 0 ? kMaxHeliRotVelo : -kMaxHeliRotVelo;
  o.steering = o.input.steering;
}

function SolidObject(o) {
  let aFriction = 0.015 * o.type.friction * G.roadInfo.friction * kLowFrameDuration;
  const velo = VEC2D_Value(o.velo);
  if (aFriction < velo) o.velo = VEC2D_Sum(o.velo, VEC2D_Scale(o.velo, -aFriction / velo));
  else o.velo = P2D(0, 0);
  aFriction *= 0.05;
  if (o.rotVelo) {
    o.rotVelo = o.rotVelo + (o.rotVelo > 0 ? -aFriction : aFriction);
    if (o.rotVelo < 0 && o.rotVelo + aFriction > 0) o.rotVelo = 0;
  }
}

function CheckObjectMotion(o) {
  if (o.velo.x || o.velo.y) return true;
  if (o.input.throttle) return true;
  return o.rotVelo !== 0;
}

function MakeSmoke(o) {
  const smoke = NewObject(o, 195);
  const t = o.type;
  smoke.pos = VEC2D_Sum(o.pos, P2D(sin(o.dir) * t.length * kScale, cos(o.dir) * t.length * kScale));
  smoke.pos = VEC2D_Sum(smoke.pos, P2D(RanFl(-10, 10), RanFl(-10, 10)));
}

export function ObjectPhysics(o) {
  const t0 = o.type;
  if (!o.jumpHeight || t0.flags & kObjectHeliFlag) {
    if (o.type.flags & kObjectWheelFlag) {
      if (Math.abs(o.pos.y - G.cameraObj.pos.y) < 10 * kVisDist) {
        if (o === G.playerObj) ControlWheelObjectPlayer(o);
        else if (CheckObjectMotion(o)) ControlWheelObject(o);
      } else ControlWheelObjectFast(o);
    } else if (o.type.flags & kObjectSolidFrictionFlag) SolidObject(o);
    else if (o.type.flags & kObjectHeliFlag) ControlHeliObject(o);
    if (o.type.flags2 & kObjectMissile) {
      if (o.jumpHeight === 0 && o.jumpVelo === 0) KillObject(o);
    } else if (Math.abs(o.pos.y - G.cameraObj.pos.y) < kVisDist) {
      if (o.type.flags & kObjectBackCollFlag || (o.type.flags2 & kObjectSink && G.roadInfo.deathOffs)) {
        if (CalcBackCollision(o.pos) === 2) KillObject(o);
      } else if (o.type.flags2 & kObjectFrontCollFlag) {
        if (CalcBackCollision(o.pos) === 0) KillObject(o);
      }
      if (o.type.flags & kObjectBounce) HandleCollision(o);
      if (o.type.flags & kObjectCop && !(G.playerAddOns & kAddOnCop) && !G.finishDelay && !G.playerDeathDelay) {
        const dirVec = P2D(sin(o.dir), cos(o.dir));
        const normDiffVec = VEC2D_Norm(VEC2D_Difference(G.playerObj.pos, o.pos));
        if (o.control === kObjectDriveUp || o.control === kObjectNoInput) o.control = kObjectCopControl;
        else if (o.control === kObjectDriveDown) {
          if (G.playerObj.pos.y > o.pos.y + kStartChaseDist * kScale) ObjectStartChase(o, kStartChaseDist * kScale, kStartChaseSpeed);
        } else if (o.control === kObjectCopControl && o.type.weaponObj) {
          if (
            VEC2D_DotProduct(dirVec, normDiffVec) > 0.9 &&
            VEC2D_Value(VEC2D_Difference(G.playerObj.pos, o.pos)) > 70 &&
            RanProb(1.0 / o.type.weaponInfo)
          )
            FireWeapon(o, o.type.weaponObj);
        }
      }
      if (o.type.flags2 & kObjectDamageble) {
        if (o.damage * 2 > o.type.maxDamage && Math.abs(o.pos.y - G.cameraObj.pos.y) < kVisDist && RanProb(0.25)) MakeSmoke(o);
        if (o.damage > o.type.maxDamage) {
          o.damage += kLowFrameDuration * 0.5 * o.type.maxDamage;
          if (RanProb(((o.damage - o.type.maxDamage) / o.type.maxDamage) * 0.25)) Explosion(o.pos, o.velo, 0, 250, 0);
          if (o.damage > o.type.maxDamage * 2) KillObject(o);
        }
      }
    } else if (o.type.flags2 & kObjectDieWhenOutOfScreen) RemoveObject(o);
  } else if (o.type.flags2 & kObjectMissile) HandleCollision(o);
}

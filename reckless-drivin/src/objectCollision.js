// Collision detection and response (objectCollision.c): oriented-box tests, bouncing, damage and
// sprite denting, debris, bonuses, ramps, oil and spikes.

import {
  G, kScale, kFrameDuration, kLowFrameDuration, kCalcFPS,
  kObjectMissile, kObjectDamageble, kObjectBounce, kObjectRamp, kObjectBump, kObjectKillsCars,
  kObjectKilledByCars, kObjectOil, kObjectBonusFlag, kObjectAddOnFlag, kAddOnLock, kAddOnSpikes,
  kAddOnCop, kAddOnTurbo, kFrontBumper, kBackBumper, kFrontLeftTire, kFrontRightTire, kBackLeftTire,
  kBackRightTire, kLeftDoor, kRightDoor, kMotor,
} from './state.js';
import { PI, sin, cos } from './trig.js';
import { RanFl, RanInt, RanProb } from './random.js';
import { P2D, VEC2D_Sum, VEC2D_Difference, VEC2D_Scale, VEC2D_DotProduct, VEC2D_CrossProduct, VEC2D_Value, VEC2D_Norm } from './vec2d.js';
import { PlaySound, SimplePlaySound } from './sound.js';
import {
  NewTextEffect, MakeFXStringFromNumStr, kEffectExplode, kEffectTiny, kEffectAbsPos, kEffectSinLines,
  kEffectMoveLeft, kEffectMoveDown, kEffectMoveUp,
} from './textfx.js';
import { NewParticleFX } from './particlefx.js';
import { XDistortSprite, YDistortSprite } from './sprites.js';
import { NewObject, KillObject, Explosion } from './objects.js';

const kSeperatio = 1.01;
const kMaxCollDist = 120.0;
const kPlayerBounceMass = 4000.0;
const kDebrisProbility = 5;
const kMinDamageVelo = 5;
const kMinJumpVelo = 20.0;
// The original gave the Police Jammer as one of eight crate add-ons. Disabled in this port.
const kCrateGivesPoliceJammer = false;

function CalcObjPoints(o, points) {
  const cosDir = cos(o.dir);
  const sinDir = sin(o.dir);
  const t = o.type;
  points[0] = P2D(sinDir * t.length - cosDir * t.width, cosDir * t.length + sinDir * t.width);
  points[1] = P2D(sinDir * t.length + cosDir * t.width, cosDir * t.length - sinDir * t.width);
  points[2] = P2D(-sinDir * t.length + cosDir * t.width, -cosDir * t.length - sinDir * t.width);
  points[3] = P2D(-sinDir * t.length - cosDir * t.width, -cosDir * t.length + sinDir * t.width);
  let hi = 0;
  for (let i = 0; i < 4; i++) {
    points[i] = VEC2D_Sum(VEC2D_Scale(points[i], kScale), o.pos);
    if (points[i].y > points[hi].y) hi = i;
  }
  return hi;
}

function SectLines(l1p1, l1p2, l2p1, l2p2) {
  const dydxl1 = (l1p2.y - l1p1.y) / (l1p2.x - l1p1.x);
  const l2p1offs = l2p1.y - (l1p1.y + (l2p1.x - l1p1.x) * dydxl1);
  const l2p2offs = l2p2.y - (l1p1.y + (l2p2.x - l1p1.x) * dydxl1);
  if (l2p1offs * l2p2offs > 0) return false;
  const sectX = l2p1.x + ((l2p2.x - l2p1.x) * l2p1offs) / (l2p1offs - l2p2offs);
  if (sectX > l1p1.x && sectX < l1p2.x) return true;
  if (sectX > l1p2.x && sectX < l1p1.x) return true;
  return false;
}

const sqr = (x) => x * x;
const p1 = [null, null, null, null];
const p2 = [null, null, null, null];

function TestCollision(obj1, obj2, sqDist) {
  const hi1 = CalcObjPoints(obj1, p1);
  const hi2 = CalcObjPoints(obj2, p2);
  const t1 = obj1.type;
  const t2 = obj2.type;
  if (obj2.jumpHeight !== obj1.jumpHeight && !((t1.flags2 | t2.flags2) & kObjectMissile)) return false;
  // Original precedence quirk: only the first term is scaled by kScale.
  if (sqDist < sqr(kScale * (t1.width < t1.length ? t1.width : t1.length) + (t2.width < t2.length ? t2.width : t2.length))) return true;
  if (p1[hi1].y < p2[(hi2 + 2) & 3].y) return false;
  if (p2[hi2].y < p1[(hi1 + 2) & 3].y) return false;
  if (p1[(hi1 + 1) & 3].x < p2[(hi2 - 1) & 3].x) return false;
  if (p2[(hi2 + 1) & 3].x < p1[(hi1 - 1) & 3].x) return false;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (SectLines(p1[i], p1[(i + 1) & 3], p2[j], p2[(j + 1) & 3])) return true;
  if (SectLines(p1[0], p1[2], p2[0], p2[2])) return true;
  if (SectLines(p1[1], p1[3], p2[0], p2[2])) return true;
  if (SectLines(p1[0], p1[2], p2[1], p2[3])) return true;
  if (SectLines(p1[1], p1[3], p2[1], p2[3])) return true;
  return false;
}

function MakeDebris(o, damagePos, damage, maxDamage) {
  const t = o.type;
  const xSize = t.width * kScale;
  const ySize = t.length * kScale;
  if (damagePos === kMotor || !RanProb((kDebrisProbility * damage) / maxDamage)) return;
  const s = sin(o.dir);
  const c = cos(o.dir);
  let d;
  switch (damagePos) {
    case kFrontBumper:
      d = NewObject(o, 1014);
      d.pos = VEC2D_Sum(o.pos, P2D(s * ySize, c * ySize));
      d.dir = o.dir;
      break;
    case kBackBumper:
      d = NewObject(o, 1014);
      d.pos = VEC2D_Sum(o.pos, P2D(-s * ySize, -c * ySize));
      d.dir = o.dir + PI;
      break;
    case kFrontLeftTire:
      d = NewObject(o, 1012);
      d.pos = VEC2D_Sum(VEC2D_Sum(o.pos, P2D(s * ySize, c * ySize)), P2D(-c * xSize, -s * xSize));
      d.dir = RanFl(0, 2 * PI);
      break;
    case kFrontRightTire:
      d = NewObject(o, 1012);
      d.pos = VEC2D_Sum(VEC2D_Sum(o.pos, P2D(s * ySize, c * ySize)), P2D(c * xSize, s * xSize));
      d.dir = RanFl(0, 2 * PI);
      break;
    case kBackLeftTire:
      d = NewObject(o, 1012);
      d.pos = VEC2D_Sum(VEC2D_Sum(o.pos, P2D(-s * ySize, -c * ySize)), P2D(-c * xSize, -s * xSize));
      d.dir = RanFl(0, 2 * PI);
      break;
    case kBackRightTire:
      d = NewObject(o, 1012);
      d.pos = VEC2D_Sum(VEC2D_Sum(o.pos, P2D(-s * ySize, -c * ySize)), P2D(c * xSize, s * xSize));
      d.dir = RanFl(0, 2 * PI);
      break;
    case kLeftDoor:
      d = NewObject(o, 1015);
      d.pos = VEC2D_Sum(o.pos, P2D(-c * xSize, -s * xSize));
      d.dir = o.dir;
      d.rotVelo = -2 * PI;
      break;
    case kRightDoor:
      d = NewObject(o, 1016);
      d.pos = VEC2D_Sum(o.pos, P2D(c * xSize, s * xSize));
      d.dir = o.dir;
      d.rotVelo = 2 * PI;
      break;
    default:
      return;
  }
  d.velo = VEC2D_Sum(o.velo, P2D(sin(d.dir) * 10, cos(d.dir) * 10));
}

function DamageObj(o, damage, diff) {
  const t = o.type;
  const xSize = t.width * kScale;
  const ySize = t.length * kScale;
  const maxDamage = t.maxDamage;
  const heading = P2D(sin(o.dir), cos(o.dir));
  const damDir = VEC2D_DotProduct(diff, heading);
  const damPoint = VEC2D_Sum(o.pos, P2D(sin(o.dir + damDir) * xSize, cos(o.dir + damDir) * ySize));
  NewParticleFX(damPoint, o.velo, damage * 4, 0xf6, 1, 50);
  o.damage += damage;
  const side = VEC2D_CrossProduct(diff, heading) > 0;
  let damagePos;
  if (damDir > 0.83) damagePos = o.damageFlags & kFrontBumper ? kMotor : kFrontBumper;
  else if (damDir > 0.35) damagePos = side ? kFrontRightTire : kFrontLeftTire;
  else if (damDir > -0.35) damagePos = side ? kRightDoor : kLeftDoor;
  else if (damDir > -0.83) damagePos = side ? kBackRightTire : kBackLeftTire;
  else damagePos = kBackBumper;
  Explosion(damPoint, o.velo, 0, (damage / maxDamage) * 2000, false);
  if (o.damageFlags & damagePos) return;
  if (damagePos === kMotor) {
    if (o.damage > maxDamage * 0.75) o.damageFlags |= damagePos;
    else return;
  } else o.damageFlags |= damagePos;
  const amount = (damage / maxDamage) * 20;
  switch (damagePos) {
    case kFrontBumper:
    case kMotor:
      o.frame = YDistortSprite(o.frame, -xSize, xSize, -ySize - 1, -ySize + 10, 0, amount);
      break;
    case kBackBumper:
      o.frame = YDistortSprite(o.frame, -xSize, xSize, ySize - 10, ySize + 1, 1, amount);
      break;
    case kFrontLeftTire:
      o.frame = XDistortSprite(o.frame, -ySize, -ySize * 0.3, -xSize - 1, -xSize + 10, 0, amount);
      break;
    case kFrontRightTire:
      o.frame = XDistortSprite(o.frame, -ySize, -ySize * 0.3, xSize - 10, xSize + 1, 1, amount);
      break;
    case kBackLeftTire:
      o.frame = XDistortSprite(o.frame, ySize * 0.3, ySize, -xSize - 1, -xSize + 10, 0, amount);
      break;
    case kBackRightTire:
      o.frame = XDistortSprite(o.frame, ySize * 0.3, ySize, xSize - 10, xSize + 1, 1, amount);
      break;
    case kLeftDoor:
      o.frame = XDistortSprite(o.frame, -ySize * 0.4, ySize * 0.4, -xSize - 1, -xSize + 10, 0, amount);
      break;
    case kRightDoor:
      o.frame = XDistortSprite(o.frame, -ySize * 0.4, ySize * 0.4, xSize - 10, xSize + 1, 1, amount);
      break;
  }
  MakeDebris(o, damagePos, damage, maxDamage);
}

function DoBounce(obj1, obj2, diff) {
  const mass1 = obj1 === G.playerObj ? kPlayerBounceMass : obj1.type.mass;
  const mass2 = obj2 === G.playerObj ? kPlayerBounceMass : obj2.type.mass;
  let damage1 = 0;
  let damage2 = 0;
  let new12Velo = VEC2D_Sum(VEC2D_Scale(obj1.velo, mass1), VEC2D_Scale(obj2.velo, mass2));
  new12Velo = VEC2D_Scale(new12Velo, 2 / (mass1 + mass2));
  let new1Velo = VEC2D_Difference(VEC2D_Sum(VEC2D_Scale(obj1.velo, mass1), VEC2D_Scale(obj2.velo, mass2 * 2)), VEC2D_Scale(obj1.velo, mass2));
  let new2Velo = VEC2D_Difference(VEC2D_Sum(VEC2D_Scale(obj2.velo, mass2), VEC2D_Scale(obj1.velo, mass1 * 2)), VEC2D_Scale(obj2.velo, mass1));
  new1Velo = VEC2D_Scale(new1Velo, 1 / (mass1 + mass2));
  new2Velo = VEC2D_Scale(new2Velo, 1 / (mass1 + mass2));
  new1Velo = VEC2D_Scale(VEC2D_Sum(new1Velo, new12Velo), 0.33);
  new2Velo = VEC2D_Scale(VEC2D_Sum(new2Velo, new12Velo), 0.33);
  const impulse1 = VEC2D_Difference(obj1.velo, new1Velo);
  const impulse2 = VEC2D_Difference(obj2.velo, new2Velo);
  obj1.velo = new1Velo;
  obj2.velo = new2Velo;
  if ((obj1 === G.playerObj || obj2 === G.playerObj) && G.playerAddOns & kAddOnSpikes) {
    if (Math.abs(VEC2D_DotProduct(diff, P2D(sin(G.playerObj.dir), cos(G.playerObj.dir)))) < 0.3) {
      if (obj1 === G.playerObj) damage2 += VEC2D_Value(G.playerObj.velo) * kFrameDuration * 40;
      else damage1 += VEC2D_Value(G.playerObj.velo) * kFrameDuration * 40;
    }
  }
  if (obj1.type.flags2 & kObjectDamageble && (damage1 += VEC2D_Value(impulse1)) > kMinDamageVelo) DamageObj(obj1, damage1, VEC2D_Scale(diff, -1));
  if (obj2.type.flags2 & kObjectDamageble && (damage2 += VEC2D_Value(impulse2)) > kMinDamageVelo) DamageObj(obj2, damage2, diff);
  const momentum1 = VEC2D_CrossProduct(VEC2D_Scale(impulse1, kCalcFPS), diff);
  const momentum2 = VEC2D_CrossProduct(VEC2D_Scale(impulse2, kCalcFPS), diff);
  obj1.rotVelo += momentum1 / mass1;
  obj2.rotVelo -= momentum2 / mass2;
}

function BounceObjects(obj1, obj2) {
  let boom = (VEC2D_Value(VEC2D_Difference(obj1.velo, obj2.velo)) - kMinDamageVelo) * 0.05;
  boom = boom < 0 ? 0 : boom;
  if (boom) PlaySound(obj1.pos, P2D(0, 0), 1, boom > 1 ? 1 : boom, 128);
  let diff;
  let tries = 0;
  do {
    diff = VEC2D_Difference(obj1.pos, obj2.pos);
    if (diff.x * kSeperatio === diff.x) diff.x = 1;
    if (diff.y * kSeperatio === diff.y) diff.y = 1;
    obj2.pos = VEC2D_Sum(obj1.pos, VEC2D_Scale(diff, -kSeperatio));
    obj1.pos = VEC2D_Sum(obj2.pos, VEC2D_Scale(diff, kSeperatio * kSeperatio));
  } while (TestCollision(obj1, obj2, Infinity) && ++tries < 10000);
  DoBounce(obj1, obj2, VEC2D_Norm(diff));
}

function BonusObject(o) {
  const t = o.type;
  if (t.flags2 & kObjectAddOnFlag) {
    let ok = false;
    do {
      switch (RanInt(0, 8)) {
        case 0:
          if (!(G.playerAddOns & kAddOnLock)) {
            NewTextEffect(320, 240, kEffectSinLines + kEffectMoveLeft, 'ADDONShLOCKEDf');
            G.playerAddOns |= kAddOnLock;
            ok = true;
          }
          break;
        case 1:
          NewTextEffect(320, 240, kEffectSinLines + kEffectMoveDown, 'MINESee');
          G.numMines += 5;
          ok = true;
          break;
        case 2:
          NewTextEffect(320, 240, kEffectExplode, 'MISSILESe');
          G.numMissiles += 5;
          ok = true;
          break;
        case 3:
          if (!(G.playerAddOns & kAddOnSpikes)) {
            NewTextEffect(320, 240, kEffectExplode, 'SPIKESe');
            G.playerAddOns |= kAddOnSpikes;
            ok = true;
          }
          break;
        case 4:
          // Port change: crates never give the Police Jammer; the roll is redrawn instead.
          if (kCrateGivesPoliceJammer && !(G.playerAddOns & kAddOnCop)) {
            NewTextEffect(320, 240, kEffectSinLines, 'POLICEhJAMMER');
            G.playerAddOns |= kAddOnCop;
            ok = true;
          }
          break;
        case 5:
          if (!(G.playerAddOns & kAddOnTurbo)) {
            NewTextEffect(320, 240, kEffectExplode, 'TURBOhENGINEeee');
            G.playerAddOns |= kAddOnTurbo;
            ok = true;
          }
          break;
        case 6:
          NewTextEffect(320, 240, kEffectExplode, '][[[hAWARDEDf');
          G.playerScore += 2000;
          ok = true;
          break;
        case 7:
          NewTextEffect(320, 240, kEffectSinLines + kEffectMoveUp, 'EXTRAhLIFEee');
          G.playerLives++;
          SimplePlaySound(154);
          ok = true;
          break;
      }
    } while (!ok);
  } else G.playerBonus = o.frame - t.frame + 2;
  KillObject(o);
}

export function HandleCollision(posObj) {
  for (let o = G.firstVisObj; o !== G.lastVisObj; o = o.next) {
    if (o === posObj || o === posObj.shooter || posObj === o.shooter) continue;
    const xdist = o.pos.x - posObj.pos.x;
    const ydist = o.pos.y - posObj.pos.y;
    const sqdist = xdist * xdist + ydist * ydist;
    if (sqdist >= kMaxCollDist * kMaxCollDist || !TestCollision(posObj, o, sqdist)) continue;
    if (o.type.flags & kObjectBounce) {
      if (posObj.type.flags2 & kObjectMissile) {
        posObj.jumpHeight = 0;
        posObj.jumpVelo = 0;
        KillObject(o);
      } else BounceObjects(o, posObj);
    }
    if (VEC2D_Value(posObj.velo) > kMinJumpVelo) {
      let jumpScore = 0;
      if (o.type.flags2 & kObjectRamp) {
        posObj.jumpVelo = VEC2D_Value(posObj.velo);
        jumpScore = o.type.score;
      }
      if (o.type.flags2 & kObjectBump) {
        posObj.jumpVelo = VEC2D_Value(posObj.velo) * 0.45;
        jumpScore = o.type.score;
      }
      if (posObj === G.playerObj && jumpScore) {
        G.playerScore += jumpScore;
        NewTextEffect(o.pos.x, o.pos.y, kEffectExplode + kEffectTiny + kEffectAbsPos, MakeFXStringFromNumStr(jumpScore));
      }
    }
    if (o.type.flags & kObjectKillsCars) KillObject(posObj);
    if (o.type.flags & kObjectKilledByCars) KillObject(o);
    if (o.type.flags2 & kObjectOil)
      posObj.rotVelo = (Math.abs(posObj.rotVelo) > 0.2 ? 1 : 0) * (posObj.rotVelo > 0 ? 1 : -1) * PI * 0.05 * VEC2D_Value(posObj.velo);
    if (posObj === G.playerObj) {
      if (o.type.flags & kObjectBonusFlag) BonusObject(o);
    } else if (o === G.spikeObj && posObj.type.flags2 & kObjectDamageble) {
      DamageObj(posObj, VEC2D_Value(G.playerObj.velo) * kLowFrameDuration * 9, VEC2D_Norm(VEC2D_Difference(o.pos, posObj.pos)));
      PlaySound(posObj.pos, G.playerObj.velo, 1, VEC2D_Value(G.playerObj.velo) / 70, 143);
    }
  }
}

// AI driving: track following, traffic avoidance, road-crossing animals and cop chases (objectControl.c).

import {
  G, newInputData, kScale, kFrameDuration, kLowFrameDuration, kVisDist, kMinCarDist,
  kObjectNoInput, kObjectDriveUp, kObjectDriveDown, kObjectCrossRoad, kObjectCopControl,
  kObjectBackCollFlag, kObjectBounce, kObjectRoadKill, kObjectKilledByCars, kObjectOvertake, kObjectSlow,
  kObjectHeliFlag, kObjectCop, kObjectDamageble, kTargetOvertake, kTargetNoStop, kAddOnCop,
} from './state.js';
import { PI, sin, cos } from './trig.js';
import { RanProb } from './random.js';
import { P2D, VEC2D_Sum, VEC2D_Difference, VEC2D_Scale, VEC2D_DotProduct, VEC2D_CrossProduct, VEC2D_Value, VEC2D_Norm } from './vec2d.js';
import { PlaySound } from './sound.js';
import { roadIndex, trackPoint, idiv } from './objects.js';

const kOvertakeDist = 7.0;
const kControlSteering = 0.8;
const kPreSteerTime = 4 * kFrameDuration;
const kTargetSwitchDist = 50.0;
const kChaseSpeed = 2.4;
const kChaseDist = 40.0;
const kFinalChaseSpeed = 20.0;
const kCallFriendProbility = 0.1;
const kCopExtraBurstVelo = 30.0;
const kCopExtraBurst = 1.8;
const kStartChaseDist = 42.0;
const kStartChaseSpeed = 28.0;

// Squared distance (truncated to int, as in the original) to the closest car-like visible object.
function GetCloseCar(pos) {
  let dist = 0x7fffffff;
  for (let o = G.firstVisObj; o !== G.lastVisObj; o = o.next) {
    if (o.type.flags & (kObjectBackCollFlag + kObjectBounce) || o.type.flags2 & kObjectRoadKill) {
      const xdist = o.pos.x - pos.x;
      const ydist = o.pos.y - pos.y;
      const sqdist = xdist * xdist + ydist * ydist;
      if (sqdist < dist) dist = Math.trunc(sqdist);
    }
  }
  return dist;
}

function CheckTarget(o) {
  const upward = o.control === kObjectDriveUp || o.control === kObjectCopControl;
  const track = upward ? G.trackUp : G.trackDown;
  if (!track.num) return;
  const t = trackPoint(track, o.target);
  const tx = t.x - o.pos.x;
  const ty = t.y - o.pos.y;
  const sqTargDist = tx * tx + ty * ty;
  const passed = upward ? t.y < o.pos.y : t.y > o.pos.y;
  if (sqTargDist < kTargetSwitchDist * kTargetSwitchDist || passed) o.target = (o.target + 1) % track.num;
}

function TargetObject(o) {
  return {
    x: o.pos.x,
    y: o.pos.y,
    flags: o.type.flags & kObjectKilledByCars ? 0 : kTargetNoStop,
    velo: kFinalChaseSpeed + VEC2D_Value(G.playerObj.velo),
  };
}

function ObjectFollow(o, target, input) {
  let objDir = P2D(sin(o.dir), cos(o.dir));
  const t = o.type;
  const velo = VEC2D_DotProduct(objDir, o.velo) < 0 ? -VEC2D_Value(o.velo) : VEC2D_Value(o.velo);
  const offs =
    t.flags & kObjectOvertake && target.flags === kTargetOvertake
      ? Math.trunc(o.control === kObjectDriveUp ? -kOvertakeDist * kScale : kOvertakeDist * kScale)
      : 0;
  const targetDiff = VEC2D_Difference(P2D(target.x + offs, target.y), o.pos);
  const targetDist = VEC2D_Value(targetDiff);
  input.throttle = velo < (t.flags & kObjectSlow ? 0.6 : 1) * (offs ? 2 : 1) * target.velo ? 1 : 0;
  input.brake = 0;
  if (Math.abs(o.pos.y - G.cameraObj.pos.y) < kVisDist && !(target.flags & kTargetNoStop) && !(t.flags & kObjectHeliFlag)) {
    // Original bug: dist=GetCloseCar(..)<X assigns the comparison result, so dist is 0 or 1.
    const dist = GetCloseCar(VEC2D_Sum(o.pos, VEC2D_Scale(objDir, kMinCarDist * 0.5 * kScale))) < kScale * kScale * 5 * 5 ? 1 : 0;
    if (dist) input.brake = 0.1;
    else if (dist < kScale * kScale * kMinCarDist * kMinCarDist * 0.5 * 0.5) {
      if (GetCloseCar(VEC2D_Sum(o.pos, VEC2D_Scale(objDir, kMinCarDist * kScale))) < kScale * kScale * 8 * 8) input.throttle = 0.0;
      else if (GetCloseCar(VEC2D_Sum(o.pos, VEC2D_Scale(objDir, kMinCarDist * 0.2 * kScale))) < kScale * kScale * 3 * 3) {
        input.brake = 0.4;
        if (!(o.velo.x > 0.5 || o.velo.y > 0.5) && RanProb(0.012)) PlaySound(o.pos, o.velo, 1.0, 1.0, 136);
      }
    }
  }
  objDir = P2D(sin(o.dir + o.rotVelo * kPreSteerTime), cos(o.dir + o.rotVelo * kPreSteerTime));
  input.steering = (-VEC2D_CrossProduct(objDir, targetDiff) / (targetDist > 100 ? targetDist : 100)) * kControlSteering;
  if (VEC2D_DotProduct(objDir, targetDiff) < 0 && !(t.flags2 & kObjectRoadKill)) input.brake = 0.6;
  if (o.control === kObjectCopControl && VEC2D_Value(o.velo) < kCopExtraBurstVelo) input.throttle *= kCopExtraBurst;
  if (input.brake) input.throttle = 0;
}

export function ObjectStartChase(o, distance, velo) {
  distance = Math.trunc(distance);
  const up = G.trackUp;
  let target;
  for (target = 1; target < up.num && up.track[target].y < G.playerObj.pos.y - distance; target++);
  target++;
  o.target = target;
  o.control = kObjectCopControl;
  o.pos.y = G.playerObj.pos.y - kStartChaseDist * kScale;
  const a = trackPoint(up, target - 1);
  const b = trackPoint(up, target);
  o.pos.x = a.x + idiv(b.x - a.x, b.y - a.y) * (o.pos.y - a.y);
  o.dir = Math.atan((o.pos.x - b.x) / (o.pos.y - b.y));
  o.velo = VEC2D_Scale(VEC2D_Norm(P2D(o.pos.x - b.x, o.pos.y - b.y)), -velo);
}

function CallFriend(copObj) {
  let farObj = null;
  let dist = 0;
  for (let o = G.firstObj.next; o !== G.firstObj; o = o.next) {
    if (o.type.flags & kObjectCop) {
      const xdist = o.pos.x - copObj.pos.x;
      const ydist = o.pos.y - copObj.pos.y;
      const sqdist = xdist * xdist + ydist * ydist;
      if (sqdist > dist) {
        dist = Math.trunc(sqdist);
        farObj = o;
      }
    }
  }
  if (farObj && Math.abs(farObj.pos.y - G.playerObj.pos.y) > kVisDist * 2)
    ObjectStartChase(farObj, G.playerObj.pos.y - copObj.pos.y + 50, kStartChaseSpeed);
}

function CopFollow(o, input) {
  if (Math.abs(o.pos.y - G.cameraObj.pos.y) > kVisDist || G.playerAddOns & kAddOnCop || G.finishDelay || G.playerDeathDelay) {
    o.control = kObjectDriveUp;
    return;
  }
  const player = G.playerObj;
  if (player.pos.y > o.pos.y && player.pos.y < o.pos.y + kChaseDist * kScale) {
    const road = G.roadData;
    const objRoad = roadIndex(o.pos.y);
    const plrRoad = roadIndex(player.pos.y);
    if (RanProb(kCallFriendProbility * kLowFrameDuration)) CallFriend(o);
    if (road[objRoad + 1] === road[objRoad + 2] || road[objRoad + 1] > o.pos.x === road[plrRoad + 1] > player.pos.x) {
      const playerTarget = newInputData();
      const roadTarget = newInputData();
      ObjectFollow(o, TargetObject(player), playerTarget);
      const target = { ...trackPoint(G.trackUp, o.target) };
      target.velo = kFinalChaseSpeed + VEC2D_Value(player.velo);
      if (!(o.type.flags & kObjectKilledByCars)) target.flags |= kTargetNoStop;
      ObjectFollow(o, target, roadTarget);
      Object.assign(input, Math.abs(playerTarget.steering - roadTarget.steering) > 0.9 ? roadTarget : playerTarget);
      return;
    }
  }
  const target = { ...trackPoint(G.trackUp, o.target) };
  if (player.pos.y > o.pos.y) {
    target.velo *= kChaseSpeed;
    if (player.pos.y < o.pos.y + 5 * kChaseDist * kScale) {
      if (!(o.type.flags & kObjectKilledByCars)) target.flags |= kTargetNoStop;
      target.velo = kFinalChaseSpeed + VEC2D_Value(player.velo);
    }
    ObjectFollow(o, target, input);
  } else {
    target.velo = 0;
    ObjectFollow(o, target, input);
    input.brake = 1;
    input.throttle = 0;
  }
}

function ObjectCrossRoad(o, input) {
  const road = G.roadData;
  const r = roadIndex(o.pos.y);
  const target = { y: o.pos.y, flags: o.type.flags & kObjectOvertake ? kTargetNoStop : 0, velo: Infinity, x: 0 };
  if (road[r + 3] + 200 < o.pos.x) target.x = road[r];
  else if (road[r] - 200 > o.pos.x) target.x = road[r + 3];
  else if (o.dir > PI) target.x = road[r];
  else target.x = road[r + 3];
  ObjectFollow(o, target, input);
}

export function ObjectControl(o, input) {
  CheckTarget(o);
  if (o === G.playerObj) {
    Object.assign(o.input, input);
    if (G.finishDelay) {
      o.input.handbrake = 1;
      o.input.throttle = 0;
    }
  } else if (!(o.type.flags2 & kObjectDamageble) || o.damage < o.type.maxDamage) {
    switch (o.control) {
      case kObjectNoInput:
        o.input.brake = 0;
        o.input.throttle = 0;
        o.input.steering = 0;
        break;
      case kObjectDriveUp:
        ObjectFollow(o, trackPoint(G.trackUp, o.target), o.input);
        break;
      case kObjectDriveDown:
        ObjectFollow(o, trackPoint(G.trackDown, o.target), o.input);
        break;
      case kObjectCrossRoad:
        ObjectCrossRoad(o, o.input);
        break;
      case kObjectCopControl:
        CopFollow(o, o.input);
        break;
    }
  } else {
    o.input.brake = 0;
    o.input.throttle = 0;
    o.input.steering = 0;
  }
}

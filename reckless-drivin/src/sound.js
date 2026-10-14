// Sound playback (sound.c) on Web Audio. Effect channels follow the original priority scheme;
// engine and skid sounds are looping sources whose gain and rate are updated every frame.

import { G, kAddOnTurbo } from './state.js';
import { RanInt } from './random.js';
import { VEC2D_Value, VEC2D_Difference } from './vec2d.js';

const kNumChannels = 3;
const kNumHQChannels = 6;
const kMaxPanDist = 400.0;
const kMaxListenDist = 1250.0;
const kMaxNoiseVelo = 65.0;
const kMinSqueakSlide = 0.5;
const kSqueakFactor = 0.5;
const kNumGears = 4;
const kHighestGear = 55.0;
const kHighestGearTurbo = 70.0;
const kShiftTolerance = 2.5;
const kSoundPriorityHigher = 1 << 0;

let ctx = null;
let master = null;
const sounds = new Map();
let channels = [];
const car = { engine: null, skid: null };
let gGear = 0;

const gVolume = () => G.prefs.volume / 256.0;

function decodeSound(ctx, v) {
  const numSamples = v.getUint32(0);
  const s = { priority: v.getUint32(4), flags: v.getUint32(8), buffers: [] };
  for (let i = 0; i < numSamples; i++) {
    const o = v.getUint32(12 + i * 4);
    const rate = v.getUint32(o + 8) / 65536;
    const encode = v.getUint8(o + 20);
    let data;
    if (encode === 0) {
      const n = v.getUint32(o + 4);
      data = new Float32Array(n);
      for (let k = 0; k < n; k++) data[k] = (v.getUint8(o + 22 + k) - 128) / 128;
    } else if (encode === 0xff) {
      const n = v.getUint32(o + 22);
      const sampleSize = v.getUint16(o + 48);
      data = new Float32Array(n);
      if (sampleSize === 16) for (let k = 0; k < n; k++) data[k] = v.getInt16(o + 64 + k * 2) / 32768;
      else for (let k = 0; k < n; k++) data[k] = (v.getUint8(o + 64 + k) - 128) / 128;
    } else {
      continue;
    }
    const buf = ctx.createBuffer(1, data.length, rate);
    buf.copyToChannel(data, 0);
    s.buffers.push(buf);
  }
  return s;
}

export function initSound() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  const pack = G.data.soundPack;
  for (const id of pack.ids) sounds.set(id, decodeSound(ctx, pack.entryView(id)));
  InitChannels();
  const resume = () => {
    if (ctx.state !== 'running') ctx.resume();
  };
  window.addEventListener('keydown', resume, true);
  window.addEventListener('mousedown', resume, true);
}

export function InitChannels() {
  const n = G.prefs.hqSound ? kNumHQChannels : kNumChannels;
  channels = Array.from({ length: n }, () => ({ priority: 0, source: null }));
}

// A mono source routed through independent left/right gains (Sound Manager volumeCmd).
function makeVoice(buffer, loop) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  const left = ctx.createGain();
  const right = ctx.createGain();
  const merger = ctx.createChannelMerger(2);
  source.connect(left);
  source.connect(right);
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  merger.connect(master);
  return { source, left, right };
}

function stopVoice(v) {
  if (!v) return;
  v.source.onended = null;
  try {
    v.source.stop();
  } catch {
    // already stopped
  }
  v.source.disconnect();
}

const toVol = (x) => Math.trunc(0x100 * x) / 0x100;

function playOnChannel(id, volL, volR, pos) {
  const sound = sounds.get(id);
  if (!sound || !sound.buffers.length) return;
  let priority = 0xffffffff;
  let chan = null;
  for (const c of channels) {
    if (priority > c.priority) {
      priority = c.priority;
      chan = c;
    }
  }
  if (sound.flags & kSoundPriorityHigher) {
    if (priority >= sound.priority) return;
  } else if (priority > sound.priority) return;
  let dist = 1;
  if (pos) {
    dist = 1 - VEC2D_Value(VEC2D_Difference(pos, G.cameraObj.pos)) * (1 / kMaxListenDist);
    if (dist <= 0) return;
  }
  chan.priority = sound.priority;
  stopVoice(chan.source);
  const voice = makeVoice(sound.buffers[RanInt(0, sound.buffers.length)], false);
  voice.left.gain.value = toVol(volL * dist);
  voice.right.gain.value = toVol(volR * dist);
  voice.source.onended = () => {
    if (chan.source === voice) {
      chan.priority = 0;
      chan.source = null;
    }
  };
  chan.source = voice;
  voice.source.start();
}

export function PlaySound(pos, velo, freq, vol, id) {
  if (!ctx || !G.prefs.sound) return;
  let pan = (pos.x - G.cameraObj.pos.x) * (1 / kMaxPanDist);
  if (Math.abs(pan) > 1) pan = pan > 0 ? 1 : -1;
  vol *= gVolume();
  playOnChannel(id, vol * (1 - pan), vol * (1 + pan), pos);
}

export function SimplePlaySound(id) {
  if (!ctx || !G.prefs.sound) return;
  playOnChannel(id, gVolume(), gVolume(), null);
}

export function BeQuiet() {
  if (!ctx) return;
  for (const c of channels) {
    stopVoice(c.source);
    c.source = null;
    c.priority = 0;
  }
  stopVoice(car.engine);
  stopVoice(car.skid);
  car.engine = null;
  car.skid = null;
}

function startLoop(id) {
  const sound = sounds.get(id);
  if (!sound || !sound.buffers.length) return null;
  const voice = makeVoice(sound.buffers[RanInt(0, sound.buffers.length)], true);
  voice.left.gain.value = 0;
  voice.right.gain.value = 0;
  voice.source.start();
  return voice;
}

export function StartCarChannels() {
  if (!ctx) return;
  stopVoice(car.engine);
  stopVoice(car.skid);
  car.engine = null;
  car.skid = null;
  if (G.prefs.engineSound && G.prefs.sound) {
    car.engine = startLoop(132);
    car.skid = startLoop(G.roadInfo.skidSound);
  }
  SetCarSound(0, 0, 0, 0);
}

export function SetCarSound(engine, skidL, skidR, velo) {
  if (!ctx || !(G.prefs.engineSound && G.prefs.sound) || !car.engine) return;
  const vol = gVolume();
  let gearVelo;
  if (!G.roadInfo.water) {
    const highestGear = G.playerAddOns & kAddOnTurbo ? kHighestGearTurbo : kHighestGear;
    while (velo > ((gGear + 1) * highestGear) / kNumGears + kShiftTolerance && gGear + 1 < kNumGears) gGear++;
    while (velo < (gGear * highestGear) / kNumGears - kShiftTolerance && gGear > 0) gGear--;
    gearVelo = (Math.abs(velo) / highestGear) * kNumGears - gGear;
    velo /= kMaxNoiseVelo;
    if (gearVelo > 2) gearVelo = 2;
  } else {
    velo /= kMaxNoiseVelo;
    gearVelo = (engine + velo) / 2;
  }
  velo = Math.abs(velo);
  const engineVol = engine !== -1 ? -vol / (0.6 * engine + 0.15 * velo + 0.25 * gearVelo - 2) : 0;
  const ev = Math.trunc(0x0048 * engineVol * vol) / 0x100;
  car.engine.left.gain.value = ev;
  car.engine.right.gain.value = ev;
  const rate = Math.trunc(0x0000b000 * (0.2 + 0.3 * engine + 0.2 * velo + 0.3 * gearVelo)) / 0x10000;
  car.engine.source.playbackRate.value = Math.max(rate, 0);

  skidL = (skidL - kMinSqueakSlide) / kSqueakFactor;
  skidL = skidL < 0 ? 0 : skidL > 1 ? 1 : skidL;
  skidR = (skidR - kMinSqueakSlide) / kSqueakFactor;
  skidR = skidR < 0 ? 0 : skidR > 1 ? 1 : skidR;
  if (car.skid) {
    car.skid.left.gain.value = toVol(skidL * vol * (velo * 0.5 + 0.5));
    car.skid.right.gain.value = toVol(skidR * vol * (velo * 0.5 + 0.5));
    const skidRate = skidL + skidR ? Math.trunc(0x00020000 * (-1 / ((skidL + skidR) * 0.25 + velo * 0.5 - 2))) / 0x10000 : 0;
    car.skid.source.playbackRate.value = Math.max(skidRate, 0);
  }
}

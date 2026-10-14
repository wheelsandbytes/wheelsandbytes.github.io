// Preferences and high scores (preferences.c), persisted to localStorage. Defaults come from the
// game's 'Pref' 130 resource (the profile the original picked for fast machines).

import { G, kNumElements } from './state.js';

const kStorageKey = 'recklessDrivin.prefs';
const kPrefsVersion = 4;
export const kNumHighScoreEntrys = 10;

export function parsePrefResource(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const pstr = (o) => String.fromCharCode(...b.subarray(o + 1, o + 1 + b[o]));
  const high = [];
  for (let i = 0; i < kNumHighScoreEntrys; i++) {
    const o = 32 + i * 24;
    high.push({ name: pstr(o), time: v.getUint32(o + 16), score: v.getUint32(o + 20) });
  }
  const lapRecords = [];
  for (let i = 0; i < 10; i++) lapRecords.push(v.getFloat32(272 + i * 4));
  return {
    version: v.getUint16(0),
    volume: v.getUint16(2),
    sound: b[4],
    engineSound: b[5],
    hqSound: b[6],
    lineSkip: 0,
    motionBlur: b[9],
    hiColor: 1,
    high,
    lapRecords,
    keyCodes: [...b.subarray(824, 824 + kNumElements)],
    lastName: pstr(834),
  };
}

let defaults = null;

export function LoadPrefs(resources) {
  defaults = parsePrefResource(resources.get('Pref', 130));
  let prefs = null;
  try {
    prefs = JSON.parse(localStorage.getItem(kStorageKey));
  } catch {
    prefs = null;
  }
  if (!prefs || prefs.version !== kPrefsVersion) prefs = structuredClone(defaults);
  G.prefs = prefs;
}

export function savePrefs() {
  try {
    localStorage.setItem(kStorageKey, JSON.stringify(G.prefs));
  } catch {
    // storage unavailable (e.g. private mode); keep prefs in memory only
  }
}

export function defaultKeyCodes() {
  return [...defaults.keyCodes];
}

export function ClearHighScores() {
  G.prefs.high = structuredClone(defaults.high);
  savePrefs();
}

// Keyboard and mouse input (input.c). Game controls are polled each frame like GetKeys(); the menus
// consume a queue of mouse/key events.

import {
  G, kFrameDuration, kForward, kBackward, kLeft, kRight, kKickdown, kBrake, kFire, kMissile, kAbort, kPause,
  kNumElements, newInputData,
} from './state.js';
import { sin, cos } from './trig.js';
import { VEC2D_DotProduct, P2D } from './vec2d.js';

const kMinSwitchDelay = 15;

// Mac virtual key codes (as stored in prefs keyCodes) to KeyboardEvent.code values.
export const macKeyToCodes = {
  0x00: ['KeyA'], 0x01: ['KeyS'], 0x02: ['KeyD'], 0x03: ['KeyF'], 0x04: ['KeyH'], 0x05: ['KeyG'],
  0x06: ['KeyZ'], 0x07: ['KeyX'], 0x08: ['KeyC'], 0x09: ['KeyV'], 0x0b: ['KeyB'], 0x0c: ['KeyQ'],
  0x0d: ['KeyW'], 0x0e: ['KeyE'], 0x0f: ['KeyR'], 0x10: ['KeyY'], 0x11: ['KeyT'], 0x12: ['Digit1'],
  0x13: ['Digit2'], 0x14: ['Digit3'], 0x15: ['Digit4'], 0x16: ['Digit6'], 0x17: ['Digit5'], 0x18: ['Equal'],
  0x19: ['Digit9'], 0x1a: ['Digit7'], 0x1b: ['Minus'], 0x1c: ['Digit8'], 0x1d: ['Digit0'], 0x1e: ['BracketRight'],
  0x1f: ['KeyO'], 0x20: ['KeyU'], 0x21: ['BracketLeft'], 0x22: ['KeyI'], 0x23: ['KeyP'], 0x24: ['Enter'],
  0x25: ['KeyL'], 0x26: ['KeyJ'], 0x27: ['Quote'], 0x28: ['KeyK'], 0x29: ['Semicolon'], 0x2a: ['Backslash'],
  0x2b: ['Comma'], 0x2c: ['Slash'], 0x2d: ['KeyN'], 0x2e: ['KeyM'], 0x2f: ['Period'], 0x30: ['Tab'],
  0x31: ['Space'], 0x32: ['Backquote'], 0x33: ['Backspace'], 0x35: ['Escape'],
  0x37: ['MetaLeft', 'MetaRight'], 0x38: ['ShiftLeft', 'ShiftRight'], 0x39: ['CapsLock'],
  0x3a: ['AltLeft', 'AltRight'], 0x3b: ['ControlLeft', 'ControlRight'],
  0x41: ['NumpadDecimal'], 0x43: ['NumpadMultiply'], 0x45: ['NumpadAdd'], 0x47: ['NumLock'],
  0x4b: ['NumpadDivide'], 0x4c: ['NumpadEnter'], 0x4e: ['NumpadSubtract'], 0x51: ['NumpadEqual'],
  0x52: ['Numpad0'], 0x53: ['Numpad1'], 0x54: ['Numpad2'], 0x55: ['Numpad3'], 0x56: ['Numpad4'],
  0x57: ['Numpad5'], 0x58: ['Numpad6'], 0x59: ['Numpad7'], 0x5b: ['Numpad8'], 0x5c: ['Numpad9'],
  0x60: ['F5'], 0x61: ['F6'], 0x62: ['F7'], 0x63: ['F3'], 0x64: ['F8'], 0x65: ['F9'], 0x67: ['F11'],
  0x6d: ['F10'], 0x6f: ['F12'], 0x72: ['Insert', 'Help'], 0x73: ['Home'], 0x74: ['PageUp'], 0x75: ['Delete'],
  0x76: ['F4'], 0x77: ['End'], 0x78: ['F2'], 0x79: ['PageDown'], 0x7a: ['F1'], 0x7b: ['ArrowLeft'],
  0x7c: ['ArrowRight'], 0x7d: ['ArrowDown'], 0x7e: ['ArrowUp'],
};

export function codeToMacKey(code) {
  for (const [k, codes] of Object.entries(macKeyToCodes)) if (codes.includes(code)) return Number(k);
  return -1;
}

// Extra bindings so the game is playable without a numpad, and without the Command key.
const aliases = {
  [kForward]: ['ArrowUp'],
  [kBackward]: ['ArrowDown'],
  [kLeft]: ['ArrowLeft'],
  [kRight]: ['ArrowRight'],
  [kFire]: ['KeyZ'],
  [kMissile]: ['KeyX'],
};

const down = new Set();
const tapped = new Set(); // pressed and released since the last poll
let gameKeys = new Set();
export const mouse = { x: 0, y: 0, down: false };
const eventQueue = [];
let eventWaiter = null;

export function elementCodes(element) {
  const codes = [...(macKeyToCodes[G.prefs.keyCodes[element]] ?? [])];
  if (element < kAbort) for (const c of aliases[element] ?? []) if (!codes.includes(c)) codes.push(c);
  return codes;
}

export function updateKeyBindings() {
  gameKeys = new Set();
  for (let e = 0; e < kNumElements; e++) for (const c of elementCodes(e)) gameKeys.add(c);
}

function pushEvent(e) {
  eventQueue.push(e);
  if (eventWaiter) {
    const w = eventWaiter;
    eventWaiter = null;
    w();
  }
}

export function initInput(canvas) {
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor(((e.clientX - r.left) * canvas.width) / r.width), y: Math.floor(((e.clientY - r.top) * canvas.height) / r.height) };
  };
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('.rd-dialog')) return;
    down.add(e.code);
    if (G.gameOn && gameKeys.has(e.code)) e.preventDefault();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) pushEvent({ type: 'keydown', key: e.key, code: e.code, altKey: e.altKey });
  });
  window.addEventListener('keyup', (e) => {
    if (down.has(e.code)) tapped.add(e.code);
    down.delete(e.code);
    // macOS doesn't report keyup for other keys while Command is held.
    if (e.key === 'Meta') {
      for (const c of down) tapped.add(c);
      down.clear();
    }
  });
  window.addEventListener('blur', () => {
    down.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousedown', (e) => {
    Object.assign(mouse, toCanvas(e), { down: true });
    pushEvent({ type: 'mousedown', x: mouse.x, y: mouse.y, altKey: e.altKey });
  });
  window.addEventListener('mouseup', (e) => {
    Object.assign(mouse, toCanvas(e), { down: false });
    pushEvent({ type: 'mouseup', x: mouse.x, y: mouse.y });
  });
  window.addEventListener('mousemove', (e) => {
    Object.assign(mouse, toCanvas(e));
    pushEvent({ type: 'mousemove', x: mouse.x, y: mouse.y });
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  updateKeyBindings();
}

// Waits for the next queued event, or returns null after timeoutMs.
export function waitEvent(timeoutMs) {
  if (eventQueue.length) return Promise.resolve(eventQueue.shift());
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      eventWaiter = null;
      resolve(null);
    }, timeoutMs);
    eventWaiter = () => {
      clearTimeout(timer);
      resolve(eventQueue.shift());
    };
  });
}

export function FlushEvents() {
  eventQueue.length = 0;
  tapped.clear();
}

export function anyKeyDown() {
  return down.size > 0 || tapped.size > 0;
}

function GetElement(element) {
  for (const c of elementCodes(element)) if (down.has(c) || tapped.has(c)) return true;
  return false;
}

const gInputData = newInputData();
let gSwitchDelayStart = 0;
const gLastScan = new Array(kNumElements).fill(false);

export function InputMode() {
  gLastScan.fill(false);
}

function ThrottleReset(throttle) {
  if (throttle > 0) {
    throttle -= 2 * kFrameDuration;
    if (throttle < 0) throttle = 0;
  } else if (throttle < 0) {
    throttle += 2 * kFrameDuration;
    if (throttle > 0) throttle = 0;
  }
  return throttle;
}

export function Input() {
  const p = G.playerObj;
  const playerVelo = Math.trunc(VEC2D_DotProduct(p.velo, P2D(sin(p.dir), cos(p.dir))));
  let axState = 0;
  let switchRequest = false;
  G.missile = false;
  G.fire = false;
  if (playerVelo) gSwitchDelayStart = G.frameCount;
  gInputData.handbrake = GetElement(kBrake) ? gInputData.handbrake + kFrameDuration * 8 : 0;
  if (gInputData.handbrake > 1) gInputData.handbrake = 1;
  gInputData.kickdown = 0;
  if (GetElement(kForward)) axState = 1;
  if (GetElement(kBackward)) axState = -1;
  const requestSwitch = () => {
    switchRequest = true;
    gSwitchDelayStart = G.frameCount - kMinSwitchDelay;
  };
  switch (axState) {
    case 1:
      if (!gInputData.reverse) {
        gInputData.throttle += 3 * kFrameDuration;
        if (gInputData.throttle > 1) gInputData.throttle = 1;
        gInputData.brake = 0;
        if (playerVelo < 0) requestSwitch();
      } else {
        gInputData.brake += kFrameDuration * 6;
        if (gInputData.brake > 1) gInputData.brake = 1;
        gInputData.throttle = ThrottleReset(gInputData.throttle);
        if (!playerVelo) switchRequest = true;
        if (playerVelo > 0) requestSwitch();
      }
      break;
    case -1:
      if (gInputData.reverse) {
        gInputData.throttle -= 3 * kFrameDuration;
        if (gInputData.throttle < -1) gInputData.throttle = -1;
        gInputData.brake = 0;
        if (playerVelo > 0) requestSwitch();
      } else {
        gInputData.brake += kFrameDuration * 6;
        if (gInputData.brake > 1) gInputData.brake = 1;
        gInputData.throttle = ThrottleReset(gInputData.throttle);
        if (!playerVelo) switchRequest = true;
        if (playerVelo < 0) requestSwitch();
      }
      break;
    default:
      gInputData.brake = 0;
      gInputData.throttle = ThrottleReset(gInputData.throttle);
      break;
  }
  if (GetElement(kKickdown) && axState !== -1) {
    gInputData.kickdown = 1;
    gInputData.throttle = 1;
    if (gInputData.reverse && !gInputData.brake) requestSwitch();
  }
  axState = 0;
  if (GetElement(kRight)) axState = 1;
  if (GetElement(kLeft)) axState = -1;
  switch (axState) {
    case 1:
      // Original quirk: steering snaps by 8 when it had the opposite sign.
      gInputData.steering += gInputData.steering < 0 ? 8 : 3 * kFrameDuration;
      if (gInputData.steering > 1) gInputData.steering = 1;
      break;
    case -1:
      gInputData.steering -= gInputData.steering > 0 ? 8 : 3 * kFrameDuration;
      if (gInputData.steering < -1) gInputData.steering = -1;
      break;
    default:
      if (gInputData.steering > 0) {
        gInputData.steering -= 8 * kFrameDuration;
        if (gInputData.steering < 0) gInputData.steering = 0;
      } else {
        gInputData.steering += 8 * kFrameDuration;
        if (gInputData.steering > 0) gInputData.steering = 0;
      }
      break;
  }
  // GetEvent: report elements whose state changed since the last poll.
  for (let element = 0; element < kNumElements; element++) {
    const scan = GetElement(element);
    if (scan === gLastScan[element]) continue;
    gLastScan[element] = scan;
    switch (element) {
      case kForward:
        if (!playerVelo && gInputData.reverse && scan) requestSwitch();
        break;
      case kBackward:
        if (!playerVelo && !gInputData.reverse && scan) requestSwitch();
        break;
      case kMissile:
        G.missile = scan;
        break;
      case kFire:
        G.fire = scan;
        break;
      case kAbort:
        G.endGame = true;
        break;
      case kPause:
        if (scan) G.pauseRequested = true;
        break;
    }
  }
  tapped.clear();
  if (switchRequest && G.frameCount >= gSwitchDelayStart + kMinSwitchDelay) gInputData.reverse = gInputData.reverse ? 0 : 1;
  return gInputData;
}

// Menus and full-screen pictures (interface.c, high.c, pause.c, gameendseq.c, preferences dialog).
// Mac dialogs are recreated as HTML overlays.

import { G, kXSize, kYSize } from './state.js';
import { screen, FadeScreen, ScreenClear, present, drawPictureToFront, nextFrame, delay, GetMSTime } from './screen.js';
import { decompressResource } from './lzrw.js';
import { decodePict } from './quickdraw.js';
import { SimplePlaySound, BeQuiet, StartCarChannels, InitChannels } from './sound.js';
import { waitEvent, FlushEvents, anyKeyDown, mouse, InputMode, codeToMacKey, updateKeyBindings } from './input.js';
import { savePrefs, defaultKeyCodes, kNumHighScoreEntrys } from './preferences.js';
import { StartGame, NumLevels } from './gameinitexit.js';
import { PauseFrameCount, ResumeFrameCount } from './gameframe.js';

const kNoButton = -1;
const kStartGameButton = 0;
const kPrefsButton = 1;
const kScoreButton = 2;
const kHelpButton = 3;
const kQuitButton = 4;
const kRegisterButton = 5;

const pictCache = new Map();

export function getPict(id, background) {
  const key = `${id}:${background ?? ''}`;
  let p = pictCache.get(key);
  if (!p) {
    p = decodePict(decompressResource(G.data.resources.get('PPic', id)), background);
    pictCache.set(key, p);
  }
  return p;
}

export function setCursorVisible(visible) {
  screen.canvas.style.cursor = visible ? 'default' : 'none';
}

export async function ShowPicScreen(id) {
  await FadeScreen(1);
  screen.overlay = null;
  drawPictureToFront(getPict(id));
  present();
  await FadeScreen(0);
}

// --- main menu ---

let interfaceInited = false;
let buttons = [];
let buttonLocation = kNoButton;

const inRect = (r, x, y) => x >= r.left && x < r.right && y >= r.top && y < r.bottom;

function buttonAt(x, y) {
  let button = kNoButton;
  buttons.forEach((r, i) => {
    if (inRect(r, x, y)) button = i;
  });
  return button;
}

function registeredOverlay(ctx) {
  ctx.save();
  ctx.font = '12px Geneva, Verdana, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(G.registered ? `Registered To: ${G.prefs.registeredName ?? 'Free'}` : '••• This Copy is not Registered! •••', 630, 475);
  ctx.restore();
}

function DrawScreen(button, pictId) {
  if (button !== kNoButton) drawPictureToFront(getPict(pictId), 0, 0, buttons[button]);
  else {
    drawPictureToFront(getPict(pictId));
    screen.overlay = registeredOverlay;
  }
  present();
}

export function ScreenUpdate() {
  buttonLocation = kNoButton;
  DrawScreen(kNoButton, 1000);
}

export function DisposeInterface() {
  interfaceInited = false;
  screen.overlay = null;
}

export async function InitInterface() {
  if (!interfaceInited) {
    const recs = G.data.resources.get('Recs', 1000);
    const v = new DataView(recs.buffer, recs.byteOffset, recs.byteLength);
    buttons = [];
    for (let i = 0; i < recs.length / 8; i++)
      buttons.push({ top: v.getInt16(i * 8), left: v.getInt16(i * 8 + 2), bottom: v.getInt16(i * 8 + 4), right: v.getInt16(i * 8 + 6) });
    interfaceInited = true;
  }
  InputMode();
  await FadeScreen(1);
  ScreenUpdate();
  await FadeScreen(0);
  FlushEvents();
  G.gameOn = false;
}

function UpdateButtonLocation(x, y) {
  const button = buttonAt(x, y);
  if (button !== buttonLocation) {
    if (button !== kNoButton) DrawScreen(button, 1001);
    if (buttonLocation !== kNoButton) DrawScreen(buttonLocation, 1000);
    buttonLocation = button;
  }
}

async function GetButtonClick(ev) {
  const button = buttonAt(ev.x, ev.y);
  if (button === kNoButton) return kNoButton;
  SimplePlaySound(147);
  let oldClicked = false;
  let clicked = inRect(buttons[button], ev.x, ev.y);
  DrawScreen(button, 1002);
  while (mouse.down) {
    clicked = inRect(buttons[button], mouse.x, mouse.y);
    if (clicked !== oldClicked) DrawScreen(button, clicked ? 1002 : 1000);
    oldClicked = clicked;
    await nextFrame();
  }
  clicked = inRect(buttons[button], mouse.x, mouse.y);
  if (clicked) {
    DrawScreen(button, 1001);
    return button;
  }
  DrawScreen(button, 1000);
  return kNoButton;
}

function GetKeyClick(ev) {
  switch (ev.key.toLowerCase()) {
    case 's':
    case 'n':
      return kStartGameButton;
    case 'p':
      return kPrefsButton;
    case 'c':
    case 'o':
      return kScoreButton;
    case '/':
    case '?':
    case 'h':
      return kHelpButton;
    case 'q':
      return kQuitButton;
    case 'r':
      return kRegisterButton;
  }
  switch (ev.code) {
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
      return kStartGameButton;
    case 'Help':
    case 'Insert':
      return kHelpButton;
    case 'Escape':
      return kQuitButton;
  }
  return kNoButton;
}

async function KeyClick(ev) {
  const button = GetKeyClick(ev);
  if (button === kNoButton) return kNoButton;
  DrawScreen(button, 1002);
  SimplePlaySound(147);
  await delay((10 * 1000) / 60);
  DrawScreen(button, buttonLocation === button ? 1001 : 1000);
  return button;
}

export async function WaitForPress() {
  while (!(anyKeyDown() || mouse.down)) await nextFrame();
  while (mouse.down) await nextFrame();
  FlushEvents();
}

async function HandleCommand(cmd, optionKey) {
  switch (cmd) {
    case kRegisterButton:
      await showAlert('You have already registered this game.', 'Thank you once again!');
      return;
    case kStartGameButton:
      await StartGame(optionKey);
      break;
    case kPrefsButton:
      await Preferences();
      break;
    case kHelpButton:
      await ShowPicScreen(1007);
      await WaitForPress();
      await ShowPicScreen(1008);
      await WaitForPress();
      await FadeScreen(1);
      ScreenUpdate();
      await FadeScreen(0);
      break;
    case kScoreButton:
      await ShowHighScores(-1);
      break;
    case kQuitButton:
      G.exit = true;
      break;
  }
}

export async function Eventloop() {
  setCursorVisible(true);
  const ev = await waitEvent(100);
  if (!ev) return;
  switch (ev.type) {
    case 'mousedown':
      await HandleCommand(await GetButtonClick(ev), ev.altKey);
      break;
    case 'keydown':
      await HandleCommand(await KeyClick(ev), ev.altKey);
      break;
    case 'mousemove':
      UpdateButtonLocation(ev.x, ev.y);
      break;
  }
}

// --- high scores (high.c) ---

export async function ShowHighScores(hilite) {
  await ShowPicScreen(1004);
  screen.overlay = (ctx) => {
    ctx.save();
    ctx.fillStyle = '#00ffff';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < kNumHighScoreEntrys; i++) {
      const e = G.prefs.high[i];
      ctx.font = `${i === hilite ? 'bold ' : ''}24px Geneva, Verdana, sans-serif`;
      const y = 180 + i * 30;
      ctx.textAlign = 'left';
      ctx.fillText(e.name, 170, y);
      const s = String(e.score);
      ctx.textAlign = 'right';
      ctx.fillText(s, 480, y);
      if (i === hilite) {
        const w = ctx.measureText(e.name).width;
        ctx.fillRect(170, y + 2, w, 2);
        const sw = ctx.measureText(s).width;
        ctx.fillRect(480 - sw, y + 2, sw, 2);
      }
    }
    ctx.restore();
  };
  present();
  await WaitForPress();
  await FadeScreen(1);
  ScreenUpdate();
  await FadeScreen(0);
}

async function SetHighScoreEntry(index, score) {
  let name = await showPrompt(
    "Congratulations! You’ve made it to the High Score list. Please enter your name:",
    G.prefs.lastName,
    'That’s me!',
  );
  G.prefs.lastName = name;
  if (name.length > 15) name = name.slice(0, 14) + '…';
  G.prefs.high[index] = { name, score, time: Math.floor(Date.now() / 1000) };
}

export async function CheckHighScore(score) {
  const high = G.prefs.high;
  let i;
  for (i = kNumHighScoreEntrys; i > 0 && score > high[i - 1].score; i--);
  if (i < kNumHighScoreEntrys) {
    high.splice(i, 0, { ...high[i] });
    high.length = kNumHighScoreEntrys;
    SimplePlaySound(153);
    await SetHighScoreEntry(i, score);
    savePrefs();
    await ShowHighScores(i);
  }
}

// --- pause (pause.c) ---

export async function PauseGame() {
  PauseFrameCount();
  FlushEvents();
  InputMode();
  BeQuiet();
  await ShowPicScreen(1006);
  setCursorVisible(true);
  for (;;) {
    const ev = await waitEvent(1000);
    if (ev && ev.type === 'mousedown') break;
  }
  while (mouse.down) await nextFrame();
  InputMode();
  setCursorVisible(false);
  ScreenClear();
  StartCarChannels();
  FlushEvents();
  ResumeFrameCount();
}

// --- end credits (gameendseq.c) ---

const kScrollSpeed = 35;

const fontFamilies = {
  Times: 'Times, "Times New Roman", serif',
  Geneva: 'Geneva, Verdana, sans-serif',
  Helvetica: 'Helvetica, Arial, sans-serif',
  Courier: 'Courier, "Courier New", monospace',
  Monaco: 'Monaco, Menlo, monospace',
  Chicago: 'Chicago, Charcoal, system-ui, sans-serif',
};

function renderCredits() {
  const pict = getPict(1009, [0, 0, 0]);
  const c = document.createElement('canvas');
  c.width = pict.width;
  c.height = pict.height;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(pict.rgba, pict.width, pict.height), 0, 0);
  for (const t of pict.text) {
    const name = pict.fonts[t.font] ?? 'Times';
    ctx.font = `${t.face & 1 ? 'bold ' : ''}${t.face & 2 ? 'italic ' : ''}${t.size}px ${fontFamilies[name] ?? name}`;
    ctx.fillStyle = `rgb(${t.color.join(',')})`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t.text, t.x, t.y);
  }
  return c;
}

export async function GameEndSequence() {
  PauseFrameCount();
  BeQuiet();
  await FadeScreen(1);
  const credits = renderCredits();
  const ctx = screen.ctx;
  screen.overlay = null;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, kXSize, kYSize);
  await FadeScreen(512);
  FlushEvents();
  const startMS = GetMSTime();
  const total = credits.height + kYSize;
  for (;;) {
    const yScroll = Math.trunc(((GetMSTime() - startMS) / 1000000) * kScrollSpeed);
    if (yScroll >= total || anyKeyDown() || mouse.down) break;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, kXSize, kYSize);
    ctx.drawImage(credits, kXSize / 2 - credits.width / 2, kYSize - yScroll);
    await nextFrame();
  }
  ScreenClear();
  await FadeScreen(1);
  await FadeScreen(512);
  FlushEvents();
  ResumeFrameCount();
}

// --- dialogs ---

function makeDialog(contentHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'rd-dialog-backdrop';
  const dlg = document.createElement('div');
  dlg.className = 'rd-dialog';
  dlg.innerHTML = contentHtml;
  overlay.appendChild(dlg);
  document.getElementById('game').appendChild(overlay);
  return { overlay, dlg, close: () => overlay.remove() };
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function showAlert(title, text) {
  return new Promise((resolve) => {
    const { dlg, close } = makeDialog(`
      <p class="rd-title">${escapeHtml(title)}</p><p>${escapeHtml(text)}</p>
      <div class="rd-buttons"><button class="rd-default">OK</button></div>`);
    const ok = dlg.querySelector('button');
    ok.focus();
    ok.addEventListener('click', () => {
      close();
      FlushEvents();
      resolve();
    });
  });
}

function showPrompt(text, value, buttonLabel) {
  return new Promise((resolve) => {
    const { dlg, close } = makeDialog(`
      <p>${escapeHtml(text)}</p>
      <input type="text" maxlength="255" value="${escapeHtml(value)}">
      <div class="rd-buttons"><button class="rd-default">${escapeHtml(buttonLabel)}</button></div>`);
    const input = dlg.querySelector('input');
    const done = () => {
      close();
      FlushEvents();
      resolve(input.value);
    };
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done();
    });
    dlg.querySelector('button').addEventListener('click', done);
  });
}

// gameinitexit.c GetLevelNumber: Option-click Start opens this testing dialog.
export function GetLevelNumber() {
  return new Promise((resolve) => {
    const { dlg, close } = makeDialog(`
      <div class="rd-row"><label>Level:</label><input name="level" type="text" value="1" size="4"></div>
      <div class="rd-row"><label>Vehicle#:</label><input name="car" type="text" value="128" size="6"></div>
      <p class="rd-small">This Dialog Box is for internal testing purposes only!<br>(High Scores will be disabled!)</p>
      <div class="rd-buttons"><button class="rd-default">GO!</button></div>`);
    const level = dlg.querySelector('[name=level]');
    level.focus();
    level.select();
    const done = () => {
      G.levelID = (parseInt(level.value, 10) || 0) - 1;
      if (G.levelID >= NumLevels() || G.levelID < 0) G.levelID = 0;
      const car = parseInt(dlg.querySelector('[name=car]').value, 10);
      G.playerCarID = G.data.packs.get(128).entries.has(car) ? car : 128;
      close();
      FlushEvents();
      resolve();
    };
    dlg.querySelector('button').addEventListener('click', done);
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done();
    });
  });
}

// --- preferences dialog (preferences.c) ---

const elementNames = ['Forward', 'Backward', 'Left', 'Right', 'Kickdown', 'Brake', 'Fire (Mines)', 'Missile'];

function keyName(macKey) {
  const s = G.data.resources.get('STR#', 128);
  let o = 2;
  const n = (s[0] << 8) | s[1];
  for (let i = 0; i < n; i++) {
    if (i === macKey) return String.fromCharCode(...s.subarray(o + 1, o + 1 + s[o])) || `0x${macKey.toString(16)}`;
    o += 1 + s[o];
  }
  return `0x${macKey.toString(16)}`;
}

function ConfigureInput(keyCodes) {
  return new Promise((resolve) => {
    const codes = [...keyCodes];
    const rows = elementNames
      .map((n, i) => `<div class="rd-row"><label>${n}:</label><button data-el="${i}" class="rd-key"></button></div>`)
      .join('');
    const { dlg, close } = makeDialog(`
      <p class="rd-title">Configure Controls</p>${rows}
      <p class="rd-small">Click an action, then press a key. Arrow keys and Z/X always work as alternates.</p>
      <div class="rd-buttons"><button name="defaults">Defaults</button><button name="cancel">Cancel</button><button name="ok" class="rd-default">OK</button></div>`);
    const refresh = () => dlg.querySelectorAll('.rd-key').forEach((b) => (b.textContent = keyName(codes[b.dataset.el])));
    refresh();
    let waiting = null;
    dlg.querySelectorAll('.rd-key').forEach((b) =>
      b.addEventListener('click', () => {
        waiting = Number(b.dataset.el);
        b.textContent = 'Press a key…';
      }),
    );
    const onKey = (e) => {
      if (waiting === null) return;
      e.preventDefault();
      e.stopPropagation();
      const k = codeToMacKey(e.code);
      if (k >= 0) codes[waiting] = k;
      waiting = null;
      refresh();
    };
    window.addEventListener('keydown', onKey, true);
    const finish = (result) => {
      window.removeEventListener('keydown', onKey, true);
      close();
      resolve(result);
    };
    dlg.querySelector('[name=defaults]').addEventListener('click', () => {
      const d = defaultKeyCodes();
      for (let i = 0; i < elementNames.length; i++) codes[i] = d[i];
      refresh();
    });
    dlg.querySelector('[name=cancel]').addEventListener('click', () => finish(null));
    dlg.querySelector('[name=ok]').addEventListener('click', () => finish(codes));
  });
}

export function Preferences() {
  const p = G.prefs;
  return new Promise((resolve) => {
    const { dlg, close } = makeDialog(`
      <p class="rd-title">Preferences…</p>
      <fieldset><legend>Controls</legend><button name="controls">Configure Controls…</button></fieldset>
      <fieldset><legend>Graphics</legend>
        <label><input type="checkbox" disabled> Line Skipping</label>
        <label><input type="checkbox" name="motionBlur"> Motion Blur</label>
        <label><input type="checkbox" checked disabled> Use Thousands of Colors</label>
      </fieldset>
      <fieldset><legend><label><input type="checkbox" name="sound"> Sound</label></legend>
        <div class="rd-row"><label>Sound Volume:</label><input type="range" name="volume" min="0" max="256"></div>
        <label><input type="checkbox" name="engineSound"> Engine Sounds</label>
        <label><input type="checkbox" name="hqSound"> High Quality Sounds</label>
      </fieldset>
      <div class="rd-buttons"><button name="cancel">Cancel</button><button name="ok" class="rd-default">OK</button></div>`);
    const q = (n) => dlg.querySelector(`[name=${n}]`);
    q('motionBlur').checked = !!p.motionBlur;
    q('sound').checked = !!p.sound;
    q('volume').value = p.volume;
    q('engineSound').checked = !!p.engineSound;
    q('hqSound').checked = !!p.hqSound;
    const syncSound = () => ['volume', 'engineSound', 'hqSound'].forEach((n) => (q(n).disabled = !q('sound').checked));
    syncSound();
    q('sound').addEventListener('change', syncSound);
    let keyCodes = [...p.keyCodes];
    q('volume').addEventListener('change', () => {
      const saved = { volume: p.volume, sound: p.sound };
      p.volume = Number(q('volume').value);
      p.sound = 1;
      SimplePlaySound(129);
      Object.assign(p, saved);
    });
    q('controls').addEventListener('click', async () => {
      dlg.style.visibility = 'hidden';
      const result = await ConfigureInput(keyCodes);
      if (result) keyCodes = result;
      dlg.style.visibility = '';
    });
    const finish = async (ok) => {
      if (ok) {
        p.motionBlur = q('motionBlur').checked ? 1 : 0;
        p.sound = q('sound').checked ? 1 : 0;
        p.volume = Number(q('volume').value);
        p.engineSound = q('engineSound').checked ? 1 : 0;
        p.hqSound = q('hqSound').checked ? 1 : 0;
        for (let i = 0; i < elementNames.length; i++) p.keyCodes[i] = keyCodes[i];
        savePrefs();
        InitChannels();
        updateKeyBindings();
      }
      close();
      FlushEvents();
      await FadeScreen(1);
      ScreenUpdate();
      await FadeScreen(0);
      resolve();
    };
    q('cancel').addEventListener('click', () => finish(false));
    q('ok').addEventListener('click', () => finish(true));
  });
}

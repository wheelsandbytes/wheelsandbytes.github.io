# Reckless Drivin’ — JavaScript port

A browser port of Jonas Echterhoff’s classic Mac OS game *Reckless Drivin’* (2000), ported from the
[original C source](../RecklessDrivin-master/) with help from the
[Zig port](../open-reckless-drivin-main/)’s data-format work.

The goal is to match the original exactly first: the same 640×480 view, fixed 60 Hz simulation,
physics, AI, rendering and sound. The game renders in software into a 16-bit RGB555 framebuffer,
exactly like the original’s “thousands of colors” mode, and copies it to a `<canvas>` each frame.

## Running

The game loads `data/resources.dat` with `fetch`, so it must be served over HTTP:

```sh
npm run serve        # python3 -m http.server 8080
# open http://localhost:8080
```

To self-host, copy `index.html`, `style.css`, `src/` and `data/` to any static web server; there is
no build step. All paths are relative, so the game also works under a subpath such as
`https://example.com/reckless-drivin/`. Serve it with a trailing slash (redirect
`/reckless-drivin` to `/reckless-drivin/`), otherwise the browser resolves the relative paths
against the site root.

All ten levels are unlocked using the free registration Jonas published
(Name `Free`, Code `B3FB09B1EB`).

## Controls

| Action | Original key | Also |
|---|---|---|
| Accelerate / brake & reverse | Numpad 8 / Numpad 5 | ↑ / ↓ |
| Steer left / right | Numpad 4 / Numpad 6 | ← / → |
| Kickdown (boost) | Shift | |
| Handbrake | Space | |
| Drop mine | Command | Z |
| Fire missile | Option | X |
| Pause (click to resume) | P | |
| Abort game | Esc | |

Keys can be remapped from **Prefs → Configure Controls…**. The arrow keys and Z/X keep working as
alternates. Option-clicking **Start** (or Option+S) opens the original level-select testing dialog;
high scores are disabled when you use it.

Menu shortcuts are the same as the original: S/N/Space/Return start, P prefs, C/O scores, H/? help,
R register, Q/Esc quit.

## Layout

| Path | Contents |
|---|---|
| `data/resources.dat` | Game resources (packs, pictures, defaults), taken from the Zig port |
| `src/resources.js`, `lzrw.js`, `packs.js` | Resource container, LZRW3-A decompression, level decryption |
| `src/data.js`, `quickdraw.js` | Object types, roads, levels, sprites, textures; PICT decoding |
| `src/objects*.js` | Object list, physics, AI and collisions (`objects.c`, `objectPhysics.c`, …) |
| `src/roaddraw.js`, `sprites.js`, `rle.js`, `textfx.js`, `particlefx.js`, `renderframe.js` | Software renderer |
| `src/gameframe.js`, `gameinitexit.js` | Game loop, level loading, game over |
| `src/interface.js`, `preferences.js`, `input.js`, `sound.js`, `screen.js` | Menus and dialogs, prefs, input, Web Audio, display |

Most modules mirror the original C file of the same name, so you can read them side by side.

## Tests

```sh
npm test                 # data layer: decompression/decryption checksums, registration check
node test/smoke.mjs      # browser: menu, start, drive (screenshots in test/out/)
node test/levels.mjs     # browser: load and drive every level
node test/flow.mjs       # browser: pause, finish a level, game over, high score entry
node test/credits.mjs    # browser: finish level 10, end credits, weapons
```

The browser tests use Playwright with the locally installed Google Chrome (`channel: 'chrome'`).

## To do

- [ ] **Scaling:** scale the 640×480 screen to fit the browser window. Keep the aspect ratio with
  letterboxing, use nearest-neighbor scaling, and map mouse coordinates back to game pixels.
- [ ] **Gamepad support:** map the Gamepad API onto the game controls (the original had USB gamepad
  support on OS X). Include analog steering and throttle if it plays well, and add button
  assignments to Configure Controls.

## Differences from the original

- **No Police Jammer from crates.** Add-on crates never roll the Police Jammer; the roll is redrawn
  among the other outcomes. The jammer itself still works, so it can be re-enabled by setting
  `kCrateGivesPoliceJammer` in `src/objectCollision.js`.
- **No Finder to quit to.** Quit shows a “thanks for playing” screen; click to return to the menu.
- **Dialogs** (preferences, controls, high-score name, level select) are HTML recreations of the Mac
  dialogs.
- **Always 16-bit color.** The 8-bit mode and line skipping are omitted, as on Mac OS X.
- **Sound.** Engine and skid loops use looping Web Audio sources rather than queued Sound Manager
  buffers. The original’s bug that sent effect pitch changes to the engine channel isn’t reproduced.
- **Timing guard.** If the tab is hidden, the simulation resynchronizes instead of fast-forwarding.
- **Game over trail.** The original redrew the spinning “Game Over” sprite as fast as the CPU allowed;
  this port draws 8 steps per display frame to get a similar trail.
- **Bounds checks.** Out-of-bounds reads in the original (past the road or track arrays) are
  clamped instead of reading neighboring memory.

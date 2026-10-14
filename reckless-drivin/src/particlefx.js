// Pixel particle bursts for dust and sparks (particlefx.c, 16-bit path).

import { G, kXSize, kYSize, kFrameDuration } from './state.js';
import { screen } from './screen.js';
import { RanFl } from './random.js';

const kMaxParticles = 64;
const kMaxPFX = 64;
const E = 2.71828182846;
const kParticleDuration = 0.5;

// Each burst keeps 4*kMaxParticles slots; only the first kMaxParticles are refreshed per burst,
// and drawing may read stale slots beyond that, as in the original.
const particleFX = Array.from({ length: kMaxPFX }, () => ({
  active: false,
  numParticles: 0,
  layer: 0,
  fxStartFrame: 0,
  color16: 0,
  pos: { x: 0, y: 0 },
  px: new Float32Array(kMaxParticles * 4),
  py: new Float32Array(kMaxParticles * 4),
}));

export function NewParticleFX(pos, velo, num, color, layer, spread) {
  let numFX = 0;
  while (numFX < kMaxPFX && particleFX[numFX].active) numFX++;
  if (numFX >= kMaxPFX) return;
  const fx = particleFX[numFX];
  num = Math.trunc(num);
  fx.numParticles = num;
  fx.active = true;
  fx.layer = layer;
  fx.fxStartFrame = G.frameCount;
  fx.pos = { x: pos.x, y: pos.y };
  fx.color16 = G.data.clut16[color & 0xff];
  num *= 4;
  if (num > kMaxParticles) num = kMaxParticles;
  for (let i = 0; i < num; i++) {
    fx.px[i] = velo.x + RanFl(-spread, spread);
    fx.py[i] = velo.y + RanFl(-spread, spread);
  }
}

export function DrawParticleFXZoomed(xDrawStart, yDrawStart, zoom, layer) {
  const buf = screen.base;
  const invZoom = 1 / zoom;
  for (const fx of particleFX) {
    if (!fx.active || fx.layer !== layer) continue;
    const dt = (G.frameCount - fx.fxStartFrame) * kFrameDuration;
    let numDrawParticles = Math.trunc(fx.numParticles * invZoom * invZoom);
    if (numDrawParticles > 4 * kMaxParticles) numDrawParticles = 4 * kMaxParticles;
    if (dt < kParticleDuration) {
      const epdt = -Math.pow(E, -dt);
      for (let i = 0; i < numDrawParticles; i++) {
        const px = fx.pos.x + fx.px[i] * epdt + fx.px[i];
        const py = fx.pos.y + fx.py[i] * epdt + fx.py[i];
        const x = Math.trunc((px - xDrawStart) * invZoom);
        const y = Math.trunc((yDrawStart - py) * invZoom);
        if (x > 0 && y > 0 && x < kXSize && y < kYSize) buf[y * kXSize + x] = fx.color16;
      }
    } else {
      fx.active = false;
    }
  }
}

// Sine lookup table, matching trig.h: PI is 3.1415 (not exact) and the index is truncated.

export const PI = 3.1415;
const kSinTabSize = 1024;
const kSinMask = 0x3ff;
const kTabScale = kSinTabSize / (2.0 * PI);

const gSinTab = new Float32Array(kSinTabSize);
for (let i = 0; i < kSinTabSize; i++) gSinTab[i] = Math.sin((2 * PI * i) / kSinTabSize);

export function sin(x) {
  return gSinTab[((x * kTabScale) | 0) & kSinMask];
}

export function cos(x) {
  return gSinTab[(((x + PI / 2.0) * kTabScale) | 0) & kSinMask];
}

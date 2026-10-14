// TT800 pseudorandom generator (random.c), seeded from Math.random.

const N = 25;
const M = 7;
const mag01 = [0x0, 0x8ebfd028];
const x = new Uint32Array(N);
let k = 0;

function genrand() {
  if (k === N) {
    let kk;
    for (kk = 0; kk < N - M; kk++) x[kk] = x[kk + M] ^ (x[kk] >>> 1) ^ mag01[x[kk] % 2];
    for (; kk < N; kk++) x[kk] = x[kk + (M - N)] ^ (x[kk] >>> 1) ^ mag01[x[kk] % 2];
    k = 0;
  }
  let y = x[k];
  y ^= (y << 7) & 0x2b5b2500;
  y ^= (y << 15) & 0xdb8b0000;
  y >>>= 0;
  y ^= y >>> 16;
  k++;
  return (y >>> 0) / 0xffffffff;
}

export function Randomize() {
  for (let i = 0; i < N; i++) x[i] = (Math.random() * 0x100000000) >>> 0;
  k = 0;
}

// Random float in [min,max].
export function RanFl(min, max) {
  return genrand() * (max - min) + min;
}

// Random int in [min,max-1].
export function RanInt(min, max) {
  let ran;
  do ran = genrand(); while (ran === 1);
  return Math.floor(ran * (max - min) + min);
}

// True with probability prob.
export function RanProb(prob) {
  return genrand() <= prob;
}

Randomize();

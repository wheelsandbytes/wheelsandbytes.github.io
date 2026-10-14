// LZRW3-A decompression (Ross Williams), as used by Reckless Drivin' Pack and
// PPic resources. Hash table entries point into the output buffer; the 18-byte
// start string is prepended to the output so initial entries need no special case.

const START_STRING = new TextEncoder().encode('123456789012345678');
const PRE = START_STRING.length;

// src starts at the 4-byte LZRW flag (i.e. raw resource bytes after the size prefix).
export function lzrw3aDecompress(src, outSize) {
  if (src[0] === 1) return src.slice(4);
  const out = new Uint8Array(PRE + outSize);
  out.set(START_STRING, 0);
  const table = new Int32Array(4096);
  let p = 4;
  let d = PRE;
  let control = 1;
  let literals = 0;
  let cycle = 0;
  const hash = (i) => (((40543 * ((out[i] << 8) ^ (out[i + 1] << 4) ^ out[i + 2])) >>> 4) & 0x1ff) << 3;
  const update = (base, pos) => {
    table[base + cycle] = pos;
    cycle = (cycle + 1) & 7;
  };
  while (p < src.length) {
    if (control === 1) {
      control = 0x10000 | src[p] | (src[p + 1] << 8);
      p += 2;
    }
    if (control & 1) {
      const b = src[p++];
      const index = ((b & 0xf0) << 4) | src[p++];
      let q = table[index];
      const ziv = d;
      // Byte-by-byte: source and destination may overlap.
      for (let n = (b & 0xf) + 3; n > 0; n--) out[d++] = out[q++];
      if (literals > 0) {
        let r = ziv - literals;
        update(hash(r), r);
        if (literals === 2) {
          r++;
          update(hash(r), r);
        }
        literals = 0;
      }
      update(index & ~7, ziv);
    } else {
      out[d++] = src[p++];
      if (++literals === 3) {
        const r = d - 3;
        update(hash(r), r);
        literals = 2;
      }
    }
    control >>>= 1;
  }
  return out.subarray(PRE, d);
}

// Decompress a raw Pack/PPic resource: BE u32 decompressed size, then LZRW3-A data.
export function decompressResource(raw) {
  const size = ((raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3]) >>> 0;
  return lzrw3aDecompress(raw.subarray(4), size);
}

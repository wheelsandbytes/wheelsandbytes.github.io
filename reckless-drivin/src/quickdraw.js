// Minimal QuickDraw PICT v2 decoder for the PPic resources (title/menu screens).
// Supports DirectBitsRect (16-bit, packType 3) and PackBitsRect (8-bit indexed).
// Text opcodes (used by the credits picture) are collected as draw commands.

const rgb555ToRgba = (c) => [
  (((c >> 10) & 31) * 255 / 31) | 0,
  (((c >> 5) & 31) * 255 / 31) | 0,
  ((c & 31) * 255 / 31) | 0,
];

class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
  }
  u8() { return this.b[this.p++]; }
  i8() { return this.v.getInt8(this.p++); }
  u16() { const x = this.v.getUint16(this.p); this.p += 2; return x; }
  i16() { const x = this.v.getInt16(this.p); this.p += 2; return x; }
  u32() { const x = this.v.getUint32(this.p); this.p += 4; return x; }
  rect() { const top = this.i16(), left = this.i16(), bottom = this.i16(), right = this.i16(); return { top, left, bottom, right }; }
  skip(n) { this.p += n; }
  align() { if (this.p & 1) this.p++; }
  str(n) { const s = String.fromCharCode(...this.b.subarray(this.p, this.p + n)); this.p += n; return s; }
}

// PackBits with item size 1 or 2 bytes. Returns decoded byte array of length outLen.
function unpackBits(src, outLen, itemSize) {
  const out = new Uint8Array(outLen);
  let s = 0;
  let d = 0;
  while (d < outLen && s < src.length) {
    const n = src[s++];
    if (n < 128) {
      const count = (n + 1) * itemSize;
      out.set(src.subarray(s, s + count), d);
      s += count;
      d += count;
    } else if (n > 128) {
      const count = 257 - n;
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < itemSize; k++) out[d++] = src[s + k];
      }
      s += itemSize;
    }
  }
  return out;
}

// background: [r,g,b] the picture is drawn over (white by default).
export function decodePict(bytes, background = [255, 255, 255]) {
  const r = new Reader(bytes);
  r.skip(2);
  const frame = r.rect();
  const width = frame.right - frame.left;
  const height = frame.bottom - frame.top;
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = background[0];
    rgba[i * 4 + 1] = background[1];
    rgba[i * 4 + 2] = background[2];
  }
  const text = [];
  const fonts = {};
  const state = { font: 0, size: 12, face: 0, x: 0, y: 0, color: [0, 0, 0] };
  // Origin opcode offset: later coordinates are shifted by (-dh, -dv).
  let ox = 0;
  let oy = 0;

  const blit = (op) => {
    let rowBytes = r.u16();
    const isPixmap = (rowBytes & 0x8000) !== 0;
    rowBytes &= 0x3fff;
    const bounds = r.rect();
    let pixelSize = 1;
    let packType = 0;
    let palette = null;
    if (isPixmap) {
      r.skip(2); // pmVersion
      packType = r.u16();
      r.skip(4 + 4 + 4 + 2); // packSize, hRes, vRes, pixelType
      pixelSize = r.u16();
      r.skip(2 + 2 + 4 + 4 + 4); // cmpCount, cmpSize, planeBytes, pmTable, pmReserved
    }
    if (op === 0x98 || op === 0x90) {
      if (isPixmap) {
        r.skip(4 + 2); // ctSeed, ctFlags
        const n = r.u16() + 1;
        palette = new Array(256).fill([0, 0, 0]);
        for (let i = 0; i < n; i++) {
          const idx = r.u16();
          const red = r.u16() >> 8, green = r.u16() >> 8, blue = r.u16() >> 8;
          palette[(idx & 0xff) || i] = [red, green, blue];
        }
      } else {
        palette = [[255, 255, 255], [0, 0, 0]];
      }
    }
    const src = r.rect();
    const dst = r.rect();
    r.skip(2); // mode
    const rows = bounds.bottom - bounds.top;
    const itemSize = pixelSize === 16 && packType !== 1 ? 2 : 1;
    for (let y = 0; y < rows; y++) {
      let line;
      if (rowBytes < 8 || packType === 1) {
        line = r.b.subarray(r.p, r.p + rowBytes);
        r.skip(rowBytes);
      } else {
        const count = rowBytes > 250 ? r.u16() : r.u8();
        line = unpackBits(r.b.subarray(r.p, r.p + count), rowBytes, itemSize);
        r.skip(count);
      }
      const sy = bounds.top + y;
      if (sy < src.top || sy >= src.bottom) continue;
      const dy = dst.top + oy + (sy - src.top) - frame.top;
      if (dy < 0 || dy >= height) continue;
      for (let sx = src.left; sx < src.right; sx++) {
        const dx = dst.left + ox + (sx - src.left) - frame.left;
        if (dx < 0 || dx >= width) continue;
        const bx = sx - bounds.left;
        let c;
        if (pixelSize === 16) c = rgb555ToRgba((line[bx * 2] << 8) | line[bx * 2 + 1]);
        else if (pixelSize === 8) c = palette[line[bx]];
        else if (pixelSize === 1) c = palette[(line[bx >> 3] >> (7 - (bx & 7))) & 1];
        else throw new Error(`unsupported pixelSize ${pixelSize}`);
        const o = (dy * width + dx) * 4;
        rgba[o] = c[0];
        rgba[o + 1] = c[1];
        rgba[o + 2] = c[2];
      }
    }
  };

  const pushText = (s) => text.push({ ...state, x: state.x + ox, y: state.y + oy, color: [...state.color], text: s });

  r.p = 10;
  while (r.p < bytes.length) {
    r.align();
    const op = r.u16();
    if (op === 0x00ff) break;
    switch (op) {
      case 0x0000: case 0x001e: break;
      case 0x0011: r.skip(2); break;
      case 0x0c00: r.skip(24); break;
      case 0x0001: r.skip(r.u16() - 2); break;
      case 0x0003: state.font = r.u16(); break;
      case 0x0004: state.face = r.u8(); break;
      case 0x0005: case 0x0008: case 0x00a0: r.skip(2); break;
      case 0x000d: state.size = r.u16(); break;
      case 0x0007: case 0x0021: r.skip(4); break;
      case 0x000c: ox -= r.i16(); oy -= r.i16(); break;
      case 0x0009: case 0x0020: case 0x0030: case 0x0031: case 0x0032: case 0x0033: case 0x0034: r.skip(8); break;
      case 0x0022: r.skip(6); break;
      case 0x0023: r.skip(2); break;
      case 0x0038: case 0x0039: case 0x003a: case 0x003b: case 0x003c: break;
      case 0x001a: state.color = [r.u16() >> 8, r.u16() >> 8, r.u16() >> 8]; break;
      case 0x001b: r.skip(6); break;
      case 0x0028: state.y = r.i16(); state.x = r.i16(); pushText(r.str(r.u8())); break;
      case 0x0029: state.x += r.u8(); pushText(r.str(r.u8())); break;
      case 0x002a: state.y += r.u8(); pushText(r.str(r.u8())); break;
      case 0x002b: state.x += r.u8(); state.y += r.u8(); pushText(r.str(r.u8())); break;
      case 0x002c: {
        const end = r.u16();
        const start = r.p;
        const id = r.u16();
        fonts[id] = r.str(r.u8());
        r.p = start + end;
        break;
      }
      case 0x002e: r.skip(r.u16()); break;
      case 0x00a1: r.skip(2); r.skip(r.u16()); break;
      case 0x0090: case 0x0098: case 0x009a:
        if (op === 0x009a) r.skip(4); // baseAddr
        blit(op & 0xff);
        break;
      default:
        throw new Error(`unsupported PICT opcode 0x${op.toString(16)} at ${r.p - 2}`);
    }
  }
  return { width, height, rgba, text, fonts };
}

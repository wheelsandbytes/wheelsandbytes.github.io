// Pack loading: decrypt (levels 4-10), decompress, and index entries.
// Mirrors the original source/packs.c and headers/packs.h.

import { decompressResource } from './lzrw.js';

export const Pack = {
  ObTy: 128,
  Sprt: 129,
  Ogrp: 130,
  sRLE: 131,
  cRLE: 132,
  TxtR: 133,
  Snds: 134,
  Road: 135,
  Tx16: 136,
  Sp16: 137,
  sR16: 138,
  cR16: 139,
  Level01: 140,
  Level04: 143,
  Level10: 149,
};

// Key derived from the free registration (Name "Free", Code "B3FB09B1EB").
export const REGISTRATION = { name: 'Free', code: 'B3FB09B1EB' };

// register.c: key = codeNum ^ nameNum.
export function deriveKey(name, code) {
  const n = name.toUpperCase().replace(/ /g, '');
  const last4 = n.slice(-4).padStart(4, '\0');
  let nameNum = 0;
  for (const c of last4) nameNum = ((nameNum << 8) | c.charCodeAt(0)) >>> 0;
  const seed = parseInt(code.slice(8, 10), 16);
  const codeNum = (parseInt(code.slice(0, 8), 16) ^ (seed * 0x01010101)) >>> 0;
  return (codeNum ^ nameNum) >>> 0;
}

// packs.c CryptData: XOR every big-endian long from byte 256 with key; returns check sum.
export function cryptData(bytes, key) {
  let check = 0;
  let i = 256;
  for (; i <= bytes.length - 4; i += 4) {
    const w = (((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) ^ key) >>> 0;
    bytes[i] = w >>> 24;
    bytes[i + 1] = (w >>> 16) & 0xff;
    bytes[i + 2] = (w >>> 8) & 0xff;
    bytes[i + 3] = w & 0xff;
    check = (check + w) >>> 0;
  }
  for (let shift = 24; i < bytes.length && shift > 0; i++, shift -= 8) {
    bytes[i] ^= (key >>> shift) & 0xff;
    check = (check + ((bytes[i] << shift) >>> 0)) >>> 0;
  }
  return check;
}

export class PackData {
  constructor(id, bytes) {
    this.id = id;
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.entries = new Map();
    this.ids = [];
    const n = this.view.getInt16(0);
    for (let i = 1; i <= n; i++) {
      const entryId = this.view.getInt16(i * 8);
      const offset = this.view.getUint32(i * 8 + 4);
      const end = i < n ? this.view.getUint32((i + 1) * 8 + 4) : bytes.length;
      this.entries.set(entryId, [offset, end - offset]);
      this.ids.push(entryId);
    }
  }

  // Returns a Uint8Array view of the entry, or null.
  get(entryId) {
    const e = this.entries.get(entryId);
    return e ? this.bytes.subarray(e[0], e[0] + e[1]) : null;
  }

  // Returns a big-endian DataView of the entry, or null.
  entryView(entryId) {
    const b = this.get(entryId);
    return b ? new DataView(b.buffer, b.byteOffset, b.byteLength) : null;
  }
}

export class Packs {
  constructor(resources, key = deriveKey(REGISTRATION.name, REGISTRATION.code)) {
    this.resources = resources;
    this.key = key;
    this.cache = new Map();
  }

  // Raw decompressed bytes of a pack (decrypting levels 4+).
  loadRaw(id) {
    const res = this.resources.get('Pack', id);
    if (!res) return null;
    const raw = new Uint8Array(res);
    if (id >= Pack.Level04) cryptData(raw, this.key);
    return decompressResource(raw);
  }

  get(id) {
    if (!this.cache.has(id)) {
      const bytes = this.loadRaw(id);
      this.cache.set(id, bytes ? new PackData(id, bytes) : null);
    }
    return this.cache.get(id);
  }

  // register.c CheckRegi: decrypted check of level 4 must match Chck 128.
  checkRegistration() {
    const raw = new Uint8Array(this.resources.get('Pack', Pack.Level04));
    const check = cryptData(raw, this.key);
    const chck = this.resources.get('Chck', 128);
    const expected = ((chck[0] << 24) | (chck[1] << 16) | (chck[2] << 8) | chck[3]) >>> 0;
    return check === expected;
  }

  numLevels() {
    let n = 0;
    while (this.resources.get('Pack', Pack.Level01 + n)) n++;
    return n;
  }
}

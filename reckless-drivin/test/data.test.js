import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ResourceFile } from '../src/resources.js';
import { lzrw3aDecompress, decompressResource } from '../src/lzrw.js';
import { Packs, deriveKey, REGISTRATION } from '../src/packs.js';

const res = new ResourceFile(readFileSync(new URL('../data/resources.dat', import.meta.url)));
const md5 = (b) => createHash('md5').update(b).digest('hex');

// Expected md5 of decompressed (and decrypted, for 143+) output.
const PACK_MD5 = {
  128: '63b369b2d25581f1748045a9f0b10cf0', 129: 'd056d066526beed3555d51ae3e45437a',
  130: '86fc02a3fce7cbad7236f5f876471fba', 131: '1c27f42a2dbca963bfda17b50723d6b3',
  132: '2f6796318ecfb5cd4ad91d98be3e3205', 133: 'e9dd6e110e555c8f181c0428d89f3506',
  134: 'b6d1745c1a09196be2a247d2e9952bc9', 135: 'dae5ac5271a81ad180a6f6402a3f954c',
  136: 'fb089fd5ffa5fb2eb0b989b9c6acaff4', 137: '3368b66e8cc96f4dbb9b0a3547f86e26',
  138: '14c578b71205c200b8e605a572ad78d3', 139: 'bfc7c1af0769e48bd6ca042cb13943f5',
  140: '4f382dc722c15407c2817d0deea18793', 141: '1965654215cb2943c8fc0f9d5864abb7',
  142: 'e289752489d45ccfd8e0d88ac14e9858', 143: '915fd447adb40b8304629d8c6d807f91',
  144: 'cf05359cc4079f51b6d9586f7c32dbba', 145: '949d9a47c4bd02f4c3a914cad65d6e7c',
  146: 'a73d006d9f6c1ccee2fd9bd9a4a018e4', 147: 'b497ca10532870deaddbf5d49ce6d4cf',
  148: '7c5e34ae2b3b8b03f53206284137d61e', 149: '257367dc8e6b715154a10956700f06c8',
};
const PPIC_MD5 = {
  1000: '3db42574bdf1d820e069a86983396120', 1001: '4530e867540ab6a9fa6ab36a30039dfb',
  1002: '77f1b15fa24eb85bfc1f5c16e798a9e2', 1003: '84311d653672bae83afdc0185dec0212',
  1004: '0bc14913d762a1f91b8e31c8db05e622', 1005: 'ae78ea95bb7c91129d0ff6f1864ce7d0',
  1006: '88009ff58e81bc751254d6d5a0b7fc2e', 1007: 'd6348a385a4c7c262e74b42a35ba53f3',
  1008: 'b5ddfb02b3b185b501d87ff3af60f989', 1009: '15ef68a5d5833b43f5e9e9dc85a73c3f',
};

test('lzrw3a small vectors', () => {
  const dec = (bytes) => new TextDecoder().decode(lzrw3aDecompress(Uint8Array.from(bytes), 64));
  assert.equal(dec([1, 0, 0, 0, 0x68, 0x65, 0x6c, 0x6c, 0x6f]), 'hello');
  assert.equal(dec([0, 0, 0, 0, 0x08, 0xfe, 0x61, 0x61, 0x61, 0x0f, 0x70, 0x61, 0x61, 0x61, 0x61, 0x61]), 'a'.repeat(26));
  assert.equal(dec([0, 0, 0, 0, 0x90, 0xff, 0x61, 0x73, 0x64, 0x66, 0x8f, 0x90, 0x64, 0x66]), 'asdf'.repeat(6));
  assert.equal(dec([0, 0, 0, 0, 0xf8, 0xff, 0x7a, 0x69, 0x67, 0x8f, 0xd0]), 'zig'.repeat(7));
});

test('registration key derivation', () => {
  assert.equal(deriveKey(REGISTRATION.name, REGISTRATION.code), 0x1e42a71f);
});

test('registration check matches Chck 128', () => {
  assert.ok(new Packs(res).checkRegistration());
});

test('all packs decompress to known checksums', () => {
  const packs = new Packs(res);
  for (const [id, sum] of Object.entries(PACK_MD5)) {
    assert.equal(md5(packs.loadRaw(Number(id))), sum, `Pack ${id}`);
  }
});

test('all PPics decompress to known checksums', () => {
  for (const [id, sum] of Object.entries(PPIC_MD5)) {
    assert.equal(md5(decompressResource(res.get('PPic', Number(id)))), sum, `PPic ${id}`);
  }
});

test('pack entry indexing', () => {
  const packs = new Packs(res);
  assert.equal(packs.get(128).ids.length, 158);
  assert.equal(packs.get(137).ids.length, 244);
  const obty = packs.get(128).entryView(128);
  assert.equal(obty.getFloat32(0), 1800);
  assert.equal(obty.getInt16(20), 147);
  assert.equal(packs.numLevels(), 10);
});

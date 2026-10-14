// Parses game structures out of the decompressed packs: object types, roads, object groups,
// levels, 16-bit sprites, textures and RLE graphics. All source data is big-endian.

import { Pack } from './packs.js';

const be16 = (bytes) => {
  const out = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return out;
};

function parseObjectType(id, v) {
  return {
    id,
    mass: v.getFloat32(0),
    maxEngineForce: v.getFloat32(4),
    maxNegEngineForce: v.getFloat32(8),
    friction: v.getFloat32(12),
    flags: v.getUint16(16),
    deathObj: v.getInt16(18),
    frame: v.getInt16(20),
    numFrames: v.getUint16(22),
    frameDuration: v.getFloat32(24),
    wheelWidth: v.getFloat32(28),
    wheelLength: v.getFloat32(32),
    steering: v.getFloat32(36),
    width: v.getFloat32(40),
    length: v.getFloat32(44),
    score: v.getUint16(48),
    flags2: v.getUint16(50),
    creationSound: v.getInt16(52),
    otherSound: v.getInt16(54),
    maxDamage: v.getFloat32(56),
    weaponObj: v.getInt16(60),
    weaponInfo: v.getInt16(62),
  };
}

function parseRoadInfo(id, v) {
  return {
    id,
    friction: v.getFloat32(0),
    airResistance: v.getFloat32(4),
    backResistance: v.getFloat32(8),
    tolerance: v.getUint16(12),
    marks: v.getInt16(14),
    deathOffs: v.getInt16(16),
    backgroundTex: v.getInt16(18),
    foregroundTex: v.getInt16(20),
    roadLeftBorder: v.getInt16(22),
    roadRightBorder: v.getInt16(24),
    tracks: v.getInt16(26),
    skidSound: v.getInt16(28),
    xDrift: v.getFloat32(32),
    yDrift: v.getFloat32(36),
    xFrontDrift: v.getFloat32(40),
    yFrontDrift: v.getFloat32(44),
    trackSlide: v.getFloat32(48),
    dustSlide: v.getFloat32(52),
    dustColor: v.getUint8(56),
    water: v.getUint8(57),
    slideFriction: v.getFloat32(60),
  };
}

export class GameData {
  constructor(resources, packs) {
    this.resources = resources;
    this.packs = packs;
    this.objectTypes = new Map();
    this.roadInfos = new Map();
    this.objectGroups = new Map();
    this.textures = new Map();

    const cl16 = resources.get('Cl16', 8);
    this.clut16 = be16(cl16);

    this.loadSprites();
    this.rle = packs.get(Pack.sR16);
    this.font = packs.get(Pack.cR16);
    this.soundPack = packs.get(Pack.Snds);
  }

  objectType(id) {
    let t = this.objectTypes.get(id);
    if (!t) {
      const v = this.packs.get(Pack.ObTy).entryView(id);
      if (!v) throw new Error(`missing object type ${id}`);
      t = parseObjectType(id, v);
      this.objectTypes.set(id, t);
    }
    return t;
  }

  roadInfo(id) {
    let r = this.roadInfos.get(id);
    if (!r) {
      r = parseRoadInfo(id, this.packs.get(Pack.Road).entryView(id));
      this.roadInfos.set(id, r);
    }
    return r;
  }

  objectGroup(id) {
    let g = this.objectGroups.get(id);
    if (!g) {
      const v = this.packs.get(Pack.Ogrp).entryView(id);
      const n = v.getUint32(0);
      const data = [];
      for (let i = 0; i < n; i++) {
        const o = 4 + i * 12;
        data.push({
          typeRes: v.getInt16(o),
          minOffs: v.getInt16(o + 2),
          maxOffs: v.getInt16(o + 4),
          probility: v.getInt16(o + 6),
          dir: v.getFloat32(o + 8),
        });
      }
      g = { numEntries: n, data };
      this.objectGroups.set(id, g);
    }
    return g;
  }

  // 16-bit texture as native Uint16Array (RGB555).
  texture(id) {
    let t = this.textures.get(id);
    if (!t) {
      t = be16(this.packs.get(Pack.Tx16).get(id));
      this.textures.set(id, t);
    }
    return t;
  }

  // sprites.c LoadSprites: 300 pack sprites plus 100 slots for dented copies.
  loadSprites() {
    const pack = this.packs.get(Pack.Sp16);
    this.sprites = new Array(400).fill(null);
    for (let i = 128; i < 128 + 300; i++) {
      const b = pack.get(i);
      if (!b) continue;
      const xSize = (b[0] << 8) | b[1];
      const ySize = (b[2] << 8) | b[3];
      const data = be16(b.subarray(8, 8 + xSize * ySize * 2));
      this.sprites[i - 128] = { xSize, ySize, log2xSize: b[4], drawMode: b[6], data };
    }
  }

  // gameinitexit.c LoadLevel: parse level entry 1 (level data) and entry 2 (marks).
  level(levelID) {
    const pack = this.packs.get(Pack.Level01 + levelID);
    const v = pack.entryView(1);
    let o = 0;
    const levelData = { roadInfo: v.getInt16(0), time: v.getUint16(2), objGrps: [] };
    for (let i = 0; i < 10; i++) levelData.objGrps.push({ resID: v.getInt16(4 + i * 4), numObjs: v.getInt16(6 + i * 4) });
    levelData.xStartPos = v.getInt16(44);
    levelData.levelEnd = v.getUint16(46);
    o = 48;
    const readTrack = () => {
      const num = v.getUint32(o);
      o += 4;
      const track = [];
      for (let i = 0; i < num; i++, o += 12) {
        track.push({ flags: v.getUint16(o), x: v.getInt16(o + 2), y: v.getInt32(o + 4), velo: v.getFloat32(o + 8) });
      }
      return { num, track };
    };
    const trackUp = readTrack();
    const trackDown = readTrack();
    const numObjs = v.getUint32(o);
    o += 4;
    const objs = [];
    for (let i = 0; i < numObjs; i++, o += 16) {
      objs.push({ x: v.getInt32(o), y: v.getInt32(o + 4), dir: v.getFloat32(o + 8), typeRes: v.getInt16(o + 12) });
    }
    const roadLength = v.getUint32(o);
    o += 4;
    const roadData = new Int16Array(roadLength * 4);
    for (let i = 0; i < roadLength * 4; i++, o += 2) roadData[i] = v.getInt16(o);

    const mv = pack.entryView(2);
    const markSize = mv ? mv.byteLength >> 4 : 0;
    const marks = [];
    for (let i = 0; i < markSize; i++) {
      const m = i * 16;
      marks.push({ p1: { x: mv.getFloat32(m), y: mv.getFloat32(m + 4) }, p2: { x: mv.getFloat32(m + 8), y: mv.getFloat32(m + 12) } });
    }
    return { levelData, trackUp, trackDown, objs, roadLength, roadData, marks, markSize };
  }
}

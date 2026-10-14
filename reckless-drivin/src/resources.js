// Parser for resources.dat, the flat resource container produced by the Zig port.
// Record: char[8] type (4 chars + 4 NULs), u32 LE id, u32 LE length, bytes[length].
// Resource payloads themselves are big-endian.

export class ResourceFile {
  constructor(buffer) {
    this.bytes = new Uint8Array(buffer);
    this.map = new Map();
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    let off = 0;
    while (off + 16 <= this.bytes.length) {
      const type = String.fromCharCode(...this.bytes.subarray(off, off + 4));
      const id = view.getInt32(off + 8, true);
      const length = view.getUint32(off + 12, true);
      const data = this.bytes.subarray(off + 16, off + 16 + length);
      this.map.set(`${type}:${id}`, data);
      off += 16 + length;
    }
  }

  get(type, id) {
    return this.map.get(`${type}:${id}`) ?? null;
  }
}

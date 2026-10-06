// Teltonika AVL protocol over TCP (Codec 8 and Codec 8 Extended).
//
// Session:  device -> [2 bytes IMEI length][IMEI ascii]      server -> 0x01 (accept) | 0x00 (reject)
//           device -> [00000000][data length][data][CRC-16]  server -> [4 bytes: records accepted]
// data   =  codec id, record count, AVL records..., record count
//
// Reference: Teltonika "Data Sending Protocols" (Codec 8 / 8E).

export const CODEC_8 = 0x08;
export const CODEC_8_EXTENDED = 0x8e;
export const CODEC_12 = 0x0c; // GPRS commands: the server sends a text command, the tracker answers with text

const MAX_PACKET_BYTES = 64 * 1024;

// IO element ids we give a meaning to; every other id is kept as-is in `io`
export const IO = {
  GSM_SIGNAL: 21,
  EXTERNAL_VOLTAGE: 66,
  BATTERY_VOLTAGE: 67,
  TOTAL_ODOMETER: 16,
  IGNITION: 239,
  MOVEMENT: 240
};

export function crc16Ibm(buffer) {
  let crc = 0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

const bigToNumber = (value) => (value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString());

// Cursor-based reader that throws on truncated data
class Reader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  need(n) {
    if (this.offset + n > this.buffer.length) throw new Error('Truncated AVL data');
  }

  u8() { this.need(1); return this.buffer[this.offset++]; }
  u16() { this.need(2); const v = this.buffer.readUInt16BE(this.offset); this.offset += 2; return v; }
  i16() { this.need(2); const v = this.buffer.readInt16BE(this.offset); this.offset += 2; return v; }
  u32() { this.need(4); const v = this.buffer.readUInt32BE(this.offset); this.offset += 4; return v; }
  i32() { this.need(4); const v = this.buffer.readInt32BE(this.offset); this.offset += 4; return v; }
  u64() { this.need(8); const v = this.buffer.readBigUInt64BE(this.offset); this.offset += 8; return bigToNumber(v); }
  bytes(n) { this.need(n); const v = this.buffer.subarray(this.offset, this.offset + n); this.offset += n; return v; }
}

function readIo(reader, extended) {
  const io = {};
  const id = () => (extended ? reader.u16() : reader.u8());
  const count = () => (extended ? reader.u16() : reader.u8());

  id(); // event IO id (which IO triggered this record) - not needed
  count(); // total IO count - the groups below are authoritative

  [[1, () => reader.u8()], [2, () => reader.u16()], [4, () => reader.u32()], [8, () => reader.u64()]].forEach(
    ([, read]) => {
      const n = count();
      for (let i = 0; i < n; i += 1) {
        const ioId = id();
        io[ioId] = read();
      }
    }
  );

  if (extended) {
    const n = reader.u16();
    for (let i = 0; i < n; i += 1) {
      const ioId = reader.u16();
      const length = reader.u16();
      io[ioId] = reader.bytes(length).toString('hex');
    }
  }
  return io;
}

function readRecord(reader, extended) {
  const timestamp = new Date(Number(reader.u64()));
  const priority = reader.u8();
  const lng = reader.i32() / 1e7;
  const lat = reader.i32() / 1e7;
  const altitude = reader.i16();
  const heading = reader.u16();
  const satellites = reader.u8();
  const speed = reader.u16();
  const io = readIo(reader, extended);
  return { timestamp, priority, lat, lng, altitude, heading, satellites, speed, io };
}

// Parses the "data" field (codec id .. second record count)
export function parseAvlData(data) {
  const reader = new Reader(data);
  const codec = reader.u8();
  if (codec !== CODEC_8 && codec !== CODEC_8_EXTENDED) {
    throw new Error(`Unsupported Teltonika codec 0x${codec.toString(16)}`);
  }
  const extended = codec === CODEC_8_EXTENDED;
  const count = reader.u8();
  const records = [];
  for (let i = 0; i < count; i += 1) records.push(readRecord(reader, extended));
  const countAgain = reader.u8();
  if (countAgain !== count) throw new Error('Record count mismatch');
  return { codec, records };
}

// Codec 12 data field: codec id, quantity, type (0x05 command / 0x06 response), size (4), text, quantity
export function parseCodec12(data) {
  if (data.length < 8 || data[0] !== CODEC_12) throw new Error('Not a Codec 12 message');
  const quantity = data[1];
  const type = data[2];
  const size = data.readUInt32BE(3);
  if (quantity !== 1 || size > data.length - 8 || data[7 + size] !== quantity) throw new Error('Malformed Codec 12 message');
  return { messageType: type, text: data.subarray(7, 7 + size).toString('ascii').replace(/[^\x20-\x7e]/g, '?') };
}

// Incremental parser for a TCP byte stream. push() returns the events found in the new bytes:
//   { type: 'login', imei }                       - only valid as the first message
//   { type: 'data', codec, records, crcOk }       - an AVL packet (records is [] when the CRC is wrong)
//   { type: 'command-response', messageType, text } - the tracker's answer to a Codec 12 command
// Throws on malformed input; the caller should drop the connection.
export class TeltonikaParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.loggedIn = false;
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAX_PACKET_BYTES * 2) throw new Error('Buffer limit exceeded');
    const events = [];

    for (;;) {
      if (!this.loggedIn) {
        if (this.buffer.length < 2) break;
        const length = this.buffer.readUInt16BE(0);
        if (length < 8 || length > 20) throw new Error('Invalid IMEI length');
        if (this.buffer.length < 2 + length) break;
        const imei = this.buffer.subarray(2, 2 + length).toString('ascii');
        if (!/^\d{8,20}$/.test(imei)) throw new Error('Invalid IMEI');
        this.buffer = this.buffer.subarray(2 + length);
        this.loggedIn = true;
        events.push({ type: 'login', imei });
        continue;
      }

      if (this.buffer.length < 8) break;
      if (this.buffer.readUInt32BE(0) !== 0) throw new Error('Invalid AVL preamble');
      const dataLength = this.buffer.readUInt32BE(4);
      if (dataLength < 3 || dataLength > MAX_PACKET_BYTES) throw new Error('Invalid AVL data length');
      const total = 8 + dataLength + 4;
      if (this.buffer.length < total) break;

      const data = this.buffer.subarray(8, 8 + dataLength);
      const crc = this.buffer.readUInt32BE(8 + dataLength);
      this.buffer = this.buffer.subarray(total);

      if (crc !== crc16Ibm(data)) {
        events.push({ type: 'data', codec: null, records: [], crcOk: false });
        continue;
      }
      if (data[0] === CODEC_12) {
        // the tracker's answer to a command we sent (type 0x06 = response)
        events.push({ type: 'command-response', ...parseCodec12(data) });
        continue;
      }
      const { codec, records } = parseAvlData(data);
      events.push({ type: 'data', codec, records, crcOk: true });
    }
    return events;
  }
}

// ---------------------------------------------------------------------------
// Encoding helpers: used by the device simulator and the tests
// ---------------------------------------------------------------------------

export const encodeLogin = (imei) => {
  const body = Buffer.from(imei, 'ascii');
  const header = Buffer.alloc(2);
  header.writeUInt16BE(body.length);
  return Buffer.concat([header, body]);
};

export const loginResponse = (accepted) => Buffer.from([accepted ? 1 : 0]);

export const dataResponse = (acceptedRecords) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(acceptedRecords);
  return buffer;
};

function encodeRecord(record, extended) {
  const parts = [];
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(record.timestamp instanceof Date ? record.timestamp.getTime() : record.timestamp));
  parts.push(timestamp, Buffer.from([record.priority ?? 0]));

  const gps = Buffer.alloc(15);
  gps.writeInt32BE(Math.round(record.lng * 1e7), 0);
  gps.writeInt32BE(Math.round(record.lat * 1e7), 4);
  gps.writeInt16BE(Math.round(record.altitude ?? 0), 8);
  gps.writeUInt16BE(Math.round(record.heading ?? 0), 10);
  gps.writeUInt8(record.satellites ?? 8, 12);
  gps.writeUInt16BE(Math.round(record.speed ?? 0), 13);
  parts.push(gps);

  // IO: group by value size (1/2/4/8 bytes)
  const groups = { 1: [], 2: [], 4: [], 8: [] };
  Object.entries(record.io || {}).forEach(([ioId, value]) => {
    const n = Number(value);
    const size = n > 0xffffffff ? 8 : n > 0xffff ? 4 : n > 0xff ? 2 : 1;
    groups[size].push([Number(ioId), value]);
  });
  const width = extended ? 2 : 1;
  const writeUInt = (value, bytes) => {
    const b = Buffer.alloc(bytes);
    if (bytes === 8) b.writeBigUInt64BE(BigInt(value));
    else b.writeUIntBE(Number(value), 0, bytes);
    return b;
  };
  const total = Object.values(groups).reduce((sum, g) => sum + g.length, 0);
  parts.push(writeUInt(0, width), writeUInt(total, width));
  [1, 2, 4, 8].forEach((size) => {
    parts.push(writeUInt(groups[size].length, width));
    groups[size].forEach(([ioId, value]) => parts.push(writeUInt(ioId, width), writeUInt(value, size)));
  });
  if (extended) parts.push(writeUInt(0, 2)); // no variable-length elements
  return Buffer.concat(parts);
}

export function encodeAvlPacket(records, { extended = false } = {}) {
  const data = Buffer.concat([
    Buffer.from([extended ? CODEC_8_EXTENDED : CODEC_8, records.length]),
    ...records.map((r) => encodeRecord(r, extended)),
    Buffer.from([records.length])
  ]);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 4);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc16Ibm(data));
  return Buffer.concat([header, data, crc]);
}

// ---------------------------------------------------------------------------
// Codec 12 (commands to the tracker)
// ---------------------------------------------------------------------------

function codec12Packet(type, text) {
  const body = Buffer.from(String(text), 'ascii');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length);
  const data = Buffer.concat([Buffer.from([CODEC_12, 0x01, type]), size, body, Buffer.from([0x01])]);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 4);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc16Ibm(data));
  return Buffer.concat([header, data, crc]);
}

// Server -> tracker: a text command such as "getinfo" or "setdigout 1" (type 0x05)
export const encodeCodec12Command = (text) => codec12Packet(0x05, text);
// Tracker -> server: the answer (type 0x06); used by the tests and the simulator
export const encodeCodec12Response = (text) => codec12Packet(0x06, text);

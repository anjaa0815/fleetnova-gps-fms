// GT06 / Concox protocol over TCP (also used by many rebranded trackers: JM-VL03, WeTrack, Sinotrack ST-901...).
//
// Frame:  78 78 | length (1) | protocol (1) | content | serial (2) | CRC (2) | 0D 0A
//         79 79 | length (2) | ...                                              (extended frames)
//   length  = bytes from the protocol number through the CRC
//   CRC     = CRC-ITU (CRC-16/X-25) over length .. serial
//
// Messages handled:  0x01 login (acknowledged)           0x13 heartbeat / status (acknowledged)
//                    0x12 / 0x22 location                0x16 / 0x26 alarm with location (acknowledged)
// Everything else is read and ignored (the connection stays open).

export const PROTOCOL = {
  LOGIN: 0x01,
  LOCATION: 0x12,
  HEARTBEAT: 0x13,
  ALARM: 0x16,
  LOCATION_4G: 0x22,
  ALARM_4G: 0x26,
  COMMAND: 0x80, // server -> tracker text command
  COMMAND_RESPONSE: 0x15 // tracker -> server answer
};

const LOCATION_PROTOCOLS = new Set([PROTOCOL.LOCATION, PROTOCOL.LOCATION_4G, PROTOCOL.ALARM, PROTOCOL.ALARM_4G]);
const ACK_PROTOCOLS = new Set([PROTOCOL.ALARM, PROTOCOL.ALARM_4G]);

const MAX_FRAME = 1024;
const MAX_BUFFER = 8 * 1024;
const MAX_GARBAGE_BYTES = 2048; // bytes skipped while looking for a frame start before giving up
const COORD_DIVISOR = 1800000; // 30000 units per minute * 60
const IGNITION_IO = 239; // same IO id Teltonika uses, so reports treat both brands alike

// CRC-ITU / X-25: poly 0x1021 reflected, init 0xFFFF, final xor 0xFFFF (check value of "123456789" is 0x906E)
export function crcItu(buffer) {
  let crc = 0xffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return ~crc & 0xffff;
}

function parseLocation(content, acc) {
  // date (6, binary UTC) | satellites byte | lat (4) | lon (4) | speed (1) | course+status (2)
  if (content.length < 18) throw new Error('Truncated GT06 location');
  const [yy, mo, dd, hh, mi, ss] = content;
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59 || ss > 59) throw new Error('Invalid GT06 date');
  const timestamp = new Date(Date.UTC(2000 + yy, mo - 1, dd, hh, mi, ss));

  const satellites = content[6] & 0x0f;
  let lat = content.readUInt32BE(7) / COORD_DIVISOR;
  let lng = content.readUInt32BE(11) / COORD_DIVISOR;
  const speed = content[15];
  const flags = content.readUInt16BE(16);
  const heading = flags & 0x3ff;
  const fixed = Boolean(flags & 0x1000);
  if (!(flags & 0x0400)) lat = -lat; // bit set = north
  if (flags & 0x0800) lng = -lng; // bit set = west

  const io = {};
  // 0x22 / 0x26 carry the ACC (ignition) state after the 8 bytes of cell information
  let ignition = acc;
  if (content.length >= 27) ignition = Boolean(content[26]);
  if (ignition !== null && ignition !== undefined) io[IGNITION_IO] = ignition ? 1 : 0;

  return { fixed, ignition, record: { timestamp, lat, lng, speed, heading, altitude: 0, satellites, io } };
}

// Incremental parser for the TCP byte stream. push() returns the events found in the new bytes:
//   { type: 'login', imei, serial }
//   { type: 'heartbeat', serial }
//   { type: 'location', protocol, serial, record | null (no GPS fix), ack }
//   { type: 'unknown', protocol, serial }       { type: 'bad-crc' }
// Throws on a stream that is clearly not GT06; the caller should drop the connection.
export class Gt06Parser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.garbage = 0;
    this.acc = null; // last known ignition state (from heartbeats / 0x22 packets)
  }

  skip(bytes) {
    this.garbage += bytes;
    if (this.garbage > MAX_GARBAGE_BYTES) throw new Error('Not a GT06 stream');
    this.buffer = this.buffer.subarray(bytes);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAX_BUFFER) throw new Error('Buffer limit exceeded');
    const events = [];

    for (;;) {
      if (this.buffer.length < 2) break;
      const [b0, b1] = this.buffer;
      if (b0 !== b1 || (b0 !== 0x78 && b0 !== 0x79)) {
        this.skip(1); // look for the next frame start
        continue;
      }
      const extended = b0 === 0x79;
      const headerLength = extended ? 4 : 3;
      if (this.buffer.length < headerLength) break;

      const bodyLength = extended ? this.buffer.readUInt16BE(2) : this.buffer[2];
      if (bodyLength < 5 || bodyLength > MAX_FRAME) {
        this.skip(2);
        continue;
      }
      const total = headerLength + bodyLength + 2;
      if (this.buffer.length < total) break;

      const frame = this.buffer.subarray(0, total);
      if (frame[total - 2] !== 0x0d || frame[total - 1] !== 0x0a) {
        this.skip(2);
        continue;
      }
      this.buffer = this.buffer.subarray(total);
      this.garbage = 0;

      if (frame.readUInt16BE(total - 4) !== crcItu(frame.subarray(2, total - 4))) {
        events.push({ type: 'bad-crc' });
        continue;
      }

      const protocol = frame[headerLength];
      const content = frame.subarray(headerLength + 1, total - 6);
      const serial = frame.readUInt16BE(total - 6);
      const event = this.decode(protocol, content, serial);
      if (event) events.push(event);
    }
    return events;
  }

  decode(protocol, content, serial) {
    if (protocol === PROTOCOL.LOGIN) {
      if (content.length < 8) throw new Error('Truncated GT06 login');
      // terminal id = IMEI as 8 BCD bytes with a leading zero nibble
      const hex = content.subarray(0, 8).toString('hex');
      const imei = hex.replace(/^0/, '');
      if (!/^\d{15}$/.test(imei)) throw new Error('Invalid GT06 terminal id');
      return { type: 'login', imei, serial };
    }

    if (protocol === PROTOCOL.HEARTBEAT) {
      if (content.length >= 1) this.acc = Boolean(content[0] & 0x02);
      return { type: 'heartbeat', serial };
    }

    if (LOCATION_PROTOCOLS.has(protocol)) {
      const { fixed, ignition, record } = parseLocation(content, this.acc);
      if (ignition !== null && ignition !== undefined) this.acc = ignition;
      return { type: 'location', protocol, serial, record: fixed ? record : null, ack: ACK_PROTOCOLS.has(protocol) };
    }

    if (protocol === PROTOCOL.COMMAND_RESPONSE) {
      // length of command (1), server flag (4), answer text, language (2)
      if (content.length < 5) throw new Error('Truncated GT06 command response');
      const textLength = Math.max(0, Math.min(content[0] - 4, content.length - 7));
      const text = content.subarray(5, 5 + textLength).toString('ascii').replace(/[^\x20-\x7e]/g, '?');
      return { type: 'command-response', serverFlag: content.readUInt32BE(1), text, serial };
    }

    return { type: 'unknown', protocol, serial };
  }
}

// ---------------------------------------------------------------------------
// Encoding helpers: server replies, the simulator and the tests
// ---------------------------------------------------------------------------

const u16 = (value) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(value & 0xffff);
  return b;
};

export function encodePacket(protocol, content, serial, { extended = false } = {}) {
  const body = Buffer.concat([Buffer.from([protocol]), content, u16(serial)]);
  const length = extended ? u16(body.length + 2) : Buffer.from([body.length + 2]);
  const start = Buffer.from(extended ? [0x79, 0x79] : [0x78, 0x78]);
  const crc = u16(crcItu(Buffer.concat([length, body])));
  return Buffer.concat([start, length, body, crc, Buffer.from([0x0d, 0x0a])]);
}

// Server reply to login / heartbeat / alarm packets
export const encodeAck = (protocol, serial) => encodePacket(protocol, Buffer.alloc(0), serial);

export function encodeLogin(imei, serial = 1) {
  // terminal id (8 BCD bytes), model code (2), time zone / language (2)
  return encodePacket(PROTOCOL.LOGIN, Buffer.concat([Buffer.from(imei.padStart(16, '0'), 'hex'), Buffer.from([0x36, 0x06, 0x32, 0x00])]), serial);
}

export function encodeHeartbeat({ ignition = true, voltage = 5, gsm = 4 } = {}, serial = 1) {
  return encodePacket(PROTOCOL.HEARTBEAT, Buffer.from([ignition ? 0x02 : 0x00, voltage, gsm, 0x00, 0x02]), serial);
}

export function encodeLocation(record, { protocol = PROTOCOL.LOCATION, serial = 1, fixed = true, extended = false } = {}) {
  const t = record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp);
  const content = Buffer.alloc(protocol === PROTOCOL.LOCATION_4G ? 36 : 26);
  [t.getUTCFullYear() - 2000, t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()].forEach((v, i) => {
    content[i] = v;
  });
  content[6] = (0x0c << 4) | ((record.satellites ?? 8) & 0x0f);
  content.writeUInt32BE(Math.round(Math.abs(record.lat) * COORD_DIVISOR), 7);
  content.writeUInt32BE(Math.round(Math.abs(record.lng) * COORD_DIVISOR), 11);
  content[15] = Math.min(255, Math.round(record.speed ?? 0));
  let flags = Math.round(record.heading ?? 0) & 0x3ff;
  if (record.lat >= 0) flags |= 0x0400;
  if (record.lng < 0) flags |= 0x0800;
  if (fixed) flags |= 0x1000;
  content.writeUInt16BE(flags, 16);
  // 18..25: MCC, MNC, LAC, cell id (zeros are fine for our purposes)
  content.writeUInt16BE(0x0112, 18); // MCC 274
  if (protocol === PROTOCOL.LOCATION_4G) content[26] = record.ignition === false ? 0 : 1; // ACC; rest: upload mode, re-upload, mileage
  return encodePacket(protocol, content, serial, { extended });
}

// Server -> tracker text command (protocol 0x80): length of command (= server flag + text), server flag (4),
// the command text, language (2). `flag` comes back in the tracker's answer so the answer can be matched.
export function encodeCommand(text, flag, serial = 1) {
  const body = Buffer.from(String(text), 'ascii');
  const flagBytes = Buffer.alloc(4);
  flagBytes.writeUInt32BE(flag >>> 0);
  return encodePacket(PROTOCOL.COMMAND, Buffer.concat([Buffer.from([4 + body.length]), flagBytes, body, Buffer.from([0x00, 0x01])]), serial);
}

// Tracker -> server answer (protocol 0x15); used by the tests and the simulator
export function encodeCommandResponse(text, flag, serial = 1) {
  const body = Buffer.from(String(text), 'ascii');
  const flagBytes = Buffer.alloc(4);
  flagBytes.writeUInt32BE(flag >>> 0);
  return encodePacket(PROTOCOL.COMMAND_RESPONSE, Buffer.concat([Buffer.from([4 + body.length]), flagBytes, body, Buffer.from([0x00, 0x02])]), serial);
}

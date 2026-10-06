import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TeltonikaParser, encodeLogin, encodeCodec12Command, encodeCodec12Response, parseCodec12, crc16Ibm, encodeAvlPacket } from '../gps/protocols/teltonika.js';
import { Gt06Parser, encodeCommand, encodeCommandResponse, encodePacket, PROTOCOL } from '../gps/protocols/gt06.js';

test('Codec 12: the command packet equals the documented "getinfo" example', () => {
  // Teltonika's documentation: 0000000F 0C 01 05 00000007 676574696E666F 01 00004312
  assert.equal(encodeCodec12Command('getinfo').toString('hex').toUpperCase(), '000000000000000F0C010500000007676574696E666F0100004312');
});

test('Codec 12: answers of the tracker are parsed after login; AVL data still works around them', () => {
  const parser = new TeltonikaParser();
  assert.equal(parser.push(encodeLogin('356307042441013'))[0].type, 'login');
  const events = parser.push(Buffer.concat([
    encodeCodec12Response('DOUT1:1 Timeout:0'),
    encodeAvlPacket([{ timestamp: Date.now(), lat: 47.9, lng: 106.9, speed: 0 }])
  ]));
  assert.deepEqual(events.map((e) => e.type), ['command-response', 'data']);
  assert.equal(events[0].text, 'DOUT1:1 Timeout:0');
  assert.equal(events[0].messageType, 6);
  assert.equal(events[1].records.length, 1);

  // a corrupted answer is dropped like any packet with a wrong CRC
  const bad = Buffer.from(encodeCodec12Response('x'));
  bad[bad.length - 1] ^= 0xff;
  assert.equal(parser.push(bad)[0].crcOk, false);
  // text that is not printable is replaced, never passed on raw
  const data = encodeCodec12Response('a\u0001b').subarray(8, -4);
  assert.equal(parseCodec12(data).text, 'a?b');
  assert.throws(() => parseCodec12(Buffer.from([0x0c, 0x02, 0x06, 0, 0, 0, 0, 0])));
  assert.equal(crc16Ibm(data) === encodeCodec12Response('a\u0001b').readUInt32BE(encodeCodec12Response('a\u0001b').length - 4), true);
});

test('GT06: command packet layout and the tracker answer are matched by the server flag', () => {
  const packet = encodeCommand('RELAY,1#', 0xdeadbeef, 7);
  // 78 78 | length | 80 | command length (flag + text) | flag | text | language | serial | CRC | 0D 0A
  assert.equal(packet[0], 0x78);
  assert.equal(packet[2], packet.length - 5); // protocol .. CRC
  assert.equal(packet[3], PROTOCOL.COMMAND);
  assert.equal(packet[4], 4 + 'RELAY,1#'.length);
  assert.equal(packet.readUInt32BE(5), 0xdeadbeef);
  assert.equal(packet.subarray(9, 17).toString('ascii'), 'RELAY,1#');
  assert.equal(packet.readUInt16BE(packet.length - 6), 7);
  assert.deepEqual([...packet.subarray(-2)], [0x0d, 0x0a]);

  const events = new Gt06Parser().push(encodeCommandResponse('RELAY:ON', 0xdeadbeef, 9));
  assert.equal(events.length, 1);
  assert.deepEqual({ type: events[0].type, text: events[0].text, serverFlag: events[0].serverFlag }, { type: 'command-response', text: 'RELAY:ON', serverFlag: 0xdeadbeef });
  // a short or malformed answer never crashes the parser
  assert.throws(() => new Gt06Parser().push(encodePacket(PROTOCOL.COMMAND_RESPONSE, Buffer.from([1, 2]), 1)));
});

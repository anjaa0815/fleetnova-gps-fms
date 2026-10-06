import net from 'net';
import { Gt06Parser, encodeAck, PROTOCOL } from './protocols/gt06.js';
import { findActiveDeviceByImei, ingestRecords, markDeviceSeen } from './ingestion.js';
import { registerConnection, unregisterConnection } from './connections.js';
import { deliverPendingForDevice, handleCommandResponse } from '../services/deviceCommands.js';

const LOGIN_TIMEOUT_MS = 10 * 1000;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // trackers send a heartbeat every few minutes

// TCP listener for GT06 / Concox trackers
export function createGt06Server() {
  return net.createServer((socket) => {
    const parser = new Gt06Parser();
    let device = null;
    let chain = Promise.resolve();

    let connection = null;
    let serial = 0x4000; // serial numbers of the packets we initiate (commands)

    const write = (buffer) => {
      if (socket.destroyed || !socket.writable) return false;
      socket.write(buffer);
      return true;
    };

    const loginTimer = setTimeout(() => socket.destroy(), LOGIN_TIMEOUT_MS);
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy());
    socket.setNoDelay(true);

    const handle = async (event) => {
      if (event.type === 'login') {
        clearTimeout(loginTimer);
        device = await findActiveDeviceByImei(event.imei);
        // GT06 has no "rejected" reply: an unknown tracker is simply disconnected.
        // Only devices registered as "gt06" may use this port.
        if (!device || device.protocol !== 'gt06') {
          socket.destroy();
          return;
        }
        write(encodeAck(PROTOCOL.LOGIN, event.serial));
        await markDeviceSeen(device);
        connection = registerConnection(device._id, {
          protocol: 'gt06',
          send: write,
          nextSerial: () => { serial = (serial + 1) & 0xffff; return serial; },
          inflight: null
        });
        deliverPendingForDevice(device).catch((error) => console.warn(`[GPS] Pending commands: ${error.message}`));
        return;
      }

      if (event.type === 'bad-crc') return; // corrupted frame: the tracker re-sends what it did not see acknowledged
      if (!device) {
        socket.destroy(); // data before a valid login
        return;
      }

      if (event.type === 'command-response') {
        await handleCommandResponse(device, { text: event.text, flag: event.serverFlag });
        return;
      }

      if (event.type === 'heartbeat') {
        write(encodeAck(PROTOCOL.HEARTBEAT, event.serial));
        await markDeviceSeen(device);
        return;
      }

      if (event.type === 'location') {
        if (event.record) {
          const accepted = await ingestRecords(device, [event.record]);
          if (accepted === 0) {
            // the device was removed / its organization suspended while connected
            socket.destroy();
            return;
          }
        }
        if (event.ack) write(encodeAck(event.protocol, event.serial));
      }
    };

    socket.on('data', (chunk) => {
      chain = chain
        .then(async () => {
          for (const event of parser.push(chunk)) {
            // eslint-disable-next-line no-await-in-loop
            await handle(event);
          }
        })
        .catch((error) => {
          console.warn(`[GPS] Closing GT06 connection: ${error.message}`);
          socket.destroy();
        });
    });

    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(loginTimer);
      if (connection) unregisterConnection(device._id, connection);
    });
  });
}

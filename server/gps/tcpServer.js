import net from 'net';
import {
  TeltonikaParser,
  loginResponse,
  dataResponse
} from './protocols/teltonika.js';
import { findActiveDeviceByImei, ingestRecords } from './ingestion.js';
import { registerConnection, unregisterConnection } from './connections.js';
import { deliverPendingForDevice, handleCommandResponse } from '../services/deviceCommands.js';
import { createGt06Server } from './gt06Server.js';

const LOGIN_TIMEOUT_MS = 10 * 1000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// TCP listener for Teltonika trackers (Codec 8 / 8E)
export function createTeltonikaServer() {
  return net.createServer((socket) => {
    const parser = new TeltonikaParser();
    let device = null;
    let chain = Promise.resolve();

    let connection = null; // this tracker in the connection registry (commands are written through it)

    const write = (buffer) => {
      if (socket.destroyed || !socket.writable) return false;
      socket.write(buffer);
      return true;
    };

    // A tracker must identify itself quickly and must keep talking (it sends data or a keep-alive)
    const loginTimer = setTimeout(() => socket.destroy(), LOGIN_TIMEOUT_MS);
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy());
    socket.setNoDelay(true);

    const handle = async (event) => {
      if (event.type === 'login') {
        clearTimeout(loginTimer);
        device = await findActiveDeviceByImei(event.imei);
        // Only devices registered as "teltonika" may use this port
        if (!device || device.protocol !== 'teltonika') {
          write(loginResponse(false));
          socket.end();
          return;
        }
        write(loginResponse(true));
        connection = registerConnection(device._id, { protocol: 'teltonika', send: write, nextSerial: () => 0, inflight: null });
        // commands that were waiting for this tracker to connect
        deliverPendingForDevice(device).catch((error) => console.warn(`[GPS] Pending commands: ${error.message}`));
        return;
      }

      if (!device) {
        socket.destroy();
        return;
      }
      if (event.type === 'command-response') {
        await handleCommandResponse(device, { text: event.text });
        return;
      }
      if (!event.crcOk) {
        write(dataResponse(0)); // tracker will retry
        return;
      }
      const accepted = await ingestRecords(device, event.records);
      if (accepted === 0 && event.records.length > 0) {
        // device was removed / its organization suspended while connected
        socket.destroy();
        return;
      }
      write(dataResponse(accepted));
    };

    socket.on('data', (chunk) => {
      // Process sequentially so ACKs keep the order of the packets
      chain = chain
        .then(async () => {
          for (const event of parser.push(chunk)) {
            // eslint-disable-next-line no-await-in-loop
            await handle(event);
          }
        })
        .catch((error) => {
          console.warn(`[GPS] Closing connection: ${error.message}`);
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

function listen(server, port, label) {
  server.on('error', (error) => {
    console.error(`[GPS] ${label} listener failed on port ${port}: ${error.message}`);
  });
  // Trackers connect from the internet, so this listens on all interfaces (unlike the web UI)
  server.listen(port, process.env.GPS_TCP_HOST || '0.0.0.0', () => {
    console.log(`[GPS] ${label} listener on tcp://0.0.0.0:${port}`);
  });
  return server;
}

const portFrom = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value));

// Starts the tracker listeners: Teltonika (GPS_TCP_PORT, default 5027) and GT06 / Concox (GT06_TCP_PORT,
// default 5023). A port of 0 disables the listener.
export function startGpsServers() {
  const servers = [];
  const teltonikaPort = portFrom(process.env.GPS_TCP_PORT, 5027);
  const gt06Port = portFrom(process.env.GT06_TCP_PORT, 5023);

  if (Number.isInteger(teltonikaPort) && teltonikaPort > 0) {
    servers.push(listen(createTeltonikaServer(), teltonikaPort, 'Teltonika (Codec 8/8E)'));
  } else {
    console.log('[GPS] Teltonika listener disabled (GPS_TCP_PORT=0).');
  }
  if (Number.isInteger(gt06Port) && gt06Port > 0) {
    servers.push(listen(createGt06Server(), gt06Port, 'GT06 / Concox'));
  } else {
    console.log('[GPS] GT06 / Concox listener disabled (GT06_TCP_PORT=0).');
  }
  return servers;
}

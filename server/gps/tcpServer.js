import net from 'net';
import {
  TeltonikaParser,
  loginResponse,
  dataResponse
} from './protocols/teltonika.js';
import { findActiveDeviceByImei, ingestRecords } from './ingestion.js';

const LOGIN_TIMEOUT_MS = 10 * 1000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// TCP listener for Teltonika trackers (Codec 8 / 8E)
export function createTeltonikaServer() {
  return net.createServer((socket) => {
    const parser = new TeltonikaParser();
    let device = null;
    let chain = Promise.resolve();

    const write = (buffer) => {
      if (!socket.destroyed && socket.writable) socket.write(buffer);
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
        return;
      }

      if (!device) {
        socket.destroy();
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
    socket.on('close', () => clearTimeout(loginTimer));
  });
}

// Starts the tracker listeners. GPS_TCP_PORT=0 disables them.
export function startGpsServers() {
  const raw = process.env.GPS_TCP_PORT;
  const port = raw === undefined || raw === '' ? 5027 : Number(raw);
  if (!Number.isInteger(port) || port <= 0) {
    console.log('[GPS] Tracker TCP listener disabled (GPS_TCP_PORT=0).');
    return null;
  }

  const server = createTeltonikaServer();
  server.on('error', (error) => {
    console.error(`[GPS] Teltonika listener failed on port ${port}: ${error.message}`);
  });
  // Trackers connect from the internet, so this listens on all interfaces (unlike the web UI)
  server.listen(port, process.env.GPS_TCP_HOST || '0.0.0.0', () => {
    console.log(`[GPS] Teltonika (Codec 8/8E) listener on tcp://0.0.0.0:${port}`);
  });
  return server;
}

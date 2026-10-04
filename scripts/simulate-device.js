#!/usr/bin/env node
// Tracker simulator: drives a fake vehicle along a route and sends positions over TCP.
//
//   node scripts/simulate-device.js --imei 356307042441013 [--protocol teltonika|gt06] [--host 127.0.0.1]
//        [--port 5027 (teltonika) | 5023 (gt06)] [--interval 5] [--speed 60] [--extended]
//
// Register the IMEI first in the app (GPS Devices page, same protocol) and link it to a vehicle.
import net from 'net';
import { encodeAvlPacket, encodeLogin } from '../server/gps/protocols/teltonika.js';
import { encodeHeartbeat, encodeLocation, encodeLogin as encodeGt06Login } from '../server/gps/protocols/gt06.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, [])
);

const imei = String(args.imei || '');
if (!/^\d{15}$/.test(imei)) {
  console.error('Usage: node scripts/simulate-device.js --imei <15 digits> [--protocol teltonika|gt06] [--host H] [--port P] [--interval sec] [--speed km/h] [--extended]');
  process.exit(1);
}
const protocol = String(args.protocol || 'teltonika');
if (!['teltonika', 'gt06'].includes(protocol)) {
  console.error('Protocol must be teltonika or gt06');
  process.exit(1);
}
const host = args.host || '127.0.0.1';
const port = Number(args.port || (protocol === 'gt06' ? 5023 : 5027));
const intervalSec = Number(args.interval || 5);
const speedKmh = Number(args.speed || 60);
const extended = Boolean(args.extended);

// Ulaanbaatar -> Darkhan (approximate waypoints), driven back and forth
const ROUTE = [
  [47.9188, 106.9176],
  [48.0300, 106.8000],
  [48.2000, 106.6800],
  [48.4000, 106.5500],
  [48.6000, 106.4000],
  [48.8000, 106.2900],
  [49.4867, 105.9228]
];

const toRad = (d) => (d * Math.PI) / 180;
const distanceKm = ([lat1, lng1], [lat2, lng2]) => {
  const h = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const bearing = ([lat1, lng1], [lat2, lng2]) => {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

let segment = 0;
let direction = 1;
let progress = 0; // km travelled on the current segment
let odometerM = 120000000;

function step() {
  const from = ROUTE[segment];
  const to = ROUTE[segment + direction];
  const length = distanceKm(from, to);
  progress += (speedKmh * intervalSec) / 3600;
  if (progress >= length) {
    segment += direction;
    progress = 0;
    if (segment + direction < 0 || segment + direction >= ROUTE.length) direction *= -1;
  }
  const a = ROUTE[segment];
  const b = ROUTE[segment + direction];
  const f = Math.min(progress / Math.max(distanceKm(a, b), 0.001), 1);
  odometerM += Math.round((speedKmh * intervalSec * 1000) / 3600);
  return {
    timestamp: Date.now(),
    lat: a[0] + (b[0] - a[0]) * f,
    lng: a[1] + (b[1] - a[1]) * f,
    altitude: 1300,
    heading: Math.round(bearing(a, b)),
    satellites: 10,
    speed: speedKmh,
    io: { 239: 1, 66: 12600, 16: odometerM }
  };
}

const socket = net.connect(port, host, () => {
  console.log(`Connected to ${host}:${port} (${protocol}), logging in as ${imei}`);
  socket.write(protocol === 'gt06' ? encodeGt06Login(imei, 1) : encodeLogin(imei));
});

let loggedIn = false;
let serial = 1;

function startSending() {
  loggedIn = true;
  console.log('Login accepted, sending positions...');
  const send = () => {
    const record = step();
    if (protocol === 'gt06') {
      serial += 1;
      socket.write(encodeLocation({ ...record, ignition: true }, { protocol: 0x22, serial }));
    } else {
      socket.write(encodeAvlPacket([record], { extended }));
    }
    console.log(`-> ${record.lat.toFixed(5)}, ${record.lng.toFixed(5)} @ ${record.speed} km/h`);
  };
  if (protocol === 'gt06') {
    // GT06 trackers send a heartbeat every few minutes to stay connected
    setInterval(() => { serial += 1; socket.write(encodeHeartbeat({ ignition: true }, serial)); }, 60 * 1000);
  }
  send();
  setInterval(send, intervalSec * 1000);
}

socket.on('data', (data) => {
  if (loggedIn) return; // acknowledgements of later packets are not needed by the simulator
  // Teltonika: single byte 0x01 = accepted; GT06: acknowledgement frame 78 78 05 01 ...
  const accepted = protocol === 'gt06' ? data.length >= 10 && data[0] === 0x78 && data[3] === 0x01 : data[0] === 1;
  if (!accepted) {
    console.error('Server rejected the IMEI (register the device first, with the same protocol).');
    process.exit(2);
  }
  startSending();
});
socket.on('close', () => {
  console.log('Connection closed');
  process.exit(0);
});
socket.on('error', (error) => {
  console.error(`Connection error: ${error.message}`);
  process.exit(1);
});

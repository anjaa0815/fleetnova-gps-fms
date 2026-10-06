import crypto from 'crypto';
import { DataEngine } from '../models/dataEngine.js';
import { runWithTenant, runAsSystem } from '../middleware/tenantContext.js';
import { ServiceError } from './organizationService.js';
import { sendTraccarCommand, traccarConfigured } from './traccarClient.js';
import { encodeCodec12Command } from '../gps/protocols/teltonika.js';
import { encodeCommand } from '../gps/protocols/gt06.js';
import { getConnection, connectedDeviceIds } from '../gps/connections.js';

// ---- what can be sent ------------------------------------------------------------------------------
// `engine` commands cut or restore the engine through a relay: they are admin only, need the device to be
// marked as having an immobilizer, and engine_stop is refused unless the vehicle is known to stand still.
export const COMMAND_TYPES = {
  locate: { engine: false },
  reboot: { engine: false },
  engine_stop: { engine: true },
  engine_resume: { engine: true }
};

export const STOP_MAX_SPEED_KMH = 5; // engine_stop only when the last known speed is below this
export const FRESH_POSITION_MS = 10 * 60 * 1000; // ... and the position is not older than this
const MAX_OPEN_PER_DEVICE = 5;

const ttlMs = (type) =>
  COMMAND_TYPES[type].engine
    ? Number(process.env.COMMAND_ENGINE_TTL_MS) || 10 * 60 * 1000 // a late engine command is dangerous: short
    : Number(process.env.COMMAND_TTL_MS) || 30 * 60 * 1000;
const ackTimeoutMs = () => Number(process.env.COMMAND_ACK_TIMEOUT_MS) || 90 * 1000;

// Text each protocol understands. The engine commands depend on how the relay is wired and on the tracker's
// configuration, so they are configurable (and unverified without the hardware): see the README.
const TEXT = {
  teltonika: {
    locate: () => 'getgps',
    reboot: () => 'cpureset',
    engine_stop: () => process.env.TELTONIKA_ENGINE_STOP_COMMAND || 'setdigout 1',
    engine_resume: () => process.env.TELTONIKA_ENGINE_RESUME_COMMAND || 'setdigout 0'
  },
  gt06: {
    locate: () => 'WHERE#',
    reboot: () => 'RESET#',
    engine_stop: () => process.env.GT06_ENGINE_STOP_COMMAND || 'RELAY,1#',
    engine_resume: () => process.env.GT06_ENGINE_RESUME_COMMAND || 'RELAY,0#'
  }
};

export const commandsSupported = (protocol) => protocol === 'teltonika' || protocol === 'gt06' || (protocol === 'traccar' && traccarConfigured());
const commandText = (protocol, type) => (TEXT[protocol] ? TEXT[protocol][type]() : `traccar:${type}`);

const idOf = (ref) => String(ref?._id || ref || '');
const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

// Why an engine_stop must not happen now (or null): the vehicle might be moving
export function engineStopBlock(device, now = Date.now()) {
  const last = device.lastPosition;
  const at = last?.timestamp ? new Date(last.timestamp).getTime() : 0;
  if (!last || !at || now - at > FRESH_POSITION_MS) {
    return 'The last position is too old to know whether the vehicle is standing still';
  }
  if (!(Number(last.speed) < STOP_MAX_SPEED_KMH)) {
    return 'The vehicle is moving. The engine can only be stopped when it stands still';
  }
  return null;
}

const serialize = (c) => ({
  _id: c._id,
  device: idOf(c.device),
  type: c.type,
  text: c.text,
  status: c.status,
  createdByName: c.createdByName || '',
  createdAt: c.createdAt,
  expiresAt: c.expiresAt,
  sentAt: c.sentAt || null,
  ackedAt: c.ackedAt || null,
  response: c.response || '',
  error: c.error || ''
});
export const serializeCommand = serialize;

// Runs inside the organization's tenant context (the request's, or one opened by the worker)
export async function createCommand({ user, device, type, confirmRegistration }) {
  if (!COMMAND_TYPES[type]) throw new ServiceError('Unknown command');
  if (!commandsSupported(device.protocol)) {
    throw new ServiceError(device.protocol === 'traccar' ? 'Traccar is not configured on this server' : 'This kind of device cannot receive commands');
  }
  const engine = COMMAND_TYPES[type].engine;

  let vehicle = null;
  if (engine) {
    if (user.role !== 'admin') throw new ServiceError('Only an administrator can send engine commands', 403);
    if (!device.immobilizer) {
      throw new ServiceError('Engine commands are not enabled for this device. Enable them only after the engine relay has been installed and tested.', 409);
    }
    vehicle = device.vehicle ? await DataEngine.findById('vehicles', idOf(device.vehicle)) : null;
    if (!vehicle) throw new ServiceError('Link the device to a vehicle before sending engine commands', 409);
    if (normalize(confirmRegistration) !== normalize(vehicle.registrationNumber)) {
      throw new ServiceError('Type the vehicle registration number to confirm the engine command', 400);
    }
    if (type === 'engine_stop') {
      const block = engineStopBlock(device);
      if (block) throw new ServiceError(block, 409);
    }
  }

  const open = await DataEngine.find('commands', { device: String(device._id), status: { $in: ['queued', 'sending', 'sent'] } });
  if (engine && open.some((c) => COMMAND_TYPES[c.type]?.engine)) {
    throw new ServiceError('An engine command for this device is still pending', 409);
  }
  if (open.length >= MAX_OPEN_PER_DEVICE) throw new ServiceError('Too many commands are waiting for this device', 429);

  const created = await DataEngine.create('commands', {
    device: device._id,
    vehicle: device.vehicle ? idOf(device.vehicle) : null,
    type,
    protocol: device.protocol,
    text: commandText(device.protocol, type),
    status: 'queued',
    createdBy: user._id,
    createdByName: user.name || user.email || '',
    expiresAt: new Date(Date.now() + ttlMs(type)).toISOString()
  });

  // a tracker that is connected right now gets it at once; the worker handles the rest
  await deliverForDevice(device._id).catch((error) => console.error(`[Commands] Delivery failed: ${error.message}`));
  return DataEngine.findById('commands', created._id);
}

// Withdraws a command that has not been sent yet
export async function cancelCommand(id) {
  return DataEngine.updateIf('commands', id, { status: 'queued' }, { status: 'cancelled' });
}

// ---- delivery ------------------------------------------------------------------------------------
const finish = (command, update) => DataEngine.updateIf('commands', command._id, { status: 'sending' }, update);

// Sends one queued command. Runs inside the organization's tenant context.
async function deliver(command) {
  // claim it (another instance or cycle may be looking at the same command)
  const claimed = await DataEngine.updateIf('commands', command._id, { status: 'queued' }, { status: 'sending' });
  if (!claimed) return;
  const release = () => DataEngine.updateIf('commands', command._id, { status: 'sending' }, { status: 'queued' });

  if (new Date(claimed.expiresAt).getTime() < Date.now()) {
    await finish(claimed, { status: 'expired', error: 'The device did not connect in time' });
    return;
  }

  const device = await DataEngine.findById('devices', idOf(claimed.device));
  if (!device) {
    await finish(claimed, { status: 'failed', error: 'The device no longer exists' });
    return;
  }
  // checked again at the moment of sending: the vehicle may have started to move while the command was waiting
  if (claimed.type === 'engine_stop') {
    const block = !device.immobilizer ? 'engine commands were switched off for this device' : engineStopBlock(device) && 'the vehicle was moving or its position was unknown';
    if (block) {
      await finish(claimed, { status: 'failed', error: `Not sent: ${block}` });
      return;
    }
  }

  if (claimed.protocol === 'traccar') {
    try {
      await sendTraccarCommand(device.imei, claimed.type);
      await finish(claimed, { status: 'sent', sentAt: new Date().toISOString() });
    } catch (error) {
      await finish(claimed, { status: 'failed', error: `Traccar: ${String(error.message).slice(0, 200)}` });
    }
    return;
  }

  const entry = getConnection(device._id);
  if (!entry || entry.inflight) {
    await release(); // not connected to this process, or still waiting for the answer to the previous command
    return;
  }
  let packet;
  let flag = null;
  if (entry.protocol === 'teltonika') {
    packet = encodeCodec12Command(claimed.text);
  } else {
    flag = crypto.randomBytes(4).readUInt32BE(0);
    packet = encodeCommand(claimed.text, flag, entry.nextSerial());
  }
  if (!entry.send(packet)) {
    await release(); // the socket closed meanwhile
    return;
  }
  entry.inflight = { id: String(claimed._id), flag, at: Date.now() };
  await finish(claimed, { status: 'sent', sentAt: new Date().toISOString(), flag });
}

async function deliverForDevice(deviceId) {
  const queued = await DataEngine.find('commands', { device: String(deviceId), status: 'queued' }, { sort: { createdAt: 1 } });
  for (const command of queued) {
    // eslint-disable-next-line no-await-in-loop
    await deliver(command);
  }
}

// A tracker just logged in, or a command was just created: send what is waiting for it
export async function deliverPendingForDevice(device) {
  return runWithTenant({ orgId: String(device.orgId) }, () => deliverForDevice(device._id));
}

// The tracker answered a command (called by the TCP listeners)
export async function handleCommandResponse(device, { text, flag = null }) {
  const entry = getConnection(device._id);
  const inflight = entry?.inflight;
  if (!inflight) return; // nothing was asked: ignore
  if (flag !== null && inflight.flag !== null && flag !== inflight.flag) return; // an answer to something else
  entry.inflight = null;
  await runWithTenant({ orgId: String(device.orgId) }, () =>
    DataEngine.updateIf('commands', inflight.id, { status: 'sent' }, {
      status: 'acknowledged',
      ackedAt: new Date().toISOString(),
      response: String(text || '').slice(0, 300)
    })
  );
}

// ---- background worker --------------------------------------------------------------------------
const inTenant = (command, fn) => runWithTenant({ orgId: String(command.orgId) }, fn);

export async function runCommandCycle() {
  const now = new Date();
  const system = (fn) => runAsSystem(fn);

  // queued commands that waited too long
  for (const c of await system(() => DataEngine.find('commands', { status: 'queued', expiresAt: { $lt: now.toISOString() } }, { limit: 100 }))) {
    // eslint-disable-next-line no-await-in-loop
    await inTenant(c, () => DataEngine.updateIf('commands', c._id, { status: 'queued' }, { status: 'expired', error: 'The device did not connect in time' }));
  }
  // sent, but the tracker never answered (many relays do not answer: the command may still have worked)
  const cutoff = new Date(now.getTime() - ackTimeoutMs()).toISOString();
  for (const c of await system(() => DataEngine.find('commands', { status: 'sent', sentAt: { $lt: cutoff } }, { limit: 100 }))) {
    // eslint-disable-next-line no-await-in-loop
    await inTenant(c, () => DataEngine.updateIf('commands', c._id, { status: 'sent' }, { status: 'unconfirmed', error: 'The device did not answer' }));
    const entry = getConnection(idOf(c.device));
    if (entry?.inflight?.id === String(c._id)) entry.inflight = null;
  }
  // a crash between claiming and sending
  const stuck = new Date(now.getTime() - 60 * 1000).toISOString();
  for (const c of await system(() => DataEngine.find('commands', { status: 'sending', updatedAt: { $lt: stuck } }, { limit: 50 }))) {
    // eslint-disable-next-line no-await-in-loop
    await inTenant(c, () => DataEngine.updateIf('commands', c._id, { status: 'sending' }, { status: 'queued' }));
  }

  // commands for trackers connected to this process, and the ones that go through Traccar
  const ids = connectedDeviceIds();
  const waiting = await system(async () => [
    ...(ids.length ? await DataEngine.find('commands', { status: 'queued', device: { $in: ids } }, { sort: { createdAt: 1 }, limit: 200 }) : []),
    ...(await DataEngine.find('commands', { status: 'queued', protocol: 'traccar' }, { sort: { createdAt: 1 }, limit: 50 }))
  ]);
  const seen = new Set();
  for (const c of waiting) {
    if (seen.has(String(c._id))) continue;
    seen.add(String(c._id));
    // eslint-disable-next-line no-await-in-loop
    await inTenant(c, () => deliver(c)).catch((error) => console.error(`[Commands] Delivery failed: ${error.message}`));
  }
}

export function startCommandWorker() {
  const interval = Number(process.env.COMMAND_POLL_MS) || 1000;
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runCommandCycle()
      .catch((error) => console.error(`[Commands] Worker error: ${error.message}`))
      .finally(() => { running = false; });
  }, interval);
  timer.unref?.();
  return timer;
}

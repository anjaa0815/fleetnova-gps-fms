// The tracker connections this process holds, by device id. A command can only be written to a tracker that is
// connected to THIS process; with several app instances every instance delivers the commands of its own trackers.
//   entry: { protocol, send(buffer) -> boolean, nextSerial() -> number, inflight: null | { id, flag, at } }
const live = new Map();

export const registerConnection = (deviceId, entry) => {
  live.set(String(deviceId), entry);
  return entry;
};

// only removes the entry it was given: a tracker that reconnected already registered a newer one
export const unregisterConnection = (deviceId, entry) => {
  if (live.get(String(deviceId)) === entry) live.delete(String(deviceId));
};

export const getConnection = (deviceId) => live.get(String(deviceId)) || null;
export const connectedDeviceIds = () => [...live.keys()];

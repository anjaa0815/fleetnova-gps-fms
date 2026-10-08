import { DataEngine } from '../models/dataEngine.js';
import { runAsSystem } from '../middleware/tenantContext.js';
import { COMMAND_TYPES, cancelCommand, commandsSupported, createCommand, serializeCommand } from '../services/deviceCommands.js';

const OBJECT_ID = /^[0-9a-f]{24}$/;

async function ownDevice(req, res) {
  if (!OBJECT_ID.test(String(req.params.id))) {
    res.status(404).json({ success: false, message: 'Device not found' });
    return null;
  }
  // tenant scoped: a device of another organization is simply not found
  const device = await DataEngine.findById('devices', req.params.id, { populate: 'vehicle' });
  if (!device) res.status(404).json({ success: false, message: 'Device not found' });
  return device;
}

// @route POST /api/devices/:id/commands   { type, confirmRegistration? }
export const sendCommand = async (req, res, next) => {
  try {
    const device = await ownDevice(req, res);
    if (!device) return;
    const type = String(req.body.type || '');
    if (!COMMAND_TYPES[type]) return res.status(400).json({ success: false, message: 'Unknown command' });
    const user = await runAsSystem(() => DataEngine.findById('users', req.user._id));
    const command = await createCommand({ user: user || req.user, device, type, confirmRegistration: req.body.confirmRegistration });
    if (COMMAND_TYPES[type].engine) {
      console.log(`[Commands] ${type} on device ${device._id} requested by ${req.user.email} (org ${req.user.orgId})`);
    }
    return res.status(201).json({ success: true, data: serializeCommand(command) });
  } catch (error) {
    return next(error);
  }
};

// @route GET /api/devices/:id/commands
export const listCommands = async (req, res, next) => {
  try {
    const device = await ownDevice(req, res);
    if (!device) return;
    const commands = await DataEngine.find('commands', { device: String(device._id) }, { sort: { createdAt: -1 }, limit: 30 });
    return res.status(200).json({
      success: true,
      data: commands.map(serializeCommand),
      supported: commandsSupported(device.protocol),
      immobilizer: Boolean(device.immobilizer)
    });
  } catch (error) {
    return next(error);
  }
};

// @route POST /api/devices/:id/commands/:commandId/cancel
export const cancelPendingCommand = async (req, res, next) => {
  try {
    const device = await ownDevice(req, res);
    if (!device) return;
    if (!OBJECT_ID.test(String(req.params.commandId))) return res.status(404).json({ success: false, message: 'Command not found' });
    const command = await DataEngine.findById('commands', req.params.commandId);
    if (!command || String(command.device) !== String(device._id)) return res.status(404).json({ success: false, message: 'Command not found' });
    const cancelled = await cancelCommand(command._id);
    if (!cancelled) return res.status(409).json({ success: false, message: 'Only a command that has not been sent yet can be cancelled' });
    return res.status(200).json({ success: true, data: serializeCommand(cancelled) });
  } catch (error) {
    return next(error);
  }
};

import { DataEngine } from '../models/dataEngine.js';
import { runAsSystem } from '../middleware/tenantContext.js';
import { getPlan } from '../config/plans.js';
import { deliverySettings } from '../services/organizationService.js';
import { getProvider, providerStatus } from '../notify/providers.js';
import { deliveryUsage } from '../notify/dispatcher.js';
import { maskEmail, maskPhone, normalizePhone } from '../notify/phone.js';

// @desc Which providers are active, this organization's limits and usage
// @route GET /api/delivery/config
export const getDeliveryConfig = async (req, res, next) => {
  try {
    const plan = getPlan(req.org.plan);
    res.status(200).json({
      success: true,
      data: {
        providers: providerStatus(),
        settings: deliverySettings(req.org),
        limits: { emailPerDay: plan.maxEmailsPerDay, smsPerDay: plan.maxSmsPerDay },
        usage: await deliveryUsage()
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc Recent deliveries (addresses are masked)
// @route GET /api/delivery/log
export const getDeliveryLog = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const items = await DataEngine.find('deliveries', {}, { sort: { createdAt: -1 }, limit });
    res.status(200).json({
      success: true,
      data: items.map((d) => ({
        _id: d._id,
        channel: d.channel,
        type: d.type,
        to: d.channel === 'email' ? maskEmail(d.to) : maskPhone(d.to),
        status: d.status,
        attempts: d.attempts,
        lastError: d.lastError || '',
        simulated: Boolean(d.simulated),
        createdAt: d.createdAt,
        sentAt: d.sentAt || null
      }))
    });
  } catch (error) {
    next(error);
  }
};

// Test messages are sent directly (not queued) so the admin sees the provider's answer immediately
const recentTests = new Map();

// @desc Send a test message to the caller to verify the provider configuration
// @route POST /api/delivery/test   { channel: 'email' | 'sms' }
export const sendTestMessage = async (req, res, next) => {
  try {
    const { channel } = req.body;
    if (!['email', 'sms'].includes(channel)) {
      return res.status(400).json({ success: false, message: 'Channel must be "email" or "sms"' });
    }

    const key = `${req.org._id}:${channel}`;
    const last = recentTests.get(key) || 0;
    if (Date.now() - last < 10 * 1000) {
      return res.status(429).json({ success: false, message: 'Please wait a few seconds before sending another test' });
    }
    recentTests.set(key, Date.now());

    const user = await runAsSystem(() => DataEngine.findById('users', req.user._id));
    const to = channel === 'email' ? user.email : normalizePhone(user.phone);
    if (!to) {
      return res.status(400).json({ success: false, message: 'Your profile has no valid phone number' });
    }

    const provider = getProvider(channel);
    try {
      await provider.send({
        to,
        subject: '[CLIXGPS] Test message',
        text: `CLIXGPS test message for ${req.org.name}. Alert delivery by ${channel} works.`
      });
    } catch (error) {
      return res.status(502).json({ success: false, message: `Sending failed: ${error.message}` });
    }
    return res.status(200).json({
      success: true,
      message: provider.simulated ? 'Test message simulated (no provider configured)' : 'Test message sent',
      data: { provider: provider.name, simulated: provider.simulated, to: channel === 'email' ? maskEmail(to) : maskPhone(to) }
    });
  } catch (error) {
    return next(error);
  }
};

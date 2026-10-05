// Subscription plans. A limit of -1 means unlimited.
export const PLANS = {
  trial: { label: 'Trial', maxVehicles: 10, maxUsers: 5, maxDevices: 10, maxEmailsPerDay: 50, maxSmsPerDay: 20, trialDays: 14, positionRetentionDays: 30 },
  basic: { label: 'Basic', maxVehicles: 50, maxUsers: 20, maxDevices: 50, maxEmailsPerDay: 300, maxSmsPerDay: 100, positionRetentionDays: 90 },
  pro: { label: 'Pro', maxVehicles: 500, maxUsers: 200, maxDevices: 500, maxEmailsPerDay: 2000, maxSmsPerDay: 500, positionRetentionDays: 365 },
  enterprise: { label: 'Enterprise', maxVehicles: -1, maxUsers: -1, maxDevices: -1, maxEmailsPerDay: -1, maxSmsPerDay: -1, positionRetentionDays: 730 }
};

export const PLAN_IDS = Object.keys(PLANS);
export const ORG_STATUSES = ['active', 'suspended'];

export const getPlan = (planId) => PLANS[planId] || PLANS.trial;

export const isWithinLimit = (limit, currentCount) => limit < 0 || currentCount < limit;

// How long GPS positions are kept, in days; -1 keeps them forever. POSITION_RETENTION_DAYS overrides every plan
// (0 or a non-number is ignored, so a typo cannot delete everything).
export function positionRetentionDays(planId, env = process.env) {
  const override = Number(env.POSITION_RETENTION_DAYS);
  if (Number.isInteger(override) && (override > 0 || override === -1)) return override;
  return getPlan(planId).positionRetentionDays;
}

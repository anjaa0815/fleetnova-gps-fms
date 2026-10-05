// Subscription plans. A limit of -1 means unlimited.
export const PLANS = {
  trial: { label: 'Trial', maxVehicles: 10, maxUsers: 5, maxDevices: 10, maxEmailsPerDay: 50, maxSmsPerDay: 20, trialDays: 14, positionRetentionDays: 30, monthlyPriceMnt: 0 },
  basic: { label: 'Basic', maxVehicles: 50, maxUsers: 20, maxDevices: 50, maxEmailsPerDay: 300, maxSmsPerDay: 100, positionRetentionDays: 90, monthlyPriceMnt: 49000 },
  pro: { label: 'Pro', maxVehicles: 500, maxUsers: 200, maxDevices: 500, maxEmailsPerDay: 2000, maxSmsPerDay: 500, positionRetentionDays: 365, monthlyPriceMnt: 199000 },
  enterprise: { label: 'Enterprise', maxVehicles: -1, maxUsers: -1, maxDevices: -1, maxEmailsPerDay: -1, maxSmsPerDay: -1, positionRetentionDays: 730, monthlyPriceMnt: null }
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

// ---- Billing ------------------------------------------------------------------------------------
// Plans a customer can pay for online. Enterprise is agreed with the platform owner; trial is free.
// The default prices are PLACEHOLDERS: set PLAN_PRICE_BASIC / PLAN_PRICE_PRO (MNT per month).
export const BILLABLE_PLANS = ['basic', 'pro'];
export const BILLING_MONTHS = [1, 3, 6, 12];
// A paid subscription stays fully usable this many days after it ends, then the account turns read-only
export const GRACE_DAYS = Number.isInteger(Number(process.env.BILLING_GRACE_DAYS)) && Number(process.env.BILLING_GRACE_DAYS) >= 0
  ? Number(process.env.BILLING_GRACE_DAYS)
  : 3;

// Monthly price in MNT (whole tugrik), or null when the plan cannot be bought online
export function planPriceMnt(planId, env = process.env) {
  if (!BILLABLE_PLANS.includes(planId)) return null;
  const override = Number(env[`PLAN_PRICE_${planId.toUpperCase()}`]);
  if (Number.isInteger(override) && override > 0) return override;
  return PLANS[planId].monthlyPriceMnt;
}

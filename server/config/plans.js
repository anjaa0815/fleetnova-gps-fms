// Subscription plans. A limit of -1 means unlimited.
export const PLANS = {
  trial: { label: 'Trial', maxVehicles: 10, maxUsers: 5, maxDevices: 10, trialDays: 14 },
  basic: { label: 'Basic', maxVehicles: 50, maxUsers: 20, maxDevices: 50 },
  pro: { label: 'Pro', maxVehicles: 500, maxUsers: 200, maxDevices: 500 },
  enterprise: { label: 'Enterprise', maxVehicles: -1, maxUsers: -1, maxDevices: -1 }
};

export const PLAN_IDS = Object.keys(PLANS);
export const ORG_STATUSES = ['active', 'suspended'];

export const getPlan = (planId) => PLANS[planId] || PLANS.trial;

export const isWithinLimit = (limit, currentCount) => limit < 0 || currentCount < limit;

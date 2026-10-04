import bcrypt from 'bcryptjs';
import { DataEngine } from '../models/dataEngine.js';
import { PLANS, PLAN_IDS, getPlan } from '../config/plans.js';
import { slugify, RESERVED_SLUGS } from '../utils/slug.js';

export const MIN_PASSWORD_LENGTH = 8;

export class ServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const DELIVERY_TYPES = ['speeding', 'geofence_enter', 'geofence_exit'];

export const deliverySettings = (org) => ({
  email: Boolean(org?.settings?.delivery?.email),
  sms: Boolean(org?.settings?.delivery?.sms),
  types: org?.settings?.delivery?.types || [...DELIVERY_TYPES],
  language: org?.settings?.delivery?.language === 'en' ? 'en' : 'mn'
});

// Fields that are safe to expose about an organization
export const serializeOrg = (org) =>
  org && {
    _id: org._id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    plan: org.plan,
    trialEndsAt: org.trialEndsAt || null,
    contactEmail: org.contactEmail || '',
    contactPhone: org.contactPhone || '',
    address: org.address || '',
    settings: {
      speedLimitKmh: org.settings?.speedLimitKmh || 0,
      delivery: deliverySettings(org)
    },
    branding: {
      logoUrl: org.branding?.logoUrl || '',
      primaryColor: org.branding?.primaryColor || '#2563eb'
    },
    createdAt: org.createdAt
  };

export const serializeUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone,
  status: u.status,
  orgId: u.orgId || null,
  emailVerified: u.emailVerified !== false,
  alertChannels: { email: Boolean(u.alertChannels?.email), sms: Boolean(u.alertChannels?.sms) }
});

async function uniqueSlug(name) {
  const base = slugify(name) || 'org';
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (RESERVED_SLUGS.has(candidate) || (await DataEngine.findOne('organizations', { slug: candidate }))) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export function trialEndDate(from = new Date()) {
  return new Date(from.getTime() + PLANS.trial.trialDays * 24 * 60 * 60 * 1000).toISOString();
}

// Creates a new tenant together with its first administrator.
export async function createOrganizationWithAdmin({ organizationName, plan = 'trial', admin, emailVerified = true, language = 'mn' }) {
  const name = typeof organizationName === 'string' ? organizationName.trim() : '';
  if (name.length < 2 || name.length > 100) {
    throw new ServiceError('Organization name must be between 2 and 100 characters');
  }
  if (!PLAN_IDS.includes(plan)) throw new ServiceError('Invalid plan');

  const { name: adminName, email, password, phone = '' } = admin || {};
  if (!adminName || !email || !password) {
    throw new ServiceError('Name, email and password are required');
  }
  if (typeof email !== 'string' || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ServiceError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  const normalizedEmail = email.toLowerCase().trim();
  if (await DataEngine.findOne('users', { email: normalizedEmail })) {
    throw new ServiceError('User with this email already exists');
  }

  const org = await DataEngine.create('organizations', {
    name,
    slug: await uniqueSlug(name),
    status: 'active',
    plan,
    trialEndsAt: plan === 'trial' ? trialEndDate() : null,
    contactEmail: normalizedEmail,
    contactPhone: phone,
    address: '',
    settings: { speedLimitKmh: 0, delivery: { email: false, sms: false, types: [...DELIVERY_TYPES], language: 'mn' } },
    branding: { logoUrl: '', primaryColor: '#2563eb' }
  });

  const user = await DataEngine.create('users', {
    orgId: org._id,
    name: adminName,
    email: normalizedEmail,
    password: await bcrypt.hash(password, 10),
    role: 'admin',
    phone,
    status: 'active',
    emailVerified,
    language
  });

  return { org, user };
}

export const planLimits = (org) => {
  const plan = getPlan(org?.plan);
  return { label: plan.label, maxVehicles: plan.maxVehicles, maxUsers: plan.maxUsers, maxDevices: plan.maxDevices,
    maxEmailsPerDay: plan.maxEmailsPerDay,
    maxSmsPerDay: plan.maxSmsPerDay
  };
};

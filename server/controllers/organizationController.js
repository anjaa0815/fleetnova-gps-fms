import { invalidateOrganization } from '../gps/lookupCache.js';
import { DataEngine } from '../models/dataEngine.js';
import { PLAN_IDS, ORG_STATUSES } from '../config/plans.js';
import {
  DELIVERY_TYPES,
  ServiceError,
  createOrganizationWithAdmin,
  planLimits,
  serializeOrg,
  serializeUser
} from '../services/organizationService.js';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

async function usageFor(orgId) {
  const [users, vehicles, drivers] = await Promise.all([
    DataEngine.countDocuments('users', { orgId }),
    DataEngine.countDocuments('vehicles', { orgId }),
    DataEngine.countDocuments('drivers', { orgId })
  ]);
  return { users, vehicles, drivers };
}

// ---------------------------------------------------------------------------
// Current organization (organization users)
// ---------------------------------------------------------------------------

// @route GET /api/organization
export const getMyOrganization = async (req, res, next) => {
  try {
    if (!req.org) {
      return res.status(403).json({ success: false, message: 'Platform accounts do not belong to an organization' });
    }
    return res.status(200).json({
      success: true,
      data: {
        ...serializeOrg(req.org),
        limits: planLimits(req.org),
        usage: await usageFor(req.org._id)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @route PUT /api/organization (organization admin)
export const updateMyOrganization = async (req, res, next) => {
  try {
    if (!req.org) {
      return res.status(403).json({ success: false, message: 'Platform accounts do not belong to an organization' });
    }

    const { name, contactEmail, contactPhone, address, branding, settings } = req.body;
    const update = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
        return res.status(400).json({ success: false, message: 'Organization name must be between 2 and 100 characters' });
      }
      update.name = name.trim();
    }
    if (contactEmail !== undefined) update.contactEmail = String(contactEmail).trim().slice(0, 200);
    if (contactPhone !== undefined) update.contactPhone = String(contactPhone).trim().slice(0, 50);
    if (address !== undefined) update.address = String(address).trim().slice(0, 300);

    if (settings !== undefined && settings.delivery !== undefined) {
      const d = settings.delivery;
      const current = { ...(req.org.settings?.delivery || {}) };
      if (d.types !== undefined && (!Array.isArray(d.types) || !d.types.every((t) => DELIVERY_TYPES.includes(t)))) {
        return res.status(400).json({ success: false, message: 'Invalid alert types' });
      }
      if (d.language !== undefined && !['mn', 'en'].includes(d.language)) {
        return res.status(400).json({ success: false, message: 'Invalid language' });
      }
      update.settings = {
        ...(req.org.settings || {}),
        ...(update.settings || {}),
        delivery: {
          email: d.email !== undefined ? Boolean(d.email) : Boolean(current.email),
          sms: d.sms !== undefined ? Boolean(d.sms) : Boolean(current.sms),
          types: d.types !== undefined ? [...new Set(d.types)] : current.types || [...DELIVERY_TYPES],
          language: d.language !== undefined ? d.language : current.language || 'mn'
        }
      };
    }

    if (settings !== undefined && settings.speedLimitKmh !== undefined) {
      const limit = Number(settings.speedLimitKmh);
      if (!Number.isInteger(limit) || limit < 0 || limit > 300) {
        return res.status(400).json({ success: false, message: 'Speed limit must be a whole number between 0 and 300 km/h' });
      }
      update.settings = { ...(req.org.settings || {}), ...(update.settings || {}), speedLimitKmh: limit };
    }

    if (branding !== undefined) {
      const nextBranding = { ...(req.org.branding || {}) };
      if (branding.primaryColor !== undefined) {
        if (!HEX_COLOR.test(branding.primaryColor)) {
          return res.status(400).json({ success: false, message: 'Primary color must be a hex color like #2563eb' });
        }
        nextBranding.primaryColor = branding.primaryColor;
      }
      if (branding.logoUrl !== undefined) {
        const url = String(branding.logoUrl).trim();
        if (url && (!/^https:\/\//i.test(url) || url.length > 500)) {
          return res.status(400).json({ success: false, message: 'Logo URL must be an https:// link' });
        }
        nextBranding.logoUrl = url;
      }
      update.branding = nextBranding;
    }

    const org = await DataEngine.findByIdAndUpdate('organizations', req.org._id, update);
    invalidateOrganization(req.org._id);
    return res.status(200).json({
      success: true,
      message: 'Organization updated successfully',
      data: { ...serializeOrg(org), limits: planLimits(org), usage: await usageFor(org._id) }
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Public branding for per-organization login pages
// ---------------------------------------------------------------------------

// @route GET /api/public/organizations/:slug
export const getPublicOrganization = async (req, res, next) => {
  try {
    const org = await DataEngine.findOne('organizations', { slug: String(req.params.slug).toLowerCase() });
    if (!org || org.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }
    return res.status(200).json({
      success: true,
      data: { name: org.name, slug: org.slug, branding: serializeOrg(org).branding }
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Platform administration (super admin)
// ---------------------------------------------------------------------------

// @route GET /api/platform/organizations
export const listOrganizations = async (req, res, next) => {
  try {
    const orgs = await DataEngine.find('organizations');
    const data = await Promise.all(
      orgs.map(async (org) => ({ ...serializeOrg(org), limits: planLimits(org), usage: await usageFor(org._id) }))
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/platform/organizations
export const createOrganization = async (req, res, next) => {
  try {
    const { organizationName, plan = 'trial', adminName, adminEmail, adminPassword, adminPhone = '' } = req.body;
    const { org, user } = await createOrganizationWithAdmin({
      organizationName,
      plan,
      admin: { name: adminName, email: adminEmail, password: adminPassword, phone: adminPhone }
    });
    return res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      data: { organization: serializeOrg(org), admin: serializeUser(user) }
    });
  } catch (error) {
    next(error);
  }
};

// @route PUT /api/platform/organizations/:id
export const updateOrganization = async (req, res, next) => {
  try {
    const { status, plan, trialEndsAt } = req.body;
    const update = {};

    if (status !== undefined) {
      if (!ORG_STATUSES.includes(status)) throw new ServiceError('Invalid status');
      update.status = status;
    }
    if (plan !== undefined) {
      if (!PLAN_IDS.includes(plan)) throw new ServiceError('Invalid plan');
      update.plan = plan;
      if (plan !== 'trial') update.trialEndsAt = null;
    }
    if (trialEndsAt !== undefined) {
      const date = new Date(trialEndsAt);
      if (Number.isNaN(date.getTime())) throw new ServiceError('Invalid trial end date');
      update.trialEndsAt = date.toISOString();
    }

    const org = await DataEngine.findByIdAndUpdate('organizations', req.params.id, update);
    invalidateOrganization(req.params.id);
    if (!org) return res.status(404).json({ success: false, message: 'Organization not found' });

    return res.status(200).json({
      success: true,
      message: 'Organization updated successfully',
      data: { ...serializeOrg(org), limits: planLimits(org), usage: await usageFor(org._id) }
    });
  } catch (error) {
    next(error);
  }
};

import jwt from 'jsonwebtoken';
import { DataEngine } from '../models/dataEngine.js';
import { JWT_SECRET } from '../config/jwt.js';
import { runWithTenant } from './tenantContext.js';
import { GRACE_DAYS } from '../config/plans.js';

export const ACT_AS_HEADER = 'x-act-as-org';

const deny = (res, status, message) => res.status(status).json({ success: false, message });

export const protect = async (req, res, next) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return deny(res, 401, 'Not authorized, no token provided');
  }

  let user;
  let org = null;
  let acting = false;

  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    user = await DataEngine.findById('users', decoded.id);
    if (!user) return deny(res, 401, 'Not authorized, user no longer exists');
    // a password change / reset ends every session issued before it
    if ((decoded.tv || 0) !== (user.tokenVersion || 0)) return deny(res, 401, 'Not authorized, please sign in again');
    if (user.status === 'inactive') {
      return deny(res, 403, 'Account is deactivated. Please contact your Fleet Administrator.');
    }

    // The platform owner can work inside any organization ("acting as" it): the request then runs in that
    // organization's context with administrator rights, whatever its status or plan. Every change is logged.
    // The header means nothing to anyone else.
    const actAs = user.role === 'super_admin' ? req.headers[ACT_AS_HEADER] : null;
    if (actAs) {
      org = await DataEngine.findById('organizations', String(actAs));
      if (!org) return deny(res, 404, 'Organization not found');
      acting = true;
    } else if (user.role !== 'super_admin') {
      org = user.orgId ? await DataEngine.findById('organizations', user.orgId) : null;
      if (!org) return deny(res, 403, 'Your account is not linked to an organization');
      if (org.status === 'suspended') {
        return deny(res, 403, 'This organization is suspended. Please contact support.');
      }
      // An expired trial or subscription keeps read access but blocks changes until a plan is paid for.
      // Paying itself (/api/billing) must stay possible, of course.
      const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      const paying = String(req.baseUrl || '').startsWith('/api/billing');
      if (!readOnly && !paying) {
        if (org.plan === 'trial' && org.trialEndsAt && new Date(org.trialEndsAt) < new Date()) {
          return deny(res, 402, 'Your trial has expired. Please choose a plan to continue.');
        }
        if (
          ['basic', 'pro'].includes(org.plan) &&
          org.planExpiresAt &&
          Date.now() > new Date(org.planExpiresAt).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000
        ) {
          return deny(res, 402, 'Your subscription has expired. Please renew your plan to continue.');
        }
      }
    }
  } catch (error) {
    // a malformed organization id in the header is "not found", like anywhere else
    if (error.name === 'CastError' && error.path === '_id') return deny(res, 404, 'Organization not found');
    return deny(res, 401, 'Not authorized, token failed or expired');
  }

  req.user = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: acting ? 'admin' : user.role,
    phone: user.phone,
    status: user.status,
    orgId: acting ? org._id : user.orgId || null
  };
  req.org = org;
  req.acting = acting;

  if (acting && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const entry = {
      actor: user._id,
      actorEmail: user.email,
      orgId: org._id,
      orgName: org.name,
      method: req.method,
      path: String(req.originalUrl || req.url).split('?')[0].slice(0, 300),
      ip: String(req.ip || '')
    };
    // written once the answer is known, so the row carries the result; a failure to log never breaks the request
    res.on('finish', () => {
      DataEngine.create('auditLogs', { ...entry, status: res.statusCode }).catch((err) => console.error(`[Audit] Could not write the audit log: ${err.message}`));
    });
  }

  // Everything after this point runs inside the caller's tenant context
  const context = acting ? { orgId: String(org._id) } : user.role === 'super_admin' ? { platform: true } : { orgId: String(user.orgId) };
  return runWithTenant(context, () => next());
};

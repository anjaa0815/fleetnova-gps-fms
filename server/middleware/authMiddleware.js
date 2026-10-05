import jwt from 'jsonwebtoken';
import { DataEngine } from '../models/dataEngine.js';
import { JWT_SECRET } from '../config/jwt.js';
import { runWithTenant } from './tenantContext.js';
import { GRACE_DAYS } from '../config/plans.js';

const deny = (res, status, message) => res.status(status).json({ success: false, message });

export const protect = async (req, res, next) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return deny(res, 401, 'Not authorized, no token provided');
  }

  let user;
  let org = null;

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

    if (user.role !== 'super_admin') {
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
    return deny(res, 401, 'Not authorized, token failed or expired');
  }

  req.user = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    status: user.status,
    orgId: user.orgId || null
  };
  req.org = org;

  // Everything after this point runs inside the caller's tenant context
  const context = user.role === 'super_admin' ? { platform: true } : { orgId: String(user.orgId) };
  return runWithTenant(context, () => next());
};

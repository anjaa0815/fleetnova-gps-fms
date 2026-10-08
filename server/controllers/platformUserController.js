import bcrypt from 'bcryptjs';
import { DataEngine } from '../models/dataEngine.js';
import { getPlan, isWithinLimit } from '../config/plans.js';
import { ORG_ROLES, serializeUser } from '../services/organizationService.js';
import { passwordError, sendPasswordChangedEmail } from '../services/passwordReset.js';

// Users of one organization, managed by the platform owner (super admin). The platform owner sees accounts
// (name, email, role, status), never the organization's business data.

const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function findOrg(req, res) {
  const org = await DataEngine.findById('organizations', req.params.id);
  if (!org) fail(res, 404, 'Organization not found');
  return org;
}

// A user of exactly this organization; platform accounts are never reachable through here
async function findOrgUser(org, userId) {
  const user = await DataEngine.findById('users', userId);
  if (!user || user.role === 'super_admin' || String(user.orgId) !== String(org._id)) return null;
  return user;
}

const isActive = (user) => user.status !== 'inactive';

// @route GET /api/platform/organizations/:id/users
export const listOrgUsers = async (req, res, next) => {
  try {
    const org = await findOrg(req, res);
    if (!org) return undefined;
    const users = await DataEngine.find('users', { orgId: org._id });
    const rank = (u) => ORG_ROLES.indexOf(u.role);
    users.sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
    return res.status(200).json({ success: true, data: users.map((u) => ({ ...serializeUser(u), createdAt: u.createdAt })) });
  } catch (error) {
    return next(error);
  }
};

// @route POST /api/platform/organizations/:id/users   { name, email, password, role, phone }
export const createUserInOrg = async (req, res, next) => {
  try {
    const org = await findOrg(req, res);
    if (!org) return undefined;
    const { name, email, password, role = 'driver', phone = '' } = req.body;

    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return fail(res, 400, 'Name, email and password are required');
    }
    const badPassword = passwordError(password);
    if (badPassword) return fail(res, 400, badPassword);
    if (!ORG_ROLES.includes(role)) return fail(res, 400, 'Invalid role');

    const userCount = await DataEngine.countDocuments('users', { orgId: org._id });
    if (!isWithinLimit(getPlan(org.plan).maxUsers, userCount)) return fail(res, 403, 'User limit reached for your plan');

    const normalizedEmail = email.toLowerCase().trim();
    if (await DataEngine.findOne('users', { email: normalizedEmail })) return fail(res, 400, 'User with this email already exists');

    const user = await DataEngine.create('users', {
      orgId: org._id,
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
      role,
      phone: typeof phone === 'string' ? phone : '',
      status: 'active',
      emailVerified: true
    });
    console.log(`[Platform] ${req.user.email} added a ${role} (${user.email}) to organization ${org.name}`);
    return res.status(201).json({ success: true, message: 'User created successfully', data: serializeUser(user) });
  } catch (error) {
    return next(error);
  }
};

// @route PUT /api/platform/organizations/:id/users/:userId   { status?, role?, password? }
// A new password signs the user out everywhere (tokenVersion) and the user is told by email.
export const updateOrgUser = async (req, res, next) => {
  try {
    const org = await findOrg(req, res);
    if (!org) return undefined;
    const user = await findOrgUser(org, req.params.userId);
    if (!user) return fail(res, 404, 'User not found');

    const { status, role, password } = req.body;
    const update = {};

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) return fail(res, 400, 'Invalid status');
      update.status = status;
    }
    if (role !== undefined) {
      if (!ORG_ROLES.includes(role)) return fail(res, 400, 'Invalid role');
      update.role = role;
    }
    if (password !== undefined) {
      const problem = typeof password === 'string' ? passwordError(password) : 'Password must be at least 8 characters';
      if (problem) return fail(res, 400, problem);
      update.password = await bcrypt.hash(password, 10);
      update.tokenVersion = (user.tokenVersion || 0) + 1;
    }
    if (Object.keys(update).length === 0) return fail(res, 400, 'Nothing to update');

    // an organization must keep at least one active administrator, or nobody could manage it
    const stopsBeingActiveAdmin = user.role === 'admin' && isActive(user) && (update.status === 'inactive' || (update.role && update.role !== 'admin'));
    if (stopsBeingActiveAdmin) {
      const others = (await DataEngine.find('users', { orgId: org._id, role: 'admin' })).filter((u) => isActive(u) && String(u._id) !== String(user._id));
      if (others.length === 0) return fail(res, 400, 'The organization needs at least one active administrator');
    }

    const updated = await DataEngine.findByIdAndUpdate('users', user._id, update);
    const changes = [update.status && `status=${update.status}`, update.role && `role=${update.role}`, update.password && 'password'].filter(Boolean);
    console.log(`[Platform] ${req.user.email} changed ${user.email} of ${org.name}: ${changes.join(', ')}`);

    if (update.password) {
      try {
        await sendPasswordChangedEmail({ user: updated, lang: updated.language === 'en' ? 'en' : 'mn' });
      } catch (error) {
        console.error(`[Platform] Could not send the password-changed email: ${error.message}`);
      }
    }
    return res.status(200).json({ success: true, data: serializeUser(updated) });
  } catch (error) {
    return next(error);
  }
};

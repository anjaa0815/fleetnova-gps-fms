import bcrypt from 'bcryptjs';
import { DataEngine } from '../models/dataEngine.js';
import { serializeUser } from '../services/organizationService.js';
import { passwordError, sendPasswordChangedEmail } from '../services/passwordReset.js';

// The platform owner's own team: other super admins, managed by a super admin. They belong to no organization.

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const isAdmin = (user) => user && user.role === 'super_admin';

// @route GET /api/platform/admins
export const listAdmins = async (req, res, next) => {
  try {
    const admins = await DataEngine.find('users', { role: 'super_admin' });
    admins.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return res.status(200).json({ success: true, data: admins.map((u) => ({ ...serializeUser(u), createdAt: u.createdAt })) });
  } catch (error) {
    return next(error);
  }
};

// @route POST /api/platform/admins   { name, email, password, phone }
export const createAdmin = async (req, res, next) => {
  try {
    const { name, email, password, phone = '' } = req.body;
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return fail(res, 400, 'Name, email and password are required');
    }
    const badPassword = passwordError(password);
    if (badPassword) return fail(res, 400, badPassword);

    const normalizedEmail = email.toLowerCase().trim();
    if (await DataEngine.findOne('users', { email: normalizedEmail })) return fail(res, 400, 'User with this email already exists');

    const user = await DataEngine.create('users', {
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
      orgId: null, // a platform admin belongs to no organization
      role: 'super_admin',
      phone: typeof phone === 'string' ? phone : '',
      status: 'active',
      emailVerified: true
    });
    console.log(`[Platform] ${req.user.email} added the platform admin ${user.email}`);
    return res.status(201).json({ success: true, message: 'User created successfully', data: serializeUser(user) });
  } catch (error) {
    return next(error);
  }
};

// @route PUT /api/platform/admins/:id   { status?, password? }
// Not your own account (that is the profile page), so there is always an active platform admin left: the one asking.
export const updateAdmin = async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id)) return fail(res, 400, 'You cannot change your own role or status');
    const target = await DataEngine.findById('users', req.params.id);
    if (!isAdmin(target)) return fail(res, 404, 'User not found');

    const { status, password } = req.body;
    const update = {};
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) return fail(res, 400, 'Invalid status');
      update.status = status;
    }
    if (password !== undefined) {
      const problem = typeof password === 'string' ? passwordError(password) : 'Password must be at least 8 characters';
      if (problem) return fail(res, 400, problem);
      update.password = await bcrypt.hash(password, 10);
      update.tokenVersion = (target.tokenVersion || 0) + 1;
    }
    if (Object.keys(update).length === 0) return fail(res, 400, 'Nothing to update');

    const updated = await DataEngine.findByIdAndUpdate('users', target._id, update);
    const changes = [update.status && `status=${update.status}`, update.password && 'password'].filter(Boolean);
    console.log(`[Platform] ${req.user.email} changed the platform admin ${target.email}: ${changes.join(', ')}`);
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

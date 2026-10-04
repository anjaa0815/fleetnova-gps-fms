import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_SECRET } from '../config/jwt.js';
import { DataEngine } from '../models/dataEngine.js';
import { getPlan, isWithinLimit } from '../config/plans.js';
import {
  findUserByResetToken,
  issueResetToken,
  passwordError,
  resetCooldownMs,
  sendPasswordChangedEmail,
  sendPasswordResetEmail
} from '../services/passwordReset.js';
import {
  emailVerificationRequired,
  findUserByToken,
  issueVerificationToken,
  markVerified,
  resendCooldownMs,
  sendVerificationEmail
} from '../services/emailVerification.js';
import {
  createOrganizationWithAdmin,
  serializeOrg,
  serializeUser
} from '../services/organizationService.js';


// `tv` ties the session to the user's tokenVersion: a password change raises it and so ends all older sessions
const generateToken = (user) => {
  return jwt.sign({ id: user._id, tv: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: '7d' });
};

// Where the links in emails point to: APP_BASE_URL, otherwise the address the request came in on
const baseUrlFor = (req) => process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

// Sends the confirmation link; a failure is logged and never blocks the caller (the user can ask for a new link)
async function sendVerification(req, user) {
  try {
    const token = await issueVerificationToken(user);
    await sendVerificationEmail({ user, token, baseUrl: baseUrlFor(req) });
  } catch (error) {
    console.error(`[Auth] Could not send the verification email: ${error.message}`);
  }
}

// @desc Register a new organization together with its first administrator (self-service sign-up)
// @route POST /api/auth/register
export const registerUser = async (req, res, next) => {
  try {
    const { organizationName, name, email, password, phone = '' } = req.body;
    const language = req.body.lang === 'en' ? 'en' : 'mn';
    const mustVerify = emailVerificationRequired();

    const { org, user } = await createOrganizationWithAdmin({
      organizationName,
      plan: 'trial',
      admin: { name, email, password, phone },
      emailVerified: !mustVerify,
      language
    });

    if (mustVerify) {
      await sendVerification(req, user);
      // No session yet: the account is usable once the email address is confirmed
      return res.status(201).json({
        success: true,
        message: 'Organization registered. Please confirm your email address.',
        data: { ...serializeUser(user), organization: serializeOrg(org), verificationRequired: true }
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Organization registered successfully',
      data: {
        ...serializeUser(user),
        organization: serializeOrg(org),
        token: generateToken(user)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc Confirm an email address with the token from the link
// @route POST /api/auth/verify-email   { token }
export const verifyEmail = async (req, res, next) => {
  try {
    const user = await findUserByToken(req.body.token);
    if (!user) {
      return res.status(400).json({ success: false, code: 'INVALID_TOKEN', message: 'This confirmation link is invalid or has expired.' });
    }
    await markVerified(user);
    return res.status(200).json({ success: true, message: 'Email address confirmed. You can sign in now.' });
  } catch (error) {
    return next(error);
  }
};

// @desc Send a new confirmation link. Always answers the same way, so it cannot be used to find out which emails exist.
// @route POST /api/auth/resend-verification   { email }
export const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (typeof email === 'string' && emailVerificationRequired()) {
      // +fields: stored with select:false, which MongoDB would otherwise leave out
      const user = await DataEngine.findOne('users', { email: email.toLowerCase().trim() }, { select: '+emailVerificationSentAt' });
      if (user && user.emailVerified === false) {
        const sentAt = user.emailVerificationSentAt ? new Date(user.emailVerificationSentAt).getTime() : 0;
        if (Date.now() - sentAt >= resendCooldownMs()) await sendVerification(req, user);
      }
    }
    return res.status(200).json({
      success: true,
      message: 'If this address is waiting for confirmation, a new link has been sent.'
    });
  } catch (error) {
    return next(error);
  }
};

// @desc Login user
// @route POST /api/auth/login
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const user = await DataEngine.findOne('users', { email: String(email).toLowerCase() }, { select: '+password' });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Contact Administrator.'
      });
    }

    if (user.emailVerified === false && emailVerificationRequired()) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please confirm your email address before signing in.'
      });
    }

    let org = null;
    if (user.role !== 'super_admin') {
      org = user.orgId ? await DataEngine.findById('organizations', user.orgId) : null;
      if (!org) {
        return res.status(403).json({ success: false, message: 'Your account is not linked to an organization' });
      }
      if (org.status === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'This organization is suspended. Please contact support.'
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        ...serializeUser(user),
        organization: serializeOrg(org),
        token: generateToken(user)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get current user
// @route GET /api/auth/me
export const getMe = async (req, res, next) => {
  try {
    const user = await DataEngine.findById('users', req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...serializeUser(user),
        organization: serializeOrg(req.org)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update user profile
// @route PUT /api/auth/profile
export const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, password, alertChannels } = req.body;
    const updateData = {};
    if (alertChannels && typeof alertChannels === 'object') {
      const current = (await DataEngine.findById('users', req.user._id))?.alertChannels || {};
      updateData.alertChannels = {
        email: typeof alertChannels.email === 'boolean' ? alertChannels.email : Boolean(current.email),
        sms: typeof alertChannels.sms === 'boolean' ? alertChannels.sms : Boolean(current.sms)
      };
    }
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    let passwordChanged = false;
    if (password) {
      const problem = passwordError(password);
      if (problem) {
        return res.status(400).json({
          success: false,
          message: problem.startsWith('Password must') ? 'New password must be at least 8 characters' : problem
        });
      }
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
      // other devices are signed out; this session continues with a fresh token (returned below)
      updateData.tokenVersion = ((await DataEngine.findById('users', req.user._id))?.tokenVersion || 0) + 1;
      passwordChanged = true;
    }

    const updatedUser = await DataEngine.findByIdAndUpdate('users', req.user._id, updateData);

    if (passwordChanged) {
      sendPasswordChangedEmail({ user: updatedUser, lang: updatedUser.language === 'en' ? 'en' : 'mn' }).catch((error) =>
        console.error(`[Auth] Could not send the password-changed notice: ${error.message}`)
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { ...serializeUser(updatedUser), ...(passwordChanged ? { token: generateToken(updatedUser) } : {}) }
    });
  } catch (error) {
    next(error);
  }
};

// @desc Email a password reset link. The answer is always the same, so it cannot be used to find out which emails exist.
// @route POST /api/auth/forgot-password   { email, lang? }
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (typeof email === 'string') {
      const user = await DataEngine.findOne('users', { email: email.toLowerCase().trim() }, { select: '+passwordResetSentAt' });
      if (user && user.status !== 'inactive') {
        const sentAt = user.passwordResetSentAt ? new Date(user.passwordResetSentAt).getTime() : 0;
        if (Date.now() - sentAt >= resetCooldownMs()) {
          const lang = ['mn', 'en'].includes(req.body.lang) ? req.body.lang : user.language === 'en' ? 'en' : 'mn';
          try {
            const token = await issueResetToken(user);
            await sendPasswordResetEmail({ user, token, baseUrl: baseUrlFor(req), lang });
          } catch (error) {
            console.error(`[Auth] Could not send the password reset email: ${error.message}`);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists for this email, password reset instructions have been sent.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc Set a new password with the token from the email. Ends all existing sessions.
// @route POST /api/auth/reset-password   { token, password }
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const problem = passwordError(password);
    if (problem) return res.status(400).json({ success: false, code: 'WEAK_PASSWORD', message: problem });

    const user = await findUserByResetToken(token);
    if (!user) {
      return res.status(400).json({ success: false, code: 'INVALID_TOKEN', message: 'This password reset link is invalid or has expired.' });
    }

    const update = {
      password: await bcrypt.hash(password, 10),
      tokenVersion: (user.tokenVersion || 0) + 1,
      passwordResetTokenHash: null,
      passwordResetExpires: null
    };
    // following the link proves that the person controls this mailbox
    if (user.emailVerified === false) {
      update.emailVerified = true;
      update.emailVerificationTokenHash = null;
      update.emailVerificationExpires = null;
    }
    await DataEngine.findByIdAndUpdate('users', user._id, update);

    sendPasswordChangedEmail({ user, lang: user.language === 'en' ? 'en' : 'mn' }).catch((error) =>
      console.error(`[Auth] Could not send the password-changed notice: ${error.message}`)
    );
    return res.status(200).json({ success: true, message: 'Password changed. You can sign in with the new password.' });
  } catch (error) {
    return next(error);
  }
};

// @desc Admin get all users of the caller's organization
// @route GET /api/auth/users
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await DataEngine.find('users');
    const sanitized = users.map((u) => ({ ...serializeUser(u), createdAt: u.createdAt }));
    return res.status(200).json({ success: true, data: sanitized });
  } catch (error) {
    next(error);
  }
};

const ORG_ROLES = ['admin', 'fleet_manager', 'driver'];

// @desc Admin creates a user inside the caller's organization
// @route POST /api/auth/users
export const createOrgUser = async (req, res, next) => {
  try {
    const { name, email, password, role = 'driver', phone = '' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    }
    if (typeof email !== 'string' || passwordError(password)) {
      return res.status(400).json({ success: false, message: passwordError(password) || 'Name, email and password are required' });
    }
    if (!ORG_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const userCount = await DataEngine.countDocuments('users');
    if (!isWithinLimit(getPlan(req.org.plan).maxUsers, userCount)) {
      return res.status(403).json({ success: false, message: 'User limit reached for your plan' });
    }

    if (await DataEngine.findOne('users', { email: email.toLowerCase().trim() })) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    const user = await DataEngine.create('users', {
      name,
      email: email.toLowerCase().trim(),
      password: await bcrypt.hash(password, 10),
      role,
      phone,
      status: 'active'
    });

    return res.status(201).json({ success: true, message: 'User created successfully', data: serializeUser(user) });
  } catch (error) {
    next(error);
  }
};

// @desc Admin update user status / role (own organization only)
// @route PUT /api/auth/users/:id/status
export const updateUserStatus = async (req, res, next) => {
  try {
    const { status, role } = req.body;
    const updateData = {};

    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role or status' });
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      updateData.status = status;
    }
    if (role !== undefined) {
      if (!ORG_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      updateData.role = role;
    }

    // The data layer only finds users of the caller's organization
    const user = await DataEngine.findByIdAndUpdate('users', req.params.id, updateData);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, data: serializeUser(user) });
  } catch (error) {
    next(error);
  }
};

// @desc Admin sets which alert channels (email / SMS) a user of the organization receives
// @route PUT /api/auth/users/:id/alert-channels
export const updateAlertChannels = async (req, res, next) => {
  try {
    const { email, sms } = req.body;
    if ([email, sms].some((v) => v !== undefined && typeof v !== 'boolean')) {
      return res.status(400).json({ success: false, message: 'Channels must be true or false' });
    }
    const existing = await DataEngine.findById('users', req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'User not found' });

    const user = await DataEngine.findByIdAndUpdate('users', req.params.id, {
      alertChannels: {
        email: email !== undefined ? email : Boolean(existing.alertChannels?.email),
        sms: sms !== undefined ? sms : Boolean(existing.alertChannels?.sms)
      }
    });
    return res.status(200).json({ success: true, data: serializeUser(user) });
  } catch (error) {
    return next(error);
  }
};

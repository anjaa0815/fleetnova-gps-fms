import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_SECRET } from '../config/jwt.js';
import { DataEngine } from '../models/dataEngine.js';
import { getPlan, isWithinLimit } from '../config/plans.js';
import {
  MIN_PASSWORD_LENGTH,
  createOrganizationWithAdmin,
  serializeOrg,
  serializeUser
} from '../services/organizationService.js';


const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
};

// @desc Register a new organization together with its first administrator (self-service sign-up)
// @route POST /api/auth/register
export const registerUser = async (req, res, next) => {
  try {
    const { organizationName, name, email, password, phone = '' } = req.body;

    const { org, user } = await createOrganizationWithAdmin({
      organizationName,
      plan: 'trial',
      admin: { name, email, password, phone }
    });

    return res.status(201).json({
      success: true,
      message: 'Organization registered successfully',
      data: {
        ...serializeUser(user),
        organization: serializeOrg(org),
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc Login user
// @route POST /api/auth/login
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
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
        token: generateToken(user._id)
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
    const { name, phone, password } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    if (password) {
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 8 characters'
        });
      }
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await DataEngine.findByIdAndUpdate('users', req.user._id, updateData);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        status: updatedUser.status
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc Forgot password simulation
// @route POST /api/auth/forgot-password
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (typeof email === 'string') {
      await DataEngine.findOne('users', { email: email.toLowerCase() });
    }

    // Same response whether or not the account exists (prevents user enumeration)
    return res.status(200).json({
      success: true,
      message: 'If an account exists for this email, password reset instructions have been sent.'
    });
  } catch (error) {
    next(error);
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
    if (typeof email !== 'string' || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
      });
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

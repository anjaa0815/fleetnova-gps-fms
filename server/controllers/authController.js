import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_SECRET } from '../config/jwt.js';
import { DataEngine, generateId } from '../models/dataEngine.js';


const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
};

// @desc Register user
// @route POST /api/auth/register
export const registerUser = async (req, res, next) => {
  try {
    // Public registration never grants elevated roles; admins promote users via PUT /users/:id/status
    const { name, email, password, phone = '' } = req.body;
    const role = 'driver';

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required'
      });
    }

    if (typeof email !== 'string' || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    const existingUser = await DataEngine.findOne('users', { email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await DataEngine.create('users', {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      phone,
      status: 'active'
    });

    const token = generateToken(newUser._id);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
        status: newUser.status,
        token
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

    const user = await DataEngine.findOne('users', { email: email.toLowerCase() });
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

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        status: user.status,
        token
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
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        status: user.status
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
      if (typeof password !== 'string' || password.length < 8) {
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

// @desc Admin get all users
// @route GET /api/auth/users
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await DataEngine.find('users');
    const sanitized = users.map(u => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt
    }));
    return res.status(200).json({ success: true, data: sanitized });
  } catch (error) {
    next(error);
  }
};

// @desc Admin update user status
// @route PUT /api/auth/users/:id/status
export const updateUserStatus = async (req, res, next) => {
  try {
    const { status, role } = req.body;
    const updateData = {};
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      updateData.status = status;
    }
    if (role !== undefined) {
      if (!['admin', 'fleet_manager', 'driver'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      updateData.role = role;
    }

    const user = await DataEngine.findByIdAndUpdate('users', req.params.id, updateData);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        status: user.status
      }
    });
  } catch (error) {
    next(error);
  }
};

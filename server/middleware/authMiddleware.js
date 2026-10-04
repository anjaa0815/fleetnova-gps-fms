import jwt from 'jsonwebtoken';
import { DataEngine } from '../models/dataEngine.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fleetnova_super_secure_jwt_secret_key_2026';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);

      const user = await DataEngine.findById('users', decoded.id);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, user no longer exists'
        });
      }

      if (user.status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated. Please contact your Fleet Administrator.'
        });
      }

      req.user = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        status: user.status
      };

      return next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed or expired'
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided'
    });
  }
};

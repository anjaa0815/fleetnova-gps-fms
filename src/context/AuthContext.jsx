import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, ACT_AS_KEY } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const { tr } = useT();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // White-label: use the organization's brand color as the app's primary color
  useEffect(() => {
    const color = user?.organization?.branding?.primaryColor;
    if (color && /^#[0-9a-f]{6}$/i.test(color)) {
      document.documentElement.style.setProperty('--primary', color);
    } else {
      document.documentElement.style.removeProperty('--primary');
    }
  }, [user?.organization?.branding?.primaryColor]);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('fleetnova_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await authApi.getMe();
        if (res.success && res.data) {
          setUser(res.data);
        } else {
          localStorage.removeItem('fleetnova_token');
          setUser(null);
        }
      } catch (err) {
        console.warn('Session expired or invalid token:', err.message);
        localStorage.removeItem('fleetnova_token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    setError(null);
    localStorage.removeItem(ACT_AS_KEY); // a new sign-in never resumes work inside an organization
    try {
      const res = await authApi.login({ email, password });
      if (res.success && res.data) {
        localStorage.setItem('fleetnova_token', res.data.token);
        setUser(res.data);
        return { success: true, user: res.data };
      }
      throw new Error(res.message || 'Login failed');
    } catch (err) {
      setError(tr(err.message));
      return { success: false, message: err.message, code: err.code, retryAfter: err.retryAfter };
    }
  };

  const register = async (userData) => {
    setError(null);
    try {
      const res = await authApi.register(userData);
      if (res.success && res.data?.verificationRequired) {
        // the email address must be confirmed before the first sign-in: no session yet
        return { success: true, verificationRequired: true, email: res.data.email };
      }
      if (res.success && res.data) {
        localStorage.setItem('fleetnova_token', res.data.token);
        setUser(res.data);
        return { success: true, user: res.data };
      }
      throw new Error(res.message || 'Registration failed');
    } catch (err) {
      setError(tr(err.message));
      return { success: false, message: err.message, code: err.code, retryAfter: err.retryAfter };
    }
  };

  const logout = () => {
    localStorage.removeItem('fleetnova_token');
    localStorage.removeItem(ACT_AS_KEY);
    setUser(null);
  };

  // Platform owner: work inside a customer organization as its administrator (the server records every change),
  // and leave it again. The session is re-read, so the whole app then behaves as that organization's admin.
  const enterOrganization = async (orgId) => {
    localStorage.setItem(ACT_AS_KEY, orgId);
    try {
      const res = await authApi.getMe();
      setUser(res.data);
      return { success: true };
    } catch (err) {
      localStorage.removeItem(ACT_AS_KEY);
      return { success: false, message: err.message };
    }
  };

  const exitOrganization = async () => {
    localStorage.removeItem(ACT_AS_KEY);
    const res = await authApi.getMe();
    setUser(res.data);
  };

  // Merge a fresh organization object (e.g. after editing its profile) into the session
  const setOrganization = (organization) => {
    setUser((prev) => (prev ? { ...prev, organization } : prev));
  };

  const updateProfile = async (profileData) => {
    try {
      const res = await authApi.updateProfile(profileData);
      if (res.success && res.data) {
        // changing the password ends the other sessions: continue with the fresh token
        const { token: freshToken, ...profile } = res.data;
        if (freshToken) localStorage.setItem('fleetnova_token', freshToken);
        setUser((prev) => ({ ...prev, ...profile }));
        return { success: true, message: tr("Profile updated") };
      }
      throw new Error(res.message || 'Failed to update profile');
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    role: user?.role,
    acting: Boolean(user?.acting),
    organization: user?.organization || null,
    setOrganization,
    enterOrganization,
    exitOrganization,
    login,
    register,
    logout,
    updateProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

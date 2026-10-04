// Centralized API Client for FLEETNOVA REST Endpoints

const BASE_URL = '/api';

export async function apiRequest(endpoint, method = 'GET', data = null, customHeaders = {}) {
  const token = localStorage.getItem('fleetnova_token');

  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.body = JSON.stringify(data);
  }

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, config);
    const json = await res.json();

    if (!res.ok) {
      const errorMsg = json?.message || `Request failed with status ${res.status}`;
      throw new Error(errorMsg);
    }

    return json;
  } catch (err) {
    console.error(`[API Error] ${method} ${endpoint}:`, err.message);
    throw err;
  }
}

// Authentication API
export const authApi = {
  login: (credentials) => apiRequest('/auth/login', 'POST', credentials),
  register: (userData) => apiRequest('/auth/register', 'POST', userData),
  getMe: () => apiRequest('/auth/me', 'GET'),
  updateProfile: (profileData) => apiRequest('/auth/profile', 'PUT', profileData),
  forgotPassword: (email) => apiRequest('/auth/forgot-password', 'POST', { email }),
  getAllUsers: () => apiRequest('/auth/users', 'GET'),
  updateUserStatus: (id, statusData) => apiRequest(`/auth/users/${id}/status`, 'PUT', statusData)
};

// Vehicles API
export const vehicleApi = {
  getAll: (params = '') => apiRequest(`/vehicles${params ? `?${params}` : ''}`),
  getById: (id) => apiRequest(`/vehicles/${id}`),
  create: (data) => apiRequest('/vehicles', 'POST', data),
  update: (id, data) => apiRequest(`/vehicles/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/vehicles/${id}`, 'DELETE')
};

// Drivers API
export const driverApi = {
  getAll: (params = '') => apiRequest(`/drivers${params ? `?${params}` : ''}`),
  getById: (id) => apiRequest(`/drivers/${id}`),
  create: (data) => apiRequest('/drivers', 'POST', data),
  update: (id, data) => apiRequest(`/drivers/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/drivers/${id}`, 'DELETE'),
  assignVehicle: (id, vehicleId) => apiRequest(`/drivers/${id}/assign-vehicle`, 'PUT', { vehicleId })
};

// Trips API
export const tripApi = {
  getAll: (params = '') => apiRequest(`/trips${params ? `?${params}` : ''}`),
  getById: (id) => apiRequest(`/trips/${id}`),
  create: (data) => apiRequest('/trips', 'POST', data),
  update: (id, data) => apiRequest(`/trips/${id}`, 'PUT', data),
  start: (id) => apiRequest(`/trips/${id}/start`, 'PUT'),
  complete: (id, data) => apiRequest(`/trips/${id}/complete`, 'PUT', data),
  cancel: (id) => apiRequest(`/trips/${id}/cancel`, 'PUT'),
  delete: (id) => apiRequest(`/trips/${id}`, 'DELETE')
};

// Fuel API
export const fuelApi = {
  getAll: (params = '') => apiRequest(`/fuel${params ? `?${params}` : ''}`),
  create: (data) => apiRequest('/fuel', 'POST', data),
  update: (id, data) => apiRequest(`/fuel/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/fuel/${id}`, 'DELETE')
};

// Maintenance API
export const maintenanceApi = {
  getAll: (params = '') => apiRequest(`/maintenance${params ? `?${params}` : ''}`),
  create: (data) => apiRequest('/maintenance', 'POST', data),
  update: (id, data) => apiRequest(`/maintenance/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/maintenance/${id}`, 'DELETE')
};

// Expenses API
export const expenseApi = {
  getAll: (params = '') => apiRequest(`/expenses${params ? `?${params}` : ''}`),
  create: (data) => apiRequest('/expenses', 'POST', data),
  update: (id, data) => apiRequest(`/expenses/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/expenses/${id}`, 'DELETE')
};

// Notifications API
export const notificationApi = {
  getAll: () => apiRequest('/notifications'),
  markAsRead: (id) => apiRequest(`/notifications/${id}/read`, 'PUT'),
  markAllAsRead: () => apiRequest('/notifications/read-all', 'PUT')
};

// Dashboard & Analytics API
export const dashboardApi = {
  getData: () => apiRequest('/dashboard')
};

// FleetAI API
export const aiApi = {
  chat: (message) => apiRequest('/ai/chat', 'POST', { message })
};

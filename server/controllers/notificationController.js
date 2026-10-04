import { DataEngine } from '../models/dataEngine.js';

// Auto-check document expiries and generate notifications
async function checkDocumentExpiries() {
  try {
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const vehicles = await DataEngine.find('vehicles');
    const drivers = await DataEngine.find('drivers');
    const existingNotifications = await DataEngine.find('notifications');

    for (const v of vehicles) {
      if (v.insuranceExpiry) {
        const insDate = new Date(v.insuranceExpiry);
        const days = Math.ceil((insDate - now) / (1000 * 60 * 60 * 24));
        if (days <= 30) {
          const title = days < 0 ? 'Vehicle Insurance Expired' : 'Vehicle Insurance Expiry Imminent';
          const msg = days < 0
            ? `Vehicle ${v.registrationNumber} insurance expired ${Math.abs(days)} days ago!`
            : `Vehicle ${v.registrationNumber} insurance expires in ${days} days.`;

          const already = existingNotifications.some(n => n.relatedEntityId === v._id && n.type === 'insurance_expiry' && !n.isRead);
          if (!already) {
            await DataEngine.create('notifications', {
              type: 'insurance_expiry',
              title,
              message: msg,
              relatedEntity: 'Vehicle',
              relatedEntityId: v._id
            });
          }
        }
      }

      if (v.registrationExpiry) {
        const regDate = new Date(v.registrationExpiry);
        const days = Math.ceil((regDate - now) / (1000 * 60 * 60 * 24));
        if (days <= 30) {
          const title = days < 0 ? 'Vehicle Registration Expired' : 'Vehicle Registration Expiry Imminent';
          const msg = days < 0
            ? `Vehicle ${v.registrationNumber} RC expired ${Math.abs(days)} days ago!`
            : `Vehicle ${v.registrationNumber} registration expires in ${days} days.`;

          const already = existingNotifications.some(n => n.relatedEntityId === v._id && n.type === 'registration_expiry' && !n.isRead);
          if (!already) {
            await DataEngine.create('notifications', {
              type: 'registration_expiry',
              title,
              message: msg,
              relatedEntity: 'Vehicle',
              relatedEntityId: v._id
            });
          }
        }
      }
    }

    for (const d of drivers) {
      if (d.licenseExpiry) {
        const licDate = new Date(d.licenseExpiry);
        const days = Math.ceil((licDate - now) / (1000 * 60 * 60 * 24));
        if (days <= 30) {
          const title = days < 0 ? 'Driver License Expired' : 'Driver License Expiry Imminent';
          const msg = days < 0
            ? `Driver ${d.name} (${d.licenseNumber}) commercial license expired ${Math.abs(days)} days ago!`
            : `Driver ${d.name} (${d.licenseNumber}) commercial license expires in ${days} days.`;

          const already = existingNotifications.some(n => n.relatedEntityId === d._id && n.type === 'license_expiry' && !n.isRead);
          if (!already) {
            await DataEngine.create('notifications', {
              type: 'license_expiry',
              title,
              message: msg,
              relatedEntity: 'Driver',
              relatedEntityId: d._id
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Error checking document expiries:', err);
  }
}

// @desc Get all notifications for user
// @route GET /api/notifications
export const getNotifications = async (req, res, next) => {
  try {
    await checkDocumentExpiries();

    const notifications = await DataEngine.find('notifications');
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return res.status(200).json({
      success: true,
      data: notifications,
      unreadCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc Mark single notification as read
// @route PUT /api/notifications/:id/read
export const markAsRead = async (req, res, next) => {
  try {
    const updated = await DataEngine.findByIdAndUpdate('notifications', req.params.id, {
      isRead: true
    });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// @desc Mark all notifications as read
// @route PUT /api/notifications/read-all
export const markAllAsRead = async (req, res, next) => {
  try {
    const notifications = await DataEngine.find('notifications');
    for (const n of notifications) {
      if (!n.isRead) {
        await DataEngine.findByIdAndUpdate('notifications', n._id, { isRead: true });
      }
    }
    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

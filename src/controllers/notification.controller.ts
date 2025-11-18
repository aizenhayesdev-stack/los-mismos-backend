import { Response } from 'express';
import { CustomRequest } from '../interfaces/auth';
import notificationService from '../services/notification.service';
import Profile from '../models/profile.model';
import DeviceModel from '../models/device.model';
import ResponseUtil from '../utils/Response/responseUtils';
import { STATUS_CODES } from '../constants/statusCodes';
import { NotificationCategory } from '../models/common/types';

export class NotificationController {
  /**
   * Get user notifications with pagination
   * GET /api/notifications
   */
  async getUserNotifications(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;
      if (!userId) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, 'User not authenticated');
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const unreadOnly = req.query.unreadOnly === 'true';
      const category = req.query.category as NotificationCategory;

      const result = await notificationService.getUserNotifications(userId, {
        page,
        limit,
        unreadOnly,
        category
      });

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, result, 'Notifications fetched successfully');
    } catch (err: any) {
      console.error('Error fetching notifications:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  async getUnreadCount(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;
      if (!userId) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, 'User not authenticated');
      }

      const count = await notificationService.getUnreadCount(userId);

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { count }, 'Unread count fetched successfully');
    } catch (err: any) {
      console.error('Error fetching unread count:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Mark notification as read
   * PUT /api/notifications/:id/read
   */
  async markAsRead(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;
      if (!userId) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, 'User not authenticated');
      }

      const notificationId = req.params.id;

      await notificationService.markAsRead(notificationId, userId);

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {}, 'Notification marked as read');
    } catch (err: any) {
      console.error('Error marking notification as read:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Mark all notifications as read
   * PUT /api/notifications/read-all
   */
  async markAllAsRead(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;
      if (!userId) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, 'User not authenticated');
      }

      await notificationService.markAllAsRead(userId);

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {}, 'All notifications marked as read');
    } catch (err: any) {
      console.error('Error marking all notifications as read:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Delete notification
   * DELETE /api/notifications/:id
   */
  async deleteNotification(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;
      if (!userId) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, 'User not authenticated');
      }

      const notificationId = req.params.id;

      await notificationService.deleteNotification(notificationId, userId);

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {}, 'Notification deleted successfully');
    } catch (err: any) {
      console.error('Error deleting notification:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Update notification preferences
   * PUT /api/notifications/preferences
   */
  async updatePreferences(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;
      const preferences = req.body;

      // Validate preference fields
      const validPreferences = [
        'pushEnabled', 'emailEnabled', 'smsEnabled',
        'bookingConfirmations', 'tripReminders', 'scheduleChanges', 
        'emergencyAlerts', 'promotions',
        'reminder24h', 'reminder2h', 'reminder30m'
      ];

      const filteredPreferences: any = {};
      Object.keys(preferences).forEach(key => {
        if (validPreferences.includes(key)) {
          filteredPreferences[key] = Boolean(preferences[key]);
        }
      });

      const profile = await Profile.findOneAndUpdate(
        { auth: userId },
        { notificationPreferences: filteredPreferences },
        { new: true, runValidators: true }
      );

      if (!profile) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, 'Profile not found');
      }

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {
        preferences: profile.notificationPreferences
      }, 'Notification preferences updated successfully');
    } catch (err: any) {
      console.error('Error updating notification preferences:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Get notification preferences
   * GET /api/notifications/preferences
   */
  async getPreferences(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;

      const profile = await Profile.findOne({ auth: userId });

      if (!profile) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, 'Profile not found');
      }

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {
        preferences: profile.notificationPreferences
      }, 'Notification preferences fetched successfully');
    } catch (err: any) {
      console.error('Error fetching notification preferences:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Register device for push notifications
   * POST /api/notifications/device/register
   */
  async registerDevice(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;
      const { deviceToken, deviceType, deviceName } = req.body;

      if (!deviceToken || !deviceType || !deviceName) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, 'Device token, type, and name are required');
      }

      // Check if device already exists
      let device = await DeviceModel.findOne({ deviceToken });

      if (device) {
        // Update existing device
        device.auth = userId as any;
        device.deviceType = deviceType;
        device.deviceName = deviceName;
        device.isActive = true;
        device.lastLoginAt = new Date();
        await device.save();
      } else {
        // Create new device
        device = await DeviceModel.create({
          auth: userId,
          deviceType,
          deviceToken,
          deviceName,
          isActive: true,
          lastLoginAt: new Date()
        });
      }

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {
        deviceId: device._id
      }, 'Device registered successfully');
    } catch (err: any) {
      console.error('Error registering device:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Unregister device from push notifications
   * POST /api/notifications/device/unregister
   */
  async unregisterDevice(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;
      const { deviceToken } = req.body;

      if (!deviceToken) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, 'Device token is required');
      }

      await DeviceModel.updateOne(
        { deviceToken, auth: userId },
        { isActive: false }
      );

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {}, 'Device unregistered successfully');
    } catch (err: any) {
      console.error('Error unregistering device:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Send test notification
   * POST /api/notifications/test
   * For testing purposes only
   */
  async sendTestNotification(req: CustomRequest, res: Response) {
    try {
      const userId = req.authId;
      const { category } = req.body;

      const testCategory = category || NotificationCategory.BOOKING_CONFIRMATION;

      // Queue test notification (non-blocking)
      await notificationService.queueToUser({
        userId,
        category: testCategory,
        title: 'Test Notification',
        body: `This is a test ${testCategory} notification from Los Mismos`,
        priority: 'normal',
        sendPush: true
      });

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {}, 'Test notification queued successfully');
    } catch (err: any) {
      console.error('Error queueing test notification:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  // ============= ADMIN ENDPOINTS =============

  /**
   * Send custom notification to user(s)
   * POST /api/admin/notifications/send
   */
  async sendCustomNotification(req: CustomRequest, res: Response) {
    try {
      const {
        userIds,
        targetRole,
        category,
        title,
        body,
        imageUrl,
        metadata,
        priority,
        scheduledFor
      } = req.body;

      if (!category || !title || !body) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, 'Category, title, and body are required');
      }

      if (userIds && Array.isArray(userIds)) {
        // Queue notifications to specific users (non-blocking)
        const promises = userIds.map((userId: string) =>
          notificationService.queueToUser({
            userId,
            category,
            title,
            body,
            imageUrl,
            metadata,
            priority: priority || 'normal',
            scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
            sendPush: true
          })
        );
        await Promise.all(promises);
      } else if (targetRole) {
        // Queue notifications to all users with a specific role (non-blocking)
        await notificationService.queueToRole(targetRole, {
          category,
          title,
          body,
          imageUrl,
          metadata,
          priority: priority || 'normal',
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          sendPush: true
        });
      } else {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, 'Either userIds or targetRole is required');
      }

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {}, 'Notification(s) queued successfully');
    } catch (err: any) {
      console.error('Error sending custom notification:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Send emergency notification
   * POST /api/admin/notifications/emergency
   */
  async sendEmergencyNotification(req: CustomRequest, res: Response) {
    try {
      const {
        userIds,
        type,
        title,
        message,
        affectedRoutes,
        alternativeOptions
      } = req.body;

      if (!type || !title || !message) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, 'Type, title, and message are required');
      }

      if (!['weather', 'cancellation', 'safety'].includes(type)) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, 'Invalid emergency type');
      }

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, 'User IDs are required');
      }

      // Queue emergency notifications (non-blocking)
      await notificationService.queueEmergencyNotification(userIds, {
        type,
        title,
        message,
        affectedRoutes,
        alternativeOptions
      });

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {}, 'Emergency notification queued successfully');
    } catch (err: any) {
      console.error('Error sending emergency notification:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }

  /**
   * Get all notifications (admin)
   * GET /api/admin/notifications
   */
  async getAllNotifications(req: CustomRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const category = req.query.category as NotificationCategory;
      const userId = req.query.userId as string;

      const query: any = {};
      if (category) query.category = category;
      if (userId) query.user = userId;

      const skip = (page - 1) * limit;

      const Notification = (await import('../models/notification.model')).default;
      const notifs = await Notification.find(query)
        .populate('user', 'email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      const count = await Notification.countDocuments(query);

      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {
        notifications: notifs,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        }
      }, 'Notifications fetched successfully');
    } catch (err: any) {
      console.error('Error fetching all notifications:', err);
      return ResponseUtil.errorResponse(res, STATUS_CODES.INTERNAL_SERVER_ERROR, err.message);
    }
  }
}

export default new NotificationController();

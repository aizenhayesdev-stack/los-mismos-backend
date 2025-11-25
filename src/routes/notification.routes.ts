import { Router } from 'express';
import notificationController from '../controllers/notification.controller';
import { checkUserAuth } from '../middleware/check-user-auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  registerDeviceSchema,
  unregisterDeviceSchema,
  updatePreferencesSchema
} from '../validators/notificationValidators/notification.validator';

import { checkPermission } from '../middleware/check-permission.middleware';
import { PermissionModule, PermissionAction } from '../models/permission.model';

const router = Router();

// All routes require authentication
router.use(checkUserAuth);

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications with pagination
 * @access  Private (User)
 * @query   page, limit, unreadOnly, category
 */
router.get('/', checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.VIEW), notificationController.getUserNotifications);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private (User)
 */
router.get('/unread-count', checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.VIEW), notificationController.getUnreadCount);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private (User)
 */
router.put('/:id/read', checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.VIEW), notificationController.markAsRead);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private (User)
 */
router.put('/read-all', checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.VIEW), notificationController.markAllAsRead);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Private (User)
 */
router.delete('/:id', checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.DELETE), notificationController.deleteNotification);

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get notification preferences
 * @access  Private (User)
 */
router.get('/preferences', checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.VIEW), notificationController.getPreferences);

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Update notification preferences
 * @access  Private (User)
 */
router.put(
  '/preferences',
  checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.VIEW),
  validate(updatePreferencesSchema),
  notificationController.updatePreferences
);

/**
 * @route   POST /api/notifications/device/register
 * @desc    Register device for push notifications
 * @access  Private (User)
 */
router.post(
  '/device/register',
  checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.VIEW),
  validate(registerDeviceSchema),
  notificationController.registerDevice
);

/**
 * @route   POST /api/notifications/device/unregister
 * @desc    Unregister device from push notifications
 * @access  Private (User)
 */
router.post(
  '/device/unregister',
  checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.VIEW),
  validate(unregisterDeviceSchema),
  notificationController.unregisterDevice
);

/**
 * @route   POST /api/notifications/test
 * @desc    Send test notification
 * @access  Private (User)
 */
router.post('/test', checkPermission(PermissionModule.NOTIFICATIONS, PermissionAction.VIEW), notificationController.sendTestNotification);

export default router;


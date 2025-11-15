import { Router } from 'express';
import notificationController from '../../controllers/notification.controller';
import { checkAdminAuth } from '../../middleware/check-admin-auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  sendCustomNotificationSchema,
  sendEmergencyNotificationSchema
} from '../../validators/notificationValidators/notification.validator';

const router = Router();

// All routes require admin authentication
router.use(checkAdminAuth);

/**
 * @route   GET /api/admin/notifications
 * @desc    Get all notifications (admin)
 * @access  Private (Admin)
 * @query   page, limit, category, userId
 */
router.get('/', notificationController.getAllNotifications);

/**
 * @route   POST /api/admin/notifications/send
 * @desc    Send custom notification to user(s) or role
 * @access  Private (Admin)
 */
router.post(
  '/send',
  validate(sendCustomNotificationSchema),
  notificationController.sendCustomNotification
);

/**
 * @route   POST /api/admin/notifications/emergency
 * @desc    Send emergency notification
 * @access  Private (Admin)
 */
router.post(
  '/emergency',
  validate(sendEmergencyNotificationSchema),
  notificationController.sendEmergencyNotification
);

export default router;


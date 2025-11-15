import { z } from 'zod';
import { NotificationCategory, DeviceType } from '../../models/common/types';

export const registerDeviceSchema = z.object({
  body: z.object({
    deviceToken: z.string().min(1, 'Device token is required'),
    deviceType: z.nativeEnum(DeviceType),
    deviceName: z.string().min(1, 'Device name is required')
  })
});

export const unregisterDeviceSchema = z.object({
  body: z.object({
    deviceToken: z.string().min(1, 'Device token is required')
  })
});

export const updatePreferencesSchema = z.object({
  body: z.object({
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    bookingConfirmations: z.boolean().optional(),
    tripReminders: z.boolean().optional(),
    scheduleChanges: z.boolean().optional(),
    emergencyAlerts: z.boolean().optional(),
    promotions: z.boolean().optional(),
    reminder24h: z.boolean().optional(),
    reminder2h: z.boolean().optional(),
    reminder30m: z.boolean().optional()
  })
});

export const sendCustomNotificationSchema = z.object({
  body: z.object({
    userIds: z.array(z.string()).optional(),
    targetRole: z.string().optional(),
    category: z.nativeEnum(NotificationCategory),
    title: z.string().min(1, 'Title is required').max(100),
    body: z.string().min(1, 'Body is required').max(500),
    imageUrl: z.string().url().optional(),
    metadata: z.record(z.any()).optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    scheduledFor: z.string().datetime().optional()
  }).refine(
    (data) => data.userIds || data.targetRole,
    {
      message: 'Either userIds or targetRole must be provided'
    }
  )
});

export const sendEmergencyNotificationSchema = z.object({
  body: z.object({
    userIds: z.array(z.string()).min(1, 'At least one user ID is required'),
    type: z.enum(['weather', 'cancellation', 'safety']),
    title: z.string().min(1, 'Title is required').max(100),
    message: z.string().min(1, 'Message is required').max(500),
    affectedRoutes: z.array(z.string()).optional(),
    alternativeOptions: z.array(z.any()).optional()
  })
});


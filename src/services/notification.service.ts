import { getFirebaseMessagingSafe, isFCMEnabled } from '../config/firebase';
import Notification, { INotification, NotificationMetadata } from '../models/notification.model';
import DeviceModel from '../models/device.model';
import AuthModel from '../models/auth.model';
import Profile from '../models/profile.model';
import { NotificationCategory, NotificationType, DeliveryStatus, UserRole } from '../models/common/types';
import { Types } from 'mongoose';
import { notificationsQueue, JobName } from '../config/bullmq';

export interface CreateNotificationOptions {
  userId?: string | Types.ObjectId;
  targetRole?: UserRole;
  category: NotificationCategory;
  title: string;
  body: string;
  imageUrl?: string;
  metadata?: NotificationMetadata;
  priority?: 'high' | 'normal' | 'low';
  scheduledFor?: Date;
  expiresAt?: Date;
  sendPush?: boolean;
  sendEmail?: boolean;
  sendInApp?: boolean;
}

export interface SendPushNotificationOptions {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  priority?: 'high' | 'normal';
}

class NotificationService {
  /**
   * Create a notification in the database
   */
  async createNotification(options: CreateNotificationOptions): Promise<INotification> {
    try {
      const notification = await Notification.create({
        user: options.userId,
        targetRole: options.targetRole,
        type: NotificationType.INAPP, // Default to in-app, will be updated based on what's sent
        category: options.category,
        title: options.title,
        body: options.body,
        imageUrl: options.imageUrl,
        metadata: options.metadata,
        priority: options.priority || 'normal',
        scheduledFor: options.scheduledFor,
        expiresAt: options.expiresAt,
        deliveryStatus: DeliveryStatus.PENDING,
        isSent: false
      });

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Send push notification via Firebase Cloud Messaging
   */
  async sendPushNotification(options: SendPushNotificationOptions): Promise<string | null> {
    try {
      // Check if FCM is enabled
      if (!isFCMEnabled()) {
        console.warn('⚠️ FCM is disabled - skipping push notification send');
        return 'fcm-disabled';
      }

      const messaging = getFirebaseMessagingSafe();
      if (!messaging) {
        console.warn('⚠️ Firebase messaging not available - skipping push notification send');
        return 'messaging-unavailable';
      }
      
      const message: any = {
        token: options.token,
        notification: {
          title: options.title,
          body: options.body,
        },
        android: {
          priority: options.priority || 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      if (options.imageUrl) {
        message.notification.imageUrl = options.imageUrl;
      }

      if (options.data) {
        message.data = options.data;
      }

      const response = await messaging.send(message);
      console.log('✅ Successfully sent push notification:', response);
      return response;
    } catch (error: any) {
      console.error('❌ Error sending push notification:', error);
      throw error;
    }
  }

  /**
   * Send notification to a specific user (both DB and push if enabled)
   */
  async sendToUser(options: CreateNotificationOptions): Promise<INotification> {
    try {
      if (!options.userId) {
        throw new Error('userId is required for sendToUser');
      }

      // Check user's notification preferences
      const profile = await Profile.findOne({ auth: options.userId });
      const prefs = profile?.notificationPreferences;

      // Create notification in DB
      const notification = await this.createNotification(options);

      // Send push notification if enabled
      if (options.sendPush !== false && prefs?.pushEnabled !== false) {
        try {
          // Get user's active devices
          const devices = await DeviceModel.find({ 
            auth: options.userId, 
            isActive: true 
          });

          if (devices.length > 0) {
            // Convert metadata to string format for FCM data payload
            const dataPayload: Record<string, string> = {};
            if (options.metadata) {
              Object.keys(options.metadata).forEach(key => {
                const value = options.metadata![key];
                dataPayload[key] = typeof value === 'string' ? value : JSON.stringify(value);
              });
            }
            dataPayload.notificationId = (notification._id as any).toString();
            dataPayload.category = options.category;

            // Send to all devices
            // Send to all devices
            const pushPromises = devices.map(device => 
              this.sendPushNotification({
                token: device.deviceToken,
                title: options.title,
                body: options.body,
                data: dataPayload,
                imageUrl: options.imageUrl,
                priority: options.priority === 'high' ? 'high' : 'normal'
              }).catch(err => {
                console.error(`Failed to send to device ${device._id}:`, err);
                // If token is invalid, mark device as inactive
                if (err.code === 'messaging/invalid-registration-token' || 
                    err.code === 'messaging/registration-token-not-registered') {
                  DeviceModel.updateOne({ _id: device._id }, { isActive: false }).exec();
                }
                return null;
              })
            );

            const results = await Promise.allSettled(pushPromises);
            const successCount = results.filter(r => 
              r.status === 'fulfilled' && 
              r.value && 
              r.value !== 'fcm-disabled' && 
              r.value !== 'messaging-unavailable'
            ).length;
            console.log('🔍 Success count:', successCount);

            // If FCM is disabled, still mark as sent for database consistency
            if (successCount > 0 || !isFCMEnabled()) {
              notification.type = NotificationType.PUSH;
              notification.deliveryStatus = DeliveryStatus.SENT;
              notification.sentAt = new Date();
              notification.isSent = true;
              await notification.save();
            }
          }
        } catch (pushError) {
          console.error('Error sending push notification:', pushError);
          // Continue even if push fails - DB notification is created
        }
      }

      return notification;
    } catch (error) {
      console.error('Error in sendToUser:', error);
      throw error;
    }
  }

  /**
   * Send notification to multiple users by role
   */
  async sendToRole(role: UserRole, options: Omit<CreateNotificationOptions, 'userId'>): Promise<void> {
    try {
      // Find all users with the specified role
      const users = await AuthModel.find({ role, isActive: true });

      // Send to each user
      const promises = users.map(user => 
        this.sendToUser({
          ...options,
          userId: user._id.toString()
        }).catch(err => {
          console.error(`Failed to send notification to user ${user._id}:`, err);
          return null;
        })
      );

      await Promise.all(promises);
    } catch (error) {
      console.error('Error in sendToRole:', error);
      throw error;
    }
  }

  /**
   * Send booking confirmation notification
   */
  async sendBookingConfirmation(
    userId: string,
    bookingData: {
      bookingRef: string;
      origin: string;
      destination: string;
      departureTime: Date;
      seatNumbers: string[];
      amount: number;
      currency: string;
      bookingId: string;
      tripId: string;
      routeId: string;
    }
  ): Promise<void> {
    await this.sendToUser({
      userId,
      category: NotificationCategory.BOOKING_CONFIRMATION,
      title: '🎫 Booking Confirmed!',
      body: `Your trip from ${bookingData.origin} to ${bookingData.destination} is confirmed. Booking ref: ${bookingData.bookingRef}`,
      metadata: {
        screen: 'BookingDetails',
        params: { bookingId: bookingData.bookingId },
        bookingId: bookingData.bookingId,
        tripId: bookingData.tripId,
        routeId: bookingData.routeId,
        bookingRef: bookingData.bookingRef,
        departureTime: bookingData.departureTime,
        origin: bookingData.origin,
        destination: bookingData.destination,
        seatNumbers: bookingData.seatNumbers,
        amount: bookingData.amount,
        currency: bookingData.currency
      },
      priority: 'high',
      sendPush: true
    });
  }

  /**
   * Send payment receipt notification
   */
  async sendPaymentReceipt(
    userId: string,
    paymentData: {
      bookingRef: string;
      amount: number;
      currency: string;
      paymentId: string;
      bookingId: string;
    }
  ): Promise<void> {
    await this.sendToUser({
      userId,
      category: NotificationCategory.PAYMENT_RECEIPT,
      title: '💳 Payment Successful',
      body: `Payment of ${paymentData.currency} ${paymentData.amount} received for booking ${paymentData.bookingRef}`,
      metadata: {
        screen: 'PaymentReceipt',
        params: { paymentId: paymentData.paymentId, bookingId: paymentData.bookingId },
        paymentId: paymentData.paymentId,
        bookingId: paymentData.bookingId,
        bookingRef: paymentData.bookingRef,
        amount: paymentData.amount,
        currency: paymentData.currency
      },
      priority: 'normal',
      sendPush: true
    });
  }

  /**
   * Send trip reminder notification
   */
  async sendTripReminder(
    userId: string,
    reminderType: 'trip_reminder_24h' | 'trip_reminder_2h' | 'trip_reminder_30m',
    tripData: {
      bookingRef: string;
      origin: string;
      destination: string;
      departureTime: Date;
      seatNumbers: string[];
      bookingId: string;
      tripId: string;
    }
  ): Promise<void> {
    const timeMap = {
      trip_reminder_24h: '24 hours',
      trip_reminder_2h: '2 hours',
      trip_reminder_30m: '30 minutes'
    };

    await this.sendToUser({
      userId,
      category: NotificationCategory[reminderType.toUpperCase() as keyof typeof NotificationCategory],
      title: `⏰ Trip Reminder - ${timeMap[reminderType]}`,
      body: `Your trip from ${tripData.origin} to ${tripData.destination} departs in ${timeMap[reminderType]}`,
      metadata: {
        screen: 'BookingDetails',
        params: { bookingId: tripData.bookingId },
        bookingId: tripData.bookingId,
        tripId: tripData.tripId,
        bookingRef: tripData.bookingRef,
        departureTime: tripData.departureTime,
        origin: tripData.origin,
        destination: tripData.destination,
        seatNumbers: tripData.seatNumbers
      },
      priority: 'high',
      sendPush: true
    });
  }

  /**
   * Send schedule change notification
   */
  async sendScheduleChange(
    userId: string,
    changeData: {
      bookingRef: string;
      origin: string;
      destination: string;
      oldDepartureTime: Date;
      newDepartureTime: Date;
      reason?: string;
      bookingId: string;
      tripId: string;
    }
  ): Promise<void> {
    await this.sendToUser({
      userId,
      category: NotificationCategory.SCHEDULE_CHANGE,
      title: '📅 Schedule Changed',
      body: `Your trip from ${changeData.origin} to ${changeData.destination} has been rescheduled. ${changeData.reason || ''}`,
      metadata: {
        screen: 'BookingDetails',
        params: { bookingId: changeData.bookingId },
        bookingId: changeData.bookingId,
        tripId: changeData.tripId,
        bookingRef: changeData.bookingRef,
        origin: changeData.origin,
        destination: changeData.destination,
        oldDepartureTime: changeData.oldDepartureTime,
        newDepartureTime: changeData.newDepartureTime,
        reason: changeData.reason
      },
      priority: 'high',
      sendPush: true
    });
  }

  /**
   * Send emergency notification
   */
  async sendEmergencyNotification(
    userIds: string[],
    emergencyData: {
      type: 'weather' | 'cancellation' | 'safety';
      title: string;
      message: string;
      affectedRoutes?: string[];
      alternativeOptions?: any[];
    }
  ): Promise<void> {
    const categoryMap = {
      weather: NotificationCategory.EMERGENCY_WEATHER,
      cancellation: NotificationCategory.EMERGENCY_CANCELLATION,
      safety: NotificationCategory.EMERGENCY_SAFETY
    };

    const promises = userIds.map(userId =>
      this.sendToUser({
        userId,
        category: categoryMap[emergencyData.type],
        title: `⚠️ ${emergencyData.title}`,
        body: emergencyData.message,
        metadata: {
          screen: 'EmergencyAlert',
          params: {},
          affectedRoutes: emergencyData.affectedRoutes,
          alternativeOptions: emergencyData.alternativeOptions
        },
        priority: 'high',
        sendPush: true
      }).catch(err => {
        console.error(`Failed to send emergency notification to user ${userId}:`, err);
        return null;
      })
    );

    await Promise.all(promises);
  }

  /**
   * Send admin notification for bus capacity
   */
  async sendBusCapacityAlert(
    tripData: {
      tripId: string;
      routeId: string;
      origin: string;
      destination: string;
      departureTime: Date;
      totalSeats: number;
      bookedSeats: number;
      capacityPercentage: number;
    }
  ): Promise<void> {
    await this.sendToRole(UserRole.SUPER_ADMIN, {
      category: NotificationCategory.ADMIN_BUS_CAPACITY,
      title: '🚌 High Bus Capacity Alert',
      body: `Route ${tripData.origin} to ${tripData.destination} is ${tripData.capacityPercentage}% full (${tripData.bookedSeats}/${tripData.totalSeats} seats)`,
      metadata: {
        screen: 'TripManagement',
        params: { tripId: tripData.tripId },
        tripId: tripData.tripId,
        routeId: tripData.routeId,
        origin: tripData.origin,
        destination: tripData.destination,
        departureTime: tripData.departureTime,
        busCapacity: tripData.totalSeats,
        currentBookings: tripData.bookedSeats,
        // Add busId and departureDate for duplicate checking
        busId: tripData.tripId.split('-')[0], // Extract busId from tripId if format is busId-date
        departureDate: tripData.departureTime ? new Date(tripData.departureTime).toISOString().split('T')[0] : undefined
      },
      priority: 'high',
      sendPush: true
    });

    // Also send to managers
    await this.sendToRole(UserRole.MANAGER, {
      category: NotificationCategory.ADMIN_BUS_CAPACITY,
      title: '🚌 High Bus Capacity Alert',
      body: `Route ${tripData.origin} to ${tripData.destination} is ${tripData.capacityPercentage}% full. Consider adding another bus.`,
      metadata: {
        screen: 'TripManagement',
        params: { tripId: tripData.tripId },
        tripId: tripData.tripId,
        routeId: tripData.routeId,
        origin: tripData.origin,
        destination: tripData.destination,
        departureTime: tripData.departureTime,
        busCapacity: tripData.totalSeats,
        currentBookings: tripData.bookedSeats,
        // Add busId and departureDate for duplicate checking
        busId: tripData.tripId.split('-')[0], // Extract busId from tripId if format is busId-date
        departureDate: tripData.departureTime ? new Date(tripData.departureTime).toISOString().split('T')[0] : undefined
      },
      priority: 'high',
      sendPush: true
    });
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
      category?: NotificationCategory;
    } = {}
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const query: any = { user: userId };
    
    if (options.unreadOnly) {
      query.readAt = { $exists: false };
    }
    
    if (options.category) {
      query.category = options.category;
    }

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query)
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await Notification.updateOne(
      { _id: notificationId, user: userId },
      { 
        readAt: new Date(),
        deliveryStatus: DeliveryStatus.SEEN
      }
    );
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await Notification.updateMany(
      { user: userId, readAt: { $exists: false } },
      { 
        readAt: new Date(),
        deliveryStatus: DeliveryStatus.SEEN
      }
    );
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return await Notification.countDocuments({
      user: userId,
      readAt: { $exists: false }
    });
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    await Notification.deleteOne({ _id: notificationId, user: userId });
  }

  /**
   * Process scheduled notifications
   * This should be called by a cron job
   */
  async processScheduledNotifications(): Promise<void> {
    try {
      const now = new Date();
      
      // Find notifications that are scheduled and not sent yet
      const scheduledNotifications = await Notification.find({
        scheduledFor: { $lte: now },
        isSent: false
      });

      for (const notification of scheduledNotifications) {
        try {
          if (notification.user) {
            // Re-send using sendToUser to trigger push notifications
            await this.sendToUser({
              userId: notification.user.toString(),
              category: notification.category,
              title: notification.title,
              body: notification.body,
              imageUrl: notification.imageUrl,
              metadata: notification.metadata,
              priority: notification.priority,
              sendPush: true
            });

            // Mark original as sent
            notification.isSent = true;
            notification.sentAt = new Date();
            await notification.save();
          }
        } catch (error) {
          console.error(`Error processing scheduled notification ${notification._id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing scheduled notifications:', error);
    }
  }

  /**
   * Queue booking confirmation notification (non-blocking)
   * This queues the notification to be processed in the background by BullMQ
   */
  async queueBookingConfirmation(
    userId: string,
    bookingData: {
      bookingRef: string;
      origin: string;
      destination: string;
      departureTime: Date;
      seatNumbers: string[];
      amount: number;
      currency: string;
      bookingId: string;
      tripId: string;
      routeId: string;
    }
  ): Promise<void> {
    try {
      await notificationsQueue.add(
        JobName.SEND_BOOKING_CONFIRMATION,
        {
          userId,
          bookingData: {
            ...bookingData,
            departureTime: bookingData.departureTime instanceof Date 
              ? bookingData.departureTime.toISOString() 
              : bookingData.departureTime
          }
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );
      console.log(`📬 Booking confirmation queued for user ${userId}`);
    } catch (error) {
      console.error('Error queueing booking confirmation:', error);
      // Don't throw - notification failure shouldn't break the booking flow
    }
  }

  /**
   * Queue payment receipt notification (non-blocking)
   * This queues the notification to be processed in the background by BullMQ
   */
  async queuePaymentReceipt(
    userId: string,
    paymentData: {
      bookingRef: string;
      amount: number;
      currency: string;
      paymentId: string;
      bookingId: string;
    }
  ): Promise<void> {
    try {
      await notificationsQueue.add(
        JobName.SEND_PAYMENT_RECEIPT,
        {
          userId,
          paymentData
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );
      console.log(`📬 Payment receipt queued for user ${userId}`);
    } catch (error) {
      console.error('Error queueing payment receipt:', error);
      // Don't throw - notification failure shouldn't break the payment flow
    }
  }

  /**
   * Queue notification to user (non-blocking)
   * This queues the notification to be processed in the background by BullMQ
   */
  async queueToUser(options: CreateNotificationOptions): Promise<void> {
    try {
      await notificationsQueue.add(
        JobName.SEND_NOTIFICATION,
        {
          userId: options.userId,
          options: {
            ...options,
            scheduledFor: options.scheduledFor instanceof Date 
              ? options.scheduledFor.toISOString() 
              : options.scheduledFor,
            expiresAt: options.expiresAt instanceof Date 
              ? options.expiresAt.toISOString() 
              : options.expiresAt,
          }
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );
      console.log(`📬 Notification queued for user ${options.userId}`);
    } catch (error) {
      console.error('Error queueing notification to user:', error);
      // Don't throw - notification failure shouldn't break the flow
    }
  }

  /**
   * Queue notification to role (non-blocking)
   * This queues notifications for all users with the specified role
   */
  async queueToRole(role: UserRole, options: Omit<CreateNotificationOptions, 'userId'>): Promise<void> {
    try {
      // Find all users with the specified role
      const users = await AuthModel.find({ role, isActive: true });
      
      // Queue a notification job for each user
      const queuePromises = users.map(user =>
        this.queueToUser({
          ...options,
          userId: user._id.toString()
        }).catch(err => {
          console.error(`Failed to queue notification to user ${user._id}:`, err);
          return null;
        })
      );

      await Promise.all(queuePromises);
      console.log(`📬 Notifications queued for ${users.length} users with role ${role}`);
    } catch (error) {
      console.error('Error queueing notifications to role:', error);
      // Don't throw - notification failure shouldn't break the flow
    }
  }

  /**
   * Queue emergency notification (non-blocking)
   * This queues emergency notifications for multiple users
   */
  async queueEmergencyNotification(
    userIds: string[],
    emergencyData: {
      type: 'weather' | 'cancellation' | 'safety';
      title: string;
      message: string;
      affectedRoutes?: string[];
      alternativeOptions?: any[];
    }
  ): Promise<void> {
    try {
      const categoryMap = {
        weather: NotificationCategory.EMERGENCY_WEATHER,
        cancellation: NotificationCategory.EMERGENCY_CANCELLATION,
        safety: NotificationCategory.EMERGENCY_SAFETY
      };

      // Queue a notification job for each user
      const queuePromises = userIds.map(userId =>
        this.queueToUser({
          userId,
          category: categoryMap[emergencyData.type],
          title: `⚠️ ${emergencyData.title}`,
          body: emergencyData.message,
          metadata: {
            screen: 'EmergencyAlert',
            params: {},
            affectedRoutes: emergencyData.affectedRoutes,
            alternativeOptions: emergencyData.alternativeOptions
          },
          priority: 'high',
          sendPush: true
        }).catch(err => {
          console.error(`Failed to queue emergency notification to user ${userId}:`, err);
          return null;
        })
      );

      await Promise.all(queuePromises);
      console.log(`📬 Emergency notifications queued for ${userIds.length} users`);
    } catch (error) {
      console.error('Error queueing emergency notifications:', error);
      // Don't throw - notification failure shouldn't break the flow
    }
  }
}

export default new NotificationService();


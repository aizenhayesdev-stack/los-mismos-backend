import mongoose from "mongoose";
import dotenv from "dotenv";
import AuthModel from "../models/auth.model";
import NotificationModel from "../models/notification.model";
import PassengerModel from "../models/passenger.models";
import { 
  UserRole, 
  NotificationType, 
  NotificationCategory, 
  DeliveryStatus 
} from "../models/common/types";
import { DB_URI } from "../config/environment";

dotenv.config();

const generateMockNotifications = async () => {
  try {
    console.log("Connecting to database...");
    console.log("DB_URI defined:", !!DB_URI);
    
    if (!DB_URI) {
      throw new Error("DB_URI is not defined");
    }
    
    await mongoose.connect(DB_URI);
    console.log("Connected to database.");

    // Clear existing mock notifications (optional, commented out for safety)
    // await NotificationModel.deleteMany({ title: { $regex: /\[MOCK\]/ } });

    console.log("Fetching users...");
    const users = await AuthModel.find({ deletedAt: null });
    console.log(`Found ${users.length} users.`);

    const notifications = [];

    for (const user of users) {
      // 1. Common Notifications for All Users (Welcome, System Updates)
      notifications.push({
        user: user._id,
        type: NotificationType.INAPP,
        category: NotificationCategory.SCHEDULE_CHANGE, // Using generic category
        title: "Welcome to T4L Ticketing!",
        body: `Hello ${user.email}, welcome to our platform. We're glad to have you here.`,
        isSent: true,
        readAt: new Date(),
        deliveryStatus: DeliveryStatus.SEEN,
        createdAt: new Date(user.createdAt.getTime() + 1000 * 60 * 60), // 1 hour after signup
      });

      // 2. Role-Specific Notifications
      if (user.role === UserRole.CUSTOMER) {
        // Fetch bookings for this customer
        const bookings = await PassengerModel.find({ user: user._id });
        
        for (const booking of bookings) {
          // Booking Confirmation
          notifications.push({
            user: user._id,
            type: NotificationType.EMAIL,
            category: NotificationCategory.BOOKING_CONFIRMATION,
            title: "Booking Confirmed",
            body: `Your booking ${booking.ticketNumber} from ${booking.From} to ${booking.To} has been confirmed.`,
            metadata: {
              bookingId: booking._id,
              bookingRef: booking.ticketNumber,
              origin: booking.From,
              destination: booking.To,
              departureTime: booking.DepartureDate,
              amount: booking.price,
              currency: booking.currency,
              seatNumbers: [booking.seatLabel],
            },
            isSent: true,
            sentAt: booking.createdAt,
            deliveryStatus: DeliveryStatus.DELIVERED,
            createdAt: booking.createdAt,
          });

          // Payment Receipt
          notifications.push({
            user: user._id,
            type: NotificationType.EMAIL,
            category: NotificationCategory.PAYMENT_RECEIPT,
            title: "Payment Receipt",
            body: `Payment of ${booking.currency} ${booking.price} for ticket ${booking.ticketNumber} was successful.`,
            metadata: {
              bookingId: booking._id,
              amount: booking.price,
              currency: booking.currency,
              paymentId: booking.paymentIntentId,
            },
            isSent: true,
            sentAt: new Date(booking.createdAt.getTime() + 1000 * 60 * 5), // 5 mins after booking
            deliveryStatus: DeliveryStatus.DELIVERED,
            createdAt: new Date(booking.createdAt.getTime() + 1000 * 60 * 5),
          });

          // Trip Reminders (if trip is in future or recently passed)
          const now = new Date();
          const tripDate = new Date(booking.DepartureDate);
          const timeDiff = tripDate.getTime() - now.getTime();
          const hoursDiff = timeDiff / (1000 * 60 * 60);

          if (hoursDiff > 0 && hoursDiff <= 24) {
            // Upcoming trip within 24h
            notifications.push({
              user: user._id,
              type: NotificationType.PUSH,
              category: NotificationCategory.TRIP_REMINDER_24H,
              title: "Upcoming Trip Reminder",
              body: `Your trip to ${booking.To} is tomorrow at ${tripDate.toLocaleTimeString()}. Don't forget your ID!`,
              metadata: {
                bookingId: booking._id,
                departureTime: booking.DepartureDate,
              },
              isSent: true,
              deliveryStatus: DeliveryStatus.SENT,
              createdAt: new Date(),
            });
          } else if (hoursDiff < 0 && hoursDiff > -24) {
            // Trip was today/yesterday
             notifications.push({
              user: user._id,
              type: NotificationType.PUSH,
              category: NotificationCategory.TRIP_REMINDER_2H, // Using as "post-trip" placeholder or just a reminder that was sent
              title: "Trip Reminder",
              body: `Your trip to ${booking.To} is departing soon!`,
              metadata: {
                bookingId: booking._id,
                departureTime: booking.DepartureDate,
              },
              isSent: true,
              sentAt: new Date(tripDate.getTime() - 1000 * 60 * 60 * 2), // 2 hours before
              deliveryStatus: DeliveryStatus.DELIVERED,
              readAt: new Date(tripDate.getTime() - 1000 * 60 * 60 * 1),
              createdAt: new Date(tripDate.getTime() - 1000 * 60 * 60 * 2),
            });
          }
        }

        // Random Promo / Info
        if (Math.random() > 0.7) {
           notifications.push({
            user: user._id,
            type: NotificationType.INAPP,
            category: NotificationCategory.SCHEDULE_CHANGE, // Using as generic info
            title: "New Routes Available!",
            body: "We've added new destinations to our network. Check them out now!",
            imageUrl: "https://example.com/promo-image.jpg",
            isSent: true,
            deliveryStatus: DeliveryStatus.PENDING,
            createdAt: new Date(),
          });
        }

      } else if (user.role === UserRole.DRIVER) {
        // Driver Notifications
        notifications.push({
          user: user._id,
          type: NotificationType.PUSH,
          category: NotificationCategory.SCHEDULE_CHANGE,
          title: "Schedule Update",
          body: "Your schedule for next week has been updated. Please check your roster.",
          isSent: true,
          deliveryStatus: DeliveryStatus.DELIVERED,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
        });

         notifications.push({
          user: user._id,
          type: NotificationType.SMS,
          category: NotificationCategory.EMERGENCY_WEATHER,
          title: "Weather Alert",
          body: "Heavy rain reported on Route 5. Please drive carefully.",
          priority: 'high',
          isSent: true,
          deliveryStatus: DeliveryStatus.DELIVERED,
          createdAt: new Date(),
        });

      } else if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.MANAGER) {
        // Admin Notifications
        notifications.push({
          user: user._id,
          type: NotificationType.INAPP,
          category: NotificationCategory.ADMIN_BUS_CAPACITY,
          title: "Low Capacity Alert",
          body: "Bus #402 on Route A-B is running at 10% capacity for tomorrow's trip.",
          metadata: {
             busCapacity: 40,
             currentBookings: 4
          },
          priority: 'normal',
          isSent: true,
          deliveryStatus: DeliveryStatus.PENDING,
          createdAt: new Date(),
        });

        notifications.push({
          user: user._id,
          type: NotificationType.EMAIL,
          category: NotificationCategory.EMERGENCY_CANCELLATION,
          title: "Trip Cancellation Report",
          body: "3 trips were cancelled yesterday due to maintenance issues.",
          isSent: true,
          deliveryStatus: DeliveryStatus.DELIVERED,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
        });
      }
    }

    console.log(`Generated ${notifications.length} notifications.`);
    
    if (notifications.length > 0) {
      await NotificationModel.insertMany(notifications);
      console.log("Successfully inserted notifications into database.");
    } else {
      console.log("No notifications to insert.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error generating mock notifications:", error);
    process.exit(1);
  }
};

generateMockNotifications().catch(err => {
  console.error("Unhandled error in generateMockNotifications:", err);
  process.exit(1);
});

import Booking from '../models/booking.model';
import notificationService from './notification.service';
import { PaymentStatus, BookingStatus, TicketStatus } from '../models/common/types';
import PassengerModel from '../models/passenger.models';
import BusModel from '../models/bus.model';
import RouteModel from '../models/route.model';
import mongoose from 'mongoose';
import { busCapacityQueue, JobName } from '../config/bullmq';

interface TripReminderJob {
  checkAndSendReminders(): Promise<void>;
  checkBusCapacity(): Promise<void>;
}

class TripReminderService implements TripReminderJob {
  /**
   * Check for trips and send reminders based on departure time
   * This should be run every 5-10 minutes via a cron job
   */
  async checkAndSendReminders(): Promise<void> {
    try {
      console.log('🔔 Checking for trip reminders...');
      
      const now = new Date();
      
      // Calculate time windows for reminders
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const in30Minutes = new Date(now.getTime() + 30 * 60 * 1000);
      
      // Time windows with a small buffer (5 minutes)
      const buffer = 5 * 60 * 1000;
      
      // Find confirmed bookings with paid status
      const bookings = await Booking.find({
        bookingStatus: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID
      })
        .populate({
          path: 'trip',
          select: 'departureTime route bus',
          populate: {
            path: 'route',
            select: 'origin destination'
          }
        })
        .populate('user', '_id')
        .lean();

      for (const booking of bookings) {
        if (!booking.trip || !booking.user) continue;

        const trip = booking.trip as any;
        const departureTime = new Date(trip.departureTime);
        
        // Skip if trip has already departed
        if (departureTime < now) continue;

        const timeToDeparture = departureTime.getTime() - now.getTime();

        // Get user profile for notification preferences
        const Profile = (await import('../models/profile.model')).default;
        const profile = await Profile.findOne({ auth: booking.user });
        const prefs = profile?.notificationPreferences;

        // Check if reminders are enabled
        if (prefs?.tripReminders === false) continue;

        const userId = (booking.user as any)._id?.toString() || booking.user.toString();
        const route = trip.route as any;

        const tripData = {
          bookingRef: booking.bookingRef,
          origin: route?.origin?.name || 'Origin',
          destination: route?.destination?.name || 'Destination',
          departureTime: departureTime,
          seatNumbers: booking.passengers.map((p: any) => p.seatLabel).filter(Boolean),
          bookingId: booking._id.toString(),
          tripId: trip._id.toString()
        };

        // 24-hour reminder
        if (
          prefs?.reminder24h !== false &&
          timeToDeparture <= 24 * 60 * 60 * 1000 + buffer &&
          timeToDeparture > 24 * 60 * 60 * 1000 - buffer
        ) {
          // Check if we haven't already sent this reminder
          const Notification = (await import('../models/notification.model')).default;
          const existingReminder = await Notification.findOne({
            user: userId,
            category: 'trip_reminder_24h',
            'metadata.bookingId': booking._id.toString()
          });

          if (!existingReminder) {
            console.log(`Sending 24h reminder for booking ${booking.bookingRef}`);
            await notificationService.sendTripReminder(
              userId,
              'trip_reminder_24h',
              tripData
            ).catch(err => console.error('Error sending 24h reminder:', err));
          }
        }

        // 2-hour reminder
        if (
          prefs?.reminder2h !== false &&
          timeToDeparture <= 2 * 60 * 60 * 1000 + buffer &&
          timeToDeparture > 2 * 60 * 60 * 1000 - buffer
        ) {
          const Notification = (await import('../models/notification.model')).default;
          const existingReminder = await Notification.findOne({
            user: userId,
            category: 'trip_reminder_2h',
            'metadata.bookingId': booking._id.toString()
          });

          if (!existingReminder) {
            console.log(`Sending 2h reminder for booking ${booking.bookingRef}`);
            await notificationService.sendTripReminder(
              userId,
              'trip_reminder_2h',
              tripData
            ).catch(err => console.error('Error sending 2h reminder:', err));
          }
        }

        // 30-minute reminder
        if (
          prefs?.reminder30m !== false &&
          timeToDeparture <= 30 * 60 * 1000 + buffer &&
          timeToDeparture > 30 * 60 * 1000 - buffer
        ) {
          const Notification = (await import('../models/notification.model')).default;
          const existingReminder = await Notification.findOne({
            user: userId,
            category: 'trip_reminder_30m',
            'metadata.bookingId': booking._id.toString()
          });

          if (!existingReminder) {
            console.log(`Sending 30m reminder for booking ${booking.bookingRef}`);
            await notificationService.sendTripReminder(
              userId,
              'trip_reminder_30m',
              tripData
            ).catch(err => console.error('Error sending 30m reminder:', err));
          }
        }
      }

      console.log('✅ Trip reminder check completed');
    } catch (error) {
      console.error('❌ Error checking trip reminders:', error);
      throw error;
    }
  }

  /**
   * Check bus capacity and send alerts to admins when 90% or more full
   * This should be run periodically (e.g., every hour)
   */
  async checkBusCapacity(): Promise<void> {
    try {
      console.log('🚌 Checking bus capacity...');

      const now = new Date();
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Next 7 days

      // Aggregate bookings by trip to calculate capacity
      const capacityData = await Booking.aggregate([
        {
          $match: {
            bookingStatus: BookingStatus.CONFIRMED,
            paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.PENDING] }
          }
        },
        {
          $lookup: {
            from: 'trips',
            localField: 'trip',
            foreignField: '_id',
            as: 'tripData'
          }
        },
        {
          $unwind: '$tripData'
        },
        {
          $match: {
            'tripData.departureTime': { $gte: now, $lte: futureDate }
          }
        },
        {
          $lookup: {
            from: 'buses',
            localField: 'tripData.bus',
            foreignField: '_id',
            as: 'busData'
          }
        },
        {
          $unwind: '$busData'
        },
        {
          $lookup: {
            from: 'routes',
            localField: 'tripData.route',
            foreignField: '_id',
            as: 'routeData'
          }
        },
        {
          $unwind: '$routeData'
        },
        {
          $group: {
            _id: '$trip',
            tripId: { $first: '$tripData._id' },
            routeId: { $first: '$tripData.route' },
            departureTime: { $first: '$tripData.departureTime' },
            origin: { $first: '$routeData.origin' },
            destination: { $first: '$routeData.destination' },
            totalSeats: { $first: { $size: '$busData.seatLayout.seats' } },
            bookedSeats: { $sum: { $size: '$passengers' } }
          }
        },
        {
          $addFields: {
            capacityPercentage: {
              $multiply: [
                { $divide: ['$bookedSeats', '$totalSeats'] },
                100
              ]
            }
          }
        },
        {
          $match: {
            capacityPercentage: { $gte: 90 }
          }
        }
      ]);

      // Send notifications for high-capacity trips
      const Notification = (await import('../models/notification.model')).default;

      for (const trip of capacityData) {
        // Check if we've already sent an alert for this trip
        const existingAlert = await Notification.findOne({
          category: 'admin_bus_capacity',
          'metadata.tripId': trip.tripId.toString()
        });

        if (!existingAlert) {
          console.log(`Sending capacity alert for trip ${trip.tripId} - ${trip.capacityPercentage.toFixed(1)}% full`);
          
          await notificationService.sendBusCapacityAlert({
            tripId: trip.tripId.toString(),
            routeId: trip.routeId.toString(),
            origin: trip.origin?.name || 'Origin',
            destination: trip.destination?.name || 'Destination',
            departureTime: trip.departureTime,
            totalSeats: trip.totalSeats,
            bookedSeats: trip.bookedSeats,
            capacityPercentage: trip.capacityPercentage
          }).catch(err => console.error('Error sending capacity alert:', err));
        }
      }

      console.log(`✅ Bus capacity check completed. Found ${capacityData.length} high-capacity trips`);
    } catch (error) {
      console.error('❌ Error checking bus capacity:', error);
      throw error;
    }
  }

  /**
   * Check bus capacity for a specific bus and departure date
   * Sends notification to admins if capacity >= 90%
   * This is called immediately after a booking is completed
   */
  async checkBusCapacityForBooking(
    busId: string,
    routeId: string,
    departureDate: Date,
    passengersCount?: number
  ): Promise<void> {
    try {
      // Get bus information
      const bus = await BusModel.findById(busId);
      if (!bus || !bus.seatLayout || !bus.seatLayout.seats) {
        console.error('Bus not found or invalid seat layout:', busId);
        return;
      }

      const totalSeats = bus.seatLayout.seats.length;
      if (totalSeats === 0) {
        console.warn('Bus has no seats:', busId);
        return;
      }

      const inputDate = new Date(departureDate);

    // 2. Extract the YYYY-MM-DD portion (always in UTC)
    // We use UTC methods to ensure the date part is calculated consistently worldwide.
    const year = inputDate.getUTCFullYear();
    // getUTCMonth() is 0-indexed, so we add 1 for the date string.
    // padStart ensures '01' instead of '1' for single-digit months.
    const month = String(inputDate.getUTCMonth() + 1).padStart(2, '0'); 
    const day = String(inputDate.getUTCDate()).padStart(2, '0');

    // 3. Construct the UTC date strings for the range
    // The date format is YYYY-MM-DDT00:00:00.000Z
    const dateToFind = `${year}-${month}-${day}`; // e.g., "2025-11-13"

    // Start of the required day (e.g., Nov 13) in UTC
    const departureDateStart = new Date(dateToFind + 'T00:00:00.000Z');

    // Start of the next day (e.g., Nov 14) in UTC (exclusive upper bound)
    const nextDayTimestamp = departureDateStart.getTime() + (24 * 60 * 60 * 1000); 
    const departureDateEnd = new Date(nextDayTimestamp);

      const busObjectId = mongoose.Types.ObjectId.isValid(busId) 
        ? new mongoose.Types.ObjectId(busId) 
        : busId;

      const query = {
        busId: busObjectId,
        DepartureDate: {
          $gte: departureDateStart,
          $lte: departureDateEnd
        },
        isCancelled: false
        // Removed isValid and status filters to include all non-cancelled bookings
        // isValid might not be set correctly for all bookings
        // Status can be ACTIVE, USED, etc. - all count toward capacity
      };


      const bookedPassengers = await PassengerModel.countDocuments(query);

      const capacityPercentage = ((bookedPassengers + (passengersCount || 0))/ totalSeats) * 100;

      console.log(`📊 Bus capacity check for bus ${busId} on ${departureDate.toISOString()}: ${bookedPassengers}/${totalSeats} (${capacityPercentage.toFixed(1)}%)`);

      // Only send notification if capacity >= 90%
      if (capacityPercentage >= 90) {
        // Get route information for notification
        const route = await RouteModel.findById(routeId)
          .populate('origin destination')
          .lean();

        if (!route) {
          console.error('Route not found:', routeId);
          return;
        }

        const origin = (route as any)?.origin?.name || 'Origin';
        const destination = (route as any)?.destination?.name || 'Destination';

        // Check if we've already sent an alert for this bus and departure date
        // Use a unique identifier: busId + departureDate (date only, no time)
        const Notification = (await import('../models/notification.model')).default;
        const departureDateStr = departureDateStart.toISOString().split('T')[0];
        const existingAlert = await Notification.findOne({
          category: 'admin_bus_capacity',
          'metadata.busId': busId,
          'metadata.departureDate': departureDateStr
        });

        // if (!existingAlert) {
        if (true) {
          console.log(`🚨 Sending capacity alert for bus ${busId} on ${departureDateStr} - ${capacityPercentage.toFixed(1)}% full`);

          // Generate a unique tripId for this bus+date combination
          // Since we don't have a trip model, we'll use busId + departureDate
          const tripId = `${busId}-${departureDateStr}`;

          // Create a custom alert with busId in metadata
          const Notification = (await import('../models/notification.model')).default;
          const NotificationCategory = (await import('../models/common/types')).NotificationCategory;
          const UserRole = (await import('../models/common/types')).UserRole;
          
          // Send to SUPER_ADMIN
          await notificationService.sendToRole(UserRole.SUPER_ADMIN, {
            category: NotificationCategory.ADMIN_BUS_CAPACITY,
            title: '🚌 High Bus Capacity Alert',
            body: `Route ${origin} to ${destination} is ${capacityPercentage.toFixed(1)}% full (${bookedPassengers}/${totalSeats} seats)`,
            metadata: {
              screen: 'TripManagement',
              params: { tripId: tripId },
              tripId: tripId,
              routeId: routeId,
              origin: origin,
              destination: destination,
              departureTime: departureDate,
              busCapacity: totalSeats,
              currentBookings: bookedPassengers,
              busId: busId,
              departureDate: departureDateStr
            },
            priority: 'high',
            sendPush: true
          }).catch(err => {
            console.error('Error sending capacity alert to SUPER_ADMIN:', err);
          });

          // Send to MANAGER
          await notificationService.sendToRole(UserRole.MANAGER, {
            category: NotificationCategory.ADMIN_BUS_CAPACITY,
            title: '🚌 High Bus Capacity Alert',
            body: `Route ${origin} to ${destination} is ${capacityPercentage.toFixed(1)}% full. Consider adding another bus.`,
            metadata: {
              screen: 'TripManagement',
              params: { tripId: tripId },
              tripId: tripId,
              routeId: routeId,
              origin: origin,
              destination: destination,
              departureTime: departureDate,
              busCapacity: totalSeats,
              currentBookings: bookedPassengers,
              busId: busId,
              departureDate: departureDateStr
            },
            priority: 'high',
            sendPush: true
          }).catch(err => {
            console.error('Error sending capacity alert to MANAGER:', err);
          });
        } else {
          console.log(`ℹ️  Capacity alert already sent for bus ${busId} on ${departureDateStr}`);
        }
      }
    } catch (error) {
      console.error('❌ Error checking bus capacity for booking:', error);
      // Don't throw - this is a background check and shouldn't fail the booking
    }
  }

  /**
   * Queue bus capacity check for booking (non-blocking)
   * This queues the capacity check to be processed in the background by BullMQ
   */
  async queueBusCapacityCheckForBooking(
    busId: string,
    routeId: string,
    departureDate: Date,
    passengersCount?: number
  ): Promise<void> {
    try {
      await busCapacityQueue.add(
        JobName.CHECK_BUS_CAPACITY_FOR_BOOKING,
        {
          busId,
          routeId,
          departureDate: departureDate instanceof Date 
            ? departureDate.toISOString() 
            : departureDate,
          passengersCount
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );
      console.log(`📬 Bus capacity check queued for bus ${busId}, route ${routeId}`);
    } catch (error) {
      console.error('Error queueing bus capacity check:', error);
      // Don't throw - capacity check failure shouldn't break the booking flow
    }
  }

  /**
   * Initialize the cron jobs (deprecated - now using BullMQ)
   * @deprecated Use BullMQ workers instead
   */
  initializeCronJobs(): void {
    console.log('⚠️  Legacy cron jobs are deprecated. Using BullMQ workers instead.');
  }
}

export default new TripReminderService();


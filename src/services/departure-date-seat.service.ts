import BusModel from '../models/bus.model';
import PassengerModel from '../models/passenger.models';
import { SeatStatus } from '../models/common/types';
import { redis, RedisKeys } from '../config/redis';
import mongoose from 'mongoose';

export interface SeatBookingInfo {
  seatLabel: string;
  departureDate: Date;
  userId: string;
  bookingId?: string;
  status: SeatStatus;
  heldAt?: Date;
  expiresAt?: Date;
}

export class DepartureDateSeatService {
  
  /**
   * Get seat availability from Redis cache or database
   */
  private async getSeatAvailabilityFromCache(busId: string, departureDate: Date): Promise<Record<string, string> | null> {
    try {
      const departureDateStr = departureDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      const cacheKey = RedisKeys.departureDateSeats(busId, departureDateStr);
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      console.error('Error getting seat availability from cache:', error);
      return null;
    }
  }

  /**
   * Cache seat availability in Redis
   */
  private async cacheSeatAvailability(busId: string, departureDate: Date, availability: Record<string, string>): Promise<void> {
    try {
      const departureDateStr = departureDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      const cacheKey = RedisKeys.departureDateSeats(busId, departureDateStr);
      await redis.setex(cacheKey, 300, JSON.stringify(availability)); // 5 minutes cache
    } catch (error) {
      console.error('Error caching seat availability:', error);
    }
  }

  /**
   * Invalidate seat availability cache
   */
  private async invalidateSeatAvailabilityCache(busId: string, departureDate: Date): Promise<void> {
    try {
      const departureDateStr = departureDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      const cacheKey = RedisKeys.departureDateSeats(busId, departureDateStr);
      await redis.del(cacheKey);
    } catch (error) {
      console.error('Error invalidating seat availability cache:', error);
    }
  }

  /**
   * Check if a seat is available for a specific departure date
   */
  async isSeatAvailableForDate(
    busId: string, 
    seatLabel: string, 
    departureDate: Date,
    userId: string
  ): Promise<{ available: boolean; reason?: string; currentBooking?: any }> {
    try {
      const bus = await BusModel.findById(busId);
      if (!bus) {
        return { available: false, reason: 'Bus not found' };
      }

      const seat = bus.seatLayout.seats.find((s: any) => s.seatLabel === seatLabel);
      if (!seat) {
        return { available: false, reason: 'Seat not found' };
      }

      // Check if seat has any bookings for this departure date
      const existingBooking = (seat as any).departureDateBookings?.find((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        const queryDate = new Date(departureDate);
        return bookingDate.toDateString() === queryDate.toDateString();
      });

      if (existingBooking) {
        // Check if booking is expired (for held seats)
        if (existingBooking.status === SeatStatus.SELECTED && existingBooking.expiresAt) {
          if(existingBooking.userId.toString() === userId) {
            return { available: true };
          }
          else if (new Date() > existingBooking.expiresAt) {
            // Booking expired, remove it
            await this.removeExpiredBooking(busId, seatLabel, departureDate);
            return { available: true };
          }
        }

        return { 
          available: false, 
          reason: `Seat ${seatLabel} is ${existingBooking.status.toLowerCase()} for this departure date`,
          currentBooking: existingBooking
        };
      }

      return { available: true };
    } catch (error) {
      console.error('Error checking seat availability:', error);
      return { available: false, reason: 'Database error' };
    }
  }

  /**
   * Hold a seat for a specific departure date
   */
  async holdSeatForDate(
    busId: string,
    seatLabel: string,
    departureDate: Date,
    userId: string,
    holdDurationMinutes: number = 15
  ): Promise<{ success: boolean; reason?: string; expiresAt?: Date }> {
    try {
      // Check if seat is available
      const availability = await this.isSeatAvailableForDate(busId, seatLabel, departureDate,userId);
      if (!availability.available) {
        return { success: false, reason: availability.reason };
      }

      const expiresAt = new Date(Date.now() + holdDurationMinutes * 60 * 1000);
      const departureDateStr = departureDate.toISOString().split('T')[0];
      
      // Store hold in Redis for fast access
      const holdKey = RedisKeys.departureDateHolds(busId, departureDateStr);
      const holdData = {
        seatLabel,
        userId,
        expiresAt: expiresAt.getTime(),
        heldAt: Date.now()
      };
      
      await redis.hset(holdKey, seatLabel, JSON.stringify(holdData));
      await redis.expire(holdKey, holdDurationMinutes * 60); // Set TTL
      
      // Update database
      await BusModel.updateOne(
        { 
          _id: busId,
          'seatLayout.seats.seatLabel': seatLabel
        },
        {
          $push: {
            'seatLayout.seats.$.departureDateBookings': {
              departureDate: departureDate,
              userId: userId,
              status: SeatStatus.SELECTED,
              heldAt: new Date(),
              expiresAt: expiresAt
            }
          }
        }
      );

      // Invalidate cache
      await this.invalidateSeatAvailabilityCache(busId, departureDate);

      return { success: true, expiresAt };
    } catch (error) {
      console.error('Error holding seat:', error);
      return { success: false, reason: 'Database error' };
    }
  }

  /**
   * Book a seat permanently for a specific departure date
   */
  async bookSeatForDate(
    busId: string,
    seatLabel: string,
    departureDate: Date,
    userId: string,
    bookingId?: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      // First, check if seat is held by this user or available
      const availability = await this.isSeatAvailableForDate(busId, seatLabel, departureDate,userId);
      
      if (!availability.available) {
        // Check if it's held by the same user
        if (availability.currentBooking && 
            availability.currentBooking.userId.toString() === userId &&
            availability.currentBooking.status === SeatStatus.SELECTED) {
          // User's hold, can book
        } else {
          return { success: false, reason: availability.reason };
        }
      }

      const departureDateStr = departureDate.toISOString().split('T')[0];

      // Remove hold from Redis
      const holdKey = RedisKeys.departureDateHolds(busId, departureDateStr);
      await redis.hdel(holdKey, seatLabel);

      // Remove any existing hold and create permanent booking
      await BusModel.updateOne(
        { 
          _id: busId,
          'seatLayout.seats.seatLabel': seatLabel
        },
        {
          $pull: {
            'seatLayout.seats.$.departureDateBookings': {
              departureDate: departureDate
            }
          }
        }
      );

      // Add permanent booking
      await BusModel.updateOne(
        { 
          _id: busId,
          'seatLayout.seats.seatLabel': seatLabel
        },
        {
          $push: {
            'seatLayout.seats.$.departureDateBookings': {
              departureDate: departureDate,
              userId: userId,
              bookingId: bookingId,
              status: SeatStatus.BOOKED,
              heldAt: new Date()
            }
          }
        }
      );

      // Invalidate cache
      await this.invalidateSeatAvailabilityCache(busId, departureDate);

      return { success: true };
    } catch (error) {
      console.error('Error booking seat:', error);
      return { success: false, reason: 'Database error' };
    }
  }

  /**
   * Release a held seat
   */
  async releaseSeatHold(
    busId: string,
    seatLabel: string,
    departureDate: Date,
    userId: string
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      const departureDateStr = departureDate.toISOString().split('T')[0];

      // Remove hold from Redis
      const holdKey = RedisKeys.departureDateHolds(busId, departureDateStr);
      await redis.hdel(holdKey, seatLabel);

      // Get the bus document and manually remove the booking
      const bus = await BusModel.findById(busId);
      if (!bus) {
        console.error(`Bus not found: ${busId}`);
        return { success: false, reason: 'Bus not found' };
      }

      // Find the seat
      const seat = bus.seatLayout.seats.find((s: any) => s.seatLabel === seatLabel);
      if (!seat) {
        console.error(`Seat not found: ${seatLabel}`);
        return { success: false, reason: 'Seat not found' };
      }

      // Find and remove the booking that matches the criteria
      const seatAny = seat as any;
      if (seatAny.departureDateBookings && Array.isArray(seatAny.departureDateBookings)) {
        const initialLength = seatAny.departureDateBookings.length;
        
        console.log(`🔍 Checking ${initialLength} bookings for seat ${seatLabel} on ${departureDateStr}`);
        
        // Log all existing bookings for debugging
        seatAny.departureDateBookings.forEach((booking: any, index: number) => {
          const bookingDateStr = new Date(booking.departureDate).toISOString().split('T')[0];
          console.log(`  Booking ${index + 1}: date=${bookingDateStr}, userId=${booking.userId}, status=${booking.status}, target=${userId}`);
        });
        
        // Filter out the booking to remove
        seatAny.departureDateBookings = seatAny.departureDateBookings.filter((booking: any) => {
          const bookingDateStr = new Date(booking.departureDate).toISOString().split('T')[0];
          const targetDateStr = new Date(departureDate).toISOString().split('T')[0];
          
          const dateMatch = bookingDateStr === targetDateStr;
          const userMatch = booking.userId?.toString() === userId.toString();
          const statusMatch = booking.status === SeatStatus.SELECTED;
          
          const shouldRemove = dateMatch && userMatch && statusMatch;
          
          if (shouldRemove) {
            console.log(`  ❌ Removing booking: date=${bookingDateStr}, user=${booking.userId}, status=${booking.status}`);
          }
          
          // Keep booking if it should NOT be removed
          return !shouldRemove;
        });
        
        const removedCount = initialLength - seatAny.departureDateBookings.length;
        
        if (removedCount > 0) {
          await bus.save();
          console.log(`✅ Released ${removedCount} seat hold(s) for seat ${seatLabel} on ${departureDateStr}`);
          console.log(`📊 Remaining bookings: ${seatAny.departureDateBookings.length}`);
        } else {
          console.log(`⚠️ No matching hold found for seat ${seatLabel} on ${departureDateStr} for user ${userId}`);
          console.log(`   Expected: date=${departureDateStr}, userId=${userId}, status=SELECTED`);
        }
      } else {
        console.log(`📝 No departureDateBookings array found for seat ${seatLabel}`);
      }

      // Invalidate cache
      await this.invalidateSeatAvailabilityCache(busId, departureDate);

      return { success: true };
    } catch (error) {
      console.error('Error releasing seat hold:', error);
      return { success: false, reason: 'Database error' };
    }
  }

  /**
   * Remove expired bookings
   */
  async removeExpiredBooking(
    busId: string,
    seatLabel: string,
    departureDate: Date
  ): Promise<void> {
    try {
      const departureDateStr = departureDate.toISOString().split('T')[0];
      
      // Get the bus document
      const bus = await BusModel.findById(busId);
      if (!bus) {
        console.error(`Bus not found: ${busId}`);
        return;
      }

      // Find the seat
      const seat = bus.seatLayout.seats.find((s: any) => s.seatLabel === seatLabel);
      if (!seat) {
        console.error(`Seat not found: ${seatLabel}`);
        return;
      }

      // Remove expired bookings
      const seatAny = seat as any;
      if (seatAny.departureDateBookings && Array.isArray(seatAny.departureDateBookings)) {
        const initialLength = seatAny.departureDateBookings.length;
        const now = new Date();
        
        seatAny.departureDateBookings = seatAny.departureDateBookings.filter((booking: any) => {
          const bookingDateStr = new Date(booking.departureDate).toISOString().split('T')[0];
          const targetDateStr = new Date(departureDate).toISOString().split('T')[0];
          
          // Keep booking if any of these conditions are true:
          // - Different date
          // - Not SELECTED status
          // - Not expired
          return !(
            bookingDateStr === targetDateStr &&
            booking.status === SeatStatus.SELECTED &&
            booking.expiresAt &&
            new Date(booking.expiresAt) < now
          );
        });
        
        const removedCount = initialLength - seatAny.departureDateBookings.length;
        
        if (removedCount > 0) {
          await bus.save();
          console.log(`Removed ${removedCount} expired booking(s) for seat ${seatLabel} on ${departureDateStr}`);
        }
      }
    } catch (error) {
      console.error('Error removing expired booking:', error);
    }
  }

  /**
   * Get seat availability for all seats on a specific departure date
   */
  async getSeatAvailabilityForDate(
    busId: string,
    departureDate: Date,
    userId?: string
  ): Promise<Record<string, string>> {
    try {
      // Try to get from cache first
      const cached = await this.getSeatAvailabilityFromCache(busId, departureDate);
      if (cached) {
        return cached;
      }

      const bus = await BusModel.findById(busId);
      if (!bus) {
        throw new Error('Bus not found');
      }

      const departureDateStr = departureDate.toISOString().split('T')[0];
      const holdKey = RedisKeys.departureDateHolds(busId, departureDateStr);
      const redisHolds = await redis.hgetall(holdKey);

      const seatAvailability: Record<string, string> = {};

      for (const seat of bus.seatLayout.seats) {
        const seatLabel = (seat as any).seatLabel;
        const booking = (seat as any).departureDateBookings?.find((booking: any) => {
          const bookingDate = new Date(booking.departureDate);
          const queryDate = new Date(departureDate);
          return bookingDate.toDateString() === queryDate.toDateString();
        });

        // Check Redis holds first (more up-to-date)
        const redisHold = redisHolds[seatLabel];
        if (redisHold) {
          const holdData = JSON.parse(redisHold);
          if (Date.now() < holdData.expiresAt) {
            // Still held
            if (userId && holdData.userId === userId) {
              seatAvailability[seatLabel] = 'selected_by_you';
            } else {
              seatAvailability[seatLabel] = 'selected';
            }
          } else {
            // Expired hold, remove from Redis
            await redis.hdel(holdKey, seatLabel);
            seatAvailability[seatLabel] = 'available';
          }
        } else if (booking) {
          // Check if hold is expired
          if (booking.status === SeatStatus.SELECTED && booking.expiresAt) {
            if (new Date() > booking.expiresAt) {
              // Expired, remove it and mark as available
              await this.removeExpiredBooking(busId, seatLabel, departureDate);
              seatAvailability[seatLabel] = 'available';
            } else {
              // Still held
              if (userId && booking.userId.toString() === userId) {
                seatAvailability[seatLabel] = 'selected_by_you';
              } else {
                seatAvailability[seatLabel] = 'selected';
              }
            }
          } else if (booking.status === SeatStatus.BOOKED) {
            seatAvailability[seatLabel] = 'booked';
          }
        } else {
          seatAvailability[seatLabel] = 'available';
        }
      }

      // Cache the result
      await this.cacheSeatAvailability(busId, departureDate, seatAvailability);

      return seatAvailability;
    } catch (error) {
      console.error('Error getting seat availability:', error);
      throw error;
    }
  }

  /**
   * Clean up expired holds for a bus
   */
  async cleanupExpiredHoldsForBus(busId: string): Promise<void> {
    try {
      // Clean up expired holds from database
      await BusModel.updateOne(
        { _id: busId },
        {
          $pull: {
            'seatLayout.seats.$[].departureDateBookings': {
              status: SeatStatus.SELECTED,
              expiresAt: { $lt: new Date() }
            }
          }
        }
      );

      // Clean up expired holds from Redis
      const pattern = `bus:${busId}:holds:*`;
      const keys = await redis.keys(pattern);
      
      for (const key of keys) {
        const holds = await redis.hgetall(key);
        const currentTime = Date.now();
        
        for (const [seatLabel, holdDataStr] of Object.entries(holds)) {
          const holdData = JSON.parse(holdDataStr);
          if (currentTime > holdData.expiresAt) {
            await redis.hdel(key, seatLabel);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired holds:', error);
    }
  }
}

export const departureDateSeatService = new DepartureDateSeatService();
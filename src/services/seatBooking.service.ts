import Route from '../models/route.model';
import Booking from '../models/booking.model';
import SeatHold from '../models/seat-hold.model';
import Bus from '../models/bus.model';
import { redis, RedisKeys } from '../config/redis';
import { BookingStatus, PaymentStatus, SeatStatus } from '../models/common/types';
import { SEAT_HOLD_DURATION } from '../config/environment';
import BusModel from '../models/bus.model';
import mongoose from 'mongoose';
import { departureDateSeatService } from './departure-date-seat.service';

/**
 * Service for managing seat bookings with real-time holds using Route model
 */
export class SeatBookingService {
  private readonly SEAT_HOLD_DURATION = Number(SEAT_HOLD_DURATION) || 15 * 60 * 1000; // 15 minutes default
  /**
   * Get seat availability for a route from Redis cache or database
   */
  async getSeatAvailability(routeId: string, userId?: string, departureDate?: Date): Promise<Record<string, string>> {
    try {
      // Always fetch fresh data from database to ensure we get all seats
      // and current hold status
      const seats = await this.fetchSeatsFromDatabase(routeId, userId, departureDate);
      
      // Update cache with fresh data
      const departureDateStr = departureDate ? departureDate.toISOString().split('T')[0] : undefined;
      const cacheKey = RedisKeys.tripSeats(routeId, departureDateStr);
      
      const pipeline = redis.pipeline();
      for (const [seatLabel, status] of Object.entries(seats)) {
        pipeline.hset(cacheKey, seatLabel, status);
      }
      pipeline.expire(cacheKey, 300);
      await pipeline.exec();
      
      return seats;
    } catch (error) {
      console.error('Error getting seat availability:', error);
      throw error;
    }
  }

  /**
   * Hold a seat for a specific departure date with distributed lock mechanism
   */
  async holdSeatForDate(busId: string, routeId: string, seatLabel: string, userId: string, departureDate: Date): Promise<{ success: boolean; reason?: string; expiresAt?: number; extended?: boolean }> {
    const departureDateStr = departureDate.toISOString().split('T')[0];
    const lockKey = RedisKeys.tripLock(routeId, seatLabel, departureDateStr);
    const holdKey = RedisKeys.seatHold(routeId, seatLabel, departureDateStr);
    
    try {
      // Try to acquire lock using SET NX (atomic operation) - increased timeout to 5 seconds
      const locked = await (redis as any).set(lockKey, '1', 'NX', 'EX', 5);
      
      if (!locked) {
        return { success: false, reason: 'seat_locked' };
      }
      
      // Check if seat is available for this departure date using the departure date service
      const availability = await departureDateSeatService.isSeatAvailableForDate(busId, seatLabel, departureDate,userId);
      
      if (!availability.available) {
        // Check if it's held by the same user (allow extending hold)
        if (availability.currentBooking && 
            availability.currentBooking.userId.toString() === userId &&
            availability.currentBooking.status === SeatStatus.SELECTED) {
          // Same user, extend the hold
          await departureDateSeatService.holdSeatForDate(busId, seatLabel, departureDate, userId, 15);
          return { success: true, extended: true };
        } else {
          return { success: false, reason: availability.reason || 'seat_not_available' };
        }
      }
      
      // Hold the seat for the departure date
      const holdResult = await departureDateSeatService.holdSeatForDate(busId, seatLabel, departureDate, userId, 15);
      
      if (holdResult.success) {
        // Also store in Redis for real-time updates (legacy support)
        const holdData = {
          userId,
          seatLabel,
          busId,
          routeId,
          departureDate: departureDate.toISOString(),
          expiresAt: holdResult.expiresAt?.getTime() || (Date.now() + 15 * 60 * 1000)
        };
        
        await redis.setex(holdKey, 900, JSON.stringify(holdData)); // 15 minutes
        
        // Add to user holds set
        await redis.sadd(RedisKeys.userHolds(userId), `${routeId}:${seatLabel}:${departureDate.toISOString().split('T')[0]}`);
        
        return { 
          success: true, 
          expiresAt: holdResult.expiresAt?.getTime() || (Date.now() + 15 * 60 * 1000)
        };
      } else {
        return { success: false, reason: holdResult.reason };
      }
    } catch (error) {
      console.error('Error holding seat for date:', error);
      return { success: false, reason: 'database_error' };
    } finally {
      // Always release the lock
      await redis.del(lockKey);
    }
  }

  /**
   * Hold a seat with distributed lock mechanism (legacy method - now uses departure date service)
   */
  async holdSeat(busId: string, routeId: string, seatLabel: string, userId: string): Promise<{ success: boolean; reason?: string; expiresAt?: number; extended?: boolean }> {
    const lockKey = RedisKeys.tripLock(routeId, seatLabel);
    const holdKey = RedisKeys.seatHold(routeId, seatLabel);
    
    try {
      // Try to acquire lock using SET NX (atomic operation) - increased timeout to 5 seconds
      const locked = await (redis as any).set(lockKey, '1', 'NX', 'EX', 5);
      
      if (!locked) {
        return { success: false, reason: 'seat_locked' };
      }
      
      // Check if seat is already held in Redis (this takes precedence)
      const existingHold = await redis.get(holdKey);
      
      if (existingHold) {
        const holdData = JSON.parse(existingHold);
        
        // Check if hold is expired
        if (Date.now() < holdData.expiresAt) {
          // Seat is still held by someone
          if (holdData.userId !== userId) {
            return { success: false, reason: 'seat_held' };
          }
          // Same user, extend the hold
          return { success: true, extended: true };
        } else {
          // Hold is expired, clean it up
          await this.cleanupExpiredHold(holdData, holdKey);
        }
      }
      
      // Check if seat is permanently booked (check database)
      const bus = await BusModel.findById(busId).populate('seatLayout');
      if (!bus) {
        return { success: false, reason: 'bus_not_found' };
      }
      const seat = bus.seatLayout.seats.find((s: any) => s.seatLabel === seatLabel);
      if (!seat) {
        return { success: false, reason: 'seat_not_found' };
      }
      
      // Check if seat is already booked (permanent booking)
      if (seat.status === SeatStatus.BOOKED) {
        return { success: false, reason: 'seat_booked' };
      }
      
      // Check if seat is held by someone else in database
      if (seat.status === SeatStatus.SELECTED && seat.userId && seat.userId.toString() !== userId) {
        return { success: false, reason: 'seat_held' };
      }
      
      // Check if seat is available
      if (!seat.isAvailable && seat.status !== SeatStatus.AVAILABLE) {
        return { success: false, reason: 'seat_not_available' };
      }
   
      
      seat.isAvailable = false;
      seat.status = SeatStatus.SELECTED; // Set as SELECTED for the current user
      seat.userId = new mongoose.Types.ObjectId(userId);
      await bus.save();
      
      // Create hold data
      const holdData = {
        userId,
        seatLabel,
        routeId,
        heldAt: Date.now(),
        expiresAt: Date.now() + this.SEAT_HOLD_DURATION
      };
      
      await redis.setex(holdKey, Math.floor(this.SEAT_HOLD_DURATION / 1000), JSON.stringify(holdData));
      
      // Track user's holds
      await redis.sadd(RedisKeys.userHolds(userId), `${routeId}:${seatLabel}`);
      await redis.expire(RedisKeys.userHolds(userId), Math.floor(this.SEAT_HOLD_DURATION / 1000));
      
      // Update seat status in cache
      await redis.hset(RedisKeys.tripSeats(routeId), seatLabel, SeatStatus.SELECTED);
      
      return { success: true, expiresAt: holdData.expiresAt };
      
    } finally {
      // Release lock
      await redis.del(lockKey);
    }
  }

  /**
   * Release a seat hold for a specific departure date
   */
  async releaseSeatHoldForDate(busId: string, routeId: string, seatLabel: string, userId: string, departureDate: Date): Promise<{ success: boolean; reason?: string }> {
    try {
      const departureDateStr = departureDate.toISOString().split('T')[0];
      const holdKey = RedisKeys.seatHold(routeId, seatLabel, departureDateStr);
      const lockKey = RedisKeys.tripLock(routeId, seatLabel, departureDateStr);
      
      // Try to acquire lock
      const locked = await (redis as any).set(lockKey, '1', 'NX', 'EX', 5);
      
      if (!locked) {
        return { success: false, reason: 'seat_locked' };
      }
      
      try {
        // Release hold using departure date service
        const releaseResult = await departureDateSeatService.releaseSeatHold(busId, seatLabel, departureDate, userId);
        
        if (releaseResult.success) {
          // Clean up Redis keys
          await redis.del(holdKey);
          await redis.srem(RedisKeys.userHolds(userId), `${routeId}:${seatLabel}:${departureDateStr}`);
          
          // Invalidate seat availability cache for this route
          const cacheKey = RedisKeys.tripSeats(routeId, departureDateStr);
          await redis.del(cacheKey);
          console.log(`🗑️  Invalidated cache for route ${routeId} on ${departureDateStr}`);
          
          return { success: true };
        } else {
          return releaseResult;
        }
      } finally {
        // Always release the lock
        await redis.del(lockKey);
      }
    } catch (error) {
      console.error('Error releasing seat hold for date:', error);
      return { success: false, reason: 'database_error' };
    }
  }

  /**
   * Release a seat hold (legacy method - now routes to date-specific method if date provided)
   */
  async releaseSeat(busId: string, routeId: string, seatLabel: string, userId: string, departureDate?: Date): Promise<{ success: boolean; reason?: string }> {
    console.log(`🔓 releaseSeat called: busId=${busId}, routeId=${routeId}, seatLabel=${seatLabel}, userId=${userId}, departureDate=${departureDate ? departureDate.toISOString().split('T')[0] : 'none'}`);
    
    // If departure date is provided, use the date-specific release method
    if (departureDate) {
      console.log(`📅 Using date-specific release for ${departureDate.toISOString().split('T')[0]}`);
      return this.releaseSeatHoldForDate(busId, routeId, seatLabel, userId, departureDate);
    }
    
    // Legacy release (without departure date)
    const holdKey = RedisKeys.seatHold(routeId, seatLabel);
    const existingHold = await redis.get(holdKey);
    
    // Check if there's a Redis hold
    if (existingHold) {
      const holdData = JSON.parse(existingHold);
      
      // Verify the user owns this hold
      if (holdData.userId !== userId) {
        return { success: false, reason: 'not_owner' };
      }
    } else {
      // No Redis hold, check if seat is held in database
      const bus = await BusModel.findById(busId).populate('seatLayout');
      if (!bus) {
        return { success: false, reason: 'bus_not_found' };
      }
      const seat = bus.seatLayout.seats.find((s: any) => s.seatLabel === seatLabel);
      if (!seat) {
        return { success: false, reason: 'seat_not_found' };
      }
      
      // Check if seat is held by this user in database
      if (seat.status === SeatStatus.SELECTED && seat.userId && seat.userId.toString() === userId) {
        // Release the seat from database
        seat.userId = undefined;
        seat.isAvailable = true;
        seat.status = SeatStatus.AVAILABLE;
        await bus.save();
        await redis.hset(RedisKeys.tripSeats(routeId), seatLabel, SeatStatus.AVAILABLE);
        
        return { success: true };
      } else {
        return { success: false, reason: 'no_hold' };
      }
    }
    
    // Delete hold from Redis
    await redis.del(holdKey);
    
    // Remove from user holds set
    await redis.srem(RedisKeys.userHolds(userId), `${routeId}:${seatLabel}`);
    
    // Update seat status in database
    const bus = await BusModel.findById(busId).populate('seatLayout');
    if (!bus) {
      return { success: false, reason: 'bus_not_found' };
    }
    const seat = bus.seatLayout.seats.find((s: any) => s.seatLabel === seatLabel);
    if (!seat) {
      return { success: false, reason: 'seat_not_found' };
    }
    seat.userId = undefined;
    seat.isAvailable = true;
    seat.status = SeatStatus.AVAILABLE;
    await bus.save();
    
    // Update cache
    await redis.hset(RedisKeys.tripSeats(routeId), seatLabel, SeatStatus.AVAILABLE);
    
    return { success: true };
  }

  /**
   * Confirm booking and convert holds to permanent bookings
   */
  async confirmBooking(userId: string, routeId: string, seatLabels: string[], passengers: any[], paymentInfo?: any): Promise<{ success: boolean; bookingId?: string; reason?: string }> {
    try {
      // Verify all seats are held by this user
      const verifications = await Promise.all(
        seatLabels.map(async (seatLabel) => {
          const holdKey = RedisKeys.seatHold(routeId, seatLabel);
          const holdData = await redis.get(holdKey);
          
          if (!holdData) return false;
          
          const hold = JSON.parse(holdData);
          return hold.userId === userId && Date.now() < hold.expiresAt;
        })
      );
      
      if (verifications.includes(false)) {
        return { success: false, reason: 'invalid_holds' };
      }
      
      // Get route information with populated bus data
      const route = await Route.findById(routeId).populate('bus origin destination');
      if (!route) {
        return { success: false, reason: 'route_not_found' };
      }
      
      // Calculate total amount
      const totalAmount = this.calculateBookingAmount(route, seatLabels);
      
      // Generate booking reference
      const bookingRef = await this.generateBookingReference();
      
      // Create booking in database
      const booking = new Booking({
        bookingRef,
        route: routeId,
        user: userId,
        passengers: passengers.map((passenger, index) => ({
          ...passenger,
          seatLabel: seatLabels[index],
          seatIndex: this.getSeatIndex(route.bus, seatLabels[index])
        })),
        totalAmount,
        currency: 'MXN',
        paymentStatus: PaymentStatus.PENDING,
        paymentReference: paymentInfo?.paymentId,
        bookingStatus: BookingStatus.CONFIRMED,
        createdByCashier: false,
        hold: null
      });
      
      await booking.save();
      
      // Delete holds and update seats as booked
      const pipeline = redis.pipeline();
      for (const seatLabel of seatLabels) {
        pipeline.del(RedisKeys.seatHold(routeId, seatLabel));
        pipeline.hset(RedisKeys.tripSeats(routeId), seatLabel, SeatStatus.BOOKED);
      }
      await pipeline.exec();
      
      return { success: true, bookingId: (booking._id as any).toString() };
      
    } catch (error) {
      console.error('Error confirming booking:', error);
      return { success: false, reason: 'server_error' };
    }
  }

  /**
   * Fetch seat data from database based on route's bus (with optional departure date)
   */
  private async fetchSeatsFromDatabase(routeId: string, userId?: string, departureDate?: Date): Promise<Record<string, string>> {
    console.log(`🔍 fetchSeatsFromDatabase called with routeId: ${routeId}, userId: ${userId}, departureDate: ${departureDate ? departureDate.toISOString().split('T')[0] : 'none'}`);
    
    const route = await Route.findById(routeId).populate('bus');
    if (!route) {
      throw new Error('Route not found');
    }
    
    const seats: Record<string, string> = {};
    
    // Get existing bookings for this route to determine seat status
    const existingBookings = await Booking.find({ 
      route: routeId,
      bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] }
    });
    
    // Initialize all bus seats and check their current status in database
    const bus = route.bus as any; // Type assertion for populated bus
    if (bus.seatLayout && bus.seatLayout.seats) {
      bus.seatLayout.seats.forEach((seat: any) => {
        if (seat.seatLabel) {
          // If departure date is provided, use departure date-specific logic
          if (departureDate) {
            // Check if seat has bookings for this specific date
            let booking = null;
            if (seat.departureDateBookings && seat.departureDateBookings.length > 0) {
              booking = seat.departureDateBookings.find((booking: any) => {
                const bookingDate = new Date(booking.departureDate);
                return bookingDate.toDateString() === departureDate.toDateString();
              });
            }
            
            if (booking) {
              const bookingStatus = booking.status?.toLowerCase();
              const bookingDateStr = new Date(booking.departureDate).toISOString().split('T')[0];
              const expiresAt = booking.expiresAt ? new Date(booking.expiresAt).toISOString() : 'no expiry';
              const now = new Date().toISOString();
              
              console.log(`📌 Seat ${seat.seatLabel} has booking for ${departureDate.toISOString().split('T')[0]}: status=${bookingStatus}, userId=${booking.userId}, expiresAt=${expiresAt}, now=${now}`);
              
              // Check if hold is expired
              if (bookingStatus === 'selected' && booking.expiresAt) {
                const isExpired = new Date() > new Date(booking.expiresAt);
                console.log(`⏱️  Comparing: now(${now}) > expiresAt(${expiresAt}) = ${isExpired}`);
                
                if (isExpired) {
                  seats[seat.seatLabel] = SeatStatus.AVAILABLE;
                  console.log(`⏰ Seat ${seat.seatLabel} hold expired, marked as available`);
                } else {
                  if (userId && booking.userId?.toString() === userId) {
                    seats[seat.seatLabel] = SeatStatus.SELECTED;
                    console.log(`✅ Seat ${seat.seatLabel} selected by current user (${userId})`);
                  } else {
                    seats[seat.seatLabel] = SeatStatus.HELD;
                    console.log(`🔒 Seat ${seat.seatLabel} held by another user (booking.userId=${booking.userId}, current=${userId})`);
                  }
                }
              } else if (bookingStatus === 'booked') {
                seats[seat.seatLabel] = SeatStatus.BOOKED;
                console.log(`🎫 Seat ${seat.seatLabel} permanently booked`);
              } else if (bookingStatus === 'selected' && !booking.expiresAt) {
                // SELECTED but no expiresAt - this is a problem!
                console.log(`⚠️  WARNING: Seat ${seat.seatLabel} has SELECTED status but no expiresAt field - marking as HELD`);
                if (userId && booking.userId?.toString() === userId) {
                  seats[seat.seatLabel] = SeatStatus.SELECTED;
                } else {
                  seats[seat.seatLabel] = SeatStatus.HELD;
                }
              } else {
                seats[seat.seatLabel] = SeatStatus.AVAILABLE;
                console.log(`❓ Seat ${seat.seatLabel} has unknown status: ${bookingStatus}, marked as available`);
              }
            } else {
              // No booking for this date, seat is available
              seats[seat.seatLabel] = SeatStatus.AVAILABLE;
            }
          } else {
            // Legacy: Check database seat status first (no date filtering)
            if (seat.status === SeatStatus.BOOKED) {
              seats[seat.seatLabel] = SeatStatus.BOOKED;
            } else if (seat.status === SeatStatus.SELECTED) {
              // Check if this seat is selected by current user or someone else
              if (userId && seat.userId && seat.userId.toString() === userId) {
                seats[seat.seatLabel] = SeatStatus.SELECTED;
              } else {
                seats[seat.seatLabel] = SeatStatus.HELD;
              }
            } else if (seat.status === SeatStatus.HELD) {
              // Check if this seat is held by current user or someone else
              if (userId && seat.userId && seat.userId.toString() === userId) {
                seats[seat.seatLabel] = SeatStatus.SELECTED;
              } else {
                seats[seat.seatLabel] = SeatStatus.HELD;
              }
            } else {
              seats[seat.seatLabel] = SeatStatus.AVAILABLE;
            }
          }
        }
      });
      console.log(`📋 Initialized ${Object.keys(seats).length} seats from bus layout for route ${routeId}`);
    } else {
      console.warn(`⚠️ No seat layout found for bus in route ${routeId}`);
    }
    
    // Mark booked seats as booked from existing bookings (this overrides database status)
    if (!departureDate) {
      existingBookings.forEach(booking => {
        booking.passengers.forEach((passenger: any) => {
          if (passenger.seatLabel) {
            seats[passenger.seatLabel] = SeatStatus.BOOKED;
          }
        });
      });
      console.log(`📚 Found ${existingBookings.length} existing bookings for route ${routeId}`);
    }
    
    // Check Redis for held seats and update their status (this takes precedence over database)
    let heldCount = 0;
    let selectedCount = 0;
    
    if (departureDate) {
      // Check departure date-specific Redis holds
      const departureDateStr = departureDate.toISOString().split('T')[0];
      const holdKey = RedisKeys.departureDateHolds(bus._id.toString(), departureDateStr);
      const redisHolds = await redis.hgetall(holdKey);
      
      for (const [seatLabel, holdDataStr] of Object.entries(redisHolds)) {
        const holdData = JSON.parse(holdDataStr);
        if (Date.now() < holdData.expiresAt) {
          // Differentiate between seats held by current user vs others
          if (userId && holdData.userId === userId) {
            seats[seatLabel] = SeatStatus.SELECTED;
            selectedCount++;
          } else {
            seats[seatLabel] = SeatStatus.HELD;
            heldCount++;
          }
        } else {
          // Hold is expired, clean it up
          await redis.hdel(holdKey, seatLabel);
        }
      }
    } else {
      // Legacy: Check general Redis holds
      for (const seatLabel of Object.keys(seats)) {
        const holdKey = RedisKeys.seatHold(routeId, seatLabel);
        const holdData = await redis.get(holdKey);
        
        if (holdData) {
          const hold = JSON.parse(holdData);
          // Check if hold is still valid (not expired)
          if (Date.now() < hold.expiresAt) {
            // Differentiate between seats held by current user vs others
            if (userId && hold.userId === userId) {
              seats[seatLabel] = SeatStatus.SELECTED;
              selectedCount++;
            } else {
              seats[seatLabel] = SeatStatus.HELD;
              heldCount++;
            }
          } else {
            // Hold is expired, clean it up
            await this.cleanupExpiredHold(hold, holdKey);
          }
        }
      }
    }
    console.log(`🔒 Found ${heldCount} held seats and ${selectedCount} selected seats for route ${routeId}`);
    
    console.log(`✅ Returning ${Object.keys(seats).length} total seats for route ${routeId}:`, seats);
    return seats;
  }

  /**
   * Check if seat is permanently booked in database
   */
  private async isSeatBooked(routeId: string, seatLabel: string): Promise<boolean> {
    const booking = await Booking.findOne({
      route: routeId,
      'passengers.seatLabel': seatLabel,
      bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] }
    });
    
    return booking !== null;
  }

  /**
   * Get user's current holds
   */
  async getUserHolds(userId: string): Promise<any[]> {
    const holds = await redis.smembers(RedisKeys.userHolds(userId));
    const holdDetails = [];
    
    for (const hold of holds) {
      const [routeId, seatLabel] = hold.split(':');
      const holdKey = RedisKeys.seatHold(routeId, seatLabel);
      const holdData = await redis.get(holdKey);
      
      if (holdData) {
        holdDetails.push(JSON.parse(holdData));
      }
    }
    
    return holdDetails;
  }

  /**
   * Calculate booking amount based on route pricing
   */
  private calculateBookingAmount(route: any, seatLabels: string[]): number {
    // Base price per seat - you can implement dynamic pricing based on route, stops, etc.
    return seatLabels.length * 150; // Example: $150 MXN per seat
    
    // Example advanced pricing logic:
    // const basePrice = route.defaultPrice || 150;
    // const intermediateStopCount = route.intermediateStops.length;
    // const pricingMultiplier = 1 + (intermediateStopCount * 0.1); // 10% per stop
    // return seatLabels.length * basePrice * pricingMultiplier;
  }

  /**
   * Generate unique booking reference
   */
  private async generateBookingReference(): Promise<string> {
    const prefix = 'LM';
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${date}-${random}`;
  }

  /**
   * Get seat index from bus seat layout
   */
  private getSeatIndex(route: any, seatLabel: string): number {
    const bus = route.bus as any;
    if (bus.seatLayout && bus.seatLayout.seats) {
      const seatSnapshot = bus.seatLayout.seats.find((s: any) => s.seatLabel === seatLabel);
      return seatSnapshot?.seatIndex || 0;
    }
    return 0;
  }

  /**
   * Clean up a single expired hold
   */
  private async cleanupExpiredHold(hold: any, holdKey: string): Promise<void> {
    try {
      // Delete the hold from Redis
      await redis.del(holdKey);
      
      // Update seat status back to available in Redis
      await redis.hset(RedisKeys.tripSeats(hold.routeId), hold.seatLabel, SeatStatus.AVAILABLE);
      
      // Remove from user holds set
      await redis.srem(RedisKeys.userHolds(hold.userId), `${hold.routeId}:${hold.seatLabel}`);
      
      // Update database - find the route and bus to update seat status
      const route = await Route.findById(hold.routeId).populate('bus');
      if (route && route.bus) {
        const bus = route.bus as any;
        if (bus.seatLayout && bus.seatLayout.seats) {
          const seat = bus.seatLayout.seats.find((s: any) => s.seatLabel === hold.seatLabel);
          if (seat) {
            // Reset seat to available status in database
            seat.userId = undefined;
            seat.isAvailable = true;
            seat.status = SeatStatus.AVAILABLE;
            await bus.save();
            console.log(`🔄 Cleaned up expired seat ${hold.seatLabel} in database for route ${hold.routeId}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error cleaning up expired hold for seat ${hold.seatLabel}:`, error);
    }
  }

  /**
   * Clean up any inconsistent seat states
   */
  async cleanupInconsistentSeats(routeId: string): Promise<void> {
    try {
      const route = await Route.findById(routeId).populate('bus');
      if (!route || !route.bus) {
        return;
      }

      const bus = route.bus as any;
      if (!bus.seatLayout || !bus.seatLayout.seats) {
        return;
      }

      let hasChanges = false;
      
      // Check each seat for inconsistencies
      for (const seat of bus.seatLayout.seats) {
        if (seat.seatLabel) {
          const holdKey = RedisKeys.seatHold(routeId, seat.seatLabel);
          const holdData = await redis.get(holdKey);
          
          if (holdData) {
            const hold = JSON.parse(holdData);
            
            // If Redis hold is expired but database shows seat as selected
            if (Date.now() > hold.expiresAt && seat.status === SeatStatus.SELECTED) {
              seat.userId = undefined;
              seat.isAvailable = true;
              seat.status = SeatStatus.AVAILABLE;
              hasChanges = true;
              
              // Clean up the expired hold
              await this.cleanupExpiredHold(hold, holdKey);
            }
          } else {
            // No Redis hold but database shows seat as selected (not booked)
            if (seat.status === SeatStatus.SELECTED && seat.status !== SeatStatus.BOOKED) {
              seat.userId = undefined;
              seat.isAvailable = true;
              seat.status = SeatStatus.AVAILABLE;
              hasChanges = true;
            }
          }
        }
      }
      
      if (hasChanges) {
        await bus.save();
        console.log(`🧹 Cleaned up inconsistent seat states for route ${routeId}`);
      }
      
    } catch (error) {
      console.error('Error cleaning up inconsistent seats:', error);
    }
  }

  /**
   * Clean up expired holds
   */
  async cleanupExpiredHolds(): Promise<void> {
    const now = Date.now();
    const keys = await redis.keys('hold:*');
    
    for (const key of keys) {
      const holdData = await redis.get(key);
      if (holdData) {
        const hold = JSON.parse(holdData);
        if (now > hold.expiresAt) {
          await this.cleanupExpiredHold(hold, key);
        }
      }
    }
  }

  /**
   * Clear all seats held by a specific user
   */
  async clearAllUserSeats(userId: string): Promise<{ success: boolean; clearedSeats: string[]; errors: string[] }> {
    const clearedSeats: string[] = [];
    const errors: string[] = [];
    
    try {
      // Get all holds for this user
      const userHolds = await redis.smembers(RedisKeys.userHolds(userId));
      
      for (const hold of userHolds) {
        try {
          const holdParts = hold.split(':');
          const routeId = holdParts[0];
          const seatLabel = holdParts[1];
          const departureDate = holdParts[2]; // Optional departure date
          
          // Check if this is a date-specific hold or legacy hold
          let holdKey: string;
          let departureDateObj: Date | undefined;
          
          if (departureDate) {
            // Date-specific hold
            holdKey = RedisKeys.seatHold(routeId, seatLabel, departureDate);
            departureDateObj = new Date(departureDate);
          } else {
            // Legacy hold (no date)
            holdKey = RedisKeys.seatHold(routeId, seatLabel);
          }
          
          // Get bus ID from route
          const route = await Route.findById(routeId).populate('bus');
          if (route && route.bus) {
            const busId = (route.bus as any)._id.toString();
            
            // Release the seat (pass departure date if available)
            const result = await this.releaseSeat(busId, routeId, seatLabel, userId, departureDateObj);
            if (result.success) {
              clearedSeats.push(hold); // Push the full hold key for tracking
              console.log(`✅ Cleared seat ${seatLabel} for user ${userId} in route ${routeId}${departureDate ? ` on ${departureDate}` : ''}`);
            } else {
              // Even if release fails, try to clean up Redis
              await redis.del(holdKey);
              await redis.srem(RedisKeys.userHolds(userId), hold);
              
              console.warn(`⚠️  Seat release returned failure but cleaned up Redis: ${seatLabel} in route ${routeId}: ${result.reason}`);
              clearedSeats.push(hold);
            }
          } else {
            // Clean up orphaned hold even if route not found
            await redis.del(holdKey);
            await redis.srem(RedisKeys.userHolds(userId), hold);
            errors.push(`Route or bus not found for seat ${seatLabel} in route ${routeId}, but cleaned up hold`);
          }
        } catch (error) {
          const errorMsg = `Error clearing seat ${hold}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
      
      // Clear the user holds set from Redis
      await redis.del(RedisKeys.userHolds(userId));
      
      console.log(`🧹 Cleared ${clearedSeats.length} seats for user ${userId}, ${errors.length} errors`);
      
      return {
        success: true,
        clearedSeats,
        errors
      };
      
    } catch (error) {
      console.error('Error clearing all user seats:', error);
      return {
        success: false,
        clearedSeats,
        errors: [...errors, error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Clear all seats held by a user for a specific route
   */
  async clearUserSeatsForRoute(userId: string, routeId: string): Promise<{ success: boolean; clearedSeats: string[]; errors: string[] }> {
    const clearedSeats: string[] = [];
    const errors: string[] = [];
    
    try {
      // Get all holds for this user
      const userHolds = await redis.smembers(RedisKeys.userHolds(userId));
      
      // Get bus ID from route once
      const route = await Route.findById(routeId).populate('bus');
      if (!route || !route.bus) {
        errors.push(`Route or bus not found for route ${routeId}`);
        return {
          success: false,
          clearedSeats,
          errors
        };
      }
      const busId = (route.bus as any)._id.toString();
      
      for (const hold of userHolds) {
        try {
          const holdParts = hold.split(':');
          const holdRouteId = holdParts[0];
          const seatLabel = holdParts[1];
          const departureDate = holdParts[2]; // Optional departure date
          
          // Only process holds for the specified route
          if (holdRouteId === routeId) {
            // Check if this is a date-specific hold or legacy hold
            let holdKey: string;
            let departureDateObj: Date | undefined;
            
            if (departureDate) {
              // Date-specific hold
              holdKey = RedisKeys.seatHold(routeId, seatLabel, departureDate);
              departureDateObj = new Date(departureDate);
            } else {
              // Legacy hold (no date)
              holdKey = RedisKeys.seatHold(routeId, seatLabel);
            }
            
            // Check if hold exists in Redis
            const holdData = await redis.get(holdKey);
            
            // Release the seat (pass departure date if available)
            const result = await this.releaseSeat(busId, routeId, seatLabel, userId, departureDateObj);
            if (result.success) {
              clearedSeats.push(hold); // Push the full hold key for tracking
              console.log(`✅ Cleared seat ${seatLabel} for user ${userId} in route ${routeId}${departureDate ? ` on ${departureDate}` : ''}`);
            } else {
              // Even if release fails, try to clean up Redis
              await redis.del(holdKey);
              await redis.srem(RedisKeys.userHolds(userId), hold);
              
              console.warn(`⚠️  Seat release returned failure but cleaned up Redis: ${seatLabel} in route ${routeId}: ${result.reason}`);
              clearedSeats.push(hold);
            }
          }
        } catch (error) {
          const errorMsg = `Error clearing seat ${hold}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
      
      console.log(`🧹 Cleared ${clearedSeats.length} seats for user ${userId} in route ${routeId}, ${errors.length} errors`);
      
      return {
        success: true,
        clearedSeats,
        errors
      };
      
    } catch (error) {
      console.error('Error clearing user seats for route:', error);
      return {
        success: false,
        clearedSeats,
        errors: [...errors, error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Get route information with schedule
   */
  async getRouteInfo(routeId: string): Promise<any> {
    try {
      const route = await Route.findById(routeId)
        .populate('origin destination intermediateStops bus')
        .lean();
      
      if (!route) {
        throw new Error('Route not found');
      }
      
      return {
        id: route._id,
        name: route.name,
        origin: route.origin,
        destination: route.destination,
        intermediateStops: route.intermediateStops,
        bus: route.bus,
        dayTime: route.dayTime.map(dt => ({
          day: dt.day,
          time: dt.time // Already in "HH:mm" format (e.g., "07:00")
        })),
        isActive: route.isActive
      };
    } catch (error) {
      console.error('Error getting route info:', error);
      throw error;
    }
  }
}

export default new SeatBookingService();
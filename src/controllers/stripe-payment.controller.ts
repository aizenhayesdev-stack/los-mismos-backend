import { Response } from "express";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../config/environment";
import { CustomRequest } from "../interfaces/auth";
import ResponseUtil from "../utils/Response/responseUtils";
import { STATUS_CODES } from "../constants/statusCodes";
import BusModel from "../models/bus.model";
import PassengerModel from "../models/passenger.models";
import RouteModel from "../models/route.model";
import PaymentTransaction from "../models/payment-transaction.model";
import { QRCodeUtils } from "../utils/QRCode";
import { SeatStatus, PaymentGateway, TransactionStatus, ForWho, TripType, UserRole } from "../models/common/types";
import { AUTH_CONSTANTS } from "../constants/messages";
import { io } from "../server";
import { redis, RedisKeys } from "../config/redis";
import { departureDateSeatService } from "../services/departure-date-seat.service";
import notificationService from "../services/notification.service";
import tripReminderService from "../services/trip-reminder.service";

const stripe = new Stripe(STRIPE_SECRET_KEY as string);

/**
 * Confirm Stripe payment and complete booking
 * This endpoint is called by the frontend after successful payment
 */
export const confirmStripePayment = async (req: CustomRequest, res: Response) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Payment Intent ID is required"
      );
    }

    // Retrieve payment intent from Stripe to verify it succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        `Payment has not succeeded. Status: ${paymentIntent.status}`
      );
    }

    // Extract metadata from payment intent
    const metadata = paymentIntent.metadata;
    const userId = metadata.userId;
    const departureDate = metadata.departureDate;
    const routeId = metadata.routeId;
    const bookedBy = metadata.bookedBy;
    const busId = metadata.busId;
    const baseFare = metadata.baseFare;
    // const passengersData = metadata.passengers ? JSON.parse(metadata.passengers) : [];
    const passengersData = metadata.passengersRedisKey ? JSON.parse(await redis.get(metadata.passengersRedisKey) as string) : [];
    const seatsData = metadata.seats ? parseInt(metadata.seats) : 0;

    if (!userId || !routeId || !busId) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Missing required payment metadata"
      );
    }

    // Check if booking already exists for this payment intent
    const existingTransaction = await PaymentTransaction.findOne({
      transactionId: paymentIntentId,
      status: TransactionStatus.SUCCEEDED
    });

    if (existingTransaction) {
      // Booking already processed, retrieve existing data with QR codes
      const existingPassengers = await PassengerModel.find({
        user: userId,
        busId: busId
      }).sort({ createdAt: -1 }).limit(seatsData);

      if (existingPassengers.length > 0) {
        const groupTicketSerial = existingPassengers[0].groupTicketSerial;
        
        // Format passengers with their stored QR codes
        const passengersWithQR = existingPassengers.map((passenger) => ({
          ...passenger.toObject(),
          qrCode: {
            data: passenger.qrCode, // QR code already stored in database
            bookingId: `${passenger._id}`,
            format: "base64"
          }
        }));

        return ResponseUtil.successResponse(
          res,
          STATUS_CODES.SUCCESS,
          {
            passengers: passengersWithQR,
            type: "stripe",
            bookingsCount: existingPassengers.length,
            groupTicketSerial: groupTicketSerial,
            paymentIntentId: paymentIntentId
          },
          "Booking already confirmed"
        );
      }
    }

    // Get route and bus information
    const getRoutePrice = await RouteModel.findById(routeId).populate('origin destination');
    const getBus = await BusModel.findById(busId);

    if (!getBus) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Bus not found"
      );
    }

    // Get seat labels from passengers data
    const seatLabels = passengersData.map((p: any) => p.seatLabel);
    
    // Get the actual seat objects from bus
    const getSeats = getBus.seatLayout.seats;
    const getUserSeats = getSeats.filter((seat: any) => seatLabels.includes(seat.seatLabel));
    
    // Validate that all requested seats exist
    if (getUserSeats.length !== passengersData.length) {
      return ResponseUtil.errorResponse(
        res, 
        STATUS_CODES.BAD_REQUEST, 
        "One or more seats not found"
      );
    }

    // Check if seats are available for the specific departure date
    const invalidSeats = [];
    for (const seat of getUserSeats) {
      if (!departureDate) {
        return ResponseUtil.errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          "Departure date is required"
        );
      }
      
      const availability = await departureDateSeatService.isSeatAvailableForDate(
        busId,
        seat.seatLabel,
        new Date(departureDate),
        userId
      );
      
      if (!availability.available) {
        // Check if it's held by the same user (allow booking)
        if (availability.currentBooking && 
            availability.currentBooking.userId.toString() === userId &&
            availability.currentBooking.status === SeatStatus.SELECTED) {
          // User's hold, can proceed
        } else {
          invalidSeats.push(seat);
        }
      }
    }

    if (invalidSeats.length > 0) {
      const seatLabelsInvalid = invalidSeats.map((s: any) => s.seatLabel).join(', ');
      return ResponseUtil.errorResponse(
        res, 
        STATUS_CODES.BAD_REQUEST, 
        `Seats ${seatLabelsInvalid} are not available or already booked for this departure date`
      );
    }

    // Check if any seats are already booked
    const alreadyBookedSeats = getUserSeats.filter((seat: any) => 
      seat.status === SeatStatus.BOOKED
    );

    if (alreadyBookedSeats.length > 0) {
      const bookedSeatLabels = alreadyBookedSeats.map((s: any) => s.seatLabel).join(', ');
      return ResponseUtil.errorResponse(
        res, 
        STATUS_CODES.BAD_REQUEST, 
        `Seats ${bookedSeatLabels} are already booked`
      );
    }

    // Verify that user actually held these seats in Redis
    const notHeldSeats: string[] = [];
    for (const seatLabel of seatLabels) {
      const holdKey = RedisKeys.seatHold(routeId, seatLabel);
      const holdData = await redis.get(holdKey);
      
      if (!holdData) {
        // No hold found in Redis
        notHeldSeats.push(seatLabel);
      } else {
        const hold = JSON.parse(holdData);
        // Check if hold belongs to this user and is not expired
        if (hold.userId !== userId) {
          notHeldSeats.push(seatLabel);
        } else if (Date.now() > hold.expiresAt) {
          notHeldSeats.push(seatLabel);
        }
      }
    }

    // if (notHeldSeats.length > 0) {
    //   const notHeldLabels = notHeldSeats.join(', ');
    //   return ResponseUtil.errorResponse(
    //     res,
    //     STATUS_CODES.BAD_REQUEST,
    //     `You must hold seats ${notHeldLabels} before booking. Please select and hold the seats first.`
    //   );
    // }

    // Determine booking type
    let forType = ForWho.SELF;
    let groupTicketSerial = null;
    const passengersDB = [];

    if (passengersData.length > 1) {
      forType = ForWho.FAMILY;
      groupTicketSerial = `TKT-${Date.now()}-${passengersData.length}`;
    }

    // Create passenger records
    for (let i = 0; i < passengersData.length; i++) {
      const passenger = passengersData[i];
      
      // Properly validate and format the date of birth
      // if (passenger.dob) {
      //   // If dob is a string, try to parse it
      //   if (typeof passenger.dob === 'string') {
      //     const dateObj = new Date(passenger.dob);
      //     // Check if the date is valid
      //     if (isNaN(dateObj.getTime())) {
      //       throw new Error(`Invalid date format for passenger ${i + 1}: ${passenger.dob}`);
      //     }
      //     passenger.dob = dateObj;
      //   }
      //   // If it's already a Date object, validate it
      //   else if (passenger.dob instanceof Date) {
      //     if (isNaN(passenger.dob.getTime())) {
      //       throw new Error(`Invalid date for passenger ${i + 1}`);
      //     }
      //   }
      // } else {
      //   throw new Error(`Date of birth is required for passenger ${i + 1}`);
      // }

      // Normalize bookedBy to match enum values (lowercase)
      let normalizedBookedBy = UserRole.CUSTOMER; // default
      if (bookedBy) {
        const bookedByLower = bookedBy.toLowerCase();
        // Map to correct enum value
        switch (bookedByLower) {
          case 'customer':
            normalizedBookedBy = UserRole.CUSTOMER;
            break;
          case 'cashier':
            normalizedBookedBy = UserRole.CASHIER;
            break;
          case 'manager':
            normalizedBookedBy = UserRole.MANAGER;
            break;
          case 'driver':
            normalizedBookedBy = UserRole.DRIVER;
            break;
          case 'super_admin':
            normalizedBookedBy = UserRole.SUPER_ADMIN;
            break;
          default:
            normalizedBookedBy = UserRole.CUSTOMER;
        }
      }

      const create = await PassengerModel.create({
        price: baseFare,
        user: userId,
        bookedBy: normalizedBookedBy,
        seatLabel: passenger.seatLabel,
        busId: getBus._id,
        for: forType,
        ticketNumber: `TKT-${Date.now()}-${i}`,
        groupTicketSerial: groupTicketSerial,
        fullName: passenger.fullName,
        gender: passenger.gender,
        dob: passenger.dob,
        contactNumber: passenger.contactNumber,
        DocumentId: passenger.DocumentId,
        type: TripType.ONE_WAY,
        From: (getRoutePrice as any)?.origin?.name || "Origin",
        To: (getRoutePrice as any)?.destination?.name || "Destination",
        DepartureDate: (getRoutePrice as any)?.departureTime || new Date(),
        ReturnDate: new Date(),
      });
      passengersDB.push(create);
    }

    // Update bus seat status to BOOKED using departure date service
    for (const passenger of passengersData) {
      if (!passenger.seatLabel) continue; // Skip if seatLabel is undefined
      
      // Book the seat for the specific departure date
      const bookingResult = await departureDateSeatService.bookSeatForDate(
        getBus._id?.toString() || busId,
        passenger.seatLabel,
        new Date(departureDate || new Date()),
        userId,
        passengersDB.find(p => p.seatLabel === passenger.seatLabel)?._id?.toString() || ''
      );
      
      if (!bookingResult.success) {
        console.error(`Failed to book seat ${passenger.seatLabel}:`, bookingResult.reason);
      }

      // Delete the Redis hold for this seat since it's now permanently booked
      const holdKey = RedisKeys.seatHold(routeId, passenger.seatLabel);
      await redis.del(holdKey);
      
      // Remove from user holds set
      await redis.srem(RedisKeys.userHolds(userId), `${routeId}:${passenger.seatLabel}`);

      // Emit seat status change to all users in the route room
      io.to(`route:${routeId}`).emit('seat:status:changed', {
        routeId: routeId,
        seatLabel: passenger.seatLabel,
        status: SeatStatus.BOOKED,
        userId: userId,
        busId: busId
      });
      io.to(`route:${routeId}:${departureDate}`).emit('seat:status:changed', {
        routeId: routeId,
        seatLabel: passenger.seatLabel,
        status: SeatStatus.BOOKED,
        userId: userId,
        busId: busId,
        departureDate: departureDate
      });
    }

    // Queue bus capacity check and send notification to admins if >= 90% (non-blocking)
    // IMPORTANT: This runs AFTER passengers are created and seats are booked
    try {
      console.log('🔍 Queueing bus capacity check after payment confirmation...');
      await tripReminderService.queueBusCapacityCheckForBooking(
        getBus._id?.toString() || busId,
        routeId,
        new Date(departureDate || new Date())
      );
    } catch (capacityError) {
      console.error('Error queueing bus capacity check:', capacityError);
      // Don't fail the booking if capacity check queueing fails
    }

    // Generate individual QR codes for each passenger/seat
    const passengersWithQR = [];
    const pricePerSeat = (paymentIntent.amount / 100) / passengersData.length;
    
    for (const passenger of passengersDB) {
      // Create QR code data for individual passenger
      const qrCodeData = QRCodeUtils.createBookingQRData({
        ticketNumber: passenger.ticketNumber,
        // userId: userId,
        // routeId: routeId,
        // busId: getBus._id?.toString() || busId,
        // passengers: [passenger], // Single passenger
        // routeInfo: {
        //   from: (getRoutePrice as any)?.origin?.name || "Origin",
        //   to: (getRoutePrice as any)?.destination?.name || "Destination",
        //   departureDate: (getRoutePrice as any)?.departureTime || new Date(),
        //   returnDate: new Date()
        // },
        // paymentType: "stripe",
        // totalPrice: pricePerSeat,
        // groupTicketSerial: groupTicketSerial || undefined
      });

      // Generate QR code as base64 string for this passenger
      const qrCodeBase64 = await QRCodeUtils.generateQRCodeAsBase64(qrCodeData);

      // Save QR code to passenger record in database
      passenger.qrCode = qrCodeBase64;
      await passenger.save();

      // Add QR code to passenger data
      passengersWithQR.push({
        ...passenger.toObject(),
        qrCode: {
          data: qrCodeBase64,
          bookingId: qrCodeData.ticketNumber,
          format: "base64"
        }
      });
    }

    // Create payment transaction record
    await PaymentTransaction.create({
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      gateway: PaymentGateway.STRIPE,
      gatewayResponse: paymentIntent,
      transactionId: paymentIntent.id,
      status: TransactionStatus.SUCCEEDED,
      createdBy: userId
    });

    // Clean up passengers data from Redis since booking is complete
    if (metadata.passengersRedisKey) {
      await redis.del(metadata.passengersRedisKey);
    }

    // Queue booking confirmation and payment receipt notifications (non-blocking)
    try {
      const seatNumbers = passengersData.map((p: any) => p.seatLabel);
      
      // Queue booking confirmation notification (processed in background)
      await notificationService.queueBookingConfirmation(
        userId,
        {
          bookingRef: groupTicketSerial || passengersDB[0].ticketNumber,
          origin: (getRoutePrice as any)?.origin?.name || "Origin",
          destination: (getRoutePrice as any)?.destination?.name || "Destination",
          departureTime: new Date(departureDate || new Date()),
          seatNumbers: seatNumbers,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          bookingId: (passengersDB[0] as any)._id.toString(),
          tripId: routeId,
          routeId: routeId
        }
      );

      // Queue payment receipt notification (processed in background)
      await notificationService.queuePaymentReceipt(
        userId,
        {
          bookingRef: groupTicketSerial || passengersDB[0].ticketNumber,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          paymentId: paymentIntent.id,
          bookingId: (passengersDB[0] as any)._id.toString()
        }
      );

      console.log('✅ Booking and payment notifications queued successfully');
    } catch (notifError) {
      console.error('❌ Error queueing notifications:', notifError);
      // Don't fail the booking if notification queueing fails
    }
// 
    // Return the same response format as cash payment
    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        passengers: passengersWithQR,
        type: "stripe",
        bookingsCount: passengersData.length,
        groupTicketSerial: groupTicketSerial,
        paymentIntentId: paymentIntentId,
        message: `Generated ${passengersWithQR.length} individual QR code(s)`
      },
      AUTH_CONSTANTS.BOOKING_SUCCESS
    );

  } catch (error: any) {
    console.error('Error confirming Stripe payment:', error);
    return ResponseUtil.errorResponse(
      res,
      500,
      error.message || "Failed to confirm payment"
    );
  }
};
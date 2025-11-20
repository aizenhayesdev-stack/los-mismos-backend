import { Response } from "express";
import { CustomError } from "../classes/CustomError";
import { CustomRequest } from "../interfaces/auth";
import ResponseUtil from "../utils/Response/responseUtils";
import seatBookingService from "../services/seatBooking.service";
import { STATUS_CODES } from "../constants/statusCodes";
import { AUTH_CONSTANTS } from "../constants/messages";
import RouteModel from "../models/route.model";
import { createPaymentIntent } from "../utils/Stripe/stripe";
import BusModel from "../models/bus.model";
import PassengerModel from "../models/passenger.models";
import { QRCodeUtils } from "../utils/QRCode";
import { ForWho, SeatStatus, TripType, UserRole, TicketStatus } from "../models/common/types";
import { io } from "../server";
import AuthModel from "../models/auth.model";
import { redis, RedisKeys } from "../config/redis";
import { Profile } from "../models";
import helper from "../helper";
import { TicketPDFGenerator, TicketPDFData } from "../utils/PDF/ticketPDFGenerator";
import { calculatePassengerFare, calculateFare } from "../utils/pricing";
import { departureDateSeatService } from "../services/departure-date-seat.service";
import tripReminderService from "../services/trip-reminder.service";

export const bookSeats = async (req: CustomRequest, res: Response) => {
  try {
    let { routeId, busId, paymentType, passengers, tripType, bookedBy = UserRole.CUSTOMER, additionalBaggage, roundTripDate, departureDate } = req.body;



    const userId = req.authId;
    if (!userId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "User not found");
    }

    const user = await AuthModel.findById(userId).populate({ path: 'profile', select: 'office', populate: { path: 'office', select: 'name' } });
    const office = (user?.profile as any)?.office?.name;
    const salesOffice = (user?.profile as any)?.office?._id;
    bookedBy = user?.role as UserRole;

    // Validate roundTripDate for round trip bookings
    if (tripType === TripType.ROUND_TRIP && !roundTripDate) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Return date is required for round trip bookings");
    }

    // Validate roundTripDate is in the future
    if (tripType === TripType.ROUND_TRIP && roundTripDate) {
      const returnDate = new Date(roundTripDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (returnDate < today) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Return date must be in the future");
      }
    }

    // const user = await AuthModel.findById(authId);
    // const userId = user?.profile?.toString() || "";
    const getRoutPrice = await RouteModel.findById(routeId).populate('destination origin');
    const getBus = await BusModel.findById(busId);
    if (!getBus) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Bus not found");
    }

    // For round trip, find the return route (destination to origin)
    let returnRoute = null;
    if (tripType === TripType.ROUND_TRIP) {
      returnRoute = await RouteModel.findOne({
        origin: getRoutPrice?.destination,
        destination: getRoutPrice?.origin,
        isActive: true
      }).populate('destination origin bus');

      if (!returnRoute) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Return route not found for this destination");
      }
    }
    // Get seat labels from passengers data
    const seatLabels = passengers.map((p: any) => p.seatLabel);

    // Get the actual seat objects from bus
    const getSeats = getBus.seatLayout.seats;
    const getUserSeats = getSeats.filter((seat) => seatLabels.includes(seat.seatLabel));

    // Validate that all requested seats exist
    if (getUserSeats.length !== passengers.length) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "One or more seats not found"
      );
    }

    // Helper function to check if a seat is booked for a specific date
    const isSeatBookedForDate = (seat: any, targetDate: Date): boolean => {
      if (!seat.departureDateBookings || seat.departureDateBookings.length === 0) {
        return false;
      }

      return seat.departureDateBookings.some((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        const queryDate = new Date(targetDate);
        return bookingDate.toDateString() === queryDate.toDateString() &&
          booking.status === 'BOOKED';
      });
    };

    // For round trip, validate return route seats availability
    let returnBus: any = null;
    let returnSeats: any[] = [];
    if (tripType === TripType.ROUND_TRIP && returnRoute) {
      returnBus = await BusModel.findById((returnRoute as any).bus);
      if (!returnBus) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Return bus not found");
      }
      returnSeats = returnBus.seatLayout.seats.filter((seat: any) => seatLabels.includes(seat.seatLabel));

      // Check if return seats are available for the return date
      const returnDate = new Date(roundTripDate);
      const unavailableReturnSeats = returnSeats.filter((seat: any) => {
        // Check if seat is booked for the specific return date
        return isSeatBookedForDate(seat, returnDate);
      });

      if (unavailableReturnSeats.length > 0) {
        const unavailableLabels = unavailableReturnSeats.map((s: any) => s.seatLabel).join(', ');
        return ResponseUtil.errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          `Return trip seats ${unavailableLabels} are not available for ${roundTripDate}`
        );
      }
    }

    // Check if outbound seats are available for the departure date
    const outboundDate = new Date(departureDate);
    const bookedOutboundSeats = getUserSeats.filter((seat) => {
      return isSeatBookedForDate(seat, outboundDate);
    });

    if (bookedOutboundSeats.length > 0) {
      const bookedSeatLabels = bookedOutboundSeats.map(s => s.seatLabel).join(', ');
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        `Seats ${bookedSeatLabels} are already booked for ${departureDate}`
      );
    }

    // Check if seats are held/selected by this user or available
    const invalidSeats = getUserSeats.filter((seat) => {
      // Seat must be either:
      // 1. Available (no userId)
      // 2. Held/Selected by the current user
      const isAvailableOrOwnedByUser =
        !seat.userId ||
        seat.userId.toString() === userId;

      return !isAvailableOrOwnedByUser;
    });

    if (invalidSeats.length > 0) {
      const seatLabelsInvalid = invalidSeats.map(s => s.seatLabel).join(', ');
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        `Seats ${seatLabelsInvalid} are already held or booked by another user`
      );
    }

    // Verify that user actually held these seats in Redis
    const notHeldSeats: string[] = [];
    const departureDateStr = departureDate ? new Date(departureDate).toISOString().split('T')[0] : undefined;

    for (const seatLabel of seatLabels) {
      // Use departure date in hold key if provided
      const holdKey = departureDateStr
        ? RedisKeys.seatHold(routeId, seatLabel, departureDateStr)
        : RedisKeys.seatHold(routeId, seatLabel);

      const holdData = await redis.get(holdKey);

      console.log(`🔍 Checking hold for seat ${seatLabel}: holdKey=${holdKey}, holdData=${holdData ? 'found' : 'not found'}`);

      if (!holdData) {
        // No hold found in Redis
        console.log(`❌ No hold found in Redis for seat ${seatLabel}`);
        notHeldSeats.push(seatLabel);
      } else {
        const hold = JSON.parse(holdData);
        // Check if hold belongs to this user and is not expired
        if (hold.userId !== userId) {
          console.log(`❌ Seat ${seatLabel} held by different user: ${hold.userId} !== ${userId}`);
          notHeldSeats.push(seatLabel);
        } else if (Date.now() > hold.expiresAt) {
          console.log(`❌ Seat ${seatLabel} hold expired: ${new Date(hold.expiresAt).toISOString()}`);
          notHeldSeats.push(seatLabel);
        } else {
          console.log(`✅ Seat ${seatLabel} is properly held by user ${userId}`);
        }
      }
    }

    if (notHeldSeats.length > 0) {
      const notHeldLabels = notHeldSeats.join(', ');
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        `You must hold seats ${notHeldLabels} before booking. Please select and hold the seats first.`
      );
    }

    // Calculate total price using the DFW hub pricing system
    const baseFare = await calculateFare(routeId, tripType);
    let getTotalPrice = (baseFare * passengers.length) + parseFloat(additionalBaggage || 0);


    // Queue bus capacity check for outbound trip (non-blocking)
    try {
      console.log('🔍 Queueing bus capacity check after booking completion...');
      await tripReminderService.queueBusCapacityCheckForBooking(
        getBus._id?.toString() || busId,
        routeId as string,
        new Date(departureDate),
        passengers.length
      );
    } catch (capacityError) {
      console.error('Error queueing bus capacity check for outbound trip:', capacityError);
      // Don't fail the booking if capacity check queueing fails
    }

    // Queue bus capacity check for return trip if round trip (non-blocking)
    if (tripType === TripType.ROUND_TRIP && returnBus && returnRoute) {
      try {
        await tripReminderService.queueBusCapacityCheckForBooking(
          returnBus._id?.toString() || (returnRoute as any).bus,
          returnRoute._id?.toString() || '',
          new Date(roundTripDate),
          passengers.length
        );
      } catch (capacityError) {
        console.error('Error queueing bus capacity check for return trip:', capacityError);
        // Don't fail the booking if capacity check queueing fails
      }
    }


    if (paymentType === "stripe") {
      // Add passengers data in redis with unique key and send that key in payment intent
      const { v4: uuidv4 } = require('uuid');
      const passengersRedisKey = `booking:passengers:${uuidv4()}`;
      await redis.set(passengersRedisKey, JSON.stringify(passengers), 'EX', 15 * 60); // expires in 15 min
      // 
      // Extend seat hold timer to give user enough time to complete payment (20 minutes)
      const extendedHoldDuration = 20 * 60; // 20 minutes in seconds
      // const extendedHoldDuration = 20 * 60; // 20 minutes in seconds
      for (const seatLabel of seatLabels) {
        const holdKey = RedisKeys.seatHold(routeId, seatLabel);
        const holdData = await redis.get(holdKey);

        if (holdData) {
          const hold = JSON.parse(holdData);
          // Update the expiration time
          hold.expiresAt = Date.now() + (extendedHoldDuration * 1000);
          await redis.setex(holdKey, extendedHoldDuration, JSON.stringify(hold));
        }
      }

      const paymentIntent = await createPaymentIntent(getTotalPrice + (getTotalPrice * 0.10), {
        routeId: routeId,
        userId: userId,
        bookedBy: bookedBy,
        office: office,
        salesOffice: salesOffice?.toString() || "",
        totalPrice: getTotalPrice + (getTotalPrice * 0.10),
        seats: getUserSeats.length,
        baseFare: baseFare,
        busId: getBus._id?.toString() || busId,
        // passengers: JSON.stringify(passengers),
        departureDate: departureDate,
        passengersRedisKey: passengersRedisKey,
        additionalBaggage: parseFloat(additionalBaggage || "0") * 4.6,
        tripType: tripType,
        returnRouteId: tripType === TripType.ROUND_TRIP ? returnRoute?._id?.toString() : undefined,
        returnBusId: tripType === TripType.ROUND_TRIP ? returnBus?._id?.toString() : undefined,
        roundTripDate: tripType === TripType.ROUND_TRIP ? roundTripDate : undefined,
      });

      // Return payment intent client secret to frontend
      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: getTotalPrice,
          bookingsCount: getUserSeats.length,
          data: req.body
        },
        "Payment intent created successfully"
      );
    }
    else if (paymentType === "points") {
      // Check if user has enough points
      const user = await AuthModel.findById(userId);
      if (!user) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "User not found");
      }
      if ((user.profile as any)?.refundAmount < getTotalPrice) {
        return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Insufficient points");
      }
      
    }
    else {
      let forType = ForWho.SELF;
      let groupTicketSerial = null
      const passengersDB = []
      if (passengers.length > 1) {
        forType = ForWho.FAMILY;
        groupTicketSerial = `TKT-${Date.now()}-${passengers.length}`;
      }
      if (tripType === TripType.ROUND_TRIP) {
        forType = ForWho.FAMILY;
        groupTicketSerial = `TKT-${Date.now()}-${passengers.length}-RT`;
      }

      // Create outbound trip passengers
      for (let i = 0; i < passengers.length; i++) {
        const passenger = passengers[i];

        const create = await PassengerModel.create({
          price: baseFare,
          user: userId,
          office: office,
          salesOffice: salesOffice,
          bookedBy: bookedBy, // Assuming user role
          seatLabel: passenger.seatLabel,
          busId: getBus._id?.toString() || busId,
          for: forType, // Assuming self booking
          ticketNumber: `TKT-${Date.now()}-${i}`,
          groupTicketSerial: groupTicketSerial,
          additionalBaggage: parseFloat(additionalBaggage || "0") * 4.6,
          fullName: passenger.fullName,
          gender: passenger.gender,
          dob: passenger.dob,
          contactNumber: passenger.contactNumber,
          DocumentId: passenger.DocumentId,
          type: tripType, // Assuming one way trip
          From: (getRoutPrice as any)?.origin?.name || "Origin",
          To: (getRoutPrice as any)?.destination?.name || "Destination",
          DepartureDate: new Date(departureDate),
          ReturnDate: tripType === TripType.ROUND_TRIP ? new Date(roundTripDate) : null, // Set appropriate return date
        });
        passengersDB.push(create)
      }

      // Create return trip passengers for round trip
      if (tripType === TripType.ROUND_TRIP && returnRoute && returnBus) {
        console.log('Creating return trip tickets for round trip booking');
        console.log('Return route:', returnRoute._id);
        console.log('Return bus:', returnBus._id);
        console.log('Passengers count:', passengers.length);

        for (let i = 0; i < passengers.length; i++) {
          const passenger = passengers[i];

          const returnPassenger = await PassengerModel.create({
            price: baseFare,
            user: userId,
            office: office,
            salesOffice: salesOffice,
            bookedBy: bookedBy,
            seatLabel: passenger.seatLabel,
            busId: returnBus._id?.toString() || returnRoute.bus,
            for: forType,
            ticketNumber: `TKT-${Date.now()}-${i}-RT`,
            departureDate: new Date(roundTripDate),
            groupTicketSerial: groupTicketSerial,
            additionalBaggage: parseFloat(additionalBaggage || "0") * 4.6,
            fullName: passenger.fullName,
            gender: passenger.gender,
            dob: passenger.dob,
            contactNumber: passenger.contactNumber,
            DocumentId: passenger.DocumentId,
            type: tripType,
            From: (returnRoute as any)?.origin?.name || "Origin",
            To: (returnRoute as any)?.destination?.name || "Destination",
            DepartureDate: new Date(roundTripDate),
            ReturnDate: null, // Return trip doesn't have a return date
          });
          console.log('Created return ticket:', returnPassenger.ticketNumber);
          passengersDB.push(returnPassenger);
        }
      } else {
        console.log('Round trip conditions not met:');
        console.log('tripType === TripType.ROUND_TRIP:', tripType === TripType.ROUND_TRIP);
        console.log('returnRoute exists:', !!returnRoute);
        console.log('returnBus exists:', !!returnBus);
      }

      // Update outbound bus seat status to BOOKED using departure date service
      for (const passenger of passengersDB) {
        if (!passenger.seatLabel) continue; // Skip if seatLabel is undefined

        // Book the seat for the specific departure date
        const bookingResult = await departureDateSeatService.bookSeatForDate(
          getBus._id?.toString() || busId,
          passenger.seatLabel,
          new Date(departureDate),
          userId as string,
          passenger._id?.toString() || ''
        );

        if (!bookingResult.success) {
          console.error(`Failed to book seat ${passenger.seatLabel}:`, bookingResult.reason);
        }

        // Delete the Redis hold for this seat since it's now permanently booked
        const departureDateStr = new Date(departureDate).toISOString().split('T')[0];
        const holdKey = RedisKeys.seatHold(routeId as string, passenger.seatLabel, departureDateStr);
        await redis.del(holdKey);

        // Remove from user holds set
        await redis.srem(RedisKeys.userHolds(userId as string), `${routeId}:${passenger.seatLabel}:${departureDateStr}`);

        // Emit seat status change to all users in the route room
        //v1
        io.to(`route:${routeId}`).emit('seat:status:changed', {
          routeId: routeId,
          seatLabel: passenger.seatLabel,
          status: SeatStatus.BOOKED,
          userId: userId,
          busId: busId,
          departureDate: departureDateStr
        });
        //v2
        io.to(`route:${routeId}:${departureDate}`).emit('seat:status:changed', {
          routeId: routeId,
          seatLabel: passenger.seatLabel,
          status: SeatStatus.BOOKED,
          userId: userId,
          busId: busId,
          departureDate: departureDateStr
        });
      }

      // Update return trip bus seat status to BOOKED for round trip
      if (tripType === TripType.ROUND_TRIP && returnBus && passengersDB.length > 0) {
        const returnPassengers = passengersDB.filter(p => p.ticketNumber?.includes('-RT'));
        const returnDateStr = new Date(roundTripDate).toISOString().split('T')[0];

        for (const passenger of returnPassengers) {
          if (!passenger.seatLabel) continue; // Skip if seatLabel is undefined

          // Book the seat for the specific return date
          const bookingResult = await departureDateSeatService.bookSeatForDate(
            returnBus._id?.toString() || (returnRoute as any).bus,
            passenger.seatLabel,
            new Date(roundTripDate),
            userId as string,
            passenger._id?.toString() || ''
          );

          if (!bookingResult.success) {
            console.error(`Failed to book return seat ${passenger.seatLabel}:`, bookingResult.reason);
          }

          // Emit seat status change for return route
          //v1
          io.to(`route:${returnRoute?._id}`).emit('seat:status:changed', {
            routeId: returnRoute?._id,
            seatLabel: passenger.seatLabel,
            status: SeatStatus.BOOKED,
            userId: userId,
            busId: returnBus._id,
            departureDate: returnDateStr
          });
          //v2
          io.to(`route:${returnRoute?._id}:${roundTripDate}`).emit('seat:status:changed', {
            routeId: returnRoute?._id,
            seatLabel: passenger.seatLabel,
            status: SeatStatus.BOOKED,
            userId: userId,
            busId: returnBus._id,
            departureDate: returnDateStr
          });
        }
      }

      // Check bus capacity and send notification to admins if >= 90%
      // IMPORTANT: This must run AFTER passengers are created and seats are booked
      // Check for outbound trip


      // Generate individual QR codes for each passenger/seat
      const passengersWithQR = [];
      for (const passenger of passengersDB) {
        // Determine if this is a return trip passenger
        const isReturnTrip = passenger.ticketNumber?.includes('-RT');
        const currentRoute = isReturnTrip ? returnRoute : getRoutPrice;
        const currentBus = isReturnTrip ? returnBus : getBus;

        // Create QR code data for individual passenger
        const qrCodeData = QRCodeUtils.createBookingQRData({
          ticketNumber: passenger.ticketNumber,
          // userId: userId,
          // routeId: isReturnTrip ? returnRoute?._id?.toString() : routeId,
          // busId: currentBus?._id?.toString() || (isReturnTrip ? returnRoute?.bus : busId),
          // passengers: [passenger], // Single passenger
          // routeInfo: {
          //   from: (currentRoute as any)?.origin?.name || "Origin",
          //   to: (currentRoute as any)?.destination?.name || "Destination",
          //   departureDate: isReturnTrip ? new Date(roundTripDate) : ((getRoutPrice as any)?.departureTime || new Date()),
          //   returnDate: tripType === TripType.ROUND_TRIP ? new Date(roundTripDate) : null,
          //   isReturnTrip: isReturnTrip
          // },
          // paymentType: paymentType,
          // totalPrice: (getRoutPrice?.destination as any)?.priceFromDFW * (tripType === TripType.ROUND_TRIP ? 2 : 1),
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
          },
          isReturnTrip: isReturnTrip
        });
      }

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        {
          passengers: passengersWithQR,
          type: paymentType,
          bookingsCount: getUserSeats.length,
          groupTicketSerial: groupTicketSerial,
          tripType: tripType,
          returnTripInfo: tripType === TripType.ROUND_TRIP ? {
            returnRouteId: returnRoute?._id,
            returnDate: roundTripDate,
            returnFrom: (returnRoute as any)?.origin?.name,
            returnTo: (returnRoute as any)?.destination?.name
          } : null,
          message: `Generated ${passengersWithQR.length} individual QR code(s)${tripType === TripType.ROUND_TRIP ? ' for round trip' : ''}`
        },
        AUTH_CONSTANTS.BOOKING_SUCCESS
      );
    }

  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const getBookingHistory = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.authId;
    if (!userId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "User not found");
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const query = { user: userId };
    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 } as Record<string, 1 | -1>,
    };
    const bookings = await helper.PaginateHelper.customPaginate("bookings", PassengerModel, query, options);
    // const bookings = await Booking.find({ user: userId }).sort({ createdAt: -1 });
    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { bookings },
      "Bookings fetched successfully"
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const getLatestBooking = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.authId;
    if (!userId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "User not found");
    }
    const latestBooking = await PassengerModel.findOne({ user: userId }).sort({ createdAt: -1 });

    if (!latestBooking) {
      // return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "No bookings found");
      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { latestBooking: [] },
        "No bookings found"
      );
    }

    // Check if it's a family booking
    if (latestBooking?.for === ForWho.FAMILY) {
      const getAllFamilyLatestBooking = await PassengerModel.find({ groupTicketSerial: latestBooking.groupTicketSerial })

      // Check if any of the family tickets are round trip
      const hasRoundTrip = getAllFamilyLatestBooking.some(ticket => ticket.type === TripType.ROUND_TRIP);

      if (hasRoundTrip) {
        // For round trip family bookings, separate outbound and return tickets
        const outboundTickets = getAllFamilyLatestBooking.filter(ticket => !ticket.ticketNumber.includes('-RT'));
        const returnTickets = getAllFamilyLatestBooking.filter(ticket => ticket.ticketNumber.includes('-RT'));

        return ResponseUtil.successResponse(
          res,
          STATUS_CODES.SUCCESS,
          {
            latestBooking: getAllFamilyLatestBooking,
            tripType: 'round_trip_family',
            outboundTickets,
            returnTickets,
            groupTicketSerial: latestBooking.groupTicketSerial
          },
          "Latest round trip family booking fetched successfully"
        );
      } else {
        return ResponseUtil.successResponse(
          res,
          STATUS_CODES.SUCCESS,
          { latestBooking: getAllFamilyLatestBooking },
          "Latest family booking fetched successfully"
        );
      }
    }

    // Check if it's a round trip (single passenger)
    if (latestBooking?.type === TripType.ROUND_TRIP) {
      const groupTicketSerial = latestBooking.groupTicketSerial;
      if (groupTicketSerial) {
        const allRoundTripTickets = await PassengerModel.find({
          groupTicketSerial: groupTicketSerial,
          user: userId
        }).sort({ ticketNumber: 1 });

        const outboundTickets = allRoundTripTickets.filter(ticket => !ticket.ticketNumber.includes('-RT'));
        const returnTickets = allRoundTripTickets.filter(ticket => ticket.ticketNumber.includes('-RT'));

        return ResponseUtil.successResponse(
          res,
          STATUS_CODES.SUCCESS,
          {
            latestBooking: allRoundTripTickets,
            tripType: 'round_trip',
            outboundTickets,
            returnTickets,
            groupTicketSerial
          },
          "Latest round trip booking fetched successfully"
        );
      }
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { latestBooking: [latestBooking] },
      "Latest booking fetched successfully"
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};
export const printTicket = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.authId;
    const ticketNumber = req.params.ticketNumber;

    if (!ticketNumber) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Ticket ID not found");
    }

    // Find the ticket
    const ticket = await PassengerModel.findOne({ ticketNumber: ticketNumber })
      .populate('user')
      .populate('busId');

    if (!ticket) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Ticket not found");
    }

    // Verify user has access to this ticket
    // if(ticket.user.toString() !== userId) {
    //   return ResponseUtil.errorResponse(res, STATUS_CODES.FORBIDDEN, "Access denied to this ticket");
    // }

    let ticketsToPrint = [ticket];

    // If it's a family booking, get all related tickets
    if (ticket.for === ForWho.FAMILY && ticket.groupTicketSerial) {
      const familyTickets = await PassengerModel.find({
        groupTicketSerial: ticket.groupTicketSerial
      }).populate('user').populate('busId');

      ticketsToPrint = familyTickets;
    }

    // If it's a round trip booking (single or family), get both outbound and return tickets
    if (ticket.type === TripType.ROUND_TRIP && ticket.groupTicketSerial) {
      const roundTripTickets = await PassengerModel.find({
        groupTicketSerial: ticket.groupTicketSerial,
        user: ticket.user
      }).populate('user').populate('busId');

      ticketsToPrint = roundTripTickets;
    }

    // Get route information - we need to find the route by busId
    const route = await RouteModel.findOne({ bus: ticket.busId })
      .populate('origin')
      .populate('destination');

    if (!route) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Route information not found");
    }

    // Generate PDF tickets
    const pdfGenerator = new TicketPDFGenerator();

    const ticketsData: TicketPDFData[] = ticketsToPrint.map(ticketData => ({
      passenger: ticketData,
      routeInfo: {
        from: (route as any).origin?.name || ticketData.From,
        to: (route as any).destination?.name || ticketData.To,
        departureDate: ticketData.DepartureDate,
        returnDate: ticketData.ReturnDate || undefined
      },
      busInfo: {
        busNumber: (ticketData.busId as any)?.busNumber || 'N/A',
        driverName: (ticketData.busId as any)?.driverName || undefined
      },
      companyInfo: {
        name: "Los Mismos Travels",
        // address: "123 Main Street, City, State 12345",
        // phone: "+1 (555) 123-4567",
        // email: "info@yourbuscompany.com"
      }
    }));

    let pdfBuffer: Buffer;

    if (ticketsData.length === 1) {
      // Single ticket
      pdfBuffer = await pdfGenerator.generateTicket(ticketsData[0]);
    } else {
      // Multiple tickets (family booking)
      pdfBuffer = await pdfGenerator.generateMultipleTickets(ticketsData);
    }

    // Set response headers for PDF download
    const filename = ticketsData.length === 1
      ? `ticket-${ticketNumber}.pdf`
      : `tickets-${ticket.groupTicketSerial}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send the PDF
    res.send(pdfBuffer);

  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const searchTickets = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.authId;
    const ticketNumber = req.params.ticketNumber;

    if (!ticketNumber) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Ticket ID not found");
    }
    const ticket = await PassengerModel.findOne({ ticketNumber: ticketNumber });
    if (!ticket) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Ticket not found");
    }

    // Check if it's a family booking
    if (ticket.for === ForWho.FAMILY) {
      const familyTickets = await PassengerModel.find({ groupTicketSerial: ticket.groupTicketSerial });

      // Check if any of the family tickets are round trip
      const hasRoundTrip = familyTickets.some(t => t.type === TripType.ROUND_TRIP);

      if (hasRoundTrip) {
        // For round trip family bookings, separate outbound and return tickets
        const outboundTickets = familyTickets.filter(t => !t.ticketNumber.includes('-RT'));
        const returnTickets = familyTickets.filter(t => t.ticketNumber.includes('-RT'));

        return ResponseUtil.successResponse(
          res,
          STATUS_CODES.SUCCESS,
          {
            familyTickets,
            tripType: 'round_trip_family',
            outboundTickets,
            returnTickets,
            groupTicketSerial: ticket.groupTicketSerial
          },
          "Round trip family tickets fetched successfully"
        );
      } else {
        return ResponseUtil.successResponse(
          res,
          STATUS_CODES.SUCCESS,
          { familyTickets },
          "Family tickets fetched successfully"
        );
      }
    }

    // Check if it's a round trip (single passenger)
    if (ticket.type === TripType.ROUND_TRIP && ticket.groupTicketSerial) {
      const roundTripTickets = await PassengerModel.find({
        groupTicketSerial: ticket.groupTicketSerial,
        user: ticket.user
      });

      const outboundTickets = roundTripTickets.filter(t => !t.ticketNumber.includes('-RT'));
      const returnTickets = roundTripTickets.filter(t => t.ticketNumber.includes('-RT'));

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        {
          ticket: roundTripTickets,
          tripType: 'round_trip',
          outboundTickets,
          returnTickets,
          groupTicketSerial: ticket.groupTicketSerial
        },
        "Round trip tickets fetched successfully"
      );
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { ticket },
      "Ticket fetched successfully"
    );
  }
  catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const cancelBooking = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.authId;
    const { ticketNumber, reason, type } = req.body;

    if (!userId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "User not found");
    }

    if (!ticketNumber) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Ticket number is required");
    }

    // Find the ticket
    const ticket = await PassengerModel.findOne({
      ticketNumber: ticketNumber,
      user: userId
    });

    if (!ticket) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Ticket not found or you don't have permission to cancel this ticket");
    }

    // Check if ticket is already cancelled
    if (ticket.isCancelled) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Ticket is already cancelled");
    }

    // Check if ticket is already used/checked in
    if (ticket.alreadyScanned) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Cannot cancel a ticket that has already been used");
    }

    // Check if departure date has passed (allow cancellation up to 1 hour before departure)
    const departureDate = new Date(ticket.DepartureDate);
    const oneHourBeforeDeparture = new Date(departureDate.getTime() - (60 * 60 * 1000));
    const now = new Date();

    if (now > oneHourBeforeDeparture) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Cannot cancel ticket less than 1 hour before departure");
    }

    // Get all related tickets (for family or round trip bookings)
    let ticketsToCancel = [ticket];

    if (type === "All") {
      if (ticket.for === ForWho.FAMILY && ticket.groupTicketSerial) {
        const familyTickets = await PassengerModel.find({
          groupTicketSerial: ticket.groupTicketSerial,
          user: userId
        });
        ticketsToCancel = familyTickets;
      } else if (ticket.type === TripType.ROUND_TRIP && ticket.groupTicketSerial) {
        const roundTripTickets = await PassengerModel.find({
          groupTicketSerial: ticket.groupTicketSerial,
          user: userId
        });
        ticketsToCancel = roundTripTickets;
      }
    }

    // Cancel all related tickets
    const cancelledTickets = [];
    let totalRefundAmount = 0;

    for (const ticketToCancel of ticketsToCancel) {
      // Update ticket status
      ticketToCancel.isCancelled = true;
      ticketToCancel.status = TicketStatus.REVOKED;
      await ticketToCancel.save();

      // Calculate individual ticket price using the DFW hub pricing system
      const ticketPrice = await calculatePassengerFare(ticketToCancel);
      totalRefundAmount += ticketPrice;

      // Update bus seat status back to available
      await BusModel.updateOne(
        {
          _id: ticketToCancel.busId,
          "seatLayout.seats.seatLabel": ticketToCancel.seatLabel
        },
        {
          $set: {
            "seatLayout.seats.$.status": SeatStatus.AVAILABLE,
            "seatLayout.seats.$.isAvailable": true,
            "seatLayout.seats.$.userId": null
          },
          $inc: { totalBookedSeats: -1 }
        }
      );

      // Emit seat status change to all users in the route room
      const route = await RouteModel.findOne({ bus: ticketToCancel.busId });
      if (route) {
        io.to(`route:${route._id}`).emit('seat:status:changed', {
          routeId: route._id,
          seatLabel: ticketToCancel.seatLabel,
          status: SeatStatus.AVAILABLE,
          userId: null,
          busId: ticketToCancel.busId
        });
      }

      cancelledTickets.push({
        ticketNumber: ticketToCancel.ticketNumber,
        seatLabel: ticketToCancel.seatLabel,
        fullName: ticketToCancel.fullName,
        isReturnTrip: ticketToCancel.ticketNumber.includes('-RT')
      });
    }

    // Update user's refund amount
    if (totalRefundAmount > 0) {
      await Profile.updateOne(
        { auth: userId },
        { $inc: { refundAmount: totalRefundAmount } }
      );
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        cancelledTickets,
        totalCancelled: cancelledTickets.length,
        groupTicketSerial: ticket.groupTicketSerial,
        reason: reason || "No reason provided"
      },
      `Successfully cancelled ${cancelledTickets.length} ticket(s)`
    );

  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};
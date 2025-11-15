import { Request, Response } from "express";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from "../config/environment";
import ResponseUtil from "../utils/Response/responseUtils";
import { STATUS_CODES } from "../constants/statusCodes";
import BusModel from "../models/bus.model";
import PassengerModel from "../models/passenger.models";
import RouteModel from "../models/route.model";
import PaymentTransaction from "../models/payment-transaction.model";
import { QRCodeUtils } from "../utils/QRCode";
import { SeatStatus, PaymentGateway, TransactionStatus } from "../models/common/types";
import { io } from "../server";
import notificationService from "../services/notification.service";
import tripReminderService from "../services/trip-reminder.service";

const stripe = new Stripe(STRIPE_SECRET_KEY as string);

/**
 * Handle Stripe webhook events
 * This controller processes payment events from Stripe and completes the booking
 */
export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      // Check if this is extra baggage payment or regular booking
      if (paymentIntent.metadata.type === 'extra_baggage') {
        await handleExtraBaggagePaymentSuccess(paymentIntent);
      } else {
        await handlePaymentSuccess(paymentIntent);
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object as Stripe.PaymentIntent;
      // Check if this is extra baggage payment or regular booking
      if (failedPayment.metadata.type === 'extra_baggage') {
        await handleExtraBaggagePaymentFailure(failedPayment);
      } else {
        await handlePaymentFailure(failedPayment);
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
};

/**
 * Handle successful payment
 * Creates passenger records, updates seat status, and generates QR code
 */
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  try {
    console.log('Payment succeeded:', paymentIntent.id);
    
    // Extract metadata from payment intent
    const metadata = paymentIntent.metadata;
    const userId = metadata.userId;
    const routeId = metadata.routeId;
    const busId = metadata.busId;
    const passengersRedisKey = metadata.passengersRedisKey;
    const additionalBaggage = metadata.additionalBaggage ? parseFloat(metadata.additionalBaggage) : 0;
    const tripType = metadata.tripType || "one_way";
    const returnRouteId = metadata.returnRouteId;
    const returnBusId = metadata.returnBusId;
    const roundTripDate = metadata.roundTripDate;
    const departureDate = metadata.departureDate;
    const office = metadata.office;
    const bookedBy = metadata.bookedBy;
    const salesOffice = metadata.salesOffice;
    if (!userId || !routeId || !busId) {
      console.error('Missing required metadata in payment intent');
      return;
    }

    // Get passengers data from Redis
    const redis = require('../config/redis').redis;
    const passengersDataStr = await redis.get(passengersRedisKey);
    if (!passengersDataStr) {
      console.error('Passengers data not found in Redis');
      return;
    }
    const passengersData = JSON.parse(passengersDataStr);

    // Get route and bus information
    const getRoutePrice = await RouteModel.findById(routeId).populate('origin destination');
    const getBus = await BusModel.findById(busId);

    if (!getBus) {
      console.error('Bus not found:', busId);
      return;
    }

    // For round trip, get return route information
    let returnRoute = null;
    let returnBus = null;
    if(tripType === "round_trip" && returnRouteId && returnBusId) {
      returnRoute = await RouteModel.findById(returnRouteId).populate('origin destination');
      returnBus = await BusModel.findById(returnBusId);
      
      if(!returnRoute || !returnBus) {
        console.error('Return route or bus not found for round trip');
        return;
      }
    }

    // Determine booking type
    let forType = "SELF";
    let groupTicketSerial = null;
    const passengersDB = [];

    if (passengersData.length > 1) {
      forType = "FAMILY";
      groupTicketSerial = `TKT-${Date.now()}-${passengersData.length}`;
    }
    if(tripType === "round_trip" && returnRoute && returnBus) {
      groupTicketSerial = `TKT-${Date.now()}-${passengersData.length}-RT`;
    }

    // Get seat labels from passengers data
    const seatLabels = passengersData.map((p: any) => p.seatLabel);
    const getSeats = getBus.seatLayout.seats;
    const getUserSeats = getSeats.filter((seat: any) => seatLabels.includes(seat.seatLabel));

    // Create outbound trip passenger records
    for (let i = 0; i < passengersData.length; i++) {
      const passenger = passengersData[i];

      const create = await PassengerModel.create({
        user: userId,
        bookedBy: bookedBy,
        seatLabel: passenger.seatLabel,
        office: office,
        salesOffice: salesOffice,
        busId: getBus._id,
        for: forType,
        departureDate: new Date(departureDate),
        ticketNumber: `TKT-${Date.now()}-${i}`,
        groupTicketSerial: groupTicketSerial,
        fullName: passenger.fullName,
        gender: passenger.gender,
        dob: passenger.dob,
        contactNumber: passenger.contactNumber,
        DocumentId: passenger.DocumentId,
        type: tripType,
        From: (getRoutePrice as any)?.origin?.name || "Origin",
        To: (getRoutePrice as any)?.destination?.name || "Destination",
        DepartureDate: (getRoutePrice as any)?.departureTime || new Date(),
        paymentIntentId: paymentIntent.id,
        ReturnDate: tripType === "round_trip" ? new Date(roundTripDate) : null,
        additionalBaggage: additionalBaggage,
      });
      passengersDB.push(create);
    }

    // Create return trip passenger records for round trip
    if(tripType === "round_trip" && returnRoute && returnBus) {
      console.log('Creating return trip tickets in webhook for round trip booking');
      console.log('Return route:', returnRoute._id);
      console.log('Return bus:', returnBus._id);
      console.log('Passengers count:', passengersData.length);
      
      const returnSeats = returnBus.seatLayout.seats.filter((seat: any) => seatLabels.includes(seat.seatLabel));
      
      for (let i = 0; i < passengersData.length; i++) {
        const passenger = passengersData[i];
        
        const returnPassenger = await PassengerModel.create({
          user: userId,
          bookedBy: bookedBy,
          office: office,
          salesOffice: salesOffice,
          seatLabel: passenger.seatLabel,
          busId: returnBus._id,
          for: forType,
          ticketNumber: `TKT-${Date.now()}-${i}-RT`,
          groupTicketSerial: groupTicketSerial,
          fullName: passenger.fullName,
          gender: passenger.gender,
          dob: passenger.dob,
          contactNumber: passenger.contactNumber,
          DocumentId: passenger.DocumentId,
          type: tripType,
          From: (returnRoute as any)?.origin?.name || "Origin",
          To: (returnRoute as any)?.destination?.name || "Destination",
          DepartureDate: new Date(roundTripDate),
          paymentIntentId: paymentIntent.id,
          ReturnDate: null, // Return trip doesn't have a return date
          additionalBaggage: additionalBaggage,
        });
        console.log('Created return ticket in webhook:', returnPassenger.ticketNumber);
        passengersDB.push(returnPassenger);
      }
    } else {
      console.log('Round trip conditions not met in webhook:');
      console.log('tripType === "round_trip":', tripType === "round_trip");
      console.log('returnRoute exists:', !!returnRoute);
      console.log('returnBus exists:', !!returnBus);
    }

    // Update outbound bus seat status to BOOKED
    for (const seat of getUserSeats) {
      if (!seat.seatLabel) continue;
      
      await BusModel.updateOne(
        {
          _id: getBus._id,
          "seatLayout.seats.seatLabel": seat.seatLabel
        },
        {
          $set: {
            "seatLayout.seats.$.status": SeatStatus.BOOKED,
            "seatLayout.seats.$.isAvailable": false
          },
          $push: { 
            "seatLayout.seats.$.departureDate": new Date(departureDate),
            "bookedDateCount.$.date": new Date(departureDate),
            "bookedDateCount.$.count": 1,
          }
        }
      );

      // Emit seat status change to all users in the route room
      //v1
      io.to(`route:${routeId}`).emit('seat:status:changed', {
        routeId: routeId,
        seatLabel: seat.seatLabel,
        status: SeatStatus.BOOKED,
        userId: userId,
        busId: busId
      });
      //v2
      io.to(`route:${routeId}:${departureDate}`).emit('seat:status:changed', {
        routeId: routeId,
        seatLabel: seat.seatLabel,
        status: SeatStatus.BOOKED,
        userId: userId,
        busId: busId
      });
    }

    // Update return trip bus seat status to BOOKED for round trip
    if(tripType === "round_trip" && returnBus) {
      const returnSeats = returnBus.seatLayout.seats.filter((seat: any) => seatLabels.includes(seat.seatLabel));
      
      for (const seat of returnSeats) {
        if (!seat.seatLabel) continue;
        
        await BusModel.updateOne(
          {
            _id: returnBus._id,
            "seatLayout.seats.seatLabel": seat.seatLabel
          },
          {
            $set: {
              "seatLayout.seats.$.status": SeatStatus.BOOKED,
              "seatLayout.seats.$.isAvailable": false
            },
            $push: { 
              "seatLayout.seats.$.departureDate": new Date(roundTripDate),
              "bookedDateCount.$.date": new Date(roundTripDate),
              "bookedDateCount.$.count": 1,
            }
          }
        );

        // Emit seat status change for return route
        //v1
        io.to(`route:${returnRouteId}`).emit('seat:status:changed', {
          routeId: returnRouteId,
          seatLabel: seat.seatLabel,
          status: SeatStatus.BOOKED,
          userId: userId,
          busId: returnBusId
        });
        //v2
        io.to(`route:${returnRouteId}:${roundTripDate}`).emit('seat:status:changed', {
          routeId: returnRouteId,
          seatLabel: seat.seatLabel,
          status: SeatStatus.BOOKED,
          userId: userId,
          busId: returnBusId
        });
      }
    }

    // Queue bus capacity check and send notification to admins if >= 90% (non-blocking)
    // IMPORTANT: This runs AFTER passengers are created and seats are booked
    // Queue for outbound trip
    try {
      console.log('🔍 Queueing bus capacity check after webhook booking completion...');
      await tripReminderService.queueBusCapacityCheckForBooking(
        getBus._id?.toString() || busId,
        routeId,
        new Date(departureDate)
      );
    } catch (capacityError) {
      console.error('Error queueing bus capacity check for outbound trip:', capacityError);
      // Don't fail the booking if capacity check queueing fails
    }

    // Queue for return trip if round trip (non-blocking)
    if(tripType === "round_trip" && returnBus && returnRoute) {
      try {
        await tripReminderService.queueBusCapacityCheckForBooking(
          returnBus._id?.toString() || returnBusId,
          returnRouteId || '',
          new Date(roundTripDate)
        );
      } catch (capacityError) {
        console.error('Error queueing bus capacity check for return trip:', capacityError);
        // Don't fail the booking if capacity check queueing fails
      }
    }

    // Generate individual QR codes for each passenger/seat
    for (const passenger of passengersDB) {
      // Determine if this is a return trip passenger
      const isReturnTrip = passenger.ticketNumber?.includes('-RT');
      const currentRoute = isReturnTrip ? returnRoute : getRoutePrice;
      const currentBus = isReturnTrip ? returnBus : getBus;
      
      // Create QR code data for individual passenger
      const qrCodeData = QRCodeUtils.createBookingQRData({
        ticketNumber: passenger.ticketNumber,
          // userId: userId,
          // routeId: isReturnTrip ? returnRouteId : routeId,
          // busId: currentBus?._id?.toString() || (isReturnTrip ? returnBusId : busId),
          // passengers: [passenger], // Single passenger
          // routeInfo: {
          //   from: (currentRoute as any)?.origin?.name || "Origin",
          //   to: (currentRoute as any)?.destination?.name || "Destination",
          //   departureDate: isReturnTrip ? new Date(roundTripDate) : ((getRoutePrice as any)?.departureTime || new Date()),
          //   returnDate: tripType === "round_trip" ? new Date(roundTripDate) : null,
          //   isReturnTrip: isReturnTrip
          // },
          // paymentType: "stripe",
          // totalPrice: paymentIntent.amount / 100, // Convert from cents
          // groupTicketSerial: groupTicketSerial || undefined
      });

      // Generate QR code as base64 string for this passenger
      const qrCodeBase64 = await QRCodeUtils.generateQRCodeAsBase64(qrCodeData);

      // Save QR code to passenger record in database
      passenger.qrCode = qrCodeBase64;
      await passenger.save();
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

    // Clean up Redis data
    await redis.del(passengersRedisKey);

    console.log('Booking completed successfully for payment:', paymentIntent.id);
    console.log('Passengers created:', passengersDB.length);
    console.log('Trip type:', tripType);

    // Queue booking confirmation and payment receipt notifications (non-blocking)
    try {
      const seatNumbers = passengersData.map((p: any) => p.seatLabel);
      const firstPassenger = passengersDB[0];
      
      // Queue booking confirmation notification (processed in background)
      await notificationService.queueBookingConfirmation(
        userId,
        {
          bookingRef: groupTicketSerial || firstPassenger.ticketNumber,
          origin: (getRoutePrice as any)?.origin?.name || "Origin",
          destination: (getRoutePrice as any)?.destination?.name || "Destination",
          departureTime: new Date(departureDate),
          seatNumbers: seatNumbers,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          bookingId: (firstPassenger._id as any).toString(),
          tripId: routeId,
          routeId: routeId
        }
      );

      // Queue payment receipt notification (processed in background)
      await notificationService.queuePaymentReceipt(
        userId,
        {
          bookingRef: groupTicketSerial || firstPassenger.ticketNumber,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          paymentId: paymentIntent.id,
          bookingId: (firstPassenger._id as any).toString()
        }
      );

      console.log('✅ Booking and payment notifications queued successfully');
    } catch (notifError) {
      console.error('❌ Error queueing notifications:', notifError);
      // Don't fail the booking if notification queueing fails
    }

  } catch (error) {
    console.error('Error handling payment success:', error);
  }
}

/**
 * Handle failed payment
 * Releases held seats and logs the failure
 */
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  try {
    console.log('Payment failed:', paymentIntent.id);
    
    const metadata = paymentIntent.metadata;
    const userId = metadata.userId;
    const busId = metadata.busId;
    const seatsData = metadata.seats ? JSON.parse(metadata.seats) : [];

    if (!busId || !seatsData.length) {
      console.error('Missing required metadata for payment failure handling');
      return;
    }

    // Release seats back to available
    const getBus = await BusModel.findById(busId);
    if (getBus) {
      for (const seat of seatsData) {
        await BusModel.updateOne(
          {
            _id: getBus._id,
            "seatLayout.seats.seatLabel": seat.seatLabel,
            "seatLayout.seats.userId": userId
          },
          {
            $set: {
              "seatLayout.seats.$.status": SeatStatus.AVAILABLE,
              "seatLayout.seats.$.isAvailable": true,
              "seatLayout.seats.$.userId": null
            }
          }
        );
      }
    }

    // Create payment transaction record for failed payment
    await PaymentTransaction.create({
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      gateway: PaymentGateway.STRIPE,
      gatewayResponse: paymentIntent,
      transactionId: paymentIntent.id,
      status: TransactionStatus.FAILED,
      createdBy: userId
    });

    console.log('Seats released for failed payment:', paymentIntent.id);

    // TODO: Send notification to user about payment failure

  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
}

/**
 * Handle successful extra baggage payment
 * Updates passenger record with extra baggage information
 */
async function handleExtraBaggagePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  try {
    console.log('Extra baggage payment succeeded:', paymentIntent.id);
    
    const metadata = paymentIntent.metadata;
    const passengerId = metadata.passengerId;
    const ticketNumber = metadata.ticketNumber;
    const baggageWeight = metadata.baggageWeight;
    const baggageAmount = metadata.baggageAmount;
    const driverId = metadata.driverId;
    const tripType = metadata.tripType || "one_way";
    const isReturnTrip = metadata.isReturnTrip === "true";
    const groupTicketSerial = metadata.groupTicketSerial;

    if (!passengerId || !ticketNumber) {
      console.error('Missing required metadata for extra baggage payment');
      return;
    }

    // Update passenger record with extra baggage details
    const updatedPassenger = await PassengerModel.findByIdAndUpdate(
      passengerId,
      {
        additionalBaggage: parseFloat(baggageAmount),
        baggageWeight: parseFloat(baggageWeight)*4.6,
        extraBaggageIntentId: paymentIntent.id, 
      },
      { new: true }
    );

    if (!updatedPassenger) {
      console.error('Passenger not found for extra baggage payment:', passengerId);
      return;
    }

    // For round trip, also update the other ticket in the pair
    if (tripType === "round_trip" && groupTicketSerial) {
      const otherTicketNumber = isReturnTrip 
        ? ticketNumber.replace('-RT', '') 
        : ticketNumber + '-RT';
      
      const otherTicket = await PassengerModel.findOne({ 
        ticketNumber: otherTicketNumber,
        groupTicketSerial: groupTicketSerial 
      });

      if (otherTicket) {
        await PassengerModel.findByIdAndUpdate(
          otherTicket._id,
          {
            additionalBaggage: parseFloat(baggageAmount)*4.6,
            extraBaggageIntentId: paymentIntent.id, 
          }
        );
        console.log('Updated both tickets in round trip for extra baggage');
      }
    }

    // Create payment transaction record
    await PaymentTransaction.create({
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      gateway: PaymentGateway.STRIPE,
      gatewayResponse: paymentIntent,
      transactionId: paymentIntent.id,
      status: TransactionStatus.SUCCEEDED,
      createdBy: driverId
    });

    console.log('Extra baggage added successfully for ticket:', ticketNumber);
    console.log('Trip type:', tripType);
    console.log('Is return trip:', isReturnTrip);
    console.log('Passenger updated:', updatedPassenger._id);

    // TODO: Send confirmation notification to passenger
    // TODO: Notify driver that payment is completed

  } catch (error) {
    console.error('Error handling extra baggage payment success:', error);
  }
}

/**
 * Handle failed extra baggage payment
 * Removes the payment intent ID from passenger record
 */
async function handleExtraBaggagePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  try {
    console.log('Extra baggage payment failed:', paymentIntent.id);
    
    const metadata = paymentIntent.metadata;
    const passengerId = metadata.passengerId;
    const ticketNumber = metadata.ticketNumber;
    const driverId = metadata.driverId;

    if (!passengerId) {
      console.error('Missing passenger ID for extra baggage payment failure');
      return;
    }

    // Remove the payment intent ID from passenger record so they can try again
    await PassengerModel.findByIdAndUpdate(
      passengerId,
      {
        extraBaggageIntentId: null
      }
    );

    // Create payment transaction record for failed payment
    await PaymentTransaction.create({
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      gateway: PaymentGateway.STRIPE,
      gatewayResponse: paymentIntent,
      transactionId: paymentIntent.id,
      status: TransactionStatus.FAILED,
      createdBy: driverId
    });

    console.log('Extra baggage payment failed for ticket:', ticketNumber);

    // TODO: Send notification about payment failure

  } catch (error) {
    console.error('Error handling extra baggage payment failure:', error);
  }
}
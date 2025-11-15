import { Request, Response } from "express";
import ResponseUtil from "../utils/Response/responseUtils";
import { STATUS_CODES } from "../constants/statusCodes";
import { ADMIN_CONSTANTS, AUTH_CONSTANTS, DRIVER_CONSTANTS } from "../constants/messages";
import { CustomError } from "../classes/CustomError";
import PassengerModel from "../models/passenger.models";
import { PaymentGateway, PaymentTransaction, Profile, RouteStatus, TicketStatus, TransactionStatus, TripType } from "../models";
import { CustomRequest } from "../interfaces/auth";
import BusModel from "../models/bus.model";
import { createPaymentIntent } from "../utils/Stripe/stripe";
import AuthModel from "../models/auth.model";
import RouteModel from "../models/route.model";
import DriverReport from "../models/driver-report.model";

export const verifyTicket = async (req: CustomRequest, res: Response) => {
    try {
        const { ticketNumber } = req.body;
        if(!ticketNumber){
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.TICKET_NUMBER_REQUIRED);
        }
        
        const getPassenger = await PassengerModel.findOne({ ticketNumber }).select("-qrCode");
        if (!getPassenger) {
            throw new CustomError(STATUS_CODES.NOT_FOUND, DRIVER_CONSTANTS.TICKET_NOT_FOUND);
        }

        const getBus = await BusModel.findById(getPassenger?.busId);
        if(!getBus){
            throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.BUS_NOT_FOUND);
        }
        if(getBus.driver?.toString() !== req.authId){
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.BUS_NOT_ASSIGNED_TO_DRIVER);
        }

        // Check if ticket is already used
        if (getPassenger.status === TicketStatus.USED) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.TICKET_ALREADY_USED);
        }

        // Check if ticket is valid
        if (!getPassenger.isValid) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.TICKET_NOT_VALID);
        }

        // Check if ticket is cancelled
        if (getPassenger.isCancelled) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.TICKET_NOT_VALID);
        }

        // For round trip tickets, check if this is the return trip ticket
        const isReturnTrip = getPassenger.ticketNumber?.includes('-RT');
        
        // If this is a round trip booking, check if the corresponding outbound/return ticket exists and is used
        if (getPassenger.type === TripType.ROUND_TRIP) {
            const groupTicketSerial = getPassenger.groupTicketSerial;
            if (groupTicketSerial) {
                // Find the other ticket in the round trip pair
                const otherTicketNumber = isReturnTrip 
                    ? getPassenger.ticketNumber.replace('-RT', '') 
                    : getPassenger.ticketNumber + '-RT';
                
                const otherTicket = await PassengerModel.findOne({ 
                    ticketNumber: otherTicketNumber,
                    groupTicketSerial: groupTicketSerial 
                });

                if (otherTicket) {
                    // If this is the return trip ticket, check if outbound ticket is used
                    if (isReturnTrip && otherTicket.status !== TicketStatus.USED) {
                        throw new CustomError(STATUS_CODES.BAD_REQUEST, "Outbound trip ticket must be used before return trip ticket");
                    }
                    // If this is the outbound trip ticket, check if return ticket exists and is valid
                    if (!isReturnTrip && otherTicket.status === TicketStatus.USED) {
                        // Both tickets are used, this is a complete round trip
                        const updatedPassenger = await PassengerModel.findByIdAndUpdate(getPassenger._id, { 
                            status: TicketStatus.USED, 
                            alreadyScanned: true, 
                            scannedForTicketCount: 1, 
                            checkedInBy: req.authId, 
                            isValid: true 
                        });
                        return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { 
                            updatedPassenger,
                            tripType: 'round_trip',
                            isReturnTrip: isReturnTrip,
                            message: isReturnTrip ? 'Return trip ticket verified' : 'Outbound trip ticket verified'
                        }, DRIVER_CONSTANTS.TICKET_VERIFIED);
                    }
                }
            }
        }

        // For one-way trips or first part of round trip
        if(getPassenger.scannedForTicketCount === 0){
            await BusModel.findByIdAndUpdate(getBus._id, { $inc: { passengerOnBoarded: 1 } });
        }
        
        const updatedPassenger = await PassengerModel.findByIdAndUpdate(getPassenger._id, { 
            status: TicketStatus.USED, 
            alreadyScanned: true, 
            scannedForTicketCount: getPassenger.scannedForTicketCount + 1, 
            scannedForBaggageCount: getPassenger.scannedForBaggageCount + 1, 
            checkedInBy: req.authId, 
            isValid: true 
        });

        return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { 
            updatedPassenger,
            tripType: getPassenger.type,
            isReturnTrip: isReturnTrip || false
        }, DRIVER_CONSTANTS.TICKET_VERIFIED);
    } catch (err) {
        if (err instanceof CustomError)
            return ResponseUtil.errorResponse(res, err.statusCode, err.message);
        ResponseUtil.handleError(res, err);
    }
}

export const addBaggage = async (req: CustomRequest, res: Response) => {
    try {
        const { ticketNumber, baggageAmount, method } = req.body;
        const baggageWeight = baggageAmount
        // Validate required fields
        if (!ticketNumber) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.TICKET_NUMBER_REQUIRED);
        }
        
        if (!baggageAmount || baggageAmount <= 0) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.BAGGAGE_AMOUNT_REQUIRED);
        }

        // Find the passenger by ticket number
        const getPassenger = await PassengerModel.findOne({ ticketNumber });
        if (!getPassenger) {
            throw new CustomError(STATUS_CODES.NOT_FOUND, DRIVER_CONSTANTS.TICKET_NOT_FOUND);
        }

        // Verify the bus belongs to this driver
        const getBus = await BusModel.findById(getPassenger.busId);
        if (!getBus) {
            throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.BUS_NOT_FOUND);
        }
        
        if (getBus.driver?.toString() !== req.authId) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.BUS_NOT_ASSIGNED_TO_DRIVER);
        }

        // Check if ticket is cancelled
        if (getPassenger.isCancelled) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.BAGGAGE_CANNOT_ADD_CANCELLED);
        }

        // For round trip tickets, check if this is the return trip ticket
        const isReturnTrip = getPassenger.ticketNumber?.includes('-RT');
        
        // If this is a round trip booking, check if the corresponding outbound ticket is used
        if (getPassenger.type === TripType.ROUND_TRIP && isReturnTrip) {
            const groupTicketSerial = getPassenger.groupTicketSerial;
            if (groupTicketSerial) {
                // Find the outbound ticket
                const outboundTicketNumber = getPassenger.ticketNumber.replace('-RT', '');
                const outboundTicket = await PassengerModel.findOne({ 
                    ticketNumber: outboundTicketNumber,
                    groupTicketSerial: groupTicketSerial 
                });

                if (outboundTicket && outboundTicket.status !== TicketStatus.USED) {
                    throw new CustomError(STATUS_CODES.BAD_REQUEST, "Outbound trip ticket must be used before adding baggage to return trip");
                }
            }
        }

        // Check if passenger has already purchased extra baggage for this specific ticket
        if (getPassenger.extraBaggageIntentId) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.BAGGAGE_ALREADY_PURCHASED);
        }

        // For round trip, check if baggage was already added to the other ticket
        if (getPassenger.type === TripType.ROUND_TRIP) {
            const groupTicketSerial = getPassenger.groupTicketSerial;
            if (groupTicketSerial) {
                const otherTicketNumber = isReturnTrip 
                    ? getPassenger.ticketNumber.replace('-RT', '') 
                    : getPassenger.ticketNumber + '-RT';
                
                const otherTicket = await PassengerModel.findOne({ 
                    ticketNumber: otherTicketNumber,
                    groupTicketSerial: groupTicketSerial 
                });

                if (otherTicket && otherTicket.extraBaggageIntentId) {
                    throw new CustomError(STATUS_CODES.BAD_REQUEST, "Extra baggage already added to the other ticket in this round trip");
                }
            }
        }

        if (method === "stripe") {
        const paymentIntent = await createPaymentIntent(baggageAmount,{
            type: 'extra_baggage',
            passengerId: (getPassenger._id as any).toString(),
            ticketNumber: ticketNumber,
            baggageWeight: baggageWeight.toString(),
            baggageAmount: baggageAmount.toString(),
            driverId: req.authId,
            busId: (getBus._id as any).toString(),
            tripType: getPassenger.type,
            isReturnTrip: isReturnTrip || false,
            groupTicketSerial: getPassenger.groupTicketSerial
        })

        // Update passenger record with payment intent ID (temporary)
        await PassengerModel.findByIdAndUpdate(getPassenger._id, {
            extraBaggageIntentId: paymentIntent.id
        });

        return ResponseUtil.successResponse(
            res,
            STATUS_CODES.SUCCESS,
            {
                paymentIntent: {
                    id: paymentIntent.id,
                    clientSecret: paymentIntent.client_secret,
                    totalAmount: paymentIntent.amount / 100, 
                },
                passenger: {
                    ticketNumber: getPassenger.ticketNumber,
                    fullName: getPassenger.fullName,
                    seatLabel: getPassenger.seatLabel,
                    tripType: getPassenger.type,
                    isReturnTrip: isReturnTrip || false
                },
                baggage: {
                    weight: baggageWeight,
                    amount: baggageAmount
                }
            },
                DRIVER_CONSTANTS.BAGGAGE_PAYMENT_INTENT_CREATED
            );
        } else {
    

    if (!getPassenger || !ticketNumber) {
      console.error('Missing required metadata for extra baggage payment');
      return;
    }

    // Update passenger record with extra baggage details
    const updatedPassenger = await PassengerModel.findByIdAndUpdate(
        getPassenger._id,
      {
        additionalBaggage: parseFloat(baggageAmount),
        baggageWeight: parseFloat(baggageWeight)*4.6,
        // extraBaggageIntentId: paymentIntent.id, 
      },
      { new: true }
    );

    if (!updatedPassenger) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, DRIVER_CONSTANTS.TICKET_NOT_FOUND);
      return;
    }

    // For round trip, also update the other ticket in the pair
    if (getPassenger.type === TripType.ROUND_TRIP && getPassenger.groupTicketSerial) {
      const otherTicketNumber = isReturnTrip 
        ? ticketNumber.replace('-RT', '') 
        : ticketNumber + '-RT';
      
      const otherTicket = await PassengerModel.findOne({ 
        ticketNumber: otherTicketNumber,
        groupTicketSerial: getPassenger.groupTicketSerial 
      });

      if (otherTicket) {
        await PassengerModel.findByIdAndUpdate(
          otherTicket._id,
          {
            additionalBaggage: parseFloat(baggageAmount)*4.6,
            // extraBaggageIntentId: paymentIntent.id, 
          }
        );
        console.log('Updated both tickets in round trip for extra baggage');
      }
    }

    // Create payment transaction record
    await PaymentTransaction.create({
      amount: parseFloat(baggageAmount),
      currency: "usd",
      gateway: PaymentGateway.MANUAL_CASH,
    //   gatewayResponse: paymentIntent,
    //   transactionId: paymentIntent.id,
      status: TransactionStatus.SUCCEEDED,
      createdBy: req.authId
    });

    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {
        updatedPassenger,
        message: "Extra baggage added successfully"
    }, DRIVER_CONSTANTS.BAGGAGE_ADDED_SUCCESSFULLY);

        }
    } catch (err) {
        if (err instanceof CustomError)
            return ResponseUtil.errorResponse(res, err.statusCode, err.message);
        ResponseUtil.handleError(res, err);
    }
}

export const getRoundTripTickets = async (req: CustomRequest, res: Response) => {
    try {
        const { ticketNumber } = req.body;
        
        if (!ticketNumber) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.TICKET_NUMBER_REQUIRED);
        }

        // Find the passenger by ticket number
        const getPassenger = await PassengerModel.findOne({ ticketNumber }).select("-qrCode");
        if (!getPassenger) {
            throw new CustomError(STATUS_CODES.NOT_FOUND, DRIVER_CONSTANTS.TICKET_NOT_FOUND);
        }

        // Verify the bus belongs to this driver
        const getBus = await BusModel.findById(getPassenger.busId);
        if (!getBus) {
            throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.BUS_NOT_FOUND);
        }
        
        if (getBus.driver?.toString() !== req.authId) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, DRIVER_CONSTANTS.BUS_NOT_ASSIGNED_TO_DRIVER);
        }

        // If this is not a round trip, return single ticket
        if (getPassenger.type !== TripType.ROUND_TRIP) {
            return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {
                tickets: [getPassenger],
                tripType: 'one_way',
                totalTickets: 1
            }, "Single ticket retrieved");
        }

        // For round trip, find both tickets
        const groupTicketSerial = getPassenger.groupTicketSerial;
        if (!groupTicketSerial) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, "Invalid round trip ticket - missing group serial");
        }

        const allTickets = await PassengerModel.find({ 
            groupTicketSerial: groupTicketSerial,
            user: getPassenger.user
        }).select("-qrCode").sort({ ticketNumber: 1 });

        if (allTickets.length !== 2) {
            throw new CustomError(STATUS_CODES.BAD_REQUEST, "Invalid round trip - missing tickets");
        }

        const outboundTicket = allTickets.find(t => !t.ticketNumber.includes('-RT'));
        const returnTicket = allTickets.find(t => t.ticketNumber.includes('-RT'));

        return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, {
            tickets: allTickets,
            outboundTicket: outboundTicket,
            returnTicket: returnTicket,
            tripType: 'round_trip',
            totalTickets: 2,
            groupTicketSerial: groupTicketSerial
        }, "Round trip tickets retrieved");

    } catch (err) {
        if (err instanceof CustomError)
            return ResponseUtil.errorResponse(res, err.statusCode, err.message);
        ResponseUtil.handleError(res, err);
    }
}

export const getPassengersCount = async (req: CustomRequest, res: Response) => {
    try {
        const authId = req.authId;
        const getBus = await BusModel.findOne({ driver: authId });
        if(!getBus){
            throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.BUS_NOT_FOUND);
        }

        return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { 
            totalBookedSeats: getBus.totalBookedSeats,
            passengerOnBoarded: getBus.passengerOnBoarded
         }, DRIVER_CONSTANTS.PASSENGERS_COUNT_FETCHED);
    } catch (err) {
        if (err instanceof CustomError)
            return ResponseUtil.errorResponse(res, err.statusCode, err.message);
        ResponseUtil.handleError(res, err);
    }
}

export const startTrip = async (req: CustomRequest, res: Response) => {
    try {
      const authId = req.authId
      const getUser = await AuthModel.findById(authId)
      if(!getUser){
        throw new CustomError(STATUS_CODES.NOT_FOUND, AUTH_CONSTANTS.USER_NOT_FOUND);
      }
      
      const getBus = await BusModel.findOne({ driver: authId })
        .populate('mxdriverId', 'profile')
        .populate('driver', 'profile');
      
      if(!getBus){
        throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.BUS_NOT_FOUND);
      }
      
      const getRoute = await RouteModel.findOne({ bus: getBus._id })
        .populate('origin', 'name')
        .populate('destination', 'name');
      
      if(!getRoute){
        throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.ROUTE_NOT_FOUND);
      }
      
      const updateRoute = await RouteModel.findByIdAndUpdate(
        getRoute._id, 
        { status: RouteStatus.DEPARTED }, 
        { new: true }
      );

      // Get current trip date/time from route dayTime
      const currentDate = new Date();
      const tripDate = currentDate; // Trip date is the current date
      const currentDay = currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const currentDayTime = (getRoute.dayTime || []).find((dt: any) => dt.day === currentDay);
      
      // tripTime is already in "HH:mm" format (e.g., "07:00")
      const tripTime = currentDayTime?.time || currentDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // Count passengers for this trip
      const passengerCount = await PassengerModel.countDocuments({
        busId: getBus._id,
        DepartureDate: {
          $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
          $lt: new Date(currentDate.setHours(23, 59, 59, 999))
        },
        isCancelled: false
      });

      // Create driver report record
      const driverReport = await DriverReport.create({
        route: getRoute._id,
        bus: getBus._id,
        mxDriver: getBus.mxdriverId || null,
        usDriver: getBus.driver || null,
        tripDate: tripDate,
        tripTime: tripTime,
        origin: getRoute.origin,
        destination: getRoute.destination,
        busRouteName: `${getBus.serialNumber} ${(getRoute.destination as any)?.name || ''}`,
        routeName: getRoute.name,
        passengers: passengerCount,
        status: 'started',
        startedAt: new Date()
      });

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { 
          route: updateRoute,
          tripReport: driverReport,
          message: "Trip started successfully. Passengers can now board."
        },
        "Trip started successfully"
      );
  
    } catch (err) {
      if (err instanceof CustomError)
        return ResponseUtil.errorResponse(res, err.statusCode, err.message);
      ResponseUtil.handleError(res, err);
    }
  };
  
  export const endTrip = async (req: CustomRequest, res: Response) => {
    try {
        const authId = req.authId
        const getUser = await AuthModel.findById(authId)
        if(!getUser){
            throw new CustomError(STATUS_CODES.NOT_FOUND, AUTH_CONSTANTS.USER_NOT_FOUND);
        }
        const getBus = await BusModel.findOne({ driver: authId })
        if(!getBus){
            throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.BUS_NOT_FOUND);
        }
        const getRoute = await RouteModel.findOne({ bus: getBus._id })
        if(!getRoute){
            throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.ROUTE_NOT_FOUND);
        }
        if(getRoute.status !== RouteStatus.DEPARTED){
            throw new CustomError(STATUS_CODES.BAD_REQUEST, "Trip not started yet");
        }
        const updateRoute = await RouteModel.findByIdAndUpdate(
          getRoute._id, 
          { status: RouteStatus.COMPLETED }, 
          { new: true }
        );

        // Get final passenger count for today's trip
        const currentDate = new Date();
        const passengerCount = await PassengerModel.countDocuments({
          busId: getBus._id,
          DepartureDate: {
            $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
            $lt: new Date(currentDate.setHours(23, 59, 59, 999))
          },
          isCancelled: false
        });

        // Update the most recent driver report for this route/bus to completed
        const updatedReport = await DriverReport.findOneAndUpdate(
          {
            route: getRoute._id,
            bus: getBus._id,
            status: 'started'
          },
          {
            status: 'completed',
            completedAt: new Date(),
            passengers: passengerCount // Update with final count
          },
          { 
            new: true,
            sort: { startedAt: -1 } // Get the most recent one
          }
        );
  
      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { 
          trip: updateRoute,
          tripReport: updatedReport,
          message: "Trip completed successfully."
        },
        "Trip ended successfully"
      );
  
    } catch (err) {
      if (err instanceof CustomError)
        return ResponseUtil.errorResponse(res, err.statusCode, err.message);
      ResponseUtil.handleError(res, err);
    }
  };
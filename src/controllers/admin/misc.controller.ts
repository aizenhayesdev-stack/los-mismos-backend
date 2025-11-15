import { Response } from "express";
import { CustomRequest } from "../../interfaces/auth";
import ResponseUtil from "../../utils/Response/responseUtils";
// import ServicesModel from "../../models/services.model";
import { STATUS_CODES } from "../../constants/statusCodes";
import { MISC_CONSTANTS } from "../../constants/messages";
import MediaModel from "../../models/media.model";
import { CustomError } from "../../classes/CustomError";
import DriverReport from "../../models/driver-report.model";
import Booking from "../../models/booking.model";
import PaymentTransaction from "../../models/payment-transaction.model";
import RouteModel from "../../models/route.model";
import Bus from "../../models/bus.model";
import PassengerModel from "../../models/passenger.models";
import Profile from "../../models/profile.model";
import { RouteStatus } from "../../models/common/types";
import currencyModel from "../../models/currency.model";

// export const createServices = async (req: CustomRequest, res: Response) => {
//     try {
//         const files = req.files as { [fieldname: string]: Express.Multer.File[] };
//         const icon = files?.icon?.[0];
//         const name = req.body.name
//         // console.log(req)
//         let iconId: string | undefined = undefined;
//         console.log(icon);
//         if (icon) {
//             const createIcon = await MediaModel.create({
//                 type: "icon",
//                 mimeType: icon.mimetype,
//                 fieldname: icon.fieldname,
//                 fileName: icon.filename,
//                 originalName: icon.originalname,
//                 url: icon.path,
//                 size: icon.size,
//             });
//             iconId = createIcon.id;
//         }
//         if (!name) {
//             throw new CustomError(STATUS_CODES.BAD_REQUEST, MISC_CONSTANTS.NAME_REQUIRED);
//         }
//         const NewSrevice = await
//             ServicesModel.create({
//                 name,
//                 icon: iconId
//             })
//         return ResponseUtil.successResponse(
//             res,
//             STATUS_CODES.SUCCESS,
//             { NewSrevice },
//             MISC_CONSTANTS.ALL_LOCS_FETCHED
//         );
//     }
//     catch (err) {
//         if (err instanceof CustomError)
//             return ResponseUtil.errorResponse(res, err.statusCode, err.message);
//         ResponseUtil.handleError(res, err);
//     }
// }

export const getDashboard = async (req: CustomRequest, res: Response) => {
  try {
    const { 
      date, 
      departureDate, 
      bookingType, 
      dateRangeStart, 
      dateRangeEnd,
      filter 
    } = req.query;
    
    // Check if any date filter is provided
    const hasDateFilter = date || departureDate || dateRangeStart || dateRangeEnd;
    
    let targetDate: Date;
    let startOfDay: Date;
    let endOfDay: Date;
    let previousWeekStart: Date;
    let previousWeekEnd: Date;
    let isOverallData = false;
    
    if (!hasDateFilter) {
      // No date filter provided - show overall data (last 30 days)
      isOverallData = true;
      const now = new Date();
      endOfDay = new Date(now.setHours(23, 59, 59, 999));
      startOfDay = new Date(endOfDay);
      startOfDay.setDate(startOfDay.getDate() - 30); // Last 30 days
      startOfDay.setHours(0, 0, 0, 0);
      
      // Previous period: 30 days before that
      previousWeekEnd = new Date(startOfDay);
      previousWeekEnd.setDate(previousWeekEnd.getDate() - 1);
      previousWeekEnd.setHours(23, 59, 59, 999);
      previousWeekStart = new Date(previousWeekEnd);
      previousWeekStart.setDate(previousWeekStart.getDate() - 30);
      previousWeekStart.setHours(0, 0, 0, 0);
      
      targetDate = new Date();
    } else {
      // Parse the date or use today
      targetDate = date ? new Date(date as string) : new Date();
      startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      
      // Apply date range filter if provided
      if (dateRangeStart && dateRangeEnd) {
        startOfDay = new Date(new Date(dateRangeStart as string).setHours(0, 0, 0, 0));
        endOfDay = new Date(new Date(dateRangeEnd as string).setHours(23, 59, 59, 999));
      } else if (departureDate) {
        // Apply departure date filter
        targetDate = new Date(departureDate as string);
        startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      }
      
      // Calculate previous period for comparison (same duration)
      const durationDays = Math.ceil((endOfDay.getTime() - startOfDay.getTime()) / (1000 * 60 * 60 * 24));
      previousWeekStart = new Date(startOfDay);
      previousWeekStart.setDate(previousWeekStart.getDate() - durationDays);
      previousWeekEnd = new Date(endOfDay);
      previousWeekEnd.setDate(previousWeekEnd.getDate() - durationDays);
    }

    // Build query filters
    const tripQuery: any = {
      tripDate: { $gte: startOfDay, $lte: endOfDay }
    };

    // ==================== NOW BOARDING TRIPS ====================
    // Get routes with boarding status
    const boardingRoutes = await RouteModel.find({
      status: RouteStatus.BOARDING,
      isActive: true
    })
      .populate('origin', 'name')
      .populate('destination', 'name')
      .populate('bus', 'serialNumber code capacity');

    const nowBoardingTrips = await Promise.all(
      boardingRoutes.map(async (route: any) => {
        // Get passengers for this route today
        const passengers = await PassengerModel.find({
          DepartureDate: { $gte: startOfDay, $lte: endOfDay },
          isCancelled: false,
          isValid: true,
          From: route.origin?.name,
          To: route.destination?.name
        })
          .populate({
            path: 'user',
            populate: {
              path: 'profile',
              select: 'pictureUrl firstName lastName'
            }
          })
          .limit(50);

        // Apply booking type filter if provided
        let filteredPassengers = passengers;
        if (bookingType && bookingType !== 'all' && bookingType !== 'All Bookings') {
          const bookingTypeMap: { [key: string]: string } = {
            'customer': 'customer',
            'cashier': 'cashier',
            'driver': 'driver',
            'manager': 'manager',
            'super_admin': 'super_admin',
            'Super Admin': 'super_admin'
          };
          
          const mappedType = bookingTypeMap[bookingType as string] || bookingType;
          filteredPassengers = passengers.filter(p => p.bookedBy === mappedType);
        }

        // Get passenger avatars with profile pictures
        const passengerAvatars = filteredPassengers.slice(0, 4).map((p: any) => {
          const profile = p.user?.profile;
          return {
            pictureUrl: profile?.pictureUrl || null,
            name: p.fullName || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim()
          };
        });

        const totalPassengers = filteredPassengers.length;
        const remainingCount = Math.max(0, totalPassengers - 4);

        const busCapacity = route.bus?.capacity || 0;
        const capacityPercentage = busCapacity > 0 
          ? Math.round((totalPassengers / busCapacity) * 100) 
          : 0;

        // Get today's schedule for this route
        const today = new Date();
        const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][today.getDay()];
        const todaySchedule = route.dayTime?.find((dt: any) => dt.day === dayOfWeek);

        return {
          id: route._id,
          routeName: route.name,
          origin: {
            name: route.origin?.name || 'Unknown',
            time: todaySchedule?.time || '00:00'
          },
          destination: {
            name: route.destination?.name || 'Unknown',
            time: todaySchedule?.time || '00:00'
          },
          date: today,
          passengerAvatars,
          totalPassengers,
          remainingCount,
          bus: {
            serialNumber: route.bus?.serialNumber || 'N/A',
            code: route.bus?.code || 'N/A',
            capacity: busCapacity
          },
          capacityPercentage,
          status: 'boarding'
        };
      })
    );

    // ==================== ACTIVE/STARTED TRIPS ====================
    const activeTripsQuery = {
      ...tripQuery,
      status: 'started'
    };

    const activeTrips = await DriverReport.find(activeTripsQuery)
      .populate({
        path: 'route',
        populate: [
          { path: 'origin', select: 'name' },
          { path: 'destination', select: 'name' }
        ]
      })
      .populate('bus', 'serialNumber code capacity')
      .populate('origin', 'name')
      .populate('destination', 'name')
      .sort({ startedAt: -1 })
      .limit(20);

    // Get passenger details for each active trip with profile pictures
    const activeTripsWithPassengers = await Promise.all(
      activeTrips.map(async (trip: any) => {
        // Get passengers for this specific trip
        const passengers = await PassengerModel.find({
          DepartureDate: { $gte: startOfDay, $lte: endOfDay },
          busId: trip.bus?._id,
          isCancelled: false,
          isValid: true,
          From: trip.origin?.name || (trip.route as any)?.origin?.name,
          To: trip.destination?.name || (trip.route as any)?.destination?.name
        })
          .populate({
            path: 'user',
            populate: {
              path: 'profile',
              select: 'pictureUrl firstName lastName'
            }
          })
          .limit(50);

        // Apply booking type filter if provided
        // "All Bookings" or null/empty means no filter
        let filteredPassengers = passengers;
        if (bookingType && bookingType !== 'all' && bookingType !== 'All Bookings') {
          // Map display values to actual enum values
          const bookingTypeMap: { [key: string]: string } = {
            'customer': 'customer',
            'cashier': 'cashier',
            'driver': 'driver',
            'manager': 'manager',
            'super_admin': 'super_admin',
            'Super Admin': 'super_admin'
          };
          
          const mappedType = bookingTypeMap[bookingType as string] || bookingType;
          filteredPassengers = passengers.filter(p => p.bookedBy === mappedType);
        }

        // Get passenger avatars with profile pictures
        const passengerAvatars = filteredPassengers.slice(0, 4).map((p: any) => {
          const profile = p.user?.profile;
          return {
            pictureUrl: profile?.pictureUrl || null,
            name: p.fullName || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim()
          };
        });

        const totalPassengers = filteredPassengers.length;
        const remainingCount = Math.max(0, totalPassengers - 4);

        // Calculate capacity percentage
        const busCapacity = trip.bus?.capacity || 0;
        const capacityPercentage = busCapacity > 0 
          ? Math.round((totalPassengers / busCapacity) * 100) 
          : 0;

        // Calculate estimated duration and time remaining
        const now = new Date();
        const tripStart = trip.startedAt || trip.createdAt;
        const elapsedMinutes = Math.floor((now.getTime() - new Date(tripStart).getTime()) / (1000 * 60));
        const estimatedDuration = 45; // You can make this dynamic based on route
        const timeRemaining = Math.max(0, estimatedDuration - elapsedMinutes);

        return {
          id: trip._id,
          origin: {
            name: trip.origin?.name || (trip.route as any)?.origin?.name || 'Unknown',
            time: trip.tripTime
          },
          destination: {
            name: trip.destination?.name || (trip.route as any)?.destination?.name || 'Unknown',
            time: trip.tripTime
          },
          date: trip.tripDate,
          passengerAvatars,
          totalPassengers,
          remainingCount,
          bus: {
            serialNumber: trip.bus?.serialNumber || 'N/A',
            code: trip.bus?.code || 'N/A',
            capacity: busCapacity
          },
          capacityPercentage,
          status: trip.status,
          tripInformation: {
            salida: trip.startedAt || trip.createdAt,
            destination: trip.destination?.name || (trip.route as any)?.destination?.name || 'Unknown',
            estimatedDuration,
            timeRemaining
          }
        };
      })
    );

    // ==================== SALES & PERFORMANCE ====================
    
    // Current period bookings
    const currentBookings = await Booking.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      bookingStatus: 'confirmed'
    });

    // Previous period bookings
    const previousBookings = await Booking.find({
      createdAt: { $gte: previousWeekStart, $lte: previousWeekEnd },
      bookingStatus: 'confirmed'
    });

    // Calculate passengers
    const currentPassengers = currentBookings.reduce((sum, booking) => {
      return sum + (booking.passengers?.length || 0);
    }, 0);

    const previousPassengers = previousBookings.reduce((sum, booking) => {
      return sum + (booking.passengers?.length || 0);
    }, 0);

    const passengersChange = previousPassengers > 0 
      ? ((currentPassengers - previousPassengers) / previousPassengers) * 100 
      : 0;

    // Calculate trips
    const currentTrips = await DriverReport.countDocuments({
      tripDate: { $gte: startOfDay, $lte: endOfDay }
    });

    const previousTrips = await DriverReport.countDocuments({
      tripDate: { $gte: previousWeekStart, $lte: previousWeekEnd }
    });

    const tripsChange = previousTrips > 0 
      ? ((currentTrips - previousTrips) / previousTrips) * 100 
      : 0;

    // Calculate occupancy rate
    const activeTripsData = await DriverReport.find({
      tripDate: { $gte: startOfDay, $lte: endOfDay }
    }).populate('bus', 'capacity');

    let totalCapacity = 0;
    let totalBooked = 0;

    for (const trip of activeTripsData) {
      const bus = trip.bus as any;
      const capacity = bus?.capacity || 0;
      totalCapacity += capacity;
      totalBooked += trip.passengers || 0;
    }

    const currentOccupancy = totalCapacity > 0 
      ? (totalBooked / totalCapacity) * 100 
      : 0;

    // Previous period occupancy
    const previousTripsData = await DriverReport.find({
      tripDate: { $gte: previousWeekStart, $lte: previousWeekEnd }
    }).populate('bus', 'capacity');

    let prevTotalCapacity = 0;
    let prevTotalBooked = 0;

    for (const trip of previousTripsData) {
      const bus = trip.bus as any;
      const capacity = bus?.capacity || 0;
      prevTotalCapacity += capacity;
      prevTotalBooked += trip.passengers || 0;
    }

    const previousOccupancy = prevTotalCapacity > 0 
      ? (prevTotalBooked / prevTotalCapacity) * 100 
      : 0;

    const occupancyChange = previousOccupancy > 0 
      ? ((currentOccupancy - previousOccupancy) / previousOccupancy) * 100 
      : 0;

    // Calculate revenue
    const currentRevenue = await PaymentTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay },
          status: 'succeeded'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const previousRevenue = await PaymentTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: previousWeekStart, $lte: previousWeekEnd },
          status: 'succeeded'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const currentRevenueTotal = currentRevenue[0]?.total || 0;
    const previousRevenueTotal = previousRevenue[0]?.total || 0;

    const revenueChange = previousRevenueTotal > 0 
      ? ((currentRevenueTotal - previousRevenueTotal) / previousRevenueTotal) * 100 
      : 0;

    // ==================== RESPONSE ====================
    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        period: {
          isOverallData,
          label: isOverallData ? 'Last 30 Days' : 'Filtered Period',
          startDate: startOfDay.toISOString().split('T')[0],
          endDate: endOfDay.toISOString().split('T')[0],
          durationDays: Math.ceil((endOfDay.getTime() - startOfDay.getTime()) / (1000 * 60 * 60 * 24))
        },
        nowBoarding: nowBoardingTrips.length > 0 ? nowBoardingTrips[0] : null, // Show the first boarding trip prominently
        nowBoardingTrips, // All boarding trips
        activeTrips: activeTripsWithPassengers,
        salesAndPerformance: {
          passengers: {
            count: currentPassengers,
            change: Number(passengersChange.toFixed(1)),
            period: isOverallData ? 'Last 30 days' : targetDate.toISOString().split('T')[0]
          },
          trips: {
            count: currentTrips,
            change: Number(tripsChange.toFixed(1)),
            period: isOverallData ? 'Last 30 days' : targetDate.toISOString().split('T')[0]
          },
          occupancyRate: {
            rate: Number(currentOccupancy.toFixed(0)),
            change: Number(occupancyChange.toFixed(1)),
            period: isOverallData ? 'Last 30 days' : targetDate.toISOString().split('T')[0]
          },
          revenue: {
            amount: Number(currentRevenueTotal.toFixed(2)),
            change: Number(revenueChange.toFixed(1)),
            period: isOverallData ? 'Last 30 days' : targetDate.toISOString().split('T')[0]
          }
        },
        filters: {
          applied: {
            date: date || null,
            departureDate: departureDate || null,
            bookingType: bookingType || null,
            dateRangeStart: dateRangeStart || null,
            dateRangeEnd: dateRangeEnd || null,
            filter: filter || null
          }
        }
      },
      isOverallData 
        ? 'Dashboard data fetched successfully (Last 30 days)' 
        : 'Dashboard data fetched successfully'
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const updateCurrency = async (req: CustomRequest, res: Response) => {
  try {
    let { USD, MXN } = req.body;
    const getCurrency = await currencyModel.findOne();
    // if (!getCurrency) {
    //   throw new CustomError(STATUS_CODES.NOT_FOUND, MISC_CONSTANTS.CURRENCY_NOT_FOUND);
    // }
    if(!USD) USD = getCurrency?.USD;
    if(!MXN) MXN = getCurrency?.MXN;

    const currency = await currencyModel.create({ USD: USD, MXN: MXN });
    // const currency = await currencyModel.updateOne({ USD: usd, MXN: mxn });
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { currency }, MISC_CONSTANTS.CURRENCY_UPDATED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const getCurrency = async (req: CustomRequest, res: Response) => {
  try {
    const currency = await currencyModel.findOne();
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { currency }, MISC_CONSTANTS.CURRENCY_FETCHED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};
import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/statusCodes";
import ResponseUtil from "../../utils/Response/responseUtils";
import { ADMIN_CONSTANTS } from "../../constants/messages";
import { CustomError } from "../../classes/CustomError";
import RouteModel from "../../models/route.model";
import Destination from "../../models/destinations.model";
import Bus from "../../models/bus.model";
import helper from "../../helper";
// import {  TripType } from "../../models/tours.models";
import { calculateFare } from "../../utils/pricing";
import { DaysEnums, TripType } from "../../models/common/types";

// Helper function to convert JavaScript day number (0-6) to DaysEnums string
const getDayEnumFromNumber = (dayNumber: number): string => {
  const dayMap: { [key: number]: string } = {
    0: DaysEnums.SUNDAY,      // Sunday
    1: DaysEnums.MONDAY,      // Monday
    2: DaysEnums.TUESDAY,     // Tuesday
    3: DaysEnums.WEDNESDAY,   // Wednesday
    4: DaysEnums.THURSDAY,    // Thursday
    5: DaysEnums.FRIDAY,      // Friday
    6: DaysEnums.SATURDAY     // Saturday
  };
  return dayMap[dayNumber] || DaysEnums.MONDAY;
};

export const createRoute = async (req: Request, res: Response) => {
  try {
    const {
      name,
      origin,
      destination,
      bus,
      dayTime,
      intermediateStops,
      isActive
    } = req.body;

    // Check if route with same name already exists
    const existingRoute = await RouteModel.findOne({
      name: name,
    });

    if (existingRoute) {
      throw new CustomError(STATUS_CODES.CONFLICT, "Route with this name already exists");
    }
 
    // Create new route
    const newRoute = new RouteModel({
      name,
      origin,
      destination,
      bus,
      dayTime,
      intermediateStops: intermediateStops || [],
      isActive: isActive !== undefined ? isActive?true:false : true,
    });

    const savedRoute = await newRoute.save();

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.CREATED,
      {
        route: {
          id: savedRoute._id,
          name: savedRoute.name,
          origin: savedRoute.origin,
          destination: savedRoute.destination,
          bus: savedRoute.bus,
          dayTime: savedRoute.dayTime,
          intermediateStops: savedRoute.intermediateStops,
          isActive: savedRoute.isActive,
        }
      },
      ADMIN_CONSTANTS.ROUTE_CREATED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const getRoutes = async (req: Request, res: Response) => {
  try {
    let { 
      page, 
      limit, 
      origin, 
      destination, 
      departureDate, 
      returnDate, 
      tripType = TripType.ONE_WAY, 
      day, 
      time, 
      bus, 
      isActive,
      search,
      sortBy,
      sortOrder
    } = req.query;

    // Build query object
    const query: any = {};

    // Active status filter
    if (isActive !== undefined) {
      query.isActive = isActive === 'true'?true:false;
    } 
    // else {
    //   query.isActive = true; // Default to active routes
    // }

    // Origin filter
    if (origin) {
      query.origin = origin;
    }

    // Destination filter
    if (destination) {
      query.destination = destination;
    }

    // Day filter (for specific day of week)
    // Note: dayTime.time now stores time as a string in "HH:mm" format (e.g., "07:00", "14:30")
    // We filter by dayTime.day which contains the day of week string ("monday", "tuesday", etc.)
    
    // Get current time in UTC as "HH:mm" string format
    const now = new Date();
    const currentHoursUTC = now.getUTCHours();
    const currentMinutesUTC = now.getUTCMinutes();
    const currentTimeString = `${currentHoursUTC.toString().padStart(2, '0')}:${currentMinutesUTC.toString().padStart(2, '0')}`;
    
    // Date filtering - handle both departure and return dates by matching day of week
    if(departureDate && returnDate){
      tripType = TripType.ROUND_TRIP;
      // For round-trip, find routes that operate on either departure day OR return day
      const depDate = new Date(departureDate as string);
      const retDate = new Date(returnDate as string);
      
      // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const depDayOfWeekNum = depDate.getDay();
      const retDayOfWeekNum = retDate.getDay();
      
      // Convert to DaysEnums string format (e.g., "monday", "tuesday")
      const depDayOfWeek = getDayEnumFromNumber(depDayOfWeekNum);
      const retDayOfWeek = getDayEnumFromNumber(retDayOfWeekNum);
      
      const isDepToday = depDate.toDateString() === now.toDateString();
      const isRetToday = retDate.toDateString() === now.toDateString();
      
      // If departure or return is today, filter by time as well using $elemMatch
      if (isDepToday || isRetToday) {
        const orConditions: any[] = [];
        
        // Add departure day condition (with time filter if today)
        if (isDepToday) {
          orConditions.push({
            dayTime: {
              $elemMatch: {
                day: depDayOfWeek,
                time: { $gte: currentTimeString }  // Simple string comparison: "07:00" >= "04:04"
              }
            }
          });
        } else {
          orConditions.push({ 'dayTime.day': depDayOfWeek });
        }
        
        // Add return day condition (with time filter if today)
        if (isRetToday) {
          orConditions.push({
            dayTime: {
              $elemMatch: {
                day: retDayOfWeek,
                time: { $gte: currentTimeString }  // Simple string comparison: "07:00" >= "04:04"
              }
            }
          });
        } else {
          orConditions.push({ 'dayTime.day': retDayOfWeek });
        }
        
        query.$or = orConditions;
      } else {
        // Neither date is today, just match the days
        query.$or = [
          { 'dayTime.day': depDayOfWeek },
          { 'dayTime.day': retDayOfWeek }
        ];
      }
    } else if(departureDate){
      // Only departure date provided - match routes that operate on this day of week
      const depDate = new Date(departureDate as string);
      const depDayOfWeekNum = depDate.getDay();
      const depDayOfWeek = getDayEnumFromNumber(depDayOfWeekNum);
      const isToday = depDate.toDateString() === now.toDateString();
      
      // If departure is today, filter by BOTH day AND time using $elemMatch
      // Time is stored as string "HH:mm" (e.g., "07:00") and compared directly
      if (isToday) {
        query.dayTime = {
          $elemMatch: {
            day: depDayOfWeek,
            time: { $gte: currentTimeString }  // Simple string comparison: "07:00" >= "04:04"
          }
        };
      } else {
        // For future dates, just match the day
        query['dayTime.day'] = depDayOfWeek;
      }
    } else if(returnDate){
      // Only return date provided - match routes that operate on this day of week
      const retDate = new Date(returnDate as string);
      const retDayOfWeekNum = retDate.getDay();
      const retDayOfWeek = getDayEnumFromNumber(retDayOfWeekNum);
      const isToday = retDate.toDateString() === now.toDateString();
      
      // If return is today, filter by BOTH day AND time using $elemMatch
      // Time is stored as string "HH:mm" (e.g., "07:00") and compared directly
      if (isToday) {
        query.dayTime = {
          $elemMatch: {
            day: retDayOfWeek,
            time: { $gte: currentTimeString }  // Simple string comparison: "07:00" >= "04:04"
          }
        };
      } else {
        // For future dates, just match the day
        query['dayTime.day'] = retDayOfWeek;
      }
    }

    // // Time filter (for specific time range)
    // if (time) {
    //   const timeParts = time.toString().split('-');
    //   if (timeParts.length === 2) {
    //     const startTime = timeParts[0];
    //     const endTime = timeParts[1];
    //     query['dayTime.time'] = {
    //       $gte: new Date(`1970-01-01T${startTime}:00.000Z`),
    //       $lte: new Date(`1970-01-01T${endTime}:00.000Z`)
    //     };
    //   }
    // }

    // Bus filter
    // if (bus) {
    //   query.bus = bus;
    // }

    // Search filter (searches in route name, origin, destination names)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'origin.name': { $regex: search, $options: 'i' } },
        { 'destination.name': { $regex: search, $options: 'i' } }
      ];
    }

  // // Date filtering for departure and return dates
  //   if (departureDate) {
  //     const depDate = new Date(departureDate.toString());
  //     const nextDay = new Date(depDate);
  //     nextDay.setDate(nextDay.getDate() + 1);
      
  //     // Filter routes that have schedules on the departure date
  //     query['dayTime.time'] = {
  //       $gte: depDate,
  //       $lt: nextDay
  //     };
  //   }  

    // Build sort options
    let sortOptions: Record<string, 1 | -1> = { updatedAt: -1 };
    
    if (sortBy) {
      const order = sortOrder === 'asc' ? 1 : -1;
      sortOptions = { [sortBy.toString()]: order };
    }

    // Build populate options
    const populateOptions = [
      { path: "origin", select: "name description priceToDFW priceFromDFW priceRoundTrip" },
      { path: "destination", select: "name description priceToDFW priceFromDFW priceRoundTrip MinutesOfDifference" },
      { path: "bus", select: "code serialNumber capacity seatLayout amenities" },
      { path: "intermediateStops", select: "name description" }
    ];

    // Pagination options
    const options = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      sort: sortOptions,
      populate: populateOptions,
    };


    // Try pagination helper first
    const routes = await helper.PaginateHelper.customPaginate("routes", RouteModel as any, query, options);
    
    // Helper function to check if a seat is booked for a specific date
    const isSeatBookedForDate = (seat: any, targetDate: Date): boolean => {
      if (!seat.departureDateBookings || seat.departureDateBookings.length === 0) {
        return false;
      }
      
      return seat.departureDateBookings.some((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        const queryDate = new Date(targetDate);
        const bookingStatus = booking.status?.toLowerCase();
        return bookingDate.toDateString() === queryDate.toDateString() && 
               (bookingStatus === 'booked' || bookingStatus === 'selected');
      });
    };

    // Helper function to get seat status for a specific date
    const getSeatStatusForDate = (seat: any, targetDate: Date): string => {
      if (!seat.departureDateBookings || seat.departureDateBookings.length === 0) {
        return 'available';
      }
      
      const booking = seat.departureDateBookings.find((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        const queryDate = new Date(targetDate);
        return bookingDate.toDateString() === queryDate.toDateString();
      });

      if (!booking) {
        return 'available';
      }

      // Normalize status to lowercase for comparison
      const bookingStatus = booking.status?.toLowerCase();

      // Check if hold is expired
      if (bookingStatus === 'selected' && booking.expiresAt) {
        if (new Date() > new Date(booking.expiresAt)) {
          return 'available';
        }
        return 'selected';
      }

      if (bookingStatus === 'booked') {
        return 'booked';
      }

      return 'available';
    };
    
    // Calculate available seats for each route
    const routesWithSeatInfo = Array.isArray(routes.routes) ? await Promise.all(routes.routes.map(async (route: any) => {
      const routeObj = route.toObject ? route.toObject() : route;
      const baseFare = await calculateFare(routeObj._id.toString(), tripType as string);
      if (routeObj.bus && routeObj.bus.seatLayout && routeObj.bus.seatLayout.seats) {
        const seats = routeObj.bus.seatLayout.seats;
        const totalSeats = seats.length;
        
        let availableSeats = 0;
        let bookedSeats = 0;
        let heldSeats = 0;

        if (departureDate) {
          // Filter seats based on departure date
          const targetDate = new Date(departureDate as string);
          
          // Calculate seat counts for the specific date
          seats.forEach((seat: any) => {
            const seatStatus = getSeatStatusForDate(seat, targetDate);
            
            if (seatStatus === 'available') {
              availableSeats++;
            } else if (seatStatus === 'booked') {
              bookedSeats++;
            } else if (seatStatus === 'selected') {
              heldSeats++;
            }
          });
        } else {
          // Without date filter, show general seat availability
          availableSeats = seats.filter((seat: any) => 
            seat.status === 'available' || seat.isAvailable === true
          ).length;
          
          bookedSeats = seats.filter((seat: any) => 
            seat.status === 'booked'
          ).length;
          
          heldSeats = seats.filter((seat: any) => 
            seat.status === 'held' || seat.status === 'selected'
          ).length;
        }

        // Remove detailed seat layout from response to reduce payload size
        delete routeObj.bus.seatLayout;


        return {
          ...routeObj,
          baseFare: baseFare,
          seatAvailability: {
            total: totalSeats,
            available: availableSeats,
            booked: bookedSeats,
            held: heldSeats,
            ...(departureDate && { departureDate: departureDate })
          }
        };
      }
      
      return {
        ...routeObj,
        baseFare: baseFare
      };
    })) : [];
    
    console.log('📋 Routes Result:', JSON.stringify({
      totalDocs: routes.totalDocs,
      page: routes.page,
      limit: routes.limit,
      totalPages: routes.totalPages,
      hasNextPage: routes.hasNextPage,
      hasPrevPage: routes.hasPrevPage,
      docsCount: Array.isArray(routes.docs) ? routes.docs.length : 0,
      docs: Array.isArray(routes.docs) ? routes.docs.map((r: any) => ({ id: r._id, name: r.name })) : []
    }, null, 2));


    // Add filtering metadata
    const filterMetadata = {
      appliedFilters: {
        origin: origin || null,
        destination: destination || null,
        departureDate: departureDate || null,
        returnDate: returnDate || null,
        tripType: tripType || null,
        day: day || null,
        time: time || null,
        bus: bus || null,
        isActive: query.isActive,
        search: search || null
      },
      totalResults: routes.totalDocs,
      currentPage: routes.page,
      totalPages: routes.totalPages,
      hasNextPage: routes.hasNextPage,
      hasPrevPage: routes.hasPrevPage
    };

    return ResponseUtil.successResponse(
      res, 
      STATUS_CODES.SUCCESS, 
      { 
        routes: routesWithSeatInfo || [],
        pagination: {
          page: routes.page || 1,
          limit: routes.limit || 10,
          totalDocs: routes.totalDocs || 0,
          totalPages: routes.totalPages || 1,
          hasNextPage: routes.hasNextPage || false,
          hasPrevPage: routes.hasPrevPage || false
        },
        filters: filterMetadata
      }, 
      ADMIN_CONSTANTS.ROUTES_FETCHED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const getRouteById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date ,returnDate} = req.query;
    const tripType = returnDate ? TripType.ROUND_TRIP : TripType.ONE_WAY;
    const populateOptions = [
      { path: "origin", select: "name description priceToDFW priceFromDFW priceRoundTrip" },
      { path: "destination", select: "name description priceToDFW priceFromDFW priceRoundTrip" },
      { path: "bus", select: "code serialNumber capacity seatLayout amenities" },
      { path: "intermediateStops", select: "name description" }
    ];
    const route = await RouteModel.findById(id).populate(populateOptions);
    
    if (!route) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Route not found");
    }

    let routeObj = route.toObject();
    
    // Helper function to check if a seat is booked for a specific date
    const isSeatBookedForDate = (seat: any, targetDate: Date): boolean => {
      if (!seat.departureDateBookings || seat.departureDateBookings.length === 0) {
        return false;
      }
      
      return seat.departureDateBookings.some((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        const queryDate = new Date(targetDate);
        const bookingStatus = booking.status?.toLowerCase();
        return bookingDate.toDateString() === queryDate.toDateString() && 
               (bookingStatus === 'booked' || bookingStatus === 'selected');
      });
    };

    // Helper function to get seat status for a specific date
    const getSeatStatusForDate = (seat: any, targetDate: Date): string => {
      if (!seat.departureDateBookings || seat.departureDateBookings.length === 0) {
        return 'available';
      }
      
      const booking = seat.departureDateBookings.find((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        const queryDate = new Date(targetDate);
        return bookingDate.toDateString() === queryDate.toDateString();
      });

      if (!booking) {
        return 'available';
      }

      // Normalize status to lowercase for comparison
      const bookingStatus = booking.status?.toLowerCase();

      // Check if hold is expired
      if (bookingStatus === 'selected' && booking.expiresAt) {
        if (new Date() > new Date(booking.expiresAt)) {
          return 'available';
        }
        return 'selected';
      }

      if (bookingStatus === 'booked') {
        return 'booked';
      }

      return 'available';
    };

    // Calculate available seats
    const bus = routeObj.bus as any;
    if (bus && bus.seatLayout && bus.seatLayout.seats) {
      const seats = bus.seatLayout.seats;
      const totalSeats = seats.length;
      
      let availableSeats = 0;
      let bookedSeats = 0;
      let heldSeats = 0;

      if (date) {
        // Filter seats based on departure date
        const targetDate = new Date(date as string);
        
        // Add status information to each seat for the requested date
        (routeObj.bus as any).seatLayout.seats = seats.map((seat: any) => {
          const seatStatus = getSeatStatusForDate(seat, targetDate);
          const isBooked = isSeatBookedForDate(seat, targetDate);
          
          // Find the booking for this specific date to get userId
          const dateSpecificBooking = seat.departureDateBookings?.find((booking: any) => {
            const bookingDate = new Date(booking.departureDate);
            const queryDate = new Date(targetDate);
            return bookingDate.toDateString() === queryDate.toDateString();
          });
          
          return {
            seatLabel: seat.seatLabel,
            seatIndex: seat.seatIndex,
            type: seat.type,
            status: seatStatus,  // Updated to reflect date-specific status
            isAvailable: !isBooked,  // Updated to reflect date-specific availability
            userId: dateSpecificBooking?.userId || null,  // Updated to show who booked for this date
            meta: seat.meta,
            departureDateBookings: seat.departureDateBookings
          };
        });

        // Count seats by status for the specific date
        availableSeats = (routeObj.bus as any).seatLayout.seats.filter((seat: any) => 
          seat.status === 'available'
        ).length;
        
        bookedSeats = (routeObj.bus as any).seatLayout.seats.filter((seat: any) => 
          seat.status === 'booked'
        ).length;
        
        heldSeats = (routeObj.bus as any).seatLayout.seats.filter((seat: any) => 
          seat.status === 'selected'
        ).length;
      } else {
        // Without date filter, show general seat availability
        availableSeats = seats.filter((seat: any) => 
          seat.status === 'available' || seat.isAvailable === true
        ).length;
        
        bookedSeats = seats.filter((seat: any) => 
          seat.status === 'booked'
        ).length;
        
        heldSeats = seats.filter((seat: any) => 
          seat.status === 'held' || seat.status === 'selected'
        ).length;
      }
      const fare = await calculateFare(routeObj._id as string, tripType as string);
      (routeObj as any).tax = parseFloat((fare * 0.10).toFixed(2)) as any;
      (routeObj as any).baseFare = fare as any;
      const routeWithSeatInfo = {
        ...routeObj,
        seatAvailability: {
          total: totalSeats,
          available: availableSeats,
          booked: bookedSeats,
          held: heldSeats,
          availableSeats: availableSeats,
          ...(date && { departureDate: date })
        }
      };
      
      return ResponseUtil.successResponse(
        res, 
        STATUS_CODES.SUCCESS, 
        { route: routeWithSeatInfo }, 
        ADMIN_CONSTANTS.ROUTE_FETCHED
      );
    }
    const fare = await calculateFare(routeObj._id as string, tripType as string);
    (routeObj as any).baseFare = fare as any;
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { route: routeObj }, ADMIN_CONSTANTS.ROUTE_FETCHED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

/**
 * Get filter options for routes (destinations, buses, days, etc.)
 */
export const getRouteFilterOptions = async (req: Request, res: Response) => {
  try {
    // Get all active destinations
    const destinations = await Destination.find({ 
      isActive: true, 
      isDeleted: false 
    }).select('name description priceToDFW priceFromDFW priceRoundTrip').sort({ name: 1 });

    // Get all active buses
    const buses = await Bus.find({ 
      isActive: true 
    }).select('code serialNumber capacity').sort({ code: 1 });

    // Get unique days from routes
    const dayTimeData = await RouteModel.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$dayTime' },
      { $group: { _id: '$dayTime.day' } },
      { $sort: { _id: 1 } }
    ]);

    const availableDays = dayTimeData.map(item => item._id);

    // Get time ranges from routes
    const timeData = await RouteModel.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$dayTime' },
      { 
        $group: { 
          _id: null, 
          minTime: { $min: '$dayTime.time' },
          maxTime: { $max: '$dayTime.time' }
        } 
      }
    ]);

    const timeRange = timeData.length > 0 ? {
      min: timeData[0].minTime,
      max: timeData[0].maxTime
    } : null;

    // Get popular routes (most frequently used)
    const popularRoutes = await RouteModel.aggregate([
      { $match: { isActive: true } },
      { 
        $lookup: {
          from: 'destinations',
          localField: 'origin',
          foreignField: '_id',
          as: 'originData'
        }
      },
      { 
        $lookup: {
          from: 'destinations',
          localField: 'destination',
          foreignField: '_id',
          as: 'destinationData'
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          origin: { $arrayElemAt: ['$originData.name', 0] },
          destination: { $arrayElemAt: ['$destinationData.name', 0] },
          dayTimeCount: { $size: '$dayTime' }
        }
      },
      { $sort: { dayTimeCount: -1 } },
      { $limit: 10 }
    ]);

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        destinations,
        buses,
        availableDays,
        timeRange,
        popularRoutes,
        tripTypes: [
          { value: 'one-way', label: 'One Way' },
          { value: 'round-trip', label: 'Round Trip' }
        ],
        sortOptions: [
          { value: 'createdAt', label: 'Date Created' },
          { value: 'name', label: 'Route Name' },
          { value: 'dayTime.time', label: 'Departure Time' }
        ]
      },
      'Filter options fetched successfully'
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

/**
 * Search routes by origin and destination names (for autocomplete)
 */
export const searchRoutes = async (req: Request, res: Response) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.toString().trim().length < 2) {
      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { routes: [] },
        'Search query too short'
      );
    }

    const searchQuery = q.toString().trim();
    
    const routes = await RouteModel.find({
      isActive: true,
      $or: [
        { name: { $regex: searchQuery, $options: 'i' } },
        { 'origin.name': { $regex: searchQuery, $options: 'i' } },
        { 'destination.name': { $regex: searchQuery, $options: 'i' } }
      ]
    })
    .populate('origin', 'name description priceToDFW priceFromDFW priceRoundTrip')
    .populate('destination', 'name description priceToDFW priceFromDFW priceRoundTrip')
    .populate('bus', 'code serialNumber capacity seatLayout amenities')
    .limit(Number(limit))
    .sort({ name: 1 });

    // Calculate available seats for each route
    const routesWithSeatInfo = routes.map((route: any) => {
      const routeObj = route.toObject();
      
      if (routeObj.bus && routeObj.bus.seatLayout && routeObj.bus.seatLayout.seats) {
        const seats = routeObj.bus.seatLayout.seats;
        const totalSeats = seats.length;
        const availableSeats = seats.filter((seat: any) => 
          seat.status === 'available' && seat.isAvailable === true
        ).length;
        const bookedSeats = seats.filter((seat: any) => 
          seat.status === 'booked'
        ).length;
        const heldSeats = seats.filter((seat: any) => 
          seat.status === 'held' || seat.status === 'selected'
        ).length;

        return {
          ...routeObj,
          seatAvailability: {
            total: totalSeats,
            available: availableSeats,
            booked: bookedSeats,
            held: heldSeats,
            availableSeats: seats.filter((seat: any) => 
              seat.status === 'available' && seat.isAvailable === true
            )
          }
        };
      }
      
      return routeObj;
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { routes: routesWithSeatInfo },
      'Search results fetched successfully'
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const updateRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, origin, destination, bus, dayTime, intermediateStops, isActive } = req.body;
    const updateData: any = {};
    if (name) updateData.name = name;
    if (origin) updateData.origin = origin;
    if (destination) updateData.destination = destination;
    if (bus) updateData.bus = bus;
    if (dayTime) updateData.dayTime = dayTime;
    if (intermediateStops) updateData.intermediateStops = intermediateStops;
    if (typeof isActive === 'boolean') updateData.isActive = isActive?true:false;
    const route = await RouteModel.findByIdAndUpdate(id, updateData, { new: true });
    if (!route) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.ROUTE_NOT_FOUND);
    }
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { route }, ADMIN_CONSTANTS.ROUTE_UPDATED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const deleteRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const route = await RouteModel.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!route) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.ROUTE_NOT_FOUND);
    }
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { route }, ADMIN_CONSTANTS.ROUTE_DELETED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};
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

    // --- Conflict Detection Start ---
    if (bus && dayTime && dayTime.length > 0) {
      // 1. Check Bus Conflict: Is this bus already assigned to another route at the same time?
      const busConflict = await RouteModel.findOne({
        bus: bus,
        isActive: true,
        dayTime: {
          $elemMatch: {
            $or: dayTime.map((dt: any) => ({
              day: dt.day,
              time: dt.time
            }))
          }
        }
      });

      if (busConflict) {
        throw new CustomError(
          STATUS_CODES.CONFLICT, 
          `Bus conflict: Bus is already assigned to route '${busConflict.name}' at one of the requested times.`
        );
      }

      // 2. Check Driver Conflict: Is the driver of this bus assigned to ANY other bus at the same time?
      const busDetails = await Bus.findById(bus);
      if (busDetails) {
        // Check both driver fields
        const driverId = busDetails.driver || busDetails.mxdriverId;
        
        if (driverId) {
          // Find all buses assigned to this driver
          const driverBuses = await Bus.find({
            $or: [
              { driver: driverId },
              { mxdriverId: driverId }
            ],
            _id: { $ne: bus } // Exclude current bus
          }).select('_id');

          const driverBusIds = driverBuses.map(b => b._id);

          if (driverBusIds.length > 0) {
            const driverConflict = await RouteModel.findOne({
              bus: { $in: driverBusIds },
              isActive: true,
              dayTime: {
                $elemMatch: {
                  $or: dayTime.map((dt: any) => ({
                    day: dt.day,
                    time: dt.time
                  }))
                }
              }
            });

            if (driverConflict) {
              throw new CustomError(
                STATUS_CODES.CONFLICT, 
                `Driver conflict: The driver assigned to this bus is also assigned to route '${driverConflict.name}' (on a different bus) at one of the requested times.`
              );
            }
          }
        }
      }
    }
    // --- Conflict Detection End ---
 
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

    // Origin filter
    if (origin) {
      query.origin = origin;
    }

    // Destination filter
    if (destination) {
      query.destination = destination;
    }

    // Day filter (for specific day of week)
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

    // Search filter (searches in route name, origin, destination names)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'origin.name': { $regex: search, $options: 'i' } },
        { 'destination.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort options
    let sortOptions: Record<string, 1 | -1> = { updatedAt: -1 };
    
    if (sortBy) {
      const order = sortOrder === 'asc' ? 1 : -1;
      sortOptions = { [sortBy.toString()]: order };
    }

    // Build populate options
    const populateOptions = [
      { path: "origin", select: "name description priceToDFW priceFromDFW priceRoundTrip location" },
      { path: "destination", select: "name description priceToDFW priceFromDFW priceRoundTrip MinutesOfDifference location" },
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
      { path: "origin", select: "name description priceToDFW priceFromDFW priceRoundTrip location" },
      { path: "destination", select: "name description priceToDFW priceFromDFW priceRoundTrip location" },
      { path: "bus", select: "code serialNumber capacity seatLayout amenities" },
      { path: "intermediateStops", select: "name description" }
    ];

    const route = await RouteModel.findById(id).populate(populateOptions);

    if (!route) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.ROUTE_NOT_FOUND);
    }

    // Calculate fare
    const baseFare = await calculateFare((route as any)._id.toString(), tripType as string);
    
    // Get seat availability if date is provided
    let seatAvailability = null;
    if (date) {
      const routeObj = route.toObject ? route.toObject() : route;
      if (routeObj.bus && (routeObj.bus as any).seatLayout && (routeObj.bus as any).seatLayout.seats) {
        const seats = (routeObj.bus as any).seatLayout.seats;
        const totalSeats = seats.length;
        const targetDate = new Date(date as string);
        
        let availableSeats = 0;
        let bookedSeats = 0;
        let heldSeats = 0;

        // Helper function to get seat status for a specific date (reused)
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

          const bookingStatus = booking.status?.toLowerCase();

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

        seats.forEach((seat: any) => {
          const seatStatus = getSeatStatusForDate(seat, targetDate);
          if (seatStatus === 'available') availableSeats++;
          else if (seatStatus === 'booked') bookedSeats++;
          else if (seatStatus === 'selected') heldSeats++;
        });

        seatAvailability = {
          total: totalSeats,
          available: availableSeats,
          booked: bookedSeats,
          held: heldSeats,
          departureDate: date
        };
      }
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { 
        route: {
          ...route.toObject(),
          baseFare,
          ...(seatAvailability && { seatAvailability })
        }
      },
      ADMIN_CONSTANTS.ROUTE_FETCHED
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
    const {
      name,
      origin,
      destination,
      bus,
      dayTime,
      intermediateStops,
      isActive
    } = req.body;

    const route = await RouteModel.findById(id);

    if (!route) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.ROUTE_NOT_FOUND);
    }

    // Check if name is being updated and if it already exists
    if (name && name !== route.name) {
      const existingRoute = await RouteModel.findOne({
        name: name,
      });

      if (existingRoute) {
        throw new CustomError(STATUS_CODES.CONFLICT, "Route with this name already exists");
      }
    }

    // Update fields
    if (name) route.name = name;
    if (origin) route.origin = origin;
    if (destination) route.destination = destination;
    if (bus) route.bus = bus;
    if (dayTime) route.dayTime = dayTime;
    if (intermediateStops) route.intermediateStops = intermediateStops;
    if (isActive !== undefined) route.isActive = isActive;

    const updatedRoute = await route.save();

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        route: {
          id: updatedRoute._id,
          name: updatedRoute.name,
          origin: updatedRoute.origin,
          destination: updatedRoute.destination,
          bus: updatedRoute.bus,
          dayTime: updatedRoute.dayTime,
          intermediateStops: updatedRoute.intermediateStops,
          isActive: updatedRoute.isActive,
        }
      },
      ADMIN_CONSTANTS.ROUTE_UPDATED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const deleteRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const route = await RouteModel.findById(id);

    if (!route) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.ROUTE_NOT_FOUND);
    }

    await RouteModel.findByIdAndDelete(id);

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {},
      ADMIN_CONSTANTS.ROUTE_DELETED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const getRouteFilterOptions = async (req: Request, res: Response) => {
  try {
    const origins = await RouteModel.distinct("origin");
    const destinations = await RouteModel.distinct("destination");
    
    // Populate origin and destination details
    const populatedOrigins = await Destination.find({ _id: { $in: origins } }).select('name');
    const populatedDestinations = await Destination.find({ _id: { $in: destinations } }).select('name');

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        origins: populatedOrigins,
        destinations: populatedDestinations
      },
      "Filter options fetched successfully"
    );
  } catch (err) {
    ResponseUtil.handleError(res, err);
  }
};

export const searchRoutes = async (req: Request, res: Response) => {
  return getRoutes(req, res);
};
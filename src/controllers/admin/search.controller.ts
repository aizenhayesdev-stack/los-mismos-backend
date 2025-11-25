import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/statusCodes";
import ResponseUtil from "../../utils/Response/responseUtils";
import { CustomError } from "../../classes/CustomError";
import AuthModel from "../../models/auth.model";
import PassengerModel from "../../models/passenger.models";
import { UserRole } from "../../models/common/types";

// Global Search
export const globalSearch = async (req: Request, res: Response) => {
  try {
    const { q, type = 'all' } = req.query;
    const searchTerm = q as string;

    if (!searchTerm || searchTerm.length < 2) {
      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { results: [] },
        "Search term too short"
      );
    }

    const results: any[] = [];

    // Search Customers
    if (type === 'all' || type === 'customer' || type === 'email' || type === 'phone' || type === 'name') {
      const customerQuery: any = {
        role: UserRole.CUSTOMER,
        deletedAt: null,
        $or: []
      };

      if (type === 'all' || type === 'email') {
        customerQuery.$or.push({ email: { $regex: searchTerm, $options: 'i' } });
      }
      
      // For name search, we need to look at the populated profile, but Mongoose doesn't support 
      // deep filtering easily in a single query without aggregation. 
      // For simplicity in this implementation, we'll search email first, and if we need name search,
      // we might need a more complex aggregation pipeline.
      // However, let's try to find by email first as it's the primary identifier in Auth.
      
      // If we strictly need name search, we should use aggregation lookup.
      // Let's stick to email for Auth model search for now, and maybe phone if it was in Auth.
      // But phone is in Profile.
      
      // Better approach: Aggregation to join Profile and filter
      const customerAggregation = [
        {
          $match: {
            role: UserRole.CUSTOMER,
            deletedAt: null
          }
        },
        {
          $lookup: {
            from: 'profiles',
            localField: 'profile',
            foreignField: '_id',
            as: 'profileData'
          }
        },
        { $unwind: '$profileData' },
        {
          $match: {
            $or: [
              { email: { $regex: searchTerm, $options: 'i' } },
              { 'profileData.firstName': { $regex: searchTerm, $options: 'i' } },
              { 'profileData.lastName': { $regex: searchTerm, $options: 'i' } },
              { 'profileData.phoneNumber': { $regex: searchTerm, $options: 'i' } }
            ]
          }
        },
        { $limit: 10 }
      ];

      const customers = await AuthModel.aggregate(customerAggregation);

      customers.forEach(customer => {
        results.push({
          type: 'customer',
          id: customer._id,
          title: `${customer.profileData.firstName} ${customer.profileData.lastName}`,
          subtitle: `${customer.email} | ${customer.profileData.phoneNumber || 'No Phone'}`,
          matchType: 'customer_details'
        });
      });
    }

    // Search Bookings
    if (type === 'all' || type === 'bookingRef') {
      const bookingQuery = {
        $or: [
          { ticketNumber: { $regex: searchTerm, $options: 'i' } },
          { groupTicketSerial: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      const bookings = await PassengerModel.find(bookingQuery)
        .limit(10)
        .populate('user', 'email');

      bookings.forEach(booking => {
        results.push({
          type: 'booking',
          id: booking._id,
          title: `Booking #${booking.ticketNumber}`,
          subtitle: `${booking.fullName} - ${booking.From} to ${booking.To}`,
          matchType: 'bookingRef',
          relatedUserId: booking.user?._id
        });
      });
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { results },
      "Search results fetched successfully"
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/statusCodes";
import ResponseUtil from "../../utils/Response/responseUtils";
import { CustomError } from "../../classes/CustomError";
import AuthModel from "../../models/auth.model";
import PassengerModel from "../../models/passenger.models";
import { UserRole } from "../../models/common/types";
import helper from "../../helper";

// Get All Customers
export const getCustomers = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, isActive, sortBy, sortOrder, isProfileCompleted } = req.query;

    const pipeline: any[] = [
      {
        $match: {
          role: UserRole.CUSTOMER,
          deletedAt: null,
          isVerified: true
        }
      },
      {
        $lookup: {
          from: "profiles",
          localField: "profile",
          foreignField: "_id",
          as: "profile"
        }
      },
      {
        $unwind: {
          path: "$profile",
          preserveNullAndEmptyArrays: true
        }
      }
    ];

    if (isProfileCompleted) {
      pipeline.push({
        $match: {
          isProfileCompleted: isProfileCompleted === 'true'
        }
      });
    }

    if (isActive !== undefined) {
      pipeline.push({
        $match: {
          isActive: isActive === 'true'
        }
      });
    }

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { email: { $regex: search, $options: 'i' } },
            { "profile.firstName": { $regex: search, $options: 'i' } },
            { "profile.secondName": { $regex: search, $options: 'i' } },
            { "profile.lastName": { $regex: search, $options: 'i' } },
            { "profile.phoneNumber": { $regex: search, $options: 'i' } }
          ]
        }
      });
    }

    const sort: any = {};
    if (sortBy) {
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.createdAt = -1;
    }

    const options = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      sort
    };

    const result = await helper.PaginateHelper.customAggregation("customers", AuthModel as any, pipeline, options);

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      result,
      "Customers fetched successfully"
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Get Customer Details
export const getCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const customer = await AuthModel.findOne({
      _id: id,
      role: UserRole.CUSTOMER,
      deletedAt: null
    }).populate("profile");

    if (!customer) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, "Customer not found");
    }

    // Get trip statistics
    const totalTrips = await PassengerModel.countDocuments({ user: id, isCancelled: false });
    const cancelledTrips = await PassengerModel.countDocuments({ user: id, isCancelled: true });
    
    // Get recent bookings
    const recentBookings = await PassengerModel.find({ user: id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("busId", "busNumber");

    // Calculate total spent (approximate)
    const bookings = await PassengerModel.find({ user: id, isCancelled: false });
    const totalSpent = bookings.reduce((sum, booking) => sum + (booking.price || 0), 0);

    const stats = {
      totalTrips,
      cancelledTrips,
      totalSpent,
      lastTripDate: recentBookings[0]?.DepartureDate || null
    };

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { 
        customer,
        stats,
        recentBookings
      },
      "Customer details fetched successfully"
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Toggle Customer Status
export const toggleCustomerStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;

    const customer = await AuthModel.findOne({
      _id: id,
      role: UserRole.CUSTOMER,
      deletedAt: null
    });

    if (!customer) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, "Customer not found");
    }

    // Update status
    if(isActive === true){
      customer.isActive = isActive;
      customer.reason = null;
    }else{
      customer.isActive = isActive;
      customer.reason = reason;
    }
    await customer.save();

    // TODO: Log the action and reason if audit logging is implemented

    const message = isActive ? "Customer activated successfully" : "Customer suspended successfully";

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { 
        userId: customer._id,
        isActive: customer.isActive,
        updatedAt: customer.updatedAt
      },
      message
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

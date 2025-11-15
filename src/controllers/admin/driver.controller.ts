import { Request, Response } from "express";
import ResponseUtil from "../../utils/Response/responseUtils";
import { STATUS_CODES } from "../../constants/statusCodes";
import { ADMIN_CONSTANTS, AUTH_CONSTANTS } from "../../constants/messages";
import { CustomError } from "../../classes/CustomError";
import AuthModel from "../../models/auth.model";
import { SALT_ROUNDS } from "../../config/environment";
import bcrypt from "bcrypt";
import ProfileModel from "../../models/profile.model";
import { UserRole, TripStatus } from "../../models";
import helper from "../../helper";
// import TripModel from "../../models/trip.model";
// import RouteModel from "../../models/route.model";
// import BusModel from "../../models/bus.model";
export const createDriver = async (req: Request, res: Response) => {
    try {
    let { firstName, secondName, lastName, email, password, driverLicenseId } = req.body;
    email=email.toLowerCase();
    const userExist = await AuthModel.findOne({ email });
    if (userExist) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, AUTH_CONSTANTS.USER_ALREADY_EXISTS);
    }
    const salt = await bcrypt.genSalt(Number(SALT_ROUNDS));
    const hashPassword = await bcrypt.hash(password, salt);
    const checkDriverLicenseId = await ProfileModel.findOne({ documents: { driverLicenseId } });
    if (checkDriverLicenseId) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, AUTH_CONSTANTS.DRIVER_LICENSE_ID_ALREADY_EXISTS);
    }
    const auth = await AuthModel.create({ email, password: hashPassword, role: UserRole.DRIVER,isProfileCompleted: true });
    const driver = await ProfileModel.create({ auth: auth._id, firstName, secondName, lastName, documents: { driverLicenseId } });
    await AuthModel.findByIdAndUpdate(auth._id, { profile: driver._id });
      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        {driver},
        ADMIN_CONSTANTS.DRIVER_CREATED
      );
    } catch (err) {
      if (err instanceof CustomError)
        return ResponseUtil.errorResponse(res, err.statusCode, err.message);
      ResponseUtil.handleError(res, err);
    }
  };

export const getDrivers = async (req: Request, res: Response) => {
    try {
      const { page, limit } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const query = { role: UserRole.DRIVER, isActive: true , isDeleted: false, isProfileCompleted: true};
      const options = {
        page: Number(page),
        limit: Number(limit),
        sort: { createdAt: -1 } as Record<string, 1 | -1>,
        select: "-password",
        populate: [{ path: "profile", select: "firstName secondName lastName documents" }]
      };
      const drivers = await helper.PaginateHelper.customPaginate("drivers", AuthModel as any, query, options);
        return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { drivers }, ADMIN_CONSTANTS.DRIVERS_FETCHED);
    } catch (err) {
        if (err instanceof CustomError)
            return ResponseUtil.errorResponse(res, err.statusCode, err.message);
        ResponseUtil.handleError(res, err);
    }
}

export const updateDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let { firstName, secondName, lastName, driverLicenceId, userName, password } = req.body;
    if (userName) {
      const email=userName.toLowerCase();
      userName=email
      const emailExist = await AuthModel.findOne({ email });
      if (emailExist) {
        throw new CustomError(STATUS_CODES.BAD_REQUEST, AUTH_CONSTANTS.USER_ALREADY_EXISTS);
      }
    }
    const driver = await AuthModel.findById(id).populate("profile");
    if (!driver) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.DRIVER_NOT_FOUND);
    }

    // Update Auth model fields
    const authUpdateData: any = {};
    if (userName) authUpdateData.email = userName;
    if (password) {
      const salt = await bcrypt.genSalt(Number(SALT_ROUNDS));
      const hashPassword = await bcrypt.hash(password, salt);
      authUpdateData.password = hashPassword;
    }

    // Update Profile model fields
    const profileUpdateData: any = {};
    if (firstName) profileUpdateData.firstName = firstName;
    if (secondName) profileUpdateData.secondName = secondName;
    if (lastName) profileUpdateData.lastName = lastName;
    
    // Handle nested documents update separately
    const nestedUpdates: any = {};
    if (driverLicenceId) {
      nestedUpdates["documents.driverLicenseId"] = driverLicenceId;
    }

    // Update both models
    if (Object.keys(authUpdateData).length > 0) {
      await AuthModel.findByIdAndUpdate(id, authUpdateData);
    }
    
    if (driver.profile) {
      // Update simple fields
      if (Object.keys(profileUpdateData).length > 0) {
        await ProfileModel.findByIdAndUpdate((driver.profile as any)._id, profileUpdateData);
      }
      // Update nested fields using $set
      if (Object.keys(nestedUpdates).length > 0) {
        await ProfileModel.findByIdAndUpdate((driver.profile as any)._id, { $set: nestedUpdates });
      }
    }

    // Fetch updated driver with populated profile
    const updatedDriver = await AuthModel.findById(id).populate("profile");
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { driver: updatedDriver }, ADMIN_CONSTANTS.DRIVER_UPDATED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
}

export const deleteDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const driver = await AuthModel.findById(id).populate("profile");
    if (!driver) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.DRIVER_NOT_FOUND);
    }
    
    if (driver.profile) {
      const updatedProfile = await ProfileModel.findByIdAndUpdate(
        (driver.profile as any)._id, 
        { isDeleted: true }, 
        { new: true }
      );
      return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { driver: updatedProfile }, ADMIN_CONSTANTS.DRIVER_DELETED);
    }
    
    return ResponseUtil.successResponse(res, STATUS_CODES.SUCCESS, { driver: null }, ADMIN_CONSTANTS.DRIVER_DELETED);
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
}


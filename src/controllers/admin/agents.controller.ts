import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/statusCodes";
import ResponseUtil from "../../utils/Response/responseUtils";
import { ADMIN_CONSTANTS } from "../../constants/messages";
import { CustomError } from "../../classes/CustomError";
import AuthModel from "../../models/auth.model";
import Profile from "../../models/profile.model";
import OfficeModel from "../../models/office.model";
import helper from "../../helper";
import { UserRole, ObjectId, Gender } from "../../models/common/types";
import bcrypt from "bcrypt";

// Create Agent
export const createAgent = async (req: Request, res: Response) => {
  try {
    let { 
      username, 
      firstName, 
      secondName,
      lastName, 
      role, 
      password, 
      salesOfficeId, 
      isActive = true 
    } = req.body;
    username = username.toLowerCase();

    // Check if auth with same email already exists
    const existingAuth = await AuthModel.findOne({
      email: username,
      deletedAt: null
    });

    if (existingAuth) {
      throw new CustomError(STATUS_CODES.CONFLICT, ADMIN_CONSTANTS.AGENT_ALREADY_EXISTS);
    }

    // Validate sales office if provided
    if (salesOfficeId) {
      const office = await OfficeModel.findById(salesOfficeId);
      if (!office) {
        throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.SALES_OFFICE_NOT_FOUND);
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(Number(process.env.SALT_ROUNDS || 12));
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new auth record
    const newAuth = new AuthModel({
      email: username,
      password: hashedPassword,
      role: role,
      isActive: isActive,
      isVerified: true, // Agents are auto-verified
      isProfileCompleted: false
    });

    const savedAuth = await newAuth.save();

    // Create profile for the agent
    const newProfile = new Profile({
      auth: savedAuth._id,
      firstName: firstName,
      secondName: secondName,
      lastName: lastName,
      gender: Gender.PREFER_NOT_SAY,
      office: salesOfficeId ? salesOfficeId as ObjectId : undefined
    });

    const savedProfile = await newProfile.save();

    // Update auth with profile reference
    savedAuth.profile = savedProfile._id as ObjectId;
    await savedAuth.save();


    // Populate the response
    const populatedAuth = await AuthModel.findById(savedAuth._id)
      .populate([{path: 'profile', select: 'firstName lastName secondName role office',populate: {path: 'office', select: 'name'}}])
      .select('-password');

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.CREATED,
      {
        agent: populatedAuth
      },
      ADMIN_CONSTANTS.AGENT_CREATED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Get All Agents
export const getAgents = async (req: Request, res: Response) => {
  try {
    const { page, limit, role, isActive, search } = req.query;
    
    // Build query
    const query: any = { 
      deletedAt: null,
      role: { $in: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.CASHIER] }
    };

    if (role) {
      query.role = role;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      sort: { updatedAt: -1 } as Record<string, 1 | -1>,
      populate: [
        { path: "profile", select: "firstName lastName secondName role", populate: { path: "office", select: "name description" } }
      ]
    };

    const agents = await helper.PaginateHelper.customPaginate("auths", AuthModel as any, query, options);
    
    return ResponseUtil.successResponse(
      res, 
      STATUS_CODES.SUCCESS, 
      { agents }, 
      ADMIN_CONSTANTS.AGENTS_FETCHED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Get Single Agent
export const getAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const agent = await AuthModel.findOne({
      _id: id,
      deletedAt: null,
      role: { $in: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.CASHIER] }
    })
    .populate([{path: 'profile', select: 'firstName lastName secondName office role'}, {path: 'office', select: 'name'}])
    .select('-password');

    if (!agent) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.AGENT_NOT_FOUND);
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { agent },
      ADMIN_CONSTANTS.AGENT_FETCHED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Update Agent
export const updateAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      username, 
      firstName, 
      secondName,
      lastName, 
      role, 
      password, 
      isActive,
      salesOfficeId
    } = req.body;

    // Find agent
    const agent = await AuthModel.findOne({
      _id: id,
      deletedAt: null,
      role: { $in: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.CASHIER] }
    });

    if (!agent) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.AGENT_NOT_FOUND);
    }

    // Check if username is being changed and if it already exists
    if (username && username !== agent.email) {
      const existingAuth = await AuthModel.findOne({
        email: username,
        deletedAt: null,
        _id: { $ne: id }
      });

      if (existingAuth) {
        throw new CustomError(STATUS_CODES.CONFLICT, ADMIN_CONSTANTS.AGENT_ALREADY_EXISTS);
      }
    }

    // Update auth fields
    const updateData: any = {};
    
    if (username) updateData.email = username;
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    if (password) {
      const salt = await bcrypt.genSalt(Number(process.env.SALT_ROUNDS || 12));
      updateData.password = await bcrypt.hash(password, salt);
    }

    // Update auth
    const updatedAuth = await AuthModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate({ path: 'profile', select: 'firstName lastName secondName role', populate: { path: 'office', select: 'name description' } })

    // Update profile if firstName, secondName, lastName, or salesOfficeId provided
    if (firstName || secondName || lastName || salesOfficeId) {
      const profileUpdate: any = {};
      if (firstName) profileUpdate.firstName = firstName;
      if (secondName) profileUpdate.secondName = secondName;
      if (lastName) profileUpdate.lastName = lastName;
      if (salesOfficeId) profileUpdate.office = salesOfficeId as ObjectId;
      await Profile.findByIdAndUpdate(agent.profile, profileUpdate);
      
      // Re-populate to get updated profile
      const updatedAuthWithProfile = await AuthModel.findById(id)
        .populate({ path: 'profile', select: 'firstName lastName secondName role', populate: { path: 'office', select: 'name description' } })
        .select('-password');
      
      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { agent: updatedAuthWithProfile },
        ADMIN_CONSTANTS.AGENT_UPDATED
      );
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { agent: updatedAuth },
      ADMIN_CONSTANTS.AGENT_UPDATED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Delete Agent (Soft Delete)
export const deleteAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const agent = await AuthModel.findOne({
      _id: id,
      deletedAt: null,
      role: { $in: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.CASHIER] }
    });

    if (!agent) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.AGENT_NOT_FOUND);
    }

    // Soft delete
    await AuthModel.findByIdAndUpdate(id, {
      deletedAt: new Date(),
      isActive: false
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {},
      ADMIN_CONSTANTS.AGENT_DELETED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Toggle Agent Status
export const toggleAgentStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const agent = await AuthModel.findOne({
      _id: id,
      deletedAt: null,
      role: { $in: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.CASHIER] }
    });

    if (!agent) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, ADMIN_CONSTANTS.AGENT_NOT_FOUND);
    }

    const newStatus = !agent.isActive;
    
    await AuthModel.findByIdAndUpdate(id, { isActive: newStatus });

    const message = newStatus ? ADMIN_CONSTANTS.AGENT_ACTIVATED : ADMIN_CONSTANTS.AGENT_DEACTIVATED;

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { isActive: newStatus },
      message
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

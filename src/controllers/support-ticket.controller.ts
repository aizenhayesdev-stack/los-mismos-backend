import { Response } from "express";
import { CustomRequest } from "../interfaces/auth";
import ResponseUtil from "../utils/Response/responseUtils";
import { STATUS_CODES } from "../constants/statusCodes";
import SupportTicketModel, { TicketStatus, TicketPriority } from "../models/support-ticket.model";
import AuthModel from "../models/auth.model";
import ProfileModel from "../models/profile.model";
import { UserRole } from "../models/common/types";
import mongoose from "mongoose";

/**
 * Create a new support ticket (Customer only)
 */
export const createTicket = async (req: CustomRequest, res: Response) => {
  try {
    const { subject, description, category, priority } = req.body;
    const customerId = req.authId;

    if (!customerId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, "User not authenticated");
    }

    // Verify user exists
    const user = await AuthModel.findById(customerId);
    if (!user) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "User not found");
    }

    // Create ticket
    const ticket = new SupportTicketModel({
      customerId,
      subject,
      description,
      category,
      priority: priority || TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
    });

    await ticket.save();

    // Populate customer info
    await ticket.populate({
      path: "customerId",
      select: "email",
      populate: {
        path: "profile",
        select: "firstName lastName",
      },
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.CREATED,
      ticket,
      "Support ticket created successfully"
    );
  } catch (error: any) {
    return ResponseUtil.errorResponse(
      res,
      STATUS_CODES.INTERNAL_SERVER_ERROR,
      error.message || "Failed to create support ticket"
    );
  }
};

/**
 * Get tickets for customer (Customer only)
 * Query params: status, page, limit
 */
export const getCustomerTickets = async (req: CustomRequest, res: Response) => {
  try {
    const customerId = req.authId;
    const { status, page = 1, limit = 10 } = req.query;

    if (!customerId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, "User not authenticated");
    }

    // Build query
    const query: any = { customerId };
    if (status) {
      query.status = status;
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Get tickets
    const tickets = await SupportTicketModel.find(query)
      .populate({
        path: "customerId",
        select: "email",
        populate: {
          path: "profile",
          select: "firstName lastName",
        },
      })
      .populate({
        path: "assignedTo",
        select: "email",
        populate: {
          path: "profile",
          select: "firstName lastName",
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count
    const total = await SupportTicketModel.countDocuments(query);

    // Format response with username
    const formattedTickets = tickets.map((ticket: any) => {
      const customerProfile = ticket.customerId?.profile;
      const customerName = customerProfile
        ? `${customerProfile.firstName || ""} ${customerProfile.lastName || ""}`.trim() || ticket.customerId?.email
        : ticket.customerId?.email || "Unknown";

      return {
        ...ticket,
        generatedBy: customerName,
        assignedToName: ticket.assignedTo?.profile
          ? `${ticket.assignedTo.profile.firstName || ""} ${ticket.assignedTo.profile.lastName || ""}`.trim() || ticket.assignedTo?.email
          : ticket.assignedTo?.email || null,
      };
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        tickets: formattedTickets,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      "Tickets retrieved successfully"
    );
  } catch (error: any) {
    return ResponseUtil.errorResponse(
      res,
      STATUS_CODES.INTERNAL_SERVER_ERROR,
      error.message || "Failed to retrieve tickets"
    );
  }
};

/**
 * Get all tickets (Admin/Manager only)
 * Query params: status, generatedBy (username), page, limit
 */
export const getAllTickets = async (req: CustomRequest, res: Response) => {
  try {
    const { status, generatedBy, page = 1, limit = 10 } = req.query;

    // Build query
    const query: any = {};

    if (status) {
      query.status = status;
    }

    // If generatedBy is provided, search by customer name or email
    if (generatedBy) {
      const searchTerm = generatedBy as string;
      
      // Search by email in Auth
      const customersByEmail = await AuthModel.find({
        email: { $regex: searchTerm, $options: "i" },
      })
        .select("_id")
        .lean();

      // Search by name in Profile
      const profilesByName = await ProfileModel.find({
        $or: [
          { firstName: { $regex: searchTerm, $options: "i" } },
          { lastName: { $regex: searchTerm, $options: "i" } },
        ],
      })
        .select("auth")
        .lean();

      const customerIdsFromEmail = customersByEmail.map((c: any) => c._id);
      const customerIdsFromProfile = profilesByName.map((p: any) => p.auth);
      const allCustomerIds = [...new Set([...customerIdsFromEmail, ...customerIdsFromProfile])];

      if (allCustomerIds.length > 0) {
        query.customerId = { $in: allCustomerIds };
      } else {
        // No matching customers, return empty result
        return ResponseUtil.successResponse(
          res,
          STATUS_CODES.SUCCESS,
          {
            tickets: [],
            pagination: {
              page: parseInt(page as string),
              limit: parseInt(limit as string),
              total: 0,
              totalPages: 0,
            },
          },
          "No tickets found"
        );
      }
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Get tickets
    const tickets = await SupportTicketModel.find(query)
      .populate({
        path: "customerId",
        select: "email",
        populate: {
          path: "profile",
          select: "firstName lastName",
        },
      })
      .populate({
        path: "assignedTo",
        select: "email",
        populate: {
          path: "profile",
          select: "firstName lastName",
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count
    const total = await SupportTicketModel.countDocuments(query);

    // Format response with username
    const formattedTickets = tickets.map((ticket: any) => {
      const customerProfile = ticket.customerId?.profile;
      const customerName = customerProfile
        ? `${customerProfile.firstName || ""} ${customerProfile.lastName || ""}`.trim() || ticket.customerId?.email
        : ticket.customerId?.email || "Unknown";

      return {
        ...ticket,
        generatedBy: customerName,
        assignedToName: ticket.assignedTo?.profile
          ? `${ticket.assignedTo.profile.firstName || ""} ${ticket.assignedTo.profile.lastName || ""}`.trim() || ticket.assignedTo?.email
          : ticket.assignedTo?.email || null,
      };
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        tickets: formattedTickets,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      "Tickets retrieved successfully"
    );
  } catch (error: any) {
    return ResponseUtil.errorResponse(
      res,
      STATUS_CODES.INTERNAL_SERVER_ERROR,
      error.message || "Failed to retrieve tickets"
    );
  }
};

/**
 * Get single ticket by ID
 */
export const getTicketById = async (req: CustomRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const userId = req.authId;
    const userRole = req.role;

    if (!userId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, "User not authenticated");
    }

    // Get ticket
    const ticket = await SupportTicketModel.findById(ticketId)
      .populate({
        path: "customerId",
        select: "email",
        populate: {
          path: "profile",
          select: "firstName lastName",
        },
      })
      .populate({
        path: "assignedTo",
        select: "email",
        populate: {
          path: "profile",
          select: "firstName lastName",
        },
      })
      .populate({
        path: "comments.authorId",
        select: "email",
        populate: {
          path: "profile",
          select: "firstName lastName",
        },
      })
      .lean();

    if (!ticket) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Ticket not found");
    }

    // Check permissions: customer can only view their own tickets
    if (userRole === UserRole.CUSTOMER && ticket.customerId._id.toString() !== userId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.FORBIDDEN, "Access denied");
    }

    // Format response
    const customerProfile = (ticket as any).customerId?.profile;
    const customerName = customerProfile
      ? `${customerProfile.firstName || ""} ${customerProfile.lastName || ""}`.trim() || (ticket as any).customerId?.email
      : (ticket as any).customerId?.email || "Unknown";

    const formattedTicket = {
      ...ticket,
      generatedBy: customerName,
      assignedToName: (ticket as any).assignedTo?.profile
        ? `${(ticket as any).assignedTo.profile.firstName || ""} ${(ticket as any).assignedTo.profile.lastName || ""}`.trim() || (ticket as any).assignedTo?.email
        : (ticket as any).assignedTo?.email || null,
      comments: (ticket as any).comments?.map((comment: any) => {
        const authorProfile = comment.authorId?.profile;
        const authorName = authorProfile
          ? `${authorProfile.firstName || ""} ${authorProfile.lastName || ""}`.trim() || comment.authorId?.email
          : comment.authorId?.email || "Unknown";
        return {
          ...comment,
          authorName,
        };
      }) || [],
    };

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      formattedTicket,
      "Ticket retrieved successfully"
    );
  } catch (error: any) {
    return ResponseUtil.errorResponse(
      res,
      STATUS_CODES.INTERNAL_SERVER_ERROR,
      error.message || "Failed to retrieve ticket"
    );
  }
};

/**
 * Update ticket status (Admin/Manager only)
 */
export const updateTicketStatus = async (req: CustomRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;
    const userId = req.authId;

    if (!userId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, "User not authenticated");
    }

    // Get ticket
    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Ticket not found");
    }

    // Update status
    ticket.status = status as TicketStatus;
    await ticket.save();

    // Populate for response
    await ticket.populate({
      path: "customerId",
      select: "email",
      populate: {
        path: "profile",
        select: "firstName lastName",
      },
    });

    await ticket.populate({
      path: "assignedTo",
      select: "email",
      populate: {
        path: "profile",
        select: "firstName lastName",
      },
    });

    const customerProfile = (ticket.customerId as any)?.profile;
    const customerName = customerProfile
      ? `${customerProfile.firstName || ""} ${customerProfile.lastName || ""}`.trim() || (ticket.customerId as any)?.email
      : (ticket.customerId as any)?.email || "Unknown";

    const formattedTicket = {
      ...ticket.toObject(),
      generatedBy: customerName,
    };

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      formattedTicket,
      "Ticket status updated successfully"
    );
  } catch (error: any) {
    return ResponseUtil.errorResponse(
      res,
      STATUS_CODES.INTERNAL_SERVER_ERROR,
      error.message || "Failed to update ticket status"
    );
  }
};

/**
 * Add comment to ticket (Customer, Admin, Manager)
 */
export const addComment = async (req: CustomRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const { content } = req.body;
    const userId = req.authId;
    const userRole = req.role;

    if (!userId) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.UNAUTHORIZED,
        "User not authenticated"
      );
    }

    let ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Ticket not found"
      );
    }

    if (
      userRole === UserRole.CUSTOMER &&
      ticket.customerId.toString() !== userId
    ) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Access denied"
      );
    }

    // Determine author type
    let authorType: "customer" | "admin" | "manager" = "customer";
    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.CASHIER) {
      authorType = "admin";
    } else if (userRole === UserRole.MANAGER) {
      authorType = "manager";
    }

    // Add comment
    ticket.comments.push({
      authorId: new mongoose.Types.ObjectId(userId),
      authorType,
      content,
      createdAt: new Date(),
    });

    await ticket.save();

    // Reload with lean() + populated clean objects
    const populatedTicket = await SupportTicketModel.findById(ticketId)
      .populate({
        path: "customerId",
        select: "email profile",
        populate: {
          path: "profile",
          select: "firstName lastName",
        },
      })
      .populate({
        path: "comments.authorId",
        select: "email profile",
        populate: {
          path: "profile",
          select: "firstName lastName",
        },
      })
      .lean(); // IMPORTANT!

    // Format clean comments
    const formattedComments = populatedTicket?.comments?.map((c: any) => {
      const author = c.authorId;
      const name = author?.profile
        ? `${author.profile.firstName || ""} ${author.profile.lastName || ""}`.trim()
        : author?.email;
    
      return {
        _id: c._id,
        authorId: author?._id,
        authorType: c.authorType,
        content: c.content,
        createdAt: c.createdAt,
        authorName: name || "Unknown",
      };
    }) || [];

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        ...populatedTicket,
      },
      "Comment added successfully"
    );
  } catch (error: any) {
    return ResponseUtil.errorResponse(
      res,
      STATUS_CODES.INTERNAL_SERVER_ERROR,
      error.message || "Failed to add comment"
    );
  }
};


/**
 * Assign ticket to admin/manager (Admin/Manager only)
 */
export const assignTicket = async (req: CustomRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const { assignedTo } = req.body;
    const userId = req.authId;

    if (!userId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.UNAUTHORIZED, "User not authenticated");
    }

    // Verify assigned user exists and is admin/manager
    const assignedUser = await AuthModel.findById(assignedTo);
    if (!assignedUser) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Assigned user not found");
    }

    if (![UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.CASHIER].includes(assignedUser.role as UserRole)) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Ticket can only be assigned to admin or manager"
      );
    }

    // Get ticket
    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Ticket not found");
    }

    // Assign ticket
    ticket.assignedTo = new mongoose.Types.ObjectId(assignedTo);
    await ticket.save();

    // Populate for response
    await ticket.populate({
      path: "customerId",
      select: "email",
      populate: {
        path: "profile",
        select: "firstName lastName",
      },
    });

    await ticket.populate({
      path: "assignedTo",
      select: "email",
      populate: {
        path: "profile",
        select: "firstName lastName",
      },
    });

    const customerProfile = (ticket.customerId as any)?.profile;
    const customerName = customerProfile
      ? `${customerProfile.firstName || ""} ${customerProfile.lastName || ""}`.trim() || (ticket.customerId as any)?.email
      : (ticket.customerId as any)?.email || "Unknown";

    const formattedTicket = {
      ...ticket.toObject(),
      generatedBy: customerName,
      assignedToName: (ticket.assignedTo as any)?.profile
        ? `${(ticket.assignedTo as any).profile.firstName || ""} ${(ticket.assignedTo as any).profile.lastName || ""}`.trim() || (ticket.assignedTo as any)?.email
        : (ticket.assignedTo as any)?.email || null,
    };

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      formattedTicket,
      "Ticket assigned successfully"
    );
  } catch (error: any) {
    return ResponseUtil.errorResponse(
      res,
      STATUS_CODES.INTERNAL_SERVER_ERROR,
      error.message || "Failed to assign ticket"
    );
  }
};


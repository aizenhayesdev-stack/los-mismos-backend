import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/statusCodes";
import ResponseUtil from "../../utils/Response/responseUtils";
import { CustomError } from "../../classes/CustomError";
import UserManagementOperation, { OperationType, OperationStatus, AuditAction } from "../../models/user-management.model";
import AuthModel from "../../models/auth.model";
import Profile from "../../models/profile.model";
import { UserRole, Gender } from "../../models/common/types";
import bcrypt from "bcrypt";
import fs from 'fs';
import csv from 'csv-parser';

// Bulk Import Users (CSV)
export const bulkImportUsers = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { role } = req.body;
    const performedBy = (req as any).authId;

    if (!file) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, "No file uploaded");
    }

    // Create operation record
    const operation = await UserManagementOperation.create({
      operationType: OperationType.BULK_IMPORT,
      performedBy,
      status: OperationStatus.IN_PROGRESS,
      reason: "Bulk import via CSV",
      metadata: {
        source: 'bulk_import',
        csvFile: file.originalname
      },
      startedAt: new Date()
    });

    // Process CSV asynchronously
    processCsvImport(file.path, role, operation._id, performedBy);

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { 
        operationId: operation._id,
        status: OperationStatus.IN_PROGRESS 
      },
      "Bulk import processing started"
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Helper to process CSV
const processCsvImport = async (filePath: string, defaultRole: string, operationId: any, performedBy: string) => {
  const results: any[] = [];
  const errors: any[] = [];
  let successful = 0;
  let failed = 0;

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data: any) => results.push(data))
    .on('end', async () => {
      // Process each row
      for (const row of results) {
        try {
          const { email, firstName, lastName, phoneNumber, password, role } = row;
          
          if (!email || !password) {
            throw new Error("Email and password are required");
          }

          const userRole = role || defaultRole || UserRole.CUSTOMER;
          
          // Check if user exists
          const existingUser = await AuthModel.findOne({ email: email.toLowerCase() });
          if (existingUser) {
            throw new Error("User already exists");
          }

          // Create user
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(password, salt);

          const newUser = await AuthModel.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            role: userRole,
            isActive: true,
            isVerified: true,
            isProfileCompleted: true
          });

          await Profile.create({
            auth: newUser._id,
            firstName: firstName || 'Unknown',
            lastName: lastName || 'Unknown',
            phoneNumber: phoneNumber,
            gender: Gender.PREFER_NOT_SAY
          });

          successful++;
        } catch (err: any) {
          failed++;
          errors.push({
            email: row.email,
            error: err.message
          });
        }
      }

      // Update operation status
      await UserManagementOperation.findByIdAndUpdate(operationId, {
        status: OperationStatus.COMPLETED,
        completedAt: new Date(),
        result: {
          totalProcessed: results.length,
          successful,
          failed,
          errors
        }
      });

      // Clean up file
      fs.unlinkSync(filePath);
    });
};

// Bulk Update Users
export const bulkUpdateUsers = async (req: Request, res: Response) => {
  try {
    const { userIds, updates, reason } = req.body;
    const performedBy = (req as any).authId;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, "User IDs are required");
    }

    if (!updates || Object.keys(updates).length === 0) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, "Updates are required");
    }

    // Create operation record
    const operation = await UserManagementOperation.create({
      operationType: OperationType.BULK_UPDATE,
      performedBy,
      targetUsers: userIds,
      status: OperationStatus.IN_PROGRESS,
      reason: reason || "Bulk update",
      changes: Object.keys(updates).map(key => ({
        field: key,
        newValue: updates[key],
        oldValue: "VARIES",
        timestamp: new Date()
      })),
      startedAt: new Date()
    });

    // Perform updates
    const result = await AuthModel.updateMany(
      { _id: { $in: userIds } },
      { $set: updates }
    );

    // Update operation record
    await UserManagementOperation.findByIdAndUpdate(operation._id, {
      status: OperationStatus.COMPLETED,
      completedAt: new Date(),
      result: {
        totalProcessed: userIds.length,
        successful: result.modifiedCount,
        failed: userIds.length - result.modifiedCount,
        errors: []
      }
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { 
        operationId: operation._id,
        processed: userIds.length,
        successful: result.modifiedCount,
        failed: userIds.length - result.modifiedCount
      },
      "Bulk update completed"
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Get Bulk Operation Status
export const getBulkOperationStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const operation = await UserManagementOperation.findById(id)
      .populate('performedBy', 'email');

    if (!operation) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, "Operation not found");
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      operation,
      "Operation status fetched"
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

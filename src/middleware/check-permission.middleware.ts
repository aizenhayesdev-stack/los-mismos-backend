import { Response, NextFunction } from "express";
import { CustomRequest } from "../interfaces/auth";
import ResponseUtil from "../utils/Response/responseUtils";
import { STATUS_CODES } from "../constants/statusCodes";
import { PERMISSION_CONSTANTS } from "../constants/messages";
import RolePermission from "../models/role-permission.model";
import { UserRole } from "../models/common/types";
import { PermissionModule, PermissionAction } from "../models/permission.model";

/**
 * Middleware to check if the user has the required permission
 * @param module - The module to check permission for (e.g., 'tickets', 'agents')
 * @param action - The action to check permission for (e.g., 'view', 'create', 'edit', 'delete')
 */
export const checkPermission = (
  module: PermissionModule,
  action: PermissionAction
) => {
  return async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      // Get user role from the request
      const userRole = req.role;

      if (!userRole) {
        return ResponseUtil.errorResponse(
          res,
          STATUS_CODES.UNAUTHORIZED,
          "User role not found"
        );
      }

      // Super admin has all permissions by default
      if (userRole === UserRole.SUPER_ADMIN) {
        return next();
      }

      // Check if the role has the required permission
      const rolePermissions = await RolePermission.findOne({
        role: userRole,
        isActive: true,
      });

      if (!rolePermissions) {
        return ResponseUtil.errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          PERMISSION_CONSTANTS.PERMISSION_DENIED
        );
      }

      // Find the module permission
      const modulePermission = rolePermissions.permissions.find(
        (p) => p.module === module
      );

      if (!modulePermission || !modulePermission.actions.includes(action)) {
        return ResponseUtil.errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          PERMISSION_CONSTANTS.PERMISSION_DENIED
        );
      }

      // User has the required permission
      next();
    } catch (error) {
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.INTERNAL_SERVER_ERROR,
        "Error checking permissions"
      );
    }
  };
};

/**
 * Helper function to check if a user has a specific permission
 * Can be used in controllers or services
 */
export const hasPermission = async (
  userRole: UserRole,
  module: PermissionModule,
  action: PermissionAction
): Promise<boolean> => {
  try {
    // Super admin has all permissions
    if (userRole === UserRole.SUPER_ADMIN) {
      return true;
    }

    const rolePermissions = await RolePermission.findOne({
      role: userRole,
      isActive: true,
    });

    if (!rolePermissions) {
      return false;
    }

    const modulePermission = rolePermissions.permissions.find(
      (p) => p.module === module
    );

    return modulePermission
      ? modulePermission.actions.includes(action)
      : false;
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
};


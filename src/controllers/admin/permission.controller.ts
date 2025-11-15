import { Response } from "express";
import { CustomRequest } from "../../interfaces/auth";
import ResponseUtil from "../../utils/Response/responseUtils";
import { STATUS_CODES } from "../../constants/statusCodes";
import { PERMISSION_CONSTANTS } from "../../constants/messages";
import { CustomError } from "../../classes/CustomError";
import Permission, { PermissionModule, PermissionAction } from "../../models/permission.model";
import RolePermission from "../../models/role-permission.model";
import { UserRole } from "../../models/common/types";

/**
 * Initialize default permissions in the system
 * This should be called once during system setup
 */
export const initializePermissions = async (req: CustomRequest, res: Response) => {
  try {
    // Define all module-action combinations
    const permissionDefinitions = [
      // Dashboard
      { module: PermissionModule.DASHBOARD, action: PermissionAction.VIEW, description: 'View dashboard' },
      { module: PermissionModule.DASHBOARD, action: PermissionAction.EDIT, description: 'Edit dashboard settings' },
      { module: PermissionModule.DASHBOARD, action: PermissionAction.DELETE, description: 'Delete dashboard items' },
      
      // Tickets
      { module: PermissionModule.TICKETS, action: PermissionAction.VIEW, description: 'View tickets' },
      { module: PermissionModule.TICKETS, action: PermissionAction.CREATE, description: 'Create tickets' },
      { module: PermissionModule.TICKETS, action: PermissionAction.EDIT, description: 'Edit tickets' },
      { module: PermissionModule.TICKETS, action: PermissionAction.DELETE, description: 'Delete tickets' },
      { module: PermissionModule.TICKETS, action: PermissionAction.PRINT, description: 'Print tickets' },
      
      // Agents
      { module: PermissionModule.AGENTS, action: PermissionAction.VIEW, description: 'View agents' },
      { module: PermissionModule.AGENTS, action: PermissionAction.CREATE, description: 'Create agents' },
      { module: PermissionModule.AGENTS, action: PermissionAction.EDIT, description: 'Edit agents' },
      { module: PermissionModule.AGENTS, action: PermissionAction.DELETE, description: 'Delete agents' },
      
      // Buses
      { module: PermissionModule.BUSES, action: PermissionAction.VIEW, description: 'View buses' },
      { module: PermissionModule.BUSES, action: PermissionAction.CREATE, description: 'Create buses' },
      { module: PermissionModule.BUSES, action: PermissionAction.EDIT, description: 'Edit buses' },
      { module: PermissionModule.BUSES, action: PermissionAction.DELETE, description: 'Delete buses' },
      
      // Drivers
      { module: PermissionModule.DRIVERS, action: PermissionAction.VIEW, description: 'View drivers' },
      { module: PermissionModule.DRIVERS, action: PermissionAction.CREATE, description: 'Create drivers' },
      { module: PermissionModule.DRIVERS, action: PermissionAction.EDIT, description: 'Edit drivers' },
      { module: PermissionModule.DRIVERS, action: PermissionAction.DELETE, description: 'Delete drivers' },
      
      // Destinations
      { module: PermissionModule.DESTINATIONS, action: PermissionAction.VIEW, description: 'View destinations' },
      { module: PermissionModule.DESTINATIONS, action: PermissionAction.CREATE, description: 'Create destinations' },
      { module: PermissionModule.DESTINATIONS, action: PermissionAction.EDIT, description: 'Edit destinations' },
      { module: PermissionModule.DESTINATIONS, action: PermissionAction.DELETE, description: 'Delete destinations' },
      
      // Routes
      { module: PermissionModule.ROUTES, action: PermissionAction.VIEW, description: 'View routes' },
      { module: PermissionModule.ROUTES, action: PermissionAction.CREATE, description: 'Create routes' },
      { module: PermissionModule.ROUTES, action: PermissionAction.EDIT, description: 'Edit routes' },
      { module: PermissionModule.ROUTES, action: PermissionAction.DELETE, description: 'Delete routes' },
      
      // Sales Office
      { module: PermissionModule.SALES_OFFICE, action: PermissionAction.VIEW, description: 'View sales offices' },
      { module: PermissionModule.SALES_OFFICE, action: PermissionAction.CREATE, description: 'Create sales offices' },
      { module: PermissionModule.SALES_OFFICE, action: PermissionAction.EDIT, description: 'Edit sales offices' },
      { module: PermissionModule.SALES_OFFICE, action: PermissionAction.DELETE, description: 'Delete sales offices' },
      
      // Reports
      { module: PermissionModule.REPORTS, action: PermissionAction.VIEW, description: 'View reports' },
      { module: PermissionModule.REPORTS, action: PermissionAction.EXPORT, description: 'Export reports' },
      { module: PermissionModule.REPORTS, action: PermissionAction.PRINT, description: 'Print reports' },
      
      // Settings
      { module: PermissionModule.SETTINGS, action: PermissionAction.VIEW, description: 'View settings' },
      { module: PermissionModule.SETTINGS, action: PermissionAction.EDIT, description: 'Edit settings' },
      
      // Users
      { module: PermissionModule.USERS, action: PermissionAction.VIEW, description: 'View users' },
      { module: PermissionModule.USERS, action: PermissionAction.CREATE, description: 'Create users' },
      { module: PermissionModule.USERS, action: PermissionAction.EDIT, description: 'Edit users' },
      { module: PermissionModule.USERS, action: PermissionAction.DELETE, description: 'Delete users' },
      
      // Permissions
      { module: PermissionModule.PERMISSIONS, action: PermissionAction.VIEW, description: 'View permissions' },
      { module: PermissionModule.PERMISSIONS, action: PermissionAction.EDIT, description: 'Edit permissions' },
    ];

    // Insert permissions (skip if already exists)
    const createdPermissions = [];
    for (const perm of permissionDefinitions) {
      const existing = await Permission.findOne({ module: perm.module, action: perm.action });
      if (!existing) {
        const created = await Permission.create(perm);
        createdPermissions.push(created);
      }
    }

    // Initialize default role permissions with sensible defaults for each role
    const rolePermissionDefaults = {
      [UserRole.SUPER_ADMIN]: Object.values(PermissionModule).map(module => ({
        module,
        actions: permissionDefinitions.filter(p => p.module === module).map(p => p.action)
      })),
      
      [UserRole.MANAGER]: [
        { module: PermissionModule.DASHBOARD, actions: [PermissionAction.VIEW, PermissionAction.EDIT] },
        { module: PermissionModule.TICKETS, actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE, PermissionAction.PRINT] },
        { module: PermissionModule.AGENTS, actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT] },
        { module: PermissionModule.BUSES, actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT] },
        { module: PermissionModule.DRIVERS, actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT] },
        { module: PermissionModule.DESTINATIONS, actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT] },
        { module: PermissionModule.ROUTES, actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT] },
        { module: PermissionModule.SALES_OFFICE, actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT] },
        { module: PermissionModule.REPORTS, actions: [PermissionAction.VIEW, PermissionAction.EXPORT, PermissionAction.PRINT] },
        { module: PermissionModule.SETTINGS, actions: [PermissionAction.VIEW, PermissionAction.EDIT] },
        { module: PermissionModule.USERS, actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT] },
        { module: PermissionModule.PERMISSIONS, actions: [PermissionAction.VIEW] },
      ],
      
      [UserRole.CASHIER]: [
        { module: PermissionModule.DASHBOARD, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.TICKETS, actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.PRINT] },
        { module: PermissionModule.BUSES, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.DESTINATIONS, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.ROUTES, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.SALES_OFFICE, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.REPORTS, actions: [PermissionAction.VIEW, PermissionAction.PRINT] },
        { module: PermissionModule.SETTINGS, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.USERS, actions: [PermissionAction.VIEW] },
      ],
      
      [UserRole.DRIVER]: [
        { module: PermissionModule.DASHBOARD, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.TICKETS, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.BUSES, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.ROUTES, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.USERS, actions: [PermissionAction.VIEW] },
      ],
      
      [UserRole.CUSTOMER]: [
        { module: PermissionModule.TICKETS, actions: [PermissionAction.VIEW, PermissionAction.PRINT] },
        { module: PermissionModule.DESTINATIONS, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.ROUTES, actions: [PermissionAction.VIEW] },
        { module: PermissionModule.SETTINGS, actions: [PermissionAction.VIEW] },
      ],
    };

    // Create role permissions for all roles
    for (const [role, permissions] of Object.entries(rolePermissionDefaults)) {
      const existingRolePerms = await RolePermission.findOne({ role: role as UserRole });
      if (!existingRolePerms) {
        await RolePermission.create({
          role: role as UserRole,
          permissions,
        });
      }
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { 
        message: `Initialized ${createdPermissions.length} new permissions`,
        totalPermissions: permissionDefinitions.length 
      },
      PERMISSION_CONSTANTS.PERMISSIONS_INITIALIZED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

/**
 * Get all available permissions grouped by module
 */
export const getAllPermissions = async (req: CustomRequest, res: Response) => {
  try {
    const permissions = await Permission.find({ isActive: true })
      .sort({ module: 1, action: 1 });

    // Group permissions by module
    const groupedPermissions: any = {};
    permissions.forEach(perm => {
      if (!groupedPermissions[perm.module]) {
        groupedPermissions[perm.module] = [];
      }
      groupedPermissions[perm.module].push({
        id: perm._id,
        action: perm.action,
        description: perm.description,
      });
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { permissions: groupedPermissions },
      PERMISSION_CONSTANTS.PERMISSIONS_FETCHED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

/**
 * Get permissions for a specific role
 */
export const getRolePermissions = async (req: CustomRequest, res: Response) => {
  try {
    const { role } = req.params;

    // Validate role
    if (!Object.values(UserRole).includes(role as UserRole)) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, PERMISSION_CONSTANTS.INVALID_ROLE);
    }

    const rolePermissions = await RolePermission.findOne({ role: role as UserRole });

    if (!rolePermissions) {
      // Return empty permissions if not found
      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { 
          role,
          permissions: [],
          isActive: false 
        },
        PERMISSION_CONSTANTS.ROLE_PERMISSIONS_FETCHED
      );
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { 
        role: rolePermissions.role,
        permissions: rolePermissions.permissions,
        isActive: rolePermissions.isActive,
        createdAt: rolePermissions.createdAt,
        updatedAt: rolePermissions.updatedAt,
      },
      PERMISSION_CONSTANTS.ROLE_PERMISSIONS_FETCHED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

/**
 * Get permissions for all roles
 */
export const getAllRolePermissions = async (req: CustomRequest, res: Response) => {
  try {
    const allRolePermissions = await RolePermission.find()
      .sort({ role: 1 });

    // Format response to include all roles, even if they don't have permissions yet
    const rolesData = Object.values(UserRole).map(role => {
      const rolePerms = allRolePermissions.find(rp => rp.role === role);
      return {
        role,
        permissions: rolePerms?.permissions || [],
        isActive: rolePerms?.isActive || false,
        createdAt: rolePerms?.createdAt,
        updatedAt: rolePerms?.updatedAt,
      };
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { roles: rolesData },
      PERMISSION_CONSTANTS.ALL_ROLE_PERMISSIONS_FETCHED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

/**
 * Update permissions for a specific role
 */
export const updateRolePermissions = async (req: CustomRequest, res: Response) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;

    // Validate role
    if (!Object.values(UserRole).includes(role as UserRole)) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, PERMISSION_CONSTANTS.INVALID_ROLE);
    }

    // Validate permissions structure
    if (!Array.isArray(permissions)) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, PERMISSION_CONSTANTS.INVALID_PERMISSIONS_FORMAT);
    }

    // Validate each permission entry
    for (const perm of permissions) {
      if (!perm.module || !Array.isArray(perm.actions)) {
        throw new CustomError(STATUS_CODES.BAD_REQUEST, PERMISSION_CONSTANTS.INVALID_PERMISSIONS_FORMAT);
      }
      
      // Validate module exists
      if (!Object.values(PermissionModule).includes(perm.module)) {
        throw new CustomError(
          STATUS_CODES.BAD_REQUEST, 
          `Invalid module: ${perm.module}`
        );
      }

      // Validate actions exist
      for (const action of perm.actions) {
        if (!Object.values(PermissionAction).includes(action)) {
          throw new CustomError(
            STATUS_CODES.BAD_REQUEST, 
            `Invalid action: ${action}`
          );
        }
      }
    }

    // Update or create role permissions
    const rolePermissions = await RolePermission.findOneAndUpdate(
      { role: role as UserRole },
      {
        role: role as UserRole,
        permissions,
        isActive: true,
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true,
      }
    );

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { 
        role: rolePermissions.role,
        permissions: rolePermissions.permissions,
        isActive: rolePermissions.isActive,
      },
      PERMISSION_CONSTANTS.ROLE_PERMISSIONS_UPDATED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

/**
 * Check if a user has a specific permission
 */
export const checkPermission = async (req: CustomRequest, res: Response) => {
  try {
    const { role, module, action } = req.query;

    if (!role || !module || !action) {
      throw new CustomError(
        STATUS_CODES.BAD_REQUEST, 
        PERMISSION_CONSTANTS.MISSING_PERMISSION_PARAMS
      );
    }

    // Validate role
    if (!Object.values(UserRole).includes(role as UserRole)) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, PERMISSION_CONSTANTS.INVALID_ROLE);
    }

    const rolePermissions = await RolePermission.findOne({ 
      role: role as UserRole,
      isActive: true 
    });

    if (!rolePermissions) {
      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { hasPermission: false },
        PERMISSION_CONSTANTS.PERMISSION_CHECKED
      );
    }

    // Check if the role has the specific permission
    const modulePermission = rolePermissions.permissions.find(
      p => p.module === module
    );

    const hasPermission = modulePermission 
      ? modulePermission.actions.includes(action as string)
      : false;

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { 
        hasPermission,
        role,
        module,
        action,
      },
      PERMISSION_CONSTANTS.PERMISSION_CHECKED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

/**
 * Delete permissions for a role (reset to empty)
 */
export const deleteRolePermissions = async (req: CustomRequest, res: Response) => {
  try {
    const { role } = req.params;

    // Validate role
    if (!Object.values(UserRole).includes(role as UserRole)) {
      throw new CustomError(STATUS_CODES.BAD_REQUEST, PERMISSION_CONSTANTS.INVALID_ROLE);
    }

    // Don't allow deleting super admin permissions
    if (role === UserRole.SUPER_ADMIN) {
      throw new CustomError(
        STATUS_CODES.FORBIDDEN, 
        PERMISSION_CONSTANTS.CANNOT_DELETE_SUPERADMIN_PERMISSIONS
      );
    }

    const result = await RolePermission.findOneAndDelete({ role: role as UserRole });

    if (!result) {
      throw new CustomError(STATUS_CODES.NOT_FOUND, PERMISSION_CONSTANTS.ROLE_PERMISSIONS_NOT_FOUND);
    }

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      { role },
      PERMISSION_CONSTANTS.ROLE_PERMISSIONS_DELETED
    );
  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};


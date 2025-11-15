import { Router } from "express";
import {
  initializePermissions,
  getAllPermissions,
  getRolePermissions,
  getAllRolePermissions,
  updateRolePermissions,
  checkPermission,
  deleteRolePermissions,
} from "../../controllers/admin/permission.controller";
import { checkAdminAuth } from "../../middleware/check-admin-auth.middleware";
import { validateBody, validateQuery } from "../../middleware/validation.middleware";
import { checkPermissionSchema, updateRolePermissionsSchema } from "../../validators/adminValidators/permission.validator";
const router = Router();

// Initialize permissions (should be called once during setup)
router.post("/initialize", checkAdminAuth, initializePermissions);

// Get all available permissions
router.get("/", checkAdminAuth, getAllPermissions);

// Get all roles with their permissions
router.get("/roles", checkAdminAuth, getAllRolePermissions);

// Get permissions for a specific role
router.get("/roles/:role", checkAdminAuth, getRolePermissions);

// Update permissions for a specific role
router.put(
  "/roles/:role",
  checkAdminAuth,
  validateBody(updateRolePermissionsSchema),
  updateRolePermissions
);

// Delete permissions for a role
router.delete("/roles/:role", checkAdminAuth, deleteRolePermissions);

// Check if a role has a specific permission
router.get(
  "/check",
  checkAdminAuth,
  validateQuery(checkPermissionSchema),
  checkPermission
);

export default router;


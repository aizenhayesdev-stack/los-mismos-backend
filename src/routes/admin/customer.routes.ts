import { Router } from "express";
import { checkUserAuth } from "../../middleware/check-user-auth.middleware";
// import { checkRole } from "../../middleware/check-role.middleware";
import { UserRole } from "../../models/common/types";
import { getCustomers, getCustomer, toggleCustomerStatus } from "../../controllers/admin/customer.controller";
import { checkPermission } from "../../middleware/check-permission.middleware";
import { PermissionModule, PermissionAction } from "../../models/permission.model";

const router = Router();

// All routes require authentication
router.use(checkUserAuth);

router.get("/", checkPermission(PermissionModule.CUSTOMERS, PermissionAction.VIEW), getCustomers);
router.get("/:id", checkPermission(PermissionModule.CUSTOMERS, PermissionAction.VIEW), getCustomer);

// Only Super Admin and Manager can suspend/activate customers
router.patch("/:id/status", checkPermission(PermissionModule.CUSTOMERS, PermissionAction.EDIT), toggleCustomerStatus);

export default router;

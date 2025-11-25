import { Router } from "express";
import { checkUserAuth } from "../../middleware/check-user-auth.middleware";
import { checkRole } from "../../middleware/check-role.middleware";
import { UserRole } from "../../models/common/types";
import { bulkImportUsers, bulkUpdateUsers, getBulkOperationStatus } from "../../controllers/admin/user-management.controller";
import multer from "multer";
import path from "path";

import { checkPermission } from "../../middleware/check-permission.middleware";
import { PermissionModule, PermissionAction } from "../../models/permission.model";

const router = Router();
const upload = multer({ dest: 'uploads/' });

// All routes require authentication and Super Admin privileges
router.use(checkUserAuth);
// router.use(checkRole([UserRole.SUPER_ADMIN])); // Replaced by granular permissions

router.post("/bulk-import", checkPermission(PermissionModule.BULK_OPERATIONS, PermissionAction.CREATE), upload.single('file'), bulkImportUsers);
router.post("/bulk-update", checkPermission(PermissionModule.BULK_OPERATIONS, PermissionAction.CREATE), bulkUpdateUsers);
router.get("/bulk-operations/:id", checkPermission(PermissionModule.BULK_OPERATIONS, PermissionAction.VIEW), getBulkOperationStatus);

export default router;

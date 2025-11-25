import { Router } from "express";
import { checkUserAuth } from "../../middleware/check-user-auth.middleware";
import { checkRole } from "../../middleware/check-role.middleware";
import { UserRole } from "../../models/common/types";
import { globalSearch } from "../../controllers/admin/search.controller";

const router = Router();

// All routes require authentication and admin/manager/agent privileges
router.use(checkUserAuth);
router.use(checkRole([UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.CASHIER]));

router.get("/customers", globalSearch);

export default router;

import { Router } from "express";
import { checkUserAuth } from "../middleware/check-user-auth.middleware";
import { getRouteById, getRouteFilterOptions, getRoutes, searchRoutes } from "../controllers/admin/routes.controller";

const router = Router();

router.get("/", checkUserAuth, getRoutes);
router.get("/filter-options", checkUserAuth, getRouteFilterOptions);
router.get("/search", checkUserAuth, searchRoutes);
router.get("/id/:id", checkUserAuth, getRouteById);

export default router;

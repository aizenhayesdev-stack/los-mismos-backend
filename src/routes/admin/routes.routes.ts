import { Router } from "express";
import { checkAdminAuth } from "../../middleware/check-admin-auth.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { createRouteSchema, updateRouteSchema } from "../../validators/adminValidators/routes.validator";
import { createRoute, getRoutes, getRouteFilterOptions, searchRoutes, getRouteById, updateRoute, deleteRoute } from "../../controllers/admin/routes.controller";

const router = Router();

router.post("/create", checkAdminAuth, validateBody(createRouteSchema), createRoute);
router.get("/", checkAdminAuth, getRoutes);
router.put("/:id", checkAdminAuth, validateBody(updateRouteSchema), updateRoute);
router.delete("/:id", checkAdminAuth, deleteRoute);
router.get("/id/:id", checkAdminAuth, getRouteById);
router.get("/filter-options", checkAdminAuth, getRouteFilterOptions);
router.get("/search", checkAdminAuth, searchRoutes);

export default router;

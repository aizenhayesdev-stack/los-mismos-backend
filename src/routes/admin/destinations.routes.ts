import { Router } from "express";
import { checkAdminAuth } from "../../middleware/check-admin-auth.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { createDestinationSchema, updateDestinationSchema } from "../../validators/adminValidators/destinations.validator";
import { createDestinations, deleteDestination, getDestinations, updateDestination } from "../../controllers/admin/destinations.controller";

const router = Router();

router.post("/create", checkAdminAuth, validateBody(createDestinationSchema), createDestinations);
router.get("/", checkAdminAuth, getDestinations);
router.put("/:id", checkAdminAuth, validateBody(updateDestinationSchema), updateDestination);
router.delete("/:id", checkAdminAuth, deleteDestination);

export default router;

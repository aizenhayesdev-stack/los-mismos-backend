import { Router } from "express";
// import { validateBody } from "../../middleware/validation.middleware";
// import { createDestinationSchema } from "../../validators/adminValidators/destinations.validator";
// import { getDestinations } from "../../controllers/admin/destinations.controller";
import { checkUserAuth } from "../middleware/check-user-auth.middleware";
import { getDestinations } from "../controllers/admin/destinations.controller";

const router = Router();

// router.post("/create", checkUserAuth, validateBody(createDestinationSchema), createDestinations);
router.get("/", checkUserAuth, getDestinations);

export default router;

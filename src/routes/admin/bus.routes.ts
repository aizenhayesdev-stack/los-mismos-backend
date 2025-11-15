import { Router } from "express";
import { checkAdminAuth } from "../../middleware/check-admin-auth.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { createBusSchema, updateBusSchema } from "../../validators/adminValidators/bus.validator";
import { createBus, deleteBus, getBuses, updateBus } from "../../controllers/admin/bus.controller";

const router = Router();

router.post("/create", checkAdminAuth, validateBody(createBusSchema), createBus);
router.get("/", checkAdminAuth, getBuses);
router.put("/:id", checkAdminAuth, validateBody(updateBusSchema), updateBus);
router.delete("/:id", checkAdminAuth, deleteBus);

export default router;

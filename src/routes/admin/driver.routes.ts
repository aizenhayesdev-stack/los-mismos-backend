import { Router } from "express";
import { checkAdminAuth } from "../../middleware/check-admin-auth.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { createDriverSchema, updateDriverSchema } from "../../validators/adminValidators/driver.validator";
import { createDriver, deleteDriver, getDrivers, updateDriver } from "../../controllers/admin/driver.controller";

const router = Router();

router.post("/create", checkAdminAuth, validateBody(createDriverSchema), createDriver);
router.get("/", checkAdminAuth, getDrivers);
router.put("/:id", checkAdminAuth, validateBody(updateDriverSchema), updateDriver);
router.delete("/:id", checkAdminAuth, deleteDriver);

export default router;
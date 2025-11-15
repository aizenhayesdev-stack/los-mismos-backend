import { Router } from "express";
import { checkAdminAuth } from "../../middleware/check-admin-auth.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { createSalesOfficeSchema, updateSalesOfficeSchema } from "../../validators/adminValidators/sales-office.validator";
import { createSalesOffice, deleteSalesOffice, getOffices, updateSalesOffice } from "../../controllers/admin/sales-office.controller";
const router = Router();

router.post("/create", checkAdminAuth, validateBody(createSalesOfficeSchema), createSalesOffice);
router.get("/", checkAdminAuth, getOffices);
router.put("/:id", checkAdminAuth, validateBody(updateSalesOfficeSchema), updateSalesOffice);
router.delete("/:id", checkAdminAuth, deleteSalesOffice);

export default router;

import { Router } from "express";
// import { createServices } from "../../controllers/admin/misc.controller";
import { getCurrency, getDashboard, updateCurrency } from "../../controllers/admin/misc.controller";
import { checkAdminAuth } from "../../middleware/check-admin-auth.middleware";
import { handleMediaFiles, handleMediaFilesLocal } from "../../utils/Mutlipart";
import { checkUserAuth } from "../../middleware/check-user-auth.middleware";
import { validateBody } from "../../middleware/validation.middleware";
import { updateCurrencySchema } from "../../validators/adminValidators/misc.validator";

const router = Router();

// router.post("/create-services", checkUserAuth, handleMediaFilesLocal.fields([
//     { name: "icon", maxCount: 1 },
// ]), createServices);
router.get("/dashboard", checkAdminAuth, getDashboard);
router.post("/update-currency", checkAdminAuth, validateBody(updateCurrencySchema), updateCurrency);
router.get("/get-currency", checkAdminAuth, getCurrency);

export default router;

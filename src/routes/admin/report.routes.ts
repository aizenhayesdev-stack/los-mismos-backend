import { Router } from "express";
import { checkAdminAuth } from "../../middleware/check-admin-auth.middleware";
import { validateQuery } from "../../middleware/validation.middleware";
import { getRouteSeatReport, getRouteSeatReportDownload, getSalesReport, getDriversReport, getSalesReportDownload, getDriversReportDownload } from "../../controllers/admin/report.controller";
import { routeSeatReportSchema, salesReportSchema, driversReportSchema } from "../../validators/adminValidators/report.validator";

const router = Router();

router.get("/route-seat-report", checkAdminAuth, validateQuery(routeSeatReportSchema), getRouteSeatReport);

router.get("/sales-report", checkAdminAuth, validateQuery(salesReportSchema), getSalesReport);
// router.get("/sales-report-download",validateQuery(salesReportSchema) , getSalesReportDownload);


// router.get("/drivers-report", validateQuery(driversReportSchema), getDriversReport);
router.get("/drivers-report", checkAdminAuth, validateQuery(driversReportSchema), getDriversReport);
// router.get("/route-seat-report-download", checkAdminAuth,validateQuery(routeSeatReportSchema), getRouteSeatReportDownload);
// router.get("/sales-report-download", checkAdminAuth,validateQuery(salesReportSchema) , getSalesReportDownload);
// router.get("/drivers-report-download", checkAdminAuth,validateQuery(driversReportSchema), getDriversReportDownload);
//tests
router.get("/route-seat-report-download",validateQuery(routeSeatReportSchema), getRouteSeatReportDownload);
router.get("/sales-report-download", validateQuery(salesReportSchema) , getSalesReportDownload);
router.get("/drivers-report-download",validateQuery(driversReportSchema), getDriversReportDownload);

export default router;

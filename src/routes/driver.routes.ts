import { Router } from "express";
import { checkDriverAuth } from "../middleware/check-driver-auth.middleware";
import { validateBody } from "../middleware/validation.middleware";
import { verifyTicket, addBaggage, getPassengersCount, getRoundTripTickets, startTrip, endTrip } from "../controllers/driver.controller";
import { verifyTicketSchema, addBaggageSchema } from "../validators/driverValidators";

const router = Router();

router.post("/verify-ticket", checkDriverAuth, validateBody(verifyTicketSchema), verifyTicket);
router.post("/add-baggage", checkDriverAuth, validateBody(addBaggageSchema), addBaggage);
router.post("/round-trip-tickets", checkDriverAuth, validateBody(verifyTicketSchema), getRoundTripTickets);
router.get("/passengers-count", checkDriverAuth, getPassengersCount);
router.post("/start-trip", checkDriverAuth, startTrip);
router.post("/end-trip", checkDriverAuth, endTrip);

export default router;

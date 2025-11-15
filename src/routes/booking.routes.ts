import { Router } from 'express';
import { checkUserAuth } from '../middleware/check-user-auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { bookSeats, getBookingHistory, getLatestBooking, printTicket, searchTickets, cancelBooking } from '../controllers/booking.controller';
import { confirmStripePayment } from '../controllers/stripe-payment.controller';
import { bookSeatsSchema, confirmStripePaymentSchema, cancelBookingSchema } from '../validators/bookingValidators';

const router = Router();

// Book seats endpoint with validation
router.post("/book-seats", checkUserAuth, validateBody(bookSeatsSchema), bookSeats);
router.post("/cancel-booking", checkUserAuth, validateBody(cancelBookingSchema), cancelBooking);

// Confirm Stripe payment endpoint with validation
router.post("/confirm-stripe-payment", checkUserAuth, validateBody(confirmStripePaymentSchema), confirmStripePayment);

router.get("/history", checkUserAuth, getBookingHistory);
router.get("/latest", checkUserAuth, getLatestBooking);
router.get("/print-ticket/:ticketNumber", printTicket);
router.get("/search/:ticketNumber", checkUserAuth, searchTickets);

export default router;
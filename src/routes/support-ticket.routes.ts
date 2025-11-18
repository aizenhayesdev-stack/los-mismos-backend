import { Router } from "express";
import { checkUserAuth } from "../middleware/check-user-auth.middleware";
import { checkAdminAuth } from "../middleware/check-admin-auth.middleware";
import { validateBody } from "../middleware/validation.middleware";
import {
  createTicket,
  getCustomerTickets,
  getAllTickets,
  getTicketById,
  updateTicketStatus,
  addComment,
  assignTicket,
} from "../controllers/support-ticket.controller";
import {
  createTicketSchema,
  addCommentSchema,
  updateTicketStatusSchema,
  assignTicketSchema,
} from "../validators/supportTicketValidators";

const router = Router();

// Customer routes
router.post("/", checkUserAuth, validateBody(createTicketSchema), createTicket);
router.get("/my-tickets", checkUserAuth, getCustomerTickets);
router.get("/:ticketId", checkUserAuth, getTicketById);
router.post("/:ticketId/comments", checkUserAuth, validateBody(addCommentSchema), addComment);

// Admin/Manager routes
router.get("/", checkAdminAuth, getAllTickets);
router.get("/:ticketId", checkAdminAuth, getTicketById);
router.patch("/:ticketId/status", checkAdminAuth, validateBody(updateTicketStatusSchema), updateTicketStatus);
router.post("/:ticketId/assign", checkAdminAuth, validateBody(assignTicketSchema), assignTicket);
router.post("/:ticketId/comments", checkAdminAuth, validateBody(addCommentSchema), addComment);

export default router;


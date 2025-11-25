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

import { checkPermission } from "../middleware/check-permission.middleware";
import { PermissionModule, PermissionAction } from "../models/permission.model";

const router = Router();

// Customer routes
router.post("/", checkUserAuth, checkPermission(PermissionModule.SUPPORT_TICKETS, PermissionAction.CREATE), validateBody(createTicketSchema), createTicket);
router.get("/my-tickets", checkUserAuth, checkPermission(PermissionModule.SUPPORT_TICKETS, PermissionAction.VIEW), getCustomerTickets);
router.get("/:ticketId", checkUserAuth, checkPermission(PermissionModule.SUPPORT_TICKETS, PermissionAction.VIEW), getTicketById);
router.post("/:ticketId/comments", checkUserAuth, checkPermission(PermissionModule.SUPPORT_TICKETS, PermissionAction.CREATE), validateBody(addCommentSchema), addComment);

// Admin/Manager routes
router.get("/", checkAdminAuth, checkPermission(PermissionModule.SUPPORT_TICKETS, PermissionAction.VIEW), getAllTickets);
// router.get("/:ticketId", checkAdminAuth, getTicketById); // Covered by the route above
router.patch("/:ticketId/status", checkAdminAuth, checkPermission(PermissionModule.SUPPORT_TICKETS, PermissionAction.EDIT), validateBody(updateTicketStatusSchema), updateTicketStatus);
router.post("/:ticketId/assign", checkAdminAuth, checkPermission(PermissionModule.SUPPORT_TICKETS, PermissionAction.EDIT), validateBody(assignTicketSchema), assignTicket);
router.post("/:ticketId/comments", checkAdminAuth, checkPermission(PermissionModule.SUPPORT_TICKETS, PermissionAction.CREATE), validateBody(addCommentSchema), addComment);

export default router;


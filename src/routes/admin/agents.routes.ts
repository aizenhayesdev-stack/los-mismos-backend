import { Router } from "express";
import { checkAdminAuth } from "../../middleware/check-admin-auth.middleware";
import { validateBody, validateQuery } from "../../middleware/validation.middleware";
import { 
  createAgentSchema, 
  updateAgentSchema, 
  getAgentsQuerySchema 
} from "../../validators/adminValidators/agents.validator";
import { 
  createAgent, 
  getAgents, 
  getAgent, 
  updateAgent, 
  deleteAgent, 
  toggleAgentStatus 
} from "../../controllers/admin/agents.controller";

const router = Router();

// Create Agent
router.post("/create", 
  checkAdminAuth, 
  validateBody(createAgentSchema), 
  createAgent
);

// Get All Agents (with pagination and filters)
router.get("/", 
  checkAdminAuth, 
  validateQuery(getAgentsQuerySchema), 
  getAgents
);

// Get Single Agent
router.get("/:id", 
  checkAdminAuth, 
  getAgent
);

// Update Agent
router.put("/:id", 
  checkAdminAuth, 
  validateBody(updateAgentSchema), 
  updateAgent
);

// Delete Agent (Soft Delete)
router.delete("/:id", 
  checkAdminAuth, 
  deleteAgent
);

// Toggle Agent Status (Active/Inactive)
router.patch("/:id/toggle-status", 
  checkAdminAuth, 
  toggleAgentStatus
);

export default router;

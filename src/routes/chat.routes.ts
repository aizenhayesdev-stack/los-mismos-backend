import { Router } from 'express';
import ChatController from '../controllers/chat.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { body, param, query } from 'express-validator';

const router = Router();

// Validation schemas
const startChatValidation = [
  body('category').notEmpty().withMessage('Category is required'),
  body('subject').optional().isString(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
];

const sendMessageValidation = [
  param('sessionId').isMongoId().withMessage('Invalid session ID'),
  body('content').notEmpty().withMessage('Message content is required'),
  body('messageType').optional().isIn(['text', 'image', 'file', 'system_notification']),
  body('attachments').optional().isArray()
];

const sessionParamValidation = [
  param('sessionId').isMongoId().withMessage('Invalid session ID')
];

const assignAgentValidation = [
  param('sessionId').isMongoId().withMessage('Invalid session ID'),
  body('agentId').isMongoId().withMessage('Invalid agent ID')
];

const transferChatValidation = [
  param('sessionId').isMongoId().withMessage('Invalid session ID'),
  body('toAgentId').isMongoId().withMessage('Invalid agent ID'),
  body('reason').notEmpty().withMessage('Transfer reason is required')
];

const closeChatValidation = [
  param('sessionId').isMongoId().withMessage('Invalid session ID'),
  body('satisfaction').optional().isInt({ min: 1, max: 5 }),
  body('feedback').optional().isString()
];

const messageParamValidation = [
  param('messageId').isMongoId().withMessage('Invalid message ID')
];

// Routes

/**
 * @route POST /api/chat/start
 * @desc Start a new chat session
 * @access Private (Customer)
 */
router.post('/start', 
  authenticateToken, 
  startChatValidation, 
  validateRequest, 
  ChatController.startChat
);

/**
 * @route POST /api/chat/:sessionId/message
 * @desc Send a message in chat
 * @access Private (Customer/Agent)
 */
router.post('/:sessionId/message', 
  authenticateToken, 
  sendMessageValidation, 
  validateRequest, 
  ChatController.sendMessage
);

/**
 * @route GET /api/chat/:sessionId
 * @desc Get chat session details
 * @access Private (Customer/Agent)
 */
router.get('/:sessionId', 
  authenticateToken, 
  sessionParamValidation, 
  validateRequest, 
  ChatController.getChatSession
);

/**
 * @route GET /api/chat/:sessionId/messages
 * @desc Get chat messages
 * @access Private (Customer/Agent)
 */
router.get('/:sessionId/messages', 
  authenticateToken, 
  sessionParamValidation, 
  validateRequest, 
  ChatController.getChatMessages
);

/**
 * @route PUT /api/chat/:sessionId/assign
 * @desc Assign agent to chat
 * @access Private (Agent/Manager/Admin)
 */
router.put('/:sessionId/assign', 
  authenticateToken, 
  assignAgentValidation, 
  validateRequest, 
  ChatController.assignAgent
);

/**
 * @route PUT /api/chat/:sessionId/transfer
 * @desc Transfer chat to another agent
 * @access Private (Agent/Manager/Admin)
 */
router.put('/:sessionId/transfer', 
  authenticateToken, 
  transferChatValidation, 
  validateRequest, 
  ChatController.transferChat
);

/**
 * @route PUT /api/chat/:sessionId/close
 * @desc Close chat session
 * @access Private (Customer/Agent)
 */
router.put('/:sessionId/close', 
  authenticateToken, 
  closeChatValidation, 
  validateRequest, 
  ChatController.closeChat
);

/**
 * @route GET /api/chat/user/sessions
 * @desc Get user's chat sessions
 * @access Private (Customer/Agent)
 */
router.get('/user/sessions', 
  authenticateToken, 
  ChatController.getUserChats
);

/**
 * @route PUT /api/chat/message/:messageId/read
 * @desc Mark message as read
 * @access Private (Customer/Agent)
 */
router.put('/message/:messageId/read', 
  authenticateToken, 
  messageParamValidation, 
  validateRequest, 
  ChatController.markMessageAsRead
);

/**
 * @route GET /api/chat/analytics
 * @desc Get chat analytics
 * @access Private (Admin only)
 */
router.get('/analytics', 
  authenticateToken, 
  ChatController.getChatAnalytics
);

export default router;
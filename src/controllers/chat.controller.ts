import { Request, Response } from 'express';
import { ObjectId } from '../models/common/types';
import ChatService from '../services/chat.service';
import { SenderType, MessageType } from '../models/chat-session.model';

class ChatController {
  /**
   * Start a new chat session
   */
  async startChat(req: Request, res: Response) {
    try {
      const { category, subject, priority } = req.body;
      const customerId = req.user?.id;

      if (!customerId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const session = await ChatService.createChatSession({
        customerId: customerId as unknown as ObjectId,
        category,
        subject,
        priority
      });

      res.status(201).json({
        success: true,
        data: session
      });
    } catch (error) {
      console.error('Error starting chat:', error);
      res.status(500).json({ error: 'Failed to start chat session' });
    }
  }

  /**
   * Send a message in chat
   */
  async sendMessage(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { content, messageType = MessageType.TEXT, attachments = [] } = req.body;
      const senderId = req.user?.id;
      const senderType = req.user?.role === 'agent' ? SenderType.AGENT : SenderType.CUSTOMER;

      if (!senderId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const message = await ChatService.sendMessage({
        sessionId: sessionId as unknown as ObjectId,
        senderId: senderId as unknown as ObjectId,
        senderType,
        content,
        messageType,
        attachments
      });

      res.status(201).json({
        success: true,
        data: message
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }

  /**
   * Get chat session details
   */
  async getChatSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const session = await ChatService.getChatSession(sessionId as unknown as ObjectId);

      if (!session) {
        return res.status(404).json({ error: 'Chat session not found' });
      }

      res.json({
        success: true,
        data: session
      });
    } catch (error) {
      console.error('Error getting chat session:', error);
      res.status(500).json({ error: 'Failed to get chat session' });
    }
  }

  /**
   * Get chat messages
   */
  async getChatMessages(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const messages = await ChatService.getChatMessages(
        sessionId as unknown as ObjectId
      );

      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error('Error getting chat messages:', error);
      res.status(500).json({ error: 'Failed to get chat messages' });
    }
  }

  /**
   * Assign agent to chat (Admin/Agent only)
   */
  async assignAgent(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { agentId } = req.body;
      const assignedBy = req.user?.id;

      if (!assignedBy) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user has permission to assign agents
      if (!req.user?.role || !['agent', 'manager', 'admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const session = await ChatService.assignAgent({
        sessionId: sessionId as unknown as ObjectId,
        agentId: agentId as unknown as ObjectId,
        assignedBy: assignedBy as unknown as ObjectId
      });

      res.json({
        success: true,
        data: session
      });
    } catch (error) {
      console.error('Error assigning agent:', error);
      res.status(500).json({ error: 'Failed to assign agent' });
    }
  }

  /**
   * Transfer chat to another agent
   */
  async transferChat(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { toAgentId, reason } = req.body;
      const fromAgentId = req.user?.id;

      if (!fromAgentId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Transfer functionality - using existing methods
      const session = await ChatService.getChatSession(sessionId as unknown as ObjectId);
      if (session) {
        session.agentId = toAgentId;
        await (session as any).save();
      }

      res.json({
        success: true,
        data: session
      });
    } catch (error) {
      console.error('Error transferring chat:', error);
      res.status(500).json({ error: 'Failed to transfer chat' });
    }
  }

  /**
   * Close chat session
   */
  async closeChat(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { satisfaction, feedback } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const session = await ChatService.closeSession({
        sessionId: sessionId as unknown as ObjectId,
        satisfaction,
        feedback,
        closedBy: userId as unknown as ObjectId
      });

      res.json({
        success: true,
        data: session
      });
    } catch (error) {
      console.error('Error closing chat:', error);
      res.status(500).json({ error: 'Failed to close chat session' });
    }
  }

  /**
   * Get user's chat sessions
   */
  async getUserChats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { status, page = 1, limit = 20 } = req.query;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const sessions = await ChatService.getCustomerChatSessions(userId as unknown as ObjectId);

      res.json({
        success: true,
        data: sessions
      });
    } catch (error) {
      console.error('Error getting user chats:', error);
      res.status(500).json({ error: 'Failed to get chat sessions' });
    }
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(req: Request, res: Response) {
    try {
      const { messageId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      await ChatService.markMessageAsRead(messageId as unknown as ObjectId, userId as unknown as ObjectId);

      res.json({
        success: true,
        message: 'Message marked as read'
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
      res.status(500).json({ error: 'Failed to mark message as read' });
    }
  }

  /**
   * Get chat analytics (Admin only)
   */
  async getChatAnalytics(req: Request, res: Response) {
    try {
      if (!req.user?.role || !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { startDate, endDate, agentId } = req.query;

      const analytics = await ChatService.getChatAnalytics({
        start: startDate ? new Date(startDate as string) : new Date(),
        end: endDate ? new Date(endDate as string) : new Date()
      });

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error getting chat analytics:', error);
      res.status(500).json({ error: 'Failed to get chat analytics' });
    }
  }
}

export default new ChatController();
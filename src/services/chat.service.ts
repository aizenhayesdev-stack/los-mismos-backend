import { Types } from 'mongoose';
import ChatSession, { IChatSession, ChatStatus, ChatPriority, CustomerSummary } from '../models/chat-session.model';
import ChatMessage, { IChatMessage } from '../models/chat-message.model';
import { MessageType, SenderType } from '../models/chat-session.model';
import AuthModel from '../models/auth.model';
import ProfileModel from '../models/profile.model';
import BookingModel from '../models/booking.model';
import { ObjectId, UserRole } from '../models/common/types';

// Interfaces for service methods
export interface CreateChatSessionOptions {
  customerId: ObjectId;
  category: string;
  subject?: string;
  priority?: ChatPriority;
  initialMessage?: string;
  source?: 'web' | 'mobile' | 'admin';
  relatedBookings?: ObjectId[];
}

export interface SendMessageOptions {
  sessionId: ObjectId;
  senderId: ObjectId;
  senderType: SenderType;
  content: string;
  messageType?: MessageType;
  attachments?: string[];
  clientMessageId?: string;
}

export interface AssignAgentOptions {
  sessionId: ObjectId;
  agentId: ObjectId;
  assignedBy: ObjectId;
}

export interface TransferSessionOptions {
  sessionId: ObjectId;
  fromAgent: ObjectId;
  toAgent: ObjectId;
  reason: string;
  transferredBy: ObjectId;
}

export interface CloseSessionOptions {
  sessionId: ObjectId;
  closedBy: ObjectId;
  reason?: string;
  satisfaction?: number;
  feedback?: string;
}

export interface ChatQueueInfo {
  position: number;
  estimatedWaitTime: number;
  totalWaiting: number;
}

class ChatService {
  
  /**
   * Create a new chat session
   */
  async createChatSession(options: CreateChatSessionOptions): Promise<IChatSession> {
    try {
      // Get customer information
      const customer = await AuthModel.findById(options.customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      const profile = await ProfileModel.findOne({ auth: options.customerId });
      
      // Get customer summary data
      const bookingCount = await BookingModel.countDocuments({ 
        'passengers.auth': options.customerId 
      });
      
      const lastBooking = await BookingModel.findOne({ 
        'passengers.auth': options.customerId 
      }).sort({ createdAt: -1 });

      const customerInfo: CustomerSummary = {
        name: `${(customer as any).profile?.firstName || 'Customer'} ${(customer as any).profile?.lastName || ''}`.trim(),
        email: customer.email || '',
        phone: (customer as any).profile?.phoneNumber || '',
        totalBookings: bookingCount,
        lastBookingDate: lastBooking?.createdAt,
        preferredLanguage: profile?.preferredLanguage || 'en'
      };

      // Calculate queue position and estimated wait time
      const queueInfo = await this.getQueueInfo(options.priority || ChatPriority.MEDIUM);

      // Create the chat session
      const session = await ChatSession.create({
        customerId: options.customerId,
        category: options.category,
        subject: options.subject,
        priority: options.priority || ChatPriority.MEDIUM,
        status: ChatStatus.WAITING,
        metadata: {
          customerInfo,
          relatedBookings: options.relatedBookings || [],
          tags: [],
          source: options.source || 'web'
        },
        queuePosition: queueInfo.position,
        estimatedWaitTime: queueInfo.estimatedWaitTime
      });

      // Add initial message if provided
      if (options.initialMessage) {
        await this.sendMessage({
          sessionId: session._id as ObjectId,
          senderId: options.customerId,
          senderType: SenderType.CUSTOMER,
          content: options.initialMessage,
          messageType: MessageType.TEXT
        });
      }

      return session;
    } catch (error) {
      console.error('Error creating chat session:', error);
      throw error;
    }
  }

  /**
   * Send a message in a chat session
   */
  async sendMessage(options: SendMessageOptions): Promise<IChatMessage> {
    try {
      // Verify session exists and is active
      const session = await ChatSession.findById(options.sessionId);
      if (!session) {
        throw new Error('Chat session not found');
      }

      if (session.status === ChatStatus.CLOSED) {
        throw new Error('Cannot send message to closed session');
      }

      // Create the message
      const message = await ChatMessage.create({
        sessionId: options.sessionId,
        senderId: options.senderId,
        senderType: options.senderType,
        content: options.content,
        messageType: options.messageType || MessageType.TEXT,
        attachments: options.attachments || [],
        metadata: {
          clientMessageId: options.clientMessageId,
          deliveryStatus: 'sent'
        }
      });

      // Add message to session
      await ChatSession.findByIdAndUpdate(
        options.sessionId,
        { 
          $push: { messages: message._id },
          $set: { updatedAt: new Date() }
        }
      );

      // Mark first response time if this is the first agent message
      if (options.senderType === SenderType.AGENT && !(session as any).firstResponseAt) {
        await ChatSession.findByIdAndUpdate(
          options.sessionId,
          { firstResponseAt: new Date() }
        );
      }

      return message;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Assign an agent to a chat session
   */
  async assignAgent(options: AssignAgentOptions): Promise<IChatSession> {
    try {
      // Verify agent exists and has appropriate role
      const agent = await AuthModel.findById(options.agentId);
      if (!agent || ![UserRole.MANAGER, UserRole.SUPER_ADMIN].includes(agent.role as UserRole)) {
        throw new Error('Invalid agent or insufficient permissions');
      }

      // Update session
      const session = await ChatSession.findByIdAndUpdate(
        options.sessionId,
        {
          $set: {
            agentId: options.agentId,
            status: ChatStatus.ACTIVE,
            queuePosition: undefined,
            estimatedWaitTime: undefined
          }
        },
        { new: true }
      );

      if (!session) {
        throw new Error('Chat session not found');
      }

      // Calculate actual wait time
      const waitTime = Math.round(
        (Date.now() - session.createdAt.getTime()) / 1000
      );
      
      await ChatSession.findByIdAndUpdate(
        options.sessionId,
        { actualWaitTime: waitTime }
      );

      // Send system message about agent assignment
      await this.sendMessage({
        sessionId: options.sessionId,
        senderId: options.agentId,
        senderType: SenderType.SYSTEM,
        content: `Agent ${(agent as any).profile?.firstName || 'Agent'} ${(agent as any).profile?.lastName || ''} has joined the chat`.trim(),
        messageType: MessageType.SYSTEM_NOTIFICATION
      });

      return session;
    } catch (error) {
      console.error('Error assigning agent:', error);
      throw error;
    }
  }

  /**
   * Transfer a chat session to another agent
   */
  async transferSession(options: TransferSessionOptions): Promise<IChatSession> {
    try {
      // Verify both agents exist
      const [fromAgent, toAgent] = await Promise.all([
        AuthModel.findById(options.fromAgent),
        AuthModel.findById(options.toAgent)
      ]);

      if (!fromAgent || !toAgent) {
        throw new Error('One or both agents not found');
      }

      // Update session
      const session = await ChatSession.findByIdAndUpdate(
        options.sessionId,
        {
          $set: {
            agentId: options.toAgent,
            status: ChatStatus.TRANSFERRED
          },
          $push: {
            transferHistory: {
              fromAgent: options.fromAgent,
              toAgent: options.toAgent,
              reason: options.reason,
              timestamp: new Date()
            }
          }
        },
        { new: true }
      );

      if (!session) {
        throw new Error('Chat session not found');
      }

      // Send system message about transfer
      await this.sendMessage({
        sessionId: options.sessionId,
        senderId: options.toAgent,
        senderType: SenderType.SYSTEM,
        content: `Chat transferred from ${(fromAgent as any).profile?.firstName || 'Agent'} ${(fromAgent as any).profile?.lastName || ''} to ${(toAgent as any).profile?.firstName || 'Agent'} ${(toAgent as any).profile?.lastName || ''}. Reason: ${options.reason}`.trim(),
        messageType: MessageType.SYSTEM_NOTIFICATION
      });

      return session;
    } catch (error) {
      console.error('Error transferring session:', error);
      throw error;
    }
  }

  /**
   * Close a chat session
   */
  async closeSession(options: CloseSessionOptions): Promise<IChatSession> {
    try {
      const updateData: any = {
        status: ChatStatus.CLOSED,
        closedAt: new Date()
      };

      if (options.satisfaction) {
        updateData.satisfaction = options.satisfaction;
      }

      if (options.feedback) {
        updateData.feedback = options.feedback;
      }

      const session = await ChatSession.findByIdAndUpdate(
        options.sessionId,
        { $set: updateData },
        { new: true }
      );

      if (!session) {
        throw new Error('Chat session not found');
      }

      // Send system message about session closure
      await this.sendMessage({
        sessionId: options.sessionId,
        senderId: options.closedBy,
        senderType: SenderType.SYSTEM,
        content: options.reason || 'Chat session has been closed',
        messageType: MessageType.SYSTEM_NOTIFICATION
      });

      return session;
    } catch (error) {
      console.error('Error closing session:', error);
      throw error;
    }
  }

  /**
   * Get chat session with messages
   */
  async getChatSession(sessionId: ObjectId, includeMessages: boolean = true): Promise<IChatSession | null> {
    try {
      let query = ChatSession.findById(sessionId)
        .populate('customerId', 'firstName lastName email phone')
        .populate('agentId', 'firstName lastName email');

      if (includeMessages) {
        query = query.populate({
          path: 'messages',
          populate: {
            path: 'senderId',
            select: 'firstName lastName'
          },
          options: { sort: { createdAt: 1 } }
        });
      }

      return await query.exec();
    } catch (error) {
      console.error('Error getting chat session:', error);
      throw error;
    }
  }

  /**
   * Get chat messages for a session with pagination
   */
  async getChatMessages(
    sessionId: ObjectId, 
    options: { page?: number; limit?: number; before?: Date } = {}
  ): Promise<{ messages: IChatMessage[]; hasMore: boolean; total: number }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 50;
      const skip = (page - 1) * limit;

      const query: any = { sessionId };
      if (options.before) {
        query.createdAt = { $lt: options.before };
      }

      const [messages, total] = await Promise.all([
        ChatMessage.find(query)
          .populate('senderId', 'firstName lastName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ChatMessage.countDocuments(query)
      ]);

      return {
        messages: messages.reverse(), // Reverse to get chronological order
        hasMore: skip + messages.length < total,
        total
      };
    } catch (error) {
      console.error('Error getting chat messages:', error);
      throw error;
    }
  }

  /**
   * Get queue information for priority level
   */
  async getQueueInfo(priority: ChatPriority): Promise<ChatQueueInfo> {
    try {
      // Count sessions waiting in queue with same or higher priority
      const priorityOrder = {
        [ChatPriority.URGENT]: 4,
        [ChatPriority.HIGH]: 3,
        [ChatPriority.MEDIUM]: 2,
        [ChatPriority.LOW]: 1
      };

      const currentPriorityValue = priorityOrder[priority];
      
      const waitingSessions = await ChatSession.find({
        status: ChatStatus.WAITING,
        $expr: {
          $gte: [
            { $switch: {
              branches: [
                { case: { $eq: ['$priority', ChatPriority.URGENT] }, then: 4 },
                { case: { $eq: ['$priority', ChatPriority.HIGH] }, then: 3 },
                { case: { $eq: ['$priority', ChatPriority.MEDIUM] }, then: 2 },
                { case: { $eq: ['$priority', ChatPriority.LOW] }, then: 1 }
              ],
              default: 2
            }},
            currentPriorityValue
          ]
        }
      }).sort({ priority: -1, createdAt: 1 });

      const position = waitingSessions.length + 1;
      
      // Estimate wait time based on average session duration and available agents
      const avgSessionDuration = 15; // minutes - could be calculated from historical data
      const availableAgents = await this.getAvailableAgentCount();
      const estimatedWaitTime = Math.max(1, Math.ceil((position / Math.max(1, availableAgents)) * avgSessionDuration));

      return {
        position,
        estimatedWaitTime: estimatedWaitTime * 60, // Convert to seconds
        totalWaiting: waitingSessions.length
      };
    } catch (error) {
      console.error('Error getting queue info:', error);
      return { position: 1, estimatedWaitTime: 300, totalWaiting: 0 }; // Default values
    }
  }

  /**
   * Get available agent count
   */
  async getAvailableAgentCount(): Promise<number> {
    try {
      // Count agents who are not currently assigned to active sessions
      const activeAgents = await ChatSession.distinct('agentId', {
        status: { $in: [ChatStatus.ACTIVE, ChatStatus.TRANSFERRED] }
      });

      const totalAgents = await AuthModel.countDocuments({
        role: { $in: [UserRole.MANAGER, UserRole.SUPER_ADMIN] },
        isActive: true
      });

      return Math.max(1, totalAgents - activeAgents.length);
    } catch (error) {
      console.error('Error getting available agent count:', error);
      return 1; // Default to 1 available agent
    }
  }

  /**
   * Get chat sessions for a customer
   */
  async getCustomerChatSessions(
    customerId: ObjectId,
    options: { page?: number; limit?: number; status?: ChatStatus } = {}
  ): Promise<{ sessions: IChatSession[]; total: number }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const query: any = { customerId };
      if (options.status) {
        query.status = options.status;
      }

      const [sessions, total] = await Promise.all([
        ChatSession.find(query)
          .populate('agentId', 'firstName lastName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ChatSession.countDocuments(query)
      ]);

      return { sessions, total };
    } catch (error) {
      console.error('Error getting customer chat sessions:', error);
      throw error;
    }
  }

  /**
   * Get chat sessions for an agent
   */
  async getAgentChatSessions(
    agentId: ObjectId,
    options: { page?: number; limit?: number; status?: ChatStatus } = {}
  ): Promise<{ sessions: IChatSession[]; total: number }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const query: any = { agentId };
      if (options.status) {
        query.status = options.status;
      }

      const [sessions, total] = await Promise.all([
        ChatSession.find(query)
          .populate('customerId', 'firstName lastName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ChatSession.countDocuments(query)
      ]);

      return { sessions, total };
    } catch (error) {
      console.error('Error getting agent chat sessions:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(messageId: ObjectId, userId: ObjectId): Promise<void> {
    try {
      const message = await ChatMessage.findById(messageId);
      if (message) {
        await (message as any).markAsRead(userId);
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
      throw error;
    }
  }

  /**
   * Get chat analytics for admin dashboard
   */
  async getChatAnalytics(dateRange: { start: Date; end: Date }) {
    try {
      const [
        totalSessions,
        activeSessions,
        avgWaitTime,
        avgSessionDuration,
        satisfactionStats
      ] = await Promise.all([
        ChatSession.countDocuments({
          createdAt: { $gte: dateRange.start, $lte: dateRange.end }
        }),
        ChatSession.countDocuments({
          status: { $in: [ChatStatus.ACTIVE, ChatStatus.WAITING] }
        }),
        ChatSession.aggregate([
          {
            $match: {
              createdAt: { $gte: dateRange.start, $lte: dateRange.end },
              actualWaitTime: { $exists: true }
            }
          },
          {
            $group: {
              _id: null,
              avgWaitTime: { $avg: '$actualWaitTime' }
            }
          }
        ]),
        ChatSession.aggregate([
          {
            $match: {
              createdAt: { $gte: dateRange.start, $lte: dateRange.end },
              closedAt: { $exists: true }
            }
          },
          {
            $addFields: {
              duration: { $subtract: ['$closedAt', '$createdAt'] }
            }
          },
          {
            $group: {
              _id: null,
              avgDuration: { $avg: '$duration' }
            }
          }
        ]),
        ChatSession.aggregate([
          {
            $match: {
              createdAt: { $gte: dateRange.start, $lte: dateRange.end },
              satisfaction: { $exists: true }
            }
          },
          {
            $group: {
              _id: null,
              avgSatisfaction: { $avg: '$satisfaction' },
              totalRatings: { $sum: 1 }
            }
          }
        ])
      ]);

      return {
        totalSessions,
        activeSessions,
        avgWaitTime: avgWaitTime[0]?.avgWaitTime || 0,
        avgSessionDuration: avgSessionDuration[0]?.avgDuration || 0,
        avgSatisfaction: satisfactionStats[0]?.avgSatisfaction || 0,
        totalSatisfactionRatings: satisfactionStats[0]?.totalRatings || 0
      };
    } catch (error) {
      console.error('Error getting chat analytics:', error);
      throw error;
    }
  }
}

export default new ChatService();
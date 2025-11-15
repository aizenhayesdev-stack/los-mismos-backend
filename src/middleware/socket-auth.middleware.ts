import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { SocketData } from '../config/socket';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Verify JWT token for socket authentication
 */
function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Socket.io authentication middleware
 */
export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return next(new Error('Authentication required'));
  }
  
  const user = verifyToken(token);
  
  if (!user) {
    return next(new Error('Invalid token'));
  }
  
  // Store user data in socket
  socket.data = {
    userId: user.authId,
    userEmail: user.email,
    currentTrip: undefined,
    heldSeats: new Set<string>()
  } as SocketData;
  
  next();
};

export default socketAuthMiddleware;

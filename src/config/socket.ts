import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from './redis';

// Socket.io server configuration
export const createSocketServer = (httpServer: HttpServer): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Redis adapter for multi-server support
  io.adapter(createAdapter(pubClient, subClient));

  return io;
};

// Socket.io events and types
export interface SocketData {
  userId: string;
  userEmail: string;
  currentTrip?: string;
  heldSeats: Set<string>;
}

export interface SeatHoldData {
  userId: string;
  seatLabel: string;
  routeId: string;
  heldAt: number;
  expiresAt: number;
}

export interface SeatStatusChangeEvent {
  routeId: string;
  seatLabel: string;
  status: 'available' | 'held' | 'booked' | 'selected';
  expiresAt?: number;
  userId?: string;
}

export interface BookingConfirmEvent {
  routeId: string;
  seatLabels: string[];
  paymentInfo?: any;
}


export default createSocketServer;

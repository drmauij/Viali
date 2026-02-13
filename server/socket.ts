import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import type { SessionData } from "express-session";
import logger from "./logger";

declare module "socket.io" {
  interface Socket {
    session?: SessionData;
    userId?: string;
  }
}

export type AnesthesiaDataSection = 
  | 'vitals'
  | 'medications'
  | 'ventilation'
  | 'ventilationParams'
  | 'events'
  | 'positions'
  | 'staff'
  | 'checklists'
  | 'technique'
  | 'airway'
  | 'intraOp'
  | 'countsSterile'
  | 'surgeryStaff'
  | 'inventoryUsage'
  | 'output'
  | 'rhythm'
  | 'tof'
  | 'vas'
  | 'aldrete'
  | 'scores'
  | 'timeMarkers';

export interface AnesthesiaUpdatePayload {
  recordId: string;
  section: AnesthesiaDataSection;
  data: unknown;
  timestamp: number;
  userId?: string;
  clientSessionId?: string;
}

let io: SocketIOServer | null = null;

export function initSocketIO(server: HTTPServer, sessionMiddleware: any): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? false 
        : ['http://localhost:5000', 'http://0.0.0.0:5000'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {} as any, (err: any) => {
      if (err) {
        logger.error('[Socket.IO] Session middleware error:', err);
        return next(new Error('Session error'));
      }
      
      const session = (socket.request as any).session;
      if (!session?.passport?.user) {
        return next(new Error('Unauthorized'));
      }
      
      socket.session = session;
      socket.userId = session.passport.user;
      next();
    });
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`[Socket.IO] Client connected: ${socket.id} (User: ${socket.userId})`);
    
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      logger.info(`[Socket.IO] ${socket.id} joined user room user:${socket.userId}`);
    }

    socket.on('join-surgery', (recordId: string) => {
      if (!recordId) return;
      
      const room = `surgery:${recordId}`;
      socket.join(room);
      logger.info(`[Socket.IO] ${socket.id} joined room ${room}`);
      
      const roomSize = io?.sockets.adapter.rooms.get(room)?.size || 0;
      socket.emit('room-joined', { recordId, viewers: roomSize });
      
      socket.to(room).emit('viewer-joined', { 
        viewers: roomSize,
        userId: socket.userId 
      });
    });

    socket.on('leave-surgery', (recordId: string) => {
      if (!recordId) return;
      
      const room = `surgery:${recordId}`;
      socket.leave(room);
      logger.info(`[Socket.IO] ${socket.id} left room ${room}`);
      
      const roomSize = io?.sockets.adapter.rooms.get(room)?.size || 0;
      socket.to(room).emit('viewer-left', { 
        viewers: roomSize,
        userId: socket.userId 
      });
    });

    socket.on('client:ping', (data: { timestamp: number }) => {
      socket.emit('server:pong', { timestamp: data.timestamp });
    });

    socket.on('chat:join', (conversationId: string) => {
      if (!conversationId) return;
      
      const room = `chat:${conversationId}`;
      socket.join(room);
      logger.info(`[Socket.IO] ${socket.id} joined chat room ${room}`);
      
      socket.to(room).emit('chat:user-joined', {
        conversationId,
        userId: socket.userId,
        timestamp: Date.now()
      });
    });

    socket.on('chat:leave', (conversationId: string) => {
      if (!conversationId) return;
      
      const room = `chat:${conversationId}`;
      socket.leave(room);
      logger.info(`[Socket.IO] ${socket.id} left chat room ${room}`);
      
      socket.to(room).emit('chat:user-left', {
        conversationId,
        userId: socket.userId,
        timestamp: Date.now()
      });
    });

    socket.on('chat:typing', (data: { conversationId: string; userName: string; isTyping: boolean }) => {
      if (!data.conversationId) return;
      
      const room = `chat:${data.conversationId}`;
      socket.to(room).emit('chat:typing', {
        conversationId: data.conversationId,
        userId: socket.userId,
        userName: data.userName,
        isTyping: data.isTyping
      });
    });

    socket.on('chat:read', (data: { conversationId: string }) => {
      if (!data.conversationId) return;
      
      const room = `chat:${data.conversationId}`;
      socket.to(room).emit('chat:read', {
        conversationId: data.conversationId,
        userId: socket.userId,
        lastReadAt: new Date().toISOString()
      });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`[Socket.IO] Client disconnected: ${socket.id} (${reason})`);
    });

    socket.on('error', (error) => {
      logger.error(`[Socket.IO] Socket error for ${socket.id}:`, error);
    });
  });

  logger.info('[Socket.IO] Server initialized');
  return io;
}

export function broadcastAnesthesiaUpdate(payload: AnesthesiaUpdatePayload): void {
  if (!io) {
    logger.warn('[Socket.IO] Server not initialized, cannot broadcast');
    return;
  }
  
  const room = `surgery:${payload.recordId}`;
  io.to(room).emit('anesthesia-update', payload);
  
  logger.info(`[Socket.IO] Broadcast to ${room}: ${payload.section}`);
}

export interface HospitalChecklistUpdatePayload {
  hospitalId: string;
  section: 'checklists';
  data: unknown;
  timestamp: number;
  userId?: string;
}

export interface ChatMessagePayload {
  conversationId: string;
  message: {
    id: string;
    senderId: string;
    content: string;
    messageType: string;
    createdAt: string;
    sender?: {
      id: string;
      firstName?: string;
      lastName?: string;
    };
    mentions?: unknown[];
    attachments?: unknown[];
  };
  timestamp: number;
}

export interface ChatTypingPayload {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

export interface ChatReadReceiptPayload {
  conversationId: string;
  userId: string;
  lastReadAt: string;
}

export function broadcastChecklistUpdate(payload: HospitalChecklistUpdatePayload): void {
  if (!io) {
    logger.warn('[Socket.IO] Server not initialized, cannot broadcast checklist update');
    return;
  }
  
  // Broadcast to all connected clients - they will filter by hospitalId on the frontend
  io.emit('checklist-update', payload);
  
  logger.info(`[Socket.IO] Broadcast checklist update for hospital: ${payload.hospitalId}`);
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

export function getRoomViewerCount(recordId: string): number {
  if (!io) return 0;
  const room = `surgery:${recordId}`;
  return io.sockets.adapter.rooms.get(room)?.size || 0;
}

export function broadcastChatMessage(payload: ChatMessagePayload): void {
  if (!io) {
    logger.warn('[Socket.IO] Server not initialized, cannot broadcast chat message');
    return;
  }
  
  const room = `chat:${payload.conversationId}`;
  io.to(room).emit('chat:new-message', payload);
  
  logger.info(`[Socket.IO] Broadcast chat message to ${room}`);
}

export function broadcastChatMessageDeleted(conversationId: string, messageId: string): void {
  if (!io) {
    logger.warn('[Socket.IO] Server not initialized, cannot broadcast message deletion');
    return;
  }
  
  const room = `chat:${conversationId}`;
  io.to(room).emit('chat:message-deleted', {
    conversationId,
    messageId,
    timestamp: Date.now()
  });
  
  logger.info(`[Socket.IO] Broadcast message deletion to ${room}`);
}

export function broadcastChatMessageEdited(conversationId: string, message: any): void {
  if (!io) {
    logger.warn('[Socket.IO] Server not initialized, cannot broadcast message edit');
    return;
  }
  
  const room = `chat:${conversationId}`;
  io.to(room).emit('chat:message-edited', {
    conversationId,
    message,
    timestamp: Date.now()
  });
  
  logger.info(`[Socket.IO] Broadcast message edit to ${room}`);
}

export function notifyUserOfNewMessage(userId: string, notification: any): void {
  if (!io) {
    logger.warn('[Socket.IO] Server not initialized, cannot notify user');
    return;
  }
  
  io.to(`user:${userId}`).emit('chat:notification', {
    notification,
    timestamp: Date.now()
  });
  
  logger.info(`[Socket.IO] Sent notification to user room user:${userId}`);
}

import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import type { SessionData } from "express-session";

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
  | 'tof';

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
        console.error('[Socket.IO] Session middleware error:', err);
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
    console.log(`[Socket.IO] Client connected: ${socket.id} (User: ${socket.userId})`);

    socket.on('join-surgery', (recordId: string) => {
      if (!recordId) return;
      
      const room = `surgery:${recordId}`;
      socket.join(room);
      console.log(`[Socket.IO] ${socket.id} joined room ${room}`);
      
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
      console.log(`[Socket.IO] ${socket.id} left room ${room}`);
      
      const roomSize = io?.sockets.adapter.rooms.get(room)?.size || 0;
      socket.to(room).emit('viewer-left', { 
        viewers: roomSize,
        userId: socket.userId 
      });
    });

    socket.on('client:ping', (data: { timestamp: number }) => {
      socket.emit('server:pong', { timestamp: data.timestamp });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (${reason})`);
    });

    socket.on('error', (error) => {
      console.error(`[Socket.IO] Socket error for ${socket.id}:`, error);
    });
  });

  console.log('[Socket.IO] Server initialized');
  return io;
}

export function broadcastAnesthesiaUpdate(payload: AnesthesiaUpdatePayload): void {
  if (!io) {
    console.warn('[Socket.IO] Server not initialized, cannot broadcast');
    return;
  }
  
  const room = `surgery:${payload.recordId}`;
  io.to(room).emit('anesthesia-update', payload);
  
  console.log(`[Socket.IO] Broadcast to ${room}: ${payload.section}`);
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

export function getRoomViewerCount(recordId: string): number {
  if (!io) return 0;
  const room = `surgery:${recordId}`;
  return io.sockets.adapter.rooms.get(room)?.size || 0;
}

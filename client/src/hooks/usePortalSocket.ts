import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UsePortalSocketOptions {
  portalToken: string;
  hospitalId: string;
  patientId: string;
  enabled?: boolean;
}

export function usePortalSocket({ portalToken, hospitalId, patientId, enabled = true }: UsePortalSocketOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled || !portalToken || !hospitalId || !patientId) return;

    const socketInstance = io('/portal', {
      auth: { portalToken },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      console.log('[PortalSocket] Connected:', socketInstance.id);
      setIsConnected(true);
      // Join the patient chat room
      socketInstance.emit('patient-chat:join', { hospitalId, patientId });
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[PortalSocket] Disconnected:', reason);
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[PortalSocket] Connection error:', error.message);
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [portalToken, hospitalId, patientId, enabled]);

  return { socket, isConnected };
}

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { clientSessionId } from '@/utils/sessionId';

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

interface AnesthesiaUpdatePayload {
  recordId: string;
  section: AnesthesiaDataSection;
  data: unknown;
  timestamp: number;
  userId?: string;
  clientSessionId?: string;
}

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  joinSurgery: (recordId: string) => void;
  leaveSurgery: (recordId: string) => void;
  viewers: number;
  lastUpdate: AnesthesiaUpdatePayload | null;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  joinSurgery: () => {},
  leaveSurgery: () => {},
  viewers: 0,
  lastUpdate: null,
});

export function useSocket() {
  return useContext(SocketContext);
}

const SECTION_TO_QUERY_KEY: Record<AnesthesiaDataSection, (recordId: string) => string[]> = {
  vitals: (recordId) => [`/api/anesthesia/vitals/${recordId}`],
  medications: (recordId) => [`/api/anesthesia/medications/${recordId}`],
  ventilation: (recordId) => [`/api/anesthesia/ventilation-modes/${recordId}`],
  events: (recordId) => [`/api/anesthesia/events/${recordId}`],
  positions: (recordId) => [`/api/anesthesia/positions/${recordId}`],
  staff: (recordId) => [`/api/anesthesia/staff/${recordId}`],
  checklists: (recordId) => [`/api/anesthesia/records/surgery`],
  technique: (recordId) => [`/api/anesthesia/${recordId}/general-technique`],
  airway: (recordId) => [`/api/anesthesia/${recordId}/airway`],
  intraOp: (recordId) => [`/api/anesthesia/records/surgery`],
  countsSterile: (recordId) => [`/api/anesthesia/records/surgery`],
  surgeryStaff: (recordId) => [`/api/anesthesia/records/surgery`],
  inventoryUsage: (recordId) => [`/api/anesthesia/inventory/${recordId}`],
  output: (recordId) => [`/api/anesthesia/vitals/snapshot/${recordId}`],
  rhythm: (recordId) => [`/api/anesthesia/vitals/${recordId}`],
  tof: (recordId) => [`/api/anesthesia/tof/${recordId}`],
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<AnesthesiaUpdatePayload | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const socketInstance = io({
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected:', socketInstance.id);
      setIsConnected(true);
      
      if (currentRoomRef.current) {
        socketInstance.emit('join-surgery', currentRoomRef.current);
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setIsConnected(false);
    });

    socketInstance.on('room-joined', ({ recordId, viewers: roomViewers }) => {
      console.log(`[Socket] Joined surgery room ${recordId} with ${roomViewers} viewers`);
      setViewers(roomViewers);
    });

    socketInstance.on('viewer-joined', ({ viewers: roomViewers }) => {
      setViewers(roomViewers);
    });

    socketInstance.on('viewer-left', ({ viewers: roomViewers }) => {
      setViewers(roomViewers);
    });

    socketInstance.on('anesthesia-update', (payload: AnesthesiaUpdatePayload) => {
      console.log('[Socket] Received update:', payload.section, 'for record:', payload.recordId);
      
      // Filter by client session ID to allow cross-device sync for same user
      // while avoiding redundant refetches on the originating tab
      if (payload.clientSessionId && payload.clientSessionId === clientSessionId) {
        console.log('[Socket] Ignoring own session update');
        return;
      }
      
      setLastUpdate(payload);
      
      const getQueryKey = SECTION_TO_QUERY_KEY[payload.section];
      if (getQueryKey) {
        const queryKey = getQueryKey(payload.recordId);
        console.log('[Socket] Invalidating query:', queryKey);
        
        queryClient.invalidateQueries({ 
          queryKey,
          refetchType: 'active',
        });
        
        // Also invalidate vitals snapshot when vitals are updated
        if (payload.section === 'vitals' || payload.section === 'rhythm') {
          queryClient.invalidateQueries({
            queryKey: [`/api/anesthesia/vitals/snapshot/${payload.recordId}`],
            refetchType: 'active',
          });
        }
        
        if (['checklists', 'intraOp', 'countsSterile', 'surgeryStaff'].includes(payload.section)) {
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey;
              return Array.isArray(key) && 
                typeof key[0] === 'string' && 
                key[0].includes('/api/anesthesia/records/surgery');
            },
            refetchType: 'active',
          });
        }
      }
    });

    setSocket(socketInstance);

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [(user as any)?.id]);

  const joinSurgery = useCallback((recordId: string) => {
    if (!socket || !recordId) return;
    
    if (currentRoomRef.current && currentRoomRef.current !== recordId) {
      socket.emit('leave-surgery', currentRoomRef.current);
    }
    
    currentRoomRef.current = recordId;
    socket.emit('join-surgery', recordId);
  }, [socket]);

  const leaveSurgery = useCallback((recordId: string) => {
    if (!socket || !recordId) return;
    
    socket.emit('leave-surgery', recordId);
    if (currentRoomRef.current === recordId) {
      currentRoomRef.current = null;
    }
    setViewers(0);
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, joinSurgery, leaveSurgery, viewers, lastUpdate }}>
      {children}
    </SocketContext.Provider>
  );
}

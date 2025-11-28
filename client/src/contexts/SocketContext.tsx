import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { clientSessionId } from '@/utils/sessionId';

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
  | 'timeMarkers';

interface AnesthesiaUpdatePayload {
  recordId: string;
  section: AnesthesiaDataSection;
  data: unknown;
  timestamp: number;
  userId?: string;
  clientSessionId?: string;
}

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'stale';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  connectionState: ConnectionState;
  joinSurgery: (recordId: string) => void;
  leaveSurgery: (recordId: string) => void;
  forceReconnect: () => void;
  viewers: number;
  lastUpdate: AnesthesiaUpdatePayload | null;
  lastHeartbeat: number | null;
}

const HEARTBEAT_INTERVAL = 20000;
const HEARTBEAT_TIMEOUT = 10000;
const MAX_MISSED_HEARTBEATS = 2;
const STALE_THRESHOLD = 60000;

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  connectionState: 'disconnected',
  joinSurgery: () => {},
  leaveSurgery: () => {},
  forceReconnect: () => {},
  viewers: 0,
  lastUpdate: null,
  lastHeartbeat: null,
});

export function useSocket() {
  return useContext(SocketContext);
}

const SECTION_TO_QUERY_KEY: Record<AnesthesiaDataSection, (recordId: string) => string[]> = {
  vitals: (recordId) => [`/api/anesthesia/vitals/${recordId}`],
  medications: (recordId) => [`/api/anesthesia/medications/${recordId}`],
  ventilation: (recordId) => [`/api/anesthesia/ventilation-modes/${recordId}`],
  ventilationParams: (recordId) => [`/api/anesthesia/vitals/snapshot/${recordId}`],
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
  timeMarkers: (recordId) => [`/api/anesthesia/records/surgery`],
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [viewers, setViewers] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<AnesthesiaUpdatePayload | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const missedHeartbeatsRef = useRef(0);
  const lastVisibleTimeRef = useRef<number>(Date.now());
  const socketRef = useRef<Socket | null>(null);

  const invalidateAllAnesthesiaQueries = useCallback((recordId: string) => {
    console.log('[Socket] Resyncing all data for record:', recordId);
    
    Object.values(SECTION_TO_QUERY_KEY).forEach((getQueryKey) => {
      const queryKey = getQueryKey(recordId);
      queryClient.invalidateQueries({ 
        queryKey,
        refetchType: 'active',
      });
    });
    
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && 
          typeof key[0] === 'string' && 
          (key[0].includes('/api/anesthesia') || key[0].includes('/api/items'));
      },
      refetchType: 'active',
    });
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
    missedHeartbeatsRef.current = 0;
  }, []);

  const triggerReconnect = useCallback((socketInstance: Socket, reason: string) => {
    console.log(`[Socket] Triggering reconnect due to: ${reason}`);
    stopHeartbeat();
    setConnectionState('stale');
    
    socketInstance.disconnect();
    
    setTimeout(() => {
      console.log('[Socket] Initiating reconnection...');
      setConnectionState('connecting');
      socketInstance.connect();
    }, 100);
  }, [stopHeartbeat]);

  const startHeartbeat = useCallback((socketInstance: Socket) => {
    stopHeartbeat();
    
    const sendHeartbeat = () => {
      if (!socketInstance.connected) {
        console.log('[Socket] Socket not connected, skipping heartbeat');
        return;
      }
      
      const pingTime = Date.now();
      socketInstance.emit('client:ping', { timestamp: pingTime });
      
      heartbeatTimeoutRef.current = setTimeout(() => {
        missedHeartbeatsRef.current++;
        console.log(`[Socket] Heartbeat timeout (missed: ${missedHeartbeatsRef.current})`);
        
        if (missedHeartbeatsRef.current >= MAX_MISSED_HEARTBEATS) {
          triggerReconnect(socketInstance, 'heartbeat timeout');
        }
      }, HEARTBEAT_TIMEOUT);
    };
    
    sendHeartbeat();
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  }, [stopHeartbeat, triggerReconnect]);

  const forceReconnect = useCallback(() => {
    const socketInstance = socketRef.current;
    if (!socketInstance) return;
    
    triggerReconnect(socketInstance, 'manual force reconnect');
  }, [triggerReconnect]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const hiddenDuration = now - lastVisibleTimeRef.current;
        
        console.log(`[Socket] Page visible after ${Math.round(hiddenDuration / 1000)}s`);
        
        const socketInstance = socketRef.current;
        if (!socketInstance) return;
        
        if (hiddenDuration > STALE_THRESHOLD) {
          console.log('[Socket] Long hidden duration, forcing reconnect and resync');
          triggerReconnect(socketInstance, 'visibility wake-up after long hidden');
          
          if (currentRoomRef.current) {
            setTimeout(() => {
              invalidateAllAnesthesiaQueries(currentRoomRef.current!);
            }, 500);
          }
        } else if (!socketInstance.connected) {
          console.log('[Socket] Not connected after visibility, reconnecting');
          setConnectionState('connecting');
          socketInstance.connect();
        } else {
          startHeartbeat(socketInstance);
        }
      } else {
        lastVisibleTimeRef.current = Date.now();
        stopHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startHeartbeat, stopHeartbeat, invalidateAllAnesthesiaQueries, triggerReconnect]);

  useEffect(() => {
    if (!user) {
      if (socket) {
        stopHeartbeat();
        socket.disconnect();
        setSocket(null);
        socketRef.current = null;
        setIsConnected(false);
        setConnectionState('disconnected');
      }
      return;
    }

    const socketInstance = io({
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.2,
      timeout: 20000,
    });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected:', socketInstance.id);
      setIsConnected(true);
      setConnectionState('connected');
      missedHeartbeatsRef.current = 0;
      setLastHeartbeat(Date.now());
      
      startHeartbeat(socketInstance);
      
      if (currentRoomRef.current) {
        socketInstance.emit('join-surgery', currentRoomRef.current);
        invalidateAllAnesthesiaQueries(currentRoomRef.current);
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
      setConnectionState('disconnected');
      stopHeartbeat();
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setIsConnected(false);
      setConnectionState('disconnected');
    });

    socketInstance.io.on('reconnect_attempt', (attempt) => {
      console.log(`[Socket] Reconnection attempt ${attempt}`);
      setConnectionState('connecting');
    });

    socketInstance.io.on('reconnect', (attempt) => {
      console.log(`[Socket] Reconnected after ${attempt} attempts`);
      setConnectionState('connected');
      
      if (currentRoomRef.current) {
        console.log('[Socket] Re-joining room after reconnect:', currentRoomRef.current);
        socketInstance.emit('join-surgery', currentRoomRef.current);
        invalidateAllAnesthesiaQueries(currentRoomRef.current);
      }
    });

    socketInstance.io.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after all attempts');
      setConnectionState('disconnected');
    });

    socketInstance.on('server:pong', (data: { timestamp: number }) => {
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
      missedHeartbeatsRef.current = 0;
      setLastHeartbeat(Date.now());
      
      const latency = Date.now() - data.timestamp;
      if (latency > 5000) {
        console.log(`[Socket] High latency detected: ${latency}ms`);
      }
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
        
        if (payload.section === 'vitals' || payload.section === 'rhythm') {
          queryClient.invalidateQueries({
            queryKey: [`/api/anesthesia/vitals/snapshot/${payload.recordId}`],
            refetchType: 'active',
          });
        }
        
        if (['checklists', 'intraOp', 'countsSterile', 'surgeryStaff', 'timeMarkers'].includes(payload.section)) {
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
      stopHeartbeat();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      socketInstance.disconnect();
      setSocket(null);
      socketRef.current = null;
      setIsConnected(false);
      setConnectionState('disconnected');
    };
  }, [(user as any)?.id, startHeartbeat, stopHeartbeat, invalidateAllAnesthesiaQueries]);

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
    <SocketContext.Provider value={{ 
      socket, 
      isConnected, 
      connectionState,
      joinSurgery, 
      leaveSurgery, 
      forceReconnect,
      viewers, 
      lastUpdate,
      lastHeartbeat,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

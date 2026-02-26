import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

const WS_PORT = 21965;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 5000;

/**
 * Connects to the card reader bridge's local WebSocket server on localhost.
 * When a card is scanned, the bridge pushes a navigation event and this hook
 * navigates in-app — no new browser tab.
 *
 * Silently retries if the bridge isn't running (no errors shown to user).
 */
export function useCardReaderBridge() {
  const [, setLocation] = useLocation();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;

    function connect() {
      if (unmounted.current) return;

      try {
        const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectDelay.current = RECONNECT_BASE_MS;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "navigate" && typeof data.url === "string") {
              setLocation(data.url);
            }
          } catch {
            // ignore malformed messages
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          scheduleReconnect();
        };

        ws.onerror = () => {
          // onclose fires after this — reconnect happens there
          ws.close();
        };
      } catch {
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (unmounted.current) return;
      reconnectTimer.current = setTimeout(() => {
        connect();
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 1.5,
          RECONNECT_MAX_MS,
        );
      }, reconnectDelay.current);
    }

    connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [setLocation]);
}

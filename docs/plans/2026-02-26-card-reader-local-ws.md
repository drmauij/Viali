# Card Reader Local WebSocket Bridge — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a card is scanned, navigate the already-open browser tab instead of always opening a new one. Fall back to opening a new tab if no browser session is active.

**Architecture:** The Python bridge adds a local WebSocket server on `localhost:21965`. The frontend hook connects to it on load. When a card is read, the bridge pushes the navigation URL over WebSocket instead of calling `webbrowser.open()`. If no clients are connected, falls back to the old behavior.

**Tech Stack:** Python `websockets` library (async, threaded), native browser `WebSocket` API, wouter for navigation.

---

### Task 1: Add WebSocket server to Python bridge

**Files:**
- Modify: `card-reader/bridge.py`
- Modify: `card-reader/requirements.txt`

**Step 1: Add `websockets` dependency**

In `card-reader/requirements.txt`, add:

```
websockets>=12.0
```

**Step 2: Add WebSocket server class to `bridge.py`**

After the existing imports (line ~20), add:

```python
import json
import asyncio

try:
    import websockets
    import websockets.asyncio.server
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False
    log.warning("websockets not installed — local browser push disabled. Run: pip install websockets")
```

After the `post_card_data` function (line ~274), add the `LocalWSServer` class:

```python
class LocalWSServer:
    """Tiny WebSocket server on localhost for pushing navigation events to the browser."""

    def __init__(self, port=21965):
        self.port = port
        self.clients: set = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    async def _handler(self, websocket):
        self.clients.add(websocket)
        log.info(f"Browser connected (clients: {len(self.clients)})")
        try:
            async for _ in websocket:
                pass  # we only push, never receive
        finally:
            self.clients.discard(websocket)
            log.info(f"Browser disconnected (clients: {len(self.clients)})")

    def has_clients(self) -> bool:
        return len(self.clients) > 0

    def send(self, message: str) -> bool:
        """Thread-safe send from the polling thread. Returns True if clients were available."""
        if not self._loop or not self.clients:
            return False
        future = asyncio.run_coroutine_threadsafe(self._broadcast(message), self._loop)
        try:
            future.result(timeout=2)
            return True
        except Exception as e:
            log.error(f"WebSocket broadcast error: {e}")
            return False

    async def _broadcast(self, message: str):
        if self.clients:
            await asyncio.gather(
                *[c.send(message) for c in self.clients],
                return_exceptions=True,
            )

    async def _serve(self):
        self._loop = asyncio.get_running_loop()
        async with websockets.asyncio.server.serve(
            self._handler, "localhost", self.port
        ):
            log.info(f"WebSocket server listening on ws://localhost:{self.port}")
            await asyncio.Future()  # run forever

    def run(self):
        """Blocking — call from a daemon thread."""
        try:
            asyncio.run(self._serve())
        except Exception as e:
            log.error(f"WebSocket server error: {e}")
```

**Step 3: Wire WebSocket server into `CardReaderBridge`**

In `CardReaderBridge.__init__` (line ~344), add after `self.last_card_time = 0`:

```python
        ws_port = int(self.config.get("WS_PORT", "21965"))
        if HAS_WEBSOCKETS:
            self.ws_server = LocalWSServer(port=ws_port)
        else:
            self.ws_server = None
```

In `CardReaderBridge.run` (line ~453), start the WS server thread before the poll thread:

```python
        if self.ws_server:
            ws_thread = threading.Thread(target=self.ws_server.run, daemon=True)
            ws_thread.start()
```

**Step 4: Replace `webbrowser.open` with WebSocket-first logic**

In `poll_loop`, replace the block at line ~418-422:

```python
                            success, result = post_card_data(self.config, patient)
                            if success:
                                log.info(f"Opening: {result}")
                                webbrowser.open(result)
                                self.tray.set_status("green", f"Viali Card Reader - {name}")
```

With:

```python
                            success, result = post_card_data(self.config, patient)
                            if success:
                                pushed = False
                                if self.ws_server and self.ws_server.has_clients():
                                    relative_url = result.replace(
                                        self.config["VIALI_URL"].rstrip("/"), ""
                                    )
                                    msg = json.dumps({"type": "navigate", "url": relative_url})
                                    pushed = self.ws_server.send(msg)
                                    if pushed:
                                        log.info(f"Pushed to browser: {relative_url}")

                                if not pushed:
                                    log.info(f"Opening new tab: {result}")
                                    webbrowser.open(result)

                                self.tray.set_status("green", f"Viali Card Reader - {name}")
```

**Step 5: Commit**

```bash
git add card-reader/bridge.py card-reader/requirements.txt
git commit -m "feat(card-reader): add local WebSocket server for in-app navigation"
```

---

### Task 2: Add `WS_PORT` to bridge config template

**Files:**
- Modify: `card-reader/config.env.template`

**Step 1: Add WS_PORT config**

After the `POLL_INTERVAL_SECONDS` line, add:

```ini
# ============================================
# LOCAL BROWSER INTEGRATION
# ============================================
# Port for the local WebSocket server that pushes card events to an open browser tab.
# The browser tab connects to ws://localhost:<port> to receive navigation events.
# Set to 0 to disable (always opens new browser tab).
WS_PORT=21965
```

**Step 2: Commit**

```bash
git add card-reader/config.env.template
git commit -m "feat(card-reader): add WS_PORT config for local browser push"
```

---

### Task 3: Create `useCardReaderBridge` hook

**Files:**
- Create: `client/src/hooks/useCardReaderBridge.ts`

**Step 1: Write the hook**

```typescript
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

const WS_PORT = 21965;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

/**
 * Connects to the card reader bridge's local WebSocket server.
 * When a card is scanned and the bridge pushes a navigation event,
 * this hook navigates in-app instead of the bridge opening a new tab.
 *
 * Silently retries if the bridge isn't running — no errors shown to user.
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
          // onclose will fire after this — reconnect happens there
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
        // Exponential backoff capped at max
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
```

**Step 2: Commit**

```bash
git add client/src/hooks/useCardReaderBridge.ts
git commit -m "feat(frontend): add useCardReaderBridge hook for local WS navigation"
```

---

### Task 4: Wire hook into Layout

**Files:**
- Modify: `client/src/components/Layout.tsx`

**Step 1: Import and call the hook**

Add import at top of `Layout.tsx`:

```typescript
import { useCardReaderBridge } from "@/hooks/useCardReaderBridge";
```

Inside the `Layout` component function, after the existing `useEffect` and before `handleHospitalChange`, add:

```typescript
  // Connect to local card reader bridge (silent — no error if bridge isn't running)
  useCardReaderBridge();
```

This only activates when the user is authenticated (the hook is inside `Layout` which renders the authenticated view). The hook silently reconnects, so on machines without a card reader it just retries quietly in the background.

**Step 2: Run type check**

```bash
npm run check
```

Expected: No errors.

**Step 3: Commit**

```bash
git add client/src/components/Layout.tsx
git commit -m "feat: wire card reader bridge hook into Layout"
```

---

### Task 5: Manual integration test

**Steps to verify:**

1. Start the dev server: `npm run dev`
2. Run the bridge (or a mock WS server on port 21965)
3. Open the app in a browser — check browser DevTools console for WebSocket connection to `ws://localhost:21965`
4. Send a test message to the WS: `{"type":"navigate","url":"/patients?newPatient=1&surname=Test&firstName=User&birthday=1990-01-01&sex=M"}`
5. Verify the browser navigates to the patients page with the create dialog pre-filled — without opening a new tab
6. Test the fallback: stop the WS server, verify the bridge falls back to `webbrowser.open()`

For quick mock testing without the physical card reader, use `websocat`:

```bash
# Terminal 1: start a mock WS server
websocat -s 21965

# Terminal 2: after browser connects, type the JSON message
{"type":"navigate","url":"/patients?newPatient=1&surname=Test&firstName=User&birthday=1990-01-01&sex=M"}
```

export function generateInfusionSessionId(): string {
  return crypto.randomUUID();
}

const CLIENT_SESSION_KEY = 'viali_client_session_id';

export function getClientSessionId(): string {
  let sessionId = sessionStorage.getItem(CLIENT_SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(CLIENT_SESSION_KEY, sessionId);
  }
  return sessionId;
}

export const clientSessionId = getClientSessionId();

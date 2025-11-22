export function generateInfusionSessionId(): string {
  return crypto.randomUUID();
}

import { Users, ArrowDown, ArrowUp, Eye, Sun, MessageSquareText, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Common events with icons and types
 * Shared between EventDialog (for quick selection) and EventsSwimlane (for icon rendering)
 */
export interface CommonEvent {
  label: string;
  icon: LucideIcon;
  type: string;
}

export const COMMON_EVENTS: CommonEvent[] = [
  { label: "Team Timeout", icon: Users, type: "team_timeout" },
  { label: "Intubation", icon: ArrowDown, type: "intubation" },
  { label: "Extubation", icon: ArrowUp, type: "extubation" },
  { label: "Eye Protection", icon: Eye, type: "eye_protection" },
  { label: "Warm Touch", icon: Sun, type: "warm_touch" },
  { label: "Position Proofed", icon: UserCheck, type: "position_proofed" },
];

/**
 * Get the icon component for a given event type
 */
export function getEventIcon(eventType: string | null | undefined): LucideIcon {
  if (!eventType) {
    // Return a generic message icon for events without a type
    return MessageSquareText;
  }
  
  const commonEvent = COMMON_EVENTS.find(e => e.type === eventType);
  return commonEvent ? commonEvent.icon : MessageSquareText;
}

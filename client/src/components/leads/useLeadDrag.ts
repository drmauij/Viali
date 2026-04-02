import type { Lead } from "@shared/schema";

export let draggedLead: Lead | null = null;

export function setDraggedLead(lead: Lead | null) {
  draggedLead = lead;
}

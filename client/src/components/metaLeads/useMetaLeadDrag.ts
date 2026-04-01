import type { MetaLead } from "@shared/schema";

export let draggedMetaLead: MetaLead | null = null;

export function setDraggedMetaLead(lead: MetaLead | null) {
  draggedMetaLead = lead;
}

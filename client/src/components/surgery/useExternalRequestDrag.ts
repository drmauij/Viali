import type { ExternalSurgeryRequest } from "@shared/schema";

export let draggedRequest: ExternalSurgeryRequest | null = null;

export function setDraggedRequest(r: ExternalSurgeryRequest | null) {
  draggedRequest = r;
}

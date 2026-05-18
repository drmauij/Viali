import type { RecoveryCaseRow } from './RecoveryCaseCard';

// Mirrors leads/useLeadDrag — module-level holder so the calendar drop
// target can pick up the dragged case without needing to wire prop drilling
// through the resizable panel boundary.
export let draggedRecoveryCase: RecoveryCaseRow | null = null;

export function setDraggedRecoveryCase(row: RecoveryCaseRow | null) {
  draggedRecoveryCase = row;
}

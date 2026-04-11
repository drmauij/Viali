export type { PostopOrderItem, PostopOrderItemType } from '@shared/postopOrderItems';
export type { PlannedEvent } from '@shared/postopOrderPlanning';

export interface OrderSetResponse {
  orderSet: {
    id: string;
    anesthesiaRecordId: string;
    templateId: string | null;
    items: import('@shared/postopOrderItems').PostopOrderItem[];
    signedBy: string | null;
    signedAt: string | null;
  };
  plannedEvents: Array<{
    id: string;
    itemId: string;
    kind: 'medication' | 'vitals_check' | 'task' | 'iv_fluid';
    plannedAt: string;
    plannedEndAt: string | null;
    payloadSnapshot: unknown;
    status: 'planned' | 'done' | 'missed' | 'cancelled';
    doneAt: string | null;
    doneBy: string | null;
    doneValue: unknown;
  }>;
}

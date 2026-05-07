import { useTranslation } from 'react-i18next';
import type { PostopOrderItem, PostopOrderItemType, TaskSubtype } from '@shared/postopOrderItems';
import { VitalsMonitoringEditor } from './VitalsMonitoringEditor';
import { MedicationEditor } from './MedicationEditor';
import { IvFluidEditor } from './IvFluidEditor';
import { LabEditor } from './LabEditor';
import { TaskEditor } from './TaskEditor';
import { BzSlidingScaleEditor } from './BzSlidingScaleEditor';

export interface ItemEditorProps<T extends PostopOrderItem = PostopOrderItem> {
  item: T;
  onChange: (item: T) => void;
  onRemove: () => void;
  hospitalId?: string;
}

export function ItemEditor(props: ItemEditorProps) {
  switch (props.item.type) {
    case 'vitals_monitoring': return <VitalsMonitoringEditor {...props as any} />;
    case 'medication':        return <MedicationEditor {...props as any} />;
    case 'iv_fluid':          return <IvFluidEditor {...props as any} />;
    case 'lab':               return <LabEditor {...props as any} />;
    case 'task':              return <TaskEditor {...props as any} />;
    case 'bz_sliding_scale':  return <BzSlidingScaleEditor {...props as any} />;
  }
}

export function useItemTypeLabels(): Record<PostopOrderItemType, string> {
  const { t } = useTranslation();
  return {
    vitals_monitoring: t('postopOrders.editor.vitalsMonitoring', 'Vitals Monitoring'),
    medication: t('postopOrders.editor.medication', 'Medication'),
    iv_fluid: t('postopOrders.editor.ivFluid', 'IV Fluid'),
    lab: t('postopOrders.editor.lab', 'Lab'),
    task: t('postopOrders.editor.task', 'Task'),
    bz_sliding_scale: t('postopOrders.editor.bzSlidingScale', 'BG Sliding Scale'),
  };
}

export function useTaskSubtypeLabels(): Record<TaskSubtype, string> {
  const { t } = useTranslation();
  return {
    generic:      t('postopOrders.taskSubtype.generic', 'Task'),
    positioning:  t('postopOrders.taskSubtype.positioning', 'Positioning'),
    drainage:     t('postopOrders.taskSubtype.drainage', 'Drainage'),
    nutrition:    t('postopOrders.taskSubtype.nutrition', 'Nutrition'),
    wound_care:   t('postopOrders.taskSubtype.woundCare', 'Wound Care'),
    mobilization: t('postopOrders.taskSubtype.mobilization', 'Mobilization'),
    note:         t('postopOrders.taskSubtype.note', 'Note'),
  };
}

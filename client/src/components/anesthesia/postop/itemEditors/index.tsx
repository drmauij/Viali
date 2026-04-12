import { useTranslation } from 'react-i18next';
import type { PostopOrderItem, PostopOrderItemType } from '@shared/postopOrderItems';
import { MobilizationEditor } from './MobilizationEditor';
import { PositioningEditor } from './PositioningEditor';
import { DrainEditor } from './DrainEditor';
import { NutritionEditor } from './NutritionEditor';
import { WoundCareEditor } from './WoundCareEditor';
import { VitalsMonitoringEditor } from './VitalsMonitoringEditor';
import { MedicationEditor } from './MedicationEditor';
import { IvFluidEditor } from './IvFluidEditor';
import { LabEditor } from './LabEditor';
import { TaskEditor } from './TaskEditor';
import { BzSlidingScaleEditor } from './BzSlidingScaleEditor';
import { FreeTextEditor } from './FreeTextEditor';

export interface ItemEditorProps<T extends PostopOrderItem = PostopOrderItem> {
  item: T;
  onChange: (item: T) => void;
  onRemove: () => void;
}

export function ItemEditor(props: ItemEditorProps) {
  switch (props.item.type) {
    case 'mobilization':      return <MobilizationEditor {...props as any} />;
    case 'positioning':       return <PositioningEditor {...props as any} />;
    case 'drain':             return <DrainEditor {...props as any} />;
    case 'nutrition':         return <NutritionEditor {...props as any} />;
    case 'wound_care':        return <WoundCareEditor {...props as any} />;
    case 'vitals_monitoring': return <VitalsMonitoringEditor {...props as any} />;
    case 'medication':        return <MedicationEditor {...props as any} />;
    case 'iv_fluid':          return <IvFluidEditor {...props as any} />;
    case 'lab':               return <LabEditor {...props as any} />;
    case 'task':              return <TaskEditor {...props as any} />;
    case 'bz_sliding_scale':  return <BzSlidingScaleEditor {...props as any} />;
    case 'free_text':         return <FreeTextEditor {...props as any} />;
  }
}

export function useItemTypeLabels(): Record<PostopOrderItemType, string> {
  const { t } = useTranslation();
  return {
    mobilization: t('postopOrders.editor.mobilization', 'Mobilization'),
    positioning: t('postopOrders.editor.positioning', 'Positioning'),
    drain: t('postopOrders.editor.drain', 'Drainage'),
    nutrition: t('postopOrders.editor.nutrition', 'Nutrition'),
    wound_care: t('postopOrders.editor.woundCare', 'Wound Care'),
    vitals_monitoring: t('postopOrders.editor.vitalsMonitoring', 'Vitals Monitoring'),
    medication: t('postopOrders.editor.medication', 'Medication'),
    iv_fluid: t('postopOrders.editor.ivFluid', 'IV Fluid'),
    lab: t('postopOrders.editor.lab', 'Lab'),
    task: t('postopOrders.editor.task', 'Task'),
    bz_sliding_scale: t('postopOrders.editor.bzSlidingScale', 'BG Sliding Scale'),
    free_text: t('postopOrders.editor.freeText', 'Free Text'),
  };
}

/** @deprecated Use useItemTypeLabels() hook instead */
export const ITEM_TYPE_LABELS: Record<PostopOrderItemType, string> = {
  mobilization: 'Mobilisation',
  positioning: 'Lagerung',
  drain: 'Drainage',
  nutrition: 'Nahrung',
  wound_care: 'Wundversorgung',
  vitals_monitoring: 'Vitalzeichen',
  medication: 'Medikation',
  iv_fluid: 'Infusion',
  lab: 'Labor',
  task: 'Aufgabe',
  bz_sliding_scale: 'BZ-Schema',
  free_text: 'Freitext',
};

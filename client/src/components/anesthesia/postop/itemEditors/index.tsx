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

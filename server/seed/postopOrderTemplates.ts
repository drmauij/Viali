import { postopOrdersStorage } from '../storage/postopOrders';
import type { PostopOrderItem } from '@shared/postopOrderItems';
import { randomUUID } from 'crypto';

function id() { return randomUUID(); }

const pacuShortItems: PostopOrderItem[] = [
  { id: id(), type: 'mobilization', value: 'free' },
  { id: id(), type: 'positioning', value: 'head_up_30' },
  { id: id(), type: 'nutrition', value: 'vollkost', startAfter: '2h postop' },
  { id: id(), type: 'wound_care', check: 'daily', dressingChange: 'on_soaking' },
  { id: id(), type: 'vitals_monitoring', parameter: 'BP', frequency: 'q1h', min: 90, max: 160,
    actionLow: 'Volumengabe 250ml + 5mg Ephedrin iv, Info Arzt',
    actionHigh: '5mg Ebrantil iv, Info Arzt' },
  { id: id(), type: 'vitals_monitoring', parameter: 'spo2', frequency: 'continuous', min: 92,
    actionLow: 'O2-Gabe, Arztinfo' },
  { id: id(), type: 'vitals_monitoring', parameter: 'temp', frequency: '2x_daily', max: 38.5,
    actionHigh: 'Fieberkurve, Infektsuche' },
  // Ambulatory care tasks
  { id: id(), type: 'task', title: 'Antibiotikum nach 4h wiederholen', when: 'conditional', condition: 'falls AB gegeben' },
  { id: id(), type: 'task', title: 'OSAS: Min. 4h Beobachtung nach letztem Opioid', when: 'conditional', condition: 'bei OSAS-Patienten' },
  { id: id(), type: 'task', title: 'Begleitperson für Entlassung erforderlich', when: 'ad_hoc' },
  { id: id(), type: 'task', title: 'Motorik-Check nach Regionalanästhesie', when: 'ad_hoc', actionHint: 'Vor Entlassung Sensibilität und Motorik prüfen' },
  { id: id(), type: 'task', title: 'Verlängerte Überwachung (Risiko-Patient)', when: 'ad_hoc' },
  { id: id(), type: 'task', title: 'Keine oralen Antikoagulanzien für 24h', when: 'conditional', condition: 'nach Regionalanästhesie' },
  // PRN pain medications
  { id: id(), type: 'medication', medicationRef: 'Paracetamol', dose: '1000 mg', route: 'iv', scheduleMode: 'prn', prnMaxPerDay: 4, prnMaxPerInterval: { intervalH: 6, count: 1 } },
  { id: id(), type: 'medication', medicationRef: 'Ibuprofen', dose: '400 mg', route: 'po', scheduleMode: 'prn', prnMaxPerDay: 3, prnMaxPerInterval: { intervalH: 8, count: 1 } },
  { id: id(), type: 'medication', medicationRef: 'Novalgin', dose: '1000 mg', route: 'iv', scheduleMode: 'prn', prnMaxPerDay: 4, prnMaxPerInterval: { intervalH: 6, count: 1 } },
];

const overnightItems: PostopOrderItem[] = [
  ...pacuShortItems,
  { id: id(), type: 'lab', panel: ['Hb','Hkt','BGA','Kreatinin'], when: 'one_shot', oneShotOffsetH: 6,
    thresholds: [
      { param: 'Hb', op: '<', value: 7, action: 'Transfusionsindikation prüfen' },
      { param: 'Kreatinin', op: '>', value: 1.2, action: 'Nierenfunktion beobachten' },
    ]},
  { id: id(), type: 'lab', panel: ['Hb','Kreatinin'], when: 'daily' },
  { id: id(), type: 'iv_fluid', solution: 'ringer_lactate', volumeMl: 1000, durationH: 12 },
  { id: id(), type: 'bz_sliding_scale', drug: 'Actrapid',
    rules: [{ above: 120, units: 2 }, { above: 180, units: 3 }, { above: 240, units: 4 }],
    increment: { per: 60, units: 1 } },
  { id: id(), type: 'task', title: 'Wundkontrolle', when: 'daily' },
  { id: id(), type: 'task', title: 'Verbandwechsel bei Durchnässung', when: 'ad_hoc' },
];

export async function seedPostopOrderTemplates(hospitalId: string): Promise<void> {
  const existing = await postopOrdersStorage.listTemplates(hospitalId);
  const names = new Set(existing.map(t => t.name));
  if (!names.has('PACU — short stay')) {
    await postopOrdersStorage.createTemplate({
      hospitalId, name: 'PACU — short stay',
      description: 'Default orders for routine day-case PACU stays',
      items: pacuShortItems, sortOrder: 0,
    });
  }
  if (!names.has('Overnight / Ward')) {
    await postopOrdersStorage.createTemplate({
      hospitalId, name: 'Overnight / Ward',
      description: 'Extended orders for overnight or ward stays',
      items: overnightItems, sortOrder: 1,
    });
  }
}

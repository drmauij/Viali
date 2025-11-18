type AnesthesiaItem = {
  id: string;
  name: string;
  administrationUnit?: string;
  administrationRoute?: string;
  ampuleConcentration?: string;
  ampuleTotalContent?: string;
  medicationGroup?: string;
  rateUnit?: string | null;
  administrationGroup?: string;
  defaultDose?: string | null;
};

type AdministrationGroup = {
  id: string;
  name: string;
  hospitalId: string;
  sortOrder: number;
  createdAt: string;
};

export function buildItemToSwimlaneMap(
  anesthesiaItems: AnesthesiaItem[],
  administrationGroups: AdministrationGroup[]
): Map<string, string> {
  const map = new Map<string, string>();
  
  anesthesiaItems.forEach(item => {
    if (item.administrationGroup) {
      const swimlaneId = `group_${item.administrationGroup}_item_${item.id}`;
      map.set(item.id, swimlaneId);
    }
  });
  
  return map;
}

export function transformMedicationDoses(
  medications: any[],
  itemToSwimlane: Map<string, string>
): { [swimlaneId: string]: Array<[number, string, string]> } {
  const doseData: { [swimlaneId: string]: Array<[number, string, string]> } = {};
  
  medications
    .filter(med => med.type === 'bolus')
    .forEach(med => {
      const swimlaneId = itemToSwimlane.get(med.itemId);
      if (!swimlaneId) return;
      
      const timestamp = new Date(med.timestamp).getTime();
      const dose = med.dose || '?';
      const id = med.id;
      
      if (!doseData[swimlaneId]) {
        doseData[swimlaneId] = [];
      }
      
      doseData[swimlaneId].push([timestamp, dose, id]);
    });
  
  Object.keys(doseData).forEach(swimlaneId => {
    doseData[swimlaneId].sort((a, b) => a[0] - b[0]);
  });
  
  return doseData;
}

export function transformRateInfusions(
  medications: any[],
  itemToSwimlane: Map<string, string>,
  anesthesiaItems: AnesthesiaItem[]
): { [swimlaneId: string]: any[] } {
  const sessions: { [swimlaneId: string]: any[] } = {};
  
  const infusionsByLane: { [swimlaneId: string]: any[] } = {};
  
  medications
    .filter(med => ['infusion_start', 'rate_change', 'infusion_stop'].includes(med.type))
    .forEach(med => {
      const swimlaneId = itemToSwimlane.get(med.itemId);
      if (!swimlaneId) return;
      
      if (!infusionsByLane[swimlaneId]) {
        infusionsByLane[swimlaneId] = [];
      }
      infusionsByLane[swimlaneId].push(med);
    });
  
  Object.entries(infusionsByLane).forEach(([swimlaneId, records]) => {
    records.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    const startRecords = records.filter(r => r.type === 'infusion_start');
    if (startRecords.length === 0) return;
    
    sessions[swimlaneId] = [];
    
    startRecords.forEach(startRecord => {
      const itemId = startRecord.itemId;
      const item = anesthesiaItems.find(i => i.id === itemId);
      if (!item || !item.rateUnit || item.rateUnit === 'free') return;
      
      const startTime = new Date(startRecord.timestamp).getTime();
      
      const stopRecord = records.find(r => 
        r.type === 'infusion_stop' && new Date(r.timestamp).getTime() > startTime && new Date(r.timestamp).getTime() <= startTime + 24 * 60 * 60 * 1000
      );
      const hasEndTimestamp = !!startRecord.endTimestamp;
      const endTime = stopRecord 
        ? new Date(stopRecord.timestamp).getTime() 
        : (hasEndTimestamp ? new Date(startRecord.endTimestamp).getTime() : null);
      const state = (stopRecord || hasEndTimestamp) ? 'stopped' : 'running';
      
      const segments: any[] = [];
      
      segments.push({
        startTime,
        rate: startRecord.rate || '0',
        rateUnit: item.rateUnit || 'ml/h',
      });
      
      records
        .filter(r => {
          if (r.type !== 'rate_change') return false;
          const changeTime = new Date(r.timestamp).getTime();
          if (changeTime <= startTime) return false;
          if (endTime && changeTime >= endTime) return false;
          return true;
        })
        .forEach(rateChange => {
          segments.push({
            startTime: new Date(rateChange.timestamp).getTime(),
            rate: rateChange.rate || '0',
            rateUnit: item.rateUnit || 'ml/h',
          });
        });
      
      sessions[swimlaneId].push({
        swimlaneId,
        label: item.name,
        syringeQuantity: startRecord.dose || '50ml',
        segments,
        state,
        startTime,
        endTime,
      });
    });
  });
  
  return sessions;
}

export function transformFreeFlowInfusions(
  medications: any[],
  itemToSwimlane: Map<string, string>,
  anesthesiaItems: AnesthesiaItem[]
): { [swimlaneId: string]: any[] } {
  const sessions: { [swimlaneId: string]: any[] } = {};
  
  const recordsByLane: { [swimlaneId: string]: any[] } = {};
  
  medications
    .filter(med => ['infusion_start', 'infusion_stop'].includes(med.type))
    .forEach(med => {
      const swimlaneId = itemToSwimlane.get(med.itemId);
      if (!swimlaneId) return;
      
      if (!recordsByLane[swimlaneId]) {
        recordsByLane[swimlaneId] = [];
      }
      recordsByLane[swimlaneId].push(med);
    });
  
  Object.entries(recordsByLane).forEach(([swimlaneId, records]) => {
    const startRecords = records.filter(r => r.type === 'infusion_start');
    
    startRecords.forEach(startRec => {
      const item = anesthesiaItems.find(i => i.id === startRec.itemId);
      if (!item || item.rateUnit !== 'free') return;
      
      const startTime = new Date(startRec.timestamp).getTime();
      
      const hasEndTimestamp = !!startRec.endTimestamp;
      const stopRecord = records.find(r => 
        r.type === 'infusion_stop' && new Date(r.timestamp).getTime() > startTime
      );
      
      if (hasEndTimestamp || stopRecord) return;
      
      if (!sessions[swimlaneId]) {
        sessions[swimlaneId] = [];
      }
      
      sessions[swimlaneId].push({
        swimlaneId,
        startTime,
        dose: startRec.dose || '?',
        label: item.name,
      });
    });
  });
  
  return sessions;
}

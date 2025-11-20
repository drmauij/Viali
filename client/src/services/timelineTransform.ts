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
  
  const itemsByAdminGroup: Record<string, AnesthesiaItem[]> = {};
  anesthesiaItems.forEach(item => {
    if (item.administrationGroup) {
      if (!itemsByAdminGroup[item.administrationGroup]) {
        itemsByAdminGroup[item.administrationGroup] = [];
      }
      itemsByAdminGroup[item.administrationGroup].push(item);
    }
  });
  
  Object.keys(itemsByAdminGroup).forEach(groupId => {
    itemsByAdminGroup[groupId].sort((a, b) => a.name.localeCompare(b.name));
  });
  
  administrationGroups
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach(group => {
      const groupItems = itemsByAdminGroup[group.id] || [];
      groupItems.forEach((item, index) => {
        const swimlaneId = `admingroup-${group.id}-item-${index}`;
        map.set(item.id, swimlaneId);
      });
    });
  
  return map;
}

export function transformMedicationDoses(
  medications: any[],
  itemToSwimlane: Map<string, string>
): { [swimlaneId: string]: Array<[number, string, string]> } {
  const doseData: { [swimlaneId: string]: Array<[number, string, string]> } = {};
  
  // Only process true bolus medications - infusions are handled by separate transform functions
  medications
    .filter(med => med.type === 'bolus')
    .forEach(med => {
      const swimlaneId = itemToSwimlane.get(med.itemId);
      if (!swimlaneId) return;
      
      const timestamp = new Date(med.timestamp).getTime();
      const id = med.id;
      const displayValue = med.dose || '?';
      
      if (!doseData[swimlaneId]) {
        doseData[swimlaneId] = [];
      }
      
      doseData[swimlaneId].push([timestamp, displayValue, id]);
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
      
      const rateChanges = records.filter(r => {
        if (r.type !== 'rate_change') return false;
        const changeTime = new Date(r.timestamp).getTime();
        if (changeTime <= startTime) return false;
        if (endTime && changeTime >= endTime) return false;
        return true;
      });
      
      console.log('[RATE-TRANSFORM] Processing infusion:', {
        itemName: item.name,
        startTime,
        endTime,
        totalRecords: records.length,
        rateChangeCount: rateChanges.length,
        rateChanges: rateChanges.map(r => ({ timestamp: r.timestamp, rate: r.rate }))
      });
      
      rateChanges.forEach(rateChange => {
        segments.push({
          startTime: new Date(rateChange.timestamp).getTime(),
          rate: rateChange.rate || '0',
          rateUnit: item.rateUnit || 'ml/h',
        });
      });
      
      console.log('[RATE-TRANSFORM] Created session with segments:', {
        itemName: item.name,
        segmentCount: segments.length,
        segments: segments.map(s => ({ startTime: s.startTime, rate: s.rate }))
      });
      
      sessions[swimlaneId].push({
        id: startRecord.id, // Store medication record ID for editing/deleting
        swimlaneId,
        label: item.name,
        syringeQuantity: startRecord.dose || '50ml',
        startDose: startRecord.dose || '50ml', // Add start dose for rendering
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
    console.log('[FREE-FLOW-TRANSFORM] Processing swimlane:', swimlaneId, 'with', startRecords.length, 'start records');
    
    startRecords.forEach(startRec => {
      const item = anesthesiaItems.find(i => i.id === startRec.itemId);
      console.log('[FREE-FLOW-TRANSFORM] Checking record:', {
        itemId: startRec.itemId,
        foundItem: !!item,
        itemRateUnit: item?.rateUnit,
        recordRate: startRec.rate,
        dose: startRec.dose
      });
      
      // Check both item.rateUnit and startRec.rate to ensure it's a free-flow infusion
      if (!item || (item.rateUnit !== 'free' && startRec.rate !== 'free')) {
        console.log('[FREE-FLOW-TRANSFORM] Skipping - not a free-flow infusion');
        return;
      }
      
      const startTime = new Date(startRec.timestamp).getTime();
      
      const hasEndTimestamp = !!startRec.endTimestamp;
      const stopRecord = records.find(r => 
        r.type === 'infusion_stop' && new Date(r.timestamp).getTime() > startTime
      );
      
      // Calculate endTime if infusion is stopped
      const endTime = stopRecord 
        ? new Date(stopRecord.timestamp).getTime() 
        : (hasEndTimestamp ? new Date(startRec.endTimestamp).getTime() : null);
      
      console.log('[FREE-FLOW-TRANSFORM] Processing infusion:', { 
        hasEndTimestamp, 
        endTimestampValue: startRec.endTimestamp,
        hasStopRecord: !!stopRecord,
        endTime,
        medicationId: startRec.id
      });
      
      if (!sessions[swimlaneId]) {
        sessions[swimlaneId] = [];
      }
      
      const session = {
        id: startRec.id, // Store medication record ID for editing/deleting
        swimlaneId,
        startTime,
        dose: startRec.dose || '?',
        label: item.name,
        endTime, // null means still running, otherwise shows completed infusion
      };
      console.log('[FREE-FLOW-TRANSFORM] Creating free-flow session:', session);
      sessions[swimlaneId].push(session);
    });
  });
  
  return sessions;
}


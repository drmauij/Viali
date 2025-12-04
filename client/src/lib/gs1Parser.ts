export interface GS1ParsedData {
  gtin?: string;
  lotNumber?: string;
  expiryDate?: string;
  serialNumber?: string;
  productionDate?: string;
  ref?: string;
  raw: string;
}

const AI_DEFINITIONS: Record<string, { length: number | 'variable'; name: keyof Omit<GS1ParsedData, 'raw'> }> = {
  '01': { length: 14, name: 'gtin' },
  '10': { length: 'variable', name: 'lotNumber' },
  '17': { length: 6, name: 'expiryDate' },
  '21': { length: 'variable', name: 'serialNumber' },
  '11': { length: 6, name: 'productionDate' },
  '240': { length: 'variable', name: 'ref' },
};

export function parseGS1Code(code: string): GS1ParsedData {
  const result: GS1ParsedData = { raw: code };
  
  let cleanCode = code.trim();
  
  if (cleanCode.startsWith(']d2') || cleanCode.startsWith(']D2') || 
      cleanCode.startsWith(']C1') || cleanCode.startsWith(']c1') ||
      cleanCode.startsWith(']Q3') || cleanCode.startsWith(']q3')) {
    cleanCode = cleanCode.substring(3);
  }
  
  const GS = String.fromCharCode(29);
  
  let pos = 0;
  while (pos < cleanCode.length) {
    let matched = false;
    
    for (const aiLength of [3, 2]) {
      if (pos + aiLength > cleanCode.length) continue;
      
      const ai = cleanCode.substring(pos, pos + aiLength);
      const def = AI_DEFINITIONS[ai];
      
      if (def) {
        pos += aiLength;
        let value: string;
        
        if (def.length === 'variable') {
          const gsPos = cleanCode.indexOf(GS, pos);
          if (gsPos !== -1) {
            value = cleanCode.substring(pos, gsPos);
            pos = gsPos + 1;
          } else {
            value = cleanCode.substring(pos);
            pos = cleanCode.length;
          }
        } else {
          value = cleanCode.substring(pos, pos + def.length);
          pos += def.length;
        }
        
        if (def.name === 'expiryDate' || def.name === 'productionDate') {
          value = formatGS1Date(value);
        }
        
        result[def.name] = value;
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      pos++;
    }
  }
  
  if (!result.gtin && /^\d{13,14}$/.test(code)) {
    result.gtin = code.padStart(14, '0');
  }
  
  return result;
}

function formatGS1Date(dateStr: string): string {
  if (dateStr.length !== 6) return dateStr;
  
  const yy = dateStr.substring(0, 2);
  const mm = dateStr.substring(2, 4);
  const dd = dateStr.substring(4, 6);
  
  const yearNum = parseInt(yy, 10);
  const year = yearNum >= 50 ? `19${yy}` : `20${yy}`;
  
  const finalDay = dd === '00' ? '28' : dd;
  
  return `${year}-${mm}-${finalDay}`;
}

export function isGS1Code(code: string): boolean {
  const cleanCode = code.trim();
  
  if (cleanCode.startsWith(']d2') || cleanCode.startsWith(']D2') || 
      cleanCode.startsWith(']C1') || cleanCode.startsWith(']c1') ||
      cleanCode.startsWith(']Q3') || cleanCode.startsWith(']q3')) {
    return true;
  }
  
  if (cleanCode.startsWith('01') && cleanCode.length >= 16) {
    return true;
  }
  
  return false;
}

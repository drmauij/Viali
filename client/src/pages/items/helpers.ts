export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function parseCurrencyValue(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  
  if (typeof value === 'number') {
    return isNaN(value) ? undefined : value.toString();
  }
  
  let str = String(value).trim();
  
  str = str.replace(/^(CHF|EUR|USD|€|\$|Fr\.|SFr\.?)\s*/i, '');
  str = str.replace(/\s*(CHF|EUR|USD|€|\$|Fr\.|SFr\.?)$/i, '');
  
  const europeanDecimal = /,\d{2}$/.test(str);
  
  if (europeanDecimal) {
    str = str.replace(/['.\s]/g, '').replace(',', '.');
  } else {
    str = str.replace(/[',\s]/g, '');
  }
  
  str = str.replace(/[^\d.\-]/g, '');
  
  const num = parseFloat(str);
  if (isNaN(num)) return undefined;
  
  return num.toFixed(2);
}

export function extractPackSizeFromName(name: string | undefined | null): number | null {
  if (!name) return null;
  
  const patterns = [
    /(\d+)\s*(?:Amp(?:ullen?)?|Ampulle)\b/i,
    /(\d+)\s*(?:Stk\.?|Stück|Stueck)\b/i,
    /(\d+)\s*(?:St\.?)\b/i,
    /(\d+)\s*(?:Tabl?\.?|Tabletten?)\b/i,
    /(\d+)\s*(?:Kaps\.?|Kapseln?)\b/i,
    /(\d+)\s*(?:Stk|Pcs?|Pce?s?)\.?\b/i,
    /(\d+)\s*(?:Beutel|Btl\.?)\b/i,
    /(\d+)\s*(?:Flasche[n]?|Fl\.?)\b/i,
    /(\d+)\s*(?:Tube[n]?)\b/i,
    /(\d+)\s*(?:Dos(?:en)?|Dose)\b/i,
    /(\d+)\s*(?:Supp\.?|Suppositorien?)\b/i,
    /(\d+)\s*(?:Inj\.?|Injektionen?)\b/i,
    /(\d+)\s*(?:Einh\.?|Einheiten?)\b/i,
    /(\d+)\s*(?:x)\s*\d+/i,
  ];
  
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match && match[1]) {
      const size = parseInt(match[1], 10);
      if (size > 0 && size <= 10000) {
        return size;
      }
    }
  }
  
  return null;
}

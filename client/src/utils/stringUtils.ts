export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1.0;
  
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  
  return matches / longer.length;
}

export function extractDrugName(fullName: string): string {
  const match = fullName.match(/^([A-Za-z]+)/);
  return match ? match[1].toLowerCase() : fullName.toLowerCase();
}

export function isFreeFlowInfusion(drugName: string): boolean {
  return drugName.toLowerCase().includes('free-flow');
}

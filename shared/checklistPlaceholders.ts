import { checklistPlaceholderTokens, type ChecklistPlaceholderToken } from './schema';

export interface SurgeryContext {
  price?: string | number | null;
  admissionTime?: Date | string | null;
  plannedDate?: Date | string | null;
  plannedSurgery?: string | null;
  surgeonName?: string | null;
  patientName?: string | null;
  patientDob?: Date | string | null;
  surgeryRoom?: string | null;
  notes?: string | null;
  implantDetails?: string | null;
}

export interface PlaceholderInfo {
  token: ChecklistPlaceholderToken;
  label: string;
  description: string;
}

export const placeholderInfo: PlaceholderInfo[] = [
  { token: 'price', label: 'Price', description: 'Surgery price' },
  { token: 'admissionTime', label: 'Admission Time', description: 'Patient admission time' },
  { token: 'plannedDate', label: 'Planned Date', description: 'Scheduled surgery date and time' },
  { token: 'plannedSurgery', label: 'Planned Surgery', description: 'Name of the planned procedure' },
  { token: 'surgeonName', label: 'Surgeon Name', description: 'Operating surgeon' },
  { token: 'patientName', label: 'Patient Name', description: 'Patient full name' },
  { token: 'patientDob', label: 'Patient DOB', description: 'Patient date of birth' },
  { token: 'surgeryRoom', label: 'Surgery Room', description: 'Operating room name' },
  { token: 'notes', label: 'Notes', description: 'Surgery notes' },
  { token: 'implantDetails', label: 'Implant Details', description: 'Implant specifications' },
];

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
}

function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(price: string | number | null | undefined): string {
  if (price === null || price === undefined) return '-';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '-';
  return `CHF ${num.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function resolveToken(token: ChecklistPlaceholderToken, context: SurgeryContext): string {
  switch (token) {
    case 'price':
      return formatPrice(context.price);
    case 'admissionTime':
      return formatTime(context.admissionTime);
    case 'plannedDate':
      return formatDateTime(context.plannedDate);
    case 'plannedSurgery':
      return context.plannedSurgery || '-';
    case 'surgeonName':
      return context.surgeonName || '-';
    case 'patientName':
      return context.patientName || '-';
    case 'patientDob':
      return formatDate(context.patientDob);
    case 'surgeryRoom':
      return context.surgeryRoom || '-';
    case 'notes':
      return context.notes || '-';
    case 'implantDetails':
      return context.implantDetails || '-';
    default:
      return '-';
  }
}

export function resolvePlaceholders(text: string, context: SurgeryContext): string {
  let result = text;
  for (const token of checklistPlaceholderTokens) {
    const pattern = new RegExp(`#${token}\\b`, 'g');
    const value = resolveToken(token, context);
    result = result.replace(pattern, value);
  }
  return result;
}

export function extractPlaceholders(text: string): ChecklistPlaceholderToken[] {
  const found: ChecklistPlaceholderToken[] = [];
  for (const token of checklistPlaceholderTokens) {
    const pattern = new RegExp(`#${token}\\b`, 'g');
    if (pattern.test(text)) {
      found.push(token);
    }
  }
  return found;
}

export function getPlaceholderSuggestions(query: string): PlaceholderInfo[] {
  const lowerQuery = query.toLowerCase();
  return placeholderInfo.filter(
    (p) =>
      p.token.toLowerCase().includes(lowerQuery) ||
      p.label.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery)
  );
}

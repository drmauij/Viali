import { db } from '../db';
import { ambulantePauschalenCatalog } from '@shared/schema';
import { sql } from 'drizzle-orm';

// Ambulante Pauschalen catalog is distributed as Excel (.xlsx) from oaat-otma.ch
// Download: https://oaat-otma.ch → Downloads → Anhang A1 Katalog Amb. Pauschalen
// The import expects a file uploaded by the admin

interface ApRow {
  code: string;
  descriptionDe: string;
  descriptionFr?: string;
  category?: string;
  basePrice: number;
  priceUnit?: string;
  validFrom?: string;
  validTo?: string;
}

/**
 * Parse Ambulante Pauschalen data from an Excel file uploaded by the admin.
 */
async function parseApExcel(buffer: Buffer): Promise<ApRow[]> {
  const XLSX = await import('xlsx');

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (workbook.SheetNames.length === 0) {
    throw new Error('No sheets found in the Excel file');
  }

  console.log(`[AP] Workbook has ${workbook.SheetNames.length} sheet(s): ${workbook.SheetNames.join(', ')}`);

  // The official AP v1.1c Excel uses "Tarifkatalog" sheet with headers at row 4
  // Column 0 is always null, data starts at column 1
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('tarifkatalog') || n.toLowerCase().includes('katalog')) || workbook.SheetNames[workbook.SheetNames.length - 1];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

  const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  console.log(`[AP] Using sheet "${sheetName}" with ${rawData.length} raw rows`);

  // Find header row by looking for "Tarifposition" or "Code"
  let headerIdx = -1;
  const headerKeywords = ['tarifposition', 'code', 'l-nummer'];
  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const row = rawData[i] as any[];
    if (!row) continue;
    const rowStr = row.map(c => String(c || '').toLowerCase()).join('|');
    if (headerKeywords.some(k => rowStr.includes(k))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error('Could not find header row in AP Excel');
  }

  const rawHeaders = rawData[headerIdx] as any[] || [];
  const headers = Array.from({ length: rawHeaders.length }, (_, i) => String(rawHeaders[i] ?? '').trim().replace(/\r?\n/g, ' '));
  console.log(`[AP] Header row ${headerIdx}: ${headers.join(' | ')}`);

  // Build column index map
  const colIdx = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const iCode = colIdx(['Tarifposition', 'Code', 'L-Nummer']);
  const iDesc = colIdx(['Bezeichnung']);
  const iPrice = colIdx(['Taxpunkte', 'Preis', 'Betrag', 'CHF']);
  const iDignitaeten = colIdx(['Dignität', 'Dignitäten']);

  console.log(`[AP] Column indices: code=${iCode}, desc=${iDesc}, price=${iPrice}`);

  if (iCode < 0 || iDesc < 0) {
    throw new Error('Could not find required columns (code, description) in AP Excel');
  }

  const rows: ApRow[] = [];
  // Track current category from section headers (rows without a price)
  let currentCategory: string | undefined;

  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i] as any[];
    if (!row) continue;

    const code = String(row[iCode] || '').trim();
    const desc = String(row[iDesc] || '').trim().replace(/\r?\n/g, ' ');

    // Section header rows have no code but have a description (e.g. "Prae-Cap")
    if (!code && desc) {
      currentCategory = desc;
      continue;
    }

    if (!code || !desc) continue;
    // Valid AP codes contain a dot (e.g. "C00.10A")
    if (!code.includes('.')) continue;

    const price = iPrice >= 0 ? parseFloat(row[iPrice]) : NaN;
    if (isNaN(price)) continue;

    rows.push({
      code,
      descriptionDe: desc,
      category: currentCategory,
      basePrice: Math.round(price * 100) / 100,
    });
  }

  return rows;
}

/**
 * Import Ambulante Pauschalen catalog from Excel buffer
 */
export async function importApFromExcel(buffer: Buffer, version: string = '1.1c'): Promise<{ imported: number; skipped: number; version: string }> {
  console.log('[AP] Parsing Excel file...');
  const rows = await parseApExcel(buffer);
  console.log(`[AP] Found ${rows.length} valid rows`);
  const result = await upsertApRows(rows, version);
  return { ...result, version };
}

async function upsertApRows(rows: ApRow[], version: string): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;

  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const values = batch.map(row => ({
      code: row.code,
      descriptionDe: row.descriptionDe,
      descriptionFr: row.descriptionFr || null,
      category: row.category || null,
      basePrice: String(row.basePrice),
      priceUnit: row.priceUnit || 'flat',
      validFrom: row.validFrom || null,
      validTo: row.validTo || null,
      version,
    }));

    try {
      await db.insert(ambulantePauschalenCatalog).values(values).onConflictDoUpdate({
        target: ambulantePauschalenCatalog.code,
        set: {
          descriptionDe: sql`excluded.description_de`,
          descriptionFr: sql`excluded.description_fr`,
          category: sql`excluded.category`,
          basePrice: sql`excluded.base_price`,
          priceUnit: sql`excluded.price_unit`,
          validFrom: sql`excluded.valid_from`,
          validTo: sql`excluded.valid_to`,
          version: sql`excluded.version`,
        }
      });
      imported += values.length;
      console.log(`[AP] Imported/updated batch ${Math.floor(i / batchSize) + 1} (${imported} total)`);
    } catch (error) {
      console.error(`[AP] Error importing batch:`, error);
      skipped += values.length;
    }
  }

  return { imported, skipped };
}

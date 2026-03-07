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

  // Try all sheets and pick the one with the most data rows
  let bestSheetName = workbook.SheetNames[0];
  let jsonData: Record<string, any>[] = [];

  for (const name of workbook.SheetNames) {
    const s = workbook.Sheets[name];
    if (!s) continue;
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(s);
    console.log(`[AP] Sheet "${name}": ${data.length} rows`);
    if (data.length > jsonData.length) {
      jsonData = data;
      bestSheetName = name;
    }
  }

  console.log(`[AP] Using sheet "${bestSheetName}" with ${jsonData.length} rows`);

  if (jsonData.length === 0) {
    throw new Error('All sheets are empty');
  }

  const firstRow = jsonData[0];
  console.log(`[AP] Columns found: ${Object.keys(firstRow || {}).join(', ')}`);

  const rows: ApRow[] = [];

  for (const row of jsonData) {
    const code = String(
      row['Code'] || row['code'] || row['Pauschale'] || row['Leistungscode'] || ''
    ).trim();

    const descriptionDe = String(
      row['Bezeichnung'] || row['Bezeichnung DE'] || row['description_de'] ||
      row['Text'] || row['Leistungsbezeichnung'] || ''
    ).trim();

    if (!code || !descriptionDe) continue;

    const descriptionFr = String(
      row['Bezeichnung FR'] || row['description_fr'] || ''
    ).trim() || undefined;

    const category = String(
      row['Kategorie'] || row['Category'] || row['Kapitel'] || ''
    ).trim() || undefined;

    const price = parseFloat(
      row['Preis'] || row['Betrag'] || row['Price'] || row['base_price'] ||
      row['Pauschale CHF'] || row['CHF'] || ''
    );

    if (isNaN(price)) continue;

    rows.push({
      code,
      descriptionDe,
      descriptionFr,
      category,
      basePrice: price,
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

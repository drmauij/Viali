import { db } from '../db';
import { tardocCatalog, tardocCumulationRules } from '@shared/schema';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// TARDOC catalog is distributed as Excel (.xlsx) from oaat-otma.ch
// Download: https://oaat-otma.ch/gesamt-tarifsystem/vertraege-und-anhaenge → Anhang A2 Katalog des TARDOC
// The import expects a file uploaded by the admin

interface TardocRow {
  code: string;
  descriptionDe: string;
  descriptionFr?: string;
  chapter?: string;
  chapterDescription?: string;
  taxPoints?: number;
  medicalInterpretation?: number;
  technicalInterpretation?: number;
  durationMinutes?: number;
  sideCode?: string;
  maxQuantityPerSession?: number;
  maxQuantityPerCase?: number;
  validFrom?: string;
  validTo?: string;
}

function parseTardocCsv(content: string): TardocRow[] {
  const lines = content.split('\n');
  const rows: TardocRow[] = [];

  // Expect header: code;descriptionDe;descriptionFr;chapter;chapterDescription;taxPoints;medicalInterpretation;technicalInterpretation;durationMinutes;sideCode;validFrom;validTo
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(';');
    if (parts.length < 2) continue;

    const code = (parts[0] || '').trim();
    const descriptionDe = (parts[1] || '').trim();

    if (!code || !descriptionDe) continue;

    rows.push({
      code,
      descriptionDe,
      descriptionFr: (parts[2] || '').trim() || undefined,
      chapter: (parts[3] || '').trim() || undefined,
      chapterDescription: (parts[4] || '').trim() || undefined,
      taxPoints: parts[5] ? parseFloat(parts[5]) : undefined,
      medicalInterpretation: parts[6] ? parseFloat(parts[6]) : undefined,
      technicalInterpretation: parts[7] ? parseFloat(parts[7]) : undefined,
      durationMinutes: parts[8] ? parseInt(parts[8]) : undefined,
      sideCode: (parts[9] || '').trim() || undefined,
      validFrom: (parts[10] || '').trim() || undefined,
      validTo: (parts[11] || '').trim() || undefined,
    });
  }

  return rows;
}

/**
 * Parse TARDOC data from an Excel file uploaded by the admin.
 * Uses xlsx library for parsing .xlsx files.
 */
async function parseTardocExcel(buffer: Buffer): Promise<TardocRow[]> {
  const XLSX = await import('xlsx');

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (workbook.SheetNames.length === 0) {
    throw new Error('No sheets found in the Excel file');
  }

  console.log(`[TARDOC] Workbook has ${workbook.SheetNames.length} sheet(s): ${workbook.SheetNames.join(', ')}`);

  // The official TARDOC v1.4c Excel uses "Tarifpositionen" sheet with headers at row 4
  // Use raw array mode and find the header row dynamically
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('tarifposition')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

  const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  console.log(`[TARDOC] Using sheet "${sheetName}" with ${rawData.length} raw rows`);

  // Find header row by looking for a row containing "L-Nummer" or "Code" or "Tarifposition"
  let headerIdx = -1;
  const headerKeywords = ['l-nummer', 'code', 'tarifposition', 'leistungscode'];
  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;
    const firstCell = String(row[0] || '').trim().toLowerCase();
    if (headerKeywords.some(k => firstCell.includes(k))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    console.log(`[TARDOC] Could not find header row, trying first 5 rows:`,
      rawData.slice(0, 5).map((r, i) => `Row ${i}: ${JSON.stringify((r || []).slice(0, 3))}`).join('; '));
    throw new Error('Could not find header row in TARDOC Excel (expected L-Nummer or similar in column A)');
  }

  const rawHeaders = rawData[headerIdx] as any[] || [];
  const headers = Array.from({ length: rawHeaders.length }, (_, i) => String(rawHeaders[i] ?? '').trim().replace(/\r?\n/g, ' '));
  console.log(`[TARDOC] Header row ${headerIdx}: ${headers.join(' | ')}`);

  // Build column index map
  const colIdx = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const iCode = colIdx(['L-Nummer', 'Code', 'Tarifposition']);
  const iDesc = colIdx(['Bezeichnung']);
  const iAl = colIdx(['AL (normiert)', 'AL']);
  const iTl = colIdx(['IPL (normiert)', 'IPL', 'TL']);
  const iChapter = colIdx(['Kapitel']);
  const iDurationLies = colIdx(['Zeit LieS']);
  const iDurationRaum = colIdx(['Zeit Raum']);
  const iSparte = colIdx(['Sparte']);

  console.log(`[TARDOC] Column indices: code=${iCode}, desc=${iDesc}, AL=${iAl}, TL=${iTl}, chapter=${iChapter}`);

  if (iCode < 0 || iDesc < 0) {
    throw new Error('Could not find required columns (code, description) in TARDOC Excel');
  }

  const rows: TardocRow[] = [];

  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i] as any[];
    if (!row) continue;

    const code = String(row[iCode] || '').trim();
    const descriptionDe = String(row[iDesc] || '').trim().replace(/\r?\n/g, ' ');

    if (!code || !descriptionDe) continue;
    // Skip rows that look like section headers (no dot in code)
    if (!code.includes('.')) continue;

    const al = iAl >= 0 ? parseFloat(row[iAl]) : NaN;
    const tl = iTl >= 0 ? parseFloat(row[iTl]) : NaN;
    const taxPoints = (!isNaN(al) && !isNaN(tl)) ? al + tl : NaN;
    const chapter = iChapter >= 0 ? String(row[iChapter] || '').trim() || undefined : undefined;
    const durationLies = iDurationLies >= 0 ? parseInt(row[iDurationLies]) : NaN;
    const durationRaum = iDurationRaum >= 0 ? parseInt(row[iDurationRaum]) : NaN;
    const duration = !isNaN(durationLies) ? durationLies : (!isNaN(durationRaum) ? durationRaum : NaN);

    rows.push({
      code,
      descriptionDe,
      chapter,
      taxPoints: isNaN(taxPoints) ? undefined : Math.round(taxPoints * 10000) / 10000,
      medicalInterpretation: isNaN(al) ? undefined : Math.round(al * 10000) / 10000,
      technicalInterpretation: isNaN(tl) ? undefined : Math.round(tl * 10000) / 10000,
      durationMinutes: isNaN(duration) ? undefined : duration,
    });
  }

  return rows;
}

/**
 * Import TARDOC catalog from CSV content string
 */
export async function importTardocFromCsv(csvContent: string, version: string = '1.4c'): Promise<{ imported: number; skipped: number; version: string }> {
  console.log('[TARDOC] Parsing CSV content...');
  const rows = parseTardocCsv(csvContent);
  console.log(`[TARDOC] Found ${rows.length} valid rows`);
  const result = await upsertTardocRows(rows, version);
  return { ...result, version };
}

/**
 * Import TARDOC catalog from Excel buffer
 */
export async function importTardocFromExcel(buffer: Buffer, version: string = '1.4c'): Promise<{ imported: number; skipped: number; version: string }> {
  console.log('[TARDOC] Parsing Excel file...');
  const rows = await parseTardocExcel(buffer);
  console.log(`[TARDOC] Found ${rows.length} valid rows`);
  const result = await upsertTardocRows(rows, version);
  return { ...result, version };
}

async function upsertTardocRows(rows: TardocRow[], version: string = '1.4c'): Promise<{ imported: number; skipped: number }> {
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
      chapter: row.chapter || null,
      chapterDescription: row.chapterDescription || null,
      taxPoints: row.taxPoints != null ? String(row.taxPoints) : null,
      medicalInterpretation: row.medicalInterpretation != null ? String(row.medicalInterpretation) : null,
      technicalInterpretation: row.technicalInterpretation != null ? String(row.technicalInterpretation) : null,
      durationMinutes: row.durationMinutes || null,
      sideCode: row.sideCode || null,
      maxQuantityPerSession: row.maxQuantityPerSession || null,
      maxQuantityPerCase: row.maxQuantityPerCase || null,
      validFrom: row.validFrom || null,
      validTo: row.validTo || null,
      version,
    }));

    try {
      await db.insert(tardocCatalog).values(values).onConflictDoUpdate({
        target: tardocCatalog.code,
        set: {
          descriptionDe: sql`excluded.description_de`,
          descriptionFr: sql`excluded.description_fr`,
          chapter: sql`excluded.chapter`,
          chapterDescription: sql`excluded.chapter_description`,
          taxPoints: sql`excluded.tax_points`,
          medicalInterpretation: sql`excluded.medical_interpretation`,
          technicalInterpretation: sql`excluded.technical_interpretation`,
          durationMinutes: sql`excluded.duration_minutes`,
          sideCode: sql`excluded.side_code`,
          maxQuantityPerSession: sql`excluded.max_quantity_per_session`,
          maxQuantityPerCase: sql`excluded.max_quantity_per_case`,
          validFrom: sql`excluded.valid_from`,
          validTo: sql`excluded.valid_to`,
          version: sql`excluded.version`,
        }
      });
      imported += values.length;
      console.log(`[TARDOC] Imported/updated batch ${Math.floor(i / batchSize) + 1} (${imported} total)`);
    } catch (error) {
      console.error(`[TARDOC] Error importing batch:`, error);
      skipped += values.length;
    }
  }

  return { imported, skipped };
}

/**
 * Import TARDOC cumulation/exclusion rules from Excel buffer.
 * Expected columns: Code, Related Code (or Bezugscode), Rule Type (or Regeltyp), Description
 */
export async function importCumulationRulesFromExcel(buffer: Buffer, version: string = '1.4c'): Promise<{ imported: number; skipped: number }> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  if (workbook.SheetNames.length === 0) {
    throw new Error('No sheets found');
  }

  // Try all sheets and pick the one with the most rows
  let bestSheetName = workbook.SheetNames[0];
  let jsonData: Record<string, any>[] = [];

  for (const name of workbook.SheetNames) {
    const s = workbook.Sheets[name];
    if (!s) continue;
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(s);
    if (data.length > jsonData.length) {
      jsonData = data;
      bestSheetName = name;
    }
  }

  console.log(`[TARDOC Rules] Using sheet "${bestSheetName}" with ${jsonData.length} rows`);
  if (jsonData.length > 0) {
    console.log(`[TARDOC Rules] Columns: ${Object.keys(jsonData[0] || {}).join(', ')}`);
  }

  interface RuleRow {
    code: string;
    relatedCode: string;
    ruleType: string;
    description?: string;
  }

  const rows: RuleRow[] = [];

  for (const row of jsonData) {
    const code = String(row['Code'] || row['code'] || row['Tarifposition'] || '').trim();
    const relatedCode = String(
      row['Related Code'] || row['Bezugscode'] || row['related_code'] || row['relatedCode'] || ''
    ).trim();
    const ruleType = String(
      row['Rule Type'] || row['Regeltyp'] || row['rule_type'] || row['ruleType'] || row['Typ'] || ''
    ).trim().toLowerCase();
    const description = String(row['Description'] || row['Beschreibung'] || row['description'] || '').trim() || undefined;

    if (!code || !relatedCode || !ruleType) continue;

    // Normalize rule type
    const normalizedType = ruleType.includes('exclu') ? 'exclusion'
      : ruleType.includes('limit') ? 'limitation'
      : 'cumulation';

    rows.push({ code, relatedCode, ruleType: normalizedType, description });
  }

  console.log(`[TARDOC Rules] Found ${rows.length} valid rules`);

  if (rows.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  // Clear existing rules for this version and re-insert
  await db.delete(tardocCumulationRules).where(sql`true`);

  let imported = 0;
  let skipped = 0;
  const batchSize = 500;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      await db.insert(tardocCumulationRules).values(
        batch.map(r => ({
          code: r.code,
          relatedCode: r.relatedCode,
          ruleType: r.ruleType,
          description: r.description || null,
          version,
        }))
      );
      imported += batch.length;
    } catch (error) {
      console.error('[TARDOC Rules] Error importing batch:', error);
      skipped += batch.length;
    }
  }

  console.log(`[TARDOC Rules] Imported ${imported}, skipped ${skipped}`);
  return { imported, skipped };
}

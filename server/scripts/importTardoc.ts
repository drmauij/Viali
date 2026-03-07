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
  // Dynamic import to avoid bundling issues
  const XLSX = await import('xlsx');

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (workbook.SheetNames.length === 0) {
    throw new Error('No sheets found in the Excel file');
  }

  console.log(`[TARDOC] Workbook has ${workbook.SheetNames.length} sheet(s): ${workbook.SheetNames.join(', ')}`);

  // Try all sheets and pick the one with the most data rows
  let bestSheetName = workbook.SheetNames[0];
  let jsonData: Record<string, any>[] = [];

  for (const name of workbook.SheetNames) {
    const s = workbook.Sheets[name];
    if (!s) continue;
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(s);
    console.log(`[TARDOC] Sheet "${name}": ${data.length} rows`);
    if (data.length > jsonData.length) {
      jsonData = data;
      bestSheetName = name;
    }
  }

  console.log(`[TARDOC] Using sheet "${bestSheetName}" with ${jsonData.length} rows`);

  if (jsonData.length === 0) {
    throw new Error('All sheets are empty');
  }

  // Log first row to help debug column mapping
  const firstRow = jsonData[0];
  console.log(`[TARDOC] Columns found: ${Object.keys(firstRow || {}).join(', ')}`);

  const rows: TardocRow[] = [];

  for (const row of jsonData) {
    // Try common column names (German headers from TARDOC Excel)
    const code = String(
      row['Code'] || row['code'] || row['Leistungscode'] || row['Tarifposition'] || ''
    ).trim();

    const descriptionDe = String(
      row['Bezeichnung'] || row['Bezeichnung DE'] || row['description_de'] ||
      row['descriptionDe'] || row['Text'] || row['Leistungsbezeichnung'] || ''
    ).trim();

    if (!code || !descriptionDe) continue;

    const descriptionFr = String(
      row['Bezeichnung FR'] || row['description_fr'] || row['descriptionFr'] || ''
    ).trim() || undefined;

    const chapter = String(
      row['Kapitel'] || row['Chapter'] || row['chapter'] || ''
    ).trim() || undefined;

    const chapterDescription = String(
      row['Kapitelbezeichnung'] || row['Chapter Description'] || ''
    ).trim() || undefined;

    const taxPoints = parseFloat(row['Taxpunkte'] || row['TP'] || row['taxPoints'] || row['Tax Points'] || '');
    const al = parseFloat(row['AL'] || row['Ärztliche Leistung'] || row['medicalInterpretation'] || '');
    const tl = parseFloat(row['TL'] || row['Technische Leistung'] || row['technicalInterpretation'] || '');
    const duration = parseInt(row['Dauer'] || row['Duration'] || row['durationMinutes'] || '');
    const sideCode = String(row['Seitencode'] || row['Side'] || row['sideCode'] || '').trim() || undefined;
    const maxQtySession = parseInt(row['Max. Sitzung'] || row['maxQuantityPerSession'] || row['Max Qty/Session'] || '');
    const maxQtyCase = parseInt(row['Max. Fall'] || row['maxQuantityPerCase'] || row['Max Qty/Case'] || '');

    rows.push({
      code,
      descriptionDe,
      descriptionFr,
      chapter,
      chapterDescription,
      taxPoints: isNaN(taxPoints) ? undefined : taxPoints,
      medicalInterpretation: isNaN(al) ? undefined : al,
      technicalInterpretation: isNaN(tl) ? undefined : tl,
      durationMinutes: isNaN(duration) ? undefined : duration,
      sideCode,
      maxQuantityPerSession: isNaN(maxQtySession) ? undefined : maxQtySession,
      maxQuantityPerCase: isNaN(maxQtyCase) ? undefined : maxQtyCase,
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

import { db } from '../db';
import { chopProcedures } from '@shared/schema';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ChopRow {
  nbchar: string;
  zcode: string;
  itemType: string;
  text: string;
  codable: string;
  emitter: string;
  status: string;
  modificationDate: string;
  indentLevel: string;
  lateralite: string;
}

function parseChopCsv(filePath: string): ChopRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const rows: ChopRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(';');
    if (parts.length < 10) continue;
    
    rows.push({
      nbchar: parts[0] || '',
      zcode: parts[1] || '',
      itemType: parts[2] || '',
      text: parts[3] || '',
      codable: parts[4] || '',
      emitter: parts[5] || '',
      status: parts[6] || '',
      modificationDate: parts[7] || '',
      indentLevel: parts[8] || '',
      lateralite: parts[9] || '',
    });
  }
  
  return rows;
}

export async function importChopProcedures(): Promise<{ imported: number; skipped: number }> {
  const csvPath = path.join(__dirname, '../data/CHOP2026_Systematisches_Verzeichnis_DE_CSV_2025_07_16.csv');
  
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CHOP CSV file not found at ${csvPath}`);
  }
  
  console.log('Parsing CHOP CSV file...');
  const rows = parseChopCsv(csvPath);
  console.log(`Found ${rows.length} total rows`);
  
  const codableRows = rows.filter(r => r.codable === 'oui' && r.itemType === 'T');
  console.log(`Found ${codableRows.length} codable procedures`);
  
  let imported = 0;
  let skipped = 0;
  
  const batchSize = 500;
  for (let i = 0; i < codableRows.length; i += batchSize) {
    const batch = codableRows.slice(i, i + batchSize);
    
    const values = batch.map(row => ({
      code: row.zcode,
      descriptionDe: row.text,
      chapter: row.zcode.split('.')[0] || null,
      indentLevel: parseInt(row.indentLevel) || null,
      isCodeable: true,
      laterality: row.lateralite || null,
      version: '2026',
    }));
    
    try {
      await db.insert(chopProcedures).values(values).onConflictDoUpdate({
        target: chopProcedures.code,
        set: {
          descriptionDe: sql`excluded.description_de`,
          chapter: sql`excluded.chapter`,
          indentLevel: sql`excluded.indent_level`,
          laterality: sql`excluded.laterality`,
          version: sql`excluded.version`,
        }
      });
      imported += values.length;
      console.log(`Imported/updated batch ${Math.floor(i / batchSize) + 1} (${imported} total)`);
    } catch (error) {
      console.error(`Error importing batch:`, error);
      skipped += values.length;
    }
  }
  
  return { imported, skipped };
}

// Removed auto-execution code - use the admin API endpoint instead:
// POST /api/admin/import-chop
// This prevents the script from crashing when the CSV file is not present in production

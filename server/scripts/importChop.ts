import { db } from '../db';
import { chopProcedures } from '@shared/schema';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';

const BFS_CHOP_2026_URL = 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/36016177/master';

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

function parseChopCsv(content: string): ChopRow[] {
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

async function downloadAndExtractChopCsv(): Promise<string> {
  console.log('[CHOP] Downloading from BFS API...');
  
  const response = await fetch(BFS_CHOP_2026_URL);
  if (!response.ok) {
    throw new Error(`Failed to download CHOP data: ${response.status} ${response.statusText}`);
  }
  
  // Validate content type - should be a zip file
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('zip') && !contentType.includes('octet-stream')) {
    console.warn(`[CHOP] Unexpected content type: ${contentType}, proceeding anyway...`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Basic validation: zip files start with "PK" (0x50, 0x4B)
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
    throw new Error('Downloaded file is not a valid ZIP archive. The BFS API may have returned an error page.');
  }
  
  console.log(`[CHOP] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  
  // Save to temp file
  const tempZipPath = path.join(os.tmpdir(), `chop2026_${Date.now()}.zip`);
  
  try {
    fs.writeFileSync(tempZipPath, buffer);
    
    // Extract
    console.log('[CHOP] Extracting zip file...');
    const zip = new AdmZip(tempZipPath);
    const zipEntries = zip.getEntries();
    
    // Find the German CSV file (contains "DE" in filename)
    const csvEntry = zipEntries.find(entry => 
      entry.entryName.endsWith('.csv') && 
      (entry.entryName.includes('DE') || entry.entryName.includes('_de_'))
    ) || zipEntries.find(entry => entry.entryName.endsWith('.csv'));
    
    if (!csvEntry) {
      throw new Error('No CSV file found in the downloaded zip');
    }
    
    console.log(`[CHOP] Found CSV: ${csvEntry.entryName}`);
    
    const csvContent = zip.readAsText(csvEntry);
    
    return csvContent;
  } finally {
    // Always clean up temp file
    try {
      if (fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
      }
    } catch (cleanupError) {
      console.warn('[CHOP] Failed to clean up temp file:', cleanupError);
    }
  }
}

export async function importChopProcedures(): Promise<{ imported: number; skipped: number }> {
  // Download and extract CSV content
  const csvContent = await downloadAndExtractChopCsv();
  
  console.log('[CHOP] Parsing CSV content...');
  const rows = parseChopCsv(csvContent);
  console.log(`[CHOP] Found ${rows.length} total rows`);
  
  const codableRows = rows.filter(r => r.codable === 'oui' && r.itemType === 'T');
  console.log(`[CHOP] Found ${codableRows.length} codable procedures`);
  
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
      console.log(`[CHOP] Imported/updated batch ${Math.floor(i / batchSize) + 1} (${imported} total)`);
    } catch (error) {
      console.error(`[CHOP] Error importing batch:`, error);
      skipped += values.length;
    }
  }
  
  return { imported, skipped };
}

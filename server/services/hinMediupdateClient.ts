import { XMLParser } from 'fast-xml-parser';
import { db } from '../db';
import { hinArticles, hinSyncStatus, items, itemCodes, itemHinMatches, type HinArticle, type InsertHinArticle, type InsertItemHinMatch } from '../../shared/schema';
import { eq, or, sql, and, isNull, ne, ilike } from 'drizzle-orm';

const HIN_ARTICLE_XML_URL = 'https://download.hin.ch/download/oddb2xml/oddb_article.xml';

/**
 * Convert European date format (DD.MM.YYYY) to ISO format (YYYY-MM-DD) for PostgreSQL.
 * Returns undefined if the date is invalid or unparseable.
 */
function convertEuropeanDateToISO(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  
  // Match DD.MM.YYYY format
  const match = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return undefined;
  
  const [, day, month, year] = match;
  const paddedDay = day.padStart(2, '0');
  const paddedMonth = month.padStart(2, '0');
  
  // Basic validation
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return undefined;
  }
  
  return `${year}-${paddedMonth}-${paddedDay}`;
}

/**
 * Parse pack size from product description strings.
 * Examples:
 * - "Kefzol 2g 10 Durchstechflaschen" -> 10
 * - "Propofol 1% 20 ml 5 Amp" -> 5
 * - "NaCl 0.9% 100ml 20 Stk" -> 20
 * - "Infusomat Leitungen 50 Stück" -> 50
 */
export function parsePackSizeFromDescription(description: string): number | undefined {
  if (!description) return undefined;
  
  // Patterns to match pack size in Swiss/German product names
  const patterns = [
    // "10 Durchstechflaschen", "5 Amp", "20 Stk", "50 Stück"
    /(\d+)\s*(Durchstechflasche[n]?|Amp\.?|Ampulle[n]?|Stk\.?|Stück|Fl\.?|Flasche[n]?|Btl\.?|Beutel|Tbl\.?|Tablette[n]?|Kps\.?|Kapsel[n]?|Supp\.?|Zäpfchen|Fertigspr\.?|Fertigspritz[e]?[n]?|Inj\.?|Injektion[en]?|Pack(?:ung)?|Dos[e]?[n]?|Einheit[en]?|Stk|pcs?|x)\b/i,
    // "x 10", "x10"
    /x\s*(\d+)\b/i,
    // Common format: "50 Stk" at end
    /(\d+)\s*(?:St|Stk|pcs?)\.?\s*$/i,
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      // Sanity check: pack sizes are typically 1-1000
      if (num > 0 && num <= 1000) {
        return num;
      }
    }
  }
  
  return undefined;
}

export interface HinArticleLookupResult {
  found: boolean;
  article?: {
    pharmacode?: string;
    gtin?: string;
    descriptionDe: string;
    descriptionFr?: string;
    pexf?: number;
    ppub?: number;
    swissmedicNo?: string;
    smcat?: string;
    saleCode?: string;
  };
  source: 'hin';
}

interface ParsedArticle {
  pharmacode?: string;
  gtin?: string;
  swissmedicNo?: string;
  productNo?: string;
  descriptionDe: string;
  descriptionFr?: string;
  pexf?: number;
  ppub?: number;
  priceValidFrom?: string;
  smcat?: string;
  saleCode?: string;
  vat?: string;
  isRefdata: boolean;
  companyGln?: string;
}

export class HinMediupdateClient {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
      trimValues: true,
    });
  }

  async lookupByCode(code: string): Promise<HinArticleLookupResult> {
    const cleanCode = code.replace(/\D/g, '');
    
    if (!cleanCode) {
      return { found: false, source: 'hin' };
    }

    // Normalize GTIN: remove leading zeros for comparison (GTINs are stored as 13 digits without leading zeros)
    const normalizedGtin = cleanCode.replace(/^0+/, '');

    try {
      const results = await db
        .select()
        .from(hinArticles)
        .where(
          or(
            eq(hinArticles.pharmacode, cleanCode),
            eq(hinArticles.gtin, cleanCode),
            eq(hinArticles.gtin, cleanCode.padStart(13, '0')),
            eq(hinArticles.gtin, normalizedGtin)
          )
        )
        .limit(1);

      if (results.length === 0) {
        return { found: false, source: 'hin' };
      }

      const article = results[0];
      return {
        found: true,
        article: {
          pharmacode: article.pharmacode || undefined,
          gtin: article.gtin || undefined,
          descriptionDe: article.descriptionDe,
          descriptionFr: article.descriptionFr || undefined,
          pexf: article.pexf ? parseFloat(article.pexf) : undefined,
          ppub: article.ppub ? parseFloat(article.ppub) : undefined,
          swissmedicNo: article.swissmedicNo || undefined,
          smcat: article.smcat || undefined,
          saleCode: article.saleCode || undefined,
        },
        source: 'hin',
      };
    } catch (error) {
      console.error('[HIN] Lookup error:', error);
      return { found: false, source: 'hin' };
    }
  }

  async getSyncStatus(): Promise<{
    lastSyncAt: Date | null;
    articlesCount: number;
    status: string;
    errorMessage?: string;
    processedItems?: number;
    totalItems?: number;
    syncDurationMs?: number;
  }> {
    try {
      const status = await db
        .select()
        .from(hinSyncStatus)
        .orderBy(sql`created_at DESC`)
        .limit(1);

      if (status.length === 0) {
        return {
          lastSyncAt: null,
          articlesCount: 0,
          status: 'never_synced',
        };
      }

      return {
        lastSyncAt: status[0].lastSyncAt,
        articlesCount: status[0].articlesCount || 0,
        status: status[0].status || 'idle',
        errorMessage: status[0].errorMessage || undefined,
        processedItems: status[0].processedItems || 0,
        totalItems: status[0].totalItems || 0,
        syncDurationMs: status[0].syncDurationMs || undefined,
      };
    } catch (error) {
      console.error('[HIN] Error getting sync status:', error);
      return {
        lastSyncAt: null,
        articlesCount: 0,
        status: 'error',
        errorMessage: String(error),
      };
    }
  }

  async syncArticles(
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ success: boolean; articlesCount: number; duration: number; error?: string }> {
    const startTime = Date.now();
    
    console.log('[HIN] Starting article sync from MediUpdate XML...');
    
    const statusId = crypto.randomUUID();
    await db.insert(hinSyncStatus).values({
      id: statusId,
      status: 'syncing',
      createdAt: new Date(),
    });

    try {
      console.log('[HIN] Downloading XML file...');
      const response = await fetch(HIN_ARTICLE_XML_URL);
      
      if (!response.ok) {
        throw new Error(`Failed to download XML: ${response.status} ${response.statusText}`);
      }

      const xmlText = await response.text();
      console.log(`[HIN] Downloaded ${(xmlText.length / 1024 / 1024).toFixed(2)} MB`);

      console.log('[HIN] Parsing XML...');
      const parsed = this.parser.parse(xmlText);
      
      const articles = parsed.ARTICLE?.ART || [];
      const articleArray = Array.isArray(articles) ? articles : [articles];
      
      console.log(`[HIN] Found ${articleArray.length} articles to process`);

      await db.delete(hinArticles);
      console.log('[HIN] Cleared existing articles');

      // Store total items count for progress tracking
      await db
        .update(hinSyncStatus)
        .set({
          totalItems: articleArray.length,
          processedItems: 0,
        })
        .where(eq(hinSyncStatus.id, statusId));

      const batchSize = 1000;
      let processedCount = 0;

      for (let i = 0; i < articleArray.length; i += batchSize) {
        const batch = articleArray.slice(i, i + batchSize);
        const parsedBatch: InsertHinArticle[] = [];

        for (const art of batch) {
          const parsed = this.parseArticle(art);
          if (parsed) {
            parsedBatch.push(parsed);
          }
        }

        if (parsedBatch.length > 0) {
          await db.insert(hinArticles).values(parsedBatch);
        }

        processedCount += batch.length;
        
        if (onProgress) {
          onProgress(processedCount, articleArray.length);
        }

        // Update progress in database every 5000 items
        if (processedCount % 5000 === 0 || processedCount === articleArray.length) {
          await db
            .update(hinSyncStatus)
            .set({ processedItems: processedCount })
            .where(eq(hinSyncStatus.id, statusId));
        }

        if (processedCount % 10000 === 0) {
          console.log(`[HIN] Processed ${processedCount}/${articleArray.length} articles`);
        }
      }

      const duration = Date.now() - startTime;
      
      await db
        .update(hinSyncStatus)
        .set({
          lastSyncAt: new Date(),
          articlesCount: processedCount,
          syncDurationMs: duration,
          status: 'success',
          errorMessage: null,
        })
        .where(eq(hinSyncStatus.id, statusId));

      console.log(`[HIN] Sync complete: ${processedCount} articles in ${(duration / 1000).toFixed(1)}s`);

      return {
        success: true,
        articlesCount: processedCount,
        duration,
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error.message || String(error);
      
      console.error('[HIN] Sync error:', errorMessage);

      await db
        .update(hinSyncStatus)
        .set({
          status: 'error',
          errorMessage,
          syncDurationMs: duration,
        })
        .where(eq(hinSyncStatus.id, statusId));

      return {
        success: false,
        articlesCount: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  private parseArticle(art: any): InsertHinArticle | null {
    try {
      const descDe = art.DSCRD || art.SORTD;
      if (!descDe) {
        return null;
      }

      let gtin: string | undefined;
      const artbar = art.ARTBAR;
      if (artbar) {
        const bc = artbar.BC;
        if (bc) {
          gtin = String(bc).replace(/^0+/, '');
          if (gtin.length < 8) gtin = undefined;
        }
      }

      let pexf: string | undefined;
      let ppub: string | undefined;
      let priceValidFrom: string | undefined;

      const artpri = art.ARTPRI;
      if (artpri) {
        const priArray = Array.isArray(artpri) ? artpri : [artpri];
        for (const pri of priArray) {
          if (pri.PTYP === 'PEXF' && pri.PRICE) {
            pexf = String(pri.PRICE);
            if (pri.VDAT) priceValidFrom = pri.VDAT;
          }
          if (pri.PTYP === 'PPUB' && pri.PRICE) {
            ppub = String(pri.PRICE);
          }
        }
      }

      return {
        pharmacode: art.PHAR ? String(art.PHAR) : undefined,
        gtin,
        swissmedicNo: art.SMNO ? String(art.SMNO) : undefined,
        productNo: art.PRODNO ? String(art.PRODNO) : undefined,
        descriptionDe: descDe,
        descriptionFr: art.DSCRF || undefined,
        pexf,
        ppub,
        priceValidFrom: convertEuropeanDateToISO(priceValidFrom),
        smcat: art.SMCAT || undefined,
        saleCode: art.SALECD || undefined,
        vat: art.VAT ? String(art.VAT) : undefined,
        isRefdata: art.REF_DATA === '1' || art.REF_DATA === 1,
        companyGln: art.ARTCOMP?.COMPNO ? String(art.ARTCOMP.COMPNO) : undefined,
      };
    } catch (error) {
      console.error('[HIN] Error parsing article:', error);
      return null;
    }
  }
}

export const hinClient = new HinMediupdateClient();

// =====================================================
// Enhanced HIN Batch Matching for Hospital Items
// =====================================================

export interface ItemMatchInput {
  id: string;
  name: string;
  hospitalId: string;
  pharmacode?: string | null;
  gtin?: string | null;
}

export interface HinMatchResult {
  itemId: string;
  matchStatus: 'matched' | 'to_verify' | 'unmatched';
  matchMethod?: string;
  matchConfidence?: number;
  matchReason?: string;
  hinArticle?: HinArticle;
}

/**
 * Calculate name similarity using Jaccard index with word-level matching.
 * Returns a value between 0 and 1.
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const normalize = (s: string) => s.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const n1 = normalize(name1);
  const n2 = normalize(name2);

  if (n1 === n2) return 1.0;

  const words1 = new Set(n1.split(' ').filter(w => w.length > 1));
  const words2 = new Set(n2.split(' ').filter(w => w.length > 1));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);

  const jaccard = intersection.size / union.size;

  // Bonus for containment
  const n1Lower = n1.toLowerCase();
  const n2Lower = n2.toLowerCase();
  
  let containsBonus = 0;
  if (n1Lower.includes(n2Lower) || n2Lower.includes(n1Lower)) {
    containsBonus = 0.15;
  }

  // Bonus for matching drug name (first significant word)
  const drugWords1 = n1.split(' ').filter(w => w.length > 2);
  const drugWords2 = n2.split(' ').filter(w => w.length > 2);
  let drugBonus = 0;
  if (drugWords1[0] && drugWords2[0] && drugWords1[0].toLowerCase() === drugWords2[0].toLowerCase()) {
    drugBonus = 0.1;
  }

  return Math.min(1.0, jaccard + containsBonus + drugBonus);
}

/**
 * Match a single item against HIN database using enhanced logic:
 * 1. Exact pharmacode match
 * 2. Exact GTIN match
 * 3. Cross-lookup: item's pharmacode as GTIN, item's GTIN as pharmacode
 * 4. Fuzzy name matching (returns to_verify status)
 */
async function matchItemToHin(item: ItemMatchInput): Promise<HinMatchResult> {
  const cleanCode = (code: string | null | undefined): string | null => {
    if (!code) return null;
    return code.replace(/\D/g, '').trim() || null;
  };

  const pharmacode = cleanCode(item.pharmacode);
  const gtin = cleanCode(item.gtin);

  // Step 1: Try exact pharmacode match
  if (pharmacode) {
    const results = await db
      .select()
      .from(hinArticles)
      .where(eq(hinArticles.pharmacode, pharmacode))
      .limit(1);
    
    if (results.length > 0) {
      return {
        itemId: item.id,
        matchStatus: 'matched',
        matchMethod: 'pharmacode',
        matchConfidence: 1.0,
        matchReason: `Exact pharmacode match: ${pharmacode}`,
        hinArticle: results[0],
      };
    }
  }

  // Step 2: Try exact GTIN match
  if (gtin) {
    // Try with and without leading zeros
    const normalizedGtin = gtin.replace(/^0+/, '');
    const results = await db
      .select()
      .from(hinArticles)
      .where(
        or(
          eq(hinArticles.gtin, gtin),
          eq(hinArticles.gtin, gtin.padStart(13, '0')),
          eq(hinArticles.gtin, normalizedGtin)
        )
      )
      .limit(1);
    
    if (results.length > 0) {
      return {
        itemId: item.id,
        matchStatus: 'matched',
        matchMethod: 'gtin',
        matchConfidence: 1.0,
        matchReason: `Exact GTIN match: ${gtin}`,
        hinArticle: results[0],
      };
    }
  }

  // Step 3: Cross-lookup - try pharmacode value in GTIN field (swapped codes)
  if (pharmacode && pharmacode.length >= 10) {
    // Pharmacode is actually a GTIN (13-14 digits stored in wrong field)
    const normalizedCode = pharmacode.replace(/^0+/, '');
    const results = await db
      .select()
      .from(hinArticles)
      .where(
        or(
          eq(hinArticles.gtin, pharmacode),
          eq(hinArticles.gtin, pharmacode.padStart(13, '0')),
          eq(hinArticles.gtin, normalizedCode)
        )
      )
      .limit(1);
    
    if (results.length > 0) {
      return {
        itemId: item.id,
        matchStatus: 'matched',
        matchMethod: 'pharmacode_as_gtin',
        matchConfidence: 0.95,
        matchReason: `Code swap detected: pharmacode field contains GTIN ${pharmacode}`,
        hinArticle: results[0],
      };
    }
  }

  // Step 4: Cross-lookup - try GTIN value in pharmacode field
  if (gtin && gtin.length <= 7) {
    // GTIN is actually a pharmacode (7 digits stored in wrong field)
    const results = await db
      .select()
      .from(hinArticles)
      .where(eq(hinArticles.pharmacode, gtin))
      .limit(1);
    
    if (results.length > 0) {
      return {
        itemId: item.id,
        matchStatus: 'matched',
        matchMethod: 'gtin_as_pharmacode',
        matchConfidence: 0.95,
        matchReason: `Code swap detected: GTIN field contains pharmacode ${gtin}`,
        hinArticle: results[0],
      };
    }
  }

  // Step 5: Fuzzy name matching - find candidates and score by similarity
  const itemName = item.name.trim();
  if (itemName.length > 3) {
    // Extract first word (usually drug name) for search
    const firstWords = itemName.split(/\s+/).slice(0, 2).join(' ');
    
    // Search for candidates with similar name start
    const candidates = await db
      .select()
      .from(hinArticles)
      .where(ilike(hinArticles.descriptionDe, `${firstWords.substring(0, Math.min(firstWords.length, 10))}%`))
      .limit(50);
    
    if (candidates.length > 0) {
      // Score all candidates by name similarity
      let bestMatch: HinArticle | null = null;
      let bestScore = 0;

      for (const candidate of candidates) {
        const score = calculateNameSimilarity(itemName, candidate.descriptionDe);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }

      // High confidence fuzzy match (>= 0.75) -> to_verify
      if (bestMatch && bestScore >= 0.60) {
        return {
          itemId: item.id,
          matchStatus: 'to_verify',
          matchMethod: 'fuzzy_name',
          matchConfidence: bestScore,
          matchReason: `Name similarity ${Math.round(bestScore * 100)}%: "${itemName}" → "${bestMatch.descriptionDe}"`,
          hinArticle: bestMatch,
        };
      }
    }
  }

  // No match found
  return {
    itemId: item.id,
    matchStatus: 'unmatched',
    matchMethod: undefined,
    matchConfidence: 0,
    matchReason: 'No match found in HIN database',
  };
}

/**
 * Batch match all items for a hospital against HIN database.
 * Creates/updates itemHinMatches records for each item.
 */
export async function batchMatchHospitalItemsToHin(
  hospitalId: string,
  onProgress?: (current: number, total: number, itemName: string) => void
): Promise<{
  total: number;
  matched: number;
  toVerify: number;
  unmatched: number;
  errors: number;
}> {
  console.log(`[HIN Batch Match] Starting batch match for hospital ${hospitalId}`);
  
  // Get all items for this hospital with their codes
  const hospitalItems = await db
    .select({
      id: items.id,
      name: items.name,
      hospitalId: items.hospitalId,
      pharmacode: itemCodes.pharmacode,
      gtin: itemCodes.gtin,
    })
    .from(items)
    .leftJoin(itemCodes, eq(items.id, itemCodes.itemId))
    .where(eq(items.hospitalId, hospitalId));

  console.log(`[HIN Batch Match] Found ${hospitalItems.length} items to match`);

  const stats = { total: hospitalItems.length, matched: 0, toVerify: 0, unmatched: 0, errors: 0 };

  for (let i = 0; i < hospitalItems.length; i++) {
    const item = hospitalItems[i];
    
    if (onProgress) {
      onProgress(i + 1, hospitalItems.length, item.name);
    }

    try {
      const result = await matchItemToHin({
        id: item.id,
        name: item.name,
        hospitalId: item.hospitalId,
        pharmacode: item.pharmacode,
        gtin: item.gtin,
      });

      // Upsert the match record
      const matchData: InsertItemHinMatch = {
        itemId: item.id,
        hospitalId: item.hospitalId,
        matchStatus: result.matchStatus,
        matchMethod: result.matchMethod || null,
        matchConfidence: result.matchConfidence?.toString() || null,
        matchReason: result.matchReason || null,
        hinArticleId: result.hinArticle?.id || null,
        hinPharmacode: result.hinArticle?.pharmacode || null,
        hinGtin: result.hinArticle?.gtin || null,
        hinDescriptionDe: result.hinArticle?.descriptionDe || null,
        hinPexf: result.hinArticle?.pexf || null,
        hinPpub: result.hinArticle?.ppub || null,
        hinSmcat: result.hinArticle?.smcat || null,
        hinSwissmedicNo: result.hinArticle?.swissmedicNo || null,
        originalPharmacode: item.pharmacode || null,
        originalGtin: item.gtin || null,
        itemName: item.name,
        lastMatchAttempt: new Date(),
      };

      // Check if match record exists
      const existing = await db
        .select({ id: itemHinMatches.id })
        .from(itemHinMatches)
        .where(eq(itemHinMatches.itemId, item.id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(itemHinMatches)
          .set({
            ...matchData,
            updatedAt: new Date(),
          })
          .where(eq(itemHinMatches.id, existing[0].id));
      } else {
        await db.insert(itemHinMatches).values(matchData);
      }

      // Update stats
      if (result.matchStatus === 'matched') stats.matched++;
      else if (result.matchStatus === 'to_verify') stats.toVerify++;
      else stats.unmatched++;

    } catch (error) {
      console.error(`[HIN Batch Match] Error matching item ${item.id}:`, error);
      stats.errors++;
    }
  }

  console.log(`[HIN Batch Match] Complete: ${stats.matched} matched, ${stats.toVerify} to verify, ${stats.unmatched} unmatched, ${stats.errors} errors`);
  
  return stats;
}

/**
 * Apply HIN match data to an item's codes.
 * Updates pharmacode, GTIN, and adds HIN as a supplier with pricing.
 * NEVER updates item name/description/pack size.
 */
export async function applyHinMatchToItem(
  matchId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the match record
    const match = await db
      .select()
      .from(itemHinMatches)
      .where(eq(itemHinMatches.id, matchId))
      .limit(1);

    if (match.length === 0) {
      return { success: false, error: 'Match record not found' };
    }

    const matchRecord = match[0];
    
    if (!matchRecord.hinPharmacode && !matchRecord.hinGtin) {
      return { success: false, error: 'No HIN codes to apply' };
    }

    // Update itemCodes with correct codes from HIN
    const existingCodes = await db
      .select()
      .from(itemCodes)
      .where(eq(itemCodes.itemId, matchRecord.itemId))
      .limit(1);

    if (existingCodes.length > 0) {
      // Update existing codes
      await db
        .update(itemCodes)
        .set({
          pharmacode: matchRecord.hinPharmacode || existingCodes[0].pharmacode,
          gtin: matchRecord.hinGtin || existingCodes[0].gtin,
          swissmedicNr: matchRecord.hinSwissmedicNo || existingCodes[0].swissmedicNr,
          abgabekategorie: matchRecord.hinSmcat || existingCodes[0].abgabekategorie,
          updatedAt: new Date(),
        })
        .where(eq(itemCodes.itemId, matchRecord.itemId));
    } else {
      // Create new codes record
      await db.insert(itemCodes).values({
        itemId: matchRecord.itemId,
        pharmacode: matchRecord.hinPharmacode,
        gtin: matchRecord.hinGtin,
        swissmedicNr: matchRecord.hinSwissmedicNo,
        abgabekategorie: matchRecord.hinSmcat,
      });
    }

    // Update the match record as applied
    await db
      .update(itemHinMatches)
      .set({
        matchStatus: 'matched',
        verifiedAt: new Date(),
        verifiedBy: userId,
        appliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(itemHinMatches.id, matchId));

    console.log(`[HIN] Applied match ${matchId} to item ${matchRecord.itemId}`);
    
    return { success: true };
  } catch (error: any) {
    console.error('[HIN] Error applying match:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Reject a fuzzy HIN match (user decided it's not correct).
 */
export async function rejectHinMatch(
  matchId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(itemHinMatches)
      .set({
        matchStatus: 'rejected',
        verifiedAt: new Date(),
        verifiedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(itemHinMatches.id, matchId));

    return { success: true };
  } catch (error: any) {
    console.error('[HIN] Error rejecting match:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

import { XMLParser } from 'fast-xml-parser';
import { db } from '../db';
import { hinArticles, hinSyncStatus, type HinArticle, type InsertHinArticle } from '../../shared/schema';
import { eq, or, sql } from 'drizzle-orm';

const HIN_ARTICLE_XML_URL = 'https://download.hin.ch/download/oddb2xml/oddb_article.xml';

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

    try {
      const results = await db
        .select()
        .from(hinArticles)
        .where(
          or(
            eq(hinArticles.pharmacode, cleanCode),
            eq(hinArticles.gtin, cleanCode),
            eq(hinArticles.gtin, cleanCode.padStart(13, '0'))
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
        priceValidFrom: priceValidFrom || undefined,
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

import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import logger from "../logger";

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

interface GalexisCredentials {
  customerNumber: string;
  password: string;
  baseUrl?: string;
}

interface GalexisConditionLine {
  productMaster: {
    wholesalerProductCode: string;
    databasePiecePrice: string;
    publicPricePerPiece: string;
    migelCode?: string;
    migelCodeDescription?: string;
  };
  productConditionLevels?: Array<{
    validFrom: string;
    validUntil: string;
    productConditionType: {
      type: string;
      isSupplierFinanced: boolean;
      isManufacturerFinanced: boolean;
      isWholesalerFinanced: boolean;
      is3rdPartyFinanced: boolean;
    };
    productConditionLevelPrice: {
      piecePrice: string;
      discountPercent: string;
      expectedTotalPiecePrice: string;
      expectedLogisticServiceCost: string;
      deliveryQuantity: string;
      invoiceQuantity: string;
      bonusQuantity: string;
    };
  }>;
}

interface GalexisResponse {
  success: boolean;
  data?: {
    lines: GalexisConditionLine[];
    hasMorePages: boolean;
    nextPageKey?: string;
  };
  error?: string;
}

export interface PriceData {
  articleCode: string;
  basispreis: number;
  publikumspreis: number;
  yourPrice: number;
  discountPercent: number;
  logisticCost: number;
  migelCode?: string;
  migelDescription?: string;
  validFrom?: Date;
  validUntil?: Date;
  conditionType?: string;
  gtin?: string;
  description?: string;
  available?: boolean;
  availabilityMessage?: string;
  deliveryQuantity?: number;
  packSize?: number;
}

export interface ProductLookupResult {
  pharmacode: string;
  gtin?: string;
  found: boolean;
  price?: PriceData;
  error?: string;
}

export interface ProductLookupRequest {
  pharmacode?: string;
  gtin?: string;
}

const DEFAULT_BASE_URL = 'https://xml.e-galexis.com/POS';

export class GalexisClient {
  private customerNumber: string;
  private password: string;
  private baseUrl: string;
  private parser: XMLParser;
  private builder: XMLBuilder;

  constructor(credentials: GalexisCredentials) {
    this.customerNumber = credentials.customerNumber;
    this.password = credentials.password;
    this.baseUrl = credentials.baseUrl || DEFAULT_BASE_URL;
    
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: true,
      removeNSPrefix: true, // Strip namespace prefixes like ns2: to handle <ns2:productAvailabilityResponse>
    });
    
    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
  }

  private buildCustomerSpecificConditionsRequest(pageSize: number = 200, requestKey: string = ''): string {
    const direction = requestKey ? 'next' : 'next';
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<customerSpecificConditionsRequest 
  xmlns="http://xml.e-galexis.com/V2/schemas/" 
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xsi:schemaLocation="http://xml.e-galexis.com/V2/schemas/ http://xml.e-galexis.com/V2/schemas/customerSpecificConditions/customerSpecificConditionsRequest.xsd" 
  compressionDesired="false" 
  productDescriptionDesired="true" 
  communicationSoftwareId="Viali" 
  version="2.0">
  <client number="${this.customerNumber}" password="${this.password}"/>
  <browseRequest direction="${direction}" requestKey="${requestKey}"/>
  <customerSpecificConditionsBrowseDefinition pageSize="${pageSize}"/>
</customerSpecificConditionsRequest>`;
  }

  async fetchCustomerConditions(
    pageSize: number = 200,
    requestKey: string = '',
    onProgress?: (page: number, totalLines: number) => void
  ): Promise<{ prices: PriceData[]; hasMore: boolean; nextKey: string; rawResponse?: string; debugInfo?: any }> {
    try {
      const requestXml = this.buildCustomerSpecificConditionsRequest(pageSize, requestKey);
      
      logger.info('[Galexis] Fetching customer conditions...');
      logger.info('[Galexis] Request XML:', requestXml);
      
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Accept': 'text/xml',
        },
        body: requestXml,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Galexis API error: ${response.status} - ${errorText}`);
      }

      const responseXml = await response.text();
      logger.info('[Galexis] Raw XML response (first 2000 chars):', responseXml.substring(0, 2000));
      
      const parsed = this.parser.parse(responseXml);
      logger.info('[Galexis] Parsed response keys:', parsed ? Object.keys(parsed) : 'NULL');
      
      const conditionsResponse = parsed.customerSpecificConditionsResponse;
      
      if (!conditionsResponse) {
        logger.info('[Galexis] Full parsed response:', JSON.stringify(parsed, null, 2).substring(0, 2000));
        throw new Error('Invalid response format from Galexis');
      }

      logger.info('[Galexis] Response keys:', conditionsResponse ? Object.keys(conditionsResponse) : 'NULL');

      if (conditionsResponse.clientErrorResponse) {
        const errorMsg = conditionsResponse.clientErrorResponse.message || 
                        conditionsResponse.clientErrorResponse.errorText ||
                        JSON.stringify(conditionsResponse.clientErrorResponse);
        logger.info('[Galexis] Client error response:', JSON.stringify(conditionsResponse.clientErrorResponse));
        throw new Error(`Galexis authentication error: ${errorMsg}`);
      }

      if (conditionsResponse.nothingFound !== undefined) {
        logger.info('[Galexis] API returned nothingFound - no customer-specific conditions registered');
        logger.info('[Galexis] Full response:', JSON.stringify(conditionsResponse, null, 2));
        return { 
          prices: [], 
          hasMore: false, 
          nextKey: '',
          rawResponse: responseXml,
          debugInfo: {
            responseType: 'nothingFound',
            message: 'Die Galexis API hat "nothingFound" zurückgegeben - keine kundenspezifischen Konditionen hinterlegt',
            explanation: 'Der Galexis-Account benötigt aktivierte Produktkonditionen. Bitte kontaktieren Sie Galexis Support.',
            rawXmlPreview: responseXml.substring(0, 1000),
            parsedResponse: conditionsResponse,
            apiEndpoint: this.baseUrl,
            customerNumber: this.customerNumber,
            timestamp: new Date().toISOString(),
          }
        };
      }

      const lines = conditionsResponse.customerSpecificConditionLines?.customerSpecificConditionLine || [];
      const lineArray = Array.isArray(lines) ? lines : [lines];
      
      const prices: PriceData[] = lineArray.map((line: any) => {
        const master = line.productMaster || {};
        const conditions = line.productConditionLevel || [];
        const conditionArray = Array.isArray(conditions) ? conditions : [conditions];
        
        const bestCondition = conditionArray[0];
        const priceLevel = bestCondition?.productConditionLevelPrice || {};
        const conditionType = bestCondition?.productConditionType || {};

        return {
          articleCode: String(master.wholesalerProductCode || ''),
          basispreis: parseFloat(master.databasePiecePrice) || 0,
          publikumspreis: parseFloat(master.publicPricePerPiece) || 0,
          yourPrice: parseFloat(priceLevel.expectedTotalPiecePrice) || parseFloat(master.databasePiecePrice) || 0,
          discountPercent: parseFloat(priceLevel.discountPercent) || 0,
          logisticCost: parseFloat(priceLevel.expectedLogisticServiceCost) || 0,
          migelCode: master.migelCode || undefined,
          migelDescription: master.migelCodeDescription || undefined,
          validFrom: bestCondition?.validFrom ? new Date(bestCondition.validFrom) : undefined,
          validUntil: bestCondition?.validUntil ? new Date(bestCondition.validUntil) : undefined,
          conditionType: conditionType.type || undefined,
        };
      });

      let hasMore = false;
      let nextKey = '';

      // Check for pagination status flags in response
      // The API uses atFirst (first page, more coming), inBetween (middle pages), or atLast (final page)
      const paginationStatus = conditionsResponse.atFirst ? 'atFirst' : 
                               conditionsResponse.inBetween ? 'inBetween' : 
                               conditionsResponse.atLast ? 'atLast' : 'unknown';
      
      // Extract the next page key from the response
      // The key could be in browseRequest as an attribute or in the pagination status element
      let extractedKey = '';
      if (conditionsResponse.browseRequest?.requestKey) {
        extractedKey = conditionsResponse.browseRequest.requestKey;
      } else if (typeof conditionsResponse.atFirst === 'object' && conditionsResponse.atFirst?.requestKey) {
        extractedKey = conditionsResponse.atFirst.requestKey;
      } else if (typeof conditionsResponse.inBetween === 'object' && conditionsResponse.inBetween?.requestKey) {
        extractedKey = conditionsResponse.inBetween.requestKey;
      }
      
      logger.info(`[Galexis] Pagination status: ${paginationStatus}, extractedKey: "${extractedKey}", prices: ${prices.length}`);
      logger.info(`[Galexis] Response structure keys: ${conditionsResponse ? Object.keys(conditionsResponse).join(', ') : 'NULL'}`);
      
      // Only continue if we have more pages AND we have a valid key to continue with
      if ((conditionsResponse.atFirst || conditionsResponse.inBetween) && extractedKey) {
        hasMore = true;
        nextKey = extractedKey;
      } else if (conditionsResponse.atFirst || conditionsResponse.inBetween) {
        // We have a "more pages" indicator but no key - log warning and try to find key
        logger.warn(`[Galexis] WARNING: API indicates more pages but no requestKey found. Response keys: ${conditionsResponse ? JSON.stringify(Object.keys(conditionsResponse)) : 'NULL'}`);
        logger.warn(`[Galexis] browseRequest content: ${JSON.stringify(conditionsResponse.browseRequest)}`);
        logger.warn(`[Galexis] atFirst content: ${JSON.stringify(conditionsResponse.atFirst)}`);
        logger.warn(`[Galexis] inBetween content: ${JSON.stringify(conditionsResponse.inBetween)}`);
        // Do NOT set hasMore to true without a key - this would cause infinite loop
        hasMore = false;
      }

      logger.info(`[Galexis] Fetched ${prices.length} price entries, hasMore: ${hasMore}`);

      return { prices, hasMore, nextKey };
    } catch (error: any) {
      logger.error('[Galexis] Error fetching conditions:', error);
      throw error;
    }
  }

  async fetchAllPrices(
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ prices: PriceData[]; debugInfo?: any }> {
    const allPrices: PriceData[] = [];
    let hasMore = true;
    let nextKey = '';
    let page = 0;
    let debugInfo: any = null;
    
    // Safety limit to prevent infinite loops (Galexis catalog typically has ~30k-50k items max)
    // At 200 items per page, 500 pages = 100,000 items max
    const MAX_PAGES = 500;
    const MAX_ITEMS = 100000;

    while (hasMore) {
      page++;
      logger.info(`[Galexis] Fetching page ${page}...`);
      
      // Safety check: prevent infinite loops
      if (page > MAX_PAGES) {
        logger.error(`[Galexis] SAFETY LIMIT: Exceeded ${MAX_PAGES} pages. Stopping to prevent infinite loop.`);
        logger.error(`[Galexis] Current items: ${allPrices.length}, last nextKey: "${nextKey}"`);
        break;
      }
      
      if (allPrices.length > MAX_ITEMS) {
        logger.error(`[Galexis] SAFETY LIMIT: Exceeded ${MAX_ITEMS} items. Stopping to prevent infinite loop.`);
        break;
      }
      
      const result = await this.fetchCustomerConditions(200, nextKey);
      
      // If we got 0 items, something is wrong - stop
      if (result.prices.length === 0 && page > 1) {
        logger.warn(`[Galexis] Got 0 items on page ${page}. Stopping pagination.`);
        break;
      }
      
      allPrices.push(...result.prices);
      hasMore = result.hasMore;
      nextKey = result.nextKey;
      
      // Capture debug info from first request (especially for nothingFound case)
      if (page === 1 && result.debugInfo) {
        debugInfo = result.debugInfo;
      }

      if (onProgress) {
        onProgress(allPrices.length, allPrices.length);
      }

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    logger.info(`[Galexis] Total prices fetched: ${allPrices.length} over ${page} pages`);
    return { prices: allPrices, debugInfo };
  }

  private buildProductAvailabilityRequest(products: ProductLookupRequest[]): string {
    const productLines = products.map((p, index) => {
      if (p.pharmacode) {
        return `    <productAvailabilityLine quantity="1">
      <product>
        <pharmaCode id="${p.pharmacode}" />
      </product>
    </productAvailabilityLine>`;
      } else if (p.gtin) {
        return `    <productAvailabilityLine quantity="1">
      <product>
        <EAN id="${p.gtin}" />
      </product>
    </productAvailabilityLine>`;
      }
      return '';
    }).filter(Boolean).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<productAvailabilityRequest 
  xmlns="http://xml.e-galexis.com/V2/schemas/" 
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xsi:schemaLocation="http://xml.e-galexis.com/V2/schemas/ http://xml.e-galexis.com/V2/schemas/productAvailability/productAvailabilityRequest.xsd" 
  version="2.0" 
  language="de" 
  communicationSoftwareId="Viali" 
  productDescriptionDesired="true" 
  compressionDesired="false">
  <client number="${this.customerNumber}" password="${this.password}" />
  <productAvailabilityLines>
${productLines}
  </productAvailabilityLines>
</productAvailabilityRequest>`;
  }

  async lookupProducts(
    products: ProductLookupRequest[]
  ): Promise<{ results: ProductLookupResult[]; debugInfo: any }> {
    if (products.length === 0) {
      return { results: [], debugInfo: { message: 'No products to lookup' } };
    }

    logger.info(`[Galexis] Looking up ${products.length} products by pharmacode/GTIN...`);
    
    const requestXml = this.buildProductAvailabilityRequest(products);
    logger.info('[Galexis] ProductAvailability Request XML:', requestXml.substring(0, 1000));

    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Accept': 'text/xml',
        },
        body: requestXml,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[Galexis] ProductAvailability HTTP error:', response.status, errorText);
        throw new Error(`Galexis API error: ${response.status} - ${errorText}`);
      }

      const responseXml = await response.text();
      logger.info('[Galexis] ProductAvailability Raw XML response (first 2000 chars):', responseXml.substring(0, 2000));

      const parsed = this.parser.parse(responseXml);
      logger.info('[Galexis] ProductAvailability Parsed response keys:', parsed ? Object.keys(parsed) : 'NULL');

      // Handle GalexisXMLError responses (authentication failures, service errors, etc.)
      if (parsed.GalexisXMLError) {
        const xmlError = parsed.GalexisXMLError;
        const errorCode = xmlError.errorCode || xmlError.code || 'unknown';
        const errorMessage = xmlError.errorMessage || xmlError.message || xmlError.description || JSON.stringify(xmlError);
        logger.error(`[Galexis] API returned GalexisXMLError: code=${errorCode}, message=${errorMessage}`);
        throw new Error(`Galexis API error (${errorCode}): ${errorMessage}`);
      }

      const availabilityResponse = parsed.productAvailabilityResponse;
      if (!availabilityResponse) {
        const parsedKeys = parsed ? Object.keys(parsed) : [];
        logger.info('[Galexis] ProductAvailability Full parsed response:', JSON.stringify(parsed, null, 2).substring(0, 3000));
        logger.error(`[Galexis] Expected 'productAvailabilityResponse' but got keys: [${parsedKeys.join(', ')}]`);
        throw new Error(`Invalid productAvailability response format from Galexis. Got keys: [${parsedKeys.join(', ')}]`);
      }

      if (availabilityResponse.clientErrorResponse) {
        const errorMsg = availabilityResponse.clientErrorResponse.message || 
                        availabilityResponse.clientErrorResponse.errorText ||
                        JSON.stringify(availabilityResponse.clientErrorResponse);
        logger.info('[Galexis] ProductAvailability Client error:', JSON.stringify(availabilityResponse.clientErrorResponse));
        throw new Error(`Galexis authentication error: ${errorMsg}`);
      }

      const responseLines = availabilityResponse.productAvailabilityResponseLines?.productAvailabilityResponseLine || [];
      const linesArray = Array.isArray(responseLines) ? responseLines : [responseLines];
      
      logger.info(`[Galexis] ProductAvailability Got ${linesArray.length} response lines`);

      const results: ProductLookupResult[] = linesArray.map((line: any, index: number) => {
        const requestLine = line.productAvailabilityLine;
        const productResponse = line.productResponse;
        const availability = line.availability;
        const conditions = line.productConditionLevels?.productConditionLevel;

        const requestedPharmacode = requestLine?.product?.pharmaCode?.id?.toString() || '';
        const requestedGtin = requestLine?.product?.EAN?.id?.toString() || '';
        
        // Debug logging for all response lines - see what Galexis actually returns
        logger.info(`[Galexis] Response line ${index}: pharmacode=${requestedPharmacode}, gtin=${requestedGtin}`);
        logger.info(`[Galexis]   - productResponse keys: ${productResponse ? Object.keys(productResponse).join(', ') : 'NULL'}`);
        logger.info(`[Galexis]   - availability: ${JSON.stringify(availability)}`);
        logger.info(`[Galexis]   - line keys: ${line ? Object.keys(line).join(', ') : 'NULL'}`);
        
        if (!productResponse) {
          logger.info(`[Galexis] No productResponse for pharmacode=${requestedPharmacode}, gtin=${requestedGtin}`);
          logger.info(`[Galexis]   Full line object: ${JSON.stringify(line, null, 2).substring(0, 500)}`);
          return {
            pharmacode: requestedPharmacode,
            gtin: requestedGtin,
            found: false,
            error: availability?.message || 'Product not found',
          };
        }

        const conditionArray = Array.isArray(conditions) ? conditions : (conditions ? [conditions] : []);
        const bestCondition = conditionArray[0];
        const priceLevel = bestCondition?.productConditionLevelPrice || {};
        const conditionType = bestCondition?.productConditionType || {};

        const basePiecePrice = parseFloat(productResponse.basePiecePrice) || 0;
        const publicPrice = parseFloat(productResponse.publicPricePerPiece) || 0;
        const expectedPrice = parseFloat(priceLevel.expectedTotalPiecePrice) || basePiecePrice;
        const discountPercent = parseFloat(priceLevel.discountPercent) || parseFloat(productResponse.discountPercent) || 0;
        const logisticCost = parseFloat(priceLevel.expectedLogisticServiceCost) || parseFloat(productResponse.expectedLogisticServiceCost) || 0;

        const resultGtin = productResponse.EAN?.id?.toString() || requestedGtin;

        // Extract deliveryQuantity from condition if available
        const deliveryQuantity = parseInt(priceLevel.deliveryQuantity, 10) || undefined;
        
        // Try to get pack size: first from deliveryQuantity, then parse from description
        const descriptionText = productResponse.description || '';
        const parsedPackSize = parsePackSizeFromDescription(descriptionText);
        const packSize = deliveryQuantity || parsedPackSize;

        logger.info(`[Galexis] Found product: ${descriptionText}, pharmacode=${productResponse.wholesalerProductCode}, price=${basePiecePrice}, deliveryQty=${deliveryQuantity}, parsedPack=${parsedPackSize}`);

        return {
          pharmacode: productResponse.wholesalerProductCode?.toString() || requestedPharmacode,
          gtin: resultGtin,
          found: true,
          price: {
            articleCode: productResponse.wholesalerProductCode?.toString() || requestedPharmacode,
            basispreis: basePiecePrice,
            publikumspreis: publicPrice,
            yourPrice: expectedPrice,
            discountPercent,
            logisticCost,
            gtin: resultGtin,
            description: descriptionText,
            available: availability?.status === 'yes',
            availabilityMessage: availability?.message || '',
            validFrom: bestCondition?.validFrom ? new Date(bestCondition.validFrom) : undefined,
            conditionType: conditionType.type || undefined,
            deliveryQuantity,
            packSize,
          },
        };
      });

      const foundCount = results.filter(r => r.found).length;
      logger.info(`[Galexis] ProductAvailability completed: ${foundCount}/${results.length} products found`);

      return {
        results,
        debugInfo: {
          apiEndpoint: this.baseUrl,
          customerNumber: this.customerNumber,
          requestedProducts: products.length,
          foundProducts: foundCount,
          notFoundProducts: results.length - foundCount,
          timestamp: new Date().toISOString(),
          rawXmlPreview: responseXml.substring(0, 1500),
        },
      };
    } catch (error: any) {
      logger.error('[Galexis] ProductAvailability error:', error);
      throw error;
    }
  }

  async lookupProductsBatch(
    products: ProductLookupRequest[],
    batchSize: number = 50,
    onProgress?: (processed: number, total: number, found: number) => void
  ): Promise<{ results: ProductLookupResult[]; debugInfo: any }> {
    const allResults: ProductLookupResult[] = [];
    let foundCount = 0;
    const debugInfos: any[] = [];

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      logger.info(`[Galexis] Processing batch ${Math.floor(i / batchSize) + 1}, items ${i + 1}-${Math.min(i + batchSize, products.length)} of ${products.length}`);
      
      try {
        const { results, debugInfo } = await this.lookupProducts(batch);
        allResults.push(...results);
        foundCount += results.filter(r => r.found).length;
        debugInfos.push(debugInfo);
        
        if (onProgress) {
          onProgress(allResults.length, products.length, foundCount);
        }

        if (i + batchSize < products.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error: any) {
        logger.error(`[Galexis] Batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
        for (const p of batch) {
          allResults.push({
            pharmacode: p.pharmacode || '',
            gtin: p.gtin,
            found: false,
            error: error.message,
          });
        }
      }
    }

    logger.info(`[Galexis] Batch lookup completed: ${foundCount}/${allResults.length} products found`);

    return {
      results: allResults,
      debugInfo: {
        totalBatches: Math.ceil(products.length / batchSize),
        totalProducts: products.length,
        totalFound: foundCount,
        totalNotFound: allResults.length - foundCount,
        batchDebugInfos: debugInfos,
      },
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const { prices, hasMore } = await this.fetchCustomerConditions(10);
      
      if (prices.length > 0 || hasMore === false) {
        return {
          success: true,
          message: `Connection successful. Found ${prices.length} price entries.`,
        };
      }
      
      return {
        success: true,
        message: 'Connection successful. Catalog may need initial registration (try again tomorrow after 15:00).',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Connection failed',
      };
    }
  }
}

export function createGalexisClient(customerNumber: string, password: string, baseUrl?: string): GalexisClient {
  return new GalexisClient({
    customerNumber,
    password,
    baseUrl,
  });
}

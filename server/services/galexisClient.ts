import { XMLParser, XMLBuilder } from 'fast-xml-parser';

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
}

const DEFAULT_BASE_URL = 'https://pos.e-galexis.com/POS';

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
  ): Promise<{ prices: PriceData[]; hasMore: boolean; nextKey: string }> {
    try {
      const requestXml = this.buildCustomerSpecificConditionsRequest(pageSize, requestKey);
      
      console.log('[Galexis] Fetching customer conditions...');
      
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
      const parsed = this.parser.parse(responseXml);
      
      const conditionsResponse = parsed.customerSpecificConditionsResponse;
      
      if (!conditionsResponse) {
        throw new Error('Invalid response format from Galexis');
      }

      if (conditionsResponse.clientErrorResponse) {
        throw new Error(`Galexis authentication error: ${conditionsResponse.clientErrorResponse.message || 'Unknown error'}`);
      }

      if (conditionsResponse.nothingFound !== undefined) {
        console.log('[Galexis] No conditions found (may need registration first)');
        return { prices: [], hasMore: false, nextKey: '' };
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

      if (conditionsResponse.atFirst || conditionsResponse.inBetween) {
        hasMore = true;
        nextKey = conditionsResponse.browseRequest?.requestKey || '';
      }

      console.log(`[Galexis] Fetched ${prices.length} price entries`);

      return { prices, hasMore, nextKey };
    } catch (error: any) {
      console.error('[Galexis] Error fetching conditions:', error);
      throw error;
    }
  }

  async fetchAllPrices(
    onProgress?: (processed: number, total: number) => void
  ): Promise<PriceData[]> {
    const allPrices: PriceData[] = [];
    let hasMore = true;
    let nextKey = '';
    let page = 0;

    while (hasMore) {
      page++;
      console.log(`[Galexis] Fetching page ${page}...`);
      
      const result = await this.fetchCustomerConditions(200, nextKey);
      allPrices.push(...result.prices);
      hasMore = result.hasMore;
      nextKey = result.nextKey;

      if (onProgress) {
        onProgress(allPrices.length, allPrices.length);
      }

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`[Galexis] Total prices fetched: ${allPrices.length}`);
    return allPrices;
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

import OpenAI from "openai";
import { tryDecodeWithMultipleStrategies } from "./services/barcodeDecoder";
import { getVisionAiClient, getVisionModel, VisionAiProvider } from "./services/visionAiFactory";
import logger from "./logger";

interface ExtractedItemData {
  name?: string;
  description?: string;
  concentration?: string;
  size?: string;
  barcode?: string;
  unit?: string;
  confidence: number;
  // Extended product codes
  gtin?: string;
  pharmacode?: string;
  lotNumber?: string;
  expiryDate?: string;
  productionDate?: string;
  ref?: string;
  manufacturer?: string;
  packContent?: string;
  unitsPerPack?: number;
  // GS1 DataMatrix raw content
  gs1DataMatrix?: string;
}

export async function analyzeItemImage(base64Image: string, hospitalId?: string): Promise<ExtractedItemData> {
  try {
    // First, try to decode any barcodes in the image using ZXing
    let decodedBarcode: { gtin?: string; lotNumber?: string; expiryDate?: string; productionDate?: string; text?: string } | null = null;
    try {
      decodedBarcode = await tryDecodeWithMultipleStrategies(base64Image);
      if (decodedBarcode) {
        logger.info('[VisionAI] Barcode decoded successfully:', {
          gtin: decodedBarcode.gtin,
          lot: decodedBarcode.lotNumber,
          expiry: decodedBarcode.expiryDate,
          raw: decodedBarcode.text
        });
      }
    } catch (barcodeError) {
      logger.info('[VisionAI] Barcode decoding failed, continuing with AI analysis');
    }

    // Get the appropriate AI client based on hospital settings
    const { client: openai, provider } = hospitalId 
      ? await getVisionAiClient(hospitalId)
      : { client: new (await import("openai")).default({ apiKey: process.env.OPENAI_API_KEY }), provider: "openai" as VisionAiProvider };
    const model = getVisionModel(provider);
    logger.info(`[VisionAI] Using ${provider} (${model}) for item analysis`);

    const visionResponse = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this pharmaceutical/medical product image and extract ALL visible information in JSON format:
{
  "name": "product name INCLUDING dosage/strength (e.g., 'Novalgin 500 mg', 'NaCl 0.9%', 'Ibuprofen 400mg')",
  "description": "ALL other visible product info: active ingredient, form, pack contents, manufacturer (e.g., 'Metamizolum natricum 500 mg 50 tabletten')",
  "concentration": "concentration/strength separately (e.g., '10mg/ml', '500mg', '0.9%')",
  "size": "size/volume of the product (e.g., '100 ml', '500ml')",
  "barcode": "barcode number if visible (EAN, UPC, etc.)",
  "unit": "packaging unit type - must be one of: 'Pack', 'Single unit'",
  "confidence": "confidence score 0-1 for the extraction",
  
  "gtin": "GTIN/EAN/UPC code (13-14 digits). Look for this in GS1 DataMatrix barcodes after '01' prefix OR as a 13-digit number near the barcode",
  "pharmacode": "Swiss Pharmacode OR German PZN number (7-8 digits, labeled 'Pharmacode', 'PH', 'PZN', or 'Pharmazentralnummer'). NEVER confuse with LOT number!",
  "lotNumber": "LOT/Batch number (labeled 'LOT', 'Ch.-B.', 'BATCH'). This is alphanumeric (e.g., '25H21D8001') and is DIFFERENT from pharmacode/PZN!",
  "expiryDate": "EXPIRATION date in YYYY-MM-DD format - date with HOURGLASS/SANDCLOCK icon (⌛) or labeled 'EXP', 'Verfall', 'Verwendbar bis'",
  "productionDate": "PRODUCTION/MANUFACTURING date in YYYY-MM-DD format - date with FACTORY icon (🏭) or labeled 'MFG', 'Herstellung', 'Prod'",
  "ref": "REF/Article number (manufacturer's reference code)",
  "manufacturer": "Manufacturer/Company name (e.g., 'B. Braun', '3M', 'Polymed')",
  "packContent": "Pack content description (e.g., '10x5ml', '50 Stück', '1000ml', '50 tabletten')",
  "unitsPerPack": "Number of individual units/tablets/ampoules in the pack (numeric only, e.g., 50 for '50 tabletten')",
  "gs1DataMatrix": "If a GS1 DataMatrix or GS1-128 barcode is visible, extract its full content (e.g., '010402249518831117300801102SH21D8001')"
}

CRITICAL DATE IDENTIFICATION:
Medical products have TWO different dates with specific symbols:
1. EXPIRATION DATE (when product expires) - marked with:
   - Hourglass/sandclock icon (⌛)
   - "EXP", "Verfall", "Verwendbar bis", "Use by"
   - This is typically the LATER date (e.g., 2030-08-01)
2. PRODUCTION DATE (when product was made) - marked with:
   - Factory icon (🏭) or calendar with factory
   - "MFG", "Herstellung", "Prod", "Manufacturing"
   - This is typically the EARLIER date (e.g., 2025-08-21)

GS1 DataMatrix/GS1-128 Barcode Parsing:
- These barcodes encode data using Application Identifiers (AI):
  - (01) = GTIN (14 digits following)
  - (17) = Expiration date in YYMMDD format
  - (11) = Production date in YYMMDD format
  - (10) = Batch/LOT number (variable length)
- Example: "01 04022495188311 17 300801 10 25H21D8001" means:
  - GTIN: 04022495188311
  - Expiry: 2030-08-01
  - LOT: 25H21D8001

CRITICAL CODE IDENTIFICATION - DO NOT CONFUSE:
1. GTIN (Global Trade Item Number):
   - 13-14 digit numeric code
   - Found in/near barcodes or as "GTIN", "EAN", "UPC"
   - Example: 04022495188311
2. Pharmacode/PZN (Product Identification):
   - 7-8 digit numeric code ONLY
   - Labeled "PZN", "Pharmacode", "PH", or "Pharmazentralnummer"
   - Example: 00570074
3. LOT/Batch Number (Production Batch):
   - Alphanumeric code (letters AND numbers)
   - Labeled "LOT", "Ch.-B.", "BATCH", or inside square brackets [LOT]
   - Example: 25H21D8001
   - ⚠️ NEVER put LOT number in pharmacode field!
4. REF (Reference/Article Number):
   - Manufacturer's catalog number
   - Labeled "REF" or "Art.-Nr."
   - Example: 4613503F

Important:
- Extract the GTIN from GS1 DataMatrix barcodes (the 14 digits after '01')
- ALWAYS distinguish expiration date (hourglass) from production date (factory)
- Convert dates to YYYY-MM-DD format
- For unit: MOST pharmaceutical items should be "Pack". Use "Single unit" ONLY for individual vials/ampoules
- If information is not clearly visible, omit that field
- Return valid JSON only`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const result = JSON.parse(visionResponse.choices[0].message.content || "{}");
    
    // Start with barcode decoder results (most reliable for GTIN/lot/dates from DataMatrix)
    // Then use AI results as fallback for anything not decoded
    let gtin = decodedBarcode?.gtin || result.gtin;
    let expiryDate = decodedBarcode?.expiryDate || result.expiryDate;
    let lotNumber = decodedBarcode?.lotNumber || result.lotNumber;
    let productionDate = decodedBarcode?.productionDate || result.productionDate;
    let gs1DataMatrixContent = decodedBarcode?.text || result.gs1DataMatrix;
    
    // If AI provided gs1DataMatrix content, also parse it as backup
    if (result.gs1DataMatrix && !decodedBarcode) {
      const gs1Content = result.gs1DataMatrix.replace(/\s/g, '');
      
      // Parse AI (01) = GTIN (14 digits)
      const gtinMatch = gs1Content.match(/01(\d{14})/);
      if (gtinMatch && !gtin) {
        gtin = gtinMatch[1];
      }
      
      // Parse AI (17) = Expiry date (YYMMDD)
      const expiryMatch = gs1Content.match(/17(\d{6})/);
      if (expiryMatch && !expiryDate) {
        const yymmdd = expiryMatch[1];
        const yy = parseInt(yymmdd.substring(0, 2));
        const mm = yymmdd.substring(2, 4);
        const dd = yymmdd.substring(4, 6);
        const year = yy >= 50 ? 1900 + yy : 2000 + yy;
        expiryDate = `${year}-${mm}-${dd === '00' ? '28' : dd}`;
      }
      
      // Parse AI (11) = Production date (YYMMDD)
      const prodMatch = gs1Content.match(/11(\d{6})/);
      if (prodMatch && !productionDate) {
        const yymmdd = prodMatch[1];
        const yy = parseInt(yymmdd.substring(0, 2));
        const mm = yymmdd.substring(2, 4);
        const dd = yymmdd.substring(4, 6);
        const year = yy >= 50 ? 1900 + yy : 2000 + yy;
        productionDate = `${year}-${mm}-${dd === '00' ? '01' : dd}`;
      }
      
      // Parse AI (10) = LOT/Batch (variable length, ends at next AI or end)
      const lotMatch = gs1Content.match(/10([A-Za-z0-9]+?)(?=(?:17|21|11|240)|$)/);
      if (lotMatch && !lotNumber) {
        lotNumber = lotMatch[1];
      }
    }
    
    return {
      name: result.name,
      description: result.description,
      concentration: result.concentration,
      size: result.size,
      barcode: result.barcode,
      unit: result.unit,
      confidence: Math.max(0, Math.min(1, result.confidence || 0)),
      // Extended product codes
      gtin,
      pharmacode: result.pharmacode,
      lotNumber,
      expiryDate,
      productionDate,
      ref: result.ref,
      manufacturer: result.manufacturer,
      packContent: result.packContent,
      unitsPerPack: result.unitsPerPack ? parseInt(result.unitsPerPack) : undefined,
      gs1DataMatrix: gs1DataMatrixContent,
    };
  } catch (error: any) {
    logger.error("Error analyzing image with OpenAI:", error);
    throw new Error("Failed to analyze image: " + error.message);
  }
}

interface ExtractedCodesData {
  gtin?: string;
  pharmacode?: string;
  ean?: string;
  supplierCode?: string;
  lotNumber?: string;
  expiryDate?: string;
  confidence: number;
}

export async function analyzeCodesImage(base64Image: string, hospitalId?: string): Promise<ExtractedCodesData> {
  try {
    // First, try to decode any barcodes in the image using ZXing
    let decodedBarcode: { gtin?: string; lotNumber?: string; expiryDate?: string; productionDate?: string; text?: string } | null = null;
    try {
      decodedBarcode = await tryDecodeWithMultipleStrategies(base64Image);
      if (decodedBarcode) {
        logger.info('[VisionAI] Barcode decoded successfully for codes extraction:', {
          gtin: decodedBarcode.gtin,
          lot: decodedBarcode.lotNumber,
          expiry: decodedBarcode.expiryDate,
          raw: decodedBarcode.text
        });
      }
    } catch (barcodeError) {
      logger.info('[VisionAI] Barcode decoding failed, continuing with AI analysis for codes');
    }

    // Get the appropriate AI client based on hospital settings
    const { client: openai, provider } = hospitalId 
      ? await getVisionAiClient(hospitalId)
      : { client: new (await import("openai")).default({ apiKey: process.env.OPENAI_API_KEY }), provider: "openai" as VisionAiProvider };
    const model = getVisionModel(provider);
    logger.info(`[VisionAI] Using ${provider} (${model}) for codes extraction`);

    const visionResponse = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this pharmaceutical/medical product image and extract ONLY the product identification codes in JSON format. Focus on finding ALL visible barcodes and code labels:
{
  "gtin": "GTIN/EAN code (13-14 digits). Look for GS1 DataMatrix barcodes (01 prefix) OR 13-digit numbers near barcodes",
  "pharmacode": "Swiss Pharmacode OR German PZN number (7-8 digits). Labeled 'Pharmacode', 'PH', 'PZN', or 'Pharmazentralnummer'",
  "ean": "EAN-13 barcode number if different from GTIN (13 digits)",
  "supplierCode": "Supplier/distributor article code (often starts with letters, varies by supplier)",
  "lotNumber": "LOT/Batch number (labeled 'LOT', 'Ch.-B.', 'BATCH', 'Lot', 'Charge'). Alphanumeric code",
  "expiryDate": "Expiration date in YYYY-MM-DD format. Look for hourglass icon (⌛), 'EXP', 'Verfall', 'Verwendbar bis'",
  "confidence": "confidence score 0-1"
}

IMPORTANT CODE IDENTIFICATION:
1. GTIN (Global Trade Item Number):
   - 13-14 digit numeric code
   - Found in/near barcodes or labeled "GTIN", "EAN", "UPC"
   - In GS1 DataMatrix: 14 digits after '01' prefix
   
2. Pharmacode/PZN:
   - 7-8 digit NUMERIC code ONLY
   - Labeled "PZN", "Pharmacode", "PH"
   - Example: 00570074, 1234567
   
3. Supplier Code:
   - Variable format, often alphanumeric
   - May be labeled "Art.", "REF", or supplier-specific
   
4. LOT/Batch Number:
   - Alphanumeric (letters AND numbers)
   - Labeled "LOT", "Ch.-B.", "BATCH"
   - ⚠️ NEVER confuse with Pharmacode!

Look carefully at all visible labels and barcodes. Extract every code you can find.
Return ONLY valid JSON.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const result = JSON.parse(visionResponse.choices[0].message.content || "{}");
    
    // Merge barcode decoder results with AI results (decoder takes priority)
    let gtin = decodedBarcode?.gtin || result.gtin;
    let expiryDate = decodedBarcode?.expiryDate || result.expiryDate;
    let lotNumber = decodedBarcode?.lotNumber || result.lotNumber;
    
    return {
      gtin,
      pharmacode: result.pharmacode,
      ean: result.ean,
      supplierCode: result.supplierCode,
      lotNumber,
      expiryDate,
      confidence: Math.max(0, Math.min(1, result.confidence || 0)),
    };
  } catch (error: any) {
    logger.error("Error analyzing codes image with OpenAI:", error);
    throw new Error("Failed to analyze codes image: " + error.message);
  }
}

interface BulkItemExtraction {
  name: string;
  description?: string;
  unit: string;
  packSize: number;
  minThreshold: number;
  maxThreshold: number;
  initialStock: number;
  critical: boolean;
  controlled: boolean;
}

export async function analyzeBulkItemImages(
  base64Images: string[], 
  onProgress?: (current: number, total: number, percent: number) => void | Promise<void>,
  hospitalId?: string
): Promise<BulkItemExtraction[]> {
  try {
    // Get the appropriate AI client based on hospital settings
    const { client: openai, provider } = hospitalId 
      ? await getVisionAiClient(hospitalId)
      : { client: new (await import("openai")).default({ apiKey: process.env.OPENAI_API_KEY }), provider: "openai" as VisionAiProvider };
    const model = getVisionModel(provider);
    logger.info(`[VisionAI] Using ${provider} (${model}) for bulk item analysis`);

    // Process images in small batches to stay within strict 30s deployment timeout
    // Each batch of 3 images takes ~12-20 seconds, safely completing under 30s
    const BATCH_SIZE = 3;
    const allItems: BulkItemExtraction[] = [];
    
    for (let i = 0; i < base64Images.length; i += BATCH_SIZE) {
      const batch = base64Images.slice(i, i + BATCH_SIZE);
      const imageContent = batch.map((img) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${img}`
        }
      }));

      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(base64Images.length / BATCH_SIZE);
      const currentImage = Math.min(i + BATCH_SIZE, base64Images.length);
      const progressPercent = Math.round((currentImage / base64Images.length) * 100);

      logger.info(`[Bulk Import] Processing batch ${batchNumber} of ${totalBatches} (images ${i + 1}-${currentImage}/${base64Images.length})`);

      // Call progress callback if provided
      if (onProgress) {
        await onProgress(currentImage, base64Images.length, progressPercent);
      }

      const visionResponse = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze these pharmaceutical/medical product images and extract inventory item information for each distinct product visible across all images.

Return a JSON object with an "items" array containing one entry per unique product:
{
  "items": [
    {
      "name": "Product Name",
      "description": "Brief description (include concentration/strength if visible)",
      "unit": "Pack|Single unit",
      "packSize": 1,
      "minThreshold": 5,
      "maxThreshold": 20,
      "initialStock": 0,
      "critical": false,
      "controlled": false
    }
  ]
}

Important instructions:
- Identify ALL distinct products across all images
- If the same product appears in multiple images, only list it once
- For "unit": MOST pharmaceutical/medical items should be "Pack" (boxes, packages, blister packs, etc.). Use "Single unit" ONLY for clearly individual vials/ampoules of drugs (especially controlled substances like opioids, anesthetics)
- For "packSize": if it's a pack/box, estimate how many units it contains (e.g., box of 10 vials = 10), otherwise use 1
- Set "critical": true for emergency/life-saving drugs (e.g., epinephrine, atropine, emergency medications)
- Set "controlled": true for controlled substances (opioids, benzodiazepines, anesthetics like propofol, ketamine, fentanyl)
- Provide reasonable default thresholds: min 5-10, max 15-30 (higher for commonly used items)
- Include concentration in description if visible (e.g., "Sodium Chloride 0.9% solution")
- Return ONLY valid JSON`
              },
              ...imageContent
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 4096,
      }, {
        timeout: 120000, // 2 minute timeout per batch
      });

      const result = JSON.parse(visionResponse.choices[0].message.content || "{}");
      const batchItems = result.items || [];
      
      // Merge items, avoiding duplicates by name
      for (const item of batchItems) {
        // Skip items without names or with invalid names
        if (!item.name || typeof item.name !== 'string' || !item.name.trim()) {
          logger.warn('[Bulk Import] Skipping item without valid name:', item);
          continue;
        }
        
        const itemNameLower = item.name.toLowerCase().trim();
        const exists = allItems.find(existing => 
          existing.name && existing.name.toLowerCase().trim() === itemNameLower
        );
        if (!exists) {
          allItems.push(item);
        } else {
          logger.info(`[Bulk Import] Skipping duplicate item: ${item.name}`);
        }
      }
    }
    
    logger.info(`[Bulk Import] Total extracted items: ${allItems.length}`);
    return allItems;
  } catch (error: any) {
    logger.error("Error analyzing bulk images with OpenAI:", error);
    throw new Error("Failed to analyze images: " + error.message);
  }
}

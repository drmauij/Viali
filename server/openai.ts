import OpenAI from "openai";

// Using gpt-4o-mini for cost-effective image analysis
// This is using OpenAI's API, which points to OpenAI's API servers and requires your own API key.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  ref?: string;
  manufacturer?: string;
  packContent?: string;
  unitsPerPack?: number;
}

export async function analyzeItemImage(base64Image: string): Promise<ExtractedItemData> {
  try {
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this pharmaceutical/medical product image and extract ALL visible information in JSON format:
{
  "name": "product name (without concentration or size)",
  "description": "brief description if visible (without size/volume)",
  "concentration": "concentration/strength (e.g., '10mg/ml', '500mg', '0.9%')",
  "size": "size/volume of the product (e.g., '100 ml', '500ml', '10mg')",
  "barcode": "barcode number if visible (EAN, UPC, etc.)",
  "unit": "packaging unit type - must be one of: 'Pack', 'Single unit'",
  "confidence": "confidence score 0-1 for the extraction",
  
  "gtin": "GTIN/EAN/UPC code (13-14 digits, often starts with 76 for Swiss products)",
  "pharmacode": "Swiss Pharmacode (7-digit number, often shown as 'Pharmacode' or 'PH')",
  "lotNumber": "LOT/Batch number (often labeled 'LOT', 'Ch.-B.', 'BATCH')",
  "expiryDate": "Expiry date in YYYY-MM-DD format (labeled 'EXP', 'Verfall', 'Verwendbar bis')",
  "ref": "REF/Article number (manufacturer's reference code)",
  "manufacturer": "Manufacturer/Company name (e.g., 'B. Braun', '3M', 'Polymed')",
  "packContent": "Pack content description (e.g., '10x5ml', '50 Stück', '1000ml')",
  "unitsPerPack": "Number of individual units in the pack (numeric)"
}

Swiss Medical Product Labels typically contain:
- GTIN: 13-digit barcode (often starts with 76)
- Pharmacode: 7-digit Swiss pharmacy code
- LOT/Ch.-B.: Batch/lot number
- EXP/Verfall: Expiry date
- REF: Manufacturer article code
- Look for DataMatrix/QR codes which may encode (01)GTIN(10)LOT(17)EXPIRY

Important:
- Extract ALL codes visible on packaging including GS1 DataMatrix content if visible
- Convert expiry dates to YYYY-MM-DD format
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
    
    return {
      name: result.name,
      description: result.description,
      concentration: result.concentration,
      size: result.size,
      barcode: result.barcode,
      unit: result.unit,
      confidence: Math.max(0, Math.min(1, result.confidence || 0)),
      // Extended product codes
      gtin: result.gtin,
      pharmacode: result.pharmacode,
      lotNumber: result.lotNumber,
      expiryDate: result.expiryDate,
      ref: result.ref,
      manufacturer: result.manufacturer,
      packContent: result.packContent,
      unitsPerPack: result.unitsPerPack ? parseInt(result.unitsPerPack) : undefined,
    };
  } catch (error: any) {
    console.error("Error analyzing image with OpenAI:", error);
    throw new Error("Failed to analyze image: " + error.message);
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
  onProgress?: (current: number, total: number, percent: number) => void | Promise<void>
): Promise<BulkItemExtraction[]> {
  try {
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

      console.log(`[Bulk Import] Processing batch ${batchNumber} of ${totalBatches} (images ${i + 1}-${currentImage}/${base64Images.length})`);

      // Call progress callback if provided
      if (onProgress) {
        await onProgress(currentImage, base64Images.length, progressPercent);
      }

      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
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
          console.warn('[Bulk Import] Skipping item without valid name:', item);
          continue;
        }
        
        const itemNameLower = item.name.toLowerCase().trim();
        const exists = allItems.find(existing => 
          existing.name && existing.name.toLowerCase().trim() === itemNameLower
        );
        if (!exists) {
          allItems.push(item);
        } else {
          console.log(`[Bulk Import] Skipping duplicate item: ${item.name}`);
        }
      }
    }
    
    console.log(`[Bulk Import] Total extracted items: ${allItems.length}`);
    return allItems;
  } catch (error: any) {
    console.error("Error analyzing bulk images with OpenAI:", error);
    throw new Error("Failed to analyze images: " + error.message);
  }
}

import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
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
}

export async function analyzeItemImage(base64Image: string): Promise<ExtractedItemData> {
  try {
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this pharmaceutical/medical product image and extract the following information in JSON format:
{
  "name": "product name (without concentration or size)",
  "description": "brief description if visible (without size/volume)",
  "concentration": "concentration/strength (e.g., '10mg/ml', '500mg', '0.9%')",
  "size": "size/volume of the product (e.g., '100 ml', '500ml', '10mg')",
  "barcode": "barcode number if visible (EAN, UPC, etc.)",
  "unit": "packaging unit type - must be one of: 'pack', 'vial', 'single item'",
  "confidence": "confidence score 0-1 for the extraction"
}

Important:
- Extract the product size/volume separately from concentration (e.g., for "NaCl 0.9% 100ml", concentration is "0.9%" and size is "100 ml")
- For unit: MOST pharmaceutical items should be "pack" (boxes/packages/blister packs). Use "vial" ONLY for clearly individual vials/ampoules. Use "single item" ONLY for medical devices/equipment (not drugs)
- Extract any visible barcodes (EAN-13, UPC, Code128, etc.)
- Include drug concentration/strength if visible
- The description should NOT include size/volume information
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

export async function analyzeBulkItemImages(base64Images: string[]): Promise<BulkItemExtraction[]> {
  try {
    const imageContent = base64Images.map((img, idx) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${img}`
      }
    }));

    const visionResponse = await openai.chat.completions.create({
      model: "gpt-5",
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
      "unit": "pack|vial|single item",
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
- For "unit": MOST pharmaceutical/medical items should be "pack" (boxes, packages, blister packs, etc.). Use "vial" ONLY for clearly individual vials/ampules. Use "single item" ONLY for medical devices/equipment that are sold individually (not drugs/consumables)
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
    });

    const result = JSON.parse(visionResponse.choices[0].message.content || "{}");
    return result.items || [];
  } catch (error: any) {
    console.error("Error analyzing bulk images with OpenAI:", error);
    throw new Error("Failed to analyze images: " + error.message);
  }
}

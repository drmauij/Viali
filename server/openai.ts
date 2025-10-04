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
  "unit": "packaging unit type - must be one of: 'box', 'vial', 'single item'",
  "confidence": "confidence score 0-1 for the extraction"
}

Important:
- Extract the product size/volume separately from concentration (e.g., for "NaCl 0.9% 100ml", concentration is "0.9%" and size is "100 ml")
- For unit, determine if it's a box/package containing multiple items, a single vial/ampoule, or a single item
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

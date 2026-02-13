import OpenAI from 'openai';
import type { PolymedPriceData } from './polymedClient';
import logger from "../logger";

const openai = new OpenAI();

export interface ItemToMatch {
  id: string;
  name: string;
  description?: string | null;
  pharmacode?: string | null;
  gtin?: string | null;
  manufacturer?: string | null;
}

export interface MatchResult {
  itemId: string;
  matchedProduct: PolymedPriceData | null;
  confidence: number;
  matchReason: string;
  searchStrategy: 'code' | 'ai_fuzzy' | 'no_match';
}

export interface AIMatchRequest {
  item: ItemToMatch;
  candidates: PolymedPriceData[];
}

export async function findBestMatch(
  item: ItemToMatch,
  candidates: PolymedPriceData[]
): Promise<{ match: PolymedPriceData | null; confidence: number; reason: string }> {
  if (candidates.length === 0) {
    return { match: null, confidence: 0, reason: 'No candidates to match' };
  }

  if (candidates.length === 1) {
    const singleCandidate = candidates[0];
    const nameMatch = calculateNameSimilarity(item.name, singleCandidate.productName);
    
    if (nameMatch > 0.7) {
      return {
        match: singleCandidate,
        confidence: nameMatch,
        reason: `Single result with ${Math.round(nameMatch * 100)}% name similarity`,
      };
    }
  }

  try {
    const result = await matchWithAI(item, candidates);
    return result;
  } catch (error) {
    logger.error('[Polymed Matching] AI matching failed, falling back to simple matching:', error);
    return simpleFuzzyMatch(item, candidates);
  }
}

async function matchWithAI(
  item: ItemToMatch,
  candidates: PolymedPriceData[]
): Promise<{ match: PolymedPriceData | null; confidence: number; reason: string }> {
  const candidateList = candidates.slice(0, 10).map((c, i) => ({
    index: i,
    name: c.productName,
    code: c.articleCode,
    price: c.price,
    description: c.description,
  }));

  const prompt = `You are a medical product matching expert. Match the following product to the best candidate from the list.

PRODUCT TO MATCH:
Name: ${item.name}
${item.description ? `Description: ${item.description}` : ''}
${item.manufacturer ? `Manufacturer: ${item.manufacturer}` : ''}
${item.pharmacode ? `Pharmacode: ${item.pharmacode}` : ''}
${item.gtin ? `GTIN: ${item.gtin}` : ''}

CANDIDATE PRODUCTS:
${candidateList.map(c => `[${c.index}] ${c.name} (Code: ${c.code || 'N/A'}, Price: ${c.price} CHF)${c.description ? ` - ${c.description}` : ''}`).join('\n')}

Respond with JSON only:
{
  "match_index": <number or null if no good match>,
  "confidence": <0.0 to 1.0>,
  "reason": "<brief explanation>"
}

Consider:
- Product name similarity (active ingredient, concentration, form)
- Pack size and unit count
- Manufacturer if known
- Medical context (same therapeutic use)

Only match if confidence > 0.6. Return null for match_index if unsure.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  const result = JSON.parse(content);
  
  if (result.match_index !== null && result.match_index >= 0 && result.match_index < candidates.length) {
    return {
      match: candidates[result.match_index],
      confidence: result.confidence,
      reason: `AI match: ${result.reason}`,
    };
  }

  return {
    match: null,
    confidence: result.confidence || 0,
    reason: result.reason || 'No confident match found',
  };
}

function simpleFuzzyMatch(
  item: ItemToMatch,
  candidates: PolymedPriceData[]
): { match: PolymedPriceData | null; confidence: number; reason: string } {
  let bestMatch: PolymedPriceData | null = null;
  let bestScore = 0;
  let bestReason = '';

  for (const candidate of candidates) {
    const nameSimilarity = calculateNameSimilarity(item.name, candidate.productName);
    
    let score = nameSimilarity;
    let reason = `Name similarity: ${Math.round(nameSimilarity * 100)}%`;

    if (candidate.description && item.description) {
      const descSimilarity = calculateNameSimilarity(item.description, candidate.description);
      score = (score * 0.7) + (descSimilarity * 0.3);
      reason += `, description match: ${Math.round(descSimilarity * 100)}%`;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
      bestReason = reason;
    }
  }

  if (bestScore >= 0.6) {
    return {
      match: bestMatch,
      confidence: bestScore,
      reason: `Fuzzy match: ${bestReason}`,
    };
  }

  return {
    match: null,
    confidence: bestScore,
    reason: `Best match below threshold (${Math.round(bestScore * 100)}%)`,
  };
}

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

  const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);

  const jaccard = intersection.size / union.size;

  const n1Lower = n1.toLowerCase();
  const n2Lower = n2.toLowerCase();
  
  let containsBonus = 0;
  if (n1Lower.includes(n2Lower) || n2Lower.includes(n1Lower)) {
    containsBonus = 0.2;
  }

  return Math.min(1.0, jaccard + containsBonus);
}

export function generateSearchQueries(item: ItemToMatch): string[] {
  const queries: string[] = [];

  if (item.pharmacode) {
    queries.push(item.pharmacode);
  }

  if (item.gtin) {
    queries.push(item.gtin);
  }

  queries.push(item.name);

  const words = item.name.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 3) {
    queries.push(words.slice(0, 3).join(' '));
  }

  const mgMatch = item.name.match(/(\d+(?:\.\d+)?)\s*(mg|ml|g|mcg|ug|%)/i);
  const drugName = item.name.split(/\s+/)[0];
  
  if (mgMatch && drugName) {
    queries.push(`${drugName} ${mgMatch[0]}`);
  }

  return Array.from(new Set(queries));
}

export async function batchMatchItems(
  items: ItemToMatch[],
  searchFunction: (query: string) => Promise<PolymedPriceData[]>,
  onProgress?: (current: number, total: number, itemName: string) => void
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (onProgress) {
      onProgress(i + 1, items.length, item.name);
    }

    const queries = generateSearchQueries(item);
    let bestResult: MatchResult = {
      itemId: item.id,
      matchedProduct: null,
      confidence: 0,
      matchReason: 'No match found',
      searchStrategy: 'no_match',
    };

    for (const query of queries) {
      try {
        const candidates = await searchFunction(query);
        
        if (candidates.length === 0) {
          continue;
        }

        const isCodeSearch = query === item.pharmacode || query === item.gtin;
        
        if (isCodeSearch && candidates.length === 1) {
          bestResult = {
            itemId: item.id,
            matchedProduct: candidates[0],
            confidence: 0.95,
            matchReason: `Direct code match (${query})`,
            searchStrategy: 'code',
          };
          break;
        }

        const { match, confidence, reason } = await findBestMatch(item, candidates);
        
        if (match && confidence > bestResult.confidence) {
          bestResult = {
            itemId: item.id,
            matchedProduct: match,
            confidence,
            matchReason: reason,
            searchStrategy: isCodeSearch ? 'code' : 'ai_fuzzy',
          };
          
          if (confidence >= 0.9) {
            break;
          }
        }

      } catch (error) {
        logger.error(`[Polymed Matching] Search failed for query "${query}":`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    results.push(bestResult);
  }

  return results;
}

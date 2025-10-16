/**
 * Seven-segment digit detection for medical monitors
 * Fast client-side OCR for clean LED/LCD displays
 */

export interface DigitDetectionResult {
  value: number | null;
  confidence: number;
  method: 'seven-segment' | 'pattern-match';
}

export interface VitalsDetectionResult {
  hr: DigitDetectionResult | null;
  spo2: DigitDetectionResult | null;
  sysBP: DigitDetectionResult | null;
  diaBP: DigitDetectionResult | null;
}

/**
 * Seven-segment patterns for digits 0-9
 * Each segment: top, topRight, bottomRight, bottom, bottomLeft, topLeft, middle
 */
const SEVEN_SEGMENT_PATTERNS: { [key: string]: boolean[] } = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
};

/**
 * Detect if a region contains a seven-segment digit
 */
function detectSevenSegmentDigit(
  imageData: ImageData,
  x: number,
  y: number,
  width: number,
  height: number
): DigitDetectionResult {
  // Sample 7 regions corresponding to seven-segment positions
  const segments = {
    top: sampleRegion(imageData, x + width * 0.3, y + height * 0.05, width * 0.4, height * 0.1),
    topRight: sampleRegion(imageData, x + width * 0.7, y + height * 0.15, width * 0.15, height * 0.35),
    bottomRight: sampleRegion(imageData, x + width * 0.7, y + height * 0.55, width * 0.15, height * 0.35),
    bottom: sampleRegion(imageData, x + width * 0.3, y + height * 0.85, width * 0.4, height * 0.1),
    bottomLeft: sampleRegion(imageData, x + width * 0.15, y + height * 0.55, width * 0.15, height * 0.35),
    topLeft: sampleRegion(imageData, x + width * 0.15, y + height * 0.15, width * 0.15, height * 0.35),
    middle: sampleRegion(imageData, x + width * 0.3, y + height * 0.45, width * 0.4, height * 0.1),
  };

  // Convert to boolean pattern (lit vs unlit)
  const threshold = 128; // Grayscale threshold
  const pattern = [
    segments.top > threshold,
    segments.topRight > threshold,
    segments.bottomRight > threshold,
    segments.bottom > threshold,
    segments.bottomLeft > threshold,
    segments.topLeft > threshold,
    segments.middle > threshold,
  ];

  // Match against known patterns
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const [digit, digitPattern] of Object.entries(SEVEN_SEGMENT_PATTERNS)) {
    let score = 0;
    for (let i = 0; i < 7; i++) {
      if (pattern[i] === digitPattern[i]) score++;
    }
    const matchScore = score / 7;
    if (matchScore > bestScore) {
      bestScore = matchScore;
      bestMatch = digit;
    }
  }

  // Require high confidence (>85%) for seven-segment detection
  if (bestScore > 0.85 && bestMatch !== null) {
    return {
      value: parseInt(bestMatch),
      confidence: bestScore,
      method: 'seven-segment',
    };
  }

  return {
    value: null,
    confidence: 0,
    method: 'seven-segment',
  };
}

/**
 * Sample average brightness in a region
 */
function sampleRegion(
  imageData: ImageData,
  x: number,
  y: number,
  width: number,
  height: number
): number {
  const startX = Math.floor(x);
  const startY = Math.floor(y);
  const endX = Math.min(Math.floor(x + width), imageData.width);
  const endY = Math.min(Math.floor(y + height), imageData.height);

  let sum = 0;
  let count = 0;

  for (let py = startY; py < endY; py++) {
    for (let px = startX; px < endX; px++) {
      const idx = (py * imageData.width + px) * 4;
      sum += imageData.data[idx]; // Grayscale R channel
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Extract multi-digit number from a region
 */
function extractMultiDigitNumber(
  imageData: ImageData,
  x: number,
  y: number,
  width: number,
  height: number,
  maxDigits: number = 3
): DigitDetectionResult {
  const digits: number[] = [];
  const confidences: number[] = [];
  const digitWidth = width / maxDigits;

  for (let i = 0; i < maxDigits; i++) {
    const digitX = x + i * digitWidth;
    const result = detectSevenSegmentDigit(imageData, digitX, y, digitWidth, height);
    
    if (result.value !== null && result.confidence > 0.85) {
      digits.push(result.value);
      confidences.push(result.confidence);
    }
  }

  if (digits.length === 0) {
    return { value: null, confidence: 0, method: 'seven-segment' };
  }

  // Combine digits into number
  const value = parseInt(digits.join(''));
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  return {
    value,
    confidence: avgConfidence,
    method: 'seven-segment',
  };
}

/**
 * Attempt to detect vitals from common monitor layouts
 * Uses heuristics based on typical monitor positioning
 */
export async function detectVitalsFromImage(
  base64Image: string
): Promise<VitalsDetectionResult> {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve({
          hr: null,
          spo2: null,
          sysBP: null,
          diaBP: null,
        });
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Common monitor layout heuristics
      // These are approximate positions that work for many monitors
      const w = canvas.width;
      const h = canvas.height;
      
      // HR typically in top-left (green display)
      const hrResult = extractMultiDigitNumber(imageData, w * 0.05, h * 0.1, w * 0.25, h * 0.15, 3);
      
      // SpO2 typically in top-right or middle-right (blue display)
      const spo2Result = extractMultiDigitNumber(imageData, w * 0.7, h * 0.1, w * 0.25, h * 0.15, 3);
      
      // BP typically in middle-left or middle
      const sysBPResult = extractMultiDigitNumber(imageData, w * 0.05, h * 0.35, w * 0.25, h * 0.15, 3);
      const diaBPResult = extractMultiDigitNumber(imageData, w * 0.05, h * 0.5, w * 0.25, h * 0.15, 3);
      
      resolve({
        hr: hrResult.value !== null ? hrResult : null,
        spo2: spo2Result.value !== null ? spo2Result : null,
        sysBP: sysBPResult.value !== null ? sysBPResult : null,
        diaBP: diaBPResult.value !== null ? diaBPResult : null,
      });
    };
    
    img.onerror = () => {
      resolve({
        hr: null,
        spo2: null,
        sysBP: null,
        diaBP: null,
      });
    };
    
    img.src = `data:image/jpeg;base64,${base64Image}`;
  });
}

/**
 * Validate and correct common OCR errors
 */
export function correctOCRErrors(value: string): string {
  return value
    .replace(/O/g, '0')  // O → 0
    .replace(/[Il]/g, '1') // I or l → 1
    .replace(/S/g, '5')  // S → 5
    .replace(/Z/g, '2')  // Z → 2
    .replace(/B/g, '8'); // B → 8
}

/**
 * Validate vital signs are within plausible ranges
 */
export function validateVitalRange(type: 'hr' | 'spo2' | 'sysBP' | 'diaBP', value: number): boolean {
  const ranges = {
    hr: { min: 20, max: 240 },
    spo2: { min: 50, max: 100 },
    sysBP: { min: 40, max: 250 },
    diaBP: { min: 20, max: 180 },
  };
  
  const range = ranges[type];
  return value >= range.min && value <= range.max;
}

/**
 * Clamp value to plausible range
 */
export function clampToRange(type: 'hr' | 'spo2' | 'sysBP' | 'diaBP', value: number): number {
  const ranges = {
    hr: { min: 20, max: 240 },
    spo2: { min: 50, max: 100 },
    sysBP: { min: 40, max: 250 },
    diaBP: { min: 20, max: 180 },
  };
  
  const range = ranges[type];
  return Math.max(range.min, Math.min(range.max, value));
}

/**
 * Image preprocessing utilities for medical monitor analysis
 * Optimizes images before sending to AI vision or local OCR
 */

export interface PreprocessingOptions {
  maxWidth?: number;
  quality?: number;
  grayscale?: boolean;
}

export interface PreprocessingResult {
  base64: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  sizeReduction: number; // percentage
}

/**
 * Preprocess an image for AI analysis
 * - Resize to max width (default 1280px for high accuracy)
 * - Optional grayscale for OCR
 * - Compress to JPEG quality 0.85 for readability
 */
export async function preprocessImage(
  base64Image: string,
  options: PreprocessingOptions = {}
): Promise<PreprocessingResult> {
  const {
    maxWidth = 1280,
    quality = 0.85,
    grayscale = false,
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const originalWidth = img.width;
      const originalHeight = img.height;
      
      // Calculate new dimensions
      let newWidth = originalWidth;
      let newHeight = originalHeight;
      
      if (originalWidth > maxWidth) {
        newWidth = maxWidth;
        newHeight = Math.round((originalHeight * maxWidth) / originalWidth);
      }
      
      // Create canvas for resizing
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Draw resized image
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      
      // Convert to grayscale if requested
      if (grayscale) {
        const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          // Use luminosity method for better grayscale conversion
          const gray = Math.round(
            0.299 * data[i] +     // Red
            0.587 * data[i + 1] + // Green
            0.114 * data[i + 2]   // Blue
          );
          data[i] = gray;     // Red
          data[i + 1] = gray; // Green
          data[i + 2] = gray; // Blue
          // Alpha channel (i + 3) stays the same
        }
        
        ctx.putImageData(imageData, 0, 0);
      }
      
      // Export with compression
      const processedBase64 = canvas.toDataURL('image/jpeg', quality);
      const base64Data = processedBase64.split(',')[1];
      
      // Calculate size reduction
      const originalSize = base64Image.length;
      const newSize = base64Data.length;
      const sizeReduction = Math.round(((originalSize - newSize) / originalSize) * 100);
      
      resolve({
        base64: base64Data,
        width: newWidth,
        height: newHeight,
        originalWidth,
        originalHeight,
        sizeReduction: Math.max(0, sizeReduction), // Ensure non-negative
      });
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // Load the image
    img.src = `data:image/jpeg;base64,${base64Image}`;
  });
}

/**
 * Apply adaptive thresholding for better digit detection
 * Converts image to high-contrast black & white
 */
export function applyAdaptiveThreshold(
  canvas: HTMLCanvasElement,
  blockSize: number = 15
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Calculate local thresholds
  const thresholds = new Uint8Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      // Calculate average in local block
      for (let dy = -blockSize; dy <= blockSize; dy++) {
        for (let dx = -blockSize; dx <= blockSize; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            sum += data[idx]; // Use grayscale value (R channel)
            count++;
          }
        }
      }
      
      thresholds[y * width + x] = sum / count;
    }
  }
  
  // Apply thresholding
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const value = data[i];
    const threshold = thresholds[pixelIndex];
    
    // Binary threshold with slight bias for dark text on light background
    const newValue = value < threshold - 5 ? 0 : 255;
    data[i] = newValue;
    data[i + 1] = newValue;
    data[i + 2] = newValue;
  }
  
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Sharpen image for better edge detection
 */
export function sharpenImage(canvas: HTMLCanvasElement, amount: number = 1.0): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const output = new Uint8ClampedArray(data);
  
  // Sharpen kernel (unsharp mask)
  const kernel = [
    0, -amount, 0,
    -amount, 1 + 4 * amount, -amount,
    0, -amount, 0
  ];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) { // RGB channels
        let sum = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            sum += data[idx] * kernel[kernelIdx];
          }
        }
        
        const idx = (y * width + x) * 4 + c;
        output[idx] = Math.max(0, Math.min(255, sum));
      }
    }
  }
  
  // Copy sharpened data back
  for (let i = 0; i < data.length; i += 4) {
    data[i] = output[i];
    data[i + 1] = output[i + 1];
    data[i + 2] = output[i + 2];
  }
  
  ctx.putImageData(imageData, 0, 0);
}

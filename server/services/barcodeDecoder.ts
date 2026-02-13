import sharp from 'sharp';
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  GlobalHistogramBinarizer,
} from '@zxing/library';
import logger from "../logger";

export interface DecodedBarcode {
  text: string;
  format: string;
  gtin?: string;
  lotNumber?: string;
  expiryDate?: string;
  productionDate?: string;
}

async function decodeFromBuffer(imageBuffer: Buffer): Promise<DecodedBarcode | null> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    const rgbData = new Uint8ClampedArray(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      rgbData[i * 3] = data[i * channels];
      rgbData[i * 3 + 1] = data[i * channels + 1];
      rgbData[i * 3 + 2] = data[i * channels + 2];
    }

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.CODE_128,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.PURE_BARCODE, false);

    const reader = new MultiFormatReader();
    reader.setHints(hints);

    const luminanceSource = new RGBLuminanceSource(rgbData, width, height);
    
    // Try HybridBinarizer first
    let result;
    try {
      const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
      result = reader.decode(binaryBitmap);
    } catch {
      // Try GlobalHistogramBinarizer as fallback
      const binaryBitmap2 = new BinaryBitmap(new GlobalHistogramBinarizer(luminanceSource));
      result = reader.decode(binaryBitmap2);
    }

    const barcodeText = result.getText();
    const format = BarcodeFormat[result.getBarcodeFormat()];

    logger.info(`[BarcodeDecoder] Decoded ${format}: ${barcodeText}`);

    const decoded: DecodedBarcode = {
      text: barcodeText,
      format,
    };

    if (barcodeText.startsWith('01') && barcodeText.length >= 16) {
      const parsed = parseGS1Content(barcodeText);
      decoded.gtin = parsed.gtin;
      decoded.lotNumber = parsed.lotNumber;
      decoded.expiryDate = parsed.expiryDate;
      decoded.productionDate = parsed.productionDate;
    }

    return decoded;
  } catch (error: any) {
    return null;
  }
}

function parseGS1Content(content: string): {
  gtin?: string;
  lotNumber?: string;
  expiryDate?: string;
  productionDate?: string;
} {
  const result: {
    gtin?: string;
    lotNumber?: string;
    expiryDate?: string;
    productionDate?: string;
  } = {};

  const gs1Content = content.replace(/\s/g, '');

  const gtinMatch = gs1Content.match(/01(\d{14})/);
  if (gtinMatch) {
    result.gtin = gtinMatch[1];
  }

  const expiryMatch = gs1Content.match(/17(\d{6})/);
  if (expiryMatch) {
    const yymmdd = expiryMatch[1];
    const yy = parseInt(yymmdd.substring(0, 2));
    const mm = yymmdd.substring(2, 4);
    const dd = yymmdd.substring(4, 6);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    result.expiryDate = `${year}-${mm}-${dd === '00' ? '28' : dd}`;
  }

  const prodMatch = gs1Content.match(/11(\d{6})/);
  if (prodMatch) {
    const yymmdd = prodMatch[1];
    const yy = parseInt(yymmdd.substring(0, 2));
    const mm = yymmdd.substring(2, 4);
    const dd = yymmdd.substring(4, 6);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    result.productionDate = `${year}-${mm}-${dd === '00' ? '01' : dd}`;
  }

  const lotMatch = gs1Content.match(/10([A-Za-z0-9]+?)(?=(?:17|21|11|240)|$)/);
  if (lotMatch) {
    result.lotNumber = lotMatch[1];
  }

  return result;
}

export async function tryDecodeWithMultipleStrategies(base64Image: string): Promise<DecodedBarcode | null> {
  const imageBuffer = Buffer.from(base64Image, 'base64');
  
  // Strategy 1: Original image
  let result = await decodeFromBuffer(imageBuffer);
  if (result) return result;

  // Strategy 2: Greyscale + normalize + sharpen
  try {
    const enhanced1 = await sharp(imageBuffer)
      .greyscale()
      .normalize()
      .sharpen({ sigma: 2 })
      .toBuffer();
    result = await decodeFromBuffer(enhanced1);
    if (result) {
      logger.info('[BarcodeDecoder] Decoded with greyscale+normalize+sharpen');
      return result;
    }
  } catch {}

  // Strategy 3: High contrast
  try {
    const enhanced2 = await sharp(imageBuffer)
      .greyscale()
      .linear(1.5, -50)
      .toBuffer();
    result = await decodeFromBuffer(enhanced2);
    if (result) {
      logger.info('[BarcodeDecoder] Decoded with high contrast');
      return result;
    }
  } catch {}

  // Strategy 4: Threshold (binarize)
  try {
    const enhanced3 = await sharp(imageBuffer)
      .greyscale()
      .threshold(128)
      .toBuffer();
    result = await decodeFromBuffer(enhanced3);
    if (result) {
      logger.info('[BarcodeDecoder] Decoded with threshold');
      return result;
    }
  } catch {}

  // Strategy 5: Resize larger (2x)
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const enhanced4 = await sharp(imageBuffer)
      .resize(metadata.width! * 2, metadata.height! * 2, { kernel: 'lanczos3' })
      .greyscale()
      .normalize()
      .toBuffer();
    result = await decodeFromBuffer(enhanced4);
    if (result) {
      logger.info('[BarcodeDecoder] Decoded with 2x resize');
      return result;
    }
  } catch {}

  // Strategy 6: Rotate and try (for slightly angled barcodes)
  for (const angle of [5, -5, 10, -10]) {
    try {
      const rotated = await sharp(imageBuffer)
        .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .greyscale()
        .normalize()
        .toBuffer();
      result = await decodeFromBuffer(rotated);
      if (result) {
        logger.info(`[BarcodeDecoder] Decoded with ${angle}° rotation`);
        return result;
      }
    } catch {}
  }

  logger.info('[BarcodeDecoder] No barcode found after all strategies');
  return null;
}

export async function decodeDataMatrixFromBase64(base64Image: string): Promise<DecodedBarcode | null> {
  return tryDecodeWithMultipleStrategies(base64Image);
}

import sharp from 'sharp';
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
} from '@zxing/library';

export interface DecodedBarcode {
  text: string;
  format: string;
  gtin?: string;
  lotNumber?: string;
  expiryDate?: string;
  productionDate?: string;
}

export async function decodeDataMatrixFromBase64(base64Image: string): Promise<DecodedBarcode | null> {
  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
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

    const reader = new MultiFormatReader();
    reader.setHints(hints);

    const luminanceSource = new RGBLuminanceSource(rgbData, width, height);
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

    const result = reader.decode(binaryBitmap);
    const barcodeText = result.getText();
    const format = BarcodeFormat[result.getBarcodeFormat()];

    console.log(`[BarcodeDecoder] Decoded ${format}: ${barcodeText}`);

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
    if (error.message?.includes('NotFoundException') || error.name === 'NotFoundException') {
      console.log('[BarcodeDecoder] No barcode found in image');
      return null;
    }
    console.error('[BarcodeDecoder] Error decoding barcode:', error.message || error);
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
  const originalResult = await decodeDataMatrixFromBase64(base64Image);
  if (originalResult) {
    return originalResult;
  }

  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');

    const enhancedBuffer = await sharp(imageBuffer)
      .greyscale()
      .normalize()
      .sharpen()
      .toBuffer();

    const enhancedBase64 = enhancedBuffer.toString('base64');
    const enhancedResult = await decodeDataMatrixFromBase64(enhancedBase64);
    if (enhancedResult) {
      console.log('[BarcodeDecoder] Decoded with enhanced image processing');
      return enhancedResult;
    }
  } catch (error) {
    console.log('[BarcodeDecoder] Enhanced processing failed');
  }

  return null;
}

import sharp from "sharp";

export type EnhancedImage = {
  buffer: Buffer;
  mimeType: "image/jpeg";
  filename: string;
};

/**
 * Enhances a satellite image to improve visibility of features obscured by
 * cloud cover, haze, or low contrast. Applies three passes:
 *
 * 1. CLAHE — local contrast equalization (makes details visible in shadowed/hazy zones)
 * 2. Unsharp mask — sharpens edges (rooftops, roads, water edges, craters)
 * 3. Saturation boost — makes damage spectral signatures (burn scars, fresh rubble) more distinct
 */
export async function enhanceForAnalysis(
  buffer: Buffer,
  originalFilename: string,
): Promise<EnhancedImage> {
  const enhanced = await sharp(buffer)
    .clahe({ width: 8, height: 8, maxSlope: 5 })
    .sharpen({ sigma: 2.5, m1: 1.5, m2: 6 })
    .modulate({ saturation: 1.5 })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  const base = originalFilename.replace(/\.[^.]+$/, "");

  return {
    buffer: enhanced,
    mimeType: "image/jpeg",
    filename: `${base}_enhanced.jpg`,
  };
}

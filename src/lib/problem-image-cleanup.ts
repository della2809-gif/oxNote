import sharp from "sharp";
import type { ProblemRegion } from "./types";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function cropBox(width: number, height: number, region?: ProblemRegion) {
  if (!region || region.confidence === "low") return null;
  const x = Math.max(0, Math.min(1000, region.x));
  const y = Math.max(0, Math.min(1000, region.y));
  const w = Math.max(0, Math.min(1000 - x, region.width));
  const h = Math.max(0, Math.min(1000 - y, region.height));
  if (w < 100 || h < 80) return null;

  const paddingX = Math.max(8, Math.round(width * 0.012));
  const paddingY = Math.max(8, Math.round(height * 0.012));
  const left = Math.max(0, Math.floor((x / 1000) * width) - paddingX);
  const top = Math.max(0, Math.floor((y / 1000) * height) - paddingY);
  const right = Math.min(width, Math.ceil(((x + w) / 1000) * width) + paddingX);
  const bottom = Math.min(height, Math.ceil(((y + h) / 1000) * height) + paddingY);
  return { left, top, width: right - left, height: bottom - top };
}

export async function cleanProblemImage({
  input,
  mimeType,
  problemRegion,
}: {
  input: Buffer;
  mimeType: string;
  problemRegion?: ProblemRegion;
}) {
  if (!IMAGE_TYPES.has(mimeType)) return null;

  const oriented = await sharp(input, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .toBuffer({ resolveWithObject: true });
  const box = cropBox(oriented.info.width, oriented.info.height, problemRegion);
  const source = box ? sharp(oriented.data).extract(box) : sharp(oriented.data);
  const { data, info } = await source
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Printed black is dark in every RGB channel. Colored markings have at least one
  // bright channel, so using the channel maximum weakens them without inventing text.
  const grayscale = Buffer.alloc(info.width * info.height);
  for (let sourceOffset = 0, targetOffset = 0; targetOffset < grayscale.length; sourceOffset += info.channels, targetOffset += 1) {
    grayscale[targetOffset] = Math.max(data[sourceOffset], data[sourceOffset + 1], data[sourceOffset + 2]);
  }

  const output = await sharp(grayscale, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .normalise({ lower: 2, upper: 99 })
    .sharpen({ sigma: 0.7 })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();

  return { buffer: output, width: info.width, height: info.height };
}

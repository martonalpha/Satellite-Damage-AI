import { writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const WAYBACK_CONFIG_URL =
  "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json";

interface WaybackRelease {
  id: number;
  releaseDateLabel: string;
  tileUrlTemplate: string;
}

let configCache: WaybackRelease[] | null = null;

async function getConfig(): Promise<WaybackRelease[]> {
  if (configCache) return configCache;

  const res = await fetch(WAYBACK_CONFIG_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SatelliteBDA/1.0)" },
  });

  if (!res.ok) throw new Error(`Wayback config fetch failed: ${res.status}`);

  const raw = (await res.json()) as Record<string, unknown> | Array<Record<string, unknown>>;
  const items: Array<Record<string, unknown>> = Array.isArray(raw)
    ? raw
    : Object.values(raw as Record<string, Record<string, unknown>>);

  configCache = items
    .filter((item) => typeof item.itemURL === "string" && typeof item.itemTitle === "string")
    .map((item) => {
      const itemURL = item.itemURL as string;
      const itemTitle = item.itemTitle as string;

      const idMatch = itemURL.match(/\/tile\/(\d+)\//);
      const id = idMatch ? parseInt(idMatch[1], 10) : 0;

      const dateMatch = itemTitle.match(/(\d{4}-\d{2}-\d{2})/);
      const releaseDateLabel = dateMatch ? dateMatch[1] : "";

      return { id, releaseDateLabel, tileUrlTemplate: itemURL };
    })
    .filter((item) => item.id > 0 && item.releaseDateLabel !== "");

  return configCache;
}

function findNearestRelease(releases: WaybackRelease[], targetDate: string): WaybackRelease {
  const target = new Date(targetDate).getTime();

  return releases.reduce((best, cur) => {
    const curDiff = Math.abs(new Date(cur.releaseDateLabel).getTime() - target);
    const bestDiff = Math.abs(new Date(best.releaseDateLabel).getTime() - target);
    return curDiff < bestDiff ? cur : best;
  });
}

function findLatestRelease(releases: WaybackRelease[]): WaybackRelease {
  return releases.reduce((best, cur) =>
    new Date(cur.releaseDateLabel).getTime() > new Date(best.releaseDateLabel).getTime() ? cur : best,
  );
}

function lonToTileX(lon: number, zoom: number) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
}

function lonToFloatTileX(lon: number, zoom: number) {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

function latToFloatTileY(lat: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    Math.pow(2, zoom)
  );
}

const TILE_SIZE = 256;
const ZOOM = 17;

function buildTileUrl(tileUrlTemplate: string, z: number, x: number, y: number): string {
  return tileUrlTemplate
    .replace("{level}", String(z))
    .replace("{row}", String(y))
    .replace("{col}", String(x));
}

async function fetchTile(tileUrlTemplate: string, z: number, x: number, y: number): Promise<Buffer> {
  const url = buildTileUrl(tileUrlTemplate, z, x, y);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SatelliteBDA/1.0)",
        Referer: "https://livingatlas.arcgis.com/",
      },
    });

    if (!res.ok) throw new Error(`tile ${z}/${x}/${y} → HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return await sharp({
      create: {
        width: TILE_SIZE,
        height: TILE_SIZE,
        channels: 3,
        background: { r: 25, g: 25, b: 25 },
      },
    })
      .jpeg()
      .toBuffer();
  }
}

export async function downloadWaybackImage({
  lat,
  lon,
  bboxSizeMeters = 1000,
  outputPath,
  targetDate,
  useLatest = false,
  outputWidth = 1024,
  outputHeight = 1024,
}: {
  lat: number;
  lon: number;
  bboxSizeMeters?: number;
  outputPath: string;
  targetDate: string;
  useLatest?: boolean;
  outputWidth?: number;
  outputHeight?: number;
}): Promise<{ bytes: number; outputPath: string; releaseDate: string }> {
  const config = await getConfig();
  const release = useLatest ? findLatestRelease(config) : findNearestRelease(config, targetDate);

  const halfM = bboxSizeMeters / 2;
  const latDelta = halfM / 111_320;
  const lonDelta = halfM / (111_320 * Math.cos((lat * Math.PI) / 180));

  const north = lat + latDelta;
  const south = lat - latDelta;
  const west = lon - lonDelta;
  const east = lon + lonDelta;

  const minTX = lonToTileX(west, ZOOM);
  const maxTX = lonToTileX(east, ZOOM);
  const minTY = latToTileY(north, ZOOM);
  const maxTY = latToTileY(south, ZOOM);

  const cols = maxTX - minTX + 1;
  const rows = maxTY - minTY + 1;

  const downloads: Array<Promise<{ input: Buffer; left: number; top: number }>> = [];
  for (let ty = minTY; ty <= maxTY; ty++) {
    for (let tx = minTX; tx <= maxTX; tx++) {
      downloads.push(
        fetchTile(release.tileUrlTemplate, ZOOM, tx, ty).then((input) => ({
          input,
          left: (tx - minTX) * TILE_SIZE,
          top: (ty - minTY) * TILE_SIZE,
        })),
      );
    }
  }

  const composites = await Promise.all(downloads);

  const stitchedWidth = cols * TILE_SIZE;
  const stitchedHeight = rows * TILE_SIZE;

  const nwFX = lonToFloatTileX(west, ZOOM);
  const nwFY = latToFloatTileY(north, ZOOM);
  const seFX = lonToFloatTileX(east, ZOOM);
  const seFY = latToFloatTileY(south, ZOOM);

  const cropLeft = Math.max(0, Math.round((nwFX - minTX) * TILE_SIZE));
  const cropTop = Math.max(0, Math.round((nwFY - minTY) * TILE_SIZE));
  const cropRight = Math.min(stitchedWidth, Math.round((seFX - minTX) * TILE_SIZE));
  const cropBottom = Math.min(stitchedHeight, Math.round((seFY - minTY) * TILE_SIZE));
  const cropW = Math.max(1, cropRight - cropLeft);
  const cropH = Math.max(1, cropBottom - cropTop);

  const centerFX = lonToFloatTileX(lon, ZOOM);
  const centerFY = latToFloatTileY(lat, ZOOM);
  const centerInCropX = (centerFX - minTX) * TILE_SIZE - cropLeft;
  const centerInCropY = (centerFY - minTY) * TILE_SIZE - cropTop;

  const cx = Math.round((centerInCropX / cropW) * outputWidth);
  const cy = Math.round((centerInCropY / cropH) * outputHeight);
  const r = Math.round(outputWidth * 0.055);

  const svgCircle = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ff2222" stroke-width="2.5" opacity="0.85"/>
  </svg>`;

  const stitched = await sharp({
    create: {
      width: stitchedWidth,
      height: stitchedHeight,
      channels: 3,
      background: { r: 20, g: 20, b: 20 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const result = await sharp(stitched)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .resize(outputWidth, outputHeight, { fit: "fill" })
    .composite([{ input: Buffer.from(svgCircle), blend: "over" }])
    .png()
    .toBuffer();

  const encoded =
    path.extname(outputPath).toLowerCase() === ".webp"
      ? await sharp(result).webp({ quality: 78 }).toBuffer()
      : result;

  await writeFile(outputPath, encoded);

  return { bytes: encoded.byteLength, outputPath, releaseDate: release.releaseDateLabel };
}

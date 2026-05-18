import { writeFile } from "node:fs/promises";

import sharp from "sharp";

import { getSentinelHubConfig } from "@/lib/sentinel/config";
import type { BBox } from "@/lib/satellite/types";

const TRUE_COLOR_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B04", "B03", "B02", "dataMask"],
    output: { bands: 4 }
  };
}
function evaluatePixel(sample) {
  return [
    2.5 * sample.B04,
    2.5 * sample.B03,
    2.5 * sample.B02,
    sample.dataMask
  ];
}`;

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function downloadSentinel2TrueColorPng({
  bbox,
  fromDate,
  height = 1024,
  maxCloudCoverage = 0.3,
  outputPath,
  toDate,
  width = 1024,
}: {
  bbox: BBox;
  fromDate: string;
  toDate: string;
  outputPath: string;
  width?: number;
  height?: number;
  maxCloudCoverage?: number;
}) {
  const config = getSentinelHubConfig();
  const token = await getAccessToken();
  const response = await fetch(`${config.baseUrl}/api/v1/process`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({
      input: {
        bounds: {
          bbox,
          properties: {
            crs: "http://www.opengis.net/def/crs/EPSG/0/4326",
          },
        },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: {
                from: fromDate,
                to: toDate,
              },
              maxCloudCoverage: normalizeCloudCoverage(maxCloudCoverage),
            },
            processing: {
              upsampling: "BICUBIC",
              downsampling: "BICUBIC",
            },
          },
        ],
      },
      output: {
        width,
        height,
        responses: [
          {
            identifier: "default",
            format: {
              type: "image/png",
            },
          },
        ],
      },
      evalscript: TRUE_COLOR_EVALSCRIPT,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Sentinel Hub Process API failed with HTTP ${response.status}: ${message.slice(0, 240)}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.byteLength < 1000) {
    throw new Error("Sentinel Hub returned an unexpectedly small PNG response.");
  }

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.round(width * 0.055);
  const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ff2222" stroke-width="2.5" opacity="0.85"/>
  </svg>`;

  const sharpened = await sharp(buffer)
    .sharpen({ sigma: 0.6, m1: 0.5, m2: 1.5 })
    .composite([{ input: Buffer.from(svgOverlay), blend: "over" }])
    .toBuffer();

  await writeFile(outputPath, sharpened);

  return {
    bytes: sharpened.byteLength,
    outputPath,
  };
}

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }

  const config = getSentinelHubConfig();
  const response = await requestToken(`${config.baseUrl}/oauth/token`).then(async (result) => {
    if (result.ok) {
      return result;
    }

    return requestToken(`${config.baseUrl}/auth/realms/main/protocol/openid-connect/token`);
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Sentinel Hub OAuth request failed with HTTP ${response.status}: ${message.slice(0, 240)}`,
    );
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    throw new Error("Sentinel Hub OAuth response did not include an access token.");
  }

  tokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 300) * 1000,
  };

  return tokenCache.token;
}

function requestToken(url: string) {
  const config = getSentinelHubConfig();

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
}

function normalizeCloudCoverage(value: number) {
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

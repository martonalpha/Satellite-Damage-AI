import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const RECORD_ID = "14811504";
const RECORD_API_URL = `https://zenodo.org/api/records/${RECORD_ID}`;
const PUBLIC_DIR = "/data/zenodo/ukraine-damage";
const DISK_DIR = path.join(process.cwd(), "public", "data", "zenodo", "ukraine-damage");

const FILES = {
  unosat_labels: {
    fileName: "unosat_labels.geojson",
    description: "UNOSAT building-level damage labels from the Ukraine damage mapping dataset.",
  },
  unosat_aois: {
    fileName: "unosat_aois.geojson",
    description: "UNOSAT areas of interest from the Ukraine damage mapping dataset.",
  },
  admin3_damage: {
    fileName: "n_buildings_damaged_adm3_t0_655.geojson",
    description: "Administrative-area aggregated damaged building counts.",
  },
} as const;

type UkraineDamageFileKey = keyof typeof FILES;

type ZenodoRecord = {
  id: number;
  title?: string;
  conceptdoi?: string;
  doi?: string;
  files?: Array<{
    key?: string;
    size?: number;
    links?: {
      self?: string;
    };
  }>;
};

export async function importUkraineDamageFile(file: string | null) {
  const fileKey = normalizeFileKey(file);
  const selected = FILES[fileKey];
  const record = await fetchZenodoRecord();
  const recordFile = record.files?.find((item) => item.key === selected.fileName);
  const downloadUrl = recordFile?.links?.self;

  if (!downloadUrl) {
    throw new Error(`Zenodo file was not found: ${selected.fileName}`);
  }

  const response = await fetch(downloadUrl, {
    headers: {
      Accept: "application/geo+json,application/json,*/*",
      "User-Agent": "after-map-zenodo-import/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Zenodo file download failed with HTTP ${response.status}.`);
  }

  const text = await response.text();
  const parsed = JSON.parse(text) as { type?: unknown; features?: unknown[] };

  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`${selected.fileName} is not a GeoJSON FeatureCollection.`);
  }

  await mkdir(DISK_DIR, { recursive: true });

  const outputPath = path.join(DISK_DIR, selected.fileName);
  const metadataPath = path.join(DISK_DIR, `${selected.fileName}.metadata.json`);
  const publicPath = `${PUBLIC_DIR}/${selected.fileName}`;

  await writeFile(outputPath, JSON.stringify(parsed), "utf8");
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        source: "Zenodo / Ukraine Damage Mapping Tool",
        recordId: RECORD_ID,
        recordUrl: `https://zenodo.org/records/${RECORD_ID}`,
        doi: record.doi ?? record.conceptdoi ?? null,
        title: record.title ?? "Ukraine Damage Mapping Tool dataset",
        file: {
          key: fileKey,
          name: selected.fileName,
          description: selected.description,
          size: recordFile?.size ?? text.length,
          url: downloadUrl,
        },
        importedAt: new Date().toISOString(),
        featureCount: parsed.features.length,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    source: "Zenodo / Ukraine Damage Mapping Tool",
    recordId: RECORD_ID,
    recordUrl: `https://zenodo.org/records/${RECORD_ID}`,
    file: {
      key: fileKey,
      name: selected.fileName,
      description: selected.description,
    },
    featureCount: parsed.features.length,
    saved: {
      filePath: outputPath,
      metadataPath,
      publicPath,
    },
  };
}

export function getUkraineDamageImportOptions() {
  return Object.entries(FILES).map(([key, value]) => ({
    key,
    ...value,
  }));
}

async function fetchZenodoRecord() {
  const response = await fetch(RECORD_API_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "after-map-zenodo-import/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Zenodo metadata request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as ZenodoRecord;
}

function normalizeFileKey(file: string | null): UkraineDamageFileKey {
  if (!file) {
    return "unosat_labels";
  }

  if (file in FILES) {
    return file as UkraineDamageFileKey;
  }

  throw new Error(
    `Unsupported Ukraine damage file. Use one of: ${Object.keys(FILES).join(", ")}.`,
  );
}

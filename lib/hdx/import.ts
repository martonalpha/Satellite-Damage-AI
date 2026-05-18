import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import shp from "shpjs";

type HdxPackageResponse = {
  success: boolean;
  result?: HdxPackage;
  error?: { message?: string };
};

type HdxPackage = {
  id: string;
  name: string;
  title?: string;
  resources: HdxResource[];
};

type HdxResource = {
  id: string;
  name?: string;
  description?: string;
  format?: string;
  mimetype?: string;
  url?: string;
};

type GeoJsonFeature = {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry?: Record<string, unknown> | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
  properties?: Record<string, unknown>;
};

export type HdxImportResult = {
  dataset: {
    id: string;
    name: string;
    title: string;
  };
  resource: {
    id: string;
    name: string;
    format: string;
    url: string;
  };
  featureCount: number;
  geojson: GeoJsonFeatureCollection;
  saved?: {
    filePath: string;
    publicPath: string;
    metadataPath: string;
  };
};

export async function importHdxShapefile({
  dataset,
  persist = true,
}: {
  dataset: string;
  persist?: boolean;
}): Promise<HdxImportResult> {
  const datasetId = normalizeDatasetId(dataset);
  const metadata = await fetchHdxPackage(datasetId);
  const resource = selectShapefileResource(metadata.resources);

  if (!resource?.url) {
    throw new Error(
      "No downloadable ZIP/SHP resource was found for this HDX dataset.",
    );
  }

  const zipBuffer = await downloadResource(resource.url);
  const parsed = await shp(zipBuffer);
  const geojson = normalizeGeoJson(parsed);
  const result: HdxImportResult = {
    dataset: {
      id: metadata.id,
      name: metadata.name,
      title: metadata.title ?? metadata.name,
    },
    resource: {
      id: resource.id,
      name: resource.name ?? resource.id,
      format: resource.format ?? "",
      url: resource.url,
    },
    featureCount: geojson.features.length,
    geojson,
  };

  if (persist) {
    result.saved = await saveGeoJson(metadata, resource, geojson);
  }

  return result;
}

export async function getHdxPackageResources(dataset: string) {
  const metadata = await fetchHdxPackage(normalizeDatasetId(dataset));

  return {
    dataset: {
      id: metadata.id,
      name: metadata.name,
      title: metadata.title ?? metadata.name,
    },
    resources: metadata.resources.map((resource) => ({
      id: resource.id,
      name: resource.name ?? resource.id,
      format: resource.format ?? "",
      mimetype: resource.mimetype ?? "",
      url: resource.url ?? "",
      selected: resource.id === selectShapefileResource(metadata.resources)?.id,
    })),
  };
}

async function fetchHdxPackage(datasetId: string) {
  const url = `https://data.humdata.org/api/3/action/package_show?id=${encodeURIComponent(
    datasetId,
  )}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "after-map-hdx-import/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`HDX metadata request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as HdxPackageResponse;

  if (!payload.success || !payload.result) {
    throw new Error(payload.error?.message ?? "HDX metadata request failed.");
  }

  return payload.result;
}

function selectShapefileResource(resources: HdxResource[]) {
  const scored = resources
    .filter((resource) => resource.url)
    .map((resource) => ({
      resource,
      score: getResourceScore(resource),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.resource ?? null;
}

function getResourceScore(resource: HdxResource) {
  const haystack = [
    resource.name,
    resource.description,
    resource.format,
    resource.mimetype,
    resource.url,
  ]
    .join(" ")
    .toLowerCase();
  let score = 0;

  if (haystack.includes(".zip")) score += 8;
  if (haystack.includes("zip")) score += 5;
  if (haystack.includes("shp")) score += 6;
  if (haystack.includes("shape")) score += 4;
  if (haystack.includes("geojson")) score -= 2;
  if (haystack.includes("pdf")) score -= 10;
  if (haystack.includes("jpg") || haystack.includes("png")) score -= 8;

  return score;
}

async function downloadResource(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/zip,application/octet-stream,*/*",
      "User-Agent": "after-map-hdx-import/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`HDX resource download failed with HTTP ${response.status}.`);
  }

  return response.arrayBuffer();
}

function normalizeGeoJson(input: unknown): GeoJsonFeatureCollection {
  if (Array.isArray(input)) {
    return {
      type: "FeatureCollection",
      features: input.flatMap((item) => {
        const collection = normalizeGeoJson(item);
        const layerName = typeof item === "object" && item && "fileName" in item
          ? String((item as { fileName?: unknown }).fileName)
          : null;

        return collection.features.map((feature) => ({
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            ...(layerName ? { sourceLayer: layerName } : {}),
          },
        }));
      }),
    };
  }

  if (
    input &&
    typeof input === "object" &&
    (input as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((input as { features?: unknown }).features)
  ) {
    return input as GeoJsonFeatureCollection;
  }

  throw new Error("The shapefile did not produce a GeoJSON FeatureCollection.");
}

async function saveGeoJson(
  dataset: HdxPackage,
  resource: HdxResource,
  geojson: GeoJsonFeatureCollection,
) {
  const datasetSlug = safeFileName(dataset.name);
  const resourceSlug = safeFileName(resource.name ?? resource.id);
  const outputDir = path.join(process.cwd(), "public", "data", "hdx", datasetSlug);
  const outputFile = `${resourceSlug || "resource"}.geojson`;
  const metadataFile = `${resourceSlug || "resource"}.metadata.json`;
  const outputPath = path.join(outputDir, outputFile);
  const metadataPath = path.join(outputDir, metadataFile);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, JSON.stringify(geojson), "utf8");
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        dataset: {
          id: dataset.id,
          name: dataset.name,
          title: dataset.title ?? dataset.name,
        },
        resource: {
          id: resource.id,
          name: resource.name ?? resource.id,
          format: resource.format ?? "",
          url: resource.url ?? "",
        },
        importedAt: new Date().toISOString(),
        featureCount: geojson.features.length,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    filePath: outputPath,
    metadataPath,
    publicPath: `/data/hdx/${datasetSlug}/${outputFile}`,
  };
}

function normalizeDatasetId(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Dataset id or HDX dataset URL is required.");
  }

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const datasetIndex = parts.findIndex((part) => part === "dataset");
    const datasetSlug = datasetIndex >= 0 ? parts[datasetIndex + 1] : parts.at(-1);

    if (datasetSlug) {
      return datasetSlug;
    }
  } catch {
    // Not a URL; use it as a CKAN package id/name.
  }

  return trimmed;
}

function safeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

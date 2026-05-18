import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createBBoxAroundCoordinate, getGeometryCentroid } from "@/lib/satellite/bbox";
import { selectBeforeAfterDates } from "@/lib/satellite/dateSelection";
import { downloadWaybackImage } from "@/lib/satellite/wayback";
import type {
  FailedSatelliteCase,
  GeneratedSatelliteCase,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  NormalizedFeatureProperties,
  SatelliteGenerateRequest,
  SatelliteGenerateResult,
} from "@/lib/satellite/types";

const CASES_PUBLIC_DIR = "/data/generated-cases";
const CASES_DISK_DIR = path.join(process.cwd(), "public", "data", "generated-cases");
const CASE_IMAGE_EXTENSION = "webp";
const GENERATOR_STATE_FILE = path.join(CASES_DISK_DIR, "generator_state.json");
const DEFAULT_GEOJSON_URL =
  "/data/zenodo/ukraine-damage/unosat_labels.geojson";
const DEFAULT_DAMAGE_CLASSES = [
  "Destroyed",
  "Severely Damaged",
  "destroyed",
  "severely damaged",
  "severely_damaged",
];
const DEFAULT_BBOX_SIZE_METERS = 1200;
type SelectableFeature = {
  feature: GeoJsonFeature;
  normalized: NormalizedFeatureProperties;
};

type SelectionMetadata = {
  strategy: "diverse" | "sequential";
  startOffset: number;
  nextOffset: number;
  totalAvailable: number;
};

type GeneratorState = {
  cursors?: Record<string, number>;
};

export async function generateSatelliteCases(
  request: SatelliteGenerateRequest,
): Promise<SatelliteGenerateResult> {

  const geojsonUrl = request.geojsonUrl || DEFAULT_GEOJSON_URL;
  const geojson = await readLocalGeoJson(geojsonUrl);
  const damageClasses = request.filter?.damageClasses ?? DEFAULT_DAMAGE_CLASSES;
  await mkdir(CASES_DISK_DIR, { recursive: true });

  const selection = await selectFeatures(
    geojson.features,
    damageClasses,
    request.limit ?? 10,
    request.bboxSizeMeters ?? DEFAULT_BBOX_SIZE_METERS,
    geojsonUrl,
    request,
  );
  const selected = selection.items;

  if (selected.length === 0) {
    throw new Error("No GeoJSON features were available for case generation.");
  }

  const cases: GeneratedSatelliteCase[] = [];
  const failed: FailedSatelliteCase[] = [];
  const batchId = createBatchId();

  for (const item of selected) {
    const caseId = `${getCasePrefix(geojsonUrl)}-${batchId}-case-${String(cases.length + failed.length + 1).padStart(4, "0")}`;

    try {
      const generated = await buildSingleCase({
        caseId,
        feature: item.feature,
        geojsonUrl,
        index: cases.length + failed.length + 1,
        normalized: item.normalized,
        request,
      });
      cases.push(generated);
    } catch (error) {
      const centroid = getGeometryCentroid(item.feature.geometry);
      failed.push({
        id: caseId,
        reason: error instanceof Error ? error.message : "Case generation failed.",
        featureProperties: item.feature.properties ?? {},
        lat: centroid?.lat ?? 0,
        lon: centroid?.lon ?? 0,
      });
    }
  }

  await writeJson(path.join(CASES_DISK_DIR, "cases.json"), cases);
  await writeJson(path.join(CASES_DISK_DIR, "failed_cases.json"), failed);

  return {
    ok: true,
    generated: cases.length,
    failed: failed.length,
    casesJsonUrl: `${CASES_PUBLIC_DIR}/cases.json`,
    selection: selection.metadata,
    cases,
  };
}

export async function readGeneratedCases() {
  try {
    const raw = await readFile(path.join(CASES_DISK_DIR, "cases.json"), "utf8");
    return JSON.parse(raw) as GeneratedSatelliteCase[];
  } catch {
    return [];
  }
}

async function buildSingleCase({
  caseId,
  feature,
  geojsonUrl,
  index,
  normalized,
  request,
}: {
  caseId: string;
  feature: GeoJsonFeature;
  geojsonUrl: string;
  index: number;
  normalized: NormalizedFeatureProperties;
  request: SatelliteGenerateRequest;
}) {
  const centroid = getGeometryCentroid(feature.geometry);

  if (!centroid) {
    throw new Error("Unsupported or empty geometry.");
  }

  const bboxSizeMeters = request.bboxSizeMeters ?? DEFAULT_BBOX_SIZE_METERS;
  const bbox = createBBoxAroundCoordinate(centroid.lon, centroid.lat, bboxSizeMeters);
  const dates = selectBeforeAfterDates({
    beforeDate: request.beforeDate,
    afterDate: request.afterDate,
    feature: normalized,
  });
  const caseDir = path.join(CASES_DISK_DIR, caseId);
  const beforePath = path.join(caseDir, `before.${CASE_IMAGE_EXTENSION}`);
  const afterPath = path.join(caseDir, `after.${CASE_IMAGE_EXTENSION}`);

  await mkdir(caseDir, { recursive: true });

  const [beforeResult, afterResult] = await Promise.all([
    downloadWaybackImage({
      lat: centroid.lat,
      lon: centroid.lon,
      bboxSizeMeters,
      outputPath: beforePath,
      targetDate: dates.beforeDate,
    }),
    downloadWaybackImage({
      lat: centroid.lat,
      lon: centroid.lon,
      bboxSizeMeters,
      outputPath: afterPath,
      targetDate: dates.afterDate,
      useLatest: true,
    }),
  ]);

  const metadata: GeneratedSatelliteCase = {
    id: caseId,
    title: `${getCaseTitlePrefix(geojsonUrl)} case ${String(index).padStart(4, "0")}`,
    label: normalized.damageLabel ?? "Damage assessment",
    location: normalized.locationName ?? "Ukraine damage verification area",
    lat: centroid.lat,
    lon: centroid.lon,
    bbox,
    beforeDate: beforeResult.releaseDate,
    afterDate: afterResult.releaseDate,
    beforeImage: `${CASES_PUBLIC_DIR}/${caseId}/before.${CASE_IMAGE_EXTENSION}`,
    afterImage: `${CASES_PUBLIC_DIR}/${caseId}/after.${CASE_IMAGE_EXTENSION}`,
    sourceDataset: getSourceDatasetLabel(geojsonUrl),
    sourceGeojson: geojsonUrl,
    satelliteSource: "Esri World Imagery Wayback (Maxar/Nearmap ~0.4m/pixel)",
    usageNote:
      "UNOSAT damage labels combined with Esri World Imagery Wayback tiles for high-resolution before/after comparison.",
    confidenceNote:
      "Imagery sourced from Esri World Imagery basemap archive (~0.4m/pixel at zoom 18). Building-level damage should be visible for structures ≥20m.",
    generatedAt: new Date().toISOString(),
    bboxSizeMeters,
    properties: {
      originalFeatureProperties: feature.properties ?? {},
      normalized,
    },
  };

  await writeJson(path.join(caseDir, "metadata.json"), metadata);

  return metadata;
}

function createBatchId() {
  return new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
}

function getCasePrefix(geojsonUrl: string) {
  if (geojsonUrl.includes("/zenodo/ukraine-damage/")) {
    return "ukraine-damage";
  }

  if (geojsonUrl.includes("mariupol")) {
    return "mariupol";
  }

  return "satellite-context";
}

function getCaseTitlePrefix(geojsonUrl: string) {
  if (geojsonUrl.includes("/zenodo/ukraine-damage/")) {
    return "Ukraine damage";
  }

  if (geojsonUrl.includes("mariupol")) {
    return "Mariupol damage";
  }

  return "Satellite context";
}

function getSourceDatasetLabel(geojsonUrl: string) {
  if (geojsonUrl.includes("/zenodo/ukraine-damage/")) {
    return "Zenodo / Ukraine Damage Mapping Tool / UNOSAT Labels";
  }

  return "HDX / UNOSAT Damage Assessment";
}


async function selectFeatures(
  features: GeoJsonFeature[],
  damageClasses: string[],
  limit: number,
  bboxSizeMeters: number,
  geojsonUrl: string,
  request: SatelliteGenerateRequest,
): Promise<{ items: SelectableFeature[]; metadata: SelectionMetadata }> {
  const boundedLimit = Math.max(1, Math.min(limit, 50));
  const normalizedClasses = damageClasses.map(normalizeString);
  const inspected = features
    .map((feature) => ({
      feature,
      normalized: inspectFeatureProperties(feature.properties ?? {}),
    }))
    .filter((item) => getGeometryCentroid(item.feature.geometry));
  const hasDamageField = inspected.some((item) => item.normalized.damageField);
  const filtered = hasDamageField
    ? inspected.filter(
        (item) =>
          item.normalized.damageLabel &&
          normalizedClasses.includes(normalizeString(item.normalized.damageLabel)),
      )
    : inspected.map((item) => ({
        ...item,
        normalized: {
          ...item.normalized,
          warnings: [
            ...item.normalized.warnings,
            "No damage class field was detected; this case was selected by feature order.",
          ],
        },
      }));

  if (request.selection?.strategy === "sequential") {
    return selectSequentialFeatures(
      filtered,
      boundedLimit,
      createSelectionCursorKey({ geojsonUrl, damageClasses, bboxSizeMeters, request }),
      Boolean(request.selection.resetCursor),
    );
  }

  const shuffled = shuffleArray(filtered);

  return {
    items: selectDiverseFeatures(shuffled, boundedLimit, bboxSizeMeters),
    metadata: {
      strategy: "diverse",
      startOffset: 0,
      nextOffset: 0,
      totalAvailable: filtered.length,
    },
  };
}

async function selectSequentialFeatures(
  items: SelectableFeature[],
  limit: number,
  cursorKey: string,
  resetCursor: boolean,
): Promise<{ items: SelectableFeature[]; metadata: SelectionMetadata }> {
  if (items.length === 0) {
    return {
      items: [],
      metadata: {
        strategy: "sequential",
        startOffset: 0,
        nextOffset: 0,
        totalAvailable: 0,
      },
    };
  }

  const state = resetCursor ? { cursors: {} } : await readGeneratorState();
  const cursors = state.cursors ?? {};
  const startOffset = resetCursor ? 0 : normalizeCursor(cursors[cursorKey] ?? 0, items.length);
  const selected = takeSequentialItems(items, startOffset, Math.min(limit, items.length));
  const nextOffset = normalizeCursor(startOffset + selected.length, items.length);

  cursors[cursorKey] = nextOffset;
  await writeJson(GENERATOR_STATE_FILE, { ...state, cursors });

  return {
    items: selected,
    metadata: {
      strategy: "sequential",
      startOffset,
      nextOffset,
      totalAvailable: items.length,
    },
  };
}

function takeSequentialItems<T>(items: T[], startOffset: number, limit: number) {
  return Array.from({ length: limit }, (_, index) => items[(startOffset + index) % items.length]);
}

function normalizeCursor(value: number, itemCount: number) {
  if (itemCount <= 0) {
    return 0;
  }

  return ((Math.trunc(value) % itemCount) + itemCount) % itemCount;
}

async function readGeneratorState(): Promise<GeneratorState> {
  try {
    const raw = await readFile(GENERATOR_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as GeneratorState;

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function createSelectionCursorKey({
  geojsonUrl,
  damageClasses,
  bboxSizeMeters,
  request,
}: {
  geojsonUrl: string;
  damageClasses: string[];
  bboxSizeMeters: number;
  request: SatelliteGenerateRequest;
}) {
  const explicitKey = request.selection?.cursorKey
    ? `custom:${request.selection.cursorKey}`
    : "default";

  return [
    geojsonUrl,
    explicitKey,
    damageClasses.map(normalizeString).sort().join("|"),
    bboxSizeMeters,
  ].join("::");
}

function selectDiverseFeatures(
  items: SelectableFeature[],
  limit: number,
  bboxSizeMeters: number,
) {
  const selected: SelectableFeature[] = [];
  const usedGroups = new Set<string>();
  const minDistanceMeters = Math.max(2_500, bboxSizeMeters * 0.9);

  for (const item of items) {
    if (selected.length >= limit) {
      break;
    }

    const group = getFeatureDiversityGroup(item);

    if (usedGroups.has(group)) {
      continue;
    }

    selected.push(item);
    usedGroups.add(group);
  }

  for (const item of items) {
    if (selected.length >= limit) {
      break;
    }

    if (isFarEnoughFromSelected(item, selected, minDistanceMeters)) {
      selected.push(item);
    }
  }

  for (const item of items) {
    if (selected.length >= limit) {
      break;
    }

    if (!selected.includes(item)) {
      selected.push(item);
    }
  }

  return selected;
}

function getFeatureDiversityGroup(item: {
  feature: GeoJsonFeature;
  normalized: NormalizedFeatureProperties;
}) {
  const props = item.feature.properties ?? {};

  return normalizeString(
    item.normalized.locationName ??
      stringifyValue(props.layer) ??
      stringifyValue(props.sourceLayer) ??
      stringifyValue(props.aoi) ??
      "unknown",
  );
}

function isFarEnoughFromSelected(
  item: { feature: GeoJsonFeature; normalized: NormalizedFeatureProperties },
  selected: Array<{ feature: GeoJsonFeature; normalized: NormalizedFeatureProperties }>,
  minDistanceMeters: number,
) {
  const centroid = getGeometryCentroid(item.feature.geometry);

  if (!centroid) {
    return false;
  }

  return selected.every((selectedItem) => {
    const selectedCentroid = getGeometryCentroid(selectedItem.feature.geometry);

    if (!selectedCentroid) {
      return true;
    }

    return distanceMeters(centroid, selectedCentroid) >= minDistanceMeters;
  });
}

function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const radius = 6_371_000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;

  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function inspectFeatureProperties(
  properties: Record<string, unknown>,
): NormalizedFeatureProperties {
  const damageField = findField(properties, [
    "damage",
    "dmg",
    "main_damag",
    "main_damage",
    "main_dam",
    "damage_class",
    "dmg_class",
    "damage_typ",
    "dmg_type",
    "status",
    "class",
    "category",
    "damage_sta",
    "damage_lev",
    "damage_s",
  ]);
  const objectIdField = findField(properties, [
    "objectid",
    "object_id",
    "unosat_id",
    "id",
    "fid",
    "uuid",
  ]);
  const locationField = findField(properties, [
    "location",
    "loc",
    "city",
    "district",
    "name",
    "admin",
    "admin3",
    "settlement",
    "neighborho",
    "neighborhood",
    "country",
  ]);
  const dateField = findField(properties, [
    "sensor_date",
    "sensordate",
    "sensor_da",
    "imagery_da",
    "image_date",
    "acq_date",
    "analysis_d",
    "date",
    "obs_date",
  ]);
  const confidenceField = findField(properties, ["confidence", "conf", "certainty"]);
  const notesField = findField(properties, ["notes", "note", "comments", "comment", "remarks"]);

  return {
    damageField,
    damageLabel: resolveDamageLabel(damageField, damageField ? properties[damageField] : null),
    objectId: stringifyValue(objectIdField ? properties[objectIdField] : null),
    locationName: buildLocationName(properties, locationField),
    imageryDate: stringifyValue(dateField ? properties[dateField] : null),
    confidence: stringifyValue(confidenceField ? properties[confidenceField] : null),
    notes: stringifyValue(notesField ? properties[notesField] : null),
    warnings: damageField ? [] : ["No damage class field detected."],
  };
}

function buildLocationName(properties: Record<string, unknown>, fallbackField: string | null) {
  const settlementField = findField(properties, ["settlement", "city"]);
  const neighborhoodField = findField(properties, ["neighborho", "neighborhood", "district"]);
  const parts = [
    stringifyValue(neighborhoodField ? properties[neighborhoodField] : null),
    stringifyValue(settlementField ? properties[settlementField] : null),
  ].filter(Boolean);

  if (parts.length > 0) {
    return `${parts.join(", ")}, Ukraine`;
  }

  return stringifyValue(fallbackField ? properties[fallbackField] : null);
}

function findField(properties: Record<string, unknown>, candidates: string[]) {
  const entries = Object.keys(properties).map((key) => ({
    key,
    normalized: normalizeFieldName(key),
  }));

  for (const candidate of candidates.map(normalizeFieldName)) {
    const exact = entries.find((entry) => entry.normalized === candidate);

    if (exact) {
      return exact.key;
    }
  }

  for (const candidate of candidates.map(normalizeFieldName)) {
    const partial = entries.find((entry) => entry.normalized.includes(candidate));

    if (partial) {
      return partial.key;
    }
  }

  return null;
}

async function readLocalGeoJson(geojsonUrl: string) {
  if (!geojsonUrl.startsWith("/data/hdx/") && !geojsonUrl.startsWith("/data/zenodo/")) {
    throw new Error("Only local GeoJSON URLs under /data/hdx/ or /data/zenodo/ are allowed.");
  }

  const publicRoot = path.join(process.cwd(), "public");
  const filePath = path.normalize(path.join(publicRoot, geojsonUrl));

  if (!filePath.startsWith(publicRoot)) {
    throw new Error("Invalid GeoJSON path.");
  }

  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as GeoJsonFeatureCollection;

  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("GeoJSON file must be a FeatureCollection.");
  }

  return parsed;
}

function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeString(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function resolveDamageLabel(field: string | null, value: unknown) {
  const raw = stringifyValue(value);

  if (!raw) {
    return null;
  }

  const fieldName = field ? normalizeFieldName(field) : "";
  const numericCode = Number(raw);

  if (
    Number.isFinite(numericCode) &&
    (fieldName.includes("maindamag") ||
      fieldName === "damage" ||
      fieldName.includes("damage") ||
      fieldName.includes("dmg") ||
      fieldName.includes("maindam") ||
      fieldName.includes("damagesta") ||
      fieldName.includes("damages"))
  ) {
    return (
      {
        0: "No visible damage / unknown",
        1: "Possible Damage",
        2: "Moderate Damage",
        3: "Severely Damaged",
        4: "Destroyed",
        5: "Destroyed",
        6: "Damage assessment",
        7: "Damage assessment",
        14: "Damage assessment",
      } as Record<number, string>
    )[numericCode] ?? `Damage code ${raw}`;
  }

  return raw;
}

function normalizeFieldName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

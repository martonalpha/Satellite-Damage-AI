export type BBox = [number, number, number, number];

export type SatelliteCollection = "SENTINEL2_L2A";

export type GeoJsonFeature = {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry?: GeoJsonGeometry | null;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type GeoJsonGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: Array<Array<[number, number]>> }
  | { type: "MultiPolygon"; coordinates: Array<Array<Array<[number, number]>>> };

export type NormalizedFeatureProperties = {
  damageLabel: string | null;
  damageField: string | null;
  objectId: string | null;
  locationName: string | null;
  imageryDate: string | null;
  confidence: string | null;
  notes: string | null;
  warnings: string[];
};

export type SatelliteGenerateRequest = {
  geojsonUrl: string;
  limit?: number;
  bboxSizeMeters?: number;
  beforeDate?: string;
  afterDate?: string;
  selection?: {
    strategy?: "diverse" | "sequential";
    cursorKey?: string;
    resetCursor?: boolean;
  };
  filter?: {
    damageClasses?: string[];
  };
  imagery?: {
    collection?: SatelliteCollection;
    maxCloudCoverage?: number;
    dateWindowDays?: number;
    fallbackDateWindowDays?: number;
  };
};

export type GeneratedSatelliteCase = {
  id: string;
  title: string;
  label: string;
  location: string;
  lat: number;
  lon: number;
  bbox: BBox;
  beforeDate: string;
  afterDate: string;
  beforeImage: string;
  afterImage: string;
  sourceDataset: string;
  sourceGeojson: string;
  satelliteSource: string;
  usageNote: string;
  confidenceNote: string;
  generatedAt: string;
  bboxSizeMeters: number;
  properties: {
    originalFeatureProperties: Record<string, unknown>;
    normalized: NormalizedFeatureProperties;
  };
};

export type FailedSatelliteCase = {
  id: string;
  reason: string;
  featureProperties: Record<string, unknown>;
  lat: number;
  lon: number;
};

export type SatelliteGenerateResult = {
  ok: true;
  generated: number;
  failed: number;
  casesJsonUrl: string;
  selection?: {
    strategy: "diverse" | "sequential";
    startOffset: number;
    nextOffset: number;
    totalAvailable: number;
  };
  cases: GeneratedSatelliteCase[];
};

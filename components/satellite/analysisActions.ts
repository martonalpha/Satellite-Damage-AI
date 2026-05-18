"use client";

import type { SatelliteAnalysisResult } from "@/lib/review/schema";
import type { GeneratedSatelliteCase } from "@/lib/satellite/types";

const MARKERS_STORAGE_KEY = "after-map-markers-v1";
const TARGET_CROP_RATIO = 0.42;
const ANALYSIS_IMAGE_SIZE = 1024;
const CHANGE_HEATMAP_THRESHOLD = 24;

export type GeneratedCaseBenchmarkMode = "real_change" | "no_change_control";

export type GeneratedCaseBenchmarkResult = {
  analysis: SatelliteAnalysisResult;
  visualChangeScore: number;
  changedPixelPercent: number;
};

export type GeneratedCaseMarker = {
  id: string;
  label: string;
  locationInput: string;
  lat: number;
  lon: number;
  status: SatelliteAnalysisResult["target_status"];
  eventType: string;
  recommendedAction: string;
  confidenceScore: number;
  severityScore: number;
  summary: string;
  createdAt: string;
  beforePreview: string;
  afterPreview: string;
  beforeDate: string;
  afterDate: string;
};

export async function analyzeAndSaveGeneratedCase(item: GeneratedSatelliteCase) {
  const { analysis } = await runGeneratedCaseAnalysis(item, "real_change");
  const marker = buildMarker(item, analysis);

  saveMarkerLocally(marker);

  await fetch("/api/markers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(marker),
  });

  return { analysis, marker };
}

export async function createGeneratedCaseHeatmapPreview(item: GeneratedSatelliteCase) {
  return createImagePairHeatmapPreview(item.beforeImage, item.afterImage);
}

export async function createImagePairHeatmapPreview(beforeImage: string, afterImage: string) {
  const [beforeFile, afterFile] = await Promise.all([
    fetchTargetCropImage(beforeImage, "before_target_crop.png"),
    fetchTargetCropImage(afterImage, "after_target_crop.png"),
  ]);
  const changeMap = await buildTargetChangeHeatmap(beforeFile, afterFile);

  return {
    cropUrl: URL.createObjectURL(afterFile),
    heatmapUrl: URL.createObjectURL(changeMap.file),
    visualChangeScore: changeMap.visualChangeScore,
    changedPixelPercent: changeMap.changedPixelPercent,
  };
}

export async function createFullImagePairHeatmapPreview(beforeImage: string, afterImage: string) {
  const [beforeFile, afterFile] = await Promise.all([
    fetchImageFile(beforeImage, "before_context.png"),
    fetchImageFile(afterImage, "after_context.png"),
  ]);
  const changeMap = await buildTargetChangeHeatmap(beforeFile, afterFile);

  return {
    cropUrl: URL.createObjectURL(afterFile),
    heatmapUrl: URL.createObjectURL(changeMap.file),
    visualChangeScore: changeMap.visualChangeScore,
    changedPixelPercent: changeMap.changedPixelPercent,
  };
}

export async function runGeneratedCaseBenchmark(
  item: GeneratedSatelliteCase,
  mode: GeneratedCaseBenchmarkMode,
): Promise<GeneratedCaseBenchmarkResult> {
  return runGeneratedCaseAnalysis(item, mode);
}

async function runGeneratedCaseAnalysis(
  item: GeneratedSatelliteCase,
  mode: GeneratedCaseBenchmarkMode,
): Promise<GeneratedCaseBenchmarkResult> {
  const afterImageUrl = mode === "no_change_control" ? item.beforeImage : item.afterImage;
  const afterDate = mode === "no_change_control" ? item.beforeDate : item.afterDate;
  const [beforeContextFile, afterContextFile, beforeFile, afterFile] = await Promise.all([
    fetchImageFile(item.beforeImage, "before_context.png"),
    fetchImageFile(afterImageUrl, "after_context.png"),
    fetchTargetCropImage(item.beforeImage, "before_target_crop.png"),
    fetchTargetCropImage(afterImageUrl, "after_target_crop.png"),
  ]);
  const changeMap = await buildTargetChangeHeatmap(beforeFile, afterFile);

  const formData = new FormData();
  formData.append("beforeContext", beforeContextFile);
  formData.append("afterContext", afterContextFile);
  formData.append("before", beforeFile);
  formData.append("after", afterFile);
  formData.append("changeMap", changeMap.file);
  formData.append("beforeDate", item.beforeDate);
  formData.append("afterDate", afterDate);
  formData.append("locationHint", item.location ?? "Ukraine");
  formData.append("eventTypeHint", mode === "no_change_control" ? "no-change control" : "explosion");
  formData.append("analysisFocus", "target_crop_with_context");
  formData.append("includeEnhancedAfter", "false");

  const response = await fetch("/api/review", { method: "POST", body: formData });
  const result = (await response.json()) as SatelliteAnalysisResult | { error: string };

  if (!response.ok || "error" in result) {
    throw new Error("error" in result ? result.error : "Analysis failed.");
  }

  return {
    analysis: result,
    visualChangeScore: changeMap.visualChangeScore,
    changedPixelPercent: changeMap.changedPixelPercent,
  };
}

async function fetchImageFile(imageUrl: string, fileName: string) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }

  const blob = await response.blob();

  return new File([blob], fileName, { type: blob.type || "image/png" });
}

async function fetchTargetCropImage(imageUrl: string, fileName: string) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  try {
    const sourceSide = Math.max(
      1,
      Math.round(Math.min(bitmap.width, bitmap.height) * TARGET_CROP_RATIO),
    );
    const sourceX = Math.max(0, Math.round((bitmap.width - sourceSide) / 2));
    const sourceY = Math.max(0, Math.round((bitmap.height - sourceSide) / 2));
    const canvas = document.createElement("canvas");
    canvas.width = ANALYSIS_IMAGE_SIZE;
    canvas.height = ANALYSIS_IMAGE_SIZE;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas is not available for target crop generation.");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceSide,
      sourceSide,
      0,
      0,
      ANALYSIS_IMAGE_SIZE,
      ANALYSIS_IMAGE_SIZE,
    );

    const croppedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Target crop export failed."))),
        "image/png",
      );
    });

    return new File([croppedBlob], fileName, { type: "image/png" });
  } finally {
    bitmap.close();
  }
}

async function buildTargetChangeHeatmap(beforeFile: File, afterFile: File) {
  const [beforeBitmap, afterBitmap] = await Promise.all([
    createImageBitmap(beforeFile),
    createImageBitmap(afterFile),
  ]);

  try {
    const beforePixels = drawBitmapToImageData(beforeBitmap);
    const afterPixels = drawBitmapToImageData(afterBitmap);
    const canvas = document.createElement("canvas");
    canvas.width = ANALYSIS_IMAGE_SIZE;
    canvas.height = ANALYSIS_IMAGE_SIZE;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas is not available for change heatmap generation.");
    }

    const heatmap = ctx.createImageData(ANALYSIS_IMAGE_SIZE, ANALYSIS_IMAGE_SIZE);
    const beforeGray = toGrayscale(beforePixels.data);
    const afterGray = toGrayscale(afterPixels.data);
    let changedPixels = 0;
    let normalizedChangeSum = 0;

    for (let y = 0; y < ANALYSIS_IMAGE_SIZE; y += 1) {
      for (let x = 0; x < ANALYSIS_IMAGE_SIZE; x += 1) {
        const pixelIndex = y * ANALYSIS_IMAGE_SIZE + x;
        const rgbaIndex = pixelIndex * 4;
        const colorDiff = getColorDifference(beforePixels.data, afterPixels.data, rgbaIndex);
        const edgeDiff = Math.abs(
          getEdgeStrength(afterGray, x, y) - getEdgeStrength(beforeGray, x, y),
        );
        const changeScore = Math.min(255, colorDiff * 0.45 + edgeDiff * 1.9);

        if (changeScore <= CHANGE_HEATMAP_THRESHOLD) {
          heatmap.data[rgbaIndex] = 0;
          heatmap.data[rgbaIndex + 1] = 0;
          heatmap.data[rgbaIndex + 2] = 0;
          heatmap.data[rgbaIndex + 3] = 255;
          continue;
        }

        const normalized = Math.min(
          1,
          (changeScore - CHANGE_HEATMAP_THRESHOLD) / (130 - CHANGE_HEATMAP_THRESHOLD),
        );
        changedPixels += 1;
        normalizedChangeSum += normalized;

        heatmap.data[rgbaIndex] = 255;
        heatmap.data[rgbaIndex + 1] = Math.round(220 * (1 - normalized));
        heatmap.data[rgbaIndex + 2] = 0;
        heatmap.data[rgbaIndex + 3] = 255;
      }
    }

    ctx.putImageData(heatmap, 0, 0);

    const heatmapBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Change heatmap export failed."))),
        "image/png",
      );
    });

    const pixelCount = ANALYSIS_IMAGE_SIZE * ANALYSIS_IMAGE_SIZE;

    return {
      file: new File([heatmapBlob], "target_change_heatmap.png", { type: "image/png" }),
      visualChangeScore: Math.round((normalizedChangeSum / pixelCount) * 100),
      changedPixelPercent: Math.round((changedPixels / pixelCount) * 100),
    };
  } finally {
    beforeBitmap.close();
    afterBitmap.close();
  }
}

function drawBitmapToImageData(bitmap: ImageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = ANALYSIS_IMAGE_SIZE;
  canvas.height = ANALYSIS_IMAGE_SIZE;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas is not available for image comparison.");
  }

  ctx.drawImage(bitmap, 0, 0, ANALYSIS_IMAGE_SIZE, ANALYSIS_IMAGE_SIZE);

  return ctx.getImageData(0, 0, ANALYSIS_IMAGE_SIZE, ANALYSIS_IMAGE_SIZE);
}

function toGrayscale(data: Uint8ClampedArray) {
  const gray = new Uint8ClampedArray(ANALYSIS_IMAGE_SIZE * ANALYSIS_IMAGE_SIZE);

  for (let index = 0; index < gray.length; index += 1) {
    const rgbaIndex = index * 4;
    gray[index] = Math.round(
      data[rgbaIndex] * 0.299 + data[rgbaIndex + 1] * 0.587 + data[rgbaIndex + 2] * 0.114,
    );
  }

  return gray;
}

function getColorDifference(
  beforeData: Uint8ClampedArray,
  afterData: Uint8ClampedArray,
  rgbaIndex: number,
) {
  const red = afterData[rgbaIndex] - beforeData[rgbaIndex];
  const green = afterData[rgbaIndex + 1] - beforeData[rgbaIndex + 1];
  const blue = afterData[rgbaIndex + 2] - beforeData[rgbaIndex + 2];

  return Math.sqrt((red * red + green * green + blue * blue) / 3);
}

function getEdgeStrength(gray: Uint8ClampedArray, x: number, y: number) {
  const current = gray[y * ANALYSIS_IMAGE_SIZE + x];
  const right = gray[y * ANALYSIS_IMAGE_SIZE + Math.min(ANALYSIS_IMAGE_SIZE - 1, x + 1)];
  const bottom = gray[Math.min(ANALYSIS_IMAGE_SIZE - 1, y + 1) * ANALYSIS_IMAGE_SIZE + x];

  return Math.abs(current - right) + Math.abs(current - bottom);
}

function buildMarker(
  item: GeneratedSatelliteCase,
  analysis: SatelliteAnalysisResult,
): GeneratedCaseMarker {
  return {
    id: `satellite-${item.id}`,
    label: item.label,
    locationInput: item.location ?? `${item.lat.toFixed(4)}, ${item.lon.toFixed(4)}`,
    lat: item.lat,
    lon: item.lon,
    status: analysis.target_status,
    eventType: analysis.event_type,
    recommendedAction: analysis.recommended_action,
    confidenceScore: analysis.damage_assessment.confidence_score,
    severityScore: analysis.damage_assessment.damage_severity_score,
    summary: analysis.user_visible.summary,
    createdAt: new Date().toISOString(),
    beforePreview: item.beforeImage,
    afterPreview: item.afterImage,
    beforeDate: item.beforeDate,
    afterDate: item.afterDate,
  };
}

function saveMarkerLocally(marker: GeneratedCaseMarker) {
  const existing = JSON.parse(localStorage.getItem(MARKERS_STORAGE_KEY) ?? "[]") as unknown[];
  const updated = [
    marker,
    ...existing.filter((candidate: unknown) => {
      return (candidate as { id?: string }).id !== marker.id;
    }),
  ];

  localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(updated));
}

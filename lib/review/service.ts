import { zodTextFormat } from "openai/helpers/zod";
import type { Responses } from "openai/resources/responses/responses";

import { getOpenAIClient, getReviewModel } from "@/lib/openai";
import {
  prepareReviewFile,
  type PreparedReviewedFile,
} from "@/lib/review/image-metadata";
import {
  SATELLITE_ANALYSIS_INSTRUCTIONS,
  buildSatelliteAnalysisPrompt,
} from "@/lib/review/prompt";
import {
  SatelliteAnalysisResultSchema,
  type ReviewInputFile,
  type SatelliteAnalysisResult,
} from "@/lib/review/schema";

type RunAnalysisArgs = {
  beforeFile: ReviewInputFile;
  afterFile: ReviewInputFile;
  locationHint?: string;
  eventTypeHint?: string;
};

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/tiff",
]);

export async function runSatelliteAnalysis({
  beforeFile,
  afterFile,
  locationHint,
  eventTypeHint,
}: RunAnalysisArgs): Promise<SatelliteAnalysisResult> {
  const analysisTimestamp = new Date().toISOString();
  const preparedBefore = await prepareReviewFile(beforeFile, analysisTimestamp);
  const preparedAfter = await prepareReviewFile(afterFile, analysisTimestamp);

  await uploadFiles([preparedBefore, preparedAfter]);

  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: getReviewModel(),
    input: [
      {
        role: "system",
        content: SATELLITE_ANALYSIS_INSTRUCTIONS,
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildSatelliteAnalysisPrompt({
              locationHint,
              eventTypeHint,
              beforeFileName: beforeFile.file.name,
              afterFileName: afterFile.file.name,
            }),
          },
          toResponseInput(preparedBefore),
          toResponseInput(preparedAfter),
        ],
      },
    ],
    text: {
      format: zodTextFormat(SatelliteAnalysisResultSchema, "satellite_damage_analysis"),
    },
  });

  const parsed = response.output_parsed;

  if (!parsed) {
    throw new Error("The analysis model returned no structured output.");
  }

  return SatelliteAnalysisResultSchema.parse({
    ...parsed,
    analysis_timestamp: analysisTimestamp,
  });
}

async function uploadFiles(files: PreparedReviewedFile[]) {
  const client = getOpenAIClient();

  await Promise.all(
    files.map(async (file) => {
      const uploaded = await client.files.create({
        file: file.openaiFile,
        purpose: "user_data",
      });

      file.reviewedFile.file_id = uploaded.id;
    }),
  );
}

function toResponseInput(file: PreparedReviewedFile): Responses.ResponseInputContent {
  if (SUPPORTED_IMAGE_TYPES.has(file.file.type)) {
    return {
      type: "input_image",
      file_id: file.reviewedFile.file_id,
      detail: "high",
    };
  }

  return {
    type: "input_file",
    file_id: file.reviewedFile.file_id,
    filename: file.reviewedFile.file_name,
  };
}

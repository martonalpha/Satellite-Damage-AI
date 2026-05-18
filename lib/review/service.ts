import { zodTextFormat } from "openai/helpers/zod";
import type { Responses } from "openai/resources/responses/responses";

import { getOpenAIClient, getReviewModel } from "@/lib/openai";
import {
  prepareReviewFile,
  type PreparedReviewedFile,
} from "@/lib/review/image-metadata";
import { enhanceForAnalysis } from "@/lib/review/preprocess";
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
  beforeContextFile?: ReviewInputFile;
  afterContextFile?: ReviewInputFile;
  changeMapFile?: ReviewInputFile;
  beforeDate?: string;
  afterDate?: string;
  locationHint?: string;
  eventTypeHint?: string;
  analysisFocus?: "full_frame" | "target_crop" | "target_crop_with_context";
  includeEnhancedAfter?: boolean;
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
  beforeContextFile,
  afterContextFile,
  changeMapFile,
  beforeDate,
  afterDate,
  locationHint,
  eventTypeHint,
  analysisFocus = "full_frame",
  includeEnhancedAfter = true,
}: RunAnalysisArgs): Promise<SatelliteAnalysisResult> {
  const analysisTimestamp = new Date().toISOString();
  const [
    preparedBefore,
    preparedAfter,
    preparedBeforeContext,
    preparedAfterContext,
    preparedChangeMap,
  ] = await Promise.all([
    prepareReviewFile(beforeFile, analysisTimestamp),
    prepareReviewFile(afterFile, analysisTimestamp),
    beforeContextFile ? prepareReviewFile(beforeContextFile, analysisTimestamp) : null,
    afterContextFile ? prepareReviewFile(afterContextFile, analysisTimestamp) : null,
    changeMapFile ? prepareReviewFile(changeMapFile, analysisTimestamp) : null,
  ]);
  const enhancedAfterFileId = { current: "" };
  const filesToUpload = [
    preparedBeforeContext,
    preparedAfterContext,
    preparedBefore,
    preparedAfter,
    preparedChangeMap,
  ].filter((file): file is PreparedReviewedFile => Boolean(file));

  await Promise.all([
    uploadFiles(filesToUpload),
    (async () => {
      if (!includeEnhancedAfter) {
        return;
      }

      const enhanced = await enhanceForAnalysis(preparedAfter.buffer, afterFile.file.name);
      const enhancedAfterFile = new File([new Uint8Array(enhanced.buffer)], enhanced.filename, {
        type: enhanced.mimeType,
      });
      const client = getOpenAIClient();
      const uploaded = await client.files.create({
        file: enhancedAfterFile,
        purpose: "user_data",
      });
      enhancedAfterFileId.current = uploaded.id;
    })(),
  ]);

  const client = getOpenAIClient();
  const imageInputs: Responses.ResponseInputContent[] = [];

  if (preparedBeforeContext && preparedAfterContext) {
    imageInputs.push(toResponseInput(preparedBeforeContext), toResponseInput(preparedAfterContext));
  }

  imageInputs.push(toResponseInput(preparedBefore), toResponseInput(preparedAfter));

  if (preparedChangeMap) {
    imageInputs.push(toResponseInput(preparedChangeMap));
  }

  if (enhancedAfterFileId.current) {
    imageInputs.push({
      type: "input_image",
      file_id: enhancedAfterFileId.current,
      detail: "high",
    });
  }

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
              beforeDate,
              afterDate,
              analysisFocus,
              includeContextImages: Boolean(preparedBeforeContext && preparedAfterContext),
              includeChangeMap: Boolean(preparedChangeMap),
              includeEnhancedAfter,
              beforeFileName: beforeFile.file.name,
              afterFileName: afterFile.file.name,
            }),
          },
          ...imageInputs,
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

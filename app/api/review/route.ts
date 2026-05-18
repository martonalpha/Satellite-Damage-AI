import { runSatelliteAnalysis } from "@/lib/review/service";
import type { ReviewInputFile } from "@/lib/review/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const beforeEntry = formData.get("before");
    const afterEntry = formData.get("after");
    const beforeContextEntry = formData.get("beforeContext");
    const afterContextEntry = formData.get("afterContext");
    const changeMapEntry = formData.get("changeMap");
    const beforeDate = getOptionalString(formData, "beforeDate");
    const afterDate = getOptionalString(formData, "afterDate");
    const locationHint = getOptionalString(formData, "locationHint");
    const eventTypeHint = getOptionalString(formData, "eventTypeHint");
    const analysisFocus = getOptionalString(formData, "analysisFocus");
    const includeEnhancedAfter = getOptionalString(formData, "includeEnhancedAfter");

    if (!isFile(beforeEntry) || !isFile(afterEntry)) {
      return Response.json(
        { error: "Both 'before' and 'after' image files are required." },
        { status: 400 },
      );
    }

    const beforeFile: ReviewInputFile = {
      file: beforeEntry,
      role: "source",
      clientId: "before",
      filePath: null,
      createdAt: null,
      updatedAt: null,
    };

    const afterFile: ReviewInputFile = {
      file: afterEntry,
      role: "preview",
      clientId: "after",
      filePath: null,
      createdAt: null,
      updatedAt: null,
    };
    const beforeContextFile: ReviewInputFile | undefined = isFile(beforeContextEntry)
      ? {
          file: beforeContextEntry,
          role: "other",
          clientId: "beforeContext",
          filePath: null,
          createdAt: null,
          updatedAt: null,
        }
      : undefined;
    const afterContextFile: ReviewInputFile | undefined = isFile(afterContextEntry)
      ? {
          file: afterContextEntry,
          role: "other",
          clientId: "afterContext",
          filePath: null,
          createdAt: null,
          updatedAt: null,
        }
      : undefined;
    const changeMapFile: ReviewInputFile | undefined = isFile(changeMapEntry)
      ? {
          file: changeMapEntry,
          role: "other",
          clientId: "changeMap",
          filePath: null,
          createdAt: null,
          updatedAt: null,
        }
      : undefined;

    const result = await runSatelliteAnalysis({
      beforeFile,
      afterFile,
      beforeContextFile,
      afterContextFile,
      changeMapFile,
      beforeDate: beforeDate ?? undefined,
      afterDate: afterDate ?? undefined,
      locationHint: locationHint ?? undefined,
      eventTypeHint: eventTypeHint ?? undefined,
      analysisFocus:
        analysisFocus === "target_crop_with_context" || analysisFocus === "target_crop"
          ? analysisFocus
          : "full_frame",
      includeEnhancedAfter: includeEnhancedAfter !== "false",
    });

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The analysis request failed.";

    return Response.json({ error: message }, { status: 500 });
  }
}

function getOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

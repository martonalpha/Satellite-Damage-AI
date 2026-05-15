import { runSatelliteAnalysis } from "@/lib/review/service";
import type { ReviewInputFile } from "@/lib/review/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const beforeEntry = formData.get("before");
    const afterEntry = formData.get("after");
    const locationHint = getOptionalString(formData, "locationHint");
    const eventTypeHint = getOptionalString(formData, "eventTypeHint");

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

    const result = await runSatelliteAnalysis({
      beforeFile,
      afterFile,
      locationHint: locationHint ?? undefined,
      eventTypeHint: eventTypeHint ?? undefined,
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

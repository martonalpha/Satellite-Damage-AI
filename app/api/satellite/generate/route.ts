import { generateSatelliteCases } from "@/lib/satellite/caseBuilder";
import type { SatelliteGenerateRequest } from "@/lib/satellite/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SatelliteGenerateRequest;

    if (!body.geojsonUrl) {
      return Response.json(
        { error: "geojsonUrl is required and must point to /data/hdx/..." },
        { status: 400 },
      );
    }

    const result = await generateSatelliteCases(body);

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Satellite case generation failed.";
    const isConfigError = message.includes("Sentinel Hub credentials are missing");

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: isConfigError ? 400 : 500 },
    );
  }
}

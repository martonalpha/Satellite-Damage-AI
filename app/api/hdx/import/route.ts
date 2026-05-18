import { getHdxPackageResources, importHdxShapefile } from "@/lib/hdx/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dataset = url.searchParams.get("dataset") ?? url.searchParams.get("url");
  const metadataOnly = url.searchParams.get("metadataOnly") === "1";
  const persist = url.searchParams.get("persist") !== "0";

  return handleImportRequest({ dataset, metadataOnly, persist });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    dataset?: unknown;
    url?: unknown;
    metadataOnly?: unknown;
    persist?: unknown;
  } | null;
  const dataset =
    typeof body?.dataset === "string"
      ? body.dataset
      : typeof body?.url === "string"
        ? body.url
        : null;

  return handleImportRequest({
    dataset,
    metadataOnly: body?.metadataOnly === true,
    persist: body?.persist !== false,
  });
}

async function handleImportRequest({
  dataset,
  metadataOnly,
  persist,
}: {
  dataset: string | null;
  metadataOnly: boolean;
  persist: boolean;
}) {
  if (!dataset) {
    return Response.json(
      { error: "Provide a dataset slug or HDX dataset URL in 'dataset'." },
      { status: 400 },
    );
  }

  try {
    if (metadataOnly) {
      const metadata = await getHdxPackageResources(dataset);
      return Response.json(metadata);
    }

    const imported = await importHdxShapefile({ dataset, persist });

    return Response.json({
      dataset: imported.dataset,
      resource: imported.resource,
      featureCount: imported.featureCount,
      saved: imported.saved,
      geojson: persist ? undefined : imported.geojson,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "HDX import request failed.",
      },
      { status: 500 },
    );
  }
}

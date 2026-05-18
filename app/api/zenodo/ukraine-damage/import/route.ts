import {
  getUkraineDamageImportOptions,
  importUkraineDamageFile,
} from "@/lib/zenodo/ukraineDamage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const file = url.searchParams.get("file");
  const metadataOnly = url.searchParams.get("metadataOnly") === "1";

  if (metadataOnly) {
    return Response.json({
      source: "Zenodo / Ukraine Damage Mapping Tool",
      recordUrl: "https://zenodo.org/records/14811504",
      files: getUkraineDamageImportOptions(),
    });
  }

  try {
    return Response.json(await importUkraineDamageFile(file));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Ukraine damage dataset import failed.",
      },
      { status: 500 },
    );
  }
}

import { readGeneratedCases } from "@/lib/satellite/caseBuilder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cases = await readGeneratedCases();

  return Response.json({ cases });
}

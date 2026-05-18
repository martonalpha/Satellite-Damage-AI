import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const REVIEWS_FILE = path.join(process.cwd(), "public", "data", "reviews.json");

async function readReviews(): Promise<unknown[]> {
  try {
    const raw = await readFile(REVIEWS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const reviews = await readReviews();
  return Response.json(reviews);
}

export async function PUT(request: Request) {
  try {
    const list = (await request.json()) as unknown[];
    if (!Array.isArray(list)) {
      return Response.json({ error: "Expected an array." }, { status: 400 });
    }
    await mkdir(path.dirname(REVIEWS_FILE), { recursive: true });
    await writeFile(REVIEWS_FILE, JSON.stringify(list, null, 2), "utf8");
    return Response.json({ ok: true, total: list.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save reviews.";
    return Response.json({ error: message }, { status: 500 });
  }
}

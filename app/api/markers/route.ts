import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const MARKERS_FILE = path.join(process.cwd(), "public", "data", "markers.json");

async function readMarkers(): Promise<unknown[]> {
  try {
    const raw = await readFile(MARKERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const markers = await readMarkers();
  return Response.json(markers);
}

export async function POST(request: Request) {
  try {
    const marker = (await request.json()) as Record<string, unknown>;

    if (!marker || typeof marker.id !== "string") {
      return Response.json({ error: "Invalid marker payload." }, { status: 400 });
    }

    await mkdir(path.dirname(MARKERS_FILE), { recursive: true });
    const existing = await readMarkers();
    const updated = [marker, ...existing.filter((m) => (m as { id: string }).id !== marker.id)];
    await writeFile(MARKERS_FILE, JSON.stringify(updated, null, 2), "utf8");

    return Response.json({ ok: true, total: updated.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save marker.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const list = (await request.json()) as unknown[];
    if (!Array.isArray(list)) {
      return Response.json({ error: "Expected an array." }, { status: 400 });
    }
    await mkdir(path.dirname(MARKERS_FILE), { recursive: true });
    await writeFile(MARKERS_FILE, JSON.stringify(list, null, 2), "utf8");
    return Response.json({ ok: true, total: list.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save markers.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = (await request.json()) as { id: string };

    if (!id) {
      return Response.json({ error: "Missing marker id." }, { status: 400 });
    }

    const existing = await readMarkers();
    const updated = existing.filter((m) => (m as { id: string }).id !== id);
    await writeFile(MARKERS_FILE, JSON.stringify(updated, null, 2), "utf8");

    return Response.json({ ok: true, total: updated.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete marker.";
    return Response.json({ error: message }, { status: 500 });
  }
}

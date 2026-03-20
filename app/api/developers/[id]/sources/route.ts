import { NextResponse } from "next/server";
import { getDeveloper } from "../../../../../lib/db/developers";
import { getSourcesForDeveloper, setSourcesForDeveloper } from "../../../../../lib/db/sources";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const developer = getDeveloper(id);
    if (!developer) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    const sources = getSourcesForDeveloper(id);
    return NextResponse.json(sources);
  } catch (err) {
    console.error("GET /api/developers/[id]/sources error:", err);
    return NextResponse.json({ error: "Failed to load developer sources" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const developer = getDeveloper(id);
    if (!developer) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    const body = await request.json();
    const { sourceIds } = body;

    if (!Array.isArray(sourceIds)) {
      return NextResponse.json({ error: "sourceIds must be an array" }, { status: 400 });
    }

    setSourcesForDeveloper(id, sourceIds);
    const updated = getSourcesForDeveloper(id);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PUT /api/developers/[id]/sources error:", err);
    return NextResponse.json({ error: "Failed to update developer sources" }, { status: 500 });
  }
}

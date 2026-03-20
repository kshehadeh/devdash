import { NextResponse } from "next/server";
import { getSource, updateSource, deleteSource } from "../../../../lib/db/sources";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const source = getSource(id);
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(source);
  } catch (err) {
    console.error("GET /api/sources/[id] error:", err);
    return NextResponse.json({ error: "Failed to load source" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const source = updateSource(id, body);
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(source);
  } catch (err) {
    console.error("PUT /api/sources/[id] error:", err);
    return NextResponse.json({ error: "Failed to update source" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deleted = deleteSource(id);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/sources/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete source" }, { status: 500 });
  }
}

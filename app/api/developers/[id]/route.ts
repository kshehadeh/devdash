import { NextResponse } from "next/server";
import { getDeveloper, updateDeveloper, deleteDeveloper } from "../../../../lib/db/developers";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const developer = getDeveloper(id);
    if (!developer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(developer);
  } catch (err) {
    console.error("GET /api/developers/[id] error:", err);
    return NextResponse.json({ error: "Failed to load developer" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, role, team, githubUsername, atlassianEmail } = body;

    const developer = updateDeveloper(id, { name, role, team, githubUsername, atlassianEmail });
    if (!developer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(developer);
  } catch (err) {
    console.error("PUT /api/developers/[id] error:", err);
    return NextResponse.json({ error: "Failed to update developer" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deleted = deleteDeveloper(id);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/developers/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete developer" }, { status: 500 });
  }
}

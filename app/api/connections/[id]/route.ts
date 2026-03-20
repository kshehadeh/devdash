import { NextResponse } from "next/server";
import { getConnection, saveConnection, deleteConnection } from "../../../../lib/db/connections";
import type { ConnectionId } from "../../../../lib/db/connections";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const connection = getConnection(id as ConnectionId);
    if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...connection, token: connection.token ? "••••••••••••••••" : undefined });
  } catch (err) {
    console.error("GET /api/connections/[id] error:", err);
    return NextResponse.json({ error: "Failed to load connection" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (id !== "github" && id !== "atlassian") {
      return NextResponse.json({ error: "Invalid connection id" }, { status: 400 });
    }

    const body = await request.json();
    const { token, email, org, connected } = body;

    // Only update token if a non-masked value was provided
    const tokenToSave =
      token && !token.startsWith("••") ? token : undefined;

    const connection = saveConnection(id as ConnectionId, {
      token: tokenToSave,
      email,
      org,
      connected,
    });

    return NextResponse.json({ ...connection, token: connection.token ? "••••••••••••••••" : undefined });
  } catch (err) {
    console.error("PUT /api/connections/[id] error:", err);
    return NextResponse.json({ error: "Failed to save connection" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deleted = deleteConnection(id as ConnectionId);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/connections/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete connection" }, { status: 500 });
  }
}

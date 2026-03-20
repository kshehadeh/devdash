import { NextResponse } from "next/server";
import { listConnections } from "../../../lib/db/connections";

export async function GET() {
  try {
    const connections = listConnections().map((c) => ({
      ...c,
      token: c.token ? "••••••••••••••••" : undefined, // never send plaintext token to client
    }));
    return NextResponse.json(connections);
  } catch (err) {
    console.error("GET /api/connections error:", err);
    return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
  }
}

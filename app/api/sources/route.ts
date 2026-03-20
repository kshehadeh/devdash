import { NextResponse } from "next/server";
import { listSources, createSource } from "../../../lib/db/sources";
import type { DataSourceType } from "../../../lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as DataSourceType | null;
    const sources = listSources(type ?? undefined);
    return NextResponse.json(sources);
  } catch (err) {
    console.error("GET /api/sources error:", err);
    return NextResponse.json({ error: "Failed to load sources" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, name, org, identifier, metadata } = body;

    if (!type || !name?.trim() || !identifier?.trim()) {
      return NextResponse.json({ error: "type, name, and identifier are required" }, { status: 400 });
    }

    const source = createSource({
      type,
      name: name.trim(),
      org: (org ?? "").trim(),
      identifier: identifier.trim(),
      metadata,
    });
    return NextResponse.json(source, { status: 201 });
  } catch (err) {
    console.error("POST /api/sources error:", err);
    return NextResponse.json({ error: "Failed to create source" }, { status: 500 });
  }
}

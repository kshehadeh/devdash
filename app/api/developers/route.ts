import { NextResponse } from "next/server";
import { listDevelopers, createDeveloper } from "../../../lib/db/developers";

export async function GET() {
  try {
    const developers = listDevelopers();
    return NextResponse.json(developers);
  } catch (err) {
    console.error("GET /api/developers error:", err);
    return NextResponse.json({ error: "Failed to load developers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, role, team, githubUsername, atlassianEmail } = body;

    if (!name?.trim() || !role?.trim() || !team?.trim()) {
      return NextResponse.json({ error: "name, role, and team are required" }, { status: 400 });
    }

    const developer = createDeveloper({ name: name.trim(), role: role.trim(), team: team.trim(), githubUsername, atlassianEmail });
    return NextResponse.json(developer, { status: 201 });
  } catch (err) {
    console.error("POST /api/developers error:", err);
    return NextResponse.json({ error: "Failed to create developer" }, { status: 500 });
  }
}

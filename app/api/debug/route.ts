import { NextResponse } from "next/server";
import { getConnection } from "../../../lib/db/connections";

export async function GET() {
  const conn = getConnection("atlassian");
  if (!conn?.connected || !conn.token || !conn.email || !conn.org) {
    return NextResponse.json({ error: "Not connected" });
  }

  const site = conn.org;
  const auth = "Basic " + Buffer.from(`${conn.email}:${conn.token}`).toString("base64");
  const hdrs = { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" };
  const lookupEmail = "kshehadeh@underarmour.com";

  // Test 1: /user/picker
  let pickerResult = null;
  try {
    const r = await fetch(`https://${site}.atlassian.net/rest/api/3/user/picker?query=${encodeURIComponent(lookupEmail)}&maxResults=3`, { headers: hdrs });
    pickerResult = { status: r.status, body: await r.json() };
  } catch (e) {
    pickerResult = { error: String(e) };
  }

  // Test 2: /user/search
  let searchResult = null;
  try {
    const r = await fetch(`https://${site}.atlassian.net/rest/api/3/user/search?query=${encodeURIComponent(lookupEmail)}&maxResults=3`, { headers: hdrs });
    searchResult = { status: r.status, body: await r.json() };
  } catch (e) {
    searchResult = { error: String(e) };
  }

  // Test 3: Direct JQL with hardcoded accountId
  let jqlResult = null;
  try {
    const jql = `assignee = "557058:5e81df32-f37a-4be1-b60e-fe1aa5cafee9" AND statusCategory != Done AND project IN (SB) ORDER BY updated DESC`;
    const r = await fetch(`https://${site}.atlassian.net/rest/api/3/search/jql`, {
      method: "POST",
      headers: { ...hdrs, "Content-Type": "application/json" },
      body: JSON.stringify({ jql, maxResults: 3, fields: ["summary", "status"] }),
    });
    jqlResult = { status: r.status, body: await r.json() };
  } catch (e) {
    jqlResult = { error: String(e) };
  }

  return NextResponse.json({ pickerResult, searchResult, jqlResult });
}

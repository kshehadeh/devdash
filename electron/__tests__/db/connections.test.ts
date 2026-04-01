import type Database from "better-sqlite3";
import { _setDbForTesting } from "../../db/index";
import {
  getConnection,
  saveConnection,
  listConnections,
  deleteConnection,
  hasUsableToken,
} from "../../db/connections";
import type { ConnectionRecord } from "../../db/connections";
import { createTestDb } from "../helpers/test-db";

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  _setDbForTesting(db);
});

afterEach(() => {
  _setDbForTesting(null);
  db.close();
});

// ─── getConnection ────────────────────────────────────────

describe("getConnection", () => {
  it("returns null for nonexistent connection", () => {
    expect(getConnection("github")).toBeNull();
  });

  it("returns record after saveConnection", () => {
    saveConnection("github", {
      token: "ghp_abc123",
      email: "dev@test.com",
      org: "my-org",
      connected: true,
    });

    const conn = getConnection("github");
    expect(conn).not.toBeNull();
    expect(conn!.id).toBe("github");
    expect(conn!.token).toBe("ghp_abc123");
    expect(conn!.email).toBe("dev@test.com");
    expect(conn!.org).toBe("my-org");
    expect(conn!.connected).toBe(true);
  });
});

// ─── saveConnection ───────────────────────────────────────

describe("saveConnection", () => {
  it("creates a new connection", () => {
    const result = saveConnection("atlassian", {
      token: "atl-token",
      email: "user@atlassian.com",
      org: "my-site",
      connected: true,
    });

    expect(result.id).toBe("atlassian");
    expect(result.token).toBe("atl-token");
    expect(result.email).toBe("user@atlassian.com");
    expect(result.connected).toBe(true);
  });

  it("updates an existing connection", () => {
    saveConnection("github", {
      token: "old-token",
      email: "old@test.com",
      connected: true,
    });

    const updated = saveConnection("github", {
      token: "new-token",
      email: "new@test.com",
    });

    expect(updated.token).toBe("new-token");
    expect(updated.email).toBe("new@test.com");
  });

  it("preserves existing fields when not provided in update", () => {
    saveConnection("github", {
      token: "my-token",
      email: "dev@test.com",
      org: "my-org",
      connected: true,
    });

    // Update only the email
    const updated = saveConnection("github", { email: "updated@test.com" });

    expect(updated.token).toBe("my-token");
    expect(updated.org).toBe("my-org");
    expect(updated.email).toBe("updated@test.com");
  });

  it("encrypts the token in the database", () => {
    saveConnection("github", { token: "secret-token", connected: true });

    const row = db
      .prepare("SELECT encrypted_token FROM connections WHERE id = ?")
      .get("github") as { encrypted_token: string };

    // The stored value should not be the plaintext token
    expect(row.encrypted_token).not.toBe("secret-token");
    expect(row.encrypted_token).toBeTruthy();
  });
});

// ─── listConnections ──────────────────────────────────────

describe("listConnections", () => {
  it("returns empty array when no connections exist", () => {
    expect(listConnections()).toEqual([]);
  });

  it("returns all connections", () => {
    saveConnection("github", { token: "gh-token", connected: true });
    saveConnection("atlassian", { token: "atl-token", connected: true });
    saveConnection("linear", { token: "lin-token", connected: true });

    const conns = listConnections();
    expect(conns).toHaveLength(3);
    const ids = conns.map((c) => c.id).sort();
    expect(ids).toEqual(["atlassian", "github", "linear"]);
  });
});

// ─── deleteConnection ─────────────────────────────────────

describe("deleteConnection", () => {
  it("removes an existing connection and returns true", () => {
    saveConnection("github", { token: "token", connected: true });
    expect(deleteConnection("github")).toBe(true);
    expect(getConnection("github")).toBeNull();
  });

  it("returns false for nonexistent connection", () => {
    expect(deleteConnection("linear")).toBe(false);
  });
});

// ─── hasUsableToken ───────────────────────────────────────

describe("hasUsableToken", () => {
  it("returns false for null", () => {
    expect(hasUsableToken(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasUsableToken(undefined)).toBe(false);
  });

  it("returns false for connection without token", () => {
    const conn: ConnectionRecord = {
      id: "github",
      connected: true,
      updatedAt: new Date().toISOString(),
    };
    expect(hasUsableToken(conn)).toBe(false);
  });

  it("returns false for empty string token", () => {
    const conn: ConnectionRecord = {
      id: "github",
      token: "",
      connected: true,
      updatedAt: new Date().toISOString(),
    };
    expect(hasUsableToken(conn)).toBe(false);
  });

  it("returns false for whitespace-only token", () => {
    const conn: ConnectionRecord = {
      id: "github",
      token: "   ",
      connected: true,
      updatedAt: new Date().toISOString(),
    };
    expect(hasUsableToken(conn)).toBe(false);
  });

  it("returns true for valid token", () => {
    const conn: ConnectionRecord = {
      id: "github",
      token: "ghp_abc123",
      connected: true,
      updatedAt: new Date().toISOString(),
    };
    expect(hasUsableToken(conn)).toBe(true);
  });
});

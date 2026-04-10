import { getIdentityPayload, upsertDeveloperIntegrationIdentity } from "./developer-identity";

// In-memory cache (per-session)
const accountIdCache = new Map<string, string>();

function basicAuth(email: string, token: string): string {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

function atlHeaders(email: string, token: string) {
  return {
    Authorization: basicAuth(email, token),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export interface ResolveAccountIdContext {
  site: string;
  email: string; // Connection email (for auth)
  token: string;
  lookupEmail: string; // Developer work email (to resolve)
}

/** Get persisted account ID from developer_integration_identity */
export function getPersistedJiraAccountId(developerId: string): string | undefined {
  const payload = getIdentityPayload(developerId, "work") as { jiraAccountId?: string };
  return typeof payload.jiraAccountId === "string" && payload.jiraAccountId.trim()
    ? payload.jiraAccountId.trim()
    : undefined;
}

/** Persist a resolved Jira account ID to the database */
export function persistJiraAccountId(developerId: string, accountId: string): void {
  const payload = getIdentityPayload(developerId, "work");
  upsertDeveloperIntegrationIdentity(developerId, "work", "jira", {
    ...payload,
    jiraAccountId: accountId,
  });
}

/** Clear persisted Jira account ID (e.g., on auth failure) */
export function clearPersistedJiraAccountId(developerId: string): void {
  const payload = getIdentityPayload(developerId, "work");
  const { jiraAccountId: _, ...rest } = payload;
  upsertDeveloperIntegrationIdentity(developerId, "work", "jira", rest);
}

/**
 * Resolve a Jira account ID from an email address.
 *
 * Resolution order:
 * 1. Check in-memory cache
 * 2. Check persisted DB cache (developer_integration_identity.jiraAccountId)
 * 3. Call /user/picker API
 * 4. Call /user/search API
 * 5. Try searching by local-part of email (before @) as fallback
 *
 * Successfully resolved IDs are persisted to the DB for future sessions.
 */
export async function resolveAccountId(
  developerId: string | undefined,
  ctx: ResolveAccountIdContext,
): Promise<string | null> {
  const { site, email, token, lookupEmail } = ctx;
  const cacheKey = `${site}:${lookupEmail}`;

  // 1. In-memory cache
  if (accountIdCache.has(cacheKey)) {
    return accountIdCache.get(cacheKey)!;
  }

  // 2. Persisted DB cache
  if (developerId) {
    const persisted = getPersistedJiraAccountId(developerId);
    if (persisted) {
      accountIdCache.set(cacheKey, persisted);
      return persisted;
    }
  }

  const baseUrl = `https://${site}.atlassian.net`;
  const hdrs = atlHeaders(email, token);
  let resolvedAccountId: string | null = null;

  // 3. Try /user/picker first — most reliable for email-based lookup
  try {
    const pickerRes = await fetch(
      `${baseUrl}/rest/api/3/user/picker?query=${encodeURIComponent(lookupEmail)}&maxResults=1`,
      { headers: hdrs },
    );
    if (pickerRes.ok) {
      const pickerData = (await pickerRes.json()) as { users?: Array<{ accountId: string; html?: string; displayName?: string }> };
      const users = pickerData.users ?? [];
      if (users.length > 0) {
        resolvedAccountId = users[0].accountId;
      }
    }
  } catch {
    // fall through to next attempt
  }

  // 4. Fallback: /user/search
  if (!resolvedAccountId) {
    try {
      const res = await fetch(
        `${baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(lookupEmail)}&maxResults=5`,
        { headers: hdrs },
      );
      if (res.ok) {
        const users = (await res.json()) as Array<{ accountId: string; emailAddress?: string; displayName?: string }>;
        if (users.length > 0) {
          resolvedAccountId = users[0].accountId;
        }
      }
    } catch {
      // fall through
    }
  }

  // 5. Third fallback: search by local-part of email (catches typos in domain)
  if (!resolvedAccountId) {
    const localPart = lookupEmail.split("@")[0];
    if (localPart && localPart !== lookupEmail) {
      try {
        const res = await fetch(
          `${baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(localPart)}&maxResults=5`,
          { headers: hdrs },
        );
        if (res.ok) {
          const users = (await res.json()) as Array<{ accountId: string; emailAddress?: string; displayName?: string }>;
          // Find best match: exact email match preferred, otherwise first result
          const match = users.find(
            (u) => u.emailAddress?.toLowerCase() === lookupEmail.toLowerCase(),
          ) ?? users[0];
          if (match) {
            resolvedAccountId = match.accountId;
          }
        }
      } catch {
        // fall through
      }
    }
  }

  if (resolvedAccountId) {
    accountIdCache.set(cacheKey, resolvedAccountId);
    if (developerId) {
      persistJiraAccountId(developerId, resolvedAccountId);
    }
    return resolvedAccountId;
  }

  console.error(`[resolveAccountId] Could not resolve Jira account ID for: ${lookupEmail}`);
  return null;
}

/**
 * Batch resolve account IDs for multiple developers.
 * Useful for sync operations that need to check which developers can be synced.
 */
export async function resolveAccountIdsBatch(
  items: Array<{ developerId: string; ctx: ResolveAccountIdContext }>,
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  await Promise.all(
    items.map(async ({ developerId, ctx }) => {
      const accountId = await resolveAccountId(developerId, ctx);
      results.set(developerId, accountId);
    }),
  );

  return results;
}

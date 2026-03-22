---
name: dashboard-section
description: Guide for adding a new section to the DevDash dashboard. Use when the user asks to add, build, or modify a dashboard section. Covers the IPC handler pattern, async independent loading, skeleton states, external link handling, and styling conventions.
user-invocable: true
---

# Dashboard Section Skill

Use this skill when adding a new section to the DevDash developer dashboard.

---

## Architecture Overview

DevDash is a Vite + React frontend communicating with an Electron main process via IPC. Each dashboard section:

1. Has a **typed IPC handler** in `electron/ipc/stats.ts` registered with `ipcMain.handle`
2. Has a **response type** defined in both `src/lib/types.ts` (frontend) and `electron/types.ts` (backend)
3. Is loaded **independently and asynchronously** in `src/pages/Dashboard.tsx` using the `useIpc` hook
4. Renders a **skeleton while loading**, then the real content once data arrives
5. Makes items **clickable links** that open in the external system browser where applicable

---

## Step-by-Step Guide

### 1. Define the response type

Add the new response interface to **both** type files:

**`src/lib/types.ts`** and **`electron/types.ts`**:

```ts
export interface MyNewSectionResponse {
  items: MyItem[];
  // ...
}

export interface MyItem {
  title: string;
  url?: string; // include url when items should be clickable
  // ...
}
```

### 2. Create the IPC handler

Add a new `ipcMain.handle` block inside `registerStatsHandlers()` in `electron/ipc/stats.ts`.

Follow this pattern — **cache-first, background-sync-on-miss, graceful degradation**:

```ts
ipcMain.handle("stats:mysection", async (_e, data: { developerId: string; days: number }) => {
  const { developerId: id, days } = data;
  const ctx = getStatsContext(id, days);
  if (!ctx) throw new Error("Developer not found");

  // 1. Serve from cache if fresh
  if (hasFreshCache(id, "my_cache_key")) {
    return getCachedMyData(id, ctx.someFilter);
  }

  // 2. Trigger background sync so next load is fast
  syncDeveloper(id).catch((err) => console.error("[stats:mysection] sync error:", err));

  // 3. Fall back to live fetch if connection available
  let items: MyItem[] = [];
  if (ctx.ghConn?.connected && ctx.ghConn.token) {
    const results = await Promise.allSettled([fetchMyData(ctx.ghConn.token, ...)]);
    if (results[0].status === "fulfilled") items = results[0].value;
  }

  return { items };
});
```

Key rules:
- Always use `Promise.allSettled` for parallel fetches — never let one failure block the whole section
- Always check connection existence and `connected` flag before calling external APIs
- Return an empty/default shape rather than throwing when data is unavailable

### 3. Register the handler

Add the call to `registerAllHandlers()` in `electron/ipc/index.ts`:

```ts
import { registerMyNewHandlers } from "./my-new-section";
// inside registerAllHandlers:
registerMyNewHandlers();
```

Or add the handler directly in `stats.ts` if it belongs there.

### 4. Load data in Dashboard.tsx

Add a `useIpc` call alongside the existing ones. Pass `null` as the channel when no developer is selected so the hook short-circuits:

```ts
const mySection = useIpc<MyNewSectionResponse>(
  selectedDevId ? "stats:mysection" : null,
  [{ developerId: selectedDevId, days: lookbackDays }]
);
```

The `useIpc` hook signature:
```ts
useIpc<T>(channel: string | null, args?: unknown[]): { data: T | null; loading: boolean; error: string | null }
```

Each section loads **independently** — do not wait for other sections' data.

### 5. Render skeleton → content in Dashboard.tsx

Always render a `CardSkeleton` while loading, then the real `Card` once data is available. Render nothing (`null`) if data never arrived (e.g. no connection configured):

```tsx
{mySection.loading ? (
  <CardSkeleton lines={4} />
) : mySection.data ? (
  <Card>
    <div className="flex items-center gap-2 mb-4">
      <SomeIcon size={16} className="text-[var(--primary)]" />
      <h3 className="text-sm font-semibold text-[var(--on-surface)]">Section Title</h3>
    </div>
    <MySectionComponent items={mySection.data.items} />
  </Card>
) : null}
```

`CardSkeleton` props: `lines` (number of shimmer rows, default 4).

### 6. Create the section component

Place the component in `src/components/dashboard/MySectionComponent.tsx`.

#### External links pattern

Any item with a URL **must** open in the system browser (not inside Electron's webview). Use `window.open()` — Electron's `setWindowOpenHandler` in `main.ts` intercepts it and routes it to `shell.openExternal`:

```tsx
// For inline text/titles:
<span
  className={`text-sm text-[var(--on-surface)] ${item.url ? "cursor-pointer hover:text-[var(--primary)] hover:underline transition-colors" : ""}`}
  onClick={() => item.url && window.open(item.url)}
>
  {item.title}
</span>

// For row-level clickability:
<div
  className={`flex items-center gap-3 ${item.url ? "cursor-pointer hover:opacity-70 transition-opacity" : ""}`}
  onClick={() => item.url && window.open(item.url)}
>
  ...
</div>
```

Never use `<a href>` tags or `target="_blank"` — always `window.open()`.

#### Styling conventions

- Use CSS custom properties for all colors: `var(--primary)`, `var(--on-surface)`, `var(--on-surface-variant)`, `var(--surface-container)`, `var(--surface-container-highest)`, `var(--outline-variant)`
- Labels/meta text: `text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider`
- Body text: `text-sm text-[var(--on-surface)]`
- Small timestamps/counts: `text-xs font-label text-[var(--on-surface-variant)]`
- Section dividers: `border-t border-[var(--outline-variant)]/20 pt-4`
- Icon + title header row: `flex items-center gap-2 mb-4` with icon at 16px

---

## Grid Layout

The dashboard uses a 3-column grid. Add new cards to the appropriate column:

```
col-span-2 (left): primary content — commit history, PRs, tickets
col-span-1 (right): supporting context — Confluence, effort distribution
```

To add a full-width section, use `col-span-3`. To split differently, adjust `grid-cols` accordingly.

---

## URL Construction

When data comes from a cache that stores IDs (no stored URL), construct URLs from available fields:

- **Confluence page**: `https://{site}.atlassian.net/wiki/spaces/{space_key}/pages/{page_id}`  
  Pass `site` (from `ctx.atConn?.org`) into the cache query function.
- **Jira ticket**: `https://{site}.atlassian.net/browse/{issue_key}`
- **GitHub PR**: stored directly as `url` in `cached_pull_requests`

When fetching live (not from cache), extract the URL from the API response and include it in the returned type.

---

## Compile Step

After modifying any file under `electron/`, always run:

```
bun run electron:compile
```

Frontend changes (`src/`) are picked up automatically by Vite's HMR. Restart `bun run dev` only when electron-side changes are needed.

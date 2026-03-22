import { ipcMain } from "electron";
import { getStatsContext } from "./stats-context";
import {
  hasFreshCache,
  getSyncStatus,
  getCachedReviewRequestItems,
  getCachedMyOpenPRReviewItems,
} from "../db/cache";
import { syncDeveloper } from "../sync/engine";
import type { ReviewsResponse } from "../types";

const LOOKBACK_PLACEHOLDER = 30;

export function registerReviewsHandlers() {
  ipcMain.handle("reviews:get", async (_e, data: { developerId: string }): Promise<ReviewsResponse> => {
    const ctx = getStatsContext(data.developerId, LOOKBACK_PLACEHOLDER);
    if (!ctx) throw new Error("Developer not found");

    const empty: ReviewsResponse = { requestedOfYou: [], onYourPullRequests: [] };

    if (!ctx.ghUsername?.trim()) {
      return { ...empty, error: "Add a GitHub username for this developer in their profile." };
    }

    if (!ctx.ghConn?.connected || !ctx.ghConn.token) {
      return { ...empty, error: "Connect GitHub in Settings to load reviews." };
    }

    const repos = ctx.repoFilter.length > 0 ? ctx.repoFilter : undefined;

    if (hasFreshCache(data.developerId, "github_pull_requests")) {
      const st = getSyncStatus(data.developerId, "github_pull_requests");
      return {
        requestedOfYou: getCachedReviewRequestItems(data.developerId, repos),
        onYourPullRequests: getCachedMyOpenPRReviewItems(data.developerId, repos),
        _syncedAt: st?.lastSyncedAt,
      };
    }

    syncDeveloper(data.developerId, { silent: true }).catch((err) =>
      console.error("[reviews:get] Background sync error:", err),
    );

    return { ...empty };
  });
}

import { ipcMain } from "electron";
import {
  CACHE_BUCKET_DEFS,
  type CacheBucketId,
  clearAllCaches,
  clearCacheBucket,
  getCacheStats,
} from "../db/cache-admin";

const BUCKET_IDS = new Set<string>(CACHE_BUCKET_DEFS.map((d) => d.id));

function isCacheBucketId(v: string): v is CacheBucketId {
  return BUCKET_IDS.has(v);
}

export function registerCacheAdminHandlers() {
  ipcMain.handle("cache:stats", () => getCacheStats());

  ipcMain.handle("cache:clear", (_e, data: { bucketId: string }) => {
    if (data.bucketId === "all") clearAllCaches();
    else if (isCacheBucketId(data.bucketId)) clearCacheBucket(data.bucketId);
    else throw new Error(`Invalid cache bucket: ${data.bucketId}`);
    return getCacheStats();
  });
}

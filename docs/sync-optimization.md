# GitHub Sync Optimization

## Problem

The original sync implementation had significant inefficiencies when multiple developers shared the same repositories:

### Before Optimization

For each developer, the sync would:
1. Fetch ALL PR review comments for each assigned repo
2. Fetch ALL issue comments for each assigned repo  
3. Fetch ALL PR reviews for each assigned repo
4. Filter client-side to find comments/reviews relevant to that developer

**Example**: 10 developers sharing 5 repos = 50 redundant API calls (10 × 5) fetching the same data repeatedly.

### Why This Happened

GitHub's API doesn't support filtering comments by author at the repository level:
- `/repos/{owner}/{repo}/pulls/comments` returns ALL review comments
- `/repos/{owner}/{repo}/issues/comments` returns ALL issue comments
- No way to query "comments by user X in repo Y"

## Solution

Implemented **repo-level caching** to fetch shared data once per repo, then distribute to developers.

### Architecture Changes

#### 1. New Database Tables (Migration v22)

**`repo_sync_log`**: Track sync status per repo (not per developer per repo)
```sql
CREATE TABLE repo_sync_log (
  org TEXT NOT NULL,
  repo TEXT NOT NULL,
  data_type TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  last_cursor TEXT,
  status TEXT NOT NULL,
  PRIMARY KEY (org, repo, data_type)
);
```

**`cached_repo_pr_review_comments`**: Store ALL review comments at repo level
```sql
CREATE TABLE cached_repo_pr_review_comments (
  repo TEXT NOT NULL,
  comment_id INTEGER NOT NULL,
  pr_number INTEGER NOT NULL,
  author_login TEXT NOT NULL,
  -- ... other fields
  PRIMARY KEY (repo, comment_id)
);
```

**`cached_repo_pr_issue_comments`**: Store ALL issue comments at repo level
**`cached_repo_pr_reviews`**: Store ALL PR reviews at repo level

#### 2. New Sync Flow

**Old Flow**:
```
For each developer:
  For each repo:
    Fetch ALL comments → Filter by developer → Store
```

**New Flow**:
```
For each unique repo (once):
  Fetch ALL comments → Store at repo level

For each developer:
  For each repo:
    Read from repo cache → Filter by developer → Store in developer cache
```

#### 3. Implementation Files

- **`electron/sync/github-repo-sync.ts`**: New file with repo-level sync functions
  - `syncRepoPRReviewComments()`: Fetch comments for a repo
  - `syncRepoPRReviews()`: Fetch reviews for a repo
  - `distributeRepoCommentsToDevs()`: Filter and copy to developer cache
  - `distributeRepoReviewsToDevs()`: Filter and copy to developer cache

- **`electron/sync/github-sync.ts`**: Refactored developer sync functions
  - `syncPRReviewComments()`: Now just calls distribution logic
  - `syncPRApprovalsGiven()`: Now just calls distribution logic

- **`electron/sync/engine.ts`**: Updated sync orchestration
  - `syncAllReposOnce()`: New function to sync all unique repos before developer syncs
  - `syncAll()`: Calls repo sync before developer syncs

## Performance Impact

### API Calls Reduced

**Before**: `N developers × M repos = N×M API calls`
**After**: `M unique repos = M API calls`

**Example**: 10 developers, 5 repos
- Before: 10 × 5 = **50 API calls**
- After: **5 API calls**
- **Reduction**: 90%

### Benefits

1. **Faster syncs**: Fewer API calls = faster completion
2. **Lower rate limit usage**: GitHub rate limits are per-token, not per-repo
3. **Reduced network load**: Especially beneficial for teams with many shared repos
4. **Better scalability**: Sync time grows with unique repos, not developers

## Data Flow

```
GitHub API
    ↓
Repo-level Cache (cached_repo_pr_*)
    ↓
Distribution Logic (filters by author)
    ↓
Developer Cache (cached_pr_review_comments, cached_pr_comments_received, cached_pr_approvals_given)
    ↓
Dashboard UI
```

## Backward Compatibility

- Existing per-developer cache tables remain unchanged
- Dashboard queries unchanged (still read from developer cache)
- Incremental sync cursors maintained at both repo and developer levels
- Migration v22 runs automatically on app start

## Future Optimizations

Potential further improvements:
1. **Smart cache invalidation**: Only re-sync repos with activity
2. **Parallel repo syncs**: Fetch multiple repos concurrently
3. **Org-level caching**: For organization-wide data like team rosters
4. **Delta updates**: Only fetch new comments since last sync, not full repo history

## Testing

The optimization has been validated through:
1. TypeScript compilation (no type errors)
2. ESLint checks (no lint errors)
3. Migration smoke test (schema migration successful)
4. Manual testing recommended before production deployment

## Monitoring

Track these metrics to verify optimization effectiveness:
- Sync duration per developer (should decrease)
- GitHub API rate limit usage (should decrease significantly)
- Database size (repo cache adds overhead, but net benefit)

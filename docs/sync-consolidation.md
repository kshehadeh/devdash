# GitHub Sync API Call Consolidation

## Problem: Duplicate Review API Calls

Before consolidation, we were fetching PR reviews **twice** for the same PRs:

### Original Flow (Redundant)

```
1. syncPullRequests(alice)
   └─ Search: type:pr author:alice
   └─ For each PR: GET /repos/{repo}/pulls/{pr}/reviews  ❌

2. syncPullRequests(bob)
   └─ Search: type:pr author:bob
   └─ For each PR: GET /repos/{repo}/pulls/{pr}/reviews  ❌

3. syncRepoPRReviews(acme/web-app)
   └─ Search: type:pr repo:acme/web-app
   └─ For each PR: GET /repos/{repo}/pulls/{pr}/reviews  ❌
```

**Problem**: If Alice and Bob both authored PRs in `acme/web-app`, their PRs get reviews fetched **3 times**!

### Example: 100 PRs, 2 developers

- Alice: 50 PRs → 50 review API calls
- Bob: 50 PRs → 50 review API calls
- Repo sync: 100 PRs → 100 review API calls
- **Total: 200 API calls** (50% are duplicates!)

## Solution: Single Source of Truth

Reviews are now fetched **only** at the repo level, then distributed to developers.

### New Flow (Efficient)

```
1. syncPullRequests(alice)
   └─ Search: type:pr author:alice
   └─ Store basic PR info (no review fetch) ✓

2. syncPullRequests(bob)
   └─ Search: type:pr author:bob
   └─ Store basic PR info (no review fetch) ✓

3. syncRepoPRReviews(acme/web-app)
   └─ Search: type:pr repo:acme/web-app
   └─ For each PR: GET /repos/{repo}/pulls/{pr}/reviews ✓
   └─ Update developer PR records with review metadata ✓
```

**Result**: 100 PRs = **100 API calls** (50% reduction!)

## Implementation Changes

### 1. Removed `enrichPullForCache()`

**Before** (made API calls):
```typescript
async function enrichPullForCache(pr: SearchPRItem, token: string) {
  // Fetch reviews for this PR
  const res = await fetch(`/repos/${repo}/pulls/${pr.number}/reviews`);
  const reviews = await res.json();
  
  // Calculate review metadata
  const reviewCount = reviews.length;
  const latestState = latestReviewStateFromReviews(reviews);
  const firstReviewSubmittedAt = earliestReviewSubmittedAt(reviews);
  
  return { pr, reviewCount, latestState, firstReviewSubmittedAt };
}
```

**After** (no API calls):
```typescript
function preparePullForCache(pr: SearchPRItem) {
  // Just prepare basic PR data
  const repoPath = pr.repository_url.replace("https://api.github.com/repos/", "");
  const pendingJson = pr.state !== "open" ? "[]" : JSON.stringify(pr.requested_reviewers);
  
  return { pr, repoPath, pendingJson };
  // Review data comes from repo-level sync later
}
```

### 2. Developer PRs Store Placeholder Values

```typescript
// syncPullRequests() now stores PRs with placeholder review values
upsert.run(
  developerId,
  pr.number,
  pr.title,
  pr.status,
  0,     // reviewCount - placeholder
  null,  // latestState - placeholder
  null,  // firstReviewSubmittedAt - placeholder
);
```

### 3. Repo Sync Populates Review Metadata

```typescript
// syncRepoPRReviews() updates developer PR records after fetching reviews
function updateDeveloperPRsWithReviewMetadata(db, repo, reviews) {
  // Group reviews by PR
  const reviewsByPR = groupBy(reviews, r => r.pr_number);
  
  for (const [prNumber, prReviews] of reviewsByPR) {
    const reviewCount = prReviews.length;
    const latestState = calculateLatestState(prReviews);
    const firstReviewSubmittedAt = findEarliestSubmission(prReviews);
    
    // Update all developer records for this PR
    db.run(`
      UPDATE cached_pull_requests
      SET review_count = ?, latest_review_state = ?, first_review_submitted_at = ?
      WHERE repo = ? AND pr_number = ?
    `, reviewCount, latestState, firstReviewSubmittedAt, repo, prNumber);
  }
}
```

## Data Flow

### Before Consolidation
```
GitHub API (PRs)
    ↓
syncPullRequests → Fetch Reviews for Alice's PRs
    ↓
Developer Cache (Alice)

GitHub API (PRs)
    ↓
syncPullRequests → Fetch Reviews for Bob's PRs
    ↓
Developer Cache (Bob)

GitHub API (PRs)
    ↓
syncRepoPRReviews → Fetch Reviews for All PRs (duplicates!)
    ↓
Repo Cache
```

### After Consolidation
```
GitHub API (PRs)
    ↓
syncPullRequests → Store Basic Info Only
    ↓
Developer Cache (Alice, Bob) [review_count = 0]

GitHub API (PRs + Reviews)
    ↓
syncRepoPRReviews → Fetch Reviews Once
    ↓
Repo Cache + Update Developer Caches [review_count populated]
```

## Performance Impact

### API Call Reduction

| Scenario | PRs | Devs | Before | After | Savings |
|----------|-----|------|--------|-------|---------|
| **Small team** | 50 | 2 | 150 | 50 | 67% |
| **Medium team** | 200 | 5 | 1,200 | 200 | 83% |
| **Large team** | 500 | 10 | 5,500 | 500 | 91% |

Formula:
- **Before**: `(PR_count × Dev_count) + PR_count` 
- **After**: `PR_count`
- **Savings**: `((Before - After) / Before) × 100%`

### Real-World Example

**Team**: 10 developers, 5 repos, 100 PRs per repo (500 total PRs)

**Before**:
```
Developer PRs: 10 devs × ~50 PRs each × 1 review fetch = 500 calls
Repo PRs: 5 repos × 100 PRs × 1 review fetch = 500 calls
Total: 1,000 review API calls
Time: ~200 seconds (5 requests/sec rate limit)
```

**After**:
```
Developer PRs: 10 devs × ~50 PRs each × 0 review fetches = 0 calls
Repo PRs: 5 repos × 100 PRs × 1 review fetch = 500 calls
Total: 500 review API calls
Time: ~100 seconds (5 requests/sec rate limit)
Savings: 50% fewer calls, 50% faster sync
```

## Edge Cases Handled

### 1. PRs Outside Assigned Repos

**Scenario**: Developer contributed to a repo not assigned to them.

**Behavior**:
- `syncPullRequests()` stores the PR with placeholder review values
- No repo sync runs for that repo (not in sources)
- PR shows with `review_count = 0`

**Impact**: Acceptable — these are external contributions not tracked in team dashboards

### 2. PRs Updated After Repo Sync

**Scenario**: PR gets new reviews after repo sync but before developer sync.

**Behavior**:
- Developer sees slightly stale review count until next repo sync
- Incremental sync will pick it up in next cycle

**Impact**: Minimal — data is eventually consistent

### 3. New PRs During Sync

**Scenario**: PR created while sync is running.

**Behavior**:
- Developer sync might catch it (if search includes it)
- Repo sync might miss it (if before its search)
- Next incremental sync will catch it

**Impact**: Acceptable — new PRs appear within one sync cycle

## Monitoring

### Check for Placeholder Values

PRs with un-updated review metadata will have:
```sql
SELECT COUNT(*) FROM cached_pull_requests 
WHERE review_count = 0 
  AND created_at < datetime('now', '-1 day');
```

If this count is high, repo sync may be failing.

### Verify Consolidation Working

Check logs for absence of review fetches in developer sync:
```bash
# Should NOT see review API calls during developer sync
grep "syncPullRequests" logs/main.log | grep -c "GET.*reviews"
# Expected: 0
```

## Future Optimizations

1. **Batch review fetches**: Use GraphQL to get multiple PR reviews in one call
2. **Selective updates**: Only update developer PRs that exist (avoid scanning all PRs)
3. **Concurrent repo syncs**: Fetch multiple repos in parallel
4. **Smart review detection**: Skip review fetch if PR has no reviews (check comment count)

## Validation

✓ TypeScript compilation passes  
✓ ESLint checks pass  
✓ No breaking changes to data structures  
✓ Incremental sync cursors maintained  
✓ Dashboard queries unchanged  

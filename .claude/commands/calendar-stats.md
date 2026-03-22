---
description: Query and summarize calendar adoption statistics from GitHub traffic data
---

# Calendar Stats

Query GitHub traffic data to estimate how many people are using the Livingston NJ School Calendar.

## Instructions

Run ALL of the following `gh api` commands in parallel, then summarize the results:

```bash
gh api repos/lankeami/livingstonnj-school-calendar/traffic/views
gh api repos/lankeami/livingstonnj-school-calendar/traffic/clones
gh api repos/lankeami/livingstonnj-school-calendar/traffic/popular/paths
gh api repos/lankeami/livingstonnj-school-calendar/traffic/popular/referrers
```

## How to interpret the data

- **Views**: People visiting the GitHub repo page (not the live site). "uniques" = distinct visitors.
- **Clones**: Git clones of the repo. High unique clones may indicate developer interest or CI activity.
- **Popular paths**: Which repo pages get the most traffic — shows what visitors are interested in.
- **Referrers**: Where traffic comes from (Google, direct, social, etc.).

### Estimating calendar subscribers

GitHub's traffic API does **not** track GitHub Pages file downloads (like `latest.ics`). The best available proxies are:

1. **Repo views** — people discovering the project
2. **Referrers** — how they found it
3. **Clone count** — developer adoption signal

For actual ICS subscriber counts, you would need to add a analytics service (e.g., Cloudflare, Plausible) in front of the GitHub Pages site, or use a redirect URL that logs fetches.

## Output format

Present a summary like this:

```
## Calendar Stats (last 14 days)

### Site Discovery
- Repo views: {count} total, {uniques} unique visitors
- Top referrers: {list}

### Developer Interest
- Clones: {count} total, {uniques} unique
- Most viewed pages: {top 3 paths}

### Daily Breakdown
| Date       | Views | Unique Views | Clones | Unique Clones |
|------------|-------|--------------|--------|---------------|
| YYYY-MM-DD |   N   |      N       |   N    |       N       |

(Only show days with non-zero activity)

### Notes
- GitHub traffic data covers the last 14 days only
- ICS subscriber count is not available via GitHub API — consider adding Cloudflare Analytics or Plausible for download tracking
```

# Skill Map — LeetCode topic analyzer

Paste a LeetCode username and see:
- Solved vs. total problems by difficulty (Easy/Medium/Hard)
- A "mastery grid" — every topic tag (Arrays, DP, Graphs, etc.) sized by how
  many problems exist and colored by your solve ratio, weakest first
- Your top weak and strong topics
- A short list of recommended unsolved problems per weak topic, easy → hard

## How it works

LeetCode's GraphQL API (`leetcode.com/graphql`) doesn't allow browser-based
cross-origin requests, so a browser can't call it directly. This app is a
small **Next.js** project: the page in `pages/index.js` calls a serverless
API route (`pages/api/analyze.js`), which does the LeetCode calls server-side
and returns the computed analysis as JSON.

Raw data comes entirely from LeetCode's own API:
1. `submitStatsGlobal` — your solved count per difficulty
2. `tagProblemCounts` — your solved count per topic tag
3. The full public problem catalog (~3,400 problems) — used to compute how
   many problems exist per tag, and as the source pool for recommendations
4. Your last 20 accepted submissions — used to avoid recommending something
   you just solved

Weak/strong topics are `solved / total` per tag, filtered to tags with at
least a handful of problems so tiny/rare tags don't dominate the list.

### The ML layer (`lib/ml.js`, wired up in `lib/leetcode.js`)

Two techniques, both implemented from scratch in plain JS (no `scikit-learn`,
no external ML package — kept dependency-free for easy grading/deployment):

**1. Content-based recommendation via cosine similarity**
Every problem is turned into a numeric feature vector: one-hot encoded topic
tags + normalized difficulty + normalized acceptance rate. Your profile
becomes a vector of the same shape, weighted toward your weak topics and a
difficulty target just above your solved-problem "comfort level" (computed
from your real Easy/Medium/Hard solve counts). Unsolved problems are ranked
by `cosine_similarity(userVector, problemVector)` — this is the same family
of technique used by "more like this" recommender systems.

**2. K-Means clustering for topic tiers**
Instead of trusting LeetCode's own fundamental/intermediate/advanced
labels, each topic tag is clustered (unsupervised, k=3) using its average
problem difficulty and catalog size as features. Lloyd's algorithm is
implemented from scratch in `lib/ml.js`, with deterministic centroid seeding
so results don't jump around between runs. Clusters are then ranked by
centroid difficulty into "Foundational / Developing / Advanced" tiers.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000 and try a LeetCode username (e.g. your own).

## Deploy (Vercel)

1. Push this folder to a GitHub repo
2. Go to https://vercel.com/new and import the repo
3. No environment variables are needed — click Deploy

Vercel's default settings work out of the box since this is a standard
Next.js app (Node serverless functions, no custom server).

## Known limitations

- LeetCode's GraphQL API is unofficial and occasionally rate-limits or
  blocks requests from data-center IPs (which includes serverless
  platforms). If analysis fails, wait a bit and retry.
- Recommendations exclude your last 20 accepted submissions, but LeetCode's
  public API doesn't expose a user's *full* solved-problem list without
  login — so a problem you solved a while ago could occasionally still show
  up as a suggestion.
- Only non-premium ("free") problems are counted and recommended.

const {
  fetchFullProblemList,
  fetchUserProfile,
  fetchTagStats,
  fetchRecentSolvedSlugs,
  analyze,
} = require("../../lib/leetcode");

// Module-level cache: the full problem catalog barely changes and is the
// most expensive call. Reusing it across warm invocations keeps things fast
// and avoids hammering LeetCode's API.
let cachedProblemList = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

async function getProblemList() {
  const now = Date.now();
  if (cachedProblemList && now - cachedAt < CACHE_TTL_MS) {
    return cachedProblemList;
  }
  const list = await fetchFullProblemList();
  cachedProblemList = list;
  cachedAt = now;
  return list;
}

export default async function handler(req, res) {
  const username = (req.query.username || "").trim();

  if (!username) {
    res.status(400).json({ error: "Missing username" });
    return;
  }

  try {
    const [profileData, tagCounts, problemList, recentSolvedSlugs] = await Promise.all([
      fetchUserProfile(username),
      fetchTagStats(username),
      getProblemList(),
      fetchRecentSolvedSlugs(username),
    ]);

    if (!profileData.matchedUser) {
      res.status(404).json({ error: `No LeetCode user found for "${username}"` });
      return;
    }

    const result = analyze({ profileData, tagCounts, problemList, recentSolvedSlugs });
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error:
        "Couldn't reach LeetCode's API right now. It occasionally rate-limits or blocks server IPs — try again in a moment.",
      detail: err.message,
    });
  }
}

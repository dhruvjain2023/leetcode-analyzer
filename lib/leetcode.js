const { cosineSimilarity, kMeans } = require("./ml");

const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";

async function lcQuery(query, variables) {
  const res = await fetch(LEETCODE_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com",
      "User-Agent": "Mozilla/5.0 (skill-map-app)",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode API responded with ${res.status}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

// Basic profile + difficulty breakdown
const PROFILE_QUERY = `
  query userProfile($username: String!) {
    allQuestionsCount {
      difficulty
      count
    }
    matchedUser(username: $username) {
      username
      profile {
        realName
        ranking
        userAvatar
      }
      submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
        }
      }
    }
  }
`;

// Per-tag solved counts
const TAG_STATS_QUERY = `
  query skillStats($username: String!) {
    matchedUser(username: $username) {
      tagProblemCounts {
        advanced {
          tagName
          tagSlug
          problemsSolved
        }
        intermediate {
          tagName
          tagSlug
          problemsSolved
        }
        fundamental {
          tagName
          tagSlug
          problemsSolved
        }
      }
    }
  }
`;

// Recent accepted submissions, used to avoid re-recommending problems
// the user has literally just solved.
const RECENT_AC_QUERY = `
  query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      titleSlug
    }
  }
`;


// Full problem catalog with tags, used to compute "how many problems
// exist per tag" and to source recommendations.
const PROBLEM_LIST_QUERY = `
  query problemsetQuestionList($skip: Int!, $limit: Int!) {
    problemsetQuestionList: questionList(
      categorySlug: ""
      limit: $limit
      skip: $skip
      filters: {}
    ) {
      total: totalNum
      questions: data {
        difficulty
        questionFrontendId
        paidOnly: isPaidOnly
        acRate
        title
        titleSlug
        topicTags {
          name
          slug
        }
      }
    }
  }
`;

async function fetchFullProblemList() {
  // LeetCode's catalog is ~3400 problems; one page covers it.
  const data = await lcQuery(PROBLEM_LIST_QUERY, { skip: 0, limit: 4000 });
  return data.problemsetQuestionList.questions.filter((q) => !q.paidOnly);
}

async function fetchUserProfile(username) {
  const data = await lcQuery(PROFILE_QUERY, { username });
  return data;
}

async function fetchTagStats(username) {
  const data = await lcQuery(TAG_STATS_QUERY, { username });
  return data.matchedUser ? data.matchedUser.tagProblemCounts : null;
}

async function fetchRecentSolvedSlugs(username) {
  try {
    const data = await lcQuery(RECENT_AC_QUERY, { username, limit: 20 });
    return new Set((data.recentAcSubmissionList || []).map((s) => s.titleSlug));
  } catch {
    // Non-critical; recommendations still work without this.
    return new Set();
  }
}

const DIFFICULTY_RANK = { Easy: 0, Medium: 1, Hard: 2 };
const DIFFICULTY_NUM = { Easy: 0, Medium: 0.5, Hard: 1 };
const NUM_CLUSTERS = 3;
const CLUSTER_LABELS = ["Foundational", "Developing", "Advanced"];

function analyze({ profileData, tagCounts, problemList, recentSolvedSlugs }) {
  if (!profileData.matchedUser) {
    return null;
  }

  const username = profileData.matchedUser.username;

  const solvedByDifficulty = {};
  profileData.matchedUser.submitStatsGlobal.acSubmissionNum.forEach((d) => {
    solvedByDifficulty[d.difficulty] = d.count;
  });

  const totalByDifficulty = {};
  profileData.allQuestionsCount.forEach((d) => {
    totalByDifficulty[d.difficulty] = d.count;
  });

  // Build tag -> totalProblems (non-paid) from the full catalog
  const tagTotals = new Map(); // slug -> { name, total, byDifficulty: {Easy,Medium,Hard}, problems: [] }
  problemList.forEach((q) => {
    q.topicTags.forEach((tag) => {
      if (!tagTotals.has(tag.slug)) {
        tagTotals.set(tag.slug, {
          slug: tag.slug,
          name: tag.name,
          total: 0,
          byDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
          problems: [],
        });
      }
      const entry = tagTotals.get(tag.slug);
      entry.total += 1;
      entry.byDifficulty[q.difficulty] += 1;
      entry.problems.push(q);
    });
  });

  // Merge in solved counts per tag from tagProblemCounts (fundamental/intermediate/advanced)
  const solvedBySlug = new Map();
  if (tagCounts) {
    ["fundamental", "intermediate", "advanced"].forEach((bucket) => {
      (tagCounts[bucket] || []).forEach((t) => {
        solvedBySlug.set(t.tagSlug, t.problemsSolved);
      });
    });
  }

  const MIN_TAG_SIZE = 4; // ignore tiny/niche tags to reduce noise

  const tagStats = Array.from(tagTotals.values())
    .filter((t) => t.total >= MIN_TAG_SIZE)
    .map((t) => {
      const solved = solvedBySlug.get(t.slug) || 0;
      const ratio = t.total > 0 ? solved / t.total : 0;
      return {
        slug: t.slug,
        name: t.name,
        total: t.total,
        solved,
        ratio,
        byDifficulty: t.byDifficulty,
      };
    })
    .sort((a, b) => a.ratio - b.ratio || b.total - a.total);

  const weakTags = tagStats.slice(0, 6);
  const strongTags = [...tagStats]
    .sort((a, b) => b.ratio - a.ratio || b.total - a.total)
    .filter((t) => t.solved > 0)
    .slice(0, 6);

  // ---------------------------------------------------------------------
  // ML STAGE 1 — Content-based recommendations via cosine similarity.
  //
  // Every problem becomes a numeric feature vector: one-hot topic tags +
  // normalized difficulty + normalized acceptance rate. The user becomes a
  // vector of the same shape, weighted toward their *weak* tags and a
  // difficulty target just above their current comfort level. Ranking
  // unsolved problems by cosine similarity to that user vector is a
  // standard content-based filtering approach (the same family of
  // technique as "more like this" recommenders).
  // ---------------------------------------------------------------------
  const tagIndex = tagStats.map((t) => t.slug); // dims 0..n-1
  const DIFF_DIM = tagIndex.length; // difficulty feature index
  const ACRATE_DIM = tagIndex.length + 1; // acceptance-rate feature index
  const VEC_LEN = tagIndex.length + 2;
  const tagPos = new Map(tagIndex.map((slug, i) => [slug, i]));

  function problemVector(p) {
    const vec = new Array(VEC_LEN).fill(0);
    p.topicTags.forEach((t) => {
      const i = tagPos.get(t.slug);
      if (i !== undefined) vec[i] = 1;
    });
    vec[DIFF_DIM] = DIFFICULTY_NUM[p.difficulty] ?? 0.5;
    vec[ACRATE_DIM] = typeof p.acRate === "number" ? p.acRate / 100 : 0.5;
    return vec;
  }

  // User's overall solved-difficulty comfort level, from real submission
  // history: mostly-Easy solvers get pushed toward Medium, etc.
  const totalSolvedCount =
    (solvedByDifficulty.Easy || 0) + (solvedByDifficulty.Medium || 0) + (solvedByDifficulty.Hard || 0);
  const comfortLevel = totalSolvedCount
    ? ((solvedByDifficulty.Easy || 0) * DIFFICULTY_NUM.Easy +
        (solvedByDifficulty.Medium || 0) * DIFFICULTY_NUM.Medium +
        (solvedByDifficulty.Hard || 0) * DIFFICULTY_NUM.Hard) /
      totalSolvedCount
    : 0;
  const targetDifficulty = Math.min(comfortLevel + 0.2, 1);

  const userVector = new Array(VEC_LEN).fill(0);
  tagIndex.forEach((slug, i) => {
    const t = tagStats.find((ts) => ts.slug === slug);
    userVector[i] = 1 - t.ratio; // weaker tag -> higher weight
  });
  userVector[DIFF_DIM] = targetDifficulty;
  userVector[ACRATE_DIM] = 0.5; // neutral; not a strong signal either way

  const candidatePool = problemList.filter((p) => !recentSolvedSlugs.has(p.titleSlug));

  const scored = candidatePool.map((p) => ({
    p,
    score: cosineSimilarity(userVector, problemVector(p)),
  }));
  scored.sort((a, b) => b.score - a.score);

  const weakSlugSet = new Set(weakTags.map((t) => t.slug));
  const recommendations = scored.slice(0, 12).map(({ p, score }) => ({
    title: p.title,
    titleSlug: p.titleSlug,
    difficulty: p.difficulty,
    frontendId: p.questionFrontendId,
    url: `https://leetcode.com/problems/${p.titleSlug}/`,
    matchScore: Math.round(score * 100),
    matchedTags: p.topicTags.filter((t) => weakSlugSet.has(t.slug)).map((t) => t.name),
  }));

  // ---------------------------------------------------------------------
  // ML STAGE 2 — K-Means clustering of topics into difficulty tiers.
  //
  // Rather than trusting LeetCode's own fundamental/intermediate/advanced
  // labels, we cluster each tag ourselves from two derived features: its
  // average problem difficulty and its (log-scaled) catalog size. K-Means
  // (Lloyd's algorithm, implemented from scratch in lib/ml.js) groups tags
  // into unsupervised tiers, which we then order by centroid difficulty.
  // ---------------------------------------------------------------------
  const clusterFeatures = tagStats.map((t) => {
    const bd = t.byDifficulty;
    const avgDifficulty =
      (bd.Easy * DIFFICULTY_NUM.Easy + bd.Medium * DIFFICULTY_NUM.Medium + bd.Hard * DIFFICULTY_NUM.Hard) /
      Math.max(t.total, 1);
    return [avgDifficulty, Math.log(t.total + 1)];
  });

  let tagTiers = [];
  if (tagStats.length >= NUM_CLUSTERS) {
    const { labels, centroids } = kMeans(clusterFeatures, NUM_CLUSTERS);
    const clusterOrder = centroids
      .map((c, idx) => ({ idx, difficulty: c[0] }))
      .sort((a, b) => a.difficulty - b.difficulty)
      .map((c, rank) => ({ ...c, rank }));
    const clusterRank = new Map(clusterOrder.map((c) => [c.idx, c.rank]));

    const buckets = CLUSTER_LABELS.map(() => []);
    tagStats.forEach((t, i) => {
      const rank = clusterRank.get(labels[i]) ?? 0;
      buckets[rank].push(t);
    });
    tagTiers = CLUSTER_LABELS.map((label, i) => ({
      tier: label,
      tags: buckets[i].sort((a, b) => a.ratio - b.ratio),
    })).filter((tier) => tier.tags.length > 0);
  }

  return {
    username,
    solvedByDifficulty,
    totalByDifficulty,
    tagStats,
    weakTags,
    strongTags,
    recommendations,
    tagTiers,
  };
}

module.exports = {
  fetchFullProblemList,
  fetchUserProfile,
  fetchTagStats,
  fetchRecentSolvedSlugs,
  analyze,
};

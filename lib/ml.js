// Lightweight ML utilities — implemented from scratch (no external ML libs)
// so the project has zero extra dependencies to install/deploy.

/**
 * Cosine similarity between two equal-length numeric vectors.
 * Returns a value in [0, 1] here since all our feature values are >= 0.
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Min-max normalize each feature dimension across all points to [0, 1],
 * so no single feature (e.g. raw problem count) dominates the distance
 * metric used by K-Means.
 */
function minMaxNormalize(points) {
  const dims = points[0].length;
  const mins = new Array(dims).fill(Infinity);
  const maxs = new Array(dims).fill(-Infinity);

  points.forEach((p) => {
    for (let d = 0; d < dims; d++) {
      if (p[d] < mins[d]) mins[d] = p[d];
      if (p[d] > maxs[d]) maxs[d] = p[d];
    }
  });

  return points.map((p) =>
    p.map((v, d) => {
      const range = maxs[d] - mins[d];
      return range === 0 ? 0 : (v - mins[d]) / range;
    })
  );
}

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * K-Means clustering (Lloyd's algorithm), implemented from scratch.
 * Initial centroids are chosen deterministically (evenly spaced along the
 * points sorted by their first feature) instead of randomly, so results are
 * stable/reproducible run to run rather than shuffling on every page load.
 *
 * @param {number[][]} points - raw (not yet normalized) feature vectors
 * @param {number} k - number of clusters
 * @param {number} maxIter
 * @returns {{ labels: number[], centroids: number[][] }}
 */
function kMeans(points, k, maxIter = 25) {
  if (points.length === 0) return { labels: [], centroids: [] };
  const n = points.length;
  const dims = points[0].length;
  const effectiveK = Math.min(k, n);

  const normalized = minMaxNormalize(points);

  // Deterministic seeding: sort by first feature, pick evenly spaced indices.
  const sortedIdx = [...Array(n).keys()].sort(
    (a, b) => normalized[a][0] - normalized[b][0]
  );
  let centroids = [];
  for (let i = 0; i < effectiveK; i++) {
    const idx = sortedIdx[Math.floor((i * (n - 1)) / Math.max(effectiveK - 1, 1))];
    centroids.push([...normalized[idx]]);
  }

  let labels = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    // Assignment step
    for (let i = 0; i < n; i++) {
      let bestDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < centroids.length; c++) {
        const dist = euclidean(normalized[i], centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCluster = c;
        }
      }
      if (labels[i] !== bestCluster) changed = true;
      labels[i] = bestCluster;
    }

    // Update step
    const sums = Array.from({ length: centroids.length }, () => new Array(dims).fill(0));
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < n; i++) {
      counts[labels[i]] += 1;
      for (let d = 0; d < dims; d++) sums[labels[i]][d] += normalized[i][d];
    }
    centroids = centroids.map((old, c) =>
      counts[c] === 0 ? old : sums[c].map((s) => s / counts[c])
    );

    if (!changed) break;
  }

  return { labels, centroids };
}

module.exports = { cosineSimilarity, minMaxNormalize, kMeans };

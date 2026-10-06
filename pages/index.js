import { useState } from "react";
import Head from "next/head";

function ratioColor(ratio) {
  // 0 -> hard/red, 0.5 -> medium/amber, 1 -> easy/green
  const stops = [
    { r: 0, c: [239, 91, 91] },
    { r: 0.5, c: [242, 185, 12] },
    { r: 1, c: [62, 207, 142] },
  ];
  let a = stops[0],
    b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (ratio >= stops[i].r && ratio <= stops[i + 1].r) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const span = b.r - a.r || 1;
  const t = (ratio - a.r) / span;
  const rgb = a.c.map((v, i) => Math.round(v + (b.c[i] - v) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function DifficultyPill({ difficulty }) {
  const colorMap = { Easy: "var(--easy)", Medium: "var(--medium)", Hard: "var(--hard)" };
  return (
    <span
      style={{
        color: colorMap[difficulty] || "var(--text-muted)",
        border: `1px solid ${colorMap[difficulty] || "var(--text-muted)"}`,
        borderRadius: 4,
        padding: "1px 6px",
        fontSize: 11,
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        letterSpacing: "0.03em",
      }}
    >
      {difficulty}
    </span>
  );
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | error | done
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  async function runAnalysis(e) {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;
    setStatus("loading");
    setError("");
    setData(null);
    try {
      const res = await fetch(`/api/analyze?username=${encodeURIComponent(u)}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Something went wrong");
      }
      setData(json);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  const diffOrder = ["Easy", "Medium", "Hard"];

  return (
    <>
      <Head>
        <title>Skill Map — LeetCode topic analysis</title>
        <meta
          name="description"
          content="Paste a LeetCode username to see your weak and strong topics, and get problems to practice next."
        />
      </Head>

      <main className="wrap">
        <section className="hero">
          <div className="eyebrow">topic-level analysis, not just a solve count</div>
          <h1>
            See where your <span className="accentEasy">solves</span> actually cluster.
          </h1>
          <p className="sub">
            Paste a LeetCode username. We pull your per-topic solve counts against
            LeetCode&rsquo;s full problem catalog and map out exactly which topics are
            carrying you — and which ones are quietly costing you interviews.
          </p>

          <form className="terminal" onSubmit={runAnalysis}>
            <span className="prompt">lc-skillmap ~ analyze</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-leetcode-username"
              autoComplete="off"
              spellCheck="false"
            />
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "running…" : "run →"}
            </button>
          </form>
          {status === "error" && <div className="errorBox">{error}</div>}
        </section>

        {data && (
          <>
            <section className="summary">
              <div className="summaryHead">
                <span className="muted">analysis for</span>
                <span className="userTag">@{data.username}</span>
              </div>
              <div className="diffRow">
                {diffOrder.map((d) => {
                  const solved = data.solvedByDifficulty[d] || 0;
                  const total = data.totalByDifficulty[d] || 0;
                  const pct = total ? Math.round((solved / total) * 100) : 0;
                  return (
                    <div className="diffCard" key={d}>
                      <DifficultyPill difficulty={d} />
                      <div className="diffCount">
                        {solved}
                        <span className="diffTotal"> / {total}</span>
                      </div>
                      <div className="diffBarTrack">
                        <div
                          className="diffBarFill"
                          style={{
                            width: `${pct}%`,
                            background:
                              d === "Easy" ? "var(--easy)" : d === "Medium" ? "var(--medium)" : "var(--hard)",
                          }}
                        />
                      </div>
                      <div className="diffPct">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="gridSection">
              <h2>Mastery grid</h2>
              <p className="sectionSub">
                Every topic with at least a handful of problems, sorted weakest → strongest.
                Bar color and fill both track your solved ratio.
              </p>
              <div className="masteryGrid">
                {data.tagStats.map((t) => (
                  <div className="tile" key={t.slug}>
                    <div className="tileName">{t.name}</div>
                    <div className="tileBarTrack">
                      <div
                        className="tileBarFill"
                        style={{
                          width: `${Math.max(t.ratio * 100, t.solved > 0 ? 4 : 0)}%`,
                          background: ratioColor(t.ratio),
                        }}
                      />
                    </div>
                    <div className="tileMeta">
                      {t.solved}/{t.total} solved
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="twoCol">
              <div>
                <h2>
                  Weak areas <span className="tag hard">focus here</span>
                </h2>
                <ul className="tagList">
                  {data.weakTags.map((t) => (
                    <li key={t.slug}>
                      <span className="tagName">{t.name}</span>
                      <span className="tagRatio" style={{ color: ratioColor(t.ratio) }}>
                        {Math.round(t.ratio * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2>
                  Strong areas <span className="tag easy">keep sharp</span>
                </h2>
                <ul className="tagList">
                  {data.strongTags.length === 0 && (
                    <li className="muted">Solve a few more problems to surface strengths.</li>
                  )}
                  {data.strongTags.map((t) => (
                    <li key={t.slug}>
                      <span className="tagName">{t.name}</span>
                      <span className="tagRatio" style={{ color: ratioColor(t.ratio) }}>
                        {Math.round(t.ratio * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {data.tagTiers && data.tagTiers.length > 0 && (
              <section className="tierSection">
                <h2>
                  Topic tiers <span className="tag ml">k-means clustering</span>
                </h2>
                <p className="sectionSub">
                  Topics grouped into tiers by an unsupervised K-Means model (run from scratch,
                  no external ML library) over each topic&rsquo;s average problem difficulty and
                  catalog size — not LeetCode&rsquo;s own labels.
                </p>
                <div className="tierGrid">
                  {data.tagTiers.map((tier) => (
                    <div className="tierCard" key={tier.tier}>
                      <div className="tierName">{tier.tier}</div>
                      <div className="tierTags">
                        {tier.tags.map((t) => (
                          <span key={t.slug} className="tierChip">
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="recSection">
              <h2>
                Recommended next <span className="tag ml">cosine similarity</span>
              </h2>
              <p className="sectionSub">
                Every free problem is a feature vector (topic tags + difficulty + acceptance
                rate). Your profile is a vector weighted toward weak topics and a difficulty just
                above your comfort level. Ranked by cosine similarity between the two — highest
                match first.
              </p>
              <div className="recGrid">
                {data.recommendations.map((p) => (
                  <div className="recCard" key={p.titleSlug}>
                    <div className="recCardTop">
                      <a
                        className="recTitle"
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {p.frontendId}. {p.title}
                      </a>
                      <span className="matchScore">{p.matchScore}% match</span>
                    </div>
                    <div className="recCardBottom">
                      <DifficultyPill difficulty={p.difficulty} />
                      {p.matchedTags.slice(0, 2).map((name) => (
                        <span className="tierChip" key={name}>
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="footer">
          <span>Data pulled live from LeetCode&rsquo;s public API. Nothing is stored.</span>
        </footer>
      </main>

      <style jsx>{`
        .wrap {
          max-width: 960px;
          margin: 0 auto;
          padding: 64px 24px 96px;
        }
        .hero h1 {
          font-family: var(--font-display);
          font-size: clamp(28px, 4.5vw, 44px);
          line-height: 1.15;
          font-weight: 700;
          margin: 12px 0 16px;
          letter-spacing: -0.01em;
        }
        .accentEasy {
          color: var(--easy);
        }
        .eyebrow {
          font-family: var(--font-display);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .sub {
          color: var(--text-muted);
          font-size: 16px;
          line-height: 1.6;
          max-width: 640px;
          margin: 0 0 32px;
        }
        .terminal {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 14px 16px;
          font-family: var(--font-display);
        }
        .prompt {
          color: var(--link);
          font-size: 13px;
          white-space: nowrap;
        }
        .terminal input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text);
          font-family: var(--font-display);
          font-size: 15px;
          outline: none;
          min-width: 0;
        }
        .terminal input::placeholder {
          color: #45504f;
        }
        .terminal button {
          background: var(--easy);
          color: #06120c;
          border: none;
          border-radius: 6px;
          padding: 9px 16px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }
        .terminal button:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .errorBox {
          margin-top: 14px;
          color: var(--hard);
          font-size: 14px;
          font-family: var(--font-display);
        }

        .summary {
          margin-top: 56px;
          padding-top: 32px;
          border-top: 1px solid var(--border);
        }
        .summaryHead {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 18px;
        }
        .muted {
          color: var(--text-muted);
        }
        .small {
          font-size: 13px;
        }
        .userTag {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
        }
        .diffRow {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .diffCard {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 16px;
        }
        .diffCount {
          font-family: var(--font-display);
          font-size: 26px;
          font-weight: 700;
          margin: 10px 0 8px;
        }
        .diffTotal {
          font-size: 14px;
          color: var(--text-muted);
          font-weight: 500;
        }
        .diffBarTrack {
          height: 6px;
          background: #232b2e;
          border-radius: 3px;
          overflow: hidden;
        }
        .diffBarFill {
          height: 100%;
        }
        .diffPct {
          margin-top: 6px;
          font-size: 12px;
          color: var(--text-muted);
          font-family: var(--font-display);
        }

        h2 {
          font-family: var(--font-display);
          font-size: 20px;
          margin: 0 0 6px;
        }
        .sectionSub {
          color: var(--text-muted);
          font-size: 14px;
          margin: 0 0 20px;
          max-width: 560px;
        }
        .gridSection {
          margin-top: 56px;
        }
        .masteryGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px;
        }
        .tile {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
        }
        .tileName {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tileBarTrack {
          height: 5px;
          background: #232b2e;
          border-radius: 3px;
          overflow: hidden;
        }
        .tileBarFill {
          height: 100%;
        }
        .tileMeta {
          margin-top: 8px;
          font-size: 11px;
          color: var(--text-muted);
          font-family: var(--font-display);
        }

        .twoCol {
          margin-top: 56px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
        }
        .tag {
          font-family: var(--font-display);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-radius: 4px;
          padding: 2px 6px;
          margin-left: 8px;
          vertical-align: middle;
        }
        .tag.hard {
          color: var(--hard);
          border: 1px solid var(--hard);
        }
        .tag.easy {
          color: var(--easy);
          border: 1px solid var(--easy);
        }
        .tag.ml {
          color: var(--link);
          border: 1px solid var(--link);
        }

        .tierSection {
          margin-top: 56px;
        }
        .tierGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 14px;
        }
        .tierCard {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 16px;
        }
        .tierName {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 14px;
          margin-bottom: 10px;
        }
        .tierTags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .tierChip {
          font-size: 11px;
          font-family: var(--font-display);
          background: var(--panel-raised);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 2px 7px;
          color: var(--text-muted);
        }
        .tagList {
          list-style: none;
          padding: 0;
          margin: 16px 0 0;
        }
        .tagList li {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
          font-size: 14px;
        }
        .tagRatio {
          font-family: var(--font-display);
          font-weight: 700;
        }

        .recSection {
          margin-top: 56px;
        }
        .recGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 14px;
        }
        .recCard {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 14px;
        }
        .recCardTop {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 10px;
        }
        .recTitle {
          font-size: 13px;
          text-decoration: none;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .recTitle:hover {
          text-decoration: underline;
        }
        .matchScore {
          font-family: var(--font-display);
          font-size: 11px;
          color: var(--easy);
          white-space: nowrap;
        }
        .recCardBottom {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .footer {
          margin-top: 72px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
          color: var(--text-muted);
          font-size: 12px;
          font-family: var(--font-display);
        }

        @media (max-width: 640px) {
          .diffRow {
            grid-template-columns: 1fr;
          }
          .twoCol {
            grid-template-columns: 1fr;
          }
          .terminal {
            flex-wrap: wrap;
          }
          .terminal button {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

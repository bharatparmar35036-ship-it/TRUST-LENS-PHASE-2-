/* =====================================================
   DOMAIN SCORER – Source Credibility Evaluation (v2)
   ===================================================== */

export function evaluateDomain(domain) {

  if (!domain || typeof domain !== "string") {
    return {
      level: "Unknown",
      scoreAdjustment: 0
    };
  }

  const lower = domain.toLowerCase();

  /* ---------------- HIGH TRUST DOMAINS ---------------- */

  const highTrustPatterns = [
    ".gov",
    ".edu",
    "who.int",
    "un.org",
    "bbc.com",
    "reuters.com",
    "apnews.com"
  ];

  /* ---------------- LOW TRUST PATTERNS ---------------- */

  const lowTrustPatterns = [
    "blogspot",
    "wordpress",
    "rumor",
    "clickbait",
    "fake",
    "unknown"
  ];

  /* ---------------- CHECK HIGH TRUST ---------------- */

  for (const pattern of highTrustPatterns) {
    if (lower.includes(pattern)) {
      return {
        level: "High",
        scoreAdjustment: +10
      };
    }
  }

  /* ---------------- CHECK LOW TRUST ---------------- */

  for (const pattern of lowTrustPatterns) {
    if (lower.includes(pattern)) {
      return {
        level: "Low",
        scoreAdjustment: -10
      };
    }
  }

  /* ---------------- DEFAULT ---------------- */

  return {
    level: "Medium",
    scoreAdjustment: 0
  };
}

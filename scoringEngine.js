/* =====================================================
   SCORING ENGINE – Hybrid Combination Logic (v3)
   ===================================================== */

/* ---------------- READ WEIGHTS FROM ENV ---------------- */

const RULE_WEIGHT = parseFloat(process.env.WEIGHT_RULE_ENGINE) || 0.55;
const AI_WEIGHT = parseFloat(process.env.WEIGHT_AI_ENGINE) || 0.45;

/* =====================================================
   COMBINE SCORES
   ===================================================== */

export function combineScores(ruleScore, aiScore) {

  // Basic weighted score
  let combined =
    (ruleScore * RULE_WEIGHT) +
    (aiScore * AI_WEIGHT);

  /* ---------------- CONFLICT ADJUSTMENT ---------------- */

  const difference = Math.abs(ruleScore - aiScore);

  if (difference >= 30) {
    // If engines strongly disagree, reduce confidence slightly
    combined -= 5;
  }

  /* ---------------- EXTREME PENALTY BOOST ---------------- */

  if (ruleScore < 30 && aiScore < 40) {
    combined -= 5;
  }

  /* ---------------- EXTREME RELIABILITY BOOST ---------------- */

  if (ruleScore > 80 && aiScore > 80) {
    combined += 3;
  }

  /* ---------------- CLAMP BETWEEN 0–100 ---------------- */

  combined = Math.max(0, Math.min(100, Math.round(combined)));

  return combined;
}

/* =====================================================
   RISK CLASSIFICATION
   ===================================================== */

export function classifyRisk(score) {

  const reliable = parseInt(process.env.CONFIDENCE_RELIABLE) || 80;
  const questionable = parseInt(process.env.CONFIDENCE_QUESTIONABLE) || 60;
  const misleading = parseInt(process.env.CONFIDENCE_MISLEADING) || 40;

  if (score >= reliable) return "Reliable";
  if (score >= questionable) return "Questionable";
  if (score >= misleading) return "Misleading";
  return "High Risk";
}

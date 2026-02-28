console.log("VERIFY ROUTE VERSION 6 ACTIVE");
import express from "express";
import NodeCache from "node-cache";
import crypto from "crypto";

import { runRuleEngine } from "../services/ruleEngine.js";
import { runAIEngine } from "../services/aiEngine.js";
import { combineScores, classifyRisk } from "../services/scoringEngine.js";
import { evaluateDomain } from "../services/domainScorer.js";

const router = express.Router();

const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL) || 3600
});

/* =====================================================
   Utilities
===================================================== */

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function generateCacheKey(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/* =====================================================
   POST /api/v1/verify
===================================================== */

router.post("/", async (req, res) => {
  const startTime = Date.now();

  try {
    const { text, domain } = req.body;

    if (
      !text ||
      typeof text !== "string" ||
      text.length < (parseInt(process.env.MIN_TEXT_LENGTH) || 15)
    ) {
      return res.status(400).json({
        error: "Invalid or insufficient text input"
      });
    }

    const normalizedText = normalizeText(text);
    const cacheKey = generateCacheKey(normalizedText);

    /* ---------------- CACHE CHECK ---------------- */

    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    /* ---------------- PARALLEL ENGINE EXECUTION ---------------- */

    const [ruleResult, aiResult] = await Promise.allSettled([
      runRuleEngine(normalizedText),
      process.env.ENABLE_GEMINI === "true"
        ? runAIEngine(normalizedText)
        : Promise.resolve({ score: 50, explanation: ["AI disabled"] })
    ]);

    const ruleScore =
      ruleResult.status === "fulfilled" ? ruleResult.value.score : 50;

    const aiScore =
      aiResult.status === "fulfilled" ? aiResult.value.score : 50;

    const ruleExplanation =
      ruleResult.status === "fulfilled"
        ? ruleResult.value.explanation
        : ["Rule engine failed"];

    const aiExplanation =
      aiResult.status === "fulfilled"
        ? aiResult.value.explanation
        : ["AI engine failed"];

    /* ---------------- COMBINE SCORES ---------------- */

    console.log(`[TrustLens] ruleScore=${ruleScore} | aiScore=${aiScore} | text.length=${normalizedText.length} | domain="${domain}"`);

    let finalScore = combineScores(ruleScore, aiScore);

    /* ---------------- DOMAIN SCORING ---------------- */

    const sourceCredibility =
      process.env.ENABLE_DOMAIN_SCORING === "true"
        ? evaluateDomain(domain)
        : { level: "Unknown", scoreAdjustment: 0 };

    /* Apply domain score adjustment and re-clamp */
    if (sourceCredibility && typeof sourceCredibility.scoreAdjustment === "number") {
      finalScore = Math.max(0, Math.min(100, finalScore + sourceCredibility.scoreAdjustment));
    }

    const riskLevel = classifyRisk(finalScore);
    console.log(`[TrustLens] finalScore=${finalScore} | riskLevel=${riskLevel}`);

    /* ---------------- FINAL RESPONSE ---------------- */

    const result = {
      originalText: text.slice(0, 200),
      trustScore: finalScore,
      riskLevel,
      sourceCredibility,
      explanation: [
        ...ruleExplanation,
        ...aiExplanation
      ].join(" "),
      engines: {
        ruleScore,
        aiScore
      },
      responseTime: Date.now() - startTime
    };

    cache.set(cacheKey, result);

    return res.json(result);

  } catch (error) {
    console.error("Verification Error:", error);

    return res.status(500).json({
      error: "Hybrid verification failed"
    });
  }
});

export default router;


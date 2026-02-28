/* =====================================================
   EXPLAIN ROUTE  –  POST /api/v1/explain
   ===================================================== */

import express from "express";
import NodeCache from "node-cache";
import crypto from "crypto";

import { generateExplanation, getFallbackExplanation } from "../services/explanationEngine.js";

const router = express.Router();

/* Cache TTL from env (default 1 hour) */
const cache = new NodeCache({
    stdTTL: parseInt(process.env.CACHE_TTL) || 3600
});

/* ── Collision-resistant cache key ──
   Includes sorted indicators so same domain+score with different content → different key */
function buildCacheKey({ score, riskLevel, engines, indicators, domain }) {
    const payload = {
        score: Number(score),
        riskLevel: String(riskLevel || ""),
        ruleScore: Number(engines?.ruleScore ?? 0),
        aiScore: Number(engines?.aiScore ?? 0),
        indicators: Array.isArray(indicators)
            ? [...indicators].sort().join("|")
            : "",
        domain: String(domain || "")
    };
    return "exp_" + crypto.createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
}

/* ── POST /api/v1/explain ── */
router.post("/", async (req, res) => {
    const startTime = Date.now();

    try {
        const { score, riskLevel, engines, indicators, domain } = req.body;

        /* Basic validation */
        if (score === undefined || score === null || typeof riskLevel !== "string") {
            return res.status(400).json({ error: "score and riskLevel are required" });
        }

        const cacheKey = buildCacheKey({ score, riskLevel, engines, indicators, domain });

        /* Cache hit */
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json({ explanation: cached, cached: true, responseTime: Date.now() - startTime });
        }

        /* Generate explanation */
        const explanation = await generateExplanation({
            score: Number(score),
            riskLevel,
            engines: engines || {},
            indicators: Array.isArray(indicators) ? indicators : [],
            domain: String(domain || "")
        });

        cache.set(cacheKey, explanation);

        return res.json({ explanation, cached: false, responseTime: Date.now() - startTime });

    } catch (error) {
        console.error("[ExplainRoute] Error:", error.message);

        /* Always return something usable */
        const fallback = getFallbackExplanation(
            Number(req.body?.score ?? 50),
            String(req.body?.riskLevel ?? "Unknown")
        );

        return res.json({
            explanation: fallback,
            cached: false,
            fallback: true,
            responseTime: Date.now() - startTime
        });
    }
});

export default router;

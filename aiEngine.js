import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = process.env.ENABLE_GEMINI === "true"
  ? new GoogleGenerativeAI((process.env.GEMINI_API_KEY || "").trim())
  : null;

/* ─────────────────────────────────────────────────────────────
   TEXT-AWARE fallback score — varies by content characteristics
   so scores are NEVER identical just because the AI is offline.
   ──────────────────────────────────────────────────────────── */
function computeFallbackScore(text) {
  if (!text || text.length === 0) return 50;

  const lower = text.toLowerCase();
  let score = 50;

  // Length bonus
  if (text.length > 600) score += 8;
  else if (text.length > 300) score += 4;
  else if (text.length < 60) score -= 6;

  // Credibility signals
  const positiveWords = ["research", "study", "according", "data", "evidence", "expert",
    "published", "report", "analysis", "survey", "laboratory", "university",
    "government", "official", "statistics", "fact", "confirmed", "verified"];
  const positiveHits = positiveWords.filter(w => lower.includes(w)).length;
  score += Math.min(positiveHits * 3, 15);

  // Negative signals
  const negativeWords = ["shocking", "viral", "secret", "they don't want", "exposed",
    "miracle", "conspiracy", "fake", "hoax", "lies", "unbelievable",
    "urgent", "breaking", "banned", "censored"];
  const negativeHits = negativeWords.filter(w => lower.includes(w)).length;
  score -= Math.min(negativeHits * 5, 20);

  // All-caps ratio
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.25) score -= 8;
  else if (capsRatio < 0.05) score += 2;

  // Numerical data presence
  const numCount = (text.match(/\b\d[\d,.%]*\b/g) || []).length;
  if (numCount >= 4) score += 6;
  else if (numCount >= 2) score += 3;

  // Punctuation extremes
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations >= 4) score -= 10;
  else if (exclamations >= 2) score -= 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function runAIEngine(text) {

  if (!genAI) {
    const fallbackScore = computeFallbackScore(text);
    return {
      score: fallbackScore,
      explanation: [`AI disabled — heuristic fallback score: ${fallbackScore}.`]
    };
  }

  try {

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash"
    });

    const prompt = `
Evaluate the credibility of the following claim.

Respond ONLY with valid JSON in this exact format:

{
  "score": number (0-100),
  "reason": "short explanation"
}

Claim:
"${text.slice(0, 1500)}"
`;

    const result = await model.generateContent(prompt);
    const rawText = await result.response.text();

    // Extract JSON safely
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 100) {
      throw new Error(`Invalid score value: ${parsed.score}`);
    }

    return {
      score: parsed.score,
      explanation: [parsed.reason || "AI evaluation completed."]
    };

  } catch (error) {

    console.error("[AI Engine] Error:", error.message);

    // CRITICAL FIX: Do NOT return static 50 — compute text-aware fallback
    const fallbackScore = computeFallbackScore(text);
    console.warn(`[AI Engine] Using text-aware fallback score: ${fallbackScore}`);

    return {
      score: fallbackScore,
      explanation: [`AI analysis unavailable (${error.message.slice(0, 60)}) — heuristic fallback applied.`]
    };
  }
}

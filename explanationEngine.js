/* =====================================================
   EXPLANATION ENGINE – AI-Powered Trust Score Explainer
   ===================================================== */

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = process.env.ENABLE_GEMINI === "true"
    ? new GoogleGenerativeAI((process.env.GEMINI_API_KEY || "").trim())
    : null;

/* ── Domain type bucketing (privacy: never send actual URL) ── */
export function getDomainType(hostname) {
    if (!hostname) return "general";
    const h = hostname.toLowerCase();
    if (/\b(bbc|cnn|reuters|nytimes|theguardian|apnews|bloomberg|forbes|wsj|economist)\b/.test(h))
        return "news";
    if (/\.(edu|ac\.[a-z]{2})$/.test(h))
        return "academic";
    if (/wikipedia\.org/.test(h))
        return "wiki";
    if (/\b(twitter|x\.com|facebook|instagram|reddit|tiktok|linkedin)\b/.test(h))
        return "social";
    if (/\b(youtube|vimeo|twitch)\b/.test(h))
        return "video";
    return "general";
}

/* ── Fallback templates (no API call needed) ── */
export function getFallbackExplanation(score, riskLevel) {
    const s = Number(score) || 0;
    if (s >= 70) {
        return {
            overallAssessment: `This content scores ${s}/100, indicating high trustworthiness. Strong signals of authenticity and credible sourcing were detected throughout the analysis.`,
            trustSignals: [
                { icon: "✓", text: "Content follows professional writing standards with consistent structure" },
                { icon: "✓", text: "Factual, objective tone maintained without emotional manipulation" },
                { icon: "✓", text: "No major manipulation or misinformation patterns detected" }
            ],
            concerns: [
                { icon: "⚠", text: "No major concerns at this trust level — standard independent verification still advisable" }
            ],
            recommendation: `This content appears reliable based on pattern and AI analysis. Independent verification is always good practice before making important decisions.`
        };
    }
    if (s >= 40) {
        return {
            overallAssessment: `This content scores ${s}/100, showing mixed signals. Some indicators suggest authenticity while others warrant a degree of caution before relying on this information.`,
            trustSignals: [
                { icon: "✓", text: "Some credible source indicators present in the content" },
                { icon: "✓", text: "Basic professional formatting and structure observed" }
            ],
            concerns: [
                { icon: "⚠", text: "Some language patterns suggest caution is warranted" },
                { icon: "⚠", text: "Limited independent verification signals detected" }
            ],
            recommendation: `Cross-reference key claims with 2–3 independent sources before fully relying on this information. The content has merit but benefits from additional verification.`
        };
    }
    return {
        overallAssessment: `This content scores ${s}/100, indicating significant trust concerns. Multiple red flags were detected suggesting this information requires careful verification.`,
        trustSignals: [
            { icon: "✓", text: "Text is parseable and has coherent sentence structure" }
        ],
        concerns: [
            { icon: "⚠", text: "Multiple suspicious language and credibility patterns detected" },
            { icon: "⚠", text: "Content may be AI-generated, manipulated, or misleading" },
            { icon: "⚠", text: "Source credibility signals are absent or weak" }
        ],
        recommendation: `Exercise strong caution. Verify all claims with established, authoritative independent sources before trusting or sharing this information.`
    };
}

/* ── JSON parse with regex extraction fallback ── */
function parseGeminiResponse(raw, score, riskLevel) {
    // First try direct JSON parse
    try {
        const parsed = JSON.parse(raw.trim());
        if (parsed.overallAssessment && parsed.trustSignals && parsed.concerns && parsed.recommendation) {
            return parsed;
        }
    } catch (_) { /* fall through */ }

    // Try extracting JSON block from within markdown fences or surrounding text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.overallAssessment && parsed.trustSignals && parsed.concerns && parsed.recommendation) {
                return parsed;
            }
        } catch (_) { /* fall through */ }
    }

    // All parsing failed — use fallback
    console.warn("[ExplanationEngine] Could not parse Gemini response, using fallback.");
    return getFallbackExplanation(score, riskLevel);
}

/* ── System prompt ── */
const SYSTEM_PROMPT = `You are an expert content verification analyst explaining trust scores to non-technical users.

Given analysis data, return ONLY valid JSON — no markdown, no code fences, no explanation text outside the JSON.

Return exactly this schema:
{
  "overallAssessment": "2-3 sentence summary of why this exact score was given",
  "trustSignals": [
    {"icon": "✓", "text": "specific positive indicator with brief explanation"}
  ],
  "concerns": [
    {"icon": "⚠", "text": "specific concern with brief explanation of why it reduces trust"}
  ],
  "recommendation": "1-2 actionable sentences telling the user what to do next"
}

Rules:
- Be specific — reference the exact detected indicators provided
- Use "suggests" not "proves"; avoid absolute claims
- Match tone to risk level: reassuring for high trust, cautionary for medium, warning for low
- trustSignals: 2-4 bullets. concerns: 1-4 bullets
- Total output must be under 400 words
- Return ONLY valid JSON. No other text whatsoever.`;

/* ── User prompt builder ── */
function buildUserPrompt({ score, riskLevel, engines, indicators, domainType }) {
    const indicatorList = Array.isArray(indicators) && indicators.length > 0
        ? indicators.map(i => `- ${i}`).join("\n")
        : "- No specific indicators detected";

    return `Explain this content trust analysis result:

Score: ${score}/100
Risk Level: ${riskLevel}
Pattern Analysis Score: ${engines?.ruleScore ?? "N/A"}%
Content AI Score: ${engines?.aiScore ?? "N/A"}%

Detected Indicators:
${indicatorList}

Domain Type: ${domainType}

Generate the JSON explanation following the exact schema provided.`;
}

/* =====================================================
   MAIN EXPORT
   ===================================================== */
export async function generateExplanation({ score, riskLevel, engines, indicators, domain }) {

    const domainType = getDomainType(domain);

    if (!genAI || process.env.ENABLE_EXPLANATION !== "true") {
        return getFallbackExplanation(score, riskLevel);
    }

    try {
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 600
            }
        });

        const prompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt({ score, riskLevel, engines, indicators, domainType })}`;

        const result = await model.generateContent(prompt);
        const rawText = await result.response.text();

        return parseGeminiResponse(rawText, score, riskLevel);

    } catch (error) {
        console.error("[ExplanationEngine] Gemini call failed:", error.message);
        return getFallbackExplanation(score, riskLevel);
    }
}

/* =====================================================
   HELPERS – Shared Utility Functions (v2)
   ===================================================== */

import crypto from "crypto";

/* =====================================================
   TEXT UTILITIES
   ===================================================== */

export function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

export function truncateText(text, length = 200) {
  if (!text) return "";
  return text.length > length
    ? text.slice(0, length) + "..."
    : text;
}

/* =====================================================
   NUMBER SAFETY
   ===================================================== */

export function safeNumber(value, fallback = 0) {
  const num = parseFloat(value);
  return isNaN(num) ? fallback : num;
}

export function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/* =====================================================
   JSON SAFETY
   ===================================================== */

export function safeJsonParse(input, fallback = null) {
  try {
    if (!input) return fallback;

    let cleaned = input
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);

  } catch {
    return fallback;
  }
}

/* =====================================================
   CACHE
   ===================================================== */

export function generateCacheKey(text) {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");
}

/* =====================================================
   VALIDATION
   ===================================================== */

export function isValidText(text) {
  if (!text || typeof text !== "string") return false;

  const minLength =
    parseInt(process.env.MIN_TEXT_LENGTH) || 15;

  return text.length >= minLength;
}

/* =====================================================
   RULE ENGINE – Heuristic Credibility Analysis (v4)
   Produces genuinely variable scores based on both
   red flags AND positive credibility signals.
   ===================================================== */

export function runRuleEngine(text) {

  let score = 50; // Start at true neutral — signals push it up or down
  const explanations = [];

  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

  /* ============================================================
     ➕ POSITIVE SIGNALS (raise toward credibility)
     ============================================================ */

  /* --- Length / Depth --- */
  if (text.length >= 500) {
    score += 12;
    explanations.push("Content has substantial length, suggesting depth.");
  } else if (text.length >= 200) {
    score += 7;
    explanations.push("Content has moderate length.");
  } else if (text.length >= 80) {
    score += 3;
  }

  /* --- Numerical / Data-backed claims --- */
  const numberCount = (text.match(/\b\d[\d,.%]*\b/g) || []).length;
  if (numberCount >= 5) {
    score += 10;
    explanations.push("Contains multiple numerical data points — suggests factual reporting.");
  } else if (numberCount >= 2) {
    score += 5;
    explanations.push("Contains numerical data.");
  }

  /* --- Source / Citation indicators --- */
  const sourceIndicators = [
    "according to",
    "study shows",
    "researchers",
    "research shows",
    "study found",
    "data shows",
    "official statement",
    "report from",
    "survey",
    "peer-reviewed",
    "published in",
    "cited",
    "journal",
    "https://",
    "http://",
    "doi.org"
  ];

  const sourceCount = sourceIndicators.filter(ind => lower.includes(ind)).length;
  if (sourceCount >= 3) {
    score += 15;
    explanations.push("Multiple source citations detected — strong credibility signal.");
  } else if (sourceCount >= 1) {
    score += 8;
    explanations.push(`Credible source indicator found: "${sourceIndicators.find(ind => lower.includes(ind))}".`);
  } else {
    score -= 5;
    explanations.push("No credible source indicators found.");
  }

  /* --- Sentence structure / Formal writing --- */
  const avgWordLength = words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z]/g, "").length, 0) / Math.max(wordCount, 1);
  if (avgWordLength >= 5.5) {
    score += 6;
    explanations.push("Vocabulary complexity suggests formal writing.");
  }

  /* --- Multi-sentence structure --- */
  if (sentences.length >= 5) {
    score += 5;
    explanations.push("Well-structured multi-sentence content.");
  }

  /* --- Balanced hedge language (indicates nuance) --- */
  const hedgeWords = ["however", "although", "while", "despite", "on the other hand", "in contrast", "nevertheless", "nonetheless", "conversely", "yet"];
  const hedgeCount = hedgeWords.filter(w => lower.includes(w)).length;
  if (hedgeCount >= 2) {
    score += 6;
    explanations.push("Nuanced language and balanced perspective detected.");
  } else if (hedgeCount >= 1) {
    score += 3;
  }

  /* --- Quotes / attributed statements --- */
  const quoteCount = (text.match(/["'"][^"'"]{10,200}["'"]/g) || []).length;
  if (quoteCount >= 2) {
    score += 6;
    explanations.push("Multiple quoted statements suggest attributed sourcing.");
  } else if (quoteCount >= 1) {
    score += 3;
  }

  /* ============================================================
     ➖ NEGATIVE SIGNALS (lower credibility)
     ============================================================ */

  /* --- Emotional / Clickbait words --- */
  const emotionalWords = [
    "shocking",
    "unbelievable",
    "secret",
    "exposed",
    "miracle",
    "urgent",
    "breaking",
    "you won't believe",
    "must read",
    "mind-blowing",
    "jaw-dropping",
    "viral",
    "insane"
  ];

  const emotionalHits = emotionalWords.filter(w => lower.includes(w));
  if (emotionalHits.length >= 3) {
    score -= 18;
    explanations.push(`Heavy clickbait language: "${emotionalHits.slice(0, 3).join('", "')}".`);
  } else {
    emotionalHits.forEach(word => {
      score -= 6;
      explanations.push(`Emotional trigger word detected: "${word}".`);
    });
  }

  /* --- Excessive punctuation --- */
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount >= 5) {
    score -= 14;
    explanations.push("Excessive exclamation marks — hallmark of sensationalist content.");
  } else if (exclamationCount >= 3) {
    score -= 8;
    explanations.push("Excessive exclamation marks detected.");
  }

  if ((text.match(/\?/g) || []).length >= 3) {
    score -= 6;
    explanations.push("Excessive question marks detected.");
  }

  /* --- ALL CAPS --- */
  const capsWords = words.filter(w => w.length > 4 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (capsWords.length >= 4) {
    score -= 16;
    explanations.push("Many ALL-CAPS words — aggressive or sensationalist style.");
  } else if (capsWords.length >= 2) {
    score -= 10;
    explanations.push("Multiple ALL-CAPS words detected.");
  }

  /* --- Conspiracy keywords --- */
  const conspiracyWords = [
    "alien",
    "conspiracy",
    "government coverup",
    "they don't want you to know",
    "flat earth",
    "fake moon landing",
    "deep state",
    "new world order",
    "mind control",
    "chemtrail",
    "microchip"
  ];

  const conspiracyHits = conspiracyWords.filter(w => lower.includes(w));
  if (conspiracyHits.length >= 2) {
    score -= 22;
    explanations.push(`Multiple conspiracy-style claims: "${conspiracyHits.slice(0, 2).join('", "')}".`);
  } else if (conspiracyHits.length === 1) {
    score -= 12;
    explanations.push(`Conspiracy-style claim detected: "${conspiracyHits[0]}".`);
  }

  /* --- Very short text (lacks context) --- */
  if (text.length < 40) {
    score -= 8;
    explanations.push("Claim is very short and lacks context.");
  }

  /* --- Excessive repetition (low quality) --- */
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, "")));
  const repetitionRatio = wordCount > 0 ? uniqueWords.size / wordCount : 1;
  if (wordCount > 20 && repetitionRatio < 0.4) {
    score -= 8;
    explanations.push("High word repetition suggests low-quality or auto-generated content.");
  }

  /* ============================================================
     CLAMP
     ============================================================ */

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    explanation: explanations.length
      ? explanations
      : ["No strong heuristic signals detected — content appears neutral."]
  };
}

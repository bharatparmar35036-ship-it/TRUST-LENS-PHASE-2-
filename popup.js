/* ══════════════════════════════════════════════════
   TRUSTLENS – POPUP CONTROLLER v7
   Auto-analyze · URL-keyed cache · One-click flow
   AI Explanation Panel (collapsible)
   ══════════════════════════════════════════════════ */

/* ── DOM REFS ── */
const idlePanel = document.getElementById("idlePanel");
const loadingPanel = document.getElementById("loadingPanel");
const loadingText = document.getElementById("loadingText");
const resultPanel = document.getElementById("resultPanel");
const errorPanel = document.getElementById("errorPanel");
const errorMsg = document.getElementById("errorMsg");

const scoreNum = document.getElementById("scoreNum");
const mainBar = document.getElementById("mainBar");
const mainPct = document.getElementById("mainPct");
const riskChip = document.getElementById("riskChip");
const riskDot = document.getElementById("riskDot");
const riskLabel = document.getElementById("riskLabel");
const riskHint = document.getElementById("riskHint");

const ruleBar = document.getElementById("ruleBar");
const aiBar = document.getElementById("aiBar");
const rulePct = document.getElementById("rulePct");
const aiPct = document.getElementById("aiPct");
const engineNote = document.getElementById("engineNote");

const indicatorsSection = document.getElementById("indicatorsSection");
const indicatorsList = document.getElementById("indicatorsList");
const historySection = document.getElementById("historySection");
const historyList = document.getElementById("historyList");

/* ── Explanation refs ── */
const explanationSection = document.getElementById("explanationSection");
const explanationToggle = document.getElementById("explanationToggle");
const explanationBody = document.getElementById("explanationBody");
const explanationContent = document.getElementById("explanationContent");
const expArrow = document.getElementById("expArrow");

const viewReportBtn = document.getElementById("viewReportBtn");
const reAnalyzeBtn = document.getElementById("reAnalyzeBtn");
const retryBtn = document.getElementById("retryBtn");
const analyzePageBtn = document.getElementById("analyzePageBtn");

const analyzedTextSection = document.getElementById("analyzedTextSection");
const analyzedTextBox = document.getElementById("analyzedTextBox");
const analyzedSource = document.getElementById("analyzedSource");

/* ── STATE ── */
let currentResult = null;
let currentTab = null;

/* ── URL-keyed cache TTL (5 minutes) ── */
const CACHE_TTL_MS = 5 * 60 * 1000;

function urlCacheKey(url) {
  /* Simple prefix + stripped URL so we stay under storage key limits */
  return "urlcache_" + (url || "").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 120);
}

/* ══════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  bindActions();
  bindExplanationHandlers();

  /* Get the active tab first — needed for auto-analyze */
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab || null;
  } catch (_) {
    currentTab = null;
  }

  const cacheKey = currentTab ? urlCacheKey(currentTab.url) : null;

  chrome.storage.local.get(
    ["lastResult", "lastError", "isAnalyzing", "analyzingText", "history",
      ...(cacheKey ? [cacheKey] : [])],
    (data) => {

      loadHistory(data.history || []);

      /* 1. Currently analyzing → show spinner */
      if (data.isAnalyzing) {
        showLoading(data.analyzingText || "Analyzing…");
        return;
      }

      /* 2. URL-keyed cache hit (< 5 min) → show immediately */
      const cached = cacheKey ? data[cacheKey] : null;
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        currentResult = cached.result;
        showResult(cached.result, false);
        return;
      }

      /* 3. Error from last run → show error */
      if (data.lastError) {
        showError(data.lastError);
        return;
      }

      /* 4. Has a previous text-selection result → show it + offer re-analyze */
      if (data.lastResult) {
        currentResult = data.lastResult;
        showResult(data.lastResult, false);
        return;
      }

      /* 5. Nothing at all → AUTO-ANALYZE the current page */
      if (currentTab) {
        triggerPageAnalysis(currentTab);
      } else {
        showIdle();
      }
    }
  );

  /* Live updates while popup is open */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.isAnalyzing?.newValue === true) {
      showLoading(changes.analyzingText?.newValue || "Analyzing…");
    }

    if (changes.lastResult?.newValue && !changes.isAnalyzing?.newValue) {
      const result = changes.lastResult.newValue;
      currentResult = result;
      showResult(result, true);
      /* Save to URL cache */
      saveToUrlCache(result);
      /* Update explanation panel if explanation arrived via storage change */
      if (result._explanation) {
        renderExplanation(result._explanation);
      }
    }

    if (changes.lastError?.newValue) {
      showError(changes.lastError.newValue);
    }

    if (changes.history?.newValue) {
      loadHistory(changes.history.newValue);
    }
  });

  /* Fast path from service worker runtime message */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SHOW_TRUST_RESULT") {
      currentResult = msg.result;
      showResult(msg.result, true);
      saveToUrlCache(msg.result);
    }
    if (msg.type === "EXPLANATION_LOADING") {
      showExplanationLoading();
    }
    if (msg.type === "EXPLANATION_READY") {
      renderExplanation(msg.explanation);
    }
  });
});

/* ── Trigger auto/manual page analysis ── */
function triggerPageAnalysis(tab, forceFresh = false) {
  if (!tab) { showIdle(); return; }

  if (forceFresh && tab.url) {
    /* Invalidate cache for this URL */
    chrome.storage.local.remove(urlCacheKey(tab.url));
  }

  showLoading(tab.title ? tab.title.slice(0, 50) : "Analyzing page…");
  chrome.storage.local.remove(["lastError", "lastResult"]);
  chrome.storage.local.set({ isAnalyzing: true, analyzingText: tab.title || "Analyzing…" });

  chrome.runtime.sendMessage({
    type: "ANALYZE_PAGE",
    tabId: tab.id,
    pageUrl: tab.url || "",
    pageTitle: tab.title || ""
  });
}

/* ── Save result to URL-keyed cache ── */
function saveToUrlCache(result) {
  const url = result._pageUrl || (currentTab && currentTab.url) || "";
  if (!url) return;
  const key = urlCacheKey(url);
  chrome.storage.local.set({ [key]: { result, timestamp: Date.now() } });
}

/* ══════════════════════════════════════════════════
   STATE SWITCHERS
   ══════════════════════════════════════════════════ */
function showIdle() {
  idlePanel.style.display = "flex";
  loadingPanel.style.display = "none";
  resultPanel.style.display = "none";
  errorPanel.style.display = "none";
}

function showLoading(text) {
  idlePanel.style.display = "none";
  loadingPanel.style.display = "flex";
  resultPanel.style.display = "none";
  errorPanel.style.display = "none";
  if (text) loadingText.textContent = text.length > 50
    ? text.substring(0, 50) + "…"
    : text;
}

function showError(msg) {
  idlePanel.style.display = "none";
  loadingPanel.style.display = "none";
  resultPanel.style.display = "none";
  errorPanel.style.display = "flex";
  errorMsg.textContent = msg || "Couldn't reach the analysis server.";
}

/* ══════════════════════════════════════════════════
   RENDER RESULT
   ══════════════════════════════════════════════════ */
function showResult(result, animate) {
  idlePanel.style.display = "none";
  loadingPanel.style.display = "none";
  resultPanel.style.display = "block";
  errorPanel.style.display = "none";

  /* ── 0. ANALYZED TEXT PREVIEW ── */
  const rawText = result._analyzedText || result.originalText || "";
  if (rawText && rawText.trim().length > 0) {
    analyzedTextSection.style.display = "block";
    const preview = rawText.trim().length > 120
      ? rawText.trim().slice(0, 120) + "\u2026"
      : rawText.trim();
    analyzedTextBox.textContent = `\u201C${preview}\u201D`;

    const domain = result._domain || "";
    const pageTitle = result._pageTitle || "";
    if (domain) {
      analyzedSource.textContent = `Source: ${domain}`;
      analyzedSource.style.display = "block";
    } else if (pageTitle) {
      analyzedSource.textContent = `Page: ${pageTitle.slice(0, 50)}`;
      analyzedSource.style.display = "block";
    } else {
      analyzedSource.style.display = "none";
    }
  } else {
    analyzedTextSection.style.display = "none";
  }

  /* ── 1. SCORE ── */
  const score = result.trustScore ?? result.score ?? 0;

  if (animate) {
    animateCount(scoreNum, 0, score, 900);
  } else {
    scoreNum.textContent = score;
  }

  let barColor, dotColor, labelText, hintText, colorClass;
  if (score >= 70) {
    barColor = "#22c55e"; dotColor = "#22c55e";
    labelText = "High Trust"; hintText = "Content appears reliable";
    colorClass = "c-green";
  } else if (score >= 40) {
    barColor = "#f59e0b"; dotColor = "#f59e0b";
    labelText = "Medium Trust"; hintText = "Proceed with caution";
    colorClass = "c-amber";
  } else {
    barColor = "#ef4444"; dotColor = "#ef4444";
    labelText = "Low Trust"; hintText = "Verify from other sources";
    colorClass = "c-red";
  }

  scoreNum.className = `score-number ${colorClass}`;
  mainBar.style.background = barColor;
  mainPct.textContent = `${score}%`;
  mainPct.className = `bar-pct ${colorClass}`;

  if (animate) {
    mainBar.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      mainBar.style.width = `${score}%`;
    }));
  } else {
    mainBar.style.width = `${score}%`;
  }

  riskDot.style.background = dotColor;
  riskLabel.textContent = labelText;
  riskHint.textContent = hintText;

  /* ── 2. ENGINE BREAKDOWN ── */
  const engines = result.engines ?? {};
  const ruleVal = engines.ruleScore ?? engines.rule ?? score;
  const aiVal = engines.aiScore ?? engines.ai ?? score;

  renderEngineBar(ruleBar, rulePct, ruleVal, animate);
  renderEngineBar(aiBar, aiPct, aiVal, animate);

  const bothKnown = result.engines?.ruleScore != null || result.engines?.aiScore != null;
  engineNote.textContent = bothKnown
    ? `Combined score: ${score}% (weighted average)`
    : "Analysis based on content patterns";

  /* ── 3. KEY INDICATORS ── */
  const explanation = result.explanation ?? "";
  const cleanExplain = explanation
    .replace(/NO|no\s+credible\s+source\s+indicators?\s+found[.,]?/gi, "")
    .replace(/AI\s+disabled[.,]?/gi, "")
    .trim();
  const bullets = parseIndicators(cleanExplain);

  if (bullets.length > 0) {
    indicatorsSection.style.display = "block";
    indicatorsList.innerHTML = "";
    bullets.forEach(b => {
      const li = document.createElement("li");
      li.textContent = b;
      indicatorsList.appendChild(li);
    });
  } else {
    indicatorsSection.style.display = "none";
  }

  /* ── 4. AI EXPLANATION PANEL ── */
  explanationSection.style.display = "block";
  if (result._explanation) {
    renderExplanation(result._explanation);
  } else if (result._explanationLoading) {
    const age = Date.now() - (result._explanationTimestamp || 0);
    if (age < 15000) {
      showExplanationLoading();
    } else {
      /* Timed out — show fallback */
      renderExplanation(getFallbackExplanationClient(score, result.riskLevel || "Unknown"));
    }
  } else {
    showExplanationError();
  }
}

/* ── Engine bar helper ── */
function renderEngineBar(barEl, pctEl, value, animate) {
  const v = Math.min(Math.round(Number(value) || 0), 100);
  const color = v >= 70 ? "#22c55e" : v >= 40 ? "#f59e0b" : "#ef4444";
  pctEl.textContent = `${v}%`;
  barEl.style.background = color;
  if (animate) {
    barEl.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      barEl.style.width = `${v}%`;
    }));
  } else {
    barEl.style.width = `${v}%`;
  }
}

/* ── Parse explanation into bullet points ── */
function parseIndicators(text) {
  if (!text || text.length < 10) return [];
  return text
    .split(/[.;]/)
    .map(s => s.trim())
    .filter(s => s.length > 12 && s.length < 120)
    .slice(0, 3);
}

/* ══════════════════════════════════════════════════
   AI EXPLANATION HELPERS
   ══════════════════════════════════════════════════ */

/* Mirror of service-worker fallback (runs in extension context) */
function getFallbackExplanationClient(score, riskLevel) {
  const s = Number(score) || 0;
  if (s >= 70) return {
    overallAssessment: `This content scores ${s}/100, indicating high trustworthiness. Strong signals of authenticity were detected.`,
    trustSignals: [
      { icon: "✓", text: "Content follows professional writing standards" },
      { icon: "✓", text: "Factual, objective tone maintained" },
      { icon: "✓", text: "No major manipulation patterns detected" }
    ],
    concerns: [{ icon: "⚠", text: "No major concerns — standard verification still advisable" }],
    recommendation: "This content appears reliable. Independent verification is always good practice for important decisions."
  };
  if (s >= 40) return {
    overallAssessment: `This content scores ${s}/100, showing mixed signals. Some indicators suggest authenticity while others warrant caution.`,
    trustSignals: [
      { icon: "✓", text: "Some credible source indicators present" },
      { icon: "✓", text: "Basic professional formatting observed" }
    ],
    concerns: [
      { icon: "⚠", text: "Some language patterns suggest caution is warranted" },
      { icon: "⚠", text: "Limited independent verification signals detected" }
    ],
    recommendation: "Cross-reference key claims with 2–3 independent sources before fully relying on this information."
  };
  return {
    overallAssessment: `This content scores ${s}/100, indicating significant trust concerns. Multiple red flags were detected.`,
    trustSignals: [{ icon: "✓", text: "Text is parseable and has coherent structure" }],
    concerns: [
      { icon: "⚠", text: "Multiple suspicious language patterns detected" },
      { icon: "⚠", text: "Content may be AI-generated or manipulated" },
      { icon: "⚠", text: "Source credibility signals are absent or weak" }
    ],
    recommendation: "Exercise strong caution. Verify all claims with authoritative independent sources."
  };
}

/* Render structured explanation object into the panel */
function renderExplanation(data) {
  if (!data) { showExplanationError(); return; }

  const trustSignals = (data.trustSignals || []).map(s => {
    const li = document.createElement("li");
    li.className = "exp-bullet-pos";
    const icon = document.createElement("span");
    icon.className = "exp-bullet-icon";
    icon.textContent = s.icon || "✓";
    const txt = document.createElement("span");
    txt.textContent = s.text || "";
    li.appendChild(icon);
    li.appendChild(txt);
    return li;
  });

  const concerns = (data.concerns || []).map(c => {
    const li = document.createElement("li");
    li.className = "exp-bullet-warn";
    const icon = document.createElement("span");
    icon.className = "exp-bullet-icon";
    icon.textContent = c.icon || "⚠";
    const txt = document.createElement("span");
    txt.textContent = c.text || "";
    li.appendChild(icon);
    li.appendChild(txt);
    return li;
  });

  explanationContent.innerHTML = "";

  const t1 = document.createElement("div");
  t1.className = "exp-section-title";
  t1.textContent = "Overall Assessment";
  const p1 = document.createElement("p");
  p1.className = "exp-para";
  p1.textContent = data.overallAssessment || "";

  const t2 = document.createElement("div");
  t2.className = "exp-section-title";
  t2.textContent = "Trust Signals";
  const ul1 = document.createElement("ul");
  ul1.className = "exp-bullets";
  trustSignals.forEach(li => ul1.appendChild(li));

  const t3 = document.createElement("div");
  t3.className = "exp-section-title";
  t3.textContent = "Concerns";
  const ul2 = document.createElement("ul");
  ul2.className = "exp-bullets";
  concerns.forEach(li => ul2.appendChild(li));

  const rec = document.createElement("p");
  rec.className = "exp-recommendation";
  rec.textContent = data.recommendation || "";

  [t1, p1, t2, ul1, t3, ul2, rec].forEach(el => explanationContent.appendChild(el));
}

function showExplanationLoading() {
  explanationContent.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "exp-loading";
  const dot = document.createElement("span");
  dot.className = "exp-loading-dot";
  const label = document.createElement("span");
  label.textContent = "Generating explanation…";
  wrap.appendChild(dot);
  wrap.appendChild(label);
  explanationContent.appendChild(wrap);
}

function showExplanationError() {
  explanationContent.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "exp-error";
  const msg = document.createElement("p");
  msg.textContent = "Explanation unavailable";
  const btn = document.createElement("button");
  btn.className = "exp-retry-btn";
  btn.id = "retryExplanationBtn";
  btn.textContent = "↺ Try Again";
  wrap.appendChild(msg);
  wrap.appendChild(btn);
  explanationContent.appendChild(wrap);
}

/* Bind toggle + retry (uses event delegation for retry — it's dynamically injected) */
function bindExplanationHandlers() {
  explanationToggle.addEventListener("click", () => {
    const isOpen = explanationBody.style.display !== "none";
    explanationBody.style.display = isOpen ? "none" : "block";
    expArrow.style.transform = isOpen ? "" : "rotate(180deg)";
  });

  explanationContent.addEventListener("click", (e) => {
    if (e.target.id === "retryExplanationBtn" && currentResult) {
      showExplanationLoading();
      chrome.runtime.sendMessage({ type: "RETRY_EXPLANATION", result: currentResult });
    }
  });
}

/* ══════════════════════════════════════════════════
   HISTORY
   ══════════════════════════════════════════════════ */
function loadHistory(history) {
  if (!history || history.length === 0) {
    historySection.style.display = "none";
    return;
  }

  historySection.style.display = "block";
  historyList.innerHTML = "";

  history.slice(0, 5).forEach(item => {
    const score = item.trustScore ?? item.score ?? 0;
    const dotColor = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
    const label = (item.text || "").substring(0, 38) || "—";

    const div = document.createElement("div");
    div.className = "history-item";

    const dot = document.createElement("span");
    dot.className = "hist-dot";
    dot.style.background = dotColor;

    const text = document.createElement("span");
    text.className = "hist-text";
    text.textContent = label.length < (item.text || "").length ? label + "…" : label;

    const right = document.createElement("div");
    right.className = "hist-right";

    const sc = document.createElement("span");
    sc.className = "hist-score";
    sc.textContent = score;

    const time = document.createElement("span");
    time.className = "hist-time";
    time.textContent = item.timestamp ? timeAgo(item.timestamp) : "";

    right.appendChild(sc);
    right.appendChild(time);
    div.appendChild(dot);
    div.appendChild(text);
    div.appendChild(right);
    historyList.appendChild(div);
  });
}

/* ══════════════════════════════════════════════════
   ACTIONS
   ══════════════════════════════════════════════════ */
function bindActions() {

  /* "Analyze This Page" button in idle state */
  analyzePageBtn?.addEventListener("click", () => {
    if (currentTab) {
      triggerPageAnalysis(currentTab, false);
    } else {
      showInlineToast("Couldn't detect active tab.");
    }
  });

  /* "Re-analyze" button in result state — forces fresh analysis */
  reAnalyzeBtn?.addEventListener("click", () => {
    if (currentTab) {
      triggerPageAnalysis(currentTab, true);
    } else {
      showInlineToast("Couldn't detect active tab.");
    }
  });

  /* "View Full Analysis" */
  viewReportBtn?.addEventListener("click", () => {
    if (!currentResult) {
      showInlineToast("No analysis to show yet.");
      return;
    }
    const url = chrome.runtime.getURL("report.html") +
      "?data=" + encodeURIComponent(JSON.stringify(currentResult));
    chrome.tabs.create({ url });
  });

  /* Retry after error */
  retryBtn?.addEventListener("click", () => {
    chrome.storage.local.remove("lastError");
    if (currentTab) {
      triggerPageAnalysis(currentTab, true);
    } else {
      showIdle();
    }
  });
}

/* ══════════════════════════════════════════════════
   INLINE TOAST
   ══════════════════════════════════════════════════ */
let toastEl = null;
let toastTimer = null;

function showInlineToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.style.cssText = `
      position:fixed; bottom:14px; left:50%;
      transform:translateX(-50%) translateY(8px);
      background:#2a2a32; color:#f5f5f7;
      font-size:12px; font-weight:600;
      padding:7px 16px; border-radius:20px;
      border:1px solid rgba(255,255,255,0.12);
      opacity:0; pointer-events:none;
      transition:opacity .2s, transform .2s;
      white-space:nowrap; z-index:9999;
      font-family:-apple-system,"Segoe UI",system-ui,sans-serif;
    `;
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.style.opacity = "1";
  toastEl.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.opacity = "0";
    toastEl.style.transform = "translateX(-50%) translateY(8px)";
  }, 2200);
}

/* ══════════════════════════════════════════════════
   COUNT-UP ANIMATION
   ══════════════════════════════════════════════════ */
function animateCount(el, from, to, duration) {
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = Math.floor(from + (to - from) * easeOut(t));
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = to;
  };
  requestAnimationFrame(tick);
}

function easeOut(x) { return 1 - Math.pow(1 - x, 4); }

/* ══════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════ */
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
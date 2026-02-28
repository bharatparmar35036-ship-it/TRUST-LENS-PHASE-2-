// TRUSTLENS – SERVICE WORKER (CLASSIC MV3) v2
// Added: async AI explanation with race-condition safety, timeout, retry, storage cleanup

const BACKEND_URL = "http://localhost:3000";
const VERIFY_ENDPOINT = BACKEND_URL + "/api/v1/verify";
const HEALTH_ENDPOINT = BACKEND_URL + "/api/v1/health";
const EXPLAIN_ENDPOINT = BACKEND_URL + "/api/v1/explain";

/* ── Domain type bucketing (mirrors explanationEngine.js — privacy safe) ── */
function getDomainType(hostname) {
  if (!hostname) return "general";
  var h = hostname.toLowerCase();
  if (/\b(bbc|cnn|reuters|nytimes|theguardian|apnews|bloomberg|forbes|wsj|economist)\b/.test(h)) return "news";
  if (/\.(edu|ac\.[a-z]{2})$/.test(h)) return "academic";
  if (/wikipedia\.org/.test(h)) return "wiki";
  if (/\b(twitter|x\.com|facebook|instagram|reddit|tiktok|linkedin)\b/.test(h)) return "social";
  if (/\b(youtube|vimeo|twitch)\b/.test(h)) return "video";
  return "general";
}

/* ── Fallback explanation (mirrors explanationEngine.js) ── */
function getFallbackExplanation(score, riskLevel) {
  var s = Number(score) || 0;
  if (s >= 70) return {
    overallAssessment: "This content scores " + s + "/100, indicating high trustworthiness. Strong signals of authenticity were detected.",
    trustSignals: [
      { icon: "✓", text: "Content follows professional writing standards" },
      { icon: "✓", text: "Factual, objective tone maintained" },
      { icon: "✓", text: "No major manipulation patterns detected" }
    ],
    concerns: [{ icon: "⚠", text: "No major concerns — standard verification still advisable" }],
    recommendation: "This content appears reliable. Independent verification is always good practice for important decisions."
  };
  if (s >= 40) return {
    overallAssessment: "This content scores " + s + "/100, showing mixed signals. Some indicators suggest authenticity while others warrant caution.",
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
    overallAssessment: "This content scores " + s + "/100, indicating significant trust concerns. Multiple red flags were detected.",
    trustSignals: [{ icon: "✓", text: "Text is parseable and has coherent structure" }],
    concerns: [
      { icon: "⚠", text: "Multiple suspicious language patterns detected" },
      { icon: "⚠", text: "Content may be AI-generated or manipulated" },
      { icon: "⚠", text: "Source credibility signals are absent or weak" }
    ],
    recommendation: "Exercise strong caution. Verify all claims with authoritative independent sources."
  };
}

/* ── Explanation storage key (per URL+score) ── */
function explanationKey(pageUrl, score) {
  // Simple but unique enough for extension storage
  var safe = (pageUrl || "").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 80);
  return "exp_" + safe + "_" + score;
}

/* ── Purge old explanation entries (keep max 50, remove >24h) ── */
function purgeOldExplanations(callback) {
  chrome.storage.local.get(null, function (items) {
    var now = Date.now();
    var expKeys = Object.keys(items).filter(function (k) { return k.startsWith("exp_"); });
    var toRemove = [];

    // Remove entries older than 24 hours
    expKeys.forEach(function (k) {
      if (items[k] && items[k].timestamp && (now - items[k].timestamp) > 86400000) {
        toRemove.push(k);
      }
    });

    // If still > 50, remove oldest by timestamp
    var remaining = expKeys.filter(function (k) { return toRemove.indexOf(k) === -1; });
    if (remaining.length > 50) {
      remaining.sort(function (a, b) {
        return (items[a].timestamp || 0) - (items[b].timestamp || 0);
      });
      toRemove = toRemove.concat(remaining.slice(0, remaining.length - 50));
    }

    if (toRemove.length > 0) {
      chrome.storage.local.remove(toRemove, callback || function () { });
    } else if (callback) {
      callback();
    }
  });
}

/* ── Broadcast a message to popup (ignores error if popup closed) ── */
function broadcastToPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(function () { /* popup may be closed */ });
}

/* ── Fetch explanation from backend with 10s timeout ── */
function fetchExplanation(result) {
  var score = result.trustScore || result.score || 0;
  var riskLevel = result.riskLevel || "Unknown";
  var engines = result.engines || {};
  var domain = result._domain || "";

  // Parse indicators from the existing explanation string
  var indicatorString = result.explanation || "";
  var indicators = indicatorString
    .split(/[.;]/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 10 && s.length < 140; })
    .slice(0, 5);

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, 10000);

  return fetch(EXPLAIN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      score: score,
      riskLevel: riskLevel,
      engines: engines,
      indicators: indicators,
      domain: domain
    })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      clearTimeout(timeoutId);
      return data.explanation || getFallbackExplanation(score, riskLevel);
    })
    .catch(function (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        console.warn("[TrustLens] Explanation fetch timed out, using fallback.");
      } else {
        console.warn("[TrustLens] Explanation fetch failed:", error.message);
      }
      return getFallbackExplanation(score, riskLevel);
    });
}

/* ── Run explanation pipeline async after scoring ── */
function runExplanationPipeline(result) {
  var score = result.trustScore || result.score || 0;
  var riskLevel = result.riskLevel || "Unknown";
  var pageUrl = result._pageUrl || "";
  var expKey = explanationKey(pageUrl, score);

  // Step 1: Mark as loading in storage + notify popup immediately
  chrome.storage.local.get([expKey], function (stored) {
    // If we already have a cached explanation for this URL+score, reuse it
    if (stored[expKey] && stored[expKey].explanation) {
      var cached = stored[expKey].explanation;
      // Merge into lastResult
      chrome.storage.local.get(["lastResult"], function (d) {
        if (d.lastResult) {
          var updated = Object.assign({}, d.lastResult, {
            _explanation: cached,
            _explanationLoading: false,
            _explanationTimestamp: stored[expKey].timestamp || Date.now()
          });
          chrome.storage.local.set({ lastResult: updated });
        }
      });
      broadcastToPopup({ type: "EXPLANATION_READY", explanation: cached });
      return;
    }

    // Step 2: Mark loading state
    chrome.storage.local.get(["lastResult"], function (d) {
      if (d.lastResult) {
        var withLoading = Object.assign({}, d.lastResult, {
          _explanation: null,
          _explanationLoading: true,
          _explanationTimestamp: Date.now()
        });
        chrome.storage.local.set({ lastResult: withLoading });
      }
    });
    broadcastToPopup({ type: "EXPLANATION_LOADING" });

    // Step 3: Fetch explanation
    fetchExplanation(result).then(function (explanation) {
      var now = Date.now();

      // Step 4: Update storage (merge into lastResult + separate capped key)
      chrome.storage.local.get(["lastResult"], function (d) {
        if (d.lastResult) {
          var updated = Object.assign({}, d.lastResult, {
            _explanation: explanation,
            _explanationLoading: false,
            _explanationTimestamp: now
          });
          chrome.storage.local.set({ lastResult: updated });
        }
      });

      // Store separately for persistence across popup opens (capped)
      purgeOldExplanations(function () {
        var entry = {};
        entry[expKey] = { explanation: explanation, timestamp: now };
        chrome.storage.local.set(entry);
      });

      // Step 5: Broadcast ready
      broadcastToPopup({ type: "EXPLANATION_READY", explanation: explanation });
    });
  });
}

/* ══════════════════════════════════════════════════
   INSTALLED LISTENER
   ══════════════════════════════════════════════════ */
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: "trustlens-verify",
    title: "🔍 Verify with TrustLens",
    contexts: ["selection"]
  });
  chrome.storage.local.set({ history: [] });
  console.log("TrustLens installed");
});

/* ══════════════════════════════════════════════════
   MESSAGE LISTENER
   ══════════════════════════════════════════════════ */
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {

  if (msg.type === "TEXT_SELECTED") {
    var tab = sender.tab || {};
    verifyText(msg.text, tab.id, tab.url || "", tab.title || "");
  }

  if (msg.type === "CHECK_BACKEND") {
    fetch(HEALTH_ENDPOINT)
      .then(function () { sendResponse({ online: true }); })
      .catch(function () { sendResponse({ online: false }); });
    return true;
  }

  if (msg.type === "ANALYZE_PAGE") {
    var tabId = msg.tabId;
    var pageUrl = msg.pageUrl || "";
    var pageTitle = msg.pageTitle || "";

    /* Guard: skip chrome://, edge://, about: pages that can't be scripted */
    try {
      var parsed = new URL(pageUrl);
      if (["chrome:", "edge:", "about:", "chrome-extension:"].includes(parsed.protocol)) {
        chrome.storage.local.set({
          isAnalyzing: false,
          lastError: "This page can't be analyzed. Navigate to a website and try again."
        });
        return;
      }
    } catch (_) { /* ignore invalid URLs */ }

    /* Inject content script first (handles pages where it may not have auto-loaded) */
    chrome.scripting.executeScript(
      { target: { tabId: tabId }, files: ["content.js"] },
      function () {
        var injectionError = chrome.runtime.lastError;
        /* Small delay to let the script initialize */
        setTimeout(function () {
          chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_TEXT" }, function (response) {
            if (chrome.runtime.lastError || !response || !response.text) {
              var errDetail = injectionError ? injectionError.message : (chrome.runtime.lastError && chrome.runtime.lastError.message) || "unknown";
              console.warn("[TrustLens] GET_PAGE_TEXT failed:", errDetail);
              chrome.storage.local.set({
                isAnalyzing: false,
                lastError: "Cannot extract page text. Try selecting specific text instead."
              });
              return;
            }
            verifyText(response.text, tabId, pageUrl, pageTitle);
          });
        }, 150);
      }
    );
  }

  /* Popup requests a retry of the explanation */
  if (msg.type === "RETRY_EXPLANATION") {
    var result = msg.result;
    if (result) {
      // Clear cached explanation for this URL so we re-fetch
      var expKey = explanationKey(result._pageUrl || "", result.trustScore || result.score || 0);
      chrome.storage.local.remove([expKey], function () {
        runExplanationPipeline(result);
      });
    }
  }
});

/* ══════════════════════════════════════════════════
   VERIFY TEXT
   ══════════════════════════════════════════════════ */
function verifyText(text, tabId, pageUrl, pageTitle) {
  if (!text || text.length < 15) return;

  var domain = "";
  try {
    if (pageUrl) domain = new URL(pageUrl).hostname;
  } catch (e) { /* ignore */ }

  chrome.storage.local.remove(["lastError", "lastResult"]);
  chrome.storage.local.set({ isAnalyzing: true, analyzingText: text });

  fetch(VERIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text, domain: domain })
  })
    .then(function (response) { return response.json(); })
    .then(function (result) {
      result._analyzedText = text;
      result._timestamp = Date.now();
      result._pageUrl = pageUrl || "";
      result._pageTitle = pageTitle || "";
      result._domain = domain;
      // Explanation will be fetched async — init as loading
      result._explanation = null;
      result._explanationLoading = false; // Will be set true by pipeline
      result._explanationTimestamp = Date.now();

      chrome.storage.local.set({ lastResult: result, isAnalyzing: false });

      chrome.storage.local.get(["history"], function (data) {
        var history = data.history || [];
        history.unshift({
          text: text.substring(0, 60),
          trustScore: result.trustScore || result.score || 0,
          riskLevel: result.riskLevel || result.verdict || "Unknown",
          timestamp: result._timestamp
        });
        chrome.storage.local.set({ history: history.slice(0, 20) });
      });

      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "SHOW_TRUST_RESULT", result: result });
      }
      broadcastToPopup({ type: "SHOW_TRUST_RESULT", result: result });

      // Kick off explanation pipeline (non-blocking)
      runExplanationPipeline(result);
    })
    .catch(function (error) {
      console.error("TrustLens verification failed:", error);
      chrome.storage.local.set({
        isAnalyzing: false,
        lastError: "Couldn't connect to the analysis server. Make sure the backend is running."
      });
    });
}

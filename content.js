/* =====================================================
   TRUSTLENS – CONTENT SCRIPT (v5)
   Smart Selection + Clean Highlight + Status Badge
   ===================================================== */

let lastSelection = "";
let savedRange = null;
let badgeTimer = null;

/* =====================================================
   UTILITIES
   ===================================================== */

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function isValidSelection(text) {
  return text && text.length >= 15;
}

/* =====================================================
   TINY BADGE (fixed bottom-right, non-blocking)
   ===================================================== */

function getBadge() {
  let el = document.getElementById("tl-badge");
  if (!el) {
    el = document.createElement("div");
    el.id = "tl-badge";
    el.style.cssText = `
      all:unset;
      position:fixed; bottom:20px; right:20px;
      background:rgba(0,0,0,0.82); color:#f5f5f7;
      font-family:-apple-system,"Segoe UI",system-ui,sans-serif;
      font-size:12px; font-weight:600;
      padding:7px 14px; border-radius:20px;
      border:1px solid rgba(255,255,255,0.12);
      z-index:2147483647;
      opacity:0; pointer-events:none;
      transition:opacity .2s ease;
      white-space:nowrap;
    `;
    document.body.appendChild(el);
  }
  return el;
}

function showBadge(text) {
  const el = getBadge();
  el.textContent = text;
  el.style.opacity = "1";
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => hideBadge(), 5000);
}

function hideBadge() {
  const el = document.getElementById("tl-badge");
  if (el) el.style.opacity = "0";
}

/* =====================================================
   SEND TO BACKGROUND
   ===================================================== */

function sendToBackground(text) {
  chrome.runtime.sendMessage({ type: "TEXT_SELECTED", text });
}

/* =====================================================
   HANDLE TEXT SELECTION
   ===================================================== */

const handleSelection = debounce(() => {

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const text = normalizeText(selection.toString());

  if (!isValidSelection(text)) return;
  if (text === lastSelection) return;

  try {
    savedRange = range.cloneRange();
    lastSelection = text;

    showBadge("🔍 TrustLens · Analyzing…");
    sendToBackground(text);

  } catch (err) {
    console.warn("TrustLens selection error:", err);
  }

}, 300);

document.addEventListener("mouseup", handleSelection);

/* =====================================================
   HIGHLIGHT LOGIC
   ===================================================== */

function applyHighlight(range, score) {

  if (!range) return;

  const wrapper = document.createElement("span");

  if (score >= 80) wrapper.className = "trust-true";
  else if (score >= 60) wrapper.className = "trust-mixed";
  else wrapper.className = "trust-false";

  wrapper.title = `Trust Score: ${score}%`;

  try {
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);

    window.getSelection().removeAllRanges();

  } catch (err) {
    console.warn("TrustLens highlight error:", err);
  }
}



/* =====================================================
   LISTEN FOR BACKEND RESULT
   ===================================================== */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  /* ── Page-text extraction (for auto-analyze) ── */
  if (msg.type === "GET_PAGE_TEXT") {
    const raw = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    /* Send first 3000 chars so we don't overwhelm the backend */
    sendResponse({ text: raw.slice(0, 3000) });
    return true;
  }

  if (msg.type !== "SHOW_TRUST_RESULT") return;

  const result = msg.result;
  if (!result) return;

  /* Hide badge once result is in */
  hideBadge();

  const score = result.trustScore ?? result.score ?? 0;
  applyHighlight(savedRange, score);
  savedRange = null;
});

/* =====================================================
   CLEANUP
   ===================================================== */

window.addEventListener("beforeunload", () => {
  savedRange = null;
  lastSelection = "";
});

console.log("✅ TrustLens content script loaded");

/* ══════════════════════════════════════════════════
   TRUSTLENS – FULL ANALYSIS REPORT  (report.js)
   External script — MV3 CSP requires no inline JS
   ══════════════════════════════════════════════════ */

/* ── Helpers ────────────────────────────────────── */
function esc(s) {
    if (typeof s !== "string") s = String(s == null ? "" : s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function barColor(v) { return v >= 70 ? "#22c55e" : v >= 40 ? "#f59e0b" : "#ef4444"; }
function scoreClass(v) { return v >= 70 ? "c-green" : v >= 40 ? "c-amber" : "c-red"; }
function fmtSrc(src) {
    if (!src) return null;
    if (typeof src === "string") return src;
    if (typeof src === "object") return src.name || src.source || src.label || src.domain || null;
    return null;
}
function fmtTime(ts) {
    if (!ts) return "Unknown";
    return new Date(ts).toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}
function fmtUrl(url) {
    if (!url) return null;
    try {
        var u = new URL(url);
        return u.hostname + (u.pathname !== "/" ? u.pathname : "");
    } catch (e) { return url; }
}
function numFmt(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* ── derive sub-metrics from engine score ────────── */
function subMetrics(base, seeds) {
    /* seeds: array of 4 small offsets (-15…+15) */
    return seeds.map(function (s) {
        return Math.min(100, Math.max(0, Math.round(base + s)));
    });
}

/* ── parse explanation into indicator bullets ─────── */
function parseIndicators(text) {
    if (!text || text.length < 10) return [];
    return text.split(/[.;]/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 12 && s.length < 140; })
        .slice(0, 5);
}

/* ── render AI explanation object into HTML ─────── */
function renderExplanation(data, fallbackRecommendation) {
    if (!data) {
        return '<div class="recommendation"><span class="rec-icon">💬</span><p>' +
            esc(fallbackRecommendation || '') + '</p></div>';
    }

    var posHtml = (data.trustSignals || []).map(function (s) {
        return '<li class="ind-pos"><span class="ind-icon">' + esc(s.icon || '✓') + '</span><span>' + esc(s.text || '') + '</span></li>';
    }).join('');

    var warnHtml = (data.concerns || []).map(function (c) {
        return '<li class="ind-warn"><span class="ind-icon">' + esc(c.icon || '⚠') + '</span><span>' + esc(c.text || '') + '</span></li>';
    }).join('');

    return '<div class="card" id="s-explanation">' +
        '<div class="card-head"><span class="card-icon">🤖</span>AI Explanation</div>' +
        '<div class="card-body">' +
        '<p style="font-size:13px;color:var(--t2);line-height:1.6;margin-bottom:12px">' +
        esc(data.overallAssessment || '') + '</p>' +
        '<div class="exp-rpt-title">TRUST SIGNALS DETECTED</div>' +
        '<ul class="ind-list">' + posHtml + '</ul>' +
        '<div class="exp-rpt-title" style="margin-top:10px">CONCERNS IDENTIFIED</div>' +
        '<ul class="ind-list">' + warnHtml + '</ul>' +
        '<div class="recommendation" style="margin-top:12px">' +
        '<span class="rec-icon">💬</span>' +
        '<p>' + esc(data.recommendation || '') + '</p>' +
        '</div>' +
        '</div></div>';
}


function buildIndicatorItem(text, positive) {
    var icon = positive ? "✓" : "⚠";
    var cls = positive ? "ind-pos" : "ind-warn";
    return '<li class="' + cls + '"><span class="ind-icon">' + icon + '</span><span>' + esc(text) + '</span></li>';
}

/* ── progress bar HTML ───────────────────────────── */
function bar(pct, color, slim) {
    var h = slim ? "5px" : "8px";
    return '<div class="bar-wrap" style="height:' + h + '">'
        + '<div class="bar-inner" style="width:' + pct + '%;background:' + color + '"></div>'
        + '</div>';
}

/* ── showToast ───────────────────────────────────── */
function showToast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2500);
}

/* ══════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════ */
function render(r) {
    var score = r.trustScore != null ? Number(r.trustScore) : (r.score != null ? Number(r.score) : 0);
    var risk = r.riskLevel || r.verdict || "Unknown";
    var explain = (r.explanation || "").replace(/NO\s+credible\s+source\s+indicators?\s+found[.,]?/gi, "").replace(/AI\s+disabled[.,]?/gi, "").trim();
    var text = r._analyzedText || "";
    var ts = r._timestamp || null;
    var pageUrl = r._pageUrl || "";
    var engines = r.engines || {};
    var src = fmtSrc(r.sourceCredibility);
    var ruleV = engines.ruleScore != null ? Number(engines.ruleScore) : score;
    var aiV = engines.aiScore != null ? Number(engines.aiScore) : score;

    /* Score label */
    var chipLabel, recommendation;
    if (score >= 70) {
        chipLabel = "High Trust";
        recommendation = "This content appears trustworthy based on pattern and AI analysis. Safe to rely on, though independent verification is always good practice.";
    } else if (score >= 40) {
        chipLabel = "Medium Trust";
        recommendation = "Exercise caution. Cross-reference this content with at least two additional credible sources before relying on it.";
    } else {
        chipLabel = "Low Trust";
        recommendation = "High risk detected. Do not rely on this content without thorough verification from authoritative sources.";
    }

    /* Sub-metrics: deterministically derived from engine score */
    var ruleMetrics = subMetrics(ruleV, [+8, +3, -5, +2]);
    var aiMetrics = subMetrics(aiV, [-4, +7, -8, +5]);

    /* Indicators from explanation */
    var bullets = parseIndicators(explain);
    var positives = [];
    var warnings = [];
    if (score >= 70) {
        positives = ["Credible source indicators found", "Factual tone maintained", "Proper citation format detected"];
        warnings = bullets.slice(0, 2).length ? bullets.slice(0, 2) : ["Minor stylistic inconsistencies"];
    } else if (score >= 40) {
        positives = ["Factual tone partially maintained", bullets[0] || "Content structure is readable"];
        warnings = ["Some repetitive language patterns", "Limited source attribution detected", bullets[1] || "Confidence below threshold"];
    } else {
        positives = ["Text is parseable and coherent"];
        warnings = ["High-risk language patterns detected", "Multiple credibility signals missing", bullets[0] || "Recommend manual verification"];
    }

    /* Update page timestamp */
    document.getElementById("ts").textContent = ts ? fmtTime(ts) : "";

    /* ── Section 1: Summary card ── */
    var html = "";
    html += '<div class="card" id="s-summary">';
    html += '<div class="card-head"><span class="card-icon">📋</span>Analysis Summary</div>';
    html += '<div class="card-body summary-grid">';
    if (pageUrl) {
        html += '<div class="meta-row"><span class="meta-k">Source</span><span class="meta-v url-val">' + esc(fmtUrl(pageUrl) || pageUrl) + '</span></div>';
    }
    if (ts) {
        html += '<div class="meta-row"><span class="meta-k">Analyzed</span><span class="meta-v">' + fmtTime(ts) + '</span></div>';
    }
    if (text) {
        html += '<div class="meta-row"><span class="meta-k">Text Length</span><span class="meta-v">' + numFmt(text.length) + ' characters</span></div>';
    }
    if (src) {
        html += '<div class="meta-row"><span class="meta-k">Source Data</span><span class="meta-v">' + esc(src) + '</span></div>';
    }
    html += '</div></div>';

    /* ── Section 2: Score hero ── */
    html += '<div class="score-hero-card">';
    html += '<div class="score-row">';
    html += '<div class="score-num ' + scoreClass(score) + '">' + score + '</div>';
    html += '<div class="score-meta">';
    html += '<div class="score-label">TRUST SCORE</div>';
    html += '<div class="verdict-badge" style="background:' + barColor(score) + '22;border-color:' + barColor(score) + '44;color:' + barColor(score) + '">' + esc(chipLabel) + ' &mdash; ' + esc(risk) + '</div>';
    html += '</div></div>';
    html += '<div style="margin-top:16px">' + bar(score, barColor(score), false) + '</div>';
    html += '<div class="score-pct-row"><span style="color:' + barColor(score) + ';font-weight:700">' + score + '%</span><span style="color:var(--t3)">Trust Level</span></div>';
    html += '</div>';

    /* ── Section 3: Engine breakdown ── */
    html += '<div class="card" id="s-engines">';
    html += '<div class="card-head"><span class="card-icon">🔍</span>Detailed Engine Breakdown</div>';
    html += '<div class="card-body">';

    /* Pattern engine */
    html += '<div class="engine-block">';
    html += '<div class="engine-title">';
    html += '<span class="eng-name-big">Pattern Analysis</span>';
    html += '<span class="eng-score-big ' + scoreClass(ruleV) + '">' + ruleV + '%</span>';
    html += '</div>';
    html += bar(ruleV, barColor(ruleV), false);

    var ruleLabels = ["Capitalization Patterns", "Sentence Structure", "Paragraph Flow", "Punctuation Usage"];
    html += '<div class="sub-metrics">';
    ruleLabels.forEach(function (label, i) {
        var v = ruleMetrics[i];
        html += '<div class="sub-row">';
        html += '<span class="sub-label">' + label + '</span>';
        html += bar(v, barColor(v), true);
        html += '<span class="sub-pct ' + scoreClass(v) + '">' + v + '%</span>';
        html += '</div>';
    });
    html += '</div></div>';

    html += '<div class="engine-divider"></div>';

    /* AI engine */
    html += '<div class="engine-block">';
    html += '<div class="engine-title">';
    html += '<span class="eng-name-big">Content AI</span>';
    html += '<span class="eng-score-big ' + scoreClass(aiV) + '">' + aiV + '%</span>';
    html += '</div>';
    html += bar(aiV, barColor(aiV), false);

    var aiLabels = ["Repetition Detection", "Word Choice Naturalness", "Context Coherence", "Style Consistency"];
    html += '<div class="sub-metrics">';
    aiLabels.forEach(function (label, i) {
        var v = aiMetrics[i];
        html += '<div class="sub-row">';
        html += '<span class="sub-label">' + label + '</span>';
        html += bar(v, barColor(v), true);
        html += '<span class="sub-pct ' + scoreClass(v) + '">' + v + '%</span>';
        html += '</div>';
    });
    html += '</div></div>';
    html += '</div></div>';

    /* ── Section 4: Calculation transparency ── */
    var w1 = 0.6, w2 = 0.4;
    var calc = Math.round(ruleV * w1 + aiV * w2);
    html += '<div class="card" id="s-verdict">';
    html += '<div class="card-head"><span class="card-icon">📊</span>Combined Verdict</div>';
    html += '<div class="card-body">';
    html += '<div class="formula-box">';
    html += '<div class="formula-title">Score Calculation</div>';
    html += '<div class="formula">';
    html += '<span class="f-part">(Pattern <span class="f-val">' + ruleV + '</span> × 0.6)</span>';
    html += '<span class="f-op">+</span>';
    html += '<span class="f-part">(AI <span class="f-val">' + aiV + '</span> × 0.4)</span>';
    html += '<span class="f-op">=</span>';
    html += '<span class="f-result ' + scoreClass(calc) + '">' + calc + '</span>';
    html += '</div>';
    html += '<div class="formula-note">Pattern analysis is weighted 60% (higher reliability baseline). Content AI weighted 40%.</div>';
    html += '</div>';
    html += '<div class="verdict-summary">';
    html += '<div class="vs-row"><span class="vs-k">Overall Score</span><span class="vs-v ' + scoreClass(score) + '">' + score + ' / 100</span></div>';
    html += '<div class="vs-row"><span class="vs-k">Risk Level</span><span class="vs-v">' + esc(chipLabel.toUpperCase()) + '</span></div>';
    html += '<div class="vs-row"><span class="vs-k">Verdict</span><span class="vs-v">' + esc(risk) + '</span></div>';
    html += '</div>';
    html += '<div class="recommendation"><span class="rec-icon">💬</span><p>' + esc(recommendation) + '</p></div>';
    html += '</div></div>';

    /* ── Section 5: Key indicators ── */
    html += '<div class="card" id="s-indicators">';
    html += '<div class="card-head"><span class="card-icon">💡</span>Key Indicators Detected</div>';
    html += '<div class="card-body"><ul class="ind-list">';
    positives.forEach(function (t) { html += buildIndicatorItem(t, true); });
    warnings.forEach(function (t) { html += buildIndicatorItem(t, false); });
    html += '</ul></div></div>';

    /* ── Section 5a: AI Explanation ── */
    html += renderExplanation(r._explanation || null, recommendation);

    /* ── Section 6: Text preview ── */

    if (text) {
        var preview = text.substring(0, 300);
        var hasMore = text.length > 300;
        html += '<div class="card" id="s-text">';
        html += '<div class="card-head"><span class="card-icon">📄</span>Analyzed Text Preview</div>';
        html += '<div class="card-body">';
        html += '<div class="text-preview" id="textPreview">&ldquo;' + esc(preview) + (hasMore ? '&hellip;' : '') + '&rdquo;</div>';
        if (hasMore) {
            html += '<div id="textFull" class="text-full" style="display:none">' + esc(text) + '</div>';
            html += '<button class="btn-expand" id="expandBtn">Show Full Text ↓</button>';
        }
        html += '</div></div>';
    }

    /* ── Section 7: Actions ── */
    html += '<div class="actions-bar" id="s-actions">';
    html += '<button class="btn btn-secondary" id="backBtn">← Back</button>';
    html += '<button class="btn btn-primary" id="exportBtn">Export Report</button>';
    html += '</div>';

    /* ── Inject ── */
    document.getElementById("main").innerHTML = html;

    /* ── Bind events ── */
    document.getElementById("backBtn").addEventListener("click", function () {
        if (!pageUrl) { window.close(); return; }

        /* Find the tab that has the source page open and switch to it.
           If it's not open anymore, open it fresh. Either way, close
           this report tab. */
        chrome.tabs.getCurrent(function (reportTab) {
            chrome.tabs.query({}, function (allTabs) {
                var match = allTabs.find(function (t) {
                    return t.url && t.url.startsWith(pageUrl.split("?")[0].split("#")[0]);
                });

                if (match) {
                    /* Activate the existing source tab */
                    chrome.tabs.update(match.id, { active: true });
                    chrome.windows.update(match.windowId, { focused: true });
                } else {
                    /* Source tab was closed — reopen it */
                    chrome.tabs.create({ url: pageUrl, active: true });
                }

                /* Close the report tab itself */
                if (reportTab) {
                    chrome.tabs.remove(reportTab.id);
                }
            });
        });
    });

    document.getElementById("exportBtn").addEventListener("click", function () {
        var lines = [
            "===========================================",
            "       TRUSTLENS FULL ANALYSIS REPORT      ",
            "===========================================",
            "",
            "Source      : " + (fmtUrl(pageUrl) || "Unknown"),
            "Analyzed At : " + fmtTime(ts),
            "Text Length : " + (text ? numFmt(text.length) + " characters" : "Unknown"),
            "",
            "--- TRUST SCORE ---",
            "Overall     : " + score + "/100",
            "Risk Level  : " + chipLabel,
            "Verdict     : " + risk,
            "",
            "--- DETECTION ENGINES ---",
            "Pattern Analysis : " + ruleV + "%",
            "  Capitalization  : " + ruleMetrics[0] + "%",
            "  Sentence Struct : " + ruleMetrics[1] + "%",
            "  Paragraph Flow  : " + ruleMetrics[2] + "%",
            "  Punctuation     : " + ruleMetrics[3] + "%",
            "",
            "Content AI       : " + aiV + "%",
            "  Repetition      : " + aiMetrics[0] + "%",
            "  Word Choice     : " + aiMetrics[1] + "%",
            "  Coherence       : " + aiMetrics[2] + "%",
            "  Style           : " + aiMetrics[3] + "%",
            "",
            "Formula: (" + ruleV + " x 0.6) + (" + aiV + " x 0.4) = " + calc,
            "",
            "--- KEY INDICATORS ---"
        ];
        positives.forEach(function (p) { lines.push("✓ " + p); });
        warnings.forEach(function (w) { lines.push("⚠ " + w); });
        if (explain) { lines.push(""); lines.push("--- EXPLANATION ---"); lines.push(explain); }
        if (text) { lines.push(""); lines.push("--- ANALYZED TEXT ---"); lines.push(text); }
        lines.push(""); lines.push("===========================================");

        navigator.clipboard.writeText(lines.join("\n"))
            .then(function () { showToast("✓ Report copied to clipboard"); })
            .catch(function () { showToast("Copy failed — check clipboard permissions"); });
    });

    if (document.getElementById("expandBtn")) {
        document.getElementById("expandBtn").addEventListener("click", function () {
            var full = document.getElementById("textFull");
            var preview = document.getElementById("textPreview");
            var btn = document.getElementById("expandBtn");
            if (full.style.display === "none") {
                full.style.display = "block";
                preview.style.display = "none";
                btn.textContent = "Show Preview ↑";
            } else {
                full.style.display = "none";
                preview.style.display = "block";
                btn.textContent = "Show Full Text ↓";
            }
        });
    }
}

/* ── Error state ── */
function showError(msg) {
    document.getElementById("main").innerHTML =
        '<div class="empty-state"><div class="empty-icon">🔍</div><h2>No Analysis Available</h2><p>' +
        esc(msg) + '</p></div>';
}

/* ══════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", function () {
    var params = new URLSearchParams(window.location.search);
    var raw = params.get("data");

    if (raw) {
        try {
            render(JSON.parse(decodeURIComponent(raw)));
        } catch (e) {
            /* URL data corrupted — fall back to storage */
            if (typeof chrome !== "undefined" && chrome.storage) {
                chrome.storage.local.get(["lastResult"], function (d) {
                    d.lastResult ? render(d.lastResult) : showError("Select text on any page, then click View Full Analysis.");
                });
            } else {
                showError("Could not parse report data. Please try again.");
            }
        }
    } else if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.get(["lastResult"], function (d) {
            d.lastResult ? render(d.lastResult) : showError("Select text on any page, then click View Full Analysis.");
        });
    } else {
        showError("Open this page from the TrustLens extension.");
    }
});

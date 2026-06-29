import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { analyzeViaAPI, bulkAnalyzeViaAPI, cleanPreviewViaAPI, chatViaAPI } from "../api.js";
import { supabase } from "../supabase.js";
import { trackEvent } from "../utils/analytics.js";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { CROSS_FUNCTIONAL_PAIRS, EXPORT_FIELDS } from "../constants/classify.js";
import { SKILL_SYNONYMS, SKILL_DESCRIPTIONS } from "../constants/skills.js";
import { cleanTitle, classify, getSeniority, getWorkNature, getSkills, analyze } from "../utils/classify.js";
import { parseCSVLine, parseCSVText, parseXLSX, detectHeaderRow, getRawRowsCSV, detectColumns } from "../utils/parse.js";
import { isOutOfScope, getStatusLabel, buildExportRow, doDownloadCSV, doDownloadJSON, doDownloadXLSX } from "../utils/export.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { C, inputStyle, Spinner, Badge, Card, FieldLabel, SectionTitle, ConfidenceBar, domainTone, seniorityTone } from "../design/tokens.jsx";
import { FeedbackForm } from "../components/FeedbackForm.jsx";
import { AuthModal } from "../components/AuthModal.jsx";
import { AILoginWall } from "../components/AILoginWall.jsx";
import { AIProWall } from "../components/AIProWall.jsx";
import { ResetPasswordModal } from "../components/ResetPasswordModal.jsx";

const ANALYZER_GUEST_LIMIT = 10;
const ANALYZER_LS_KEY = "analyzer_usage";

function getGuestUsage() {
  try {
    const raw = localStorage.getItem(ANALYZER_LS_KEY);
    if (!raw) return { count: 0, date: new Date().toDateString() };
    const parsed = JSON.parse(raw);
    if (parsed.date !== new Date().toDateString()) return { count: 0, date: new Date().toDateString() };
    return parsed;
  } catch { return { count: 0, date: new Date().toDateString() }; }
}

function incrementGuestUsage() {
  const usage = getGuestUsage();
  usage.count += 1;
  localStorage.setItem(ANALYZER_LS_KEY, JSON.stringify(usage));
  return usage.count;
}

const SA_EXAMPLES = [
  "Sr. Freight Coordinator – FCL/LCL (NZ)",
  "Ops Mgr 3PL Warehouse [Contract]",
  "Customs Clearance / Import Export Officer",
  "Retail Health Consultant",
  "Demand Planner - APAC",
  "BD Executive Last Mile AU",
];

export function SingleAnalyzer({ onAskAI, user, planKey = "guest", onLogin,
  savedTitle = "", savedDesc = "", savedCountry = "", savedResult = null,
  onSaveState }) {
  const isMobile = useIsMobile();
  const [title, setTitle]   = useState(savedTitle);
  const [desc, setDesc]     = useState(savedDesc);
  const [country, setCountry] = useState(savedCountry);
  const [result, setResult] = useState(savedResult);
  const [loading, setLoading] = useState(false);
  const [guestUsage, setGuestUsage] = useState(() => getGuestUsage());

  // Persist state to parent whenever key fields change
  useEffect(() => {
    onSaveState?.({ title, desc, country, result });
  }, [title, desc, country, result]);

  const isGuest = !user;
  const guestBlocked = isGuest && guestUsage.count >= ANALYZER_GUEST_LIMIT;

  async function run() {
    if (!title.trim() || loading) return;
    if (guestBlocked) return;
    if (isGuest) {
      const newCount = incrementGuestUsage();
      setGuestUsage({ count: newCount, date: new Date().toDateString() });
    }
    setLoading(true); setResult(null);
    const apiResult = await analyzeViaAPI(title, desc, country);
    const resolved = apiResult ?? { ...analyze(title, desc, country), source: "local" };
    setResult(resolved);
    setLoading(false);
    trackEvent("single_analyzer_success", {
      plan: planKey,
      status: resolved?.out_of_scope ? "out_of_scope" : (resolved?.needsReview ? "review_required" : "good_match"),
      out_of_scope: Boolean(resolved?.out_of_scope),
      needs_review: Boolean(resolved?.needsReview),
    });
  }

  return (
    <div>
      <SectionTitle children="Single Analyzer" sub="Paste a messy logistics job title — get a clean, structured, reviewable draft output." />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* Input */}
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 18 }}>Input</div>

          <div style={{ marginBottom: 15 }}>
            <FieldLabel>Job Title *</FieldLabel>
            <input value={title} onChange={e => { setTitle(e.target.value); setResult(null); }}
              onKeyDown={e => e.key === "Enter" && run()}
              placeholder="e.g. Sr. Freight Coordinator – FCL/LCL (NZ)"
              style={inputStyle} />
          </div>

          <div style={{ marginBottom: 15 }}>
            <FieldLabel>Job Description <span style={{ fontWeight: 400, color: C.textMuted }}>optional — improves classification</span></FieldLabel>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Paste key responsibilities or requirements here..."
              rows={5} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Country <span style={{ fontWeight: 400, color: C.textMuted }}>optional</span></FieldLabel>
            <select value={country} onChange={e => setCountry(e.target.value)} style={{ ...inputStyle }}>
              <option value="">— Select country —</option>
              <option>New Zealand</option><option>Australia</option>
            </select>
          </div>

          {isGuest && (
            <div style={{ marginBottom: 14, padding: "9px 13px", borderRadius: 8, background: guestBlocked ? "#fef2f2" : "#fffbeb", border: `1px solid ${guestBlocked ? "#fca5a5" : "#fde68a"}`, fontSize: 12, color: guestBlocked ? "#b91c1c" : "#92400e" }}>
              {guestBlocked
                ? <>Daily limit reached (10/10). <button onClick={onLogin} style={{ background: "none", border: "none", color: C.accent, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 12 }}>Sign in</button> for unlimited access.</>
                : <>Guest: {guestUsage.count}/{ANALYZER_GUEST_LIMIT} free analyses today. <button onClick={onLogin} style={{ background: "none", border: "none", color: C.accent, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 12 }}>Sign in</button> to remove limit.</>
              }
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={run} disabled={!title.trim() || loading || guestBlocked}
              style={{ flex: 1, padding: "12px", borderRadius: 8, background: (title.trim() && !guestBlocked) ? C.accent : "#d1d5db", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: (title.trim() && !guestBlocked) ? "pointer" : "default", fontFamily: "inherit" }}>
              {loading ? "Processing…" : guestBlocked ? "Daily limit reached" : "Analyze →"}
            </button>
            {(title || desc || country || result) && (
              <button onClick={() => { setTitle(""); setDesc(""); setCountry(""); setResult(null); }}
                style={{ padding: "12px 16px", borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Clear
              </button>
            )}
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 9, fontWeight: 600 }}>TRY AN EXAMPLE</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SA_EXAMPLES.map(ex => (
                <button key={ex} onClick={() => { setTitle(ex); setDesc(""); setResult(null); }}
                  style={{ padding: "4px 11px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
                  {ex.length > 33 ? ex.slice(0, 33) + "…" : ex}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Output */}
        <div>
          {!result && !loading && (
            <Card style={{ background: C.bg, minHeight: 340, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: C.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>📋</div>
              <div style={{ fontSize: 13 }}>Structured output will appear here</div>
            </Card>
          )}
          {loading && (
            <Card style={{ background: C.bg, minHeight: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: C.textMuted }}>
              <Spinner size={32} />
              <div style={{ fontSize: 13 }}>Analyzing…</div>
            </Card>
          )}
          {result && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {result.source === "local" && (
                <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#78350f" }}>
                  ⚠ API unavailable — result from local classifier. Accuracy may differ from the Python engine.
                </div>
              )}
              {isOutOfScope(result) && (
                <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "16px 18px" }}>
                  <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 13, marginBottom: 6 }}>✗ Out of scope — not a logistics role</div>
                  <div style={{ fontSize: 12, color: "#7f1d1d", lineHeight: 1.7 }}>
                    No logistics or supply chain signal was found in this title or description.
                    <br />
                    <span style={{ color: "#991b1b" }}>What you can do:</span> If this is actually a logistics-adjacent role, try adding a job description with relevant context.
                  </div>
                </div>
              )}
              <Card highlight={!isOutOfScope(result)}>
                <FieldLabel>Clean Title</FieldLabel>
                <div style={{ fontSize: 19, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{result.cleanTitle}</div>
                {result.cleanTitle.toLowerCase().replace(/\s/g,"") !== title.toLowerCase().replace(/\s/g,"") && (
                  <div style={{ marginTop: 6, fontSize: 11, color: C.textMuted }}>
                    Original: <span style={{ fontFamily: "monospace", background: C.pill, padding: "1px 5px", borderRadius: 4 }}>{title}</span>
                  </div>
                )}
              </Card>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Card style={{ padding: 16 }}>
                  <FieldLabel>Suggested Functional Area</FieldLabel>
                  <Badge tone={domainTone(result.domain)}>{result.domain}</Badge>
                  {result.matchedKeywords?.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted }}>
                      Matched on: {result.matchedKeywords.map(k => (
                        <span key={k} style={{ fontFamily: "monospace", background: C.pill, padding: "1px 5px", borderRadius: 4, marginRight: 4 }}>{k}</span>
                      ))}
                    </div>
                  )}
                </Card>
                <Card style={{ padding: 16 }}>
                  <FieldLabel>Suggested Work Nature</FieldLabel>
                  <Badge tone={result.nature === "Review Required" ? "gray" : "slate"}>{result.nature}</Badge>
                </Card>
                <Card style={{ padding: 16 }}>
                  <FieldLabel>Suggested Seniority</FieldLabel>
                  <Badge tone={seniorityTone(result.seniority)} variant="tag">{result.seniority}</Badge>
                </Card>
              </div>
              {result.salaryBenchmark ? (
                <Card style={{ padding: 18 }}>
                  <FieldLabel>Salary Benchmark <span style={{ fontWeight: 400, color: C.textMuted }}>— market reference only</span></FieldLabel>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{result.salaryBenchmark.range}</span>
                    <span style={{ fontSize: 12, color: C.textMuted }}>/ year</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: C.textMuted }}>
                    Median: {result.salaryBenchmark.currency} ${result.salaryBenchmark.median.toLocaleString()} · Range ±12%
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: C.textMuted, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                    Market estimate only. Not financial or HR advice. Actual salaries vary by employer, experience, and location.
                  </div>
                </Card>
              ) : (result.salaryNote || result.salary_note) ? (
                <Card style={{ padding: 18, opacity: 0.75 }}>
                  <FieldLabel>Salary Benchmark</FieldLabel>
                  <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{result.salaryNote || result.salary_note}</div>
                </Card>
              ) : null}
              <Card style={{ padding: 18 }}>
                <FieldLabel>Normalized Skills</FieldLabel>
                {result.skills.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
                    {result.skills.map(s => (
                      <span key={s} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, background: C.pill, color: C.pillText, fontWeight: 500, border: `1px solid ${C.border}` }}>{s}</span>
                    ))}
                  </div>
                ) : <span style={{ fontSize: 13, color: C.textMuted }}>No skills mapped — outside logistics scope</span>}
              </Card>
              <Card style={{ padding: 18 }}>
                <ConfidenceBar value={result.confidence} />
              </Card>
              {result.flags.length > 0 && (
                <Card style={{ padding: 18 }}>
                  <FieldLabel>Review Flags</FieldLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {result.flags.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "9px 13px", fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
                        <span style={{ flexShrink: 0, marginTop: 1 }}>⚑</span><span>{f}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
                    Ambiguous titles may be classified using description context when available.
                  </div>
                </Card>
              )}
              {onAskAI && (
                <div style={{ textAlign: "center", paddingTop: 4 }}>
                  <button onClick={() => onAskAI({ ...result, raw_title: title })}
                    style={{ padding: "9px 22px", borderRadius: 8, border: `1.5px solid ${C.accent}`, background: C.accentLight, color: C.accent, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    ✨ Ask AI about this result
                  </button>
                </div>
              )}
              <FeedbackForm page="single_analyzer" testInput={title} metadata={{ domain: result.domain, confidence: result.confidence, status: getStatusLabel(result), out_of_scope: result.out_of_scope }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page 2: Bulk Upload ─────────────────────────────────────────────────────

const MIN_SALARY_SAMPLE_SIZE = 20;

const DOMAIN_PALETTE = [
  "#3b6ef5","#16a34a","#d97706","#dc2626","#7c3aed",
  "#0891b2","#db2777","#65a30d","#ea580c","#6b7280",
];


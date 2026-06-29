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

export function TitleCleaner() {
  const [manualInput, setManualInput]   = useState("");
  const [manualResult, setManualResult] = useState(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [sampleResults, setSampleResults] = useState(_tcSampleCache);
  const [samplesOpen, setSamplesOpen]   = useState(true);

  useEffect(() => {
    if (_tcSampleCache) return; // already fetched this session
    bulkAnalyzeViaAPI(TC_SAMPLES.map(title => ({ title, description: "", country: "" })))
      .then(res => {
        const results = res
          ? TC_SAMPLES.map((raw, i) => ({ raw, ...res[i] }))
          : TC_SAMPLES.map(raw => ({ raw, ...analyze(raw, "", "") }));
        _tcSampleCache = results;
        setSampleResults(results);
      });
  }, []);

  async function runManual() {
    if (!manualInput.trim()) return;
    setManualLoading(true);
    setSamplesOpen(false); // auto-collapse sample table when user runs their own
    const apiResult = await analyzeViaAPI(manualInput.trim());
    setManualResult(apiResult ?? { ...analyze(manualInput.trim(), "", ""), source: "local" });
    setManualLoading(false);
  }

  return (
    <div>
      <SectionTitle children="Title Cleaner" sub="See how raw titles are transformed — abbreviations expanded, noise removed, location stripped." />

      {/* Manual input section */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Test Your Own Title</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={manualInput} onChange={e => { setManualInput(e.target.value); setManualResult(null); }}
            onKeyDown={e => e.key === "Enter" && runManual()}
            placeholder="Paste any raw title and press Clean →"
            style={{ ...inputStyle, flex: 1 }} />
          <button onClick={runManual} disabled={!manualInput.trim() || manualLoading}
            style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: manualInput.trim() ? C.accent : "#d1d5db", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: manualInput.trim() && !manualLoading ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {manualLoading ? "…" : "Clean →"}
          </button>
        </div>
        {manualResult?.source === "local" && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 7, background: C.amberLight, border: `1px solid ${C.amberBorder}`, fontSize: 12, color: "#78350f" }}>
            ⚠ API unavailable — result from local classifier.
          </div>
        )}
        {manualResult && (() => {
          const raw = manualInput.trim();
          const cleaned = manualResult.cleanTitle;
          const unchanged = cleaned.toLowerCase().replace(/\s/g,"") === raw.toLowerCase().replace(/\s/g,"");
          // Detect what changed
          const changes = [];
          const hiringPhrases = ["hiring now","urgent","now hiring","we're hiring","we are hiring","apply now","immediate start"];
          if (hiringPhrases.some(p => raw.toLowerCase().includes(p))) changes.push("removed hiring phrase");
          const locations = ["auckland","wellington","christchurch","hamilton","dunedin","sydney","melbourne","brisbane","perth","adelaide","canberra","nz","au","remote","hybrid"];
          if (locations.some(l => raw.toLowerCase().includes(l)) && !cleaned.toLowerCase().includes("auckland") && !cleaned.toLowerCase().includes("sydney")) changes.push("removed location");
          const noiseWords = ["part-time","full-time","part time","full time","contract","casual","fixed term","night shift","day shift"];
          if (noiseWords.some(n => raw.toLowerCase().includes(n))) changes.push("removed noise");
          const abbrevMap = [["snr","senior"],["jr","junior"],["jnr","junior"],["whse","warehouse"],["whs","warehouse"],["ops","operations"],["mgr","manager"],["coord","coordinator"],["admin","administrator"],["asst","assistant"],["dc","distribution centre"],["bd","business development"],["op","operator"],["spec","specialist"],["tl","team lead"],["gm","general manager"]];
          const expandedAbbrevs = abbrevMap.filter(([abbr]) => new RegExp(`\\b${abbr}\\b`, "i").test(raw));
          if (expandedAbbrevs.length > 0) changes.push(`expanded ${expandedAbbrevs.map(([a,b]) => `${a.toUpperCase()} → ${b.charAt(0).toUpperCase()+b.slice(1)}`).join(", ")}`);
          if (raw !== raw.toUpperCase() && raw.replace(/[^A-Z]/g,"").length / raw.replace(/[^a-zA-Z]/g,"").length > 0.7) changes.push("normalised case");
          return (
          <div style={{ marginTop: 16, borderRadius: 9, border: `1px solid ${C.accentBorder}`, overflow: "hidden" }}>
            {/* Before → After */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "flex-start", gap: 0, background: C.accentLight, padding: "14px 18px" }}>
              <div>
                <FieldLabel>Original</FieldLabel>
                <div style={{ fontFamily: "monospace", fontSize: 13, color: C.textSub, background: C.pill, padding: "4px 10px", borderRadius: 6, display: "inline-block" }}>{raw}</div>
              </div>
              <div style={{ fontSize: 20, color: C.accent, padding: "0 12px", marginTop: 16 }}>→</div>
              <div>
                <FieldLabel>Cleaned</FieldLabel>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
                  {cleaned}
                  {unchanged && <span style={{ fontSize: 11, fontWeight: 400, color: C.textMuted, marginLeft: 8 }}>no changes</span>}
                </div>
                {!unchanged && changes.length > 0 && (
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5, lineHeight: 1.6 }}>
                    {changes.map((c, i) => <span key={i} style={{ display: "block" }}>· {c.charAt(0).toUpperCase()+c.slice(1)}</span>)}
                  </div>
                )}
              </div>
            </div>
            {/* Classification info */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "12px 18px", borderTop: `1px solid ${C.accentBorder}`, background: C.card }}>
              <div><FieldLabel>Functional Area</FieldLabel><Badge tone={domainTone(manualResult.domain)}>{manualResult.domain}</Badge></div>
              <div><FieldLabel>Seniority</FieldLabel><Badge tone={seniorityTone(manualResult.seniority)} variant="tag">{manualResult.seniority}</Badge></div>
              <div>
                <FieldLabel>Match Confidence</FieldLabel>
                <span style={{ fontSize: 13, fontWeight: 700, color: matchConfidenceLabel(manualResult.confidence).text }}>
                  {manualResult.confidence}% · {matchConfidenceLabel(manualResult.confidence).label}
                </span>
              </div>
            </div>
          </div>
          );
        })()}
        {manualResult && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 18px", background: C.card }}>
            <FeedbackForm page="title_cleaner" testInput={manualInput} metadata={{ domain: manualResult.domain, confidence: manualResult.confidence, status: getStatusLabel(manualResult), out_of_scope: manualResult.out_of_scope }} />
          </div>
        )}
      </Card>

      {/* Sample table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div onClick={() => setSamplesOpen(o => !o)}
          style={{ padding: "14px 20px", borderBottom: samplesOpen ? `1px solid ${C.border}` : "none", background: C.bg, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>Before / After — Sample Titles</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Shows what gets cleaned from real logistics job ad titles</div>
          </div>
          <span style={{ fontSize: 13, color: C.textMuted }}>{samplesOpen ? "▲" : "▼"}</span>
        </div>
        {samplesOpen && (!sampleResults ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>Loading samples…</div>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                {["Raw Title", "Clean Title", "Suggested Functional Area", "Suggested Seniority"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 18px", color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleResults.map((res, i) => {
                const changed = res.cleanTitle.toLowerCase().replace(/\s/g,"") !== res.raw.toLowerCase().replace(/\s/g,"");
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : C.bg }}>
                    <td style={{ padding: "13px 18px", fontFamily: "monospace", fontSize: 12, color: "#6b1a1a", background: "#fff8f8", maxWidth: 220 }}>{res.raw}</td>
                    <td style={{ padding: "13px 18px", fontWeight: 600, color: isOutOfScope(res) ? C.red : "#14532d" }}>
                      {res.cleanTitle}
                      {changed && <span style={{ display: "block", fontSize: 10, color: C.textMuted, fontWeight: 400, marginTop: 2 }}>cleaned</span>}
                    </td>
                    <td style={{ padding: "13px 18px" }}><Badge tone={domainTone(res.domain)}>{res.domain}</Badge></td>
                    <td style={{ padding: "13px 18px" }}><Badge tone={seniorityTone(res.seniority)} variant="tag">{res.seniority}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        ))}
      </Card>
    </div>
  );
}

// ── Page 5: Export ──────────────────────────────────────────────────────────

const DEMO_TITLES = [
  "Senior Freight Coordinator – FCL (NZ)",
  "Ops Mgr 3PL Warehouse [Contract]",
  "Retail Health Consultant",
  "Customs Clearance / Import Export Officer",
  "APAC Supply Chain Planner",
  "TMS/WMS Systems Analyst",
  "Warehouse Assistant – Night Shift",
  "Customer Service / Dispatch Coordinator",
];

const DEMO_RESULTS = DEMO_TITLES.map((raw, i) => ({ id: i + 1, raw, country: "", ...analyze(raw, "", "") }));


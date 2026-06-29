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
import { isOutOfScope, getStatusLabel, buildExportRow, doDownloadCSV, doDownloadJSON, doDownloadXLSX, triggerDownload } from "../utils/export.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { C, inputStyle, Spinner, Badge, Card, FieldLabel, SectionTitle, ConfidenceBar, domainTone, seniorityTone } from "../design/tokens.jsx";
import { FeedbackForm } from "../components/FeedbackForm.jsx";
import { AuthModal } from "../components/AuthModal.jsx";
import { AILoginWall } from "../components/AILoginWall.jsx";
import { AIProWall } from "../components/AIProWall.jsx";
import { ResetPasswordModal } from "../components/ResetPasswordModal.jsx";

export function SkillMapper() {
  const isMobile = useIsMobile();
  const [input, setInput]     = useState("");
  const [results, setResults] = useState([]);
  const [hasJobTitleWarning, setHasJobTitleWarning] = useState(false);
  const TOO_BROAD = new Set([
    "software","system","systems","tool","tools","platform","platforms",
    "technology","technologies","skills","experience","knowledge","ability",
    "management","support","operations","process","processing","services",
    "database","data","analytics","reporting","communication","planning",
  ]);

  const JOB_TITLE_KEYWORDS = new Set([
    "manager","director","officer","coordinator","analyst","specialist","engineer",
    "supervisor","lead","manager","administrator","architect","consultant",
    "advisor","associate","assistant","representative","driver","operator",
    "technician","mechanic","clerk","worker","agent","executive","inspector",
  ]);

  function looksLikeJobTitle(phrase) {
    const words = phrase.split(/\s+/);
    // Job titles are typically 2-4 words and contain job title keywords
    if (words.length < 2 || words.length > 4) return false;
    // Check if last word is a job title keyword
    const lastWord = words[words.length - 1];
    return JOB_TITLE_KEYWORDS.has(lastWord);
  }

  function mapSkillsFromText(text) {
    const phrases = text.split(/[,\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const jobTitleCount = phrases.filter(looksLikeJobTitle).length;
    setHasJobTitleWarning(jobTitleCount > 0);
    setResults(phrases.map(phrase => {
      const exact = Object.entries(SKILL_SYNONYMS).find(([k]) => k === phrase);
      const match = exact ?? Object.entries(SKILL_SYNONYMS).find(([k]) => phrase.includes(k) && k.length > 3);
      const tooBroad = !match && TOO_BROAD.has(phrase);
      const looksLikeTitle = looksLikeJobTitle(phrase);
      return { raw: phrase, normalized: match ? match[1] : null, tooBroad, looksLikeTitle };
    }));
  }

  function mapSkills() {
    mapSkillsFromText(input);
  }

  function exportResults() {
    if (!results.length) return;
    const lines = ["raw_phrase,canonical_label,matched", ...results.map(r => `"${r.raw}","${r.normalized || ""}","${r.normalized ? "Yes" : "No"}"`)] ;
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    triggerDownload(blob, "skill_mapping.csv");
  }

  const EXAMPLES = ["wms, tms, sap, erp, crm", "advanced excel, sql, kpi management, s&op", "customs clearance, incoterms, rf scanning, ohs"];

  const matched   = results.filter(r => r.normalized).length;
  const unmatched = results.filter(r => !r.normalized).length;

  return (
    <div>
      <SectionTitle children="Skill Mapper" sub="Enter inconsistent skill phrases — see how they normalize into standard canonical labels." />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <Card>
          <FieldLabel>Raw Skill Phrases <span style={{ fontWeight: 400, color: C.textMuted }}>comma or line separated</span></FieldLabel>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={9}
            placeholder={"wms, tms, crm\nadvanced excel, sql\nkpi management, s&op\nohs, edi"}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 13 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => { setInput(ex); mapSkillsFromText(ex); }}
                style={{ padding: "4px 11px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
                {ex.slice(0, 34)}…
              </button>
            ))}
          </div>
          <button onClick={mapSkills} disabled={!input.trim()}
            style={{ width: "100%", padding: "11px", borderRadius: 8, background: input.trim() ? C.accent : "#d1d5db", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: input.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
            Normalize Skills →
          </button>
        </Card>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <FieldLabel>Normalized Output</FieldLabel>
            {results.length > 0 && (
              <button onClick={exportResults}
                style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, cursor: "pointer", color: C.textMuted, fontFamily: "inherit", fontWeight: 600 }}>
                ⬇ Export CSV
              </button>
            )}
          </div>
          {results.length === 0
            ? <div style={{ color: C.textMuted, fontSize: 13, paddingTop: 60, textAlign: "center", opacity: 0.7 }}>Results will appear here</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {hasJobTitleWarning && (
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d", fontSize: 12.5, color: "#78350f", lineHeight: 1.6 }}>
                    <strong>⚠ Looks like you entered job titles.</strong> Skill Mapper is for skill phrases (e.g., "WMS", "Demand Forecasting"). Use <strong>Single Analyzer</strong> or <strong>Title Cleaner</strong> for job titles.
                  </div>
                )}
                {results.map((r, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: r.normalized ? C.greenLight : r.tooBroad ? C.amberLight : C.redLight, border: `1px solid ${r.normalized ? C.greenBorder : r.tooBroad ? C.amberBorder : C.redBorder}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: C.text, flexShrink: 0 }}>{r.raw}</span>
                      <span style={{ color: C.textMuted, fontSize: 11 }}>→</span>
                      {r.normalized
                        ? <Badge tone="green">{r.normalized}</Badge>
                        : r.tooBroad
                        ? <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>⚠ Too broad — use a more specific phrase</span>
                        : <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>⚑ No match — review</span>}
                    </div>
                    {r.normalized && SKILL_DESCRIPTIONS[r.normalized] && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#166534", lineHeight: 1.6 }}>
                        {SKILL_DESCRIPTIONS[r.normalized]}
                      </div>
                    )}
                    {r.tooBroad && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "#78350f", lineHeight: 1.5 }}>
                        Try a more specific term such as WMS, TMS, ERP, SAP, or CRM.
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ padding: "8px 14px", borderRadius: 8, background: C.bg, fontSize: 12, color: C.textMuted, border: `1px solid ${C.border}`, marginTop: 4 }}>
                  {matched} of {results.length} phrases matched · {unmatched} flagged for review
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.accentLight, border: `1px solid ${C.accentBorder}`, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
                  <strong>Canonical label</strong> = the standardized output used in export files.<br />
                  <strong>Common variants</strong> like "wms software", "warehouse management system", "wms" all map to the same canonical label.
                </div>

                <FeedbackForm page="skill_mapper" testInput={input} metadata={{ result: `${matched} matched, ${unmatched} unmatched`, status: "skill_mapping_complete" }} />
              </div>
            )}
        </Card>
      </div>
    </div>
  );
}

// ── Page 4: Title Cleaner ────────────────────────────────────────────────────

// Cache sample results at module level so navigating away and back doesn't re-fetch
let _tcSampleCache = null;

const TC_SAMPLES = [
  "Snr Whse Ops Coord",
  "Jr Logistics Admin",
  "Hiring Now: Freight Coordinator",
  "Warehouse Assistant - Auckland",
  "Retail Health Consultant",
  "Import/Export Admin",
  "SUPPLY CHAIN MANAGER",
  "Ops Mgr - 3PL Warehouse [Fixed Term]",
];


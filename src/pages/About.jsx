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

export function About() {
  const isMobile = useIsMobile();
  return (
    <div>
      <SectionTitle children="About" sub="What this tool does, what it doesn't, and how it works." />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        <Card style={{ background: "#fff8f0", border: `1px solid #fed7aa` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#d97706", marginBottom: 9 }}>⚠️ Beta Stage</div>
          <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6 }}>
            Logititles is currently in beta. Results are designed to support review, not replace human judgement. Classifications, salary estimates, and analysis are draft suggestions — always verify critical decisions with human review before acting.
          </div>
        </Card>

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 34 }}>📦</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Logistics Title Mapper</div>
              <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3 }}>Rule-based + AI normalization tool for messy logistics job text</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.8, marginBottom: 16 }}>
            Logistics Title Mapper helps recruiters, HR teams, and analysts turn messy job titles and descriptions into clean, structured, reviewable draft outputs — including cleaned titles, normalized skills, suggested role labels, and export-ready fields. When titles are ambiguous, the tool uses description context and rule-based signals to generate a suggested draft classification.
          </div>
          <div style={{ padding: "13px 18px", borderRadius: 9, background: C.accentLight, border: `1px solid ${C.accentBorder}`, fontSize: 14, color: "#1e40af", fontStyle: "italic", lineHeight: 1.6 }}>
            "Turn unstructured logistics job text into usable structured data."
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 14 }}>✓ What this tool does</div>
            {[
              "Cleans messy job titles and removes noise",
              "Normalizes inconsistent skill labels",
              "Generates suggested functional area classification",
              "Infers suggested seniority level from title text",
              "Detects suggested work nature (Management / Specialist / Operational)",
              "Flags ambiguous, low-confidence, or out-of-scope cases",
              "Uses description context when title alone is ambiguous",
              "Uses AI assistance for unmatched or ambiguous titles",
              "AI Assistant — ask questions about your results in plain English",
              "Data Analysis Charts — domain, seniority, skills, and salary breakdowns",
              "PDF Report — 2-page export with summary stats and charts",
              "PNG Export — download charts as an image",
              "Shows salary benchmark reference for NZ and AU roles",
              "Produces export-ready structured output (CSV, Excel, JSON)",
            ].map(item => (
              <div key={item} style={{ display: "flex", gap: 9, marginBottom: 9, fontSize: 13, color: C.textSub, alignItems: "flex-start" }}>
                <span style={{ color: C.green, flexShrink: 0 }}>✓</span>
                <span style={{ lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 14 }}>✗ What this tool is NOT</div>
            {[
              "Not a market intelligence or hiring trends platform",
              "Not a job board or candidate sourcing tool",
              "Charts are based on your uploaded data only — not market-wide data",
              "Salary figures are market references only — not authoritative benchmarks",
              "Not a universal authoritative logistics taxonomy",
              "Not a replacement for human review on ambiguous cases",
            ].map(item => (
              <div key={item} style={{ display: "flex", gap: 9, marginBottom: 9, fontSize: 13, color: C.textSub, alignItems: "flex-start" }}>
                <span style={{ color: C.red, flexShrink: 0 }}>✗</span>
                <span style={{ lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </Card>
        </div>

        <Card style={{ background: C.bg }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Data Sources</div>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.85 }}>
            Classification rules are derived from NZ and AU logistics job market data. Salary benchmarks are market estimates based on job market analysis — they are <strong>reference ranges only</strong> and do not represent any official salary survey, government data, or authoritative benchmarking source. Actual salaries vary by employer, location, experience, and market conditions. The classification taxonomy references publicly available frameworks including ASCM SCOR, ILO ISCO-08, and O*NET Job Zones.
          </div>
        </Card>

        <Card style={{ background: C.bg }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>How Classification Works</div>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.85 }}>
            Classification follows a four-stage pipeline. <strong>Stage 1</strong> matches title keywords against a logistics domain taxonomy — producing up to 92% confidence when matched. <strong>Stage 2</strong> applies fuzzy repair rules for ambiguous or abbreviated titles — producing 74% (or 30% if outside logistics scope). <strong>Stage 3</strong> uses description text when the title alone is insufficient — producing 58–72% confidence. <strong>Stage 4</strong> uses AI assistance for titles that pass all three rule stages without a match — capped at 70% confidence. All outputs are <strong>suggested draft classifications</strong> intended for normalization and review support, not final authoritative labels.
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Output Fields</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
            {[
              { f: "clean_title",      d: "Standardized title with abbreviations expanded and noise removed" },
              { f: "domain",           d: "Suggested logistics category (e.g. Freight Forwarding, Warehouse)" },
              { f: "work_nature",      d: "Suggested nature: Management, Specialist / Support, or Operational" },
              { f: "seniority",        d: "Suggested level: Entry Level · Mid Level · Senior · Manager · Executive" },
              { f: "skills",           d: "Normalized skill tags mapped from title and description text" },
              { f: "confidence",       d: "0–100 score indicating how certain the rule engine is" },
              { f: "flags",            d: "Flags for ambiguous, short, noisy, or out-of-scope inputs" },
              { f: "salary_benchmark", d: "Market salary reference range for NZ or AU roles (±12% around median)" },
            ].map(({ f, d }) => (
              <div key={f} style={{ padding: "12px 14px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: C.accent, fontWeight: 700, marginBottom: 5 }}>{f}</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Status guide */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 14 }}>Understanding Status labels</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { icon: "✓", tone: C.green,  bg: C.greenLight,  border: C.greenBorder,  label: "Good match",           desc: "The classification is likely usable as-is." },
              { icon: "⚑", tone: C.amber,  bg: C.amberLight,  border: C.amberBorder,  label: "Review recommended",   desc: "The result is reasonable, but the title or description is ambiguous — check before using in reports." },
              { icon: "⚠", tone: C.amber,  bg: C.amberLight,  border: C.amberBorder,  label: "Low confidence",       desc: "The title is too generic or unclear to classify reliably. Add a description or more context." },
              { icon: "✗", tone: C.red,    bg: C.redLight,    border: C.redBorder,    label: "Out of scope",         desc: "The input does not appear to be a logistics-related role and has been excluded from analysis." },
            ].map(({ icon, tone, bg, border, label, desc }) => (
              <div key={label} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
                <span style={{ color: tone, fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: tone }}>{label}</div>
                  <div style={{ fontSize: 12, color: C.textSub, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Feedback */}
        <Card style={{ padding: 18 }}>
          <FeedbackForm page="about" testInput="Feedback from About page" metadata={{}} />
        </Card>

      </div>
    </div>
  );
}

// ── Page 7: AI Assistant ─────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "Why would a title be classified as Other/Noise?",
  "What's the difference between Operations and Warehouse?",
  "How do I improve low-confidence results?",
  "What does the confidence score mean?",
];


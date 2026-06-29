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

export function LandingPage({ onEnter }) {
  const isMobile = useIsMobile();
  const features = [
    { icon: "✏️", title: "Fix Messy Titles",       desc: "Removes noise, expands abbreviations, strips location and shift suffixes automatically." },
    { icon: "🏷️", title: "See Role Categories",     desc: "Understand what type of logistics role each title is—warehouse, transport, planning, operations, or others." },
    { icon: "🧩", title: "Map Skills",   desc: "Turn raw skill phrases like 'WMS software' or 'advanced excel' into standard skill categories." },
    { icon: "📂", title: "Clean Hundreds or Thousands",    desc: "Upload CSV or XLSX files. Process 100 titles on Guest, 1,000 on Basic, or 10,000 on Pro—instantly." },
    { icon: "📈", title: "Turn Data Into Charts",      desc: "See domain breakdown, seniority distribution, top skills, and salary ranges. Export as PNG, PDF, or CSV." },
    { icon: "✨", title: "Ask Questions About Your Data",       desc: "Ask in plain English about hiring trends, skill gaps, salary comparisons. Pro plan feature." },
  ];

  const audiences = ["Recruiters — clean titles before reporting", "HR teams — standardize job title data", "Analysts — turn raw listings into categories", "Researchers — prepare clean datasets"];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Nav */}
      <div style={{ padding: "18px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, border: "1px solid rgba(255,255,255,0.2)" }}>📦</div>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>Logititles</span>
        </div>
        <button onClick={() => onEnter()} style={{ padding: "9px 22px", borderRadius: 8, background: "#fff", color: "#4f46e5", border: "none", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}>
          Enter App →
        </button>
      </div>

      {/* Hero */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 24px 56px", textAlign: "center" }}>
        <div style={{ display: "inline-block", padding: "4px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "#c7d2fe", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 28 }}>
          Clean Data, Better Decisions · Logistics
        </div>
        <h1 style={{ color: "#fff", fontSize: 46, fontWeight: 800, maxWidth: 680, lineHeight: 1.18, margin: "0 0 22px", letterSpacing: "-0.02em" }}>
          Turn messy logistics job titles into clean, report-ready data.
        </h1>
        <p style={{ color: "#c7d2fe", fontSize: 17, maxWidth: 580, lineHeight: 1.75, margin: "0 0 38px" }}>
          Upload a spreadsheet or paste a title. Logititles cleans inconsistent role names, groups them into useful logistics categories, flags uncertain results, and prepares your data for charts, reports, and export.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => onEnter("analyzer")} style={{ padding: "13px 32px", borderRadius: 9, background: "#fff", color: "#4f46e5", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em" }}>
            Try a Title Free →
          </button>
          <button onClick={() => onEnter("bulk")} style={{ padding: "13px 28px", borderRadius: 9, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            Upload Sample CSV
          </button>
        </div>
      </div>

      {/* Feature grid */}
      <div style={{ padding: isMobile ? "0 20px 40px" : "0 48px 56px", maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14 }}>
          {features.map(({ icon, title, desc }) => (
            <div key={title} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
              <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 14, marginBottom: 7 }}>{title}</div>
              <div style={{ color: "#c7d2fe", fontSize: 13, lineHeight: 1.65 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Who it's for */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.1)", padding: "28px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: "#a5b4fc", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 8 }}>Built for:</span>
        {audiences.map((a, i) => (
          <span key={i} style={{ color: "#e0e7ff", fontSize: 13, padding: "4px 14px", background: "rgba(255,255,255,0.08)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)" }}>{a}</span>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 48px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>© 2026 Logititles · logititles@gmail.com</span>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <a href="https://www.logititles.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textDecoration: "underline" }}>logititles.com</a>
            <button onClick={() => { onEnter("privacy"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>Privacy Policy</button>
            <button onClick={() => { onEnter("terms"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>Terms of Service</button>
          </div>
        </div>
        <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, lineHeight: 1.6, textAlign: "center" }}>
          Logititles is currently in beta. Plan limits, pricing, and features may change as the product develops.
          Please use sample, public, or anonymised data — avoid uploading confidential, personal, or sensitive company data.
          Logititles is an independent personal project and is not affiliated with SEEK, Indeed, LINZ, or any external job platform.
        </p>
      </div>
    </div>
  );
}

// ── Page 1: Single Analyzer ─────────────────────────────────────────────────

const SA_EXAMPLES = [
  "Sr. Freight Coordinator – FCL/LCL (NZ)",
  "Ops Mgr 3PL Warehouse [Contract]",
  "Customs Clearance / Import Export Officer",
  "Retail Health Consultant",
  "Demand Planner - APAC",
  "BD Executive Last Mile AU",
];

const ANALYZER_GUEST_LIMIT = 10;
const ANALYZER_LS_KEY = "analyzer_usage";


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

export function ExportPage({ bulkResults }) {
  const [format, setFormat]   = useState("csv");
  const [fields, setFields]   = useState(["raw_title","clean_title","domain","work_nature","seniority","confidence","status","out_of_scope","needs_review"]);
  const allFields = EXPORT_FIELDS;
  const toggle = f => setFields(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);

  const hasRealData = bulkResults && bulkResults.length > 0;
  const data = hasRealData ? bulkResults : DEMO_RESULTS;
  const label = hasRealData ? `${data.length} rows from Bulk Upload` : `${data.length} demo rows (upload a file in Bulk Upload to use your own data)`;

  function doDownload() {
    trackEvent("export_download", {
      format,
      fields_count: fields.length,
      rows_count: data.length,
      is_real_data: hasRealData,
    });
    const filename = `logistics_export_${Date.now()}`;
    const rows = data.map(r => {
      const full = buildExportRow(r);
      const out = {};
      fields.forEach(f => { out[f] = full[f] ?? ""; });
      return out;
    });
    if (format === "csv") {
      const header = fields.join(",");
      const lines = rows.map(r =>
        fields.map(f => {
          const v = String(r[f] ?? "");
          return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(",")
      );
      triggerDownload(new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" }), `${filename}.csv`);
    }
    if (format === "json") {
      triggerDownload(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), `${filename}.json`);
    }
    if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows, { header: fields });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Structured Output");
      XLSX.writeFile(wb, `${filename}.xlsx`);
    }
  }

  return (
    <div>
      <SectionTitle children="Export" sub="Choose your format and fields. Download a clean, structured file." />
      <div style={{ marginBottom: 16, padding: "10px 16px", background: hasRealData ? C.greenLight : C.bg, border: `1px solid ${hasRealData ? C.greenBorder : C.border}`, borderRadius: 9, fontSize: 13, color: hasRealData ? "#166534" : C.textMuted }}>
        {hasRealData ? "✓ " : "ℹ "}{label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Output Format</div>
          {[
            ["csv",  "CSV",          "Best for Excel, databases, and spreadsheets"],
            ["xlsx", "Excel (.xlsx)","Formatted spreadsheet with column headers"],
            ["json", "JSON",         "For developers and downstream integrations"],
          ].map(([val, lbl, desc]) => (
            <div key={val} onClick={() => setFormat(val)}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 15px", borderRadius: 9, marginBottom: 9, border: `2px solid ${format === val ? C.accent : C.border}`, background: format === val ? C.accentLight : C.card, cursor: "pointer" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${format === val ? C.accent : C.border}`, background: format === val ? C.accent : C.card, flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {format === val && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{lbl}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Fields to Include</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
            Default: 9 core fields for clean, compact export. Add skills/flags/salary as needed.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
            {allFields.map(f => (
              <label key={f} style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
                <input type="checkbox" checked={fields.includes(f)} onChange={() => toggle(f)} style={{ width: 15, height: 15, accentColor: C.accent }} />
                <span style={{ fontSize: 13, fontFamily: "monospace", color: C.text }}>{f}</span>
              </label>
            ))}
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 14, fontSize: 12, color: C.textMuted }}>
            {fields.length} field{fields.length !== 1 ? "s" : ""} selected · {data.length} rows
          </div>
          <button onClick={doDownload} disabled={!fields.length}
            style={{ width: "100%", padding: "12px", borderRadius: 8, background: fields.length ? C.accent : "#d1d5db", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: fields.length ? "pointer" : "default", fontFamily: "inherit" }}>
            Download {format.toUpperCase()}
          </button>
        </Card>
      </div>
    </div>
  );
}

// ── Page 6: About ────────────────────────────────────────────────────────────


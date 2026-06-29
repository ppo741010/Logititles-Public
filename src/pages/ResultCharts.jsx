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

export function ResultCharts({ results, fileName = "" }) {
  const chartRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  async function downloadPNG() {
    if (!chartRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = "logititles_analysis.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("PNG export failed:", e);
    } finally {
      setExporting(false);
    }
  }

  async function downloadPDF() {
    if (!chartRef.current) return;
    setExporting(true);
    try {

    const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const pageW = 841.89, pageH = 595.28; // A4 landscape in pts
    const margin = 32;
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    // ── Page 1: Summary ──────────────────────────────────────────────
    const today = new Date().toLocaleDateString("en-NZ", { year: "numeric", month: "long", day: "numeric" });
    const total = results.length;
    const structured = results.filter(r => !r.needsReview && !isOutOfScope(r)).length;
    const review = results.filter(r => r.needsReview && !isOutOfScope(r)).length;
    const outOfScope = results.filter(r => isOutOfScope(r)).length;

    const domainCounts = {};
    const skillCounts = {};
    const domainSalary = {};
    results.forEach(r => {
      if (!isOutOfScope(r)) {
        if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
        (r.skills || []).forEach(s => { skillCounts[s] = (skillCounts[s] || 0) + 1; });
      }
      if (r.salaryBenchmark?.median && r.domain && r.salaryBenchmark?.currency && !isOutOfScope(r)) {
        const key = `${r.domain}|||${r.salaryBenchmark.currency}`;
        if (!domainSalary[key]) domainSalary[key] = { domain: r.domain, currency: r.salaryBenchmark.currency, medians: [] };
        domainSalary[key].medians.push(r.salaryBenchmark.median);
      }
    });
    const topDomains = Object.entries(domainCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([d,c]) => `${d} (${c})`);
    const topSkills = Object.entries(skillCounts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([s]) => s);
    const topSalaryDomain = Object.values(domainSalary)
      .filter(({ medians }) => medians.length >= MIN_SALARY_SAMPLE_SIZE)
      .map(({ domain, currency, medians }) => ({ domain, currency, median: Math.round(medians.reduce((a,b) => a+b,0)/medians.length) }))
      .sort((a,b) => b.median - a.median)[0] ?? null;

    // Header bar
    pdf.setFillColor(59, 110, 245);
    pdf.rect(0, 0, pageW, 52, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.text("Logititles — Classification Report", margin, 34);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(today, pageW - margin, 34, { align: "right" });

    // Summary section title
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.text("Summary", margin, 80);

    // Stats row
    const stats = [
      { label: "Total Records", value: String(total), color: [59, 110, 245] },
      { label: "Structured", value: String(structured), color: [22, 163, 74] },
      { label: "Review Required", value: String(review), color: [217, 119, 6] },
      { label: "Out of Scope", value: String(outOfScope), color: [220, 38, 38] },
    ];
    const boxW = (pageW - margin * 2 - 24) / 4;
    stats.forEach(({ label, value, color }, i) => {
      const x = margin + i * (boxW + 8);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(x, 92, boxW, 52, 4, 4, "F");
      pdf.setTextColor(...color);
      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text(value, x + 12, 120);
      pdf.setTextColor(107, 114, 128);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(label, x + 12, 134);
    });

    // Insights
    let y = 168;
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(17, 24, 39);
    pdf.text("Key Insights", margin, y); y += 18;

    const insights = [
      `Top logistics domains: ${topDomains.length > 0 ? topDomains.join(", ") : "N/A"}`,
      `Most common skills: ${topSkills.length > 0 ? topSkills.join(", ") : "N/A"}`,
      topSalaryDomain ? `Highest est. median salary: ${topSalaryDomain.domain} (${topSalaryDomain.currency}) — ${topSalaryDomain.currency} $${topSalaryDomain.median.toLocaleString()} (indicative)` : null,
      `Classification rate: ${total > 0 ? Math.round((structured / total) * 100) : 0}% structured successfully`,
      outOfScope > 0 ? `Out-of-scope rows excluded: ${outOfScope}` : null,
    ].filter(Boolean);

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(55, 65, 81);
    insights.forEach(line => {
      pdf.text(`• ${line}`, margin + 8, y);
      y += 16;
    });

    // Metadata block
    y += 8;
    pdf.setFontSize(9);
    pdf.setTextColor(107, 114, 128);
    const apiRows   = results.filter(r => r.source !== "local").length;
    const localRows = results.filter(r => r.source === "local").length;
    const sourceLabel = localRows === 0
      ? "AI classifier"
      : apiRows === 0
      ? "Local classifier (API unavailable)"
      : `${apiRows} rows via AI · ${localRows} rows via local classifier`;
    const metaLines = [
      fileName ? `File: ${fileName}` : null,
      `Rows processed: ${total}`,
      `Classification source: ${sourceLabel}`,
      `Generated: ${today}`,
    ].filter(Boolean);
    metaLines.forEach(line => {
      pdf.text(line, margin + 8, y);
      y += 14;
    });

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    pdf.text(
      `Generated by Logititles · logititles.com · Results are indicative and based on uploaded job title data. Salary benchmarks are shown only for domain-country groups with at least ${MIN_SALARY_SAMPLE_SIZE} records and should not be treated as official market salary data.`,
      margin, pageH - 16
    );

    // ── Page 2: Charts ───────────────────────────────────────────────
    pdf.addPage();
    pdf.setFillColor(59, 110, 245);
    pdf.rect(0, 0, pageW, 52, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.text("Logititles — Data Analysis Charts", margin, 34);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(today, pageW - margin, 34, { align: "right" });

    const chartY = 60;
    const chartH = pageH - chartY - 24;
    const chartW = pageW - margin * 2;
    const ratio = canvas.width / canvas.height;
    const finalH = Math.min(chartH, chartW / ratio);
    const finalW = finalH * ratio;
    pdf.addImage(imgData, "PNG", margin, chartY, finalW, finalH);
    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    pdf.text("Generated by Logititles · logititles.com · Salary benchmarks are indicative estimates and should not be treated as official salary survey results.", margin, pageH - 16);

    pdf.save("logititles_report.pdf");
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  }

  const domainCounts = {};
  const seniorityCounts = {};
  const skillCounts = {};
  const domainSalary = {};

  const noiseCount = results.filter(r => isOutOfScope(r)).length;

  function normalizeSkill(s) {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
  }

  results.forEach(r => {
    if (isOutOfScope(r)) return; // exclude out-of-scope from all charts
    if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
    if (r.seniority) seniorityCounts[r.seniority] = (seniorityCounts[r.seniority] || 0) + 1;
    const seen = new Set();
    (r.skills || []).forEach(s => {
      const norm = normalizeSkill(s);
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      skillCounts[norm] = (skillCounts[norm] || 0) + 1;
    });
    if (r.salaryBenchmark?.median && r.domain && r.salaryBenchmark?.currency) {
      const key = `${r.domain}|||${r.salaryBenchmark.currency}`;
      if (!domainSalary[key]) domainSalary[key] = { domain: r.domain, currency: r.salaryBenchmark.currency, medians: [] };
      domainSalary[key].medians.push(r.salaryBenchmark.median);
    }
  });

  const domainData = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const seniorityOrder = ["Executive","Manager","Senior","Mid Level","Entry Level","Unknown"];
  const seniorityData = seniorityOrder
    .filter(s => seniorityCounts[s])
    .map(s => ({ name: s, value: seniorityCounts[s] }));

  const topSkillsData = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({
      name: name
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\b(Tms|Wms|Erp|Sap|Edi|Crm|Kpi|Sop|S&op|It|Hr|Po|3pl|Abc|Rf|Api|Sql|Csv|Id)\b/g, s => s.toUpperCase()),
      value,
    }));

  const salaryData = Object.values(domainSalary)
    .filter(({ medians }) => medians.length >= MIN_SALARY_SAMPLE_SIZE)
    .map(({ domain, currency, medians }) => ({
      name: `${domain} (${currency})`,
      label: `${domain} · ${currency} · n=${medians.length}`,
      median: Math.round(medians.reduce((a, b) => a + b, 0) / medians.length),
      count: medians.length,
      currency,
    }))
    .sort((a, b) => b.median - a.median);

  const noiseRatio = results.length > 0 ? noiseCount / results.length : 0;

  return (
    <Card style={{ padding: "20px 24px" }}>
      {noiseCount > 0 && (
        <div style={{ marginBottom: 16, padding: "10px 16px", background: "#f1f5f9", borderRadius: 8, border: `1px solid #cbd5e1`, fontSize: 12, color: "#475569" }}>
          ℹ <strong>{noiseCount} out-of-scope row{noiseCount !== 1 ? "s" : ""} excluded from logistics analysis.</strong>
          {noiseRatio > 0.3 && <span> ({Math.round(noiseRatio * 100)}% of dataset — consider reviewing your data or adding a description column.)</span>}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Data Analysis</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={downloadPNG} disabled={exporting}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 12, fontWeight: 600, color: C.textSub, cursor: exporting ? "default" : "pointer", fontFamily: "inherit" }}>
            {exporting ? "Exporting…" : "⬇ PNG"}
          </button>
          <button onClick={downloadPDF} disabled={exporting}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 12, fontWeight: 600, color: C.textSub, cursor: exporting ? "default" : "pointer", fontFamily: "inherit" }}>
            {exporting ? "Exporting…" : "⬇ PDF"}
          </button>
        </div>
      </div>
      <div ref={chartRef}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>

        {/* Domain bar chart */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Domain Distribution</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={domainData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: C.textMuted }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text }} axisLine={false} tickLine={false} width={130} />
              <Tooltip formatter={(v) => [v, "Count"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {domainData.map((_, i) => <Cell key={i} fill={DOMAIN_PALETTE[i % DOMAIN_PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Seniority pie chart */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Seniority Breakdown</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={seniorityData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
                {seniorityData.map((_, i) => <Cell key={i} fill={DOMAIN_PALETTE[i % DOMAIN_PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: C.text }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Skills */}
        {topSkillsData.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Top Skills in Dataset</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topSkillsData} layout="vertical" margin={{ left: 10, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: C.textMuted }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text }} axisLine={false} tickLine={false} width={200} />
                <Tooltip formatter={(v) => [v, "Count"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={C.accent} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Salary by Domain and Country */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Estimated Salary Benchmark by Domain and Country</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>Indicative estimates only · shown for groups with at least {MIN_SALARY_SAMPLE_SIZE} records per domain and country</div>
          {salaryData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(180, salaryData.length * 44)}>
                <BarChart data={salaryData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.textMuted }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: C.text }} axisLine={false} tickLine={false} width={190} />
                  <Tooltip formatter={(v, _, props) => [`${props.payload?.currency} $${v.toLocaleString()}`, `Est. Median · n=${props.payload?.count}`]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
                  <Bar dataKey="median" radius={[0, 4, 4, 0]} fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, lineHeight: 1.5 }}>
                Salary benchmarks are indicative estimates based on available job data. They should not be treated as official salary survey results.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: C.textMuted, padding: "16px 0", lineHeight: 1.6 }}>
              Not enough salary records to show reliable benchmarks. Salary benchmarks require at least {MIN_SALARY_SAMPLE_SIZE} records per domain and country.
            </div>
          )}
        </div>

      </div>
      </div>
    </Card>
  );
}


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

const MIN_SALARY_SAMPLE_SIZE = 20;

export function MarketInsights() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [country, setCountry] = useState("all");

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null);
      try {
        // Paginate to bypass Supabase default 1000-row limit
        let allRows = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          let q = supabase
            .from("cleaned_jobs")
            .select("domain, level, work_nature, skills, salary_yearly, country")
            .not("domain", "eq", "Other/Noise")
            .not("domain", "eq", "Pending Review")
            .not("domain", "is", null)
            .range(from, from + pageSize - 1);
          if (country !== "all") q = q.eq("country", country);
          const { data: rows, error: err } = await q;
          if (err) throw err;
          if (!rows || rows.length === 0) break;
          allRows = allRows.concat(rows);
          if (rows.length < pageSize) break;
          from += pageSize;
        }
        setData(allRows);
      } catch (e) {
        setError(`Could not load market data: ${e?.message || "Please check Supabase cleaned_jobs has anon read policy enabled."}`);
      }
      setLoading(false);
    }
    load();
  }, [country]);

  // Strip numeric prefix like "2. Intermediate / Staff" → "Intermediate / Staff"
  function cleanLabel(s) { return s ? s.replace(/^\d+\.\s*/, "") : s; }

  function countBy(rows, key) {
    const counts = {};
    rows.forEach(r => {
      if (!r[key]) return;
      const label = cleanLabel(r[key]);
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }

  function topSkills(rows, n = 10) {
    const counts = {};
    rows.forEach(r => {
      const raw = r.skills ?? "";
      const skills = typeof raw === "string"
        ? raw.split(",").map(s => s.trim()).filter(s => s.length > 1)
        : [];
      skills.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name, value }));
  }

  function salaryByDomain(rows) {
    const buckets = {};
    rows.forEach(r => {
      if (!r.domain || !r.salary_yearly) return;
      if (r.salary_yearly < 20000 || r.salary_yearly > 400000) return; // filter parsing errors
      if (!buckets[r.domain]) buckets[r.domain] = [];
      buckets[r.domain].push(r.salary_yearly);
    });
    return Object.entries(buckets)
      .map(([domain, vals]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        const median = Math.round(sorted[Math.floor(sorted.length / 2)] / 1000) * 1000;
        const avg    = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length / 1000) * 1000;
        return { name: domain, median, avg, count: vals.length };
      })
      .filter(d => d.count >= MIN_SALARY_SAMPLE_SIZE)
      .sort((a, b) => b.median - a.median);
  }

  const CHART_COLORS = ["#4f46e5","#7c3aed","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#84cc16","#f97316"];

  // Merge slices < 3% into "Other" to avoid tiny unreadable pie slices
  function mergeTinySlices(arr, threshold = 0.03) {
    const totalVal = arr.reduce((s, d) => s + d.value, 0);
    const main = arr.filter(d => d.value / totalVal >= threshold);
    const tiny = arr.filter(d => d.value / totalVal < threshold);
    if (tiny.length === 0) return arr;
    const otherVal = tiny.reduce((s, d) => s + d.value, 0);
    return [...main, { name: "Other", value: otherVal }];
  }

  function salaryByLevel(rows) {
    const LEVEL_ORDER = ["Executive", "Manager", "Senior", "Mid Level", "Intermediate / Staff", "Entry Level"];
    const buckets = {};
    rows.forEach(r => {
      if (!r.salary_yearly) return;
      if (r.salary_yearly < 20000 || r.salary_yearly > 400000) return;
      const label = cleanLabel(r.level);
      if (!label) return;
      if (!buckets[label]) buckets[label] = [];
      buckets[label].push(r.salary_yearly);
    });
    return LEVEL_ORDER
      .filter(l => buckets[l] && buckets[l].length >= MIN_SALARY_SAMPLE_SIZE)
      .map(l => ({
        name: l,
        avg:    Math.round(buckets[l].reduce((a, b) => a + b, 0) / buckets[l].length / 1000) * 1000,
        median: Math.round([...buckets[l]].sort((a,b)=>a-b)[Math.floor(buckets[l].length/2)] / 1000) * 1000,
        min:    Math.round(Math.min(...buckets[l]) / 1000) * 1000,
        max:    Math.round(Math.max(...buckets[l]) / 1000) * 1000,
        count:  buckets[l].length,
      }));
  }

  const total = data?.length ?? 0;
  const domainData    = data ? countBy(data, "domain")                    : [];
  const levelData     = data ? mergeTinySlices(countBy(data, "level"))    : [];
  const natureData    = data ? countBy(data, "work_nature")               : [];
  const skillData     = data ? topSkills(data, 8)                         : [];
  const salaryData    = data ? salaryByDomain(data)                       : [];
  const salaryLvlData = data ? salaryByLevel(data)                        : [];

  return (
    <div>
      <SectionTitle children="Market Insights" sub="Aggregated trends from the NZ/AU logistics job market dataset." />

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>COUNTRY</span>
        {[
          { key: "all", label: "All" },
          { key: "NZ",  label: "New Zealand" },
          { key: "AU",  label: "Australia" },
        ].map(c => (
          <button key={c.key} onClick={() => setCountry(c.key)}
            style={{ padding: "5px 14px", borderRadius: 20, border: `1px solid ${country === c.key ? C.accent : C.border}`,
              background: country === c.key ? C.accent : C.card, color: country === c.key ? "#fff" : C.text,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {c.label}
          </button>
        ))}
        {!loading && data && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.textMuted }}>
            {total.toLocaleString()} records
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 16, color: C.textMuted }}>
          <Spinner size={36} />
          <div style={{ fontSize: 14 }}>Loading market data…</div>
        </div>
      )}
      {error && (
        <div style={{ padding: "14px 18px", borderRadius: 10, background: "#fef2f2", color: "#b91c1c", fontSize: 13, border: "1px solid #fca5a5" }}>
          {error}
        </div>
      )}

      {data && !loading && data.length === 0 && (
        <div style={{ padding: "14px 18px", borderRadius: 10, background: "#fffbeb", color: "#92400e", fontSize: 13, border: "1px solid #fde68a", marginBottom: 16 }}>
          No data found for this filter. If you selected NZ or AU, check that the <code>country</code> field in cleaned_jobs uses "NZ" / "AU" values.
        </div>
      )}
      {data && !loading && data.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Data source disclaimer */}
          <div style={{ gridColumn: "1 / -1", padding: "10px 16px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
            <strong style={{ color: C.textSub }}>About this data:</strong>{" "}
            Sourced from NZ/AU logistics job postings. Domain, seniority, and skills are inferred from job titles — not extracted from job descriptions.
            Salary data is available for {data.filter(r => r.salary_yearly).length.toLocaleString()} of {total.toLocaleString()} records ({total ? Math.round(data.filter(r => r.salary_yearly).length / total * 100) : 0}%) and reflects advertised rates only.
            All figures are indicative reference ranges, not authoritative benchmarks.
          </div>

          {/* Domain breakdown */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Domain Breakdown</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={domainData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <Tooltip formatter={v => [v, "Jobs"]} />
                <Bar dataKey="value" radius={[0,4,4,0]}>
                  {domainData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12, fontSize: 11, color: C.textMuted, lineHeight: 1.6, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <strong>Note:</strong> Supporting business functions (Sales, Finance, Business Administration) are included where they appear in logistics-related job datasets, as they often support core logistics operations.
            </div>
          </Card>

          {/* Top Skills */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Top 8 Skills</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>Common skills associated with these roles — inferred from job titles, not job descriptions.</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={skillData} layout="vertical" margin={{ left: 10, right: 40 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={180} />
                <Tooltip formatter={v => [v, "Mentions"]} />
                <Bar dataKey="value" fill={C.accent} radius={[0,4,4,0]}>
                  <LabelList dataKey="value" position="right" style={{ fontSize: 10, fill: "#6b7280" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Seniority */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Seniority Level</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={levelData} dataKey="value" nameKey="name" cx="50%" cy="42%" outerRadius={70}>
                  {levelData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, name) => {
                  const total = levelData.reduce((s, d) => s + d.value, 0);
                  const pct = total ? ((v / total) * 100).toFixed(1) : 0;
                  return [`${pct}% (${v.toLocaleString()} jobs)`, name];
                }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} formatter={name => {
                  const total = levelData.reduce((s, d) => s + d.value, 0);
                  const item = levelData.find(d => d.name === name);
                  const pct = item && total ? ((item.value / total) * 100).toFixed(0) : 0;
                  return `${name} ${pct}%`;
                }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          {/* Work Nature */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Work Nature</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={natureData} dataKey="value" nameKey="name" cx="50%" cy="42%" outerRadius={70}>
                  {natureData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, name) => {
                  const total = natureData.reduce((s, d) => s + d.value, 0);
                  const pct = total ? ((v / total) * 100).toFixed(1) : 0;
                  return [`${pct}% (${v.toLocaleString()} jobs)`, name];
                }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} formatter={name => {
                  const total = natureData.reduce((s, d) => s + d.value, 0);
                  const item = natureData.find(d => d.name === name);
                  const pct = item && total ? ((item.value / total) * 100).toFixed(0) : 0;
                  return `${name} ${pct}%`;
                }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          {/* Salary charts — only shown when a single country is selected */}
          {country === "all" && (
            <div style={{ gridColumn: "1 / -1", padding: "16px 20px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 13, color: "#92400e" }}>
              Salary data is shown per country only. Select <strong>New Zealand</strong> or <strong>Australia</strong> for a meaningful salary comparison.
            </div>
          )}

          {/* Median Salary by Domain */}
          {country !== "all" && salaryData.length > 0 && (
            <Card style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                Median Salary by Domain ({country === "AU" ? "AUD" : "NZD"}/yr)
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
                Median advertised salary — roles with salary data only (n ≥ {MIN_SALARY_SAMPLE_SIZE} per domain). Market estimates, not authoritative benchmarks.
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={salaryData} margin={{ left: 10, right: 20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                        <div style={{ fontWeight: 700 }}>{d.name}</div>
                        <div>Median: <strong>${d.median.toLocaleString()}</strong></div>
                        <div style={{ color: "#6b7280" }}>Avg: ${d.avg.toLocaleString()}</div>
                        <div style={{ color: "#6b7280" }}>n = {d.count} records with salary</div>
                      </div>
                    );
                  }} />
                  <Bar dataKey="median" radius={[4,4,0,0]} isAnimationActive={false} activeBar={false}>
                    {salaryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Median Salary by Seniority Level */}
          {country !== "all" && salaryLvlData.length > 0 && (
            <Card style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                Median Salary by Seniority ({country === "AU" ? "AUD" : "NZD"}/yr)
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
                Median advertised salary by level (n ≥ {MIN_SALARY_SAMPLE_SIZE}). Mixed domains — IT roles may skew Senior upward.
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={salaryLvlData} margin={{ left: 10, right: 20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                        <div style={{ fontWeight: 700 }}>{d.name}</div>
                        <div>Median: <strong>${d.median.toLocaleString()}</strong></div>
                        <div style={{ color: "#6b7280" }}>Avg: ${d.avg.toLocaleString()}</div>
                        <div style={{ color: "#6b7280" }}>Range: ${d.min.toLocaleString()} – ${d.max.toLocaleString()}</div>
                        <div style={{ color: "#6b7280" }}>n = {d.count} records with salary</div>
                      </div>
                    );
                  }} />
                  <Bar dataKey="median" radius={[4,4,0,0]} isAnimationActive={false} activeBar={false}>
                    {salaryLvlData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.textMuted, textAlign: "center", paddingBottom: 8 }}>
            Data sourced from NZ/AU logistics job postings. Updated periodically. For reference only.
          </div>
        </div>
      )}
    </div>
  );
}


// ── App shell ─────────────────────────────────────────────────────────────────


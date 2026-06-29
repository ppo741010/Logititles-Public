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

const NAV = [
  { id: "analyzer", label: "Single Analyzer", icon: "🔍", component: SingleAnalyzer },
  { id: "bulk",     label: "Bulk Upload",     icon: "📂", component: BulkUpload },
  { id: "skills",   label: "Skill Mapper",    icon: "🧩", component: SkillMapper },
  { id: "titles",   label: "Title Cleaner",   icon: "✏️", component: TitleCleaner },
  { id: "export",   label: "Export",          icon: "⬇️", component: ExportPage },
  { id: "insights", label: "Market Insights", icon: "📊", component: MarketInsights },
  { id: "ai",       label: "AI Assistant",    icon: "✨", component: AIAssistant },
  { id: "about",    label: "About",           icon: "ℹ️", component: About },
];

export default function App() {
  const isMobile = useIsMobile();
  const [showLanding, setShowLanding]     = useState(true);
  const [page, setPage]                   = useState("analyzer");
  const [bulkResults, setBulkResults]     = useState([]);
  const [aiContext, setAiContext]          = useState("");
  const [analyzerState, setAnalyzerState] = useState({ title: "", desc: "", country: "", result: null });
  const [user, setUser]                   = useState(null);
  const [userPlan, setUserPlan]           = useState(null); // null = guest
  const [showAuth, setShowAuth]           = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Plan limits
  const LIMITS = {
    guest: { bulk: 100,  ai: 0,   analyzer: 10 },
    basic: { bulk: 1000, ai: 0,   analyzer: Infinity },
    pro:   { bulk: 10000, ai: 100, analyzer: Infinity },
  };

  async function fetchPlan(uid) {
    const { data } = await supabase.from("user_plans").select("*").eq("user_id", uid).single();
    if (!data) {
      // First login — create basic plan with email
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: created } = await supabase.from("user_plans")
        .insert({ user_id: uid, plan: "basic", email: authUser?.email }).select().single();
      setUserPlan(created);
    } else {
      // Auto-reset if period expired (skip if no end date set)
      if (data.current_period_end && new Date(data.current_period_end) < new Date()) {
        const { data: reset } = await supabase.from("user_plans")
          .update({ bulk_used: 0, ai_used: 0, current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() })
          .eq("user_id", uid).select().single();
        setUserPlan(reset);
      } else {
        setUserPlan(data);
      }
    }
  }

  const planKey = userPlan?.plan ?? (user ? "basic" : "guest");
  const limits  = LIMITS[planKey] ?? LIMITS.guest;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) fetchPlan(u.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (event === "PASSWORD_RECOVERY") {
        setShowResetPassword(true);
      } else if (u) {
        fetchPlan(u.id);
      } else {
        setUserPlan(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  function handleEnter(targetPage) {
    setShowLanding(false);
    if (targetPage) setPage(targetPage);
  }

  function handleAskAI(result) {
    const ctx = [
      `Title: ${result.raw_title || ""}`,
      `Clean Title: ${result.cleanTitle || ""}`,
      `Domain: ${result.domain || ""}`,
      `Seniority: ${result.seniority || ""}`,
      `Confidence: ${result.confidence ?? ""}%`,
      result.skills?.length ? `Skills: ${result.skills.join(", ")}` : null,
      result.flags?.length  ? `Flags: ${result.flags.join("; ")}` : null,
    ].filter(Boolean).join("\n");
    setAiContext(ctx);
    setPage("ai");
  }

  if (showLanding) return <LandingPage onEnter={handleEnter} />;

  const navItem = NAV.find(n => n.id === page);

  const MOBILE_NAV = [
    { id: "analyzer", icon: "🔍", label: "Analyze" },
    { id: "skills",   icon: "🧩", label: "Skills" },
    { id: "ai",       icon: "✨", label: "AI" },
    { id: "bulk",     icon: "📂", label: "Bulk" },
    { id: "about",    icon: "ℹ️", label: "About" },
  ];

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif", background: C.bg }}>
      {/* Top bar */}
      <div style={{ background: C.sidebar, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderBottom: "1px solid #e5e7eb" }}>
        <div onClick={() => setShowLanding(true)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📦</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e1b4b" }}>Logititles</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user ? (
            <button onClick={() => supabase.auth.signOut()}
              style={{ background: "none", border: `1px solid ${C.border}`, cursor: "pointer", fontSize: 11, color: "#ef4444", fontFamily: "inherit", padding: "4px 8px", borderRadius: 6 }}>
              Sign Out
            </button>
          ) : (
            <button onClick={() => setShowAuth(true)}
              style={{ background: C.accent, border: "none", cursor: "pointer", fontSize: 11, color: "#fff", fontFamily: "inherit", padding: "5px 10px", borderRadius: 6, fontWeight: 700 }}>
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {/* Persistent pages — kept mounted to preserve state, hidden when not active */}
        <div style={{ display: page === "analyzer" ? "block" : "none" }}>
          <SingleAnalyzer onAskAI={handleAskAI} user={user} planKey={planKey} onLogin={() => setShowAuth(true)} savedTitle={analyzerState.title} savedDesc={analyzerState.desc} savedCountry={analyzerState.country} savedResult={analyzerState.result} onSaveState={setAnalyzerState} />
        </div>
        <div style={{ display: page === "bulk" ? "block" : "none" }}>
          <BulkUpload onResultsReady={setBulkResults} user={user} limits={limits} userPlan={userPlan} onLogin={() => setShowAuth(true)} planKey={planKey} />
        </div>
        <div style={{ display: page === "ai" ? "block" : "none" }}>
          {planKey === "pro" ? <AIAssistant initialContext={aiContext} onClearContext={() => setAiContext("")} bulkResults={bulkResults} /> : <AIProWall onLogin={() => setShowAuth(true)} isLoggedIn={!!user} />}
        </div>
        {/* Other pages — conditionally rendered */}
        {page === "export"   && <ExportPage bulkResults={bulkResults} />}
        {page === "privacy"  && <PrivacyPolicy />}
        {page === "terms"    && <TermsOfService />}
        {!["analyzer","bulk","export","ai","privacy","terms"].includes(page) && navItem && <navItem.component />}
      </div>

      {/* Bottom nav */}
      <div style={{ background: C.sidebar, borderTop: "1px solid #e5e7eb", display: "flex", flexShrink: 0 }}>
        {MOBILE_NAV.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", borderTop: page === n.id ? `2px solid ${C.accent}` : "2px solid transparent" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{n.icon}</span>
            <span style={{ fontSize: 9, marginTop: 3, color: page === n.id ? C.accent : C.sidebarText, fontWeight: page === n.id ? 700 : 400 }}>{n.label}</span>
          </button>
        ))}
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />}
      {showResetPassword && <ResetPasswordModal onClose={() => { setShowResetPassword(false); }} />}
    </div>
  );

  // ── Desktop layout ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif", background: C.bg }}>

      {/* Sidebar */}
      <div style={{ width: sidebarCollapsed ? 56 : 218, background: C.sidebar, display: "flex", flexDirection: "column", flexShrink: 0, transition: "width 0.2s ease", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: sidebarCollapsed ? "18px 12px" : "22px 18px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {!sidebarCollapsed && (
            <div onClick={() => setShowLanding(true)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📦</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e1b4b", lineHeight: 1.2 }}>Logititles</div>
                <div style={{ fontSize: 10, color: "#a5b4fc", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.1em" }}>Tool · v2</div>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div onClick={() => setShowLanding(true)} style={{ width: 32, height: 32, borderRadius: 8, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer" }}>📦</div>
          )}
          <button onClick={() => setSidebarCollapsed(c => !c)}
            style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", padding: "3px 6px", fontSize: 12, color: C.sidebarText, flexShrink: 0, lineHeight: 1 }}>
            {sidebarCollapsed ? "→" : "←"}
          </button>
        </div>

        <nav style={{ flex: 1, padding: "4px 8px" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              title={sidebarCollapsed ? n.label : undefined}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: sidebarCollapsed ? "9px 0" : "9px 11px", justifyContent: sidebarCollapsed ? "center" : "flex-start", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", background: page === n.id ? C.sidebarActive : "transparent", color: page === n.id ? C.sidebarActiveText : C.sidebarText, fontSize: 13.5, fontWeight: page === n.id ? 600 : 400, marginBottom: 2, fontFamily: "inherit", transition: "background 0.12s" }}>
              <span style={{ fontSize: 15, width: 20, textAlign: "center", opacity: page === n.id ? 1 : 0.7, flexShrink: 0 }}>{n.icon}</span>
              {!sidebarCollapsed && n.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: sidebarCollapsed ? "14px 8px" : "14px 18px", borderTop: "1px solid #e5e7eb" }}>
          {!sidebarCollapsed && (
            <>
              {user ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                      background: planKey === "pro" ? "#dcfce7" : "#eff6ff",
                      color: planKey === "pro" ? "#15803d" : "#1d4ed8",
                      border: planKey === "pro" ? "1px solid #86efac" : "1px solid #bfdbfe",
                      textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {planKey === "pro" ? "Pro" : "Basic"}
                    </span>
                  </div>
                  {planKey === "guest" && (
                    <>
                      <a href="https://buy.stripe.com/cNibJ2aYX7W81r8f4u7ok01" target="_blank" rel="noopener noreferrer"
                        onClick={() => trackEvent("upgrade_click", { current_plan: "guest", target_plan: "basic", location: "sidebar" })}
                        style={{ display: "block", textAlign: "center", padding: "5px 0", borderRadius: 6, background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 11, textDecoration: "none", marginBottom: 4 }}>
                        Get Basic NZ$9 →
                      </a>
                      <a href="https://buy.stripe.com/aFacN6gjha4g7Pwf4u7ok00" target="_blank" rel="noopener noreferrer"
                        onClick={() => trackEvent("upgrade_click", { current_plan: "guest", target_plan: "pro", location: "sidebar" })}
                        style={{ display: "block", textAlign: "center", padding: "5px 0", borderRadius: 6, background: C.accent, color: "#fff", fontWeight: 700, fontSize: 11, textDecoration: "none", marginBottom: 6 }}>
                        Get Pro NZ$29 →
                      </a>
                    </>
                  )}
                  {planKey === "basic" && (
                    <a href="https://buy.stripe.com/aFacN6gjha4g7Pwf4u7ok00" target="_blank" rel="noopener noreferrer"
                      onClick={() => trackEvent("upgrade_click", { current_plan: "basic", target_plan: "pro", location: "sidebar" })}
                      style={{ display: "block", textAlign: "center", padding: "5px 0", borderRadius: 6, background: C.accent, color: "#fff", fontWeight: 700, fontSize: 11, textDecoration: "none", marginBottom: 6 }}>
                      Upgrade to Pro →
                    </a>
                  )}
                  <button onClick={() => supabase.auth.signOut()}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#ef4444", fontFamily: "inherit", padding: 0 }}>
                    Sign Out
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAuth(true)}
                  style={{ width: "100%", padding: "7px 0", borderRadius: 7, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>
                  Sign In / Sign Up
                </button>
              )}
              <button onClick={() => setShowLanding(true)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#9ca3af", fontFamily: "inherit", padding: 0, lineHeight: 1.8, display: "block" }}>
                ← Back to Landing Page
              </button>
              <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                <button onClick={() => setPage("privacy")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#9ca3af", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>
                  Privacy
                </button>
                <span style={{ fontSize: 10, color: "#d1d5db" }}>·</span>
                <button onClick={() => setPage("terms")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#9ca3af", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>
                  Terms
                </button>
              </div>
            </>
          )}
          {sidebarCollapsed && user && (
            <button onClick={() => supabase.auth.signOut()} title="Sign Out"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0, display: "block", margin: "0 auto" }}>
              🚪
            </button>
          )}
          {sidebarCollapsed && !user && (
            <button onClick={() => setShowAuth(true)} title="Sign In"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0, display: "block", margin: "0 auto" }}>
              👤
            </button>
          )}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {/* Top bar */}
        <div style={{ background: C.sidebar, borderBottom: `1px solid ${C.border}`, padding: "10px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.textMuted }}>
            {!user ? (
              <span>Guest — <strong style={{ color: C.text }}>10 single checks/day</strong> · <strong style={{ color: C.text }}>100 rows</strong> per upload</span>
            ) : planKey === "basic" ? (
              <span><span style={{ fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "1px 8px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Basic</span> &nbsp;Up to <strong style={{ color: C.text }}>1,000 rows</strong> per upload</span>
            ) : planKey === "pro" ? (
              <span><span style={{ fontWeight: 700, color: "#15803d", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 10, padding: "1px 8px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pro</span> &nbsp;Up to <strong style={{ color: C.text }}>10,000 rows</strong> · AI Assistant included</span>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!user && (
              <button onClick={() => setShowAuth(true)}
                style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Sign In
              </button>
            )}
            {user && planKey !== "pro" && (
              <a href="https://buy.stripe.com/aFacN6gjha4g7Pwf4u7ok00" target="_blank" rel="noopener noreferrer"
                style={{ padding: "5px 14px", borderRadius: 6, background: C.accent, color: "#fff", fontWeight: 700, fontSize: 12, textDecoration: "none" }}>
                Upgrade to Pro →
              </a>
            )}
            <a href="https://www.logititles.com" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: C.textMuted, textDecoration: "none" }}>
              ← Back to website
            </a>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "32px 38px" }}>
          {/* Persistent pages — kept mounted to preserve state, hidden when not active */}
          <div style={{ display: page === "analyzer" ? "block" : "none" }}>
            <SingleAnalyzer onAskAI={handleAskAI} user={user} planKey={planKey} onLogin={() => setShowAuth(true)} savedTitle={analyzerState.title} savedDesc={analyzerState.desc} savedCountry={analyzerState.country} savedResult={analyzerState.result} onSaveState={setAnalyzerState} />
          </div>
          <div style={{ display: page === "bulk" ? "block" : "none" }}>
            <BulkUpload onResultsReady={setBulkResults} user={user} limits={limits} userPlan={userPlan} onLogin={() => setShowAuth(true)} planKey={planKey} />
          </div>
          <div style={{ display: page === "ai" ? "block" : "none" }}>
            {planKey === "pro" ? <AIAssistant initialContext={aiContext} onClearContext={() => setAiContext("")} bulkResults={bulkResults} /> : <AIProWall onLogin={() => setShowAuth(true)} isLoggedIn={!!user} />}
          </div>
          {/* Other pages — conditionally rendered */}
          {page === "export"   && <ExportPage bulkResults={bulkResults} />}
          {page === "privacy"  && <PrivacyPolicy />}
          {page === "terms"    && <TermsOfService />}
          {!["analyzer","bulk","export","ai","privacy","terms"].includes(page) && navItem && <navItem.component />}
        </div>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />}
      {showResetPassword && <ResetPasswordModal onClose={() => { setShowResetPassword(false); }} />}
    </div>
  );
}

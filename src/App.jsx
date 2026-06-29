import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { analyzeViaAPI, bulkAnalyzeViaAPI, cleanPreviewViaAPI, chatViaAPI, startKeepAlive } from "./api.js";
startKeepAlive();
import skillConfig from "./skill_normalize.json";
import { supabase } from "./supabase.js";
import { trackEvent } from "./utils/analytics.js";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { CROSS_FUNCTIONAL_PAIRS, EXPORT_FIELDS } from "./constants/classify.js";
import { cleanTitle, classify, getSeniority, getWorkNature, getSkills, analyze } from "./utils/classify.js";
import { parseCSVLine, parseCSVText, parseXLSX, detectHeaderRow, getRawRowsCSV, detectColumns } from "./utils/parse.js";
import { isOutOfScope, getStatusLabel, buildExportRow, doDownloadCSV, doDownloadJSON, doDownloadXLSX } from "./utils/export.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { C, inputStyle, Spinner, Badge, Card, FieldLabel, SectionTitle, ConfidenceBar, domainTone, seniorityTone } from "./design/tokens.jsx";
import { FeedbackForm } from "./components/FeedbackForm.jsx";
import { AuthModal } from "./components/AuthModal.jsx";
import { AILoginWall } from "./components/AILoginWall.jsx";
import { ResetPasswordModal } from "./components/ResetPasswordModal.jsx";
import { AIProWall } from "./components/AIProWall.jsx";
import { SKILL_SYNONYMS, SKILL_DESCRIPTIONS } from "./constants/skills.js";

import { LandingPage } from "./pages/LandingPage.jsx";
import { SingleAnalyzer } from "./pages/SingleAnalyzer.jsx";
import { ResultCharts } from "./pages/ResultCharts.jsx";
import { BulkAIBubble } from "./pages/BulkAIBubble.jsx";
import { BulkUpload } from "./pages/BulkUpload.jsx";
import { SkillMapper } from "./pages/SkillMapper.jsx";
import { TitleCleaner } from "./pages/TitleCleaner.jsx";
import { ExportPage } from "./pages/ExportPage.jsx";
import { About } from "./pages/About.jsx";
import { AIAssistant } from "./pages/AIAssistant.jsx";
import { PrivacyPolicy } from "./pages/PrivacyPolicy.jsx";
import { TermsOfService } from "./pages/TermsOfService.jsx";
import { MarketInsights } from "./pages/MarketInsights.jsx";

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

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

export function AIAssistant({ initialContext = "", onClearContext, bulkResults = [] }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm your logistics HR specialist. Ask me anything about your classification results, salary benchmarks, or logistics job titles in general." }
  ]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef(null);
  const didAutoSend             = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (initialContext && !didAutoSend.current) {
      didAutoSend.current = true;
      send("Can you explain this classification result?", initialContext);
      onClearContext?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildBulkContext() {
    if (!bulkResults.length) return "";
    const inScope = bulkResults.filter(r => !isOutOfScope(r));
    const outOfScope = bulkResults.length - inScope.length;
    const lowConf = inScope.filter(r => r.confidence < 55).length;
    const domainCounts = {};
    const seniorityCounts = {};
    const skillCounts = {};
    inScope.forEach(r => {
      if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
      if (r.seniority) seniorityCounts[r.seniority] = (seniorityCounts[r.seniority] || 0) + 1;
      (r.skills || []).forEach(s => { skillCounts[s] = (skillCounts[s] || 0) + 1; });
    });
    const topDomains = Object.entries(domainCounts).sort((a,b) => b[1]-a[1]).map(([d,c]) => `${d}: ${c}`).join(", ");
    const topSeniority = Object.entries(seniorityCounts).sort((a,b) => b[1]-a[1]).map(([s,c]) => `${s}: ${c}`).join(", ");
    const topSkills = Object.entries(skillCounts).sort((a,b) => b[1]-a[1]).slice(0,8).map(([s,c]) => `${s}(${c})`).join(", ");
    return `Dataset summary: ${bulkResults.length} records total. Out-of-scope (excluded): ${outOfScope}. Low-confidence rows (review recommended): ${lowConf}. Domain breakdown (in-scope only): ${topDomains}. Seniority breakdown: ${topSeniority}. Top skills: ${topSkills}. When answering, always exclude out-of-scope rows and say so. Do not estimate salary for out-of-scope or low-confidence rows.`;
  }

  // Increment AI usage counter in Supabase
  async function incrementAiUsed() {
    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !authUser) return;

    const { data: currentRows, error: fetchError } = await supabase
      .from("user_plans")
      .select("ai_used")
      .eq("user_id", authUser.id)
      .single();

    if (fetchError) {
      console.error("Failed to fetch ai_used:", fetchError.message);
      return;
    }

    const nextAiUsed = (currentRows?.ai_used || 0) + 1;
    const { error } = await supabase
      .from("user_plans")
      .update({ ai_used: nextAiUsed })
      .eq("user_id", authUser.id);

    if (error) console.error("Failed to update ai_used:", error.message);
  }

  async function send(text, ctx = "") {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    const updated = [...messages, { role: "user", content: msg }];
    setMessages(updated);
    setLoading(true);
    const history = updated.slice(1).slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const context = ctx || buildBulkContext();
    const reply = await chatViaAPI(msg, history, context, token);
    const errorMsg = reply === null
      ? "The AI Assistant is temporarily unavailable. Please try again in a moment."
      : reply === "auth"
      ? "Your session has expired. Please sign in again to use the AI Assistant."
      : null;
    setMessages(prev => [...prev, { role: "assistant", content: errorMsg || reply }]);
    setLoading(false);

    // Record AI usage (only if successful response)
    if (!errorMsg) {
      await incrementAiUsed();
      trackEvent("ai_question_success", {
        plan: userPlan?.plan || "guest",
        has_uploaded_data: Boolean(results?.length),
      });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", maxWidth: 720 }}>
      <SectionTitle children="AI Assistant" sub="Ask questions about your results, salary benchmarks, or logistics job titles." />
      {bulkResults.length > 0 && (
        <div style={{ marginBottom: 12, padding: "8px 14px", borderRadius: 8, background: C.greenLight, border: `1px solid ${C.greenBorder}`, fontSize: 12, color: "#166534" }}>
          ✓ Dataset loaded — {bulkResults.length} rows ({bulkResults.filter(r => !isOutOfScope(r)).length} in-scope). Ask questions about your results below.
        </div>
      )}

      {/* Quick prompts */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {QUICK_PROMPTS.map(q => (
          <button key={q} onClick={() => send(q)}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.card, fontSize: 12, color: C.textSub, cursor: "pointer", fontFamily: "inherit" }}>
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <Card style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%", padding: "10px 14px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              background: m.role === "user" ? C.accent : C.bg,
              color: m.role === "user" ? "#fff" : C.text,
              fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
              border: m.role === "assistant" ? `1px solid ${C.border}` : "none",
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: "14px 14px 14px 4px", background: C.bg, border: `1px solid ${C.border}`, fontSize: 13, color: C.textMuted }}>
              Thinking…
            </div>
          </div>
        )}
        {messages.length >= 16 && (
          <div style={{ textAlign: "center", padding: "12px 16px", background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, fontSize: 12, color: "#78350f" }}>
            Session limit reached. <button onClick={() => { setMessages([{ role: "assistant", content: "Hi! I'm your logistics HR specialist. Ask me anything about your classification results, salary benchmarks, or logistics job titles in general." }]); didAutoSend.current = false; }} style={{ background: "none", border: "none", cursor: "pointer", color: C.accent, fontWeight: 600, fontFamily: "inherit", fontSize: 12, textDecoration: "underline", padding: 0 }}>Start a new conversation</button>
          </div>
        )}
        <div ref={bottomRef} />
      </Card>

      {/* Input */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about your results or logistics job titles…"
          style={{ ...inputStyle, flex: 1, margin: 0 }}
          disabled={loading || messages.length >= 16}
        />
        <button onClick={() => send()}
          disabled={!input.trim() || loading || messages.length >= 16}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: input.trim() && !loading ? C.accent : "#d1d5db", color: "#fff", fontWeight: 700, fontSize: 13, cursor: input.trim() && !loading ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
          Send →
        </button>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: C.textMuted, textAlign: "center" }}>
        Powered by Claude · Responses are AI-generated and may not always be accurate
      </div>
    </div>
  );
}


// ── Page 8: Privacy Policy ───────────────────────────────────────────────────



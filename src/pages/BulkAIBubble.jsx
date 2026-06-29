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

export function BulkAIBubble({ results, user, supabase }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! Ask me anything about your classified data — domain breakdown, skills, salary, or specific titles." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  function buildContext() {
    // Helper functions for consistent type checking
    const isOutOfScopeRow = (r) =>
      r.out_of_scope === true ||
      r.out_of_scope === "Yes" ||
      r.status === "Out of scope" ||
      r.domain === "Out of scope";

    const isNeedsReviewRow = (r) =>
      r.needsReview === true ||
      r.needs_review === true ||
      r.needs_review === "Yes" ||
      r.needs_review === "yes" ||
      r.status === "Review recommended" ||
      r.status === "Low confidence";

    const total = results.length;
    const inScope = results.filter(r => !isOutOfScopeRow(r));
    const outOfScope = total - inScope.length;
    const outOfScopeRows = results.filter(isOutOfScopeRow);
    const reviewRows = inScope.filter(isNeedsReviewRow);

    // DEBUG: Check actual data format
    if (inScope.length > 0) {
      const sampleRow = inScope[0];
      console.log("🔍 Sample in-scope row:", {
        needs_review: sampleRow.needs_review,
        status: sampleRow.status,
        needsReview: sampleRow.needsReview,
        raw_data: sampleRow
      });
      console.log("🔍 isNeedsReviewRow check:", isNeedsReviewRow(sampleRow));
      console.log("🔍 inScope rows with needs_review:", inScope.filter(r => r.needs_review || r.needsReview).length);
      console.log("🔍 inScope rows with Review status:", inScope.filter(r => r.status?.includes("Review")).length);
      console.log("🔍 Total reviewRows:", reviewRows.length);
    }

    // Domain counts
    const domainCounts = {};
    inScope.forEach(r => {
      if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
    });

    // Seniority counts (exclude out-of-scope)
    const seniorityCounts = {};
    inScope.forEach(r => {
      if (r.seniority && r.seniority !== "Review Required") {
        seniorityCounts[r.seniority] = (seniorityCounts[r.seniority] || 0) + 1;
      }
    });

    // Status counts
    const statusCounts = {};
    inScope.forEach(r => {
      const status = r.status || "Unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Review required rows sample
    const reviewRowsSample = reviewRows.slice(0, 20).map(r => ({
      raw_title: r.raw_title,
      clean_title: r.clean_title,
      domain: r.domain,
      confidence: r.confidence,
      status: r.status,
      flags: r.flags?.join("; ") || ""
    }));

    // Out-of-scope rows sample
    const outOfScopeRowsSample = outOfScopeRows.slice(0, 20).map(r => ({
      raw_title: r.raw_title,
      clean_title: r.clean_title,
      confidence: r.confidence,
      status: r.status,
      flags: r.flags?.join("; ") || ""
    }));

    // Skill counts
    const skillCounts = {};
    const skillDomainCounts = {};
    inScope.forEach(r => {
      (r.skills || []).forEach(s => {
        skillCounts[s] = (skillCounts[s] || 0) + 1;
        if (!skillDomainCounts[s]) skillDomainCounts[s] = {};
        if (r.domain) skillDomainCounts[s][r.domain] = (skillDomainCounts[s][r.domain] || 0) + 1;
      });
    });
    const topSkills = Object.entries(skillCounts).sort((a,b) => b[1]-a[1]).slice(0,10).map(([s,c]) => `${s}(${c})`).join(", ");

    // Salary by domain (salaryBenchmark is an object with median property)
    const salaryByDomain = {};
    inScope.forEach(r => {
      if (r.domain && r.salaryBenchmark) {
        if (!salaryByDomain[r.domain]) salaryByDomain[r.domain] = [];
        // salaryBenchmark is {currency: "NZD", median: 62000, range: "..."}
        let numValue = r.salaryBenchmark.median || r.salaryBenchmark;
        if (typeof numValue === 'string') {
          numValue = parseInt(numValue.replace(/[$,]/g, ''));
        }
        if (numValue && !isNaN(numValue)) {
          salaryByDomain[r.domain].push(numValue);
        }
      }
    });
    Object.keys(salaryByDomain).forEach(d => {
      const arr = salaryByDomain[d];
      if (arr.length > 0) {
        salaryByDomain[d] = Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
      }
    });

    // DEBUG: Check salary calculation
    if (inScope.length > 0) {
      const sampleRow = inScope[0];
      console.log("💰 Salary debug:", {
        sampleRowSalaryBenchmark: sampleRow.salaryBenchmark,
        salaryByDomain: salaryByDomain,
        rowsWithSalary: inScope.filter(r => r.salaryBenchmark).length
      });
    }

    // Build structured context
    const aiContext = {
      summary: {
        total_rows: total,
        structured_count: inScope.length,
        review_required_count: reviewRows.length,
        out_of_scope_count: outOfScope,
        in_scope_count: inScope.length
      },
      counts: {
        domain_counts: domainCounts,
        seniority_counts: seniorityCounts,
        status_counts: statusCounts
      },
      samples: {
        review_rows_sample: reviewRowsSample,
        out_of_scope_rows_sample: outOfScopeRowsSample
      },
      top_skills: topSkills,
      skill_domain_counts: skillDomainCounts,
      salary_by_domain: salaryByDomain,
      instructions:
        "Use the provided derived statistics as the source of truth. Base all insights on this dataset only. " +
        "Dataset has 9 classification domains: five core logistics domains (Warehouse, Transport, Freight Forwarding, Planning, Operations) and four supporting business functions (Finance, Sales, IT Support, Business Administration). " +
        "When asked about operational-heavy domains, prioritise Warehouse, Operations, Transport, and Freight Forwarding. Treat Planning as operationally adjacent but more analytical/planning-focused, not purely operational. " +
        "When asked about salary, use salary_by_domain (average median salary per domain). Always include this disclaimer: 'Market reference only. Actual salaries may vary by employer, experience, and location.' " +
        "When asked 'Which rows are out of scope?', answer with out_of_scope_count and list specific titles from out_of_scope_rows_sample. " +
        "When asked 'Which titles need manual review?' or 'What needs review?', answer with review_required_count and list specific titles from review_rows_sample. " +
        "Review required includes: needs_review=true/Yes, status='Review recommended' or 'Low confidence', cross-functional signals, description-inferred, ambiguous titles, or flagged rows. " +
        "When asked about seniority, use seniority_counts and count totals. " +
        "When asked about skills across domains, use skill_domain_counts (actual data, not inference) to show which domains use each skill. " +
        "Do not say data is unavailable if it is included in the context. " +
        "Always specify when excluding out-of-scope rows from domain/skill/seniority analysis. " +
        "Provide concrete examples from the sample rows, not generic explanations. " +
        "Use conservative language for insights: 'This may suggest...', 'This could indicate...', 'Based on this upload only...' rather than absolute statements. " +
        "When giving action items or observations, keep recommendations concise, specific, and grounded in the data shown. " +
        "Avoid speculation beyond what the data shows. Focus on patterns visible in this dataset."
    };

    // DEBUG: Log the context to verify it's correct
    console.log("🔍 AI Context Debug:", {
      total_rows: aiContext.summary.total_rows,
      review_required_count: aiContext.summary.review_required_count,
      out_of_scope_count: aiContext.summary.out_of_scope_count,
      review_sample_length: aiContext.samples.review_rows_sample.length,
      out_of_scope_sample_length: aiContext.samples.out_of_scope_rows_sample.length,
      review_sample_titles: aiContext.samples.review_rows_sample.slice(0, 5).map(r => r.clean_title),
      out_of_scope_sample_titles: aiContext.samples.out_of_scope_rows_sample.slice(0, 5).map(r => r.clean_title)
    });

    return JSON.stringify(aiContext, null, 2);
  }

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    const updated = [...messages, { role: "user", content: msg }];
    setMessages(updated);
    setLoading(true);
    const history = updated.slice(1, -1).map(m => ({ role: m.role, content: m.content }));
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const ctx = results.length > 0 ? buildContext() : "";
    const reply = await chatViaAPI(msg, history, ctx, token);
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
    <>
      {/* Floating button */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 1000,
          width: 52, height: 52, borderRadius: "50%",
          background: C.accent, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, cursor: "pointer", boxShadow: "0 4px 16px rgba(59,110,245,0.4)",
          transition: "transform 0.15s",
        }}
        title="AI Assistant"
      >
        {open ? "✕" : "✨"}
      </div>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed",
          ...(expanded ? { inset: 0, borderRadius: 0, bottom: "auto", right: "auto", width: "100%", height: "100%", zIndex: 1001 } : { bottom: 92, right: 28, width: 360, height: 480, zIndex: 999, borderRadius: 16 }),
          background: C.card,
          boxShadow: expanded ? "none" : "0 8px 32px rgba(0,0,0,0.15)",
          border: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.accent, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>✨ AI Assistant</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                {results.length > 0 ? `Analysing ${results.length} classified records` : "Ask about logistics job titles"}
              </div>
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}
            >
              {expanded ? "−" : "+"}
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%", padding: "8px 12px",
                  borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: m.role === "user" ? C.accent : C.bg,
                  color: m.role === "user" ? "#fff" : C.text,
                  fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap",
                  border: m.role === "assistant" ? `1px solid ${C.border}` : "none",
                }}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "14px 14px 14px 4px", padding: "8px 14px", fontSize: 12, color: C.textMuted }}>Thinking…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask about your data…"
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", outline: "none" }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: loading || !input.trim() ? C.border : C.accent, color: loading || !input.trim() ? C.textMuted : "#fff", fontWeight: 700, fontSize: 12, cursor: loading || !input.trim() ? "default" : "pointer", fontFamily: "inherit" }}
            >Send</button>
          </div>
        </div>
      )}
    </>
  );
}


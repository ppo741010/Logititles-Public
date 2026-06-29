import { trackEvent } from "../utils/analytics.js";
import { C } from "../design/tokens.jsx";

const AI_MOCKUP = [
  { role: "user", text: "Which domain had the most senior roles in my dataset?" },
  { role: "ai",   text: "Based on your dataset, Operations had the highest proportion of Manager and Senior roles (42%), followed by Freight Forwarding (28%). Warehouse roles were predominantly Entry Level and Mid Level." },
  { role: "user", text: "What are the top skills across warehouse roles?" },
  { role: "ai",   text: "The most common skills in Warehouse roles were: Inventory Control, WMS, Forklift Operation, Manual Handling, and Health & Safety Compliance. These appeared in over 60% of warehouse titles." },
];

export function AIProWall({ onLogin, isLoggedIn }) {
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>✨</div>
        <div style={{ fontWeight: 700, fontSize: 20, color: C.text, marginBottom: 6 }}>AI Assistant</div>
        <div style={{ display: "inline-block", padding: "3px 12px", borderRadius: 20, background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Pro Plan Only</div>
        <div style={{ fontSize: 13, color: C.textMuted, maxWidth: 380, margin: "12px auto 0", lineHeight: 1.65 }}>
          After running a Bulk Upload, ask questions about your classified data in plain English.
        </div>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 24, opacity: 0.85 }}>
        <div style={{ background: C.sidebar, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>✨</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>AI Assistant — Example conversation</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: C.textMuted, background: "#fef3c7", border: "1px solid #fcd34d", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>Preview only</span>
        </div>
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12, background: C.bg }}>
          {AI_MOCKUP.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "80%", padding: "10px 14px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: m.role === "user" ? C.accent : C.card,
                color: m.role === "user" ? "#fff" : C.text,
                fontSize: 13, lineHeight: 1.6,
                border: m.role === "ai" ? `1px solid ${C.border}` : "none",
              }}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "20px", background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Upgrade to Pro — NZ$29/month</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          {["Up to 10,000 rows per upload", "AI Assistant — 100 credits/month", "Priority support during beta"].map(f => (
            <div key={f} style={{ fontSize: 12, color: C.textMuted, display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: C.green }}>✓</span>{f}
            </div>
          ))}
        </div>
        <a href="https://buy.stripe.com/aFacN6gjha4g7Pwf4u7ok00" target="_blank" rel="noopener noreferrer"
          onClick={() => trackEvent("upgrade_click", { current_plan: "guest", target_plan: "pro", location: "landing_banner" })}
          style={{ padding: "11px 32px", borderRadius: 9, background: C.accent, color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none", display: "inline-block" }}>
          Upgrade to Pro →
        </a>
        {!isLoggedIn && (
          <div style={{ marginTop: 12 }}>
            <button onClick={onLogin} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.accent, fontFamily: "inherit", textDecoration: "underline" }}>
              Already have an account? Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

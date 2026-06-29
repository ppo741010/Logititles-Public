import { C } from "../design/tokens.jsx";

export function AILoginWall({ onLogin }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16, textAlign: "center", padding: "0 24px" }}>
      <div style={{ fontSize: 48 }}>✨</div>
      <div style={{ fontWeight: 700, fontSize: 20, color: C.text }}>AI Assistant</div>
      <div style={{ fontSize: 14, color: C.textMuted, maxWidth: 320, lineHeight: 1.6 }}>
        Sign in to access the AI Assistant. Ask questions about classification results, salary benchmarks, and logistics job titles.
      </div>
      <button onClick={onLogin}
        style={{ padding: "11px 32px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 8 }}>
        Sign In / Sign Up
      </button>
    </div>
  );
}

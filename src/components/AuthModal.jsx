import { useState } from "react";
import { supabase } from "../supabase.js";
import { C } from "../design/tokens.jsx";

export function AuthModal({ onClose, onSuccess }) {
  const [tab, setTab]           = useState("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        onSuccess();
        onClose();
      } else if (tab === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setDone(true);
      } else if (tab === "reset") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: "https://app.logititles.com",
        });
        if (err) throw err;
        setDone(true);
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const iStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13.5, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box", outline: "none" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 14, padding: "28px 30px", width: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Welcome to Logititles</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.textMuted, lineHeight: 1 }}>×</button>
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>Check your email</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>
              {tab === "reset"
                ? <>We sent a password reset link to <strong>{email}</strong>.</>
                : <>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</>}
            </div>
            <button onClick={onClose} style={{ marginTop: 20, padding: "9px 24px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
          </div>
        ) : tab === "reset" ? (
          <>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Enter your email and we'll send you a reset link.</div>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={iStyle} />
              {error && <div style={{ fontSize: 12, color: "#ef4444", background: "#fef2f2", padding: "8px 10px", borderRadius: 6 }}>{error}</div>}
              <button type="submit" disabled={loading}
                style={{ padding: "10px 0", borderRadius: 8, border: "none", background: loading ? "#d1d5db" : C.accent, color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer", fontFamily: "inherit", marginTop: 4 }}>
                {loading ? "Please wait…" : "Send Reset Link"}
              </button>
            </form>
            <button onClick={() => { setTab("login"); setError(""); }} style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.textMuted, fontFamily: "inherit", textDecoration: "underline" }}>
              Back to Sign In
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 0, marginBottom: 20, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
              {["login", "signup"].map(t => (
                <button key={t} onClick={() => { setTab(t); setError(""); }}
                  style={{ flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: tab === t ? 700 : 400, background: tab === t ? C.accent : "transparent", color: tab === t ? "#fff" : C.textMuted, transition: "all 0.15s" }}>
                  {t === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={iStyle} />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={iStyle} />
              {error && <div style={{ fontSize: 12, color: "#ef4444", background: "#fef2f2", padding: "8px 10px", borderRadius: 6 }}>{error}</div>}
              <button type="submit" disabled={loading}
                style={{ padding: "10px 0", borderRadius: 8, border: "none", background: loading ? "#d1d5db" : C.accent, color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer", fontFamily: "inherit", marginTop: 4 }}>
                {loading ? "Please wait…" : tab === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>
            {tab === "login" && (
              <button onClick={() => { setTab("reset"); setError(""); }} style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.textMuted, fontFamily: "inherit", textDecoration: "underline" }}>
                Forgot password?
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

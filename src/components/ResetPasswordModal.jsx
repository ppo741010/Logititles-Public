import { useState } from "react";
import { supabase } from "../supabase.js";
import { C } from "../design/tokens.jsx";

export function ResetPasswordModal({ onClose }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  const iStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13.5, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box", outline: "none" };

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 14, padding: "28px 30px", width: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", fontFamily: "inherit" }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 20 }}>Set New Password</div>
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>Password updated!</div>
            <button onClick={onClose} style={{ marginTop: 16, padding: "9px 24px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Continue</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} required style={iStyle} />
            <input type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={iStyle} />
            {error && <div style={{ fontSize: 12, color: "#ef4444", background: "#fef2f2", padding: "8px 10px", borderRadius: 6 }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ padding: "10px 0", borderRadius: 8, border: "none", background: loading ? "#d1d5db" : C.accent, color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer", fontFamily: "inherit", marginTop: 4 }}>
              {loading ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

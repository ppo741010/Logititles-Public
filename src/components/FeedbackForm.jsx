import { useState } from "react";
import { supabase } from "../supabase.js";
import { trackEvent } from "../utils/analytics.js";
import { C } from "../design/tokens.jsx";

export function FeedbackForm({ page = "", testInput = "", metadata = {} }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  async function submit() {
    if (!rating || !comment.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const { error } = await supabase.from("feedback").insert([
        {
          page,
          title: testInput.slice(0, 100),
          rating,
          comment: comment.trim(),
          result: metadata.result || "",
          confidence: metadata.confidence || null,
          status: metadata.status || null,
          out_of_scope: metadata.out_of_scope || null,
        },
      ]);
      if (!error) {
        setStatus("success");
        trackEvent("feedback_submit", { page, rating });
        setTimeout(() => {
          setShowFeedback(false);
          setRating("");
          setComment("");
          setStatus(null);
        }, 1500);
      } else {
        setStatus("error");
        console.error("Supabase error:", error);
      }
    } catch (err) {
      setStatus("error");
      console.error("Feedback error:", err);
    }
    setLoading(false);
  }

  if (!showFeedback) {
    return (
      <button onClick={() => setShowFeedback(true)}
        style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px dashed #d1d5db", background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
        📝 Help us improve — share your feedback
      </button>
    );
  }

  return (
    <div style={{ padding: "12px 14px", borderRadius: 8, background: "#f0fdf4", border: `1px solid #bbf7d0` }}>
      {status === "success" && (
        <div style={{ padding: "8px 12px", borderRadius: 6, background: "#ecfdf5", border: "1px solid #a7f3d0", marginBottom: 10, fontSize: 12, color: "#047857", fontWeight: 600 }}>
          ✅ Thanks! Feedback saved.
        </div>
      )}
      {status === "error" && (
        <div style={{ padding: "8px 12px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fca5a5", marginBottom: 10, fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>
          ❌ Error saving feedback. Please try again.
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>Quick feedback</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setRating("up")}
          style={{ flex: 1, padding: "6px", borderRadius: 6, border: `2px solid ${rating === "up" ? "#16a34a" : "#e5e7eb"}`, background: rating === "up" ? "#f0fdf4" : "transparent", color: "#16a34a", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          👍 Made sense
        </button>
        <button onClick={() => setRating("down")}
          style={{ flex: 1, padding: "6px", borderRadius: 6, border: `2px solid ${rating === "down" ? "#dc2626" : "#e5e7eb"}`, background: rating === "down" ? "#fef2f2" : "transparent", color: "#dc2626", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          👎 Confusing
        </button>
      </div>
      <textarea value={comment} onChange={e => setComment(e.target.value)}
        placeholder="What was confusing or missing?"
        style={{ width: "100%", padding: "8px", borderRadius: 6, border: `1px solid #d1d5db`, fontSize: 12, fontFamily: "inherit", resize: "vertical", height: 60, boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={submit} disabled={!rating || !comment.trim() || loading}
          style={{ flex: 1, padding: "6px", borderRadius: 6, border: "none", background: rating && comment.trim() ? "#16a34a" : "#d1d5db", color: "#fff", cursor: rating && comment.trim() ? "pointer" : "default", fontFamily: "inherit", fontWeight: 600, fontSize: 12 }}>
          {loading ? "…" : "Submit"}
        </button>
        <button onClick={() => { setShowFeedback(false); setRating(""); setComment(""); setStatus(null); }}
          style={{ flex: 1, padding: "6px", borderRadius: 6, border: `1px solid #d1d5db`, background: "transparent", color: C.textMuted, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

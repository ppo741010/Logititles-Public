import { useState, useEffect } from "react";

const spinnerKeyframes = `
@keyframes spin { to { transform: rotate(360deg); } }
`;
if (typeof document !== "undefined" && !document.getElementById("spinner-style")) {
  const s = document.createElement("style");
  s.id = "spinner-style";
  s.textContent = spinnerKeyframes;
  document.head.appendChild(s);
}

export const C = {
  sidebar: "#ffffff", sidebarHover: "#eef2ff", sidebarActive: "#eef2ff",
  sidebarText: "#6b7280", sidebarActiveText: "#4f46e5",
  accent: "#3b6ef5", accentLight: "#eef2ff", accentBorder: "#c7d7fc",
  green: "#16a34a", greenLight: "#f0fdf4", greenBorder: "#bbf7d0",
  amber: "#d97706", amberLight: "#fffbeb", amberBorder: "#fcd34d",
  red: "#dc2626", redLight: "#fef2f2", redBorder: "#fca5a5",
  text: "#111827", textSub: "#374151", textMuted: "#6b7280",
  border: "#e5e7eb", bg: "#f8fafc", card: "#ffffff",
  pill: "#f3f4f6", pillText: "#374151",
};

export const inputStyle = {
  width: "100%", padding: "10px 13px", borderRadius: 8,
  border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none",
  boxSizing: "border-box", fontFamily: "inherit", background: C.card, color: C.text, lineHeight: 1.5,
};

export function Spinner({ size = 24, color = "#3b6ef5" }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `3px solid #e5e7eb`,
      borderTopColor: color,
      animation: "spin 0.7s linear infinite",
      flexShrink: 0,
    }} />
  );
}

export function Badge({ tone = "blue", children, size = "sm", variant = "pill" }) {
  const tones = {
    blue:  { background: C.accentLight, color: C.accent,   border: C.accentBorder },
    green: { background: C.greenLight,  color: C.green,    border: C.greenBorder },
    amber: { background: C.amberLight,  color: C.amber,    border: C.amberBorder },
    red:   { background: C.redLight,    color: C.red,      border: C.redBorder },
    gray:  { background: C.pill,        color: C.textSub,  border: C.border },
    slate: { background: "#f1f5f9",     color: "#475569",  border: "#cbd5e1" },
  };
  const t = tones[tone] || tones.gray;
  const fontSize = size === "sm" ? 12 : 13;
  if (variant === "tag") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: size === "sm" ? "2px 8px 2px 0" : "3px 10px 3px 0", fontSize, fontWeight: 600, color: t.color }}>
        <span style={{ display: "inline-block", width: 3, alignSelf: "stretch", background: t.color, borderRadius: "2px 0 0 2px", minHeight: 14 }} />
        {children}
      </span>
    );
  }
  return (
    <span style={{ ...t, border: `1px solid ${t.border}`, padding: size === "sm" ? "3px 10px" : "4px 14px", borderRadius: 20, fontSize, fontWeight: 600, display: "inline-block", letterSpacing: "0.01em" }}>
      {children}
    </span>
  );
}

export function Card({ children, style = {}, highlight }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${highlight ? C.accentBorder : C.border}`, borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...style }}>
      {children}
    </div>
  );
}

export function FieldLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>{children}</div>;
}

export function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: C.text, margin: 0 }}>{children}</h1>
      {sub && <p style={{ color: C.textMuted, margin: "5px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

export function matchConfidenceLabel(value) {
  if (value >= 85) return { label: "High",                      text: C.green, bar: C.green };
  if (value >= 70) return { label: "Medium — review recommended", text: C.amber, bar: C.amber };
  if (value >= 55) return { label: "Low — review recommended",    text: C.amber, bar: C.amber };
  return               { label: "Uncertain",                    text: C.red,   bar: C.red };
}

export function ConfidenceBar({ value }) {
  const tone = matchConfidenceLabel(value);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Match Confidence</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: tone.text }}>{value}% · {tone.label}</span>
      </div>
      <div style={{ background: "#e5e7eb", borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, background: tone.bar, height: 8, borderRadius: 6, transition: "width 0.6s ease" }} />
      </div>
      {value < 85 && (
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>
          This result is a reasonable classification, but the title or description may be ambiguous. Please review before using in final reporting.
        </div>
      )}
    </div>
  );
}

export function domainTone(d) {
  return { "Warehouse":"blue","Transport":"blue","Freight Forwarding":"blue","Planning":"green",
           "Operations":"blue","Finance":"amber","Sales":"green","IT Support":"slate",
           "Business Administration":"slate","Other/Noise":"red","Out of scope":"red" }[d] || "gray";
}

export function seniorityTone(label) {
  if (label === "Executive") return "red";
  if (label === "Manager")   return "amber";
  if (label === "Senior")    return "green";
  if (label === "Mid Level") return "blue";
  return "gray";
}

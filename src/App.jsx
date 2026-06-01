import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { analyzeViaAPI, bulkAnalyzeViaAPI, cleanPreviewViaAPI, submitFeedback, chatViaAPI, startKeepAlive } from "./api.js";
startKeepAlive();
import skillConfig from "./skill_normalize.json";
import { supabase } from "./supabase.js";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// ── Classification data ─────────────────────────────────────────────────────

const PRIORITY_DOMAIN_RULES = {
  "Warehouse": ["warehouse manager","warehouse supervisor","warehouse coordinator","warehouse assistant","warehouse","storeperson","store person","forklift","picker","packer","pick pack","inventory","stock","distribution centre","distribution center","devanner","labourer","fulfilment","fulfillment","fulfilment manager","fulfillment manager","inbound","outbound","returns","cold storage","receiving","despatch","put away"],
  "Transport": ["transport manager","dispatch coordinator","dispatcher","dispatch","allocator","delivery","driver","courier","linehaul","fleet","route"],
  "Freight Forwarding": ["freight","customs","brokerage","import","export","airfreight","seafreight","forwarding"],
  "Planning": ["supply chain","demand planner","planner","planning","procurement","purchasing","purchaser","buyer","business analyst","scheduler","sourcing","replenishment","forecast"],
  "Finance": ["accounts payable","accounts receivable","accounts payable/receivable","accountant","accounts","payroll","finance","billing","costing","fp&a","financial planning","financial analyst","treasury","budgeting"],
  "IT Support": ["developer","architect","systems","technology","application support","technical support","it support","software support","application specialist","hris specialist","technical consultant"],
  "Operations": ["operations manager","operations supervisor","operations coordinator","logistics manager","logistics coordinator","logistics","operator","controller","process","production","quality","qa","sap","decon","consol","erp","e-commerce","ecommerce","omnichannel"],
  "Business Administration": ["office administrator","admin assistant","executive assistant","personal assistant","receptionist","office support","clerical","office manager","hr business partner","hr advisor","hr coordinator","hr transformation","hr specialist"],
  "Sales": ["customer service","customer support","sales operations","sales coordinator","sales manager","sales","business development","key account","merchandiser","representative","account manager","commercial","commercial manager","commercial development","business to business","b2b","b2c","activation","channel"],
};

const FUZZY_ROLE_REPAIR = {
  "checkout/retail":"Other/Noise","retail":"Other/Noise","cleaning":"Other/Noise","electrician":"Other/Noise",
  "surveyor":"Other/Noise","agronomist":"Other/Noise","cleaner":"Other/Noise","estimator":"Other/Noise",
  "powerline":"Other/Noise","kiwifruit":"Other/Noise","faller":"Other/Noise","health consultant":"Other/Noise",
  "office administrator":"Business Administration","hr business partner":"Business Administration",
  "admin assistant":"Business Administration","executive assistant":"Business Administration",
  "receptionist":"Business Administration","analytics":"Planning","category manager":"Planning",
  "supply manager":"Planning","materials manager":"Planning","freight":"Freight Forwarding",
  "dispatch coordinator":"Transport","allocator":"Transport","driver":"Transport",
  "warehouse manager":"Warehouse","inventory":"Warehouse","forklift":"Warehouse",
  "accounts payable":"Finance","accountant":"Finance","payroll":"Finance",
  "developer":"IT Support","implementation":"IT Support","solutions consultant":"IT Support",
  "operations manager":"Operations","logistics":"Operations",
  "customer service":"Sales","sales":"Sales","business development":"Sales",
  "head of retail":"Sales","commercial manager":"Sales",
};

const LEVEL_MAPPING = {
  "ceo":"Executive","gm":"Executive","director":"Executive",
  "head of":"Executive","executive":"Executive",
  "manager":"Manager",
  "consultant":"Manager","analyst":"Manager","strategist":"Manager",
  "specialist":"Senior",
  "senior":"Senior","snr":"Senior","team lead":"Senior",
  "principal":"Senior","advanced":"Senior",
  "coordinator":"Mid Level","supervisor":"Mid Level",
  "officer":"Mid Level","administrator":"Mid Level",
  "representative":"Mid Level","operator":"Mid Level",
  "driver":"Mid Level","planner":"Mid Level",
  "junior":"Entry Level","jr":"Entry Level","jnr":"Entry Level",
  "graduate":"Entry Level","trainee":"Entry Level",
  "entry":"Entry Level","assistant":"Entry Level","picker":"Entry Level",
  "packer":"Entry Level","handler":"Entry Level",
};

const WORK_NATURE_MAPPING = {
  "Management":["manager","director","head","gm","chief","executive","superintendent","principal"],
  "Specialist / Support":["analyst","planner","consultant","engineer","accountant","specialist","officer","admin","administrator","representative","agent","support","architect","business development","customer service","merchandiser","key account","sales","advisor","accounts","finance","billing","payroll"],
  "Operational":["coordinator","supervisor","operator","driver","picker","storeman","clerk","handler","assistant","staff","loader","sorter","packer","dispatch","storeperson","controller","tally","devanner","mechanic"],
};

const DOMAIN_SKILL_FIXED = {
  "Business Administration":["Leadership","Stakeholder Management","Strategic Planning","KPI Management"],
  "Operations":["Process Optimization","Operational Excellence","Resource Allocation","SOP Development"],
  "Finance":["Cost Analysis","Accounts Payable/Receivable","ERP Proficiency","Financial Reporting"],
  "Planning":["Demand Forecasting","Inventory Optimization","Supply Chain Planning","S&OP"],
  "Freight Forwarding":["Incoterms","Customs Clearance","Export/Import Documentation","Consolidation"],
  "Warehouse":["Inventory Accuracy","WMS","RF Scanning","Manual Handling","Safety Compliance"],
  "Transport":["TMS","Route Optimization","Fleet Management","Last Mile Delivery","Compliance"],
  "Sales":["CRM","Quotation","Market Analysis","Revenue Growth","Customer Service"],
  "IT Support":["Systems Integration","ERP Maintenance","Data Governance","IT Infrastructure"],
  "Other/Noise":[],
};

const REMOVE_PHRASES = ["immediate start","apply now","great opportunity","exciting opportunity","career growth","wanted","needed","join our team","above award rate","great money","packag","remuner","salary package","competitive package","competitive salary","bonus"];
// Note: "distrib" intentionally removed — it incorrectly strips "Distribution" from titles like "Distribution Centre Supervisor"
const REMOVE_SHIFT = ["night shift","day shift","afternoon shift","am shift","pm shift","overnight","morning shift","part time","full time","casual"];
const REMOVE_CONTRACT = ["ftc","fixed term","fixed-term","contract role","contract position","temp role","temporary role","temp to perm","maternity cover","parental leave cover","secondment","ongoing","permanent role","casual role"];
const SALARY_PATTERN = /\$[\d,]+[k]?(\s*[-–]\s*\$?[\d,]+[k]?)?\s*(pa\b|p\.a\.|per annum|per year|annually|ph\b|p\.h\.|per hour)?/gi;
const CONTRACT_DURATION_PATTERN = /\b\d+[-\s]?(month|week|year)[s]?\b(\s*contract)?/gi;
const TYPO_MAP = {
  "assisstant":"assistant","coodrinator":"coordinator","sepcialist":"specialist",
  "mandarine":"mandarin","operatior":"operator","oprations":"operations",
  "mananger":"manager","manageer":"manager","manger":"manager",
  "logsitics":"logistics","logistic ":"logistics ","logsitic":"logistics",
  "warehuse":"warehouse","warehose":"warehouse","wherehouse":"warehouse",
  "suprevisor":"supervisor","supervisior":"supervisor","supervsior":"supervisor",
  "freigth":"freight","frieght":"freight",
  "tranport":"transport","transprot":"transport",
  "recieving":"receiving","reciving":"receiving",
  "planiner":"planner","plannner":"planner",
  "accouns":"accounts","acocunts":"accounts",
  "purchassing":"purchasing","purchacing":"purchasing",
  "cusotmer":"customer","custumer":"customer",
};
const HOURS_POSITIONS_PATTERN = /\b(\d+\.?\d*\s*h(rs?|ours?)(\s*p\.?w\.?|\s*per\s*week)?|\d+\s*x\s*\w+|x\s*\d+\s*(position|role|vacancy|vacancies)?s?|\d+\s*(position|role|vacancy|vacancies)s?|multiple\s*(position|role)s?)\b/gi;

// ── Feedback modal ────────────────────────────────────────────────────────────

function AuthModal({ onClose, onSuccess }) {
  const [tab, setTab]         = useState("login");   // "login" | "signup" | "reset"
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

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

  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13.5, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box", outline: "none" };

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
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
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
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
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

function AILoginWall({ onLogin }) {
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

function ResetPasswordModal({ onClose }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13.5, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box", outline: "none" };

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
            <input type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
            <input type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={inputStyle} />
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

const AI_MOCKUP = [
  { role: "user", text: "Which domain had the most senior roles in my dataset?" },
  { role: "ai",   text: "Based on your dataset, Operations had the highest proportion of Manager and Senior roles (42%), followed by Freight Forwarding (28%). Warehouse roles were predominantly Entry Level and Mid Level." },
  { role: "user", text: "What are the top skills across warehouse roles?" },
  { role: "ai",   text: "The most common skills in Warehouse roles were: Inventory Control, WMS, Forklift Operation, Manual Handling, and Health & Safety Compliance. These appeared in over 60% of warehouse titles." },
];

function AIProWall({ onLogin, isLoggedIn }) {
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 0" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>✨</div>
        <div style={{ fontWeight: 700, fontSize: 20, color: C.text, marginBottom: 6 }}>AI Assistant</div>
        <div style={{ display: "inline-block", padding: "3px 12px", borderRadius: 20, background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Pro Plan Only</div>
        <div style={{ fontSize: 13, color: C.textMuted, maxWidth: 380, margin: "12px auto 0", lineHeight: 1.65 }}>
          After running a Bulk Upload, ask questions about your classified data in plain English.
        </div>
      </div>

      {/* Mockup */}
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

      {/* Upgrade CTA */}
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

function FeedbackModal({ page = "", title = "", result = "", onClose }) {
  const [step, setStep] = useState("rate");   // "rate" | "comment" | "done"
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState("");

  async function handleRate(r) {
    setRating(r);
    setStep("comment");
  }

  function handleSubmit() {
    submitFeedback(rating, comment.trim(), page, title, result); // fire and forget
    setStep("done");
    setTimeout(onClose, 1800);
  }

  function handleSkip() {
    submitFeedback(rating, "", page, title, result); // fire and forget
    setStep("done");
    setTimeout(onClose, 1800);
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 14, padding: "28px 30px", width: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", fontFamily: "inherit" }}>

        {step === "rate" && <>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>Quick feedback</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>How is the tool working for you?</div>
          <div style={{ display: "flex", gap: 12 }}>
            {[["up", "👍", "Works great"], ["down", "👎", "Something's off"]].map(([r, emoji, label]) => (
              <button key={r} onClick={() => handleRate(r)}
                style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontFamily: "inherit", fontSize: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: C.textMuted, transition: "border-color 0.15s" }}>
                {emoji}
                <span style={{ fontSize: 11 }}>{label}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{ marginTop: 16, background: "none", border: "none", fontSize: 12, color: C.textMuted, cursor: "pointer", fontFamily: "inherit", width: "100%", textAlign: "center" }}>Cancel</button>
        </>}

        {step === "comment" && <>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>
            {rating === "up" ? "👍 Glad it's working!" : "👎 Thanks for letting us know"}
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>Anything specific to add? (optional)</div>
          <textarea
            autoFocus
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={300}
            placeholder="e.g. The Transport category is missing X..."
            style={{ width: "100%", boxSizing: "border-box", height: 90, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, padding: "10px 12px", fontFamily: "inherit", resize: "none", outline: "none" }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={handleSkip}
              style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Skip
            </button>
            <button onClick={handleSubmit}
              style={{ flex: 2, padding: "10px 0", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Send Feedback
            </button>
          </div>
        </>}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Thanks for the feedback!</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>It helps us improve the tool.</div>
          </div>
        )}
      </div>
    </div>
  );
}

const SKILL_SYNONYMS = skillConfig.skill_synonyms;

const SKILL_DESCRIPTIONS = {
  "WMS":                      "Warehouse Management System — software used to manage day-to-day warehouse operations including inventory tracking, picking, and dispatch.",
  "TMS":                      "Transport Management System — platform for planning, executing, and optimising the movement of goods.",
  "ERP Systems":              "Enterprise Resource Planning — integrated software (e.g. SAP, Oracle) that manages core business processes across finance, supply chain, and operations.",
  "SAP":                      "SAP ERP — one of the most widely used enterprise platforms in logistics and supply chain management.",
  "CRM":                      "Customer Relationship Management — software for managing customer interactions, sales pipelines, and account data.",
  "Microsoft Excel":          "Spreadsheet tool used for data analysis, reporting, and operational planning in logistics roles.",
  "Microsoft Excel (Advanced)":"Advanced Excel skills including pivot tables, VLOOKUP, macros, and data modelling.",
  "SQL":                      "Structured Query Language — used to query and manage data in relational databases.",
  "S&OP":                     "Sales & Operations Planning — cross-functional process aligning demand forecasts with supply capacity.",
  "MRP":                      "Material Requirements Planning — system for calculating materials and components needed to manufacture products.",
  "EDI":                      "Electronic Data Interchange — standardised electronic communication of business documents (e.g. purchase orders, invoices) between trading partners.",
  "VMI":                      "Vendor Managed Inventory — arrangement where the supplier monitors and replenishes stock on behalf of the buyer.",
  "RF Scanning":              "Radio Frequency scanning — handheld barcode scanning used for inventory tracking and order picking in warehouses.",
  "Forklift Operation":       "Operation of forklift equipment for moving, stacking, and loading goods in a warehouse or DC environment.",
  "Supply Chain Management":  "End-to-end coordination of goods, information, and finances from supplier to customer.",
  "Inventory Control":        "Processes and procedures to maintain accurate stock levels and minimise discrepancies.",
  "Inventory Management":     "Broader management of stock — including ordering, storage, and movement of goods across the supply chain.",
  "KPI":                      "Key Performance Indicators — metrics used to measure and track operational performance.",
  "KPI Management":           "Setting, monitoring, and reporting on KPIs to drive performance improvement.",
  "SOP":                      "Standard Operating Procedures — documented step-by-step instructions for routine operations.",
  "Data Governance":          "Framework for managing data quality, security, and compliance across an organisation.",
  "OHS":                      "Occupational Health & Safety — compliance and practices related to workplace safety.",
  "EHS":                      "Environment, Health & Safety — broader framework covering environmental compliance alongside workplace safety.",
  "SLA":                      "Service Level Agreement — contractual commitments defining expected service standards (e.g. delivery timeframes).",
  // Analytics tools
  "Power BI":                 "Microsoft Power BI — business intelligence tool used for data visualisation and reporting dashboards.",
  "Tableau":                  "Data visualisation platform used to create interactive reports and dashboards from large datasets.",
  "Python":                   "Programming language commonly used for data analysis, automation, and scripting in logistics and supply chain contexts.",
  // Logistics operations
  "Cold Chain":               "Temperature-controlled supply chain management — ensuring goods (e.g. food, pharmaceuticals) are stored and transported within required temperature ranges.",
  "Last Mile Delivery":       "The final stage of the delivery process from a distribution hub to the end customer — a key focus area for cost and customer experience.",
  "Cross-Docking":            "Logistics process where incoming goods are transferred directly to outbound transport with minimal or no storage time.",
  "Pick & Pack":              "Warehouse fulfilment process of selecting items from stock and packaging them for shipment.",
  "3PL Management":           "Management of third-party logistics providers — overseeing outsourced warehousing, transport, and fulfilment operations.",
  // Compliance & certifications
  "Dangerous Goods":          "Handling, documentation, and compliance for hazardous materials (HAZCHEM/HAZMAT) in transport and storage.",
  "HACCP":                    "Hazard Analysis and Critical Control Points — food safety management system identifying and controlling biological, chemical, and physical hazards.",
  "ISO 9001":                 "International standard for quality management systems — demonstrates consistent processes and continuous improvement.",
  "Customs Compliance":       "Knowledge of import/export regulations, tariff classifications, and customs documentation requirements.",
  // Procurement
  "Tender Management":        "Process of issuing RFQs, evaluating supplier bids, and awarding contracts for goods or services.",
  "Vendor Management":        "Building and maintaining relationships with suppliers — covering performance monitoring, onboarding, and risk management.",
  "Contract Negotiation":     "Negotiating and managing commercial agreements with suppliers, carriers, or service providers.",
  // Soft skills
  "Stakeholder Management":   "Engaging and influencing internal and external stakeholders to align on goals and drive outcomes.",
  "Team Leadership":          "Leading, developing, and managing a team to achieve operational goals.",
  "Communication Skills":     "Effective written and verbal communication across teams, clients, and stakeholders.",
  "Continuous Improvement":   "Identifying and implementing incremental process improvements to increase efficiency and reduce waste.",
  "Lean Methodology":         "Operational philosophy focused on eliminating waste and maximising value in processes.",
  "Lean Six Sigma":           "Combined methodology using Lean (waste reduction) and Six Sigma (defect reduction) for process improvement.",
  // Microsoft Office Suite
  "Microsoft Office Suite":   "Core Microsoft productivity tools — Word, Excel, PowerPoint, Outlook, and Teams — widely used in office and admin roles.",
  "Microsoft Word":           "Word processing tool used for drafting documents, reports, and correspondence.",
  "Microsoft PowerPoint":     "Presentation software used to create slides for meetings, reports, and business proposals.",
  "Microsoft Outlook":        "Email and calendar management tool used for scheduling, communication, and task tracking.",
  "Microsoft Teams":          "Collaboration platform for messaging, video calls, and file sharing within organisations.",
  // Google Workspace
  "Google Workspace":         "Google's cloud-based productivity suite — including Gmail, Docs, Sheets, Drive, and Meet.",
  "Google Sheets":            "Cloud-based spreadsheet tool, equivalent to Excel, used for data tracking and reporting.",
  "Google Docs":              "Cloud-based word processing tool for collaborative document creation and editing.",
  // Accounting software
  "Xero":                     "Cloud-based accounting software widely used by SMEs in Australia and New Zealand for invoicing, payroll, and reporting.",
  "MYOB":                     "Australian accounting software used for bookkeeping, payroll, and business financials.",
  "QuickBooks":               "Accounting software used for managing invoices, expenses, payroll, and financial reporting.",
  // Project management tools
  "Project Management":       "Planning, executing, and overseeing projects to deliver on time, on budget, and within scope.",
  "Agile":                    "Iterative project management methodology focused on flexibility, collaboration, and incremental delivery.",
  "Jira":                     "Project tracking tool widely used for managing tasks, sprints, and workflows in Agile teams.",
  "Asana":                    "Work management platform for tracking tasks, projects, and team workloads.",
  "Trello":                   "Visual task management tool using boards and cards to organise and track project progress.",
  "Microsoft Project":        "Project scheduling and planning software used for managing timelines, resources, and dependencies.",
  // HR systems
  "HRIS":                     "Human Resources Information System — software for managing employee records, payroll, and HR processes.",
  "Workday":                  "Cloud-based HR and finance platform used for talent management, payroll, and workforce planning.",
  "Employment Hero":          "HR and payroll platform popular in Australia and New Zealand for onboarding, leave management, and compliance.",
  // General office skills
  "Data Entry":               "Accurate input and management of data into systems, spreadsheets, or databases.",
  "Report Writing":           "Preparing clear, structured reports and summaries for internal or external stakeholders.",
  "Scheduling":               "Coordinating and managing calendars, appointments, and meeting logistics.",
  "Presentation Skills":      "Ability to create and deliver clear, engaging presentations to internal or external audiences.",
  "Problem Solving":          "Identifying issues, analysing root causes, and developing effective solutions.",
  "Time Management":          "Prioritising tasks and managing workload efficiently to meet deadlines.",
  "Attention to Detail":      "Maintaining accuracy and thoroughness in tasks, data, and documentation.",
  "Minute Taking":            "Recording accurate meeting notes and action items for distribution to attendees.",
  "Adaptability":             "Ability to adjust to changing priorities, processes, and environments effectively.",
  "Collaboration":            "Working effectively with cross-functional teams to achieve shared goals.",
};

// ── Core logic ──────────────────────────────────────────────────────────────

function cleanTitle(raw) {
  let t = raw;
  // Strip emoji and special Unicode symbols
  t = t.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/gu, "").trim();
  // Normalize ALL-CAPS titles: if >70% of letters are uppercase, lowercase first
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 0 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7) {
    t = t.toLowerCase();
  }
  for (const p of [...REMOVE_PHRASES, ...REMOVE_SHIFT]) t = t.replace(new RegExp(p, "gi"), "");
  for (const [typo, fix] of Object.entries(TYPO_MAP)) t = t.replace(new RegExp(typo, "gi"), fix);
  t = t.replace(SALARY_PATTERN, "");
  t = t.replace(CONTRACT_DURATION_PATTERN, "");
  t = t.replace(HOURS_POSITIONS_PATTERN, "");
  for (const p of REMOVE_CONTRACT) t = t.replace(new RegExp(`\\b${p}\\b`, "gi"), "");
  t = t.replace(/[-–|,]\s*(NZ|AU|NZL|AUS|NZ\/AU|AU\/NZ|Auckland|Wellington|Christchurch|Hamilton|Dunedin|Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra|Singapore|SGP|London|Manchester|Birmingham|UK|United Kingdom|New York|Los Angeles|Chicago|Houston|US|USA|United States|APAC|ANZ|Remote|Hybrid|On-?site).*/i, "");
  t = t.replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "");
  t = t.replace(/\bSnr\.?\b/gi, "Senior").replace(/\bSr\.?\b/gi, "Senior")
       .replace(/\bJnr\.?\b/gi, "Junior").replace(/\bJr\.?\b/gi, "Junior")
       .replace(/\bMgr\.?\b/gi, "Manager").replace(/\bCoord\.?\b/gi, "Coordinator")
       .replace(/\bAsst\.?\b/gi, "Assistant").replace(/\bSupvr?\.?\b/gi, "Supervisor")
       .replace(/\bDir\.?\b/gi, "Director").replace(/\bExec\.?\b/gi, "Executive")
       .replace(/\bAdmin\.?\b/gi, "Administrator")
       .replace(/\bWhse\.?\b/gi, "Warehouse").replace(/\bWhs\.?\b/gi, "Warehouse")
       .replace(/\bOps\.?\b/gi, "Operations").replace(/\bOp\.?\b/gi, "Operator")
       .replace(/\bSpec\.?\b/gi, "Specialist").replace(/\bAnal\.?\b/gi, "Analyst")
       .replace(/\bBD\b/g, "Business Development")
       .replace(/\bFP&A\b/gi, "Financial Planning & Analysis")
       .replace(/\bAP\/AR\b/gi, "Accounts Payable/Receivable")
       .replace(/\bA\/P\b/gi, "Accounts Payable").replace(/\bA\/R\b/gi, "Accounts Receivable")
       .replace(/\bB2B\b/gi, "Business to Business").replace(/\bB2C\b/gi, "Business to Consumer")
       .replace(/\bGM\b/g, "General Manager").replace(/\bVP\b/g, "Vice President")
       .replace(/\bSVP\b/g, "Senior Vice President").replace(/\bEVP\b/g, "Executive Vice President")
       .replace(/\bCOO\b/g, "Chief Operations Officer").replace(/\bCFO\b/g, "Chief Financial Officer")
       .replace(/\bCTO\b/g, "Chief Technology Officer")
       .replace(/\b3PL\b/gi, "3PL").replace(/\bDC\b/g, "Distribution Centre")
       .replace(/\bInt['']?l\b/gi, "International").replace(/\bNatl\b/gi, "National")
       .replace(/\bTL\b/g, "Team Lead").replace(/\bP&L\b/gi, "P&L");
  t = t.replace(/(\s*[-–]\s*){2,}/g, " - ");
  return t.trim().replace(/\s+/g, " ").replace(/[-–,|&]+$/, "").trim()
          .replace(/\b\w/g, c => c.toUpperCase());
}

function classify(title, description) {
  const tl = title.toLowerCase(), dl = description.toLowerCase();

  // Score every domain — multi-word keywords are more specific, weight them higher
  const domainScores = {};
  const domainMatches = {};
  for (const [domain, kws] of Object.entries(PRIORITY_DOMAIN_RULES)) {
    let score = 0;
    const matched = [];
    for (const kw of kws) {
      if (tl.includes(kw)) {
        const weight = kw.includes(" ") ? kw.split(" ").length : 1;
        score += weight;
        matched.push(kw);
      }
    }
    if (score > 0) { domainScores[domain] = score; domainMatches[domain] = matched; }
  }

  if (Object.keys(domainScores).length > 0) {
    const sorted = Object.entries(domainScores).sort((a, b) => b[1] - a[1]);
    const [bestDomain, bestScore] = sorted[0];
    const secondScore = sorted[1]?.[1] || 0;
    const margin = bestScore - secondScore;
    const confidence =
      bestScore >= 4 && margin >= 2 ? 92 :
      bestScore >= 3 && margin >= 2 ? 88 :
      bestScore >= 2 && margin >= 1 ? 80 :
      margin >= 1 ? 72 : 62;
    return { domain: bestDomain, confidence, source: "title", matchedKeywords: domainMatches[bestDomain] };
  }

  // Fuzzy repair fallback
  for (const [key, domain] of Object.entries(FUZZY_ROLE_REPAIR)) {
    if (tl.includes(key)) {
      if (domain === "Other/Noise")
        return { domain, confidence: 30, source: "fuzzy", matchedKeywords: [key], noiseReason: "fuzzy_noise", noiseKeyword: key };
      return { domain, confidence: 74, source: "fuzzy", matchedKeywords: [key] };
    }
  }

  // Description fallback — also weighted
  if (description.length > 0) {
    const descScores = {};
    for (const [domain, kws] of Object.entries(PRIORITY_DOMAIN_RULES))
      for (const kw of kws)
        if (dl.includes(kw)) descScores[domain] = (descScores[domain] || 0) + (kw.includes(" ") ? kw.split(" ").length : 1);
    if (Object.keys(descScores).length > 0) {
      const best = Object.entries(descScores).sort((a, b) => b[1] - a[1])[0];
      const score = best[1];
      const confidence = score >= 4 ? 72 : score >= 2 ? 65 : 58;
      return { domain: best[0], confidence, source: "description", matchedKeywords: [] };
    }
  }

  return { domain: "Other/Noise", confidence: 30, source: "unmatched", matchedKeywords: [], noiseReason: "no_match" };
}

const CROSS_FUNCTIONAL_PAIRS = [
  { a: "warehouse",        b: "dispatch",         flag: "Cross-functional signal: Warehouse + Dispatch — may span multiple domains" },
  { a: "customer service", b: "logistics",        flag: "Cross-functional signal: Customer Service + Logistics — role scope may be broad" },
  { a: "transport",        b: "warehouse",        flag: "Cross-functional signal: Transport + Warehouse — dual-function role detected" },
  { a: "freight",          b: "customer",         flag: "Cross-functional signal: Freight + Customer-facing — may span Freight Forwarding and Sales" },
  { a: "customer service", b: "dispatch",         flag: "Cross-functional signal: Customer Service + Dispatch — may bridge Sales and Transport" },
];

function getSeniority(title) {
  const t = title.toLowerCase();
  for (const [key, label] of Object.entries(LEVEL_MAPPING)) if (t.includes(key)) return label;
  return "Mid Level";
}

function getWorkNature(title) {
  const t = title.toLowerCase();
  for (const [nature, kws] of Object.entries(WORK_NATURE_MAPPING))
    for (const kw of kws) if (t.includes(kw)) return nature;
  return "Operational";
}

function getSkills(domain, description) {
  const base = [...(DOMAIN_SKILL_FIXED[domain] || [])];
  const dl = description.toLowerCase(), extra = [];
  for (const [raw, norm] of Object.entries(SKILL_SYNONYMS))
    if (dl.includes(raw) && !base.includes(norm) && !extra.includes(norm)) extra.push(norm);
  return [...base, ...extra].slice(0, 6);
}

function analyze(rawTitle, description, country) {
  const clean = cleanTitle(rawTitle);
  const { domain: rawDomain, confidence, source, matchedKeywords = [], noiseReason, noiseKeyword } = classify(rawTitle, description);

  const outOfScope = rawDomain === "Other/Noise" || rawDomain === "Out of scope";
  const domain = outOfScope ? "Out of scope" : rawDomain;

  const seniority = outOfScope ? "Review Required" : getSeniority(rawTitle);
  const nature    = outOfScope ? "Review Required" : getWorkNature(rawTitle);
  const skills    = outOfScope ? [] : getSkills(domain, description);

  const flags = [];
  if (outOfScope)
    flags.push("This does not appear to be a logistics-related job title.");
  else if (source === "fuzzy_generic")
    flags.push("Title is too generic. Add logistics, warehouse, freight, transport, procurement, or supply chain context for better classification.");
  if (source === "description") flags.push("Domain inferred from description only — title keyword was ambiguous");
  if (!outOfScope && description.length < 30) flags.push("Description is short — output is based mainly on title text");
  if (rawTitle.length > 60) flags.push("Title is long — may contain location, shift, or contract noise");

  const combined = (rawTitle + " " + description).toLowerCase();
  for (const { a, b, flag } of CROSS_FUNCTIONAL_PAIRS)
    if (combined.includes(a) && combined.includes(b)) flags.push(flag);
  const hasCrossFlag = CROSS_FUNCTIONAL_PAIRS.some(({ a, b }) => combined.includes(a) && combined.includes(b));
  const needsReview = outOfScope || confidence < 70 || hasCrossFlag;

  // salary_note: separate from classification flags
  let salaryNote = null;
  if (outOfScope)
    salaryNote = "Salary benchmark is not available because this title appears to be outside the logistics scope.";
  else if (confidence < 55)
    salaryNote = "Salary benchmark unavailable for low-confidence matches.";
  else if (!country)
    salaryNote = "Select New Zealand or Australia to view salary reference.";

  return { cleanTitle: clean, domain, nature, seniority, skills, confidence, flags, hasCrossFlag, needsReview, out_of_scope: outOfScope, salaryNote, matchedKeywords, noiseReason, noiseKeyword };
}

// ── File parsing ─────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const fields = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim()); current = "";
    } else { current += ch; }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("File appears to be empty or has no data rows.");
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return row;
  }).filter(row => headers.some(h => row[h]));
  return { headers, rows };
}

function parseXLSX(buffer, sheetName = null) {
  const wb = XLSX.read(buffer, { type: "array" });
  const name = sheetName || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!data.length) throw new Error("File appears to be empty.");
  const headers = data[0].map(h => String(h).trim()).filter(h => h);
  const rows = data.slice(1)
    .filter(row => row.some(v => String(v).trim()))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = String(row[i] ?? "").trim(); });
      return obj;
    });
  if (!rows.length) throw new Error("File has headers but no data rows.");
  return { headers, rows };
}

// ── Column auto-detection ────────────────────────────────────────────────────

const RAW_TITLE_ALIASES  = ["raw_title","rawtitle","raw title","title","job title","job_title","jobtitle","position","role","job","position title","job name"];
const DESC_ALIASES       = ["description","desc","job description","job_description","jobdescription","responsibilities","details","job desc","summary"];
const COUNTRY_ALIASES    = ["country","location","region","market","country/region","geo"];

function detectColumns(headers) {
  const hl = headers.map(h => h.toLowerCase().trim());
  const find = (aliases) => {
    for (const alias of aliases) {
      const idx = hl.indexOf(alias);
      if (idx !== -1) return headers[idx];
    }
    return null;
  };
  return { rawTitle: find(RAW_TITLE_ALIASES), description: find(DESC_ALIASES), country: find(COUNTRY_ALIASES) };
}

// ── Export utilities ─────────────────────────────────────────────────────────

const EXPORT_FIELDS = ["raw_title","clean_title","domain","work_nature","seniority","confidence","status","out_of_scope","needs_review","skills","flags","salary_note","country","salary_range","salary_min","salary_max","salary_median"];

function isOutOfScope(r) {
  return r.out_of_scope || r.domain === "Other/Noise" || r.domain === "Out of scope";
}

function getStatusLabel(r) {
  if (isOutOfScope(r))   return "Out of scope";
  if (r.confidence < 55) return "Low confidence";
  if (r.needsReview)     return "Review recommended";
  return "Good match";
}

function buildExportRow(r) {
  const sb = r.salaryBenchmark || r.salary_benchmark || null;
  const low  = sb ? Math.round(sb.median * 0.88 / 1000) * 1000 : null;
  const high = sb ? Math.round(sb.median * 1.12 / 1000) * 1000 : null;
  return {
    raw_title:    r.raw || r.raw_title || "",
    clean_title:  r.cleanTitle || r.clean_title || "",
    domain:       r.domain || "",
    work_nature:  r.nature || r.work_nature || "",
    seniority:    r.seniority || "",
    confidence:   `${r.confidence}%`,
    status:       getStatusLabel(r),
    out_of_scope: isOutOfScope(r) ? "Yes" : "No",
    needs_review: r.needsReview || r.needs_review ? "Yes" : "No",
    skills:       (r.skills || []).join("; "),
    flags:        (r.flags || []).join(" | "),
    salary_note:  r.salaryNote || r.salary_note || "",
    country:      r.country || "",
    salary_range: sb?.range || "",
    salary_min:   low ? `${sb.currency} ${low.toLocaleString()}` : "",
    salary_max:   high ? `${sb.currency} ${high.toLocaleString()}` : "",
    salary_median: sb ? `${sb.currency} ${sb.median.toLocaleString()}` : "",
  };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doDownloadCSV(results, filename = "logistics_structured.csv") {
  const rows = results.map(buildExportRow);
  const header = EXPORT_FIELDS.join(",");
  const lines = rows.map(r =>
    EXPORT_FIELDS.map(f => {
      const v = String(r[f] ?? "");
      return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")
  );
  triggerDownload(new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" }), filename);
}

function doDownloadJSON(results, filename = "logistics_structured.json") {
  const rows = results.map(r => {
    const sb = r.salaryBenchmark || r.salary_benchmark || null;
    const low  = sb ? Math.round(sb.median * 0.88 / 1000) * 1000 : null;
    const high = sb ? Math.round(sb.median * 1.12 / 1000) * 1000 : null;
    return {
      raw_title:    r.raw || r.raw_title || "",
      clean_title:  r.cleanTitle || r.clean_title || "",
      domain:       r.domain || "",
      work_nature:  r.nature || r.work_nature || "",
      seniority:    r.seniority || "",
      confidence:   r.confidence,
      status:       getStatusLabel(r),
      out_of_scope: isOutOfScope(r),
      needs_review: !!(r.needsReview || r.needs_review),
      skills:       r.skills || [],
      flags:        r.flags || [],
      salary_note:  r.salaryNote || r.salary_note || null,
      country:      r.country || "",
      salary_range: sb?.range || null,
      salary_min:   low,
      salary_max:   high,
      salary_median:   sb?.median || null,
      salary_currency: sb?.currency || null,
    };
  });
  triggerDownload(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), filename);
}

function doDownloadXLSX(results, filename = "logistics_structured.xlsx") {
  const rows = results.map(buildExportRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_FIELDS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Structured Output");
  XLSX.writeFile(wb, filename);
}

// ── Hooks ───────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ── Design system ───────────────────────────────────────────────────────────

const spinnerKeyframes = `
@keyframes spin { to { transform: rotate(360deg); } }
`;
if (typeof document !== "undefined" && !document.getElementById("spinner-style")) {
  const s = document.createElement("style");
  s.id = "spinner-style";
  s.textContent = spinnerKeyframes;
  document.head.appendChild(s);
}

function Spinner({ size = 24, color = "#3b6ef5" }) {
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

const C = {
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

function Badge({ tone = "blue", children, size = "sm", variant = "pill" }) {
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

function Card({ children, style = {}, highlight }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${highlight ? C.accentBorder : C.border}`, borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...style }}>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>{children}</div>;
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: C.text, margin: 0 }}>{children}</h1>
      {sub && <p style={{ color: C.textMuted, margin: "5px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

function matchConfidenceLabel(value) {
  if (value >= 85) return { label: "High",                      text: C.green, bar: C.green };
  if (value >= 70) return { label: "Medium — review recommended", text: C.amber, bar: C.amber };
  if (value >= 55) return { label: "Low — review recommended",    text: C.amber, bar: C.amber };
  return               { label: "Uncertain",                    text: C.red,   bar: C.red };
}

function ConfidenceBar({ value }) {
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

function domainTone(d) {
  return { "Warehouse":"blue","Transport":"blue","Freight Forwarding":"blue","Planning":"green",
           "Operations":"blue","Finance":"amber","Sales":"green","IT Support":"slate",
           "Business Administration":"slate","Other/Noise":"red","Out of scope":"red" }[d] || "gray";
}

function seniorityTone(label) {
  if (label === "Executive") return "red";
  if (label === "Manager")   return "amber";
  if (label === "Senior")    return "green";
  if (label === "Mid Level") return "blue";
  return "gray";
}

const inputStyle = {
  width: "100%", padding: "10px 13px", borderRadius: 8,
  border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none",
  boxSizing: "border-box", fontFamily: "inherit", background: C.card, color: C.text, lineHeight: 1.5,
};

// ── Landing Page ─────────────────────────────────────────────────────────────

function LandingPage({ onEnter }) {
  const isMobile = useIsMobile();
  const features = [
    { icon: "✏️", title: "Clean Titles",       desc: "Removes noise, expands abbreviations, strips location and shift suffixes automatically." },
    { icon: "🏷️", title: "Classify Roles",     desc: "Suggests functional area, seniority level, and work nature using a rule-based taxonomy." },
    { icon: "🧩", title: "Normalize Skills",   desc: "Maps raw skill phrases like 'WMS software' or 'advanced excel' to standard canonical labels." },
    { icon: "📂", title: "Bulk Processing",    desc: "Upload CSV or XLSX files. Row limits depend on your plan (100 rows on Guest, 1,000 on Basic, 10,000 on Pro)." },
    { icon: "📈", title: "Data Analysis",      desc: "Auto-generate charts — domain distribution, seniority breakdown, top skills, and salary reference fields where available. Export as PNG or PDF." },
    { icon: "✨", title: "AI Assistant",       desc: "Ask questions about your classified data in plain English. Hiring trends, skill gaps, salary comparisons and more. Pro plan." },
  ];

  const audiences = ["Recruiters cleaning job ad data", "HR teams standardizing job title libraries", "Analysts normalizing workforce data", "Operations teams building role taxonomies"];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Nav */}
      <div style={{ padding: "18px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, border: "1px solid rgba(255,255,255,0.2)" }}>📦</div>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>Logititles</span>
        </div>
        <button onClick={() => onEnter()} style={{ padding: "9px 22px", borderRadius: 8, background: "#fff", color: "#4f46e5", border: "none", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}>
          Enter App →
        </button>
      </div>

      {/* Hero */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 24px 56px", textAlign: "center" }}>
        <div style={{ display: "inline-block", padding: "4px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "#c7d2fe", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 28 }}>
          Workflow Utility Tool · Logistics
        </div>
        <h1 style={{ color: "#fff", fontSize: 46, fontWeight: 800, maxWidth: 680, lineHeight: 1.18, margin: "0 0 22px", letterSpacing: "-0.02em" }}>
          Turn messy logistics job titles into structured data
        </h1>
        <p style={{ color: "#c7d2fe", fontSize: 17, maxWidth: 540, lineHeight: 1.75, margin: "0 0 38px" }}>
          A rule-based workflow tool that cleans and structures messy logistics job titles into reviewable, export-ready data.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => onEnter()} style={{ padding: "13px 32px", borderRadius: 9, background: "#fff", color: "#4f46e5", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em" }}>
            Enter App →
          </button>
          <button onClick={() => onEnter("analyzer")} style={{ padding: "13px 28px", borderRadius: 9, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            Try Single Analyzer
          </button>
        </div>
      </div>

      {/* Feature grid */}
      <div style={{ padding: isMobile ? "0 20px 40px" : "0 48px 56px", maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14 }}>
          {features.map(({ icon, title, desc }) => (
            <div key={title} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
              <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 14, marginBottom: 7 }}>{title}</div>
              <div style={{ color: "#c7d2fe", fontSize: 13, lineHeight: 1.65 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Who it's for */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.1)", padding: "28px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: "#a5b4fc", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 8 }}>Built for:</span>
        {audiences.map((a, i) => (
          <span key={i} style={{ color: "#e0e7ff", fontSize: 13, padding: "4px 14px", background: "rgba(255,255,255,0.08)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)" }}>{a}</span>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 48px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>© 2026 Logititles · logititles@gmail.com</span>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <a href="https://www.logititles.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textDecoration: "underline" }}>logititles.com</a>
            <button onClick={() => { onEnter("privacy"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>Privacy Policy</button>
            <button onClick={() => { onEnter("terms"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>Terms of Service</button>
          </div>
        </div>
        <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, lineHeight: 1.6, textAlign: "center" }}>
          Logititles is currently in beta. Plan limits, pricing, and features may change as the product develops.
          Please use sample, public, or anonymised data — avoid uploading confidential, personal, or sensitive company data.
          Logititles is an independent personal project and is not affiliated with SEEK, Indeed, LINZ, or any external job platform.
        </p>
      </div>
    </div>
  );
}

// ── Page 1: Single Analyzer ─────────────────────────────────────────────────

const SA_EXAMPLES = [
  "Sr. Freight Coordinator – FCL/LCL (NZ)",
  "Ops Mgr 3PL Warehouse [Contract]",
  "Customs Clearance / Import Export Officer",
  "Retail Health Consultant",
  "Demand Planner - APAC",
  "BD Executive Last Mile AU",
];

const ANALYZER_GUEST_LIMIT = 10;
const ANALYZER_LS_KEY = "analyzer_usage";

function getGuestUsage() {
  try {
    const raw = localStorage.getItem(ANALYZER_LS_KEY);
    if (!raw) return { count: 0, date: new Date().toDateString() };
    const parsed = JSON.parse(raw);
    if (parsed.date !== new Date().toDateString()) return { count: 0, date: new Date().toDateString() };
    return parsed;
  } catch { return { count: 0, date: new Date().toDateString() }; }
}

function incrementGuestUsage() {
  const usage = getGuestUsage();
  usage.count += 1;
  localStorage.setItem(ANALYZER_LS_KEY, JSON.stringify(usage));
  return usage.count;
}

function SingleAnalyzer({ onAskAI, user, planKey = "guest", onLogin,
  savedTitle = "", savedDesc = "", savedCountry = "", savedResult = null,
  onSaveState }) {
  const isMobile = useIsMobile();
  const [title, setTitle]   = useState(savedTitle);
  const [desc, setDesc]     = useState(savedDesc);
  const [country, setCountry] = useState(savedCountry);
  const [result, setResult] = useState(savedResult);
  const [loading, setLoading] = useState(false);
  const [guestUsage, setGuestUsage] = useState(() => getGuestUsage());

  // Persist state to parent whenever key fields change
  useEffect(() => {
    onSaveState?.({ title, desc, country, result });
  }, [title, desc, country, result]);

  const isGuest = !user;
  const guestBlocked = isGuest && guestUsage.count >= ANALYZER_GUEST_LIMIT;

  async function run() {
    if (!title.trim() || loading) return;
    if (guestBlocked) return;
    if (isGuest) {
      const newCount = incrementGuestUsage();
      setGuestUsage({ count: newCount, date: new Date().toDateString() });
    }
    setLoading(true); setResult(null);
    const apiResult = await analyzeViaAPI(title, desc, country);
    setResult(apiResult ?? { ...analyze(title, desc, country), source: "local" });
    setLoading(false);
  }

  return (
    <div>
      <SectionTitle children="Single Analyzer" sub="Paste a messy logistics job title — get a clean, structured, reviewable draft output." />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* Input */}
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 18 }}>Input</div>

          <div style={{ marginBottom: 15 }}>
            <FieldLabel>Job Title *</FieldLabel>
            <input value={title} onChange={e => { setTitle(e.target.value); setResult(null); }}
              onKeyDown={e => e.key === "Enter" && run()}
              placeholder="e.g. Sr. Freight Coordinator – FCL/LCL (NZ)"
              style={inputStyle} />
          </div>

          <div style={{ marginBottom: 15 }}>
            <FieldLabel>Job Description <span style={{ fontWeight: 400, color: C.textMuted }}>optional — improves classification</span></FieldLabel>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Paste key responsibilities or requirements here..."
              rows={5} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Country <span style={{ fontWeight: 400, color: C.textMuted }}>optional</span></FieldLabel>
            <select value={country} onChange={e => setCountry(e.target.value)} style={{ ...inputStyle }}>
              <option value="">— Select country —</option>
              <option>New Zealand</option><option>Australia</option>
            </select>
          </div>

          {isGuest && (
            <div style={{ marginBottom: 14, padding: "9px 13px", borderRadius: 8, background: guestBlocked ? "#fef2f2" : "#fffbeb", border: `1px solid ${guestBlocked ? "#fca5a5" : "#fde68a"}`, fontSize: 12, color: guestBlocked ? "#b91c1c" : "#92400e" }}>
              {guestBlocked
                ? <>Daily limit reached (10/10). <button onClick={onLogin} style={{ background: "none", border: "none", color: C.accent, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 12 }}>Sign in</button> for unlimited access.</>
                : <>Guest: {guestUsage.count}/{ANALYZER_GUEST_LIMIT} free analyses today. <button onClick={onLogin} style={{ background: "none", border: "none", color: C.accent, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 12 }}>Sign in</button> to remove limit.</>
              }
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={run} disabled={!title.trim() || loading || guestBlocked}
              style={{ flex: 1, padding: "12px", borderRadius: 8, background: (title.trim() && !guestBlocked) ? C.accent : "#d1d5db", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: (title.trim() && !guestBlocked) ? "pointer" : "default", fontFamily: "inherit" }}>
              {loading ? "Processing…" : guestBlocked ? "Daily limit reached" : "Analyze →"}
            </button>
            {(title || desc || country || result) && (
              <button onClick={() => { setTitle(""); setDesc(""); setCountry(""); setResult(null); }}
                style={{ padding: "12px 16px", borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Clear
              </button>
            )}
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 9, fontWeight: 600 }}>TRY AN EXAMPLE</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SA_EXAMPLES.map(ex => (
                <button key={ex} onClick={() => { setTitle(ex); setDesc(""); setResult(null); }}
                  style={{ padding: "4px 11px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
                  {ex.length > 33 ? ex.slice(0, 33) + "…" : ex}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Output */}
        <div>
          {!result && !loading && (
            <Card style={{ background: C.bg, minHeight: 340, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: C.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>📋</div>
              <div style={{ fontSize: 13 }}>Structured output will appear here</div>
            </Card>
          )}
          {loading && (
            <Card style={{ background: C.bg, minHeight: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: C.textMuted }}>
              <Spinner size={32} />
              <div style={{ fontSize: 13 }}>Analyzing…</div>
            </Card>
          )}
          {result && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {result.source === "local" && (
                <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#78350f" }}>
                  ⚠ API unavailable — result from local classifier. Accuracy may differ from the Python engine.
                </div>
              )}
              {isOutOfScope(result) && (
                <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "16px 18px" }}>
                  <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 13, marginBottom: 6 }}>✗ Out of scope — not a logistics role</div>
                  <div style={{ fontSize: 12, color: "#7f1d1d", lineHeight: 1.7 }}>
                    No logistics or supply chain signal was found in this title or description.
                    <br />
                    <span style={{ color: "#991b1b" }}>What you can do:</span> If this is actually a logistics-adjacent role, try adding a job description with relevant context.
                  </div>
                </div>
              )}
              <Card highlight={!isOutOfScope(result)}>
                <FieldLabel>Clean Title</FieldLabel>
                <div style={{ fontSize: 19, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{result.cleanTitle}</div>
                {result.cleanTitle.toLowerCase().replace(/\s/g,"") !== title.toLowerCase().replace(/\s/g,"") && (
                  <div style={{ marginTop: 6, fontSize: 11, color: C.textMuted }}>
                    Original: <span style={{ fontFamily: "monospace", background: C.pill, padding: "1px 5px", borderRadius: 4 }}>{title}</span>
                  </div>
                )}
              </Card>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Card style={{ padding: 16 }}>
                  <FieldLabel>Suggested Functional Area</FieldLabel>
                  <Badge tone={domainTone(result.domain)}>{result.domain}</Badge>
                  {result.matchedKeywords?.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted }}>
                      Matched on: {result.matchedKeywords.map(k => (
                        <span key={k} style={{ fontFamily: "monospace", background: C.pill, padding: "1px 5px", borderRadius: 4, marginRight: 4 }}>{k}</span>
                      ))}
                    </div>
                  )}
                </Card>
                <Card style={{ padding: 16 }}>
                  <FieldLabel>Suggested Work Nature</FieldLabel>
                  <Badge tone={result.nature === "Review Required" ? "gray" : "slate"}>{result.nature}</Badge>
                </Card>
                <Card style={{ padding: 16 }}>
                  <FieldLabel>Suggested Seniority</FieldLabel>
                  <Badge tone={seniorityTone(result.seniority)} variant="tag">{result.seniority}</Badge>
                </Card>
              </div>
              {result.salaryBenchmark ? (
                <Card style={{ padding: 18 }}>
                  <FieldLabel>Salary Benchmark <span style={{ fontWeight: 400, color: C.textMuted }}>— market reference only</span></FieldLabel>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{result.salaryBenchmark.range}</span>
                    <span style={{ fontSize: 12, color: C.textMuted }}>/ year</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: C.textMuted }}>
                    Median: {result.salaryBenchmark.currency} ${result.salaryBenchmark.median.toLocaleString()} · Range ±12%
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: C.textMuted, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                    Market estimate only. Not financial or HR advice. Actual salaries vary by employer, experience, and location.
                  </div>
                </Card>
              ) : (result.salaryNote || result.salary_note) ? (
                <Card style={{ padding: 18, opacity: 0.75 }}>
                  <FieldLabel>Salary Benchmark</FieldLabel>
                  <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{result.salaryNote || result.salary_note}</div>
                </Card>
              ) : null}
              <Card style={{ padding: 18 }}>
                <FieldLabel>Normalized Skills</FieldLabel>
                {result.skills.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
                    {result.skills.map(s => (
                      <span key={s} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, background: C.pill, color: C.pillText, fontWeight: 500, border: `1px solid ${C.border}` }}>{s}</span>
                    ))}
                  </div>
                ) : <span style={{ fontSize: 13, color: C.textMuted }}>No skills mapped — outside logistics scope</span>}
              </Card>
              <Card style={{ padding: 18 }}>
                <ConfidenceBar value={result.confidence} />
              </Card>
              {result.flags.length > 0 && (
                <Card style={{ padding: 18 }}>
                  <FieldLabel>Review Flags</FieldLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {result.flags.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "9px 13px", fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
                        <span style={{ flexShrink: 0, marginTop: 1 }}>⚑</span><span>{f}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
                    Ambiguous titles may be classified using description context when available.
                  </div>
                </Card>
              )}
              {onAskAI && (
                <div style={{ textAlign: "center", paddingTop: 4 }}>
                  <button onClick={() => onAskAI({ ...result, raw_title: title })}
                    style={{ padding: "9px 22px", borderRadius: 8, border: `1.5px solid ${C.accent}`, background: C.accentLight, color: C.accent, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    ✨ Ask AI about this result
                  </button>
                </div>
              )}
              <InlineFeedback title={title} result={result} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineFeedback({ title, result }) {
  const [sent, setSent] = useState(null); // null | "up" | "down"

  function handleRate(r) {
    setSent(r);
    const domain = typeof result === "object" ? result.domain : result;
    submitFeedback(r, "", "single", title, domain, {
      confidence:   typeof result === "object" ? result.confidence : null,
      status:       typeof result === "object" ? getStatusLabel(result) : null,
      out_of_scope: typeof result === "object" ? isOutOfScope(result) : null,
    });
  }

  if (sent) {
    return (
      <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center", padding: "10px 0" }}>
        {sent === "up" ? "👍 Thanks!" : "👎 Got it, we'll review this."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", padding: "6px 0" }}>
      <span style={{ fontSize: 12, color: "#6b7280" }}>Was this classification correct?</span>
      {[["up", "👍"], ["down", "👎"]].map(([r, emoji]) => (
        <button key={r} onClick={() => handleRate(r)}
          style={{ background: "none", border: `1px solid #374151`, borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 14, color: "#9ca3af", fontFamily: "inherit" }}>
          {emoji}
        </button>
      ))}
    </div>
  );
}

// ── Page 2: Bulk Upload ─────────────────────────────────────────────────────

const DOMAIN_PALETTE = [
  "#3b6ef5","#16a34a","#d97706","#dc2626","#7c3aed",
  "#0891b2","#db2777","#65a30d","#ea580c","#6b7280",
];

function ResultCharts({ results }) {
  const chartRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  async function downloadPNG() {
    if (!chartRef.current) return;
    setExporting(true);
    const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: "#ffffff" });
    const link = document.createElement("a");
    link.download = "logititles_analysis.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    setExporting(false);
  }

  async function downloadPDF() {
    if (!chartRef.current) return;
    setExporting(true);

    const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const pageW = 841.89, pageH = 595.28; // A4 landscape in pts
    const margin = 32;
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    // ── Page 1: Summary ──────────────────────────────────────────────
    const today = new Date().toLocaleDateString("en-NZ", { year: "numeric", month: "long", day: "numeric" });
    const total = results.length;
    const structured = results.filter(r => !r.needsReview && !isOutOfScope(r)).length;
    const review = results.filter(r => r.needsReview && !isOutOfScope(r)).length;
    const outOfScope = results.filter(r => isOutOfScope(r)).length;

    const domainCounts = {};
    const skillCounts = {};
    const domainSalary = {};
    results.forEach(r => {
      if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
      (r.skills || []).forEach(s => { skillCounts[s] = (skillCounts[s] || 0) + 1; });
      if (r.salaryBenchmark?.median && r.domain && !isOutOfScope(r)) {
        if (!domainSalary[r.domain]) domainSalary[r.domain] = [];
        domainSalary[r.domain].push(r.salaryBenchmark.median);
      }
    });
    const topDomains = Object.entries(domainCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([d,c]) => `${d} (${c})`);
    const topSkills = Object.entries(skillCounts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([s]) => s);
    const topSalaryDomain = Object.entries(domainSalary)
      .map(([d, vals]) => [d, Math.round(vals.reduce((a,b) => a+b,0)/vals.length)])
      .sort((a,b) => b[1]-a[1])[0];

    // Header bar
    pdf.setFillColor(59, 110, 245);
    pdf.rect(0, 0, pageW, 52, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.text("Logititles — Classification Report", margin, 34);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(today, pageW - margin, 34, { align: "right" });

    // Summary section title
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.text("Summary", margin, 80);

    // Stats row
    const stats = [
      { label: "Total Records", value: String(total), color: [59, 110, 245] },
      { label: "Structured", value: String(structured), color: [22, 163, 74] },
      { label: "Review Required", value: String(review), color: [217, 119, 6] },
      { label: "Out of Scope", value: String(outOfScope), color: [220, 38, 38] },
    ];
    const boxW = (pageW - margin * 2 - 24) / 4;
    stats.forEach(({ label, value, color }, i) => {
      const x = margin + i * (boxW + 8);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(x, 92, boxW, 52, 4, 4, "F");
      pdf.setTextColor(...color);
      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text(value, x + 12, 120);
      pdf.setTextColor(107, 114, 128);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(label, x + 12, 134);
    });

    // Insights
    let y = 168;
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(17, 24, 39);
    pdf.text("Key Insights", margin, y); y += 18;

    const insights = [
      `Top domains: ${topDomains.join(", ")}`,
      `Most common skills: ${topSkills.join(", ")}`,
      topSalaryDomain ? `Highest avg salary: ${topSalaryDomain[0]} — NZD $${topSalaryDomain[1].toLocaleString()}` : null,
      `Classification rate: ${total > 0 ? Math.round((structured / total) * 100) : 0}% structured successfully`,
    ].filter(Boolean);

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(55, 65, 81);
    insights.forEach(line => {
      pdf.text(`• ${line}`, margin + 8, y);
      y += 16;
    });

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    pdf.text("Generated by Logititles · logititles.com · Market estimates only, not financial advice.", margin, pageH - 16);

    // ── Page 2: Charts ───────────────────────────────────────────────
    pdf.addPage();
    pdf.setFillColor(59, 110, 245);
    pdf.rect(0, 0, pageW, 52, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.text("Logititles — Data Analysis Charts", margin, 34);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(today, pageW - margin, 34, { align: "right" });

    const chartY = 60;
    const chartH = pageH - chartY - 24;
    const chartW = pageW - margin * 2;
    const ratio = canvas.width / canvas.height;
    const finalH = Math.min(chartH, chartW / ratio);
    const finalW = finalH * ratio;
    pdf.addImage(imgData, "PNG", margin, chartY, finalW, finalH);
    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    pdf.text("Generated by Logititles · logititles.com · Market estimates only, not financial advice.", margin, pageH - 16);

    pdf.save("logititles_report.pdf");
    setExporting(false);
  }

  const domainCounts = {};
  const seniorityCounts = {};
  const skillCounts = {};
  const domainSalary = {};

  const noiseCount = results.filter(r => isOutOfScope(r)).length;

  results.forEach(r => {
    if (isOutOfScope(r)) return; // exclude out-of-scope from all charts
    if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
    if (r.seniority) seniorityCounts[r.seniority] = (seniorityCounts[r.seniority] || 0) + 1;
    (r.skills || []).forEach(s => { skillCounts[s] = (skillCounts[s] || 0) + 1; });
    if (r.salaryBenchmark?.median && r.domain) {
      if (!domainSalary[r.domain]) domainSalary[r.domain] = [];
      domainSalary[r.domain].push(r.salaryBenchmark.median);
    }
  });

  const domainData = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const seniorityOrder = ["Executive","Manager","Senior","Mid Level","Entry Level","Unknown"];
  const seniorityData = seniorityOrder
    .filter(s => seniorityCounts[s])
    .map(s => ({ name: s, value: seniorityCounts[s] }));

  const topSkillsData = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  const salaryData = Object.entries(domainSalary)
    .map(([domain, medians]) => ({
      name: domain,
      median: Math.round(medians.reduce((a, b) => a + b, 0) / medians.length),
    }))
    .sort((a, b) => b.median - a.median);

  const noiseRatio = results.length > 0 ? noiseCount / results.length : 0;

  return (
    <Card style={{ padding: "20px 24px" }}>
      {noiseCount > 0 && (
        <div style={{ marginBottom: 16, padding: "10px 16px", background: "#f1f5f9", borderRadius: 8, border: `1px solid #cbd5e1`, fontSize: 12, color: "#475569" }}>
          ℹ <strong>{noiseCount} out-of-scope row{noiseCount !== 1 ? "s" : ""} excluded from logistics analysis.</strong>
          {noiseRatio > 0.3 && <span> ({Math.round(noiseRatio * 100)}% of dataset — consider reviewing your data or adding a description column.)</span>}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Data Analysis</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={downloadPNG} disabled={exporting}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 12, fontWeight: 600, color: C.textSub, cursor: exporting ? "default" : "pointer", fontFamily: "inherit" }}>
            {exporting ? "Exporting…" : "⬇ PNG"}
          </button>
          <button onClick={downloadPDF} disabled={exporting}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 12, fontWeight: 600, color: C.textSub, cursor: exporting ? "default" : "pointer", fontFamily: "inherit" }}>
            {exporting ? "Exporting…" : "⬇ PDF"}
          </button>
        </div>
      </div>
      <div ref={chartRef}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>

        {/* Domain bar chart */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Domain Distribution</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={domainData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: C.textMuted }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text }} axisLine={false} tickLine={false} width={130} />
              <Tooltip formatter={(v) => [v, "Count"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {domainData.map((_, i) => <Cell key={i} fill={DOMAIN_PALETTE[i % DOMAIN_PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Seniority pie chart */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Seniority Breakdown</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={seniorityData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
                {seniorityData.map((_, i) => <Cell key={i} fill={DOMAIN_PALETTE[i % DOMAIN_PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: C.text }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Skills */}
        {topSkillsData.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Top Skills in Dataset</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topSkillsData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: C.textMuted }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text }} axisLine={false} tickLine={false} width={150} />
                <Tooltip formatter={(v) => [v, "Count"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={C.accent} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Salary by Domain */}
        {salaryData.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Avg Salary Benchmark by Domain (NZD)</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={salaryData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: C.textMuted }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text }} axisLine={false} tickLine={false} width={130} />
                <Tooltip formatter={(v) => [`NZD $${v.toLocaleString()}`, "Avg Median"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
                <Bar dataKey="median" radius={[0, 4, 4, 0]} fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
      </div>
    </Card>
  );
}

function BulkAIBubble({ results }) {
  const [open, setOpen] = useState(false);
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
    const domainCounts = {};
    const skillCounts = {};
    const inScope = results.filter(r => !isOutOfScope(r));
    const lowConf  = inScope.filter(r => r.confidence < 55).length;
    inScope.forEach(r => {
      if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
      (r.skills || []).forEach(s => { skillCounts[s] = (skillCounts[s] || 0) + 1; });
    });
    const topDomains = Object.entries(domainCounts).sort((a,b) => b[1]-a[1]).map(([d,c]) => `${d}: ${c}`).join(", ");
    const topSkills = Object.entries(skillCounts).sort((a,b) => b[1]-a[1]).slice(0,8).map(([s,c]) => `${s}(${c})`).join(", ");
    const total = results.length;
    const outOfScope = results.filter(r => isOutOfScope(r)).length;
    return `Dataset summary: ${total} records total. Out-of-scope (excluded from analysis): ${outOfScope}. Low-confidence rows (review recommended): ${lowConf}. All domain/skill counts below exclude out-of-scope rows. Domain breakdown (in-scope only): ${topDomains}. Top skills (in-scope only): ${topSkills}. When answering questions about domains or skills, always specify you are excluding out-of-scope rows. Do not estimate salary for out-of-scope or low-confidence rows.`;
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
          position: "fixed", bottom: 92, right: 28, zIndex: 999,
          width: 360, height: 480,
          background: C.card, borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          border: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.accent, color: "#fff" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>✨ AI Assistant</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
              {results.length > 0 ? `Analysing ${results.length} classified records` : "Ask about logistics job titles"}
            </div>
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

function BulkUpload({ onResultsReady, user, limits = { bulk: 100 }, userPlan, onLogin, planKey = "guest" }) {
  const [phase, setPhase]               = useState("idle"); // idle | error | sheet-select | mapping | ready | previewing | processing | done
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError]               = useState(null);
  const [fileName, setFileName]         = useState("");
  const [parsedRows, setParsedRows]     = useState([]);
  const [headers, setHeaders]           = useState([]);
  const [progress, setProgress]         = useState(0);
  const [colMap, setColMap]             = useState({ rawTitle: "", description: "", country: "" });
  const [cleanPreviews, setCleanPreviews] = useState([]);
  const [results, setResults]           = useState([]);
  const [dragOver, setDragOver]         = useState(false);
  const [sheetNames, setSheetNames]     = useState([]);
  const [xlsxBuffer, setXlsxBuffer]     = useState(null);
  const fileInputRef                    = useRef(null);

  // Summary stats
  const total          = results.length;
  const outOfScope     = results.filter(r => isOutOfScope(r)).length;
  const reviewRequired = results.filter(r => r.needsReview && !isOutOfScope(r)).length;
  const structured     = results.filter(r => !r.needsReview).length;

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      setError(`Unsupported file type ".${ext}". Please upload a CSV or XLSX file.`);
      setPhase("error"); setFileName(file.name); return;
    }
    setFileName(file.name); setPhase("parsing");
    try {
      if (ext === "csv") {
        const text = await file.text();
        const parsed = parseCSVText(text);
        applyParsed(parsed);
      } else {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        if (wb.SheetNames.length > 1) {
          setXlsxBuffer(buffer);
          setSheetNames(wb.SheetNames);
          setPhase("sheet-select");
        } else {
          applyParsed(parseXLSX(buffer));
        }
      }
    } catch (err) {
      setError(err.message || "Could not parse the file. Please check the format and try again.");
      setPhase("error");
    }
  }

  function applyParsed(parsed) {
    const { headers: hdrs, rows } = parsed;
    if (!rows.length) throw new Error("The file has no data rows.");
    const limited = rows.slice(0, limits.bulk);
    const trimmed = rows.length > limits.bulk;
    setParsedRows(limited); setHeaders(hdrs);
    if (trimmed) {
      const planLabel = !user ? "guest" : (userPlan?.plan ?? "basic");
      const upgradeMsg = planLabel === "guest"
        ? `Guest users are limited to ${limits.bulk} rows. Sign in for more.`
        : planLabel === "basic"
        ? `Basic plan is limited to ${limits.bulk} rows. Upgrade to Pro for up to 10,000 rows.`
        : "";
      if (upgradeMsg) setError(`⚠ File has ${rows.length} rows — only the first ${limits.bulk} will be processed. ${upgradeMsg}`);
    }
    const detected = detectColumns(hdrs);
    setColMap({ rawTitle: detected.rawTitle || "", description: detected.description || "", country: detected.country || "" });
    setPhase(detected.rawTitle ? "ready" : "mapping");
  }

  function selectSheet(name) {
    try {
      applyParsed(parseXLSX(xlsxBuffer, name));
    } catch (err) {
      setError(err.message || "Could not parse this sheet.");
      setPhase("error");
    }
  }

  async function processRows() {
    if (!colMap.rawTitle) return;
    setPhase("processing");
    setProgress(0);

    const rows = parsedRows
      .map((row, i) => ({
        id: i + 1,
        raw:         (row[colMap.rawTitle] || "").trim(),
        title:       cleanPreviews[i]?.clean || (row[colMap.rawTitle] || "").trim(),
        description: colMap.description ? (row[colMap.description] || "") : "",
        country:     colMap.country     ? (row[colMap.country]     || "") : "",
      }))
      .filter(r => r.title);

    const BATCH = 200;
    const allResults = [];
    let useLocal = false;

    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        if (!useLocal) {
          const apiResults = await bulkAnalyzeViaAPI(
            batch.map(r => ({ title: r.title, description: r.description, country: r.country }))
          );
          if (apiResults) {
            allResults.push(...batch.map((r, j) => ({ id: r.id, raw: r.raw, country: r.country, ...apiResults[j] })));
          } else {
            useLocal = true;
            setError("API is unavailable — using local classifier. Results may be less accurate.");
          }
        }
        if (useLocal) {
          allResults.push(...batch.map(r => ({ id: r.id, raw: r.raw, country: r.country, source: "local", ...analyze(r.title, r.description, r.country) })));
        }
        setProgress(i + batch.length);
      }
    } catch (err) {
      setError("Something went wrong while processing your file. Please try again or contact support if the issue continues.");
      setPhase("error");
      return;
    }

    setResults(allResults);
    onResultsReady && onResultsReady(allResults);
    setPhase("done");
  }

  async function previewCleaning() {
    if (!colMap.rawTitle) return;
    setPhase("previewing_loading");
    const titles = parsedRows.map(r => (r[colMap.rawTitle] || "").trim()).filter(Boolean);
    const apiResult = await cleanPreviewViaAPI(titles);
    const pairs = apiResult
      ? apiResult.map(p => ({ raw: p.raw, clean: p.clean, original: p.clean }))
      : titles.map(t => { const c = cleanTitle(t); return { raw: t, clean: c, original: c }; });
    setCleanPreviews(pairs);
    setPhase("previewing");
  }

  function updateCleanPreview(index, value) {
    setCleanPreviews(prev => prev.map((p, i) => i === index ? { ...p, clean: value } : p));
  }

  function resetCleanPreview(index) {
    setCleanPreviews(prev => prev.map((p, i) => i === index ? { ...p, clean: p.original } : p));
  }

  function reset() {
    setPhase("idle"); setError(null); setFileName(""); setParsedRows([]); setHeaders([]);
    setColMap({ rawTitle: "", description: "", country: "" }); setCleanPreviews([]); setResults([]);
    setSheetNames([]); setXlsxBuffer(null); setProgress(0);
  }

  const onDrop = e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };

  // ── Render: Idle ──
  if (phase === "idle") return (
    <div>
      <SectionTitle children="Bulk Upload" sub="Upload a CSV or XLSX file to process multiple titles at once. Download export-ready structured output." />

      {/* Plan banner */}
      {!user && (
        <div style={{ marginBottom: 14, padding: "10px 16px", background: C.accentLight, borderRadius: 8, border: `1px solid ${C.accentBorder}`, fontSize: 13, color: "#1e40af", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span>Guest users are limited to <strong>100 rows</strong>. Sign in for more.</span>
          <button onClick={onLogin} style={{ padding: "5px 16px", borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Sign In</button>
        </div>
      )}
      {user && userPlan?.plan === "basic" && (
        <div style={{ marginBottom: 14, padding: "10px 16px", background: "#fffbeb", borderRadius: 8, border: "1px solid #fcd34d", fontSize: 13, color: "#92400e", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span>Basic plan — up to <strong>1,000 rows</strong> per upload. Used this period: <strong>{userPlan.bulk_used || 0}</strong></span>
          <a href="https://buy.stripe.com/aFacN6gjha4g7Pwf4u7ok00" target="_blank" rel="noopener noreferrer"
            style={{ padding: "5px 16px", borderRadius: 6, background: C.accent, color: "#fff", fontWeight: 700, fontSize: 12, textDecoration: "none" }}>
            Upgrade to Pro →
          </a>
        </div>
      )}

      <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12, color: "#166534", lineHeight: 1.6 }}>
        🔒 <strong>Data notice:</strong> Please use sample, public, or anonymised data. Avoid uploading confidential, internal, or personally identifiable data.
        Job titles are logged for classifier improvement — descriptions are <strong>not</strong> stored. See Privacy Policy in the About section.
      </div>

      <Card>
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)} onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ border: `2px dashed ${dragOver ? C.accent : C.border}`, borderRadius: 10, padding: "52px 24px", textAlign: "center", background: dragOver ? C.accentLight : C.bg, cursor: "pointer", transition: "all 0.15s" }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>📁</div>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 15, marginBottom: 6 }}>Drag & drop your file here</div>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 18 }}>Supports CSV and XLSX · row limit depends on your plan</div>
          <button style={{ padding: "10px 26px", borderRadius: 8, border: `1.5px solid ${C.accent}`, background: C.card, color: C.accent, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Browse File
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
            onChange={e => handleFile(e.target.files[0])} />
        </div>
        <div style={{ marginTop: 16, padding: "12px 16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 5 }}>REQUIRED COLUMN</div>
          <div style={{ fontSize: 13, color: C.text }}>
            <code style={{ background: C.pill, padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>raw_title</code>
            <span style={{ color: C.textMuted, marginLeft: 10 }}>Optional: </span>
            <code style={{ background: C.pill, padding: "2px 7px", borderRadius: 4, fontSize: 12, marginLeft: 4 }}>description</code>
            <code style={{ background: C.pill, padding: "2px 7px", borderRadius: 4, fontSize: 12, marginLeft: 6 }}>country</code>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: C.textMuted }}>
            If your columns have different names, you'll be prompted to map them after uploading.
          </div>
        </div>
        <div style={{ marginTop: 14, padding: "12px 16px", background: "#fffbeb", borderRadius: 8, border: "1px solid #fcd34d" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>💡 Tips for better results</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[
              "Add a country column (NZ or AU) to unlock salary benchmarks and the Salary by Domain chart",
              "Add a description column to improve classification accuracy for ambiguous titles",
              "Non-logistics titles (retail, teaching, healthcare) will be classified as Out of scope — this is expected",
              "The cleaner the title, the more accurate the output — noise like salary ranges or locations will be stripped automatically",
            ].map((tip, i) => (
              <div key={i} style={{ fontSize: 12, color: "#78350f", display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, color: "#d97706" }}>·</span>
                <span style={{ lineHeight: 1.55 }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: C.textMuted, textAlign: "center" }}>
          Job titles submitted are used to improve classification accuracy. No personal data is collected.
        </div>
      </Card>
    </div>
  );

  // ── Render: Parsing ──
  if (phase === "parsing") return (
    <div>
      <SectionTitle children="Bulk Upload" />
      <Card style={{ padding: 48, textAlign: "center", color: C.textMuted }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
        <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>Reading file…</div>
        <div style={{ fontSize: 13 }}>{fileName}</div>
      </Card>
    </div>
  );

  // ── Render: Sheet Select ──
  if (phase === "sheet-select") return (
    <div>
      <SectionTitle children="Bulk Upload" sub="Select which sheet to import." />
      <Card style={{ maxWidth: 520 }}>
        <FieldLabel>This workbook has {sheetNames.length} sheets — select one to continue</FieldLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {sheetNames.map(name => (
            <button key={name} onClick={() => selectSheet(name)}
              style={{ padding: "12px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, fontSize: 14, fontWeight: 600, color: C.text, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "border-color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              📄 {name}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: C.textMuted }}>{fileName}</div>
        <button onClick={reset} style={{ marginTop: 12, fontSize: 12, color: C.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
          ← Upload a different file
        </button>
      </Card>
    </div>
  );

  // ── Render: Error ──
  if (phase === "error") return (
    <div>
      <SectionTitle children="Bulk Upload" />
      <Card style={{ background: C.redLight, border: `1.5px solid ${C.redBorder}` }}>
        <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 15, marginBottom: 8 }}>⚠ Upload Error</div>
        <div style={{ fontSize: 13, color: "#b91c1c", lineHeight: 1.7, marginBottom: 18 }}>{error}</div>
        <button onClick={reset} style={{ padding: "9px 20px", borderRadius: 8, background: C.card, border: `1px solid ${C.redBorder}`, color: C.red, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          ← Try Another File
        </button>
      </Card>
    </div>
  );

  // ── Render: Column Mapping ──
  if (phase === "mapping") return (
    <div>
      <SectionTitle children="Bulk Upload" sub="We couldn't auto-detect your column names. Please map them below." />
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 18 }}>
          📄 {fileName} · {parsedRows.length} rows detected
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
          {[
            { key: "rawTitle", label: "Raw Title", required: true, note: "The messy job title column" },
            { key: "description", label: "Job Description", required: false, note: "Optional — improves classification" },
            { key: "country", label: "Country", required: false, note: "Optional" },
          ].map(({ key, label, required, note }) => (
            <div key={key}>
              <FieldLabel>{label} {required ? "*" : <span style={{ fontWeight: 400, color: C.textMuted }}>optional</span>}</FieldLabel>
              <select value={colMap[key]} onChange={e => setColMap(p => ({ ...p, [key]: e.target.value }))} style={{ ...inputStyle }}>
                <option value="">— None —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5 }}>{note}</div>
            </div>
          ))}
        </div>
        {colMap.rawTitle && parsedRows[0] && (
          <div style={{ padding: "12px 16px", background: C.accentLight, borderRadius: 8, border: `1px solid ${C.accentBorder}`, marginBottom: 20, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: C.accent }}>Preview — first row: </span>
            <span style={{ fontFamily: "monospace", color: C.text }}>{parsedRows[0][colMap.rawTitle]}</span>
          </div>
        )}
        {!colMap.rawTitle && (
          <div style={{ padding: "10px 14px", background: C.amberLight, borderRadius: 8, border: `1px solid ${C.amberBorder}`, marginBottom: 20, fontSize: 13, color: "#78350f" }}>
            ⚠ A Raw Title column is required to continue.
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={reset} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
            ← Back
          </button>
          <button onClick={() => setPhase("ready")} disabled={!colMap.rawTitle}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: colMap.rawTitle ? C.accent : "#d1d5db", color: "#fff", fontWeight: 700, fontSize: 13, cursor: colMap.rawTitle ? "pointer" : "default", fontFamily: "inherit" }}>
            Continue →
          </button>
        </div>
      </Card>
    </div>
  );

  // ── Render: Ready / Processing / Done ──
  return (
    <div>
      <SectionTitle children="Bulk Upload" sub="Upload a CSV or XLSX file to process multiple titles at once." />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* File bar */}
        <Card style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: C.accentLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📄</div>
              <div>
                <div style={{ fontWeight: 600, color: C.text }}>{fileName}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  {parsedRows.length} rows · {phase === "done" ? `${total - structured} row${total - structured !== 1 ? "s" : ""} flagged for review` : "Ready to process"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
                Remove
              </button>
              {phase === "ready" && (
                <button onClick={previewCleaning} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Preview Cleaning →
                </button>
              )}
              {phase === "previewing_loading" && (
                <div style={{ padding: "8px 22px", borderRadius: 8, background: C.accentLight, color: C.accent, fontWeight: 600, fontSize: 13 }}>Loading preview…</div>
              )}
              {phase === "previewing" && (
                <button onClick={processRows} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Run Classifier →
                </button>
              )}
              {phase === "processing" && (
                <div style={{ padding: "8px 22px", borderRadius: 8, background: C.accentLight, color: C.accent, fontWeight: 600, fontSize: 13 }}>Processing…</div>
              )}

              {phase === "done" && (
                <div style={{ padding: "6px 14px", borderRadius: 8, background: C.greenLight, color: C.green, fontWeight: 700, fontSize: 12, border: `1px solid ${C.greenBorder}` }}>✓ Complete</div>
              )}
            </div>
          </div>
        </Card>

        {/* Progress bar */}
        {phase === "processing" && (
          <Card style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Classifying titles…</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{Math.min(progress, parsedRows.length)} / {parsedRows.length}</div>
            </div>
            <div style={{ background: C.border, borderRadius: 99, height: 6, overflow: "hidden" }}>
              <div style={{ background: C.accent, height: "100%", borderRadius: 99, width: `${parsedRows.length ? Math.round((Math.min(progress, parsedRows.length) / parsedRows.length) * 100) : 0}%`, transition: "width 0.3s ease" }} />
            </div>
          </Card>
        )}

        {/* Fallback warning */}
        {phase === "done" && results[0]?.source === "local" && (
          <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#78350f" }}>
            ⚠ API unavailable — all results from local classifier. Accuracy may differ from the Python engine.
          </div>
        )}

        {/* Summary cards — shown when done */}
        {phase === "done" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "Total Rows",              value: total,          bg: C.card,       border: C.border,       text: C.text,   sub: C.textMuted },
              { label: "Structured Successfully", value: structured,     bg: C.greenLight, border: C.greenBorder,  text: C.green,  sub: "#166534" },
              { label: "Review Required",         value: reviewRequired, bg: C.amberLight, border: C.amberBorder,  text: C.amber,  sub: "#78350f" },
              { label: "Out of Scope",            value: outOfScope,     bg: C.redLight,   border: C.redBorder,    text: C.red,    sub: "#991b1b" },
            ].map(({ label, value, bg, border, text, sub }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: text, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: sub, marginTop: 6, lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Charts — shown when done */}
        {phase === "done" && <ResultCharts results={results} />}
        {phase === "done" && planKey === "pro" && <BulkAIBubble results={results} />}
        {phase === "done" && planKey !== "pro" && (
          <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 200 }}>
            <div style={{ background: "#1e1b4b", color: "#c7d2fe", borderRadius: 16, padding: "12px 18px", maxWidth: 280, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>💬 AI Analysis</div>
              <div style={{ color: "#a5b4fc", marginBottom: 10, fontSize: 12 }}>Ask questions about your data — domain breakdown, skills, salary trends, and more.</div>
              <a href="https://buy.stripe.com/aFacN6gjha4g7Pwf4u7ok00" target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", background: "#4f46e5", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                Upgrade to Pro →
              </a>
            </div>
          </div>
        )}

        {/* Clean Preview hint */}
        {phase === "previewing" && (() => {
          const noiseCount = cleanPreviews.filter(p => p.clean?.toLowerCase().includes("other") || p.clean?.length < 4).length;
          const noiseRatio = cleanPreviews.length > 0 ? noiseCount / cleanPreviews.length : 0;
          return noiseRatio > 0.3 ? (
            <div style={{ marginBottom: 12, padding: "10px 16px", background: C.amberLight, borderRadius: 8, border: `1px solid ${C.amberBorder}`, fontSize: 12, color: "#78350f" }}>
              ⚠ High proportion of short or unrecognised titles detected — classification accuracy may be lower. Consider adding a <strong>description</strong> column or reviewing your data before running.
            </div>
          ) : null;
        })()}

        {/* Preview table */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>
              {phase === "done" ? "Structured Output Preview" : phase === "previewing" ? "Cleaning Preview" : "Input Preview"}
            </div>
            {phase === "previewing" && (() => {
              const changed = cleanPreviews.filter(p => p.raw !== p.clean).length;
              return changed > 0
                ? <div style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>{changed} title{changed !== 1 ? "s" : ""} will be cleaned</div>
                : <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>All titles already clean</div>;
            })()}
            {phase === "done" && (total - structured) > 0 && (
              <div style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>⚑ {total - structured} row{total - structured !== 1 ? "s" : ""} flagged</div>
            )}
            {phase === "done" && (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", cursor: "pointer" }}>
                <option value="all">All results</option>
                <option value="good">✓ Good match</option>
                <option value="review">⚑ Review recommended</option>
                <option value="low">⚠ Low confidence</option>
                <option value="oos">✗ Out of scope</option>
              </select>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                  {["#", "Raw Title",
                    ...(phase === "previewing" ? ["Clean Title (editable)"] : []),
                    ...(phase === "done" ? ["Clean Title","Functional Area","Seniority","Match Confidence","Status"] : [])
                  ].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                      {h === "Status" ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          Status
                          <span title="Status helps you decide whether a classification can be used directly or should be reviewed before export." style={{ cursor: "help", fontSize: 10, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: "50%", width: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>?</span>
                        </span>
                      ) : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(phase === "done"
                  ? results.filter(r => {
                      if (statusFilter === "all") return true;
                      if (statusFilter === "oos")    return isOutOfScope(r);
                      if (statusFilter === "low")    return !isOutOfScope(r) && r.confidence < 55;
                      if (statusFilter === "review") return !isOutOfScope(r) && r.confidence >= 55 && r.needsReview;
                      if (statusFilter === "good")   return !isOutOfScope(r) && !r.needsReview && r.confidence >= 55;
                      return true;
                    })
                  : phase === "previewing"
                  ? cleanPreviews.map((p, i) => ({ id: i + 1, raw: p.raw, clean: p.clean, original: p.original }))
                  : parsedRows.slice(0, 12).map((r, i) => ({ id: i + 1, raw: r[colMap.rawTitle] || "(empty)" }))
                ).map((row, i) => {
                  const isOOS = phase === "done" && isOutOfScope(row);
                  const needsRev = phase === "done" && row.needsReview;
                  const autoCleaned = phase === "previewing" && row.raw !== row.original;
                  const manualEdited = phase === "previewing" && row.clean !== row.original;
                  const rowBg = isOOS ? C.redLight : needsRev ? C.amberLight : manualEdited ? "#fffbeb" : autoCleaned ? C.accentLight : i % 2 === 0 ? C.card : C.bg;
                  return (
                    <tr key={row.id || i} style={{ borderBottom: `1px solid ${C.border}`, background: rowBg }}>
                      <td style={{ padding: "10px 16px", color: C.textMuted, fontSize: 12 }}>{row.id || i + 1}</td>
                      <td style={{ padding: "10px 16px", color: C.textMuted, maxWidth: 220, fontFamily: "monospace", fontSize: 12 }}>{row.raw}</td>
                      {phase === "previewing" && (
                        <td style={{ padding: "6px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              value={row.clean}
                              onChange={e => updateCleanPreview(i, e.target.value)}
                              style={{ flex: 1, fontFamily: "monospace", fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${manualEdited ? C.amberBorder : autoCleaned ? C.accentBorder : C.border}`, background: "transparent", color: C.text, outline: "none" }}
                            />
                            {(autoCleaned || manualEdited) && (
                              <button onClick={() => resetCleanPreview(i)} title="Reset to auto-cleaned"
                                style={{ padding: "4px 7px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontSize: 12, color: C.textMuted, lineHeight: 1 }}>
                                ↺
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      {phase === "done" && <>
                        <td style={{ padding: "10px 16px", fontWeight: 600, color: C.text }}>{row.cleanTitle}</td>
                        <td style={{ padding: "10px 16px" }}><Badge tone={domainTone(row.domain)} size="sm">{row.domain}</Badge></td>
                        <td style={{ padding: "10px 16px" }}><Badge tone={seniorityTone(row.seniority)} size="sm" variant="tag">{row.seniority}</Badge></td>
                        <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: 13, color: matchConfidenceLabel(row.confidence).text }}>
                          {row.confidence}%
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          {isOOS
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>✗ Out of scope</span>
                            : row.confidence < 55
                            ? <span style={{ fontSize: 11, fontWeight: 600, color: C.red }}>⚠ Low confidence</span>
                            : needsRev
                            ? <span style={{ fontSize: 11, fontWeight: 600, color: C.amber }}>⚑ Review recommended</span>
                            : <span style={{ fontSize: 11, color: C.green }}>✓ Good match</span>}
                        </td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Export bar */}
        {phase === "done" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginRight: 4 }}>EXPORT AS</div>
            <button onClick={() => doDownloadCSV(results)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", fontWeight: 600, color: C.text, fontFamily: "inherit" }}>
              📄 CSV
            </button>
            <button onClick={() => doDownloadJSON(results)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", fontWeight: 600, color: C.text, fontFamily: "inherit" }}>
              {"{ }"} JSON
            </button>
            <button onClick={() => doDownloadXLSX(results)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", fontWeight: 600, color: C.text, fontFamily: "inherit" }}>
              📊 Excel
            </button>
            <div style={{ marginLeft: "auto", fontSize: 12, color: C.textMuted }}>
              {total} rows · {structured} structured · {total - structured} flagged
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page 3: Skill Mapper ─────────────────────────────────────────────────────

function SkillMapper() {
  const isMobile = useIsMobile();
  const [input, setInput]     = useState("");
  const [results, setResults] = useState([]);

  function mapSkills() {
    const phrases = input.split(/[,\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    setResults(phrases.map(phrase => {
      const exact = Object.entries(SKILL_SYNONYMS).find(([k]) => k === phrase);
      const match = exact ?? Object.entries(SKILL_SYNONYMS).find(([k]) => phrase.includes(k) && k.length > 3);
      return { raw: phrase, normalized: match ? match[1] : null };
    }));
  }

  function exportResults() {
    if (!results.length) return;
    const lines = ["raw_phrase,canonical_label,matched", ...results.map(r => `"${r.raw}","${r.normalized || ""}","${r.normalized ? "Yes" : "No"}"`)] ;
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    triggerDownload(blob, "skill_mapping.csv");
  }

  const EXAMPLES = ["wms, tms, sap, erp, crm", "advanced excel, sql, kpi management, s&op", "customs clearance, incoterms, rf scanning, ohs"];

  const matched   = results.filter(r => r.normalized).length;
  const unmatched = results.filter(r => !r.normalized).length;

  return (
    <div>
      <SectionTitle children="Skill Mapper" sub="Enter inconsistent skill phrases — see how they normalize into standard canonical labels." />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <Card>
          <FieldLabel>Raw Skill Phrases <span style={{ fontWeight: 400, color: C.textMuted }}>comma or line separated</span></FieldLabel>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={9}
            placeholder={"wms, tms, crm\nadvanced excel, sql\nkpi management, s&op\nohs, edi"}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 13 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => { setInput(ex); setResults([]); }}
                style={{ padding: "4px 11px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
                {ex.slice(0, 34)}…
              </button>
            ))}
          </div>
          <button onClick={mapSkills} disabled={!input.trim()}
            style={{ width: "100%", padding: "11px", borderRadius: 8, background: input.trim() ? C.accent : "#d1d5db", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: input.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
            Normalize Skills →
          </button>
        </Card>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <FieldLabel>Normalized Output</FieldLabel>
            {results.length > 0 && (
              <button onClick={exportResults}
                style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, cursor: "pointer", color: C.textMuted, fontFamily: "inherit", fontWeight: 600 }}>
                ⬇ Export CSV
              </button>
            )}
          </div>
          {results.length === 0
            ? <div style={{ color: C.textMuted, fontSize: 13, paddingTop: 60, textAlign: "center", opacity: 0.7 }}>Results will appear here</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {results.map((r, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: r.normalized ? C.greenLight : C.redLight, border: `1px solid ${r.normalized ? C.greenBorder : C.redBorder}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: C.text, flexShrink: 0 }}>{r.raw}</span>
                      <span style={{ color: C.textMuted, fontSize: 11 }}>→</span>
                      {r.normalized
                        ? <Badge tone="green">{r.normalized}</Badge>
                        : <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>⚑ No match — review</span>}
                    </div>
                    {r.normalized && SKILL_DESCRIPTIONS[r.normalized] && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#166534", lineHeight: 1.6 }}>
                        {SKILL_DESCRIPTIONS[r.normalized]}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ padding: "8px 14px", borderRadius: 8, background: C.bg, fontSize: 12, color: C.textMuted, border: `1px solid ${C.border}`, marginTop: 4 }}>
                  {matched} of {results.length} phrases matched · {unmatched} flagged for review
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.accentLight, border: `1px solid ${C.accentBorder}`, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
                  <strong>Canonical label</strong> = the standardized output used in export files.<br />
                  <strong>Common variants</strong> like "wms software", "warehouse management system", "wms" all map to the same canonical label.
                </div>
              </div>
            )}
        </Card>
      </div>
    </div>
  );
}

// ── Page 4: Title Cleaner ────────────────────────────────────────────────────

// Cache sample results at module level so navigating away and back doesn't re-fetch
let _tcSampleCache = null;

const TC_SAMPLES = [
  "Snr Whse Ops Coord",
  "Jr Logistics Admin",
  "Hiring Now: Freight Coordinator",
  "Warehouse Assistant - Auckland",
  "DC Supervisor",
  "Import/Export Admin",
  "SUPPLY CHAIN MANAGER",
  "Ops Mgr - 3PL Warehouse [Fixed Term]",
];

function TitleCleaner() {
  const [manualInput, setManualInput]   = useState("");
  const [manualResult, setManualResult] = useState(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [sampleResults, setSampleResults] = useState(_tcSampleCache);
  const [samplesOpen, setSamplesOpen]   = useState(true);

  useEffect(() => {
    if (_tcSampleCache) return; // already fetched this session
    bulkAnalyzeViaAPI(TC_SAMPLES.map(title => ({ title, description: "", country: "" })))
      .then(res => {
        const results = res
          ? TC_SAMPLES.map((raw, i) => ({ raw, ...res[i] }))
          : TC_SAMPLES.map(raw => ({ raw, ...analyze(raw, "", "") }));
        _tcSampleCache = results;
        setSampleResults(results);
      });
  }, []);

  async function runManual() {
    if (!manualInput.trim()) return;
    setManualLoading(true);
    setSamplesOpen(false); // auto-collapse sample table when user runs their own
    const apiResult = await analyzeViaAPI(manualInput.trim());
    setManualResult(apiResult ?? { ...analyze(manualInput.trim(), "", ""), source: "local" });
    setManualLoading(false);
  }

  return (
    <div>
      <SectionTitle children="Title Cleaner" sub="See how raw titles are transformed — abbreviations expanded, noise removed, location stripped." />

      {/* Manual input section */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Test Your Own Title</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={manualInput} onChange={e => { setManualInput(e.target.value); setManualResult(null); }}
            onKeyDown={e => e.key === "Enter" && runManual()}
            placeholder="Paste any raw title and press Clean →"
            style={{ ...inputStyle, flex: 1 }} />
          <button onClick={runManual} disabled={!manualInput.trim() || manualLoading}
            style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: manualInput.trim() ? C.accent : "#d1d5db", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: manualInput.trim() && !manualLoading ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {manualLoading ? "…" : "Clean →"}
          </button>
        </div>
        {manualResult?.source === "local" && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 7, background: C.amberLight, border: `1px solid ${C.amberBorder}`, fontSize: 12, color: "#78350f" }}>
            ⚠ API unavailable — result from local classifier.
          </div>
        )}
        {manualResult && (() => {
          const raw = manualInput.trim();
          const cleaned = manualResult.cleanTitle;
          const unchanged = cleaned.toLowerCase().replace(/\s/g,"") === raw.toLowerCase().replace(/\s/g,"");
          // Detect what changed
          const changes = [];
          const hiringPhrases = ["hiring now","urgent","now hiring","we're hiring","we are hiring","apply now","immediate start"];
          if (hiringPhrases.some(p => raw.toLowerCase().includes(p))) changes.push("removed hiring phrase");
          const locations = ["auckland","wellington","christchurch","hamilton","dunedin","sydney","melbourne","brisbane","perth","adelaide","canberra","nz","au","remote","hybrid"];
          if (locations.some(l => raw.toLowerCase().includes(l)) && !cleaned.toLowerCase().includes("auckland") && !cleaned.toLowerCase().includes("sydney")) changes.push("removed location");
          const noiseWords = ["part-time","full-time","part time","full time","contract","casual","fixed term","night shift","day shift"];
          if (noiseWords.some(n => raw.toLowerCase().includes(n))) changes.push("removed noise");
          const abbrevMap = [["snr","senior"],["jr","junior"],["jnr","junior"],["whse","warehouse"],["whs","warehouse"],["ops","operations"],["mgr","manager"],["coord","coordinator"],["admin","administrator"],["asst","assistant"],["dc","distribution centre"],["bd","business development"],["op","operator"],["spec","specialist"],["tl","team lead"],["gm","general manager"]];
          const expandedAbbrevs = abbrevMap.filter(([abbr]) => new RegExp(`\\b${abbr}\\b`, "i").test(raw));
          if (expandedAbbrevs.length > 0) changes.push(`expanded ${expandedAbbrevs.map(([a,b]) => `${a.toUpperCase()} → ${b.charAt(0).toUpperCase()+b.slice(1)}`).join(", ")}`);
          if (raw !== raw.toUpperCase() && raw.replace(/[^A-Z]/g,"").length / raw.replace(/[^a-zA-Z]/g,"").length > 0.7) changes.push("normalised case");
          return (
          <div style={{ marginTop: 16, borderRadius: 9, border: `1px solid ${C.accentBorder}`, overflow: "hidden" }}>
            {/* Before → After */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "flex-start", gap: 0, background: C.accentLight, padding: "14px 18px" }}>
              <div>
                <FieldLabel>Original</FieldLabel>
                <div style={{ fontFamily: "monospace", fontSize: 13, color: C.textSub, background: C.pill, padding: "4px 10px", borderRadius: 6, display: "inline-block" }}>{raw}</div>
              </div>
              <div style={{ fontSize: 20, color: C.accent, padding: "0 12px", marginTop: 16 }}>→</div>
              <div>
                <FieldLabel>Cleaned</FieldLabel>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
                  {cleaned}
                  {unchanged && <span style={{ fontSize: 11, fontWeight: 400, color: C.textMuted, marginLeft: 8 }}>no changes</span>}
                </div>
                {!unchanged && changes.length > 0 && (
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5, lineHeight: 1.6 }}>
                    {changes.map((c, i) => <span key={i} style={{ display: "block" }}>· {c.charAt(0).toUpperCase()+c.slice(1)}</span>)}
                  </div>
                )}
              </div>
            </div>
            {/* Classification info */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "12px 18px", borderTop: `1px solid ${C.accentBorder}`, background: C.card }}>
              <div><FieldLabel>Functional Area</FieldLabel><Badge tone={domainTone(manualResult.domain)}>{manualResult.domain}</Badge></div>
              <div><FieldLabel>Seniority</FieldLabel><Badge tone={seniorityTone(manualResult.seniority)} variant="tag">{manualResult.seniority}</Badge></div>
              <div>
                <FieldLabel>Match Confidence</FieldLabel>
                <span style={{ fontSize: 13, fontWeight: 700, color: matchConfidenceLabel(manualResult.confidence).text }}>
                  {manualResult.confidence}% · {matchConfidenceLabel(manualResult.confidence).label}
                </span>
              </div>
            </div>
          </div>
          );
        })()}
      </Card>

      {/* Sample table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div onClick={() => setSamplesOpen(o => !o)}
          style={{ padding: "14px 20px", borderBottom: samplesOpen ? `1px solid ${C.border}` : "none", background: C.bg, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>Before / After — Sample Titles</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Shows what gets cleaned from real logistics job ad titles</div>
          </div>
          <span style={{ fontSize: 13, color: C.textMuted }}>{samplesOpen ? "▲" : "▼"}</span>
        </div>
        {samplesOpen && (!sampleResults ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: C.textMuted, fontSize: 13 }}>Loading samples…</div>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                {["Raw Title", "Clean Title", "Suggested Functional Area", "Suggested Seniority"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 18px", color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleResults.map((res, i) => {
                const changed = res.cleanTitle.toLowerCase().replace(/\s/g,"") !== res.raw.toLowerCase().replace(/\s/g,"");
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : C.bg }}>
                    <td style={{ padding: "13px 18px", fontFamily: "monospace", fontSize: 12, color: "#6b1a1a", background: "#fff8f8", maxWidth: 220 }}>{res.raw}</td>
                    <td style={{ padding: "13px 18px", fontWeight: 600, color: isOutOfScope(res) ? C.red : "#14532d" }}>
                      {res.cleanTitle}
                      {changed && <span style={{ display: "block", fontSize: 10, color: C.textMuted, fontWeight: 400, marginTop: 2 }}>cleaned</span>}
                    </td>
                    <td style={{ padding: "13px 18px" }}><Badge tone={domainTone(res.domain)}>{res.domain}</Badge></td>
                    <td style={{ padding: "13px 18px" }}><Badge tone={seniorityTone(res.seniority)} variant="tag">{res.seniority}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        ))}
      </Card>
    </div>
  );
}

// ── Page 5: Export ──────────────────────────────────────────────────────────

const DEMO_TITLES = [
  "Senior Freight Coordinator – FCL (NZ)",
  "Ops Mgr 3PL Warehouse [Contract]",
  "Retail Health Consultant",
  "Customs Clearance / Import Export Officer",
  "APAC Supply Chain Planner",
  "TMS/WMS Systems Analyst",
  "Warehouse Assistant – Night Shift",
  "Customer Service / Dispatch Coordinator",
];

const DEMO_RESULTS = DEMO_TITLES.map((raw, i) => ({ id: i + 1, raw, country: "", ...analyze(raw, "", "") }));

function ExportPage({ bulkResults }) {
  const [format, setFormat]   = useState("csv");
  const [fields, setFields]   = useState(["raw_title","clean_title","domain","work_nature","seniority","confidence","needs_review"]);
  const allFields = EXPORT_FIELDS;
  const toggle = f => setFields(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);

  const hasRealData = bulkResults && bulkResults.length > 0;
  const data = hasRealData ? bulkResults : DEMO_RESULTS;
  const label = hasRealData ? `${data.length} rows from Bulk Upload` : `${data.length} demo rows (upload a file in Bulk Upload to use your own data)`;

  function doDownload() {
    const filename = `logistics_export_${Date.now()}`;
    const rows = data.map(r => {
      const full = buildExportRow(r);
      const out = {};
      fields.forEach(f => { out[f] = full[f] ?? ""; });
      return out;
    });
    if (format === "csv") {
      const header = fields.join(",");
      const lines = rows.map(r =>
        fields.map(f => {
          const v = String(r[f] ?? "");
          return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(",")
      );
      triggerDownload(new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" }), `${filename}.csv`);
    }
    if (format === "json") {
      triggerDownload(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), `${filename}.json`);
    }
    if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows, { header: fields });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Structured Output");
      XLSX.writeFile(wb, `${filename}.xlsx`);
    }
  }

  return (
    <div>
      <SectionTitle children="Export" sub="Choose your format and fields. Download a clean, structured file." />
      <div style={{ marginBottom: 16, padding: "10px 16px", background: hasRealData ? C.greenLight : C.bg, border: `1px solid ${hasRealData ? C.greenBorder : C.border}`, borderRadius: 9, fontSize: 13, color: hasRealData ? "#166534" : C.textMuted }}>
        {hasRealData ? "✓ " : "ℹ "}{label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Output Format</div>
          {[
            ["csv",  "CSV",          "Best for Excel, databases, and spreadsheets"],
            ["xlsx", "Excel (.xlsx)","Formatted spreadsheet with column headers"],
            ["json", "JSON",         "For developers and downstream integrations"],
          ].map(([val, lbl, desc]) => (
            <div key={val} onClick={() => setFormat(val)}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 15px", borderRadius: 9, marginBottom: 9, border: `2px solid ${format === val ? C.accent : C.border}`, background: format === val ? C.accentLight : C.card, cursor: "pointer" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${format === val ? C.accent : C.border}`, background: format === val ? C.accent : C.card, flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {format === val && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{lbl}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Fields to Include</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
            {allFields.map(f => (
              <label key={f} style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
                <input type="checkbox" checked={fields.includes(f)} onChange={() => toggle(f)} style={{ width: 15, height: 15, accentColor: C.accent }} />
                <span style={{ fontSize: 13, fontFamily: "monospace", color: C.text }}>{f}</span>
              </label>
            ))}
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 14, fontSize: 12, color: C.textMuted }}>
            {fields.length} field{fields.length !== 1 ? "s" : ""} selected · {data.length} rows
          </div>
          <button onClick={doDownload} disabled={!fields.length}
            style={{ width: "100%", padding: "12px", borderRadius: 8, background: fields.length ? C.accent : "#d1d5db", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: fields.length ? "pointer" : "default", fontFamily: "inherit" }}>
            Download {format.toUpperCase()}
          </button>
        </Card>
      </div>
    </div>
  );
}

// ── Page 6: About ────────────────────────────────────────────────────────────

function About() {
  const isMobile = useIsMobile();
  const [showAboutFeedback, setShowAboutFeedback] = useState(false);
  return (
    <div>
      <SectionTitle children="About" sub="What this tool does, what it doesn't, and how it works." />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 34 }}>📦</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Logistics Title Mapper</div>
              <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3 }}>Rule-based + AI normalization tool for messy logistics job text</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.8, marginBottom: 16 }}>
            Logistics Title Mapper helps recruiters, HR teams, and analysts turn messy job titles and descriptions into clean, structured, reviewable draft outputs — including cleaned titles, normalized skills, suggested role labels, and export-ready fields. When titles are ambiguous, the tool uses description context and rule-based signals to generate a suggested draft classification.
          </div>
          <div style={{ padding: "13px 18px", borderRadius: 9, background: C.accentLight, border: `1px solid ${C.accentBorder}`, fontSize: 14, color: "#1e40af", fontStyle: "italic", lineHeight: 1.6 }}>
            "Turn unstructured logistics job text into usable structured data."
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 14 }}>✓ What this tool does</div>
            {[
              "Cleans messy job titles and removes noise",
              "Normalizes inconsistent skill labels",
              "Generates suggested functional area classification",
              "Infers suggested seniority level from title text",
              "Detects suggested work nature (Management / Specialist / Operational)",
              "Flags ambiguous, low-confidence, or out-of-scope cases",
              "Uses description context when title alone is ambiguous",
              "Uses AI fallback (Claude Haiku) for unmatched or ambiguous titles",
              "AI Assistant — ask questions about your results in plain English",
              "Data Analysis Charts — domain, seniority, skills, and salary breakdowns",
              "PDF Report — 2-page export with summary stats and charts",
              "PNG Export — download charts as an image",
              "Shows salary benchmark reference for NZ and AU roles",
              "Produces export-ready structured output (CSV, Excel, JSON)",
            ].map(item => (
              <div key={item} style={{ display: "flex", gap: 9, marginBottom: 9, fontSize: 13, color: C.textSub, alignItems: "flex-start" }}>
                <span style={{ color: C.green, flexShrink: 0 }}>✓</span>
                <span style={{ lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 14 }}>✗ What this tool is NOT</div>
            {[
              "Not a market intelligence or hiring trends platform",
              "Not a job board or candidate sourcing tool",
              "Charts are based on your uploaded data only — not market-wide data",
              "Salary figures are market references only — not authoritative benchmarks",
              "Not a universal authoritative logistics taxonomy",
              "Not a replacement for human review on ambiguous cases",
            ].map(item => (
              <div key={item} style={{ display: "flex", gap: 9, marginBottom: 9, fontSize: 13, color: C.textSub, alignItems: "flex-start" }}>
                <span style={{ color: C.red, flexShrink: 0 }}>✗</span>
                <span style={{ lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </Card>
        </div>

        <Card style={{ background: C.bg }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Data Sources</div>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.85 }}>
            Classification rules are derived from NZ and AU logistics job market data. Salary benchmarks are market estimates based on job market analysis — they are <strong>reference ranges only</strong> and do not represent any official salary survey, government data, or authoritative benchmarking source. Actual salaries vary by employer, location, experience, and market conditions. The classification taxonomy references publicly available frameworks including ASCM SCOR, ILO ISCO-08, and O*NET Job Zones.
          </div>
        </Card>

        <Card style={{ background: C.bg }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>How Classification Works</div>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.85 }}>
            Classification follows a four-stage pipeline. <strong>Stage 1</strong> matches title keywords against a logistics domain taxonomy — producing up to 92% confidence when matched. <strong>Stage 2</strong> applies fuzzy repair rules for ambiguous or abbreviated titles — producing 74% (or 30% if outside logistics scope). <strong>Stage 3</strong> uses description text when the title alone is insufficient — producing 58–72% confidence. <strong>Stage 4</strong> calls Claude Haiku AI for titles that pass all three rule stages without a match — capped at 70% confidence. All outputs are <strong>suggested draft classifications</strong> intended for normalization and review support, not final authoritative labels.
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Output Fields</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
            {[
              { f: "clean_title",      d: "Standardized title with abbreviations expanded and noise removed" },
              { f: "domain",           d: "Suggested logistics category (e.g. Freight Forwarding, Warehouse)" },
              { f: "work_nature",      d: "Suggested nature: Management, Specialist / Support, or Operational" },
              { f: "seniority",        d: "Suggested level: Entry Level · Mid Level · Senior · Manager · Executive" },
              { f: "skills",           d: "Normalized skill tags mapped from title and description text" },
              { f: "confidence",       d: "0–100 score indicating how certain the rule engine is" },
              { f: "flags",            d: "Flags for ambiguous, short, noisy, or out-of-scope inputs" },
              { f: "salary_benchmark", d: "Market salary reference range for NZ or AU roles (±12% around median)" },
            ].map(({ f, d }) => (
              <div key={f} style={{ padding: "12px 14px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: C.accent, fontWeight: 700, marginBottom: 5 }}>{f}</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Status guide */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 14 }}>Understanding Status labels</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { icon: "✓", tone: C.green,  bg: C.greenLight,  border: C.greenBorder,  label: "Good match",           desc: "The classification is likely usable as-is." },
              { icon: "⚑", tone: C.amber,  bg: C.amberLight,  border: C.amberBorder,  label: "Review recommended",   desc: "The result is reasonable, but the title or description is ambiguous — check before using in reports." },
              { icon: "⚠", tone: C.amber,  bg: C.amberLight,  border: C.amberBorder,  label: "Low confidence",       desc: "The title is too generic or unclear to classify reliably. Add a description or more context." },
              { icon: "✗", tone: C.red,    bg: C.redLight,    border: C.redBorder,    label: "Out of scope",         desc: "The input does not appear to be a logistics-related role and has been excluded from analysis." },
            ].map(({ icon, tone, bg, border, label, desc }) => (
              <div key={label} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
                <span style={{ color: tone, fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: tone }}>{label}</div>
                  <div style={{ fontSize: 12, color: C.textSub, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Feedback */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14, marginBottom: 3 }}>Have feedback or found an issue?</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Let us know — it helps improve the tool.</div>
          </div>
          <button
            onClick={() => setShowAboutFeedback(true)}
            style={{ padding: "10px 22px", borderRadius: 8, background: C.accent, color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0, marginLeft: 20 }}>
            💬 Give Feedback
          </button>
        </div>
        {showAboutFeedback && <FeedbackModal page="about" onClose={() => setShowAboutFeedback(false)} />}

      </div>
    </div>
  );
}

// ── Page 7: AI Assistant ─────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "Why would a title be classified as Other/Noise?",
  "What's the difference between Operations and Warehouse?",
  "How do I improve low-confidence results?",
  "What does the confidence score mean?",
];

function AIAssistant({ initialContext = "", onClearContext, bulkResults = [] }) {
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


function PrivacyPolicy() {
  return (
    <div>
      <SectionTitle children="Privacy Policy" sub="Last updated: April 2025" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>

        <Card>
          <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.9 }}>
            This Privacy Policy describes how Logistics Title Mapper ("we", "the tool") handles information submitted through this website. By using this tool, you agree to the practices described below.
          </div>
        </Card>

        {[
          {
            title: "What we collect",
            items: [
              "Job titles and descriptions you submit for classification — used to improve classification accuracy. No names, emails, or personally identifying information are extracted from submitted content.",
              "Feedback you voluntarily submit (thumbs up/down, comments) — stored to help identify misclassifications.",
              "Email address, if you join the waitlist — used only to notify you when paid plans become available.",
            ],
          },
          {
            title: "What we do NOT collect",
            items: [
              "We do not collect names, contact details, or any personally identifying information from submitted job titles.",
              "We do not use cookies for tracking or advertising.",
              "We do not sell or share your data with third parties for commercial purposes.",
            ],
          },
          {
            title: "How we use submitted data",
            items: [
              "Submitted job titles and classification results (domain, confidence, status) are logged to improve classification accuracy over time. Job descriptions are not stored.",
              "We may review patterns in submitted titles to improve rules or correct misclassifications. Individual submissions are not manually reviewed in isolation.",
              "Feedback and waitlist data are stored securely in Supabase (supabase.com), hosted in the US. See Supabase's privacy policy for infrastructure details.",
              "Please avoid uploading confidential, internally sensitive, or personally identifiable data. This tool is designed for job title text only.",
            ],
          },
          {
            title: "Data retention",
            items: [
              "Job title logs are retained for classifier improvement. Descriptions are never stored. We plan to introduce automatic deletion of title logs older than 12 months.",
              "Feedback data is retained to identify classification patterns and improve accuracy.",
              "Waitlist data is retained until you request removal or until the waitlist is closed.",
              "You may request deletion of any data associated with your email address by contacting logititles@gmail.com.",
            ],
          },
          {
            title: "Your rights (NZ Privacy Act 2020)",
            items: [
              "You have the right to request access to personal information we hold about you.",
              "You have the right to request correction or deletion of your personal information.",
              "To exercise these rights, contact us at the email address below.",
            ],
          },
        ].map(({ title, items }) => (
          <Card key={title}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>{title}</div>
            {items.map(item => (
              <div key={item} style={{ display: "flex", gap: 9, marginBottom: 9, fontSize: 13, color: C.textSub, alignItems: "flex-start", lineHeight: 1.6 }}>
                <span style={{ color: C.accent, flexShrink: 0, marginTop: 2 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </Card>
        ))}

        <Card style={{ padding: "14px 20px" }}>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>
            <strong>Contact:</strong> logititles@gmail.com<br />
            <strong>Governing law:</strong> New Zealand — Privacy Act 2020<br />
            <strong>Questions?</strong> Email us and we will respond within 5 business days.
          </div>
        </Card>

      </div>
    </div>
  );
}


// ── Page 8: Terms of Service ─────────────────────────────────────────────────

function TermsOfService() {
  return (
    <div>
      <SectionTitle children="Terms of Service" sub="Last updated: April 2025" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>

        <Card>
          <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.9 }}>
            By using Logistics Title Mapper ("the tool", "the service"), you agree to these Terms of Service. Please read them carefully before using the tool.
          </div>
        </Card>

        {[
          {
            title: "1. About the service",
            items: [
              "Logistics Title Mapper is a job title normalization tool designed for logistics and supply chain professionals.",
              "The tool provides suggested draft classifications — including functional area, seniority level, and skill tags — based on rule-based and AI-assisted analysis.",
              "All outputs are suggestions intended to support human review and decision-making, not to replace professional judgment.",
            ],
          },
          {
            title: "2. Salary benchmarks",
            items: [
              "Salary benchmarks shown by this tool are market estimates based on NZ/AU job market data analysis. They are provided for general reference purposes only.",
              "Salary estimates do not constitute financial advice, HR advice, or any form of official salary survey.",
              "Actual salaries vary based on employer, experience, location, industry segment, and market conditions. We make no warranty regarding accuracy.",
              "Do not rely solely on this tool's salary estimates for employment decisions, salary negotiations, or compensation benchmarking.",
            ],
          },
          {
            title: "3. Classification accuracy",
            items: [
              "Classification outputs are generated by a rule-based engine with AI fallback. Results may be inaccurate, incomplete, or unsuitable for specific contexts.",
              "The tool is designed to assist with data cleaning and normalization, not to produce authoritative job classifications.",
              "Always verify classification results before using them in formal HR systems, reports, or compliance contexts.",
            ],
          },
          {
            title: "4. Acceptable use",
            items: [
              "You may use this tool for personal, internal business, or commercial purposes within the limits of your subscription plan.",
              "You may not use this tool to process data that violates applicable privacy laws or third-party terms of service.",
              "You may not attempt to reverse-engineer, scrape, or systematically extract the classification rules or underlying data from this tool.",
            ],
          },
          {
            title: "5. Disclaimer of warranties",
            items: [
              "The tool is provided 'as is' without warranties of any kind, express or implied.",
              "We do not guarantee uninterrupted availability, accuracy of outputs, or fitness for any particular purpose.",
              "To the extent permitted by New Zealand law, we are not liable for any loss or damage arising from use of this tool.",
            ],
          },
          {
            title: "6. Subscriptions (coming soon)",
            items: [
              "Paid subscription plans are not yet active. Terms specific to subscriptions will be added here when billing is enabled.",
              "By joining the waitlist, you are expressing interest only — no payment or commitment is required.",
            ],
          },
        ].map(({ title, items }) => (
          <Card key={title}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>{title}</div>
            {items.map(item => (
              <div key={item} style={{ display: "flex", gap: 9, marginBottom: 9, fontSize: 13, color: C.textSub, alignItems: "flex-start", lineHeight: 1.6 }}>
                <span style={{ color: C.accent, flexShrink: 0, marginTop: 2 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </Card>
        ))}

        <Card style={{ padding: "14px 20px" }}>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>
            <strong>Governing law:</strong> New Zealand<br />
            <strong>Contact:</strong> logititles@gmail.com<br />
            These terms may be updated at any time. Continued use of the tool constitutes acceptance of the updated terms.
          </div>
        </Card>

      </div>
    </div>
  );
}


// ── Market Insights ───────────────────────────────────────────────────────────

function MarketInsights() {
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
      .filter(d => d.count >= 20)
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
      .filter(l => buckets[l] && buckets[l].length >= 20)
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
          </Card>

          {/* Top Skills */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Top 8 Skills</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>Common skills associated with these roles — inferred from job titles, not job descriptions.</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={skillData} layout="vertical" margin={{ left: 10, right: 40 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
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
                Median advertised salary — roles with salary data only (n ≥ 20 per domain). Market estimates, not authoritative benchmarks.
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
                Median advertised salary by level (n ≥ 20). Mixed domains — IT roles may skew Senior upward.
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
  const [showFeedback, setShowFeedback]   = useState(false);
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
      // First login — create basic plan
      const { data: created } = await supabase.from("user_plans")
        .insert({ user_id: uid, plan: "basic" }).select().single();
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
          <button onClick={() => setShowFeedback(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4 }}>
            💬
          </button>
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
      {showFeedback && <FeedbackModal page={page} onClose={() => setShowFeedback(false)} />}
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
                        style={{ display: "block", textAlign: "center", padding: "5px 0", borderRadius: 6, background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 11, textDecoration: "none", marginBottom: 4 }}>
                        Get Basic NZ$9 →
                      </a>
                      <a href="https://buy.stripe.com/aFacN6gjha4g7Pwf4u7ok00" target="_blank" rel="noopener noreferrer"
                        style={{ display: "block", textAlign: "center", padding: "5px 0", borderRadius: 6, background: C.accent, color: "#fff", fontWeight: 700, fontSize: 11, textDecoration: "none", marginBottom: 6 }}>
                        Get Pro NZ$29 →
                      </a>
                    </>
                  )}
                  {planKey === "basic" && (
                    <a href="https://buy.stripe.com/aFacN6gjha4g7Pwf4u7ok00" target="_blank" rel="noopener noreferrer"
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
              <button onClick={() => setShowFeedback(true)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#4a527a", fontFamily: "inherit", padding: 0, lineHeight: 1.8, display: "block", marginTop: 4 }}>
                💬 Give Feedback
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

      {showFeedback && <FeedbackModal page={page} onClose={() => setShowFeedback(false)} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />}
      {showResetPassword && <ResetPasswordModal onClose={() => { setShowResetPassword(false); }} />}
    </div>
  );
}

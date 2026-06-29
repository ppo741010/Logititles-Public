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

export function BulkUpload({ onResultsReady, user, limits = { bulk: 100 }, userPlan, onLogin, planKey = "guest" }) {
  const [phase, setPhase]               = useState("idle"); // idle | error | parsing | sheet-select | header-warning | mapping | ready | previewing | previewing_loading | processing | done
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
  const [headerWarning, setHeaderWarning] = useState(null); // { headerRowIndex, source: "csv"|"xlsx", csvText?, xlsxBuffer?, sheetName? }
  const [skippedRows, setSkippedRows]   = useState(0);
  const fileInputRef                    = useRef(null);
  const cancelledRef                    = useRef(false);

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
        const rawRows = getRawRowsCSV(text);
        const detection = detectHeaderRow(rawRows);

        if (detection) {
          setHeaderWarning({ headerRowIndex: detection.headerRowIndex, source: "csv", csvText: text });
          setPhase("header-warning");
        } else {
          applyParsed(parseCSVText(text));
        }
      } else {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        if (wb.SheetNames.length > 1) {
          setXlsxBuffer(buffer);
          setSheetNames(wb.SheetNames);
          setPhase("sheet-select");
        } else {
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          const rawRows = data.slice(0, 10).map(r => r.map(c => String(c).trim()));
          const detection = detectHeaderRow(rawRows);
          if (detection) {
            setHeaderWarning({ headerRowIndex: detection.headerRowIndex, source: "xlsx", xlsxBuffer: buffer, sheetName: wb.SheetNames[0] });
            setPhase("header-warning");
          } else {
            applyParsed(parseXLSX(buffer));
          }
        }
      }
    } catch (err) {
      setError(err.message || "Could not parse the file. Please check the format and try again.");
      setPhase("error");
    }
  }

  function applyParsed(parsed) {
    const { headers: hdrs, rows, skippedRows: skipped = 0 } = parsed;
    if (!rows.length) throw new Error("The file has no data rows.");
    setSkippedRows(skipped);

    // Check row limit — block if exceeded
    if (rows.length > limits.bulk) {
      const planLabel = !user ? "guest" : (userPlan?.plan ?? "basic");
      const upgradeLink = planLabel === "guest"
        ? " Sign in for more."
        : planLabel === "basic"
        ? " Upgrade to Pro for up to 10,000 rows."
        : "";
      setError(`This file has ${rows.length} rows. ${planLabel.charAt(0).toUpperCase() + planLabel.slice(1)} upload supports up to ${limits.bulk} rows. Please reduce the file size or upgrade.${upgradeLink}`);
      setPhase("error");
      return;
    }

    setParsedRows(rows); setHeaders(hdrs);
    const detected = detectColumns(hdrs);
    setColMap({ rawTitle: detected.rawTitle || "", description: detected.description || "", country: detected.country || "" });
    setPhase(detected.rawTitle ? "ready" : "mapping");
  }

  function selectSheet(name) {
    try {
      const wb = XLSX.read(xlsxBuffer, { type: "array" });
      const ws = wb.Sheets[name];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const rawRows = data.slice(0, 10).map(r => r.map(c => String(c).trim()));
      const detection = detectHeaderRow(rawRows);
      if (detection) {
        setHeaderWarning({ headerRowIndex: detection.headerRowIndex, source: "xlsx", xlsxBuffer, sheetName: name });
        setPhase("header-warning");
      } else {
        applyParsed(parseXLSX(xlsxBuffer, name));
      }
    } catch (err) {
      setError(err.message || "Could not parse this sheet.");
      setPhase("error");
    }
  }

  function confirmHeaderRow(rowIndex) {
    const hw = headerWarning;
    setHeaderWarning(null);
    try {
      if (hw.source === "csv") {
        applyParsed(parseCSVText(hw.csvText, rowIndex));
      } else {
        applyParsed(parseXLSX(hw.xlsxBuffer, hw.sheetName, rowIndex));
      }
    } catch (err) {
      setError(err.message || "Could not parse the file with the selected header row.");
      setPhase("error");
    }
  }

  function cancelProcessing() {
    cancelledRef.current = true;
  }

  async function processRows() {
    if (!colMap.rawTitle) return;
    cancelledRef.current = false;
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

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        if (cancelledRef.current) {
          setPhase("idle");
          return;
        }
        const batch = rows.slice(i, i + BATCH);
        if (!useLocal) {
          const apiResults = await bulkAnalyzeViaAPI(
            batch.map(r => ({ title: r.title, description: r.description, country: r.country })),
            token
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
    trackEvent("bulk_upload_success", {
      plan: planKey || "guest",
      total_rows: allResults.length,
      structured_count: allResults.filter(r => !r.needsReview && !isOutOfScope(r)).length,
      review_required_count: allResults.filter(r => r.needsReview && !isOutOfScope(r)).length,
      out_of_scope_count: allResults.filter(r => isOutOfScope(r)).length,
    });

    // Record bulk usage atomically
    if (user) {
      try {
        await supabase.rpc("increment_bulk_usage", {
          p_user_id: user.id,
          p_rows: allResults.length,
        });
      } catch (err) {
        console.error("Failed to record bulk_used:", err);
      }
    }
  }

  const PREVIEW_LIMIT = 50;

  async function previewCleaning() {
    if (!colMap.rawTitle) return;
    setPhase("previewing_loading");
    const allTitles = parsedRows.map(r => (r[colMap.rawTitle] || "").trim());
    const previewTitles = allTitles.slice(0, PREVIEW_LIMIT);
    const apiResult = await cleanPreviewViaAPI(previewTitles);

    const previewPairs = apiResult
      ? apiResult.map(p => ({ raw: p.raw, clean: p.clean, original: p.clean }))
      : previewTitles.map(t => { const c = cleanTitle(t); return { raw: t, clean: c, original: c }; });

    // Remaining rows beyond PREVIEW_LIMIT use local cleanTitle as placeholder
    const remainingPairs = allTitles.slice(PREVIEW_LIMIT).map(t => {
      const c = cleanTitle(t);
      return { raw: t, clean: c, original: c };
    });

    setCleanPreviews([...previewPairs, ...remainingPairs]);
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
    setSheetNames([]); setXlsxBuffer(null); setProgress(0); setHeaderWarning(null); setSkippedRows(0);
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
            onClick={() => trackEvent("upgrade_click", { current_plan: "basic", target_plan: "pro", location: "bulk_upload_banner" })}
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

  // ── Render: Header Warning ──
  if (phase === "header-warning" && headerWarning) {
    const detectedRow = headerWarning.headerRowIndex + 1; // 1-based for display
    return (
      <div>
        <SectionTitle children="Bulk Upload" />
        <Card style={{ border: "1.5px solid #f59e0b", background: "#fffbeb" }}>
          <div style={{ fontWeight: 700, color: "#92400e", fontSize: 15, marginBottom: 10 }}>⚠ Possible metadata rows detected</div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.7, marginBottom: 6 }}>
            Row 1 does not look like a column header. <strong>Row {detectedRow}</strong> appears to contain the actual column headers.
          </div>
          <div style={{ fontSize: 13, color: "#78350f", marginBottom: 20 }}>
            If your file has {headerWarning.headerRowIndex} metadata row{headerWarning.headerRowIndex !== 1 ? "s" : ""} above the header (e.g. a report title or file name), using Row {detectedRow} as the header will give more accurate results.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => confirmHeaderRow(headerWarning.headerRowIndex)}
              style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: "#d97706", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Use Row {detectedRow} as Header
            </button>
            <button
              onClick={() => confirmHeaderRow(0)}
              style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Continue Anyway (Use Row 1)
            </button>
            <button
              onClick={reset}
              style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              ← Upload Different File
            </button>
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: "#a16207" }}>{fileName}</div>
        </Card>
      </div>
    );
  }

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
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: skippedRows > 0 ? 8 : 18 }}>
          📄 {fileName} · {parsedRows.length} rows detected
        </div>
        {skippedRows > 0 && (
          <div style={{ fontSize: 12, color: "#d97706", marginBottom: 18, padding: "7px 12px", background: "#fffbeb", borderRadius: 6, border: "1px solid #fcd34d" }}>
            {skippedRows} metadata row{skippedRows !== 1 ? "s" : ""} skipped · header detected at row {skippedRows + 1}
          </div>
        )}
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
                  {parsedRows.length} data rows
                  {skippedRows > 0 && <span style={{ color: "#d97706", marginLeft: 6 }}>· {skippedRows} metadata row{skippedRows !== 1 ? "s" : ""} skipped · header: row {skippedRows + 1}</span>}
                  {phase === "done" && <span> · {total - structured} row{total - structured !== 1 ? "s" : ""} flagged for review</span>}
                  {phase !== "done" && skippedRows === 0 && <span> · Ready to process</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
                Remove
              </button>
              {phase === "ready" && (<>
                <button onClick={() => setPhase("mapping")} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", color: C.textSub, fontFamily: "inherit" }}>
                  Edit mapping
                </button>
                <button onClick={previewCleaning} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Preview Cleaning →
                </button>
              </>)}
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

        {/* Detected columns summary */}
        {phase === "ready" && (
          <div style={{ padding: "10px 16px", background: C.accentLight, border: `1px solid ${C.accentBorder}`, borderRadius: 8, fontSize: 12, color: "#1e40af", display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>Detected columns:</span>
            <span>Title: <code style={{ background: "#dbeafe", padding: "1px 6px", borderRadius: 4 }}>{colMap.rawTitle || "—"}</code></span>
            <span>Description: <code style={{ background: "#dbeafe", padding: "1px 6px", borderRadius: 4 }}>{colMap.description || "not mapped"}</code></span>
            <span>Country: <code style={{ background: "#dbeafe", padding: "1px 6px", borderRadius: 4 }}>{colMap.country || "not mapped"}</code></span>
          </div>
        )}

        {/* Progress bar */}
        {phase === "processing" && (
          <Card style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Classifying titles…</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 12, color: C.textMuted }}>{Math.min(progress, parsedRows.length)} / {parsedRows.length}</div>
                <button onClick={cancelProcessing} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.redBorder}`, background: C.redLight, color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
            <div style={{ background: C.border, borderRadius: 99, height: 6, overflow: "hidden" }}>
              <div style={{ background: C.accent, height: "100%", borderRadius: 99, width: `${parsedRows.length ? Math.round((Math.min(progress, parsedRows.length) / parsedRows.length) * 100) : 0}%`, transition: "width 0.3s ease" }} />
            </div>
          </Card>
        )}

        {/* Fallback warning */}
        {phase === "done" && (() => {
          const localCount = results.filter(r => r.source === "local").length;
          if (localCount === 0) return null;
          const allLocal = localCount === results.length;
          return (
            <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#78350f" }}>
              ⚠ {allLocal
                ? `All ${localCount} rows were classified locally due to API unavailability.`
                : `${localCount} of ${results.length} rows were classified locally due to API fallback.`
              } Local results may be less accurate than AI-classified rows — consider reviewing flagged items carefully.
            </div>
          );
        })()}

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
        {phase === "done" && <ResultCharts results={results} fileName={fileName} />}
        {phase === "done" && planKey === "pro" && <BulkAIBubble results={results} user={user} supabase={supabase} />}
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

        {/* Preview scope notice */}
        {phase === "previewing" && parsedRows.length > PREVIEW_LIMIT && (
          <div style={{ padding: "10px 16px", background: C.accentLight, border: `1px solid ${C.accentBorder}`, borderRadius: 8, fontSize: 12, color: "#1e40af" }}>
            ℹ Showing AI-cleaned preview for the first <strong>{PREVIEW_LIMIT} rows</strong>. Remaining {parsedRows.length - PREVIEW_LIMIT} rows will be cleaned automatically when you run the classifier.
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
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {isOOS
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>✗ Out of scope</span>
                              : row.confidence < 55
                              ? <span style={{ fontSize: 11, fontWeight: 600, color: C.red }}>⚠ Low confidence</span>
                              : needsRev
                              ? <span style={{ fontSize: 11, fontWeight: 600, color: C.amber }}>⚑ Review recommended</span>
                              : <span style={{ fontSize: 11, color: C.green }}>✓ Good match</span>}
                            {row.source === "local" && (
                              <span style={{ fontSize: 10, color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 4, padding: "1px 5px", width: "fit-content" }}>
                                local classifier
                              </span>
                            )}
                          </div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <FeedbackForm
              page="bulk_upload"
              testInput={fileName}
              metadata={{
                result: `${total} rows: ${structured} structured, ${total - structured} flagged`,
                status: "bulk_complete"
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page 3: Skill Mapper ─────────────────────────────────────────────────────


import * as XLSX from "xlsx";
import { EXPORT_FIELDS } from "../constants/classify.js";

export function isOutOfScope(r) {
  return r.out_of_scope || r.domain === "Other/Noise" || r.domain === "Out of scope";
}

export function getStatusLabel(r) {
  if (isOutOfScope(r))   return "Out of scope";
  if (r.confidence < 55) return "Low confidence";
  if (r.needsReview)     return "Review recommended";
  return "Good match";
}

export function buildExportRow(r) {
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

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function doDownloadCSV(results, filename = "logistics_structured.csv") {
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

export function doDownloadJSON(results, filename = "logistics_structured.json") {
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

export function doDownloadXLSX(results, filename = "logistics_structured.xlsx") {
  const rows = results.map(buildExportRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_FIELDS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Structured Output");
  XLSX.writeFile(wb, filename);
}

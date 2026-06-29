import * as XLSX from "xlsx";

const HEADER_DETECT_KEYWORDS = ["title", "job title", "position", "role", "description", "country", "location", "job", "salary", "department", "seniority", "level"];

const RAW_TITLE_ALIASES = ["raw_title","rawtitle","raw title","title","job title","job_title","jobtitle","position","role","job","position title","job name"];
const DESC_ALIASES      = ["description","desc","job description","job_description","jobdescription","responsibilities","details","job desc","summary"];
const COUNTRY_ALIASES   = ["country","location","region","market","country/region","geo"];

export function parseCSVLine(line) {
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

export function parseCSVText(text, headerRowIndex = 0) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("File appears to be empty or has no data rows.");
  const headers = parseCSVLine(lines[headerRowIndex]).map(h => h.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(headerRowIndex + 1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return row;
  }).filter(row => headers.some(h => row[h]));
  return { headers, rows, skippedRows: headerRowIndex };
}

export function parseXLSX(buffer, sheetName = null, headerRowIndex = 0) {
  const wb = XLSX.read(buffer, { type: "array" });
  const name = sheetName || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!data.length) throw new Error("File appears to be empty.");
  const headers = data[headerRowIndex].map(h => String(h).trim()).filter(h => h);
  const rows = data.slice(headerRowIndex + 1)
    .filter(row => row.some(v => String(v).trim()))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = String(row[i] ?? "").trim(); });
      return obj;
    });
  if (!rows.length) throw new Error("File has headers but no data rows.");
  return { headers, rows, skippedRows: headerRowIndex };
}

function scoreRowAsHeader(cells) {
  const lower = cells.map(c => String(c).toLowerCase().trim());
  const matchingCells = lower.filter(c =>
    c.split(/\s+/).length <= 4 && HEADER_DETECT_KEYWORDS.some(kw => c === kw || c.includes(kw))
  );
  let score = matchingCells.length;
  const hasLongText = cells.some(c => String(c).trim().split(/\s+/).length > 8);
  const hasNumeric  = cells.some(c => /^\d{3,}$/.test(String(c).trim()));
  if (hasLongText || hasNumeric) score -= 2;
  return score;
}

export function detectHeaderRow(rawRows) {
  const scanLimit = Math.min(rawRows.length, 10);
  const row0 = rawRows[0] || [];
  const row0Score = scoreRowAsHeader(row0);
  if (row0Score >= 2 && row0.length >= 2) return null;

  let bestIdx = -1, bestScore = 0;
  for (let i = 1; i < scanLimit; i++) {
    const row = rawRows[i];
    const s = scoreRowAsHeader(row);
    if (s > bestScore && row.length >= 2) { bestScore = s; bestIdx = i; }
  }
  if (bestIdx >= 1 && bestScore >= 2) return { headerRowIndex: bestIdx };
  return null;
}

export function getRawRowsCSV(text) {
  return text.split(/\r?\n/).filter(l => l.trim()).slice(0, 10)
    .map(l => parseCSVLine(l).map(c => c.replace(/^"|"$/g, "").trim()));
}

export function detectColumns(headers) {
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

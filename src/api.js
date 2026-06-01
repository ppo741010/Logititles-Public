const API_BASE = import.meta.env.VITE_API_URL || "https://logistics-title-mapper-api.onrender.com";

/**
 * Analyze a single job title via the Python API.
 * Falls back to null on failure so the caller can use local logic.
 */
export async function analyzeViaAPI(title, description = "", country = "") {
  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, country }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Normalise field names from Python (snake_case) to frontend (camelCase)
    return {
      cleanTitle:      data.clean_title,
      domain:          data.domain,
      nature:          data.work_nature,
      seniority:       data.seniority,
      skills:          data.skills,
      confidence:      data.confidence,
      matchedKeywords:  data.matched_keywords ?? [],
      flags:            data.flags,
      hasCrossFlag:     data.has_cross_flag,
      needsReview:      data.needs_review,
      out_of_scope:     data.out_of_scope ?? false,
      noiseReason:      data.noise_reason,
      noiseKeyword:     data.noise_keyword,
      salaryBenchmark:  data.salary_benchmark ?? null,
      salaryNote:       data.salary_note ?? null,
      country:          data.country,
      source:           "api",
    };
  } catch {
    return null;
  }
}

/**
 * Bulk analyze via API.
 * Returns null on failure.
 */
export async function bulkAnalyzeViaAPI(rows) {
  try {
    const res = await fetch(`${API_BASE}/bulk-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.map(d => ({
      cleanTitle:       d.clean_title,
      domain:           d.domain,
      nature:           d.work_nature,
      seniority:        d.seniority,
      skills:           d.skills,
      confidence:       d.confidence,
      matchedKeywords:  d.matched_keywords ?? [],
      flags:            d.flags,
      hasCrossFlag:     d.has_cross_flag,
      needsReview:      d.needs_review,
      out_of_scope:     d.out_of_scope ?? false,
      noiseReason:      d.noise_reason,
      noiseKeyword:     d.noise_keyword,
      salaryBenchmark:  d.salary_benchmark ?? null,
      salaryNote:       d.salary_note ?? null,
      country:          d.country,
      source:           "api",
    }));
  } catch {
    return null;
  }
}

/**
 * Clean-preview: returns [{raw, clean}] for user to review before classification.
 */
export async function cleanPreviewViaAPI(titles) {
  try {
    const res = await fetch(`${API_BASE}/clean-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function checkAPIHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Ping the backend every 13 minutes to prevent Render free-tier sleep.
// Call once on app load — safe to call multiple times (ignores if already started).
let _keepAliveStarted = false;
export function startKeepAlive() {
  if (_keepAliveStarted) return;
  _keepAliveStarted = true;
  const ping = () => fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
  ping(); // immediate first ping
  setInterval(ping, 13 * 60 * 1000);
}

export async function chatViaAPI(message, history = [], context = "", token = "") {
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, history, context }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.reply;
  } catch {
    return null;
  }
}

export async function submitFeedback(rating, comment = "", page = "", title = "", result = "", meta = {}) {
  try {
    await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating, comment, page, title, result,
        confidence:   meta.confidence  ?? null,
        status:       meta.status      ?? null,
        out_of_scope: meta.out_of_scope ?? null,
      }),
    });
  } catch {
    // silently ignore — feedback is non-critical
  }
}

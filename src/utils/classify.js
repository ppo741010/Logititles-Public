import skillConfig from "../skill_normalize.json";
import {
  PRIORITY_DOMAIN_RULES, FUZZY_ROLE_REPAIR, LEVEL_MAPPING, WORK_NATURE_MAPPING,
  DOMAIN_SKILL_FIXED, REMOVE_PHRASES, REMOVE_SHIFT, REMOVE_CONTRACT,
  SALARY_PATTERN, CONTRACT_DURATION_PATTERN, TYPO_MAP, HOURS_POSITIONS_PATTERN,
  CROSS_FUNCTIONAL_PAIRS,
} from "../constants/classify.js";

const SKILL_SYNONYMS = skillConfig.skill_synonyms;

export function cleanTitle(raw) {
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

export function classify(title, description) {
  const tl = title.toLowerCase(), dl = description.toLowerCase();

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

  for (const [key, domain] of Object.entries(FUZZY_ROLE_REPAIR)) {
    if (tl.includes(key)) {
      if (domain === "Other/Noise")
        return { domain, confidence: 30, source: "fuzzy", matchedKeywords: [key], noiseReason: "fuzzy_noise", noiseKeyword: key };
      return { domain, confidence: 74, source: "fuzzy", matchedKeywords: [key] };
    }
  }

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

export function getSeniority(title) {
  const t = title.toLowerCase();
  for (const [key, label] of Object.entries(LEVEL_MAPPING)) if (t.includes(key)) return label;
  return "Mid Level";
}

export function getWorkNature(title) {
  const t = title.toLowerCase();
  for (const [nature, kws] of Object.entries(WORK_NATURE_MAPPING))
    for (const kw of kws) if (t.includes(kw)) return nature;
  return "Operational";
}

export function getSkills(domain, description) {
  const base = [...(DOMAIN_SKILL_FIXED[domain] || [])];
  const dl = description.toLowerCase(), extra = [];
  for (const [raw, norm] of Object.entries(SKILL_SYNONYMS))
    if (dl.includes(raw) && !base.includes(norm) && !extra.includes(norm)) extra.push(norm);
  return [...base, ...extra].slice(0, 6);
}

export function analyze(rawTitle, description, country) {
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

  let salaryNote = null;
  if (outOfScope)
    salaryNote = "Salary benchmark is not available because this title appears to be outside the logistics scope.";
  else if (confidence < 55)
    salaryNote = "Salary benchmark unavailable for low-confidence matches.";
  else if (!country)
    salaryNote = "Select New Zealand or Australia to view salary reference.";

  return { cleanTitle: clean, domain, nature, seniority, skills, confidence, flags, hasCrossFlag, needsReview, out_of_scope: outOfScope, salaryNote, matchedKeywords, noiseReason, noiseKeyword };
}

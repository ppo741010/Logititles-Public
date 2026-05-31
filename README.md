# Logititles — Logistics Job Title Classifier

> **Rule-based + AI classification engine for logistics job titles** — cleans noise, maps to 9 functional domains, infers seniority and skills from raw title text.

**Live:** https://www.logititles.com &nbsp;|&nbsp; **App:** https://app.logititles.com &nbsp;|&nbsp; **API:** Python FastAPI on Render (Sydney)

![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react) ![Python](https://img.shields.io/badge/Python-FastAPI-009688?logo=python) ![Supabase](https://img.shields.io/badge/Auth-Supabase-3ECF8E?logo=supabase) ![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel)

> **Beta** — Plan limits, pricing, and features may change as the product develops.

---

## The Problem

Job title data from job boards and ATS systems is inconsistent and hard to work with:

- The same role appears under dozens of names — `Sr. Ops Mgr`, `Senior Operations Manager`, `ops manager Auckland $85k FTC`
- Titles contain noise: salary ranges, locations, shift types, contract durations
- No standard taxonomy exists, making cross-dataset comparison or reporting impossible without manual cleanup

Doing this at scale by hand is slow and error-prone. This tool automates the classification pipeline.

---

## Who is it for?

| User | Use case | Plan |
|------|----------|------|
| Recruiters / HR | Bulk-clean job titles from listings or spreadsheets | Basic / Pro |
| Recruitment Agencies | Standardise titles across multiple data sources | Basic / Pro |
| Supply Chain / Logistics Analysts | Structure raw job data for market or workforce analysis | Pro |
| Consultants / Researchers | Clean datasets for salary, skills, or workforce research | Pro |
| Training Providers | Explore common logistics roles and skills in the market | Guest / Basic |
| Small Businesses | Process small batches without writing Excel rules or scripts | Basic |
| Job Seekers | Understand how a job title is categorised in logistics | Guest |

---

## Features

| Feature | Details |
|---------|---------|
| **Single Analyzer** | Paste a title → instant domain, seniority, skills, match confidence |
| **Bulk Upload** | CSV/XLSX; row limits by plan (100 / 1,000 / 10,000); multi-sheet support |
| **Clean Preview** | Review and edit every cleaned title before classification runs |
| **Data Analysis Charts** | Domain distribution, seniority breakdown, top 8 skills, salary by domain/level |
| **PDF/PNG Export** | 2-page A4 landscape report: stats summary + charts |
| **CSV / Excel / JSON Export** | Customisable field selection |
| **Skill Mapper** | Normalize raw skill phrases to canonical labels (288+ mappings) |
| **AI Assistant** | Claude Haiku chat with dataset context — Pro users only (100 credits/month) |
| **Market Insights** | Aggregated NZ/AU logistics market data from cleaned_jobs (Supabase) |
| **Auth + Plans** | Supabase JWT auth; Guest / Basic / Pro tier gating |
| **Stripe Payments** | Basic NZ$9 one-time · Pro NZ$29/mo · Webhook auto-upgrades user plan |

---

## Match Confidence

Results include a **Match Confidence** label (not just a raw score):

| Score | Label |
|-------|-------|
| 85–100% | High |
| 70–84% | Medium — review recommended |
| 55–69% | Low — review recommended |
| <55% | Uncertain |

This reflects how the classification was derived, not statistical accuracy. A Medium result is a reasonable classification that warrants human review before use in final reporting.

---

## Pricing

| Plan | Price | Bulk rows | AI Assistant |
|------|-------|-----------|--------------|
| Guest | Free | 100 | ✗ |
| Basic | NZ$9 one-time | 1,000 | ✗ |
| Pro | NZ$29/month | 10,000 | ✓ 100 credits/month |

---

## Architecture

```
Browser (React + Vite) — app.logititles.com
  │
  ├── Supabase Auth (JWT) ──────────────── user_plans table (tier gating, RLS enabled)
  │
  ├── FastAPI Backend (Render, Sydney)
  │     ├── POST /analyze          ← single title classification
  │     ├── POST /bulk-analyze     ← batch classification (chunked)
  │     ├── POST /clean-preview    ← title cleaning preview
  │     └── POST /chat             ← Claude Haiku AI chat (Pro only)
  │           │
  │           └── rules.py (classification engine)
  │                 ├── 4-stage pipeline
  │                 ├── salary benchmark lookup
  │                 └── skills extraction
  │
  ├── Vercel Serverless Function
  │     └── api/stripe-webhook.js  ← receives Stripe checkout.session.completed
  │                                   → updates user_plans.plan to basic/pro
  │
  ├── Local JS fallback (classify in-browser if API is down)
  │
  └── Supabase cleaned_jobs table ──────── Market Insights page (paginated reads)

Stripe Payment Links:
  Basic  — NZ$9 one-time
  Pro    — NZ$29/month subscription

JSON config (single source of truth):
  backend/json/logistics_config.json      ← 288+ domain keywords, level mapping, salary benchmarks
  backend/json/skill_normalize.json       ← skill synonym map (also copied to src/)
  backend/json/skills_knowledge_map.json  ← 992 title → skills/level lookup entries
```

---

## Classification Pipeline

Each title goes through **4 stages in order**, stopping at the first confident match:

| Stage | Method | Match Confidence |
|-------|--------|-----------------|
| 1 | Keyword scoring on title (multi-word keywords weighted higher) | 72–92% |
| 2 | Fuzzy repair rules — substring fallback for abbreviated titles (165+ rules) | 74% |
| 3 | Description keyword match — used when title alone is insufficient | 58–72% |
| 4 | Claude Haiku AI fallback — for titles that pass all rule stages unmatched | ≤ 70% |

**Seniority** is classified separately: exact keyword match on title → skills_knowledge_map lookup → domain-based default.

**Skills** are extracted by cross-referencing title and description text against a 992-entry lookup map, then normalized via `skill_normalize.json`.

---

## Key Engineering Decisions

**Rule-based first, AI last** — AI fallback is capped at 70% confidence and only triggered when all rule stages fail. This keeps per-request cost near zero for most inputs while maintaining accuracy for edge cases.

**Single JSON config as source of truth** — All domain keywords, level mappings, and salary benchmarks live in `logistics_config.json`. Adding a new keyword or domain rule requires editing one file, not touching code. The same file is shared between the FastAPI backend and a separate data pipeline (`seek-pipeline`).

**Stripe Webhook for plan upgrades** — A Vercel Serverless Function receives `checkout.session.completed` events from Stripe, matches the customer email to a Supabase user, and updates their plan. No manual intervention needed for paid plan activation.

**Local JS fallback** — A JavaScript port of the classification rules runs in the browser if the API is unavailable. Users see a visible warning, but the tool stays functional.

**Paginated Supabase reads** — Market Insights bypasses Supabase's default 1,000-row limit by looping with `.range()` pagination until all records are fetched client-side.

---

## Functional Domains

| Domain | Example Roles |
|--------|--------------|
| Warehouse | Warehouse Manager, Forklift Operator, Inventory Controller |
| Transport | Dispatch Coordinator, Fleet Manager, Driver |
| Freight Forwarding | Customs Broker, Import/Export Officer, Freight Coordinator |
| Planning | Demand Planner, Supply Chain Analyst, Procurement Manager |
| Operations | Operations Manager, HSE Manager, Logistics Coordinator |
| Finance | Accounts Payable, FP&A Manager, Payroll Officer |
| Sales | Account Manager, Business Development Executive |
| IT Support | SAP Consultant, IT Support Officer, Business Systems Analyst |
| Business Administration | EA, HR Coordinator, Office Manager |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, Recharts, jsPDF, html2canvas, SheetJS |
| Backend | Python FastAPI, deployed on Render (Sydney region) |
| Auth | Supabase Auth (JWT) |
| Database | Supabase (PostgreSQL) — `cleaned_jobs`, `user_plans`, `feedback`, `waitlist` tables |
| Classification | Rule-based engine (`rules.py`) + Claude Haiku AI fallback |
| AI Assistant | Claude Haiku via Anthropic API |
| Payments | Stripe Payment Links + Webhook (Vercel Serverless Function) |
| Deployment | Vercel (frontend + webhook), Render (backend) |

---

## Local Development

### Frontend
```bash
npm install
npm run dev
# Set VITE_API_URL=http://localhost:8000 in .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# Set ANTHROPIC_API_KEY in environment for AI features
```

---

## Data Pipeline

A separate nightly pipeline (`seek-pipeline/`) scrapes NZ/AU logistics job postings, runs them through the same classification logic, and writes results to `cleaned_jobs` in Supabase. The Market Insights page reads from this table.

The pipeline runs via **GitHub Actions at 1am NZT daily**.

---

## Regression Testing

A golden dataset of **98 hand-labeled records** (`golden_dataset.csv`) is used to validate classification accuracy:

```bash
cd seek-pipeline
python test_golden.py
# Domain: 98/98 (100%) | Level: 98/98 (100%) | Work Nature: 98/98 (100%)
```

---

## Disclaimer

Logititles is an independent personal project and is not affiliated with SEEK, Indeed, LINZ, or any external job platform. All outputs are suggested drafts for human review — not authoritative classifications. Salary reference fields are market estimates only.

---

## Feedback

Found a misclassification or have a suggestion? Use the feedback button inside the app.

# Skill Mapper Remediation — Quick Implementation Guide

## Problem
You have **54 missing canonical labels** in `skills_knowledge_map.json`:
- 51 are variants that can be consolidated with existing labels
- 11 are legitimate but new skills
- 9 are too vague and should be removed

## Solution (3-Phase Approach)

### Phase 1: Consolidate Variants (Automated) ✅ Ready to Run
Maps 51 skill variants to existing canonical labels. This removes redundancy.

**Status:** Script ready at `backend/remediate_skills.py`

```bash
# Dry-run to preview changes:
cd logistics-title-mapper
python3 backend/remediate_skills.py 1 --dry-run

# Apply changes:
python3 backend/remediate_skills.py 1
```

**Impact:**
- Converts 51 variants → existing labels (e.g., "ehs" → "Health & Safety")
- Removes 9 vague labels (e.g., "AI Tools", "KPI", "SOP")
- Result: 327 variants (was 336)
- Creates backup: `skill_normalize.json.bak`

---

### Phase 2: Add New Skills (Manual) 📋 Requires Decision

These 11 skills are framework-grounded and should be added to `skills_knowledge_map.json`:

| Skill | Framework | Why Needed |
|-------|-----------|-----------|
| **3PL Management** | SCOR/Logistics | Core logistics competency |
| **Incoterms** | ILO/Commerce | International trade standard |
| **Lean Manufacturing** | ASCM | Process improvement methodology |
| **Scrum** | Agile/ISCO-08 | Agile framework for logistics IT |
| **Six Sigma** | ASCM | Quality/process methodology |
| **S&OP** | SCOR "Plan" | Sales & Operations Planning |
| **TAPA** | Industry | Supply chain security standard |
| **TMS** | Systems | Transportation Management System (24 variants!) |
| **VMI** | SCOR | Vendor-Managed Inventory model |
| **EDI** | ILO/Commerce | Electronic Data Interchange |
| **Export/Import Documentation** | Commerce | Freight forwarding regulatory |

**Two Implementation Options:**

**Option A: Manual Addition** (10 min)
```python
# In skills_knowledge_map.json, add skills to relevant titles:
# "Logistics Manager": "Supply Chain Strategy, Logistics Network Management, Vendor Management, Budget Management, Regulatory Compliance, 3PL Management"
# "S&OP Manager": "Demand Forecasting, Supply Planning, Sales & Operations Planning, S&OP"
# etc. (see full list in SKILL_MAPPER_VALIDATION_REPORT.md Phase 2)
```

**Option B: Automated (Recommended)** (2-5 min)
```bash
# Use the existing title regeneration system:
cd seek-pipeline
python3 regenerate_skills_map.py

# This will add Phase 2 skills to the specified job titles
# Run the checkpoint-aware system to batch-process titles
```

---

### Phase 3: Validate & Confirm ✅ Automated

After Phase 1 & 2, run:

```bash
python3 backend/remediate_skills.py validate
```

**Expected output:**
```
✅ All canonical labels have existing mappings!
Total unique canonicals: 64
Total existing skills:   1444  ← increased from 1433
```

---

## Decision Points

### Before Phase 1: Review Consolidations

The script maps these variants to existing labels. Check if these mappings make sense for your domain:

```
Microsoft tools (5-10 variants each)
  → "Office Software Proficiency" (existing)
  
EHS/HSE/OHS/WHS (11 variants total)
  → "Health & Safety" (existing)
  
CRM (10 variants)
  → "CRM Data Management" (existing)

Data Visualisation (5 variants)
  → "Power BI Dashboard Development" (existing)
```

**Q: Is "Microsoft Excel" → "Office Software Proficiency" appropriate for your job titles?**  
A: Yes. The existing "Basic Excel" and "Excel Modeling" skills are more specific for analysts; generic proficiency covers office workers.

---

### Before Phase 2: Choose Implementation Path

**Q: Should we add all 11 new skills to skills_knowledge_map.json?**

**Recommendation:** YES, because:
1. All 11 are backed by recognized frameworks (ASCM SCOR, ILO ISCO-08)
2. They fill gaps in logistics/supply chain domain (TMS, S&OP, TAPA, etc.)
3. They improve searchability for job titles in these functions
4. The 9 removed labels (KPI, AI Tools, etc.) were too vague anyway

**Alternative:** Skip TAPA if your market doesn't use supply-chain-security-specific labels.

---

## Execution Checklist

- [ ] **Phase 1**: Run `python3 backend/remediate_skills.py 1`
  - Review changes (51 consolidations, 9 removals)
  - Verify backup created
  - Commit: `git add skill_normalize.json && git commit -m "Consolidate 51 skill variants to existing canonical labels"`

- [ ] **Phase 2**: Choose implementation
  - [ ] Option A (manual): Copy Phase 2 suggestions from SKILL_MAPPER_VALIDATION_REPORT.md into skills_knowledge_map.json
  - [ ] Option B (automated): Run `regenerate_skills_map.py` with NEW_TITLES list containing the 11 new skills
  - Commit: `git add skills_knowledge_map.json && git commit -m "Add 11 framework-grounded skills to logistics domain"`

- [ ] **Phase 3**: Validate
  - Run `python3 backend/remediate_skills.py validate`
  - Confirm: "All canonical labels have existing mappings!"
  - Commit validation results: `git add REMEDIATION_LOG.txt`

---

## Expected Results

**Before:**
- ❌ 54 missing canonical labels
- ❌ 336 skill variants, many redundant
- ❌ No clear source for 50+ labels

**After:**
- ✅ 0 missing canonical labels (all mapped)
- ✅ 327 skill variants, consolidated & clean
- ✅ All labels traceable to ASCM SCOR / ILO ISCO-08 / O*NET frameworks
- ✅ 1444 total skills in domain (was 1433)
- ✅ 11 new logistics-specific skills added

---

## Files Reference

| File | Purpose |
|------|---------|
| `SKILL_MAPPER_VALIDATION_REPORT.md` | Full analysis & justifications (this file) |
| `backend/remediate_skills.py` | Automation script (Phase 1 & 2) |
| `backend/json/skill_normalize.json` | Skill variant mappings (Phase 1 target) |
| `backend/json/skills_knowledge_map.json` | Job titles & their skills (Phase 2 target) |
| `seek-pipeline/regenerate_skills_map.py` | Alternative Phase 2: batch-add skills to titles |

---

## Questions?

Refer to `SKILL_MAPPER_VALIDATION_REPORT.md` (Sections A, B, C) for:
- Why each label is being consolidated/added/removed
- Framework justifications (ASCM SCOR / ILO ISCO-08 / O*NET)
- Alternative mappings if a mapping seems off

---

**Next Step:** Review this guide and the consolidation list above, then run Phase 1. ✅
